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
  },
  // Cancellation
  cancelledAt: {
    type: Date,
    default: null
  },
  cancellationReason: {
    type: String,
    default: null
  },
  refundId: {
    type: String,
    default: null // Razorpay refund ID after cancellation
  },
  // Video Call / Consultation fields
  meetingRoomId: {
    type: String,
    default: null
  },
  callStatus: {
    type: String,
    enum: ['Not Started', 'In Progress', 'Completed'],
    default: 'Not Started'
  },
  callStartedAt: {
    type: Date,
    default: null
  },
  callEndedAt: {
    type: Date,
    default: null
  },
  callDurationSeconds: {
    type: Number,
    default: 0
  },
  // Digital E-Prescription
  prescription: [{
    medicineName: { type: String, required: true },
    composition: [{ type: String }],
    dosage: { type: String, default: '1-0-1' }, // Morning-Afternoon-Night
    duration: { type: String, default: '5 Days' },
    instructions: { type: String, default: 'Take after food with water' }
  }],
  prescribedAt: {
    type: Date,
    default: null
  },
  // Clinical Consultation Notes & Dietary Suggestions
  clinicalNotes: {
    doctorRemarks: { type: String, trim: true, default: '' },
    nutritionalTags: [{ type: String }],
    recommendedFoods: { type: String, trim: true, default: '' },
    foodsToAvoid: { type: String, trim: true, default: '' },
    hydrationGoalLiters: { type: Number, default: 3 },
    savedAt: { type: Date, default: null }
  },
  // Emergency Triage & Queue Shift fields
  isEmergency: {
    type: Boolean,
    default: false
  },
  emergencyStatus: {
    type: String,
    enum: ['None', 'Pending', 'Accepted', 'Completed'],
    default: 'None'
  },
  delayMinutes: {
    type: Number,
    default: 0
  }
}, { 
  timestamps: true,
  collection: 'appointments'
});

module.exports = mongoose.model('Appointment', AppointmentSchema);
