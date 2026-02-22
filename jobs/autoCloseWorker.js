import cron from 'node-cron';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Alert from '../models/Alert.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// same pattern as the rule engine — read once, reuse forever
const rules = JSON.parse(readFileSync(join(__dirname, '../rules.json'), 'utf-8'));

const runAutoClose = async () => {
  // only pull alerts that are still "live" — loading AUTO-CLOSED or RESOLVED docs would be wasted work
  const candidates = await Alert.find({ status: { $in: ['OPEN', 'ESCALATED'] } }).lean();

  if (candidates.length === 0) return;

  const now = Date.now();

  for (const candidate of candidates) {
    const rule = rules[candidate.sourceType];

    // no policy for this sourceType — don't make assumptions about when it should close
    if (!rule) continue;

    let shouldClose = false;
    let closureNote = '';

    if (rule.auto_close_mins) {
      const thresholdMs = rule.auto_close_mins * 60 * 1000;
      const ageMs = now - new Date(candidate.timestamp).getTime();

      if (ageMs >= thresholdMs) {
        shouldClose = true;
        closureNote = `auto-closed after ${rule.auto_close_mins} mins with no resolution`;
      }
    } else if (rule.auto_close_if) {
      // metadata-based close — the rule says which key to check, so we don't hardcode "document_valid" here;
      // any future compliance-style rule just needs a new auto_close_if entry in the json
      const metaKey = rule.auto_close_if;
      if (candidate.metadata?.[metaKey] === true) {
        shouldClose = true;
        closureNote = `auto-closed because ${metaKey} is true`;
      }
    }

    if (!shouldClose) continue;

    // atomic filter on status in the update itself — if two cron ticks overlap (e.g. slow db),
    // the second findOneAndUpdate finds no matching doc because the first already flipped it to AUTO-CLOSED
    const updated = await Alert.findOneAndUpdate(
      { _id: candidate._id, status: { $in: ['OPEN', 'ESCALATED'] } },
      {
        $set: {
          status: 'AUTO-CLOSED',
          'metadata.closedAt': new Date(),
          'metadata.closureNote': closureNote,
        },
      },
      { returnDocument: 'after' }
    );

    // updated is null if another tick already closed this one — nothing to log
    if (updated) {
      console.log(`auto-closed alert ${updated.alertid} — ${closureNote}`);
    }
  }
};

export const startAutoCloseWorker = () => {
  // run immediately on startup so we catch anything that aged out while the server was down
  runAutoClose().catch((err) => console.error('auto-close catch-up on startup failed:', err));

  // then tick every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    try {
      await runAutoClose();
    } catch (err) {
      console.error('auto-close worker tick failed:', err);
    }
  });

  console.log('auto-close worker started (every 5 mins)');
};
