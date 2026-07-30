const mongoose = require('mongoose');

const DoctorSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  lastName: {
    type: String,
    required: true,
    trim: true
  },
  specialization: {
    type: String,
    default: '',
    trim: true
  },
  licenseNumber: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    default: undefined
  },
  experienceYears: {
    type: Number,
    default: 0
  },
  clinicAddress: {
    type: String,
    trim: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  rating: {
    type: Number,
    default: 5.0
  }
}, { 
  timestamps: true,
  collection: 'doctors'
});

module.exports = mongoose.model('Doctor', DoctorSchema);
