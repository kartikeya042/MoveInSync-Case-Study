import Alert from '../models/Alert.js';

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
    await alert.save();

    // TODO: trigger rule engine here
    // like ruleEngine.evaluate(alert)

    return res.status(201).json({ message: 'alert ingested', id: alert._id });
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
