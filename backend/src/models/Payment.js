const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema({
  appointmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Appointment',
    required: true
  },
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

  // Razorpay identifiers
  razorpayOrderId: {
    type: String,
    required: true
  },
  razorpayPaymentId: {
    type: String,
    default: null
  },
  razorpaySignature: {
    type: String,
    default: null
  },

  // Amount stored in rupees (e.g. 500 = ₹500)
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'INR'
  },

  // 💰 80/20 Razorpay Route Revenue Split Tracking
  platformFeePercent: {
    type: Number,
    default: 20 // 20%
  },
  platformFee: {
    type: Number,
    default: 0 // e.g. ₹100
  },
  doctorEarning: {
    type: Number,
    default: 0 // e.g. ₹400
  },
  razorpayTransferId: {
    type: String,
    default: null
  },
  transferStatus: {
    type: String,
    enum: ['Pending', 'Transferred', 'Not Applicable', 'Failed'],
    default: 'Pending'
  },

  // Payment status
  status: {
    type: String,
    enum: ['Pending', 'Paid', 'Failed', 'Refunded', 'Partially Refunded'],
    default: 'Pending'
  },
  paidAt: {
    type: Date,
    default: null
  },

  // Refund details
  refundAmount: {
    type: Number,
    default: 0
  },
  refundPercentage: {
    type: Number,
    default: 0 // 0, 50, or 100
  },
  razorpayRefundId: {
    type: String,
    default: null
  },
  refundInitiatedAt: {
    type: Date,
    default: null
  },
  refundStatus: {
    type: String,
    enum: ['None', 'Initiated', 'Processed', 'Failed'],
    default: 'None'
  }
}, {
  timestamps: true,
  collection: 'payments'
});

module.exports = mongoose.model('Payment', PaymentSchema);
