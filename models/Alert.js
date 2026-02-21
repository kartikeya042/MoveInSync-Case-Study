const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema(
  {
    alertid: {
      type: String,
      required: true,
      unique: true, // dedup key — same alert from multiple sources shouldn't create separate documents
    },
    sourceType: {
      type: String,
      required: true,
    },
    severity: {
      type: String,
      required: true,
    },
    timestamp: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ['OPEN', 'ESCALATED', 'AUTO-CLOSED', 'RESOLVED'], // locked here so invalid state transitions never reach the db
      required: true,
      default: 'OPEN',
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed, // different alert sources send different shapes, keeping this flexible
    },
  },
  { timestamps: false }
);

const Alert = mongoose.model('Alert', alertSchema);

module.exports = Alert;
