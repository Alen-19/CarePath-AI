const mongoose = require('mongoose');

const DoctorDateOverrideSchema = new mongoose.Schema({
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Doctor',
    required: true
  },
  date: {
    type: String, // Format: YYYY-MM-DD
    required: true
  },
  isOffDay: {
    type: Boolean,
    default: true
  },
  // Custom Sessions for override date
  session1Start: {
    type: String,
    default: '09:00 AM'
  },
  session1End: {
    type: String,
    default: '01:00 PM'
  },
  hasSecondSession: {
    type: Boolean,
    default: false
  },
  session2Start: {
    type: String,
    default: '04:00 PM'
  },
  session2End: {
    type: String,
    default: '07:00 PM'
  },
  reason: {
    type: String,
    default: 'On Leave'
  }
}, { 
  timestamps: true,
  collection: 'doctor_date_overrides'
});

DoctorDateOverrideSchema.index({ doctorId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('DoctorDateOverride', DoctorDateOverrideSchema);
