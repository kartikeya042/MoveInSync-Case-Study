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

    // already escalated, skip — prevents re-escalating the same alert if evaluate
    // somehow gets called a second time on the same object
    if (alert.status === 'ESCALATED') return;

    const rule = this.rules['overspeed'];

    // rule got deleted from the json at runtime — gracefully bail
    if (!rule) return;

    // anchor window to the alert's own timestamp so delayed ingestion doesn't skew the count
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

class FeedbackRuleEngine extends RuleEngine {
  constructor() {
    super(rules);
  }

  async evaluate(alert) {
    if (alert.sourceType !== 'feedback_negative') return;

    // same guard as overspeed — don't double-escalate if this runs twice on the same object
    if (alert.status === 'ESCALATED') return;

    const rule = this.rules['feedback_negative'];
    if (!rule) return;

    // 1440 mins is a full day, so we're asking: did this driver/entity rack up
    // repeated negative feedback within the past 24 hours?
    const windowStart = new Date(alert.timestamp.getTime() - rule.window_mins * 60 * 1000);

    const count = await Alert.countDocuments({
      sourceType: 'feedback_negative',
      timestamp: { $gte: windowStart, $lte: alert.timestamp },
    });

    if (count >= rule.escalate_if_count) {
      alert.status = 'ESCALATED';
      await alert.save();
    }
  }
}

class ComplianceRuleEngine extends RuleEngine {
  constructor() {
    super(rules);
  } 

  async evaluate(alert) {
    if (alert.sourceType !== 'compliance') return;

    // no point re-closing something that's already been handled
    if (alert.status === 'AUTO-CLOSED' || alert.status === 'RESOLVED') return;

    const rule = this.rules['compliance'];
    if (!rule || !rule.auto_close_if) return;

    // the rule names the metadata key to check, so adding new close conditions is just a rules.json change, not a code change
    const metaKey = rule.auto_close_if;
    if (alert.metadata?.[metaKey] === true) {
      alert.status = 'AUTO-CLOSED';
      await alert.save();
    }
  }
}

// plain object is enough here — no state, no inheritance, just a lookup and a delegate
const registry = {
  overspeed: new OverspeedRuleEngine(),
  feedback_negative: new FeedbackRuleEngine(),
  compliance: new ComplianceRuleEngine(),

  async evaluate(alert) {
    const engine = this[alert.sourceType];

    // the typeof guard stops 'evaluate' from ever being a valid sourceType that recurses into itself
    if (!engine || typeof engine.evaluate !== 'function') return;

    await engine.evaluate(alert);
  },
};

export { RuleEngine, OverspeedRuleEngine, FeedbackRuleEngine, ComplianceRuleEngine, registry };
