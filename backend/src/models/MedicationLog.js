const mongoose = require('mongoose');

const MedicationLogSchema = new mongoose.Schema({
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true,
    index: true
  },
  prescriptionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Prescription',
    required: false,
    index: true
  },
  appointmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Appointment',
    required: false,
    index: true
  },
  medicineName: {
    type: String,
    required: true,
    trim: true
  },
  slot: {
    type: String,
    enum: ['Morning', 'Afternoon', 'Night'],
    required: true
  },
  dosage: {
    type: String,
    default: '1 Tablet'
  },
  date: {
    type: String, // YYYY-MM-DD
    required: true,
    index: true
  },
  isTaken: {
    type: Boolean,
    default: true
  },
  takenAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  collection: 'medicationlogs'
});

// Composite index to easily query a patient's logs for a specific day and medicine slot
MedicationLogSchema.index({ patientId: 1, date: 1, medicineName: 1, slot: 1 });

module.exports = mongoose.model('MedicationLog', MedicationLogSchema);
