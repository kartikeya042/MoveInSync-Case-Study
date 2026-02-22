import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Alert from '../models/Alert.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// load once at startup — no point re-reading the file on every alert
const rules = JSON.parse(readFileSync(join(__dirname, '../rules.json'), 'utf-8'));

class RuleEngine {
  constructor(rules) {
    this.rules = rules;
  }

  // subclasses own the actual logic, this just makes the contract obvious
  async evaluate(alert) {
    throw new Error(`${this.constructor.name} must implement evaluate()`);
  }
}

class OverspeedRuleEngine extends RuleEngine {
  constructor() {
    super(rules);
  }

  async evaluate(alert) {
    // wrong type — nothing for this engine to do
    if (alert.sourceType !== 'overspeed') return;

    // already escalated, skip — prevents re-escalating the same alert if evaluate somehow gets called a second time on the same object
    if (alert.status === 'ESCALATED') return;

    const rule = this.rules['overspeed'];

    // rule got deleted from the json at runtime — gracefully bail
    if (!rule) return;

    // look at alerts in the rolling window ending exactly at this alert's timestamp, so a vehicles's burst of events is measured relative to when they actually happened
    const windowStart = new Date(alert.timestamp.getTime() - rule.window_mins * 60 * 1000);

    const count = await Alert.countDocuments({
      sourceType: 'overspeed',
      timestamp: { $gte: windowStart, $lte: alert.timestamp },
    });

    // count includes the alert we just saved, so >= is the right comparison
    if (count >= rule.escalate_if_count) {
      alert.status = 'ESCALATED';

      // save immediately so the escalated state is durable even if the caller crashes after this
      await alert.save();
    }
  }
}

// single shared instance — no state between calls so this is safe to reuse
const overspeedEngine = new OverspeedRuleEngine();

export { RuleEngine, OverspeedRuleEngine, overspeedEngine };
