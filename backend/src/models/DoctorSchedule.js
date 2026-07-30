const mongoose = require('mongoose');

const DayScheduleSchema = new mongoose.Schema({
  dayOfWeek: {
    type: String,
    enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    required: true
  },
  isWorkingDay: {
    type: Boolean,
    default: true
  },
  // Morning Session
  session1Start: {
    type: String,
    default: '09:00 AM'
  },
  session1End: {
    type: String,
    default: '01:00 PM'
  },
  // Afternoon / Evening Session (after break)
  hasSecondSession: {
    type: Boolean,
    default: true
  },
  session2Start: {
    type: String,
    default: '04:00 PM'
  },
  session2End: {
    type: String,
    default: '07:00 PM'
  },
  // Legacy single session fallback
  startTime: {
    type: String,
    default: '09:00 AM'
  },
  endTime: {
    type: String,
    default: '05:00 PM'
  }
}, { _id: false });

const DoctorScheduleSchema = new mongoose.Schema({
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Doctor',
    required: true,
    unique: true
  },
  consultationFee: {
    type: Number,
    default: 500, // Fee in ₹ Rupees
    min: 0,
    max: 25000,
    required: true
  },
  slotDurationMinutes: {
    type: Number,
    default: 30
  },
  weeklySchedule: [DayScheduleSchema]
}, { 
  timestamps: true,
  collection: 'doctor_schedules'
});

module.exports = mongoose.model('DoctorSchedule', DoctorScheduleSchema);
