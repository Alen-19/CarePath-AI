const mongoose = require('mongoose');

const PrescriptionSchema = new mongoose.Schema({
  appointmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Appointment',
    required: true,
    index: true
  },
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true,
    index: true
  },
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Doctor',
    required: true,
    index: true
  },
  medicines: [{
    medicineName: { type: String, required: true },
    composition: [{ type: String }],
    dosage: { type: String, default: '1-0-1' }, // Morning-Afternoon-Night
    duration: { type: String, default: '5 Days' },
    instructions: { type: String, default: 'Take after food with water' }
  }],
  prescribedAt: {
    type: Date,
    default: Date.now
  }
}, { 
  timestamps: true,
  collection: 'prescriptions'
});

module.exports = mongoose.model('Prescription', PrescriptionSchema);
