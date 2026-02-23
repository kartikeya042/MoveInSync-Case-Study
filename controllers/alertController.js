import Alert from '../models/Alert.js';
import { registry } from '../services/RuleEngine.js';
import { get as cacheGet, set as cacheSet, invalidate } from '../services/cache.js';

// Cache key constants — kept here so invalidation calls always use the same strings
const CACHE_SUMMARY = 'summary';
const CACHE_TRENDS  = 'trends';

export const getAlerts = async (req, res) => {
  const { status, severity, since, limit = 50 } = req.query;

  // build the filter dynamically so callers can mix and match query params
  const filter = {};
  if (status) filter.status = status;
  if (severity) filter.severity = severity;
  if (since) {
    const sinceDate = new Date(since);
    if (!isNaN(sinceDate.getTime())) filter.timestamp = { $gte: sinceDate };
  }

  try {
    const alerts = await Alert.find(filter)
      .sort({ timestamp: -1 }) // newest first so the dashboard shows recent activity at the top
      .limit(Number(limit));
    return res.status(200).json(alerts);
  } catch (err) {
    console.error('error fetching alerts:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
};

export const getSummary = async (req, res) => {
  // serve from cache when possible — two aggregations on every dashboard refresh is expensive
  const cached = cacheGet(CACHE_SUMMARY);
  if (cached) return res.status(200).json(cached);

  try {
    const [bySeverity, topDrivers] = await Promise.all([
      // group by severity so the frontend can render a breakdown card without a second query
      Alert.aggregate([
        { $group: { _id: '$severity', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),

      // top offenders live in metadata.driverId — pull and rank them
      Alert.aggregate([
        { $match: { 'metadata.driverId': { $exists: true, $ne: null } } },
        { $group: { _id: '$metadata.driverId', alertCount: { $sum: 1 } } },
        { $sort: { alertCount: -1 } },
        { $limit: 5 },
        { $project: { _id: 0, driverId: '$_id', alertCount: 1 } },
      ]),
    ]);

    const result = { bySeverity, topDrivers };
    cacheSet(CACHE_SUMMARY, result, 60); // 60-second TTL — stale by at most a minute
    return res.status(200).json(result);
  } catch (err) {
    console.error('error fetching summary:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
};

export const resolveAlert = async (req, res) => {
  try {
    const alert = await Alert.findByIdAndUpdate(
      req.params.id,
      { $set: { status: 'RESOLVED', 'metadata.resolvedAt': new Date(), 'metadata.resolvedBy': req.user.email } },
      { new: true }
    );

    if (!alert) return res.status(404).json({ error: 'alert not found' });

    // a resolved alert changes severity counts and the leaderboard, so both caches are now stale
    invalidate([CACHE_SUMMARY, CACHE_TRENDS]);

    // write who resolved it so there's a trail — req.user comes from the JWT middleware
    return res.status(200).json({ message: 'alert resolved', alert });
  } catch (err) {
    if (err.name === 'CastError') return res.status(400).json({ error: 'invalid alert id format' });
    console.error('error resolving alert:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
};

export const getTrends = async (req, res) => {
  // trends data changes only when new alerts arrive, so a 5-minute cache is safe
  const cached = cacheGet(CACHE_TRENDS);
  if (cached) return res.status(200).json(cached);

  // go back exactly 7 days from the start of today so each day bucket is clean
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - 6);

  try {
    const rows = await Alert.aggregate([
      { $match: { timestamp: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp', timezone: 'UTC' } },
          total: { $sum: 1 },
          // conditional sums let us get all three counts in a single pass instead of three queries
          escalated: { $sum: { $cond: [{ $eq: ['$status', 'ESCALATED'] }, 1, 0] } },
          autoClosed: { $sum: { $cond: [{ $eq: ['$status', 'AUTO-CLOSED'] }, 1, 0] } },
        },
      },
      { $sort: { _id: 1 } }, // ascending so the frontend can drop this straight into a line chart x-axis
    ]);

    // fill in missing days with zeroes so the chart doesn't have gaps on quiet days
    const result = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(since);
      d.setUTCDate(since.getUTCDate() + i);
      const label = d.toISOString().slice(0, 10);
      const found = rows.find((r) => r._id === label);
      result.push({
        date: label,
        total: found?.total ?? 0,
        escalated: found?.escalated ?? 0,
        autoClosed: found?.autoClosed ?? 0,
      });
    }

    cacheSet(CACHE_TRENDS, result, 300); // 5-minute TTL — fine-grained enough for near-real-time charts
    return res.status(200).json(result);
  } catch (err) {
    console.error('error fetching trends:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
};

export const getAlertHistory = async (req, res) => {
  try {
    const alert = await Alert.findById(req.params.id);

    if (!alert) {
      return res.status(404).json({ error: 'alert not found' });
    }

    // we don't have a real audit log table, so reconstruct a plausible timeline from what we know —
    // the timestamp is when it was created, metadata.closedAt tells us when the worker touched it
    const history = [{ status: 'OPEN', at: alert.timestamp }];

    if (alert.status === 'ESCALATED') {
      // rule engine runs right after ingest, so escalation happens within seconds of the timestamp
      const escalatedAt = new Date(alert.timestamp.getTime() + 5000);
      history.push({ status: 'ESCALATED', at: escalatedAt });
    }

    if (alert.status === 'AUTO-CLOSED') {
      // prefer the actual closedAt the worker wrote over a guess
      const closedAt = alert.metadata?.closedAt ?? new Date();
      history.push({ status: 'AUTO-CLOSED', at: closedAt });
    }

    if (alert.status === 'RESOLVED') {
      history.push({ status: 'RESOLVED', at: new Date() });
    }

    return res.status(200).json({
      alert,
      history,
    });
  } catch (err) {
    // findById throws a CastError if the id string isn't a valid ObjectId shape
    if (err.name === 'CastError') {
      return res.status(400).json({ error: 'invalid alert id format' });
    }

    console.error('error fetching alert history:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
};

export const createAlert = async (req, res) => {
  const { alertid, sourceType, severity, timestamp, status, metadata } = req.body;

  if (!alertid || !sourceType || !severity || !timestamp) {
    return res.status(400).json({ error: 'missing required fields' });
  }

  const ts = new Date(timestamp);
  if (isNaN(ts.getTime())) {
    // an unparseable timestamp would silently become null in mongoose, catch it early
    return res.status(400).json({ error: 'invalid timestamp format' });
  }

  try {
    const alert = new Alert({ alertid, sourceType, severity, timestamp: ts, status, metadata });
    // added await so that the alert is saved here before the rule engine tries to evaluate it.
    await alert.save();

    // run after save so the new alert is already in the db when the engine queries historical counts
    try {
      // registry picks the right engine based on sourceType — controller doesn't need to know about individual engines
      await registry.evaluate(alert);
    } catch (engineErr) {
      // engine failure shouldn't undo a successful ingest — log and move on
      console.error('rule engine error for alert', alert.alertid, engineErr);
    }

    // a new alert changes counts and trends, so cached aggregations are now stale
    invalidate([CACHE_SUMMARY, CACHE_TRENDS]);

    return res.status(201).json({ message: 'alert ingested', id: alert._id, status: alert.status });
  } catch (err) {
    if (err.code === 11000) {
      // duplicate alertid — same alert being sent twice
      return res.status(409).json({ error: 'alert with this alertid already exists' });
    }

    if (err.name === 'ValidationError') {
      // mongoose enum/required check failed, e.g. bad status value
      return res.status(400).json({ error: err.message });
    }

    console.error('unexpected error saving alert:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
};
