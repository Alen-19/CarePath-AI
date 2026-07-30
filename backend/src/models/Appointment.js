const mongoose = require('mongoose');

const AppointmentSchema = new mongoose.Schema({
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true
  },
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Doctor',
    required: true
  },
  appointmentDate: {
    type: String, // YYYY-MM-DD
    required: true
  },
  startTime: {
    type: String, // e.g. "09:00 AM"
    required: true
  },
  endTime: {
    type: String, // e.g. "09:30 AM"
    required: true
  },
  type: {
    type: String,
    enum: ['General Consultation', 'Follow-up', 'Care Plan Review', 'Emergency Sync'],
    default: 'General Consultation'
  },
  symptoms: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['Pending Payment', 'Confirmed', 'Completed', 'Cancelled'],
    default: 'Pending Payment'
  },
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'INR'
  },
  razorpayOrderId: {
    type: String,
    default: null
  },
  razorpayPaymentId: {
    type: String,
    default: null
  },
  paymentStatus: {
    type: String,
    enum: ['Pending', 'Paid', 'Failed', 'Refunded'],
    default: 'Pending'
  },
  paidAt: {
    type: Date,
    default: null
  }
}, { 
  timestamps: true,
  collection: 'appointments'
});

module.exports = mongoose.model('Appointment', AppointmentSchema);
