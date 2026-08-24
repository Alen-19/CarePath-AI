const mongoose = require('mongoose');

const CarePlanSchema = new mongoose.Schema({
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
  doctorRemarks: {
    type: String,
    trim: true,
    default: ''
  },
  nutritionalTags: [{
    type: String,
    trim: true
  }],
  recommendedFoods: {
    type: String,
    trim: true,
    default: ''
  },
  dayPartedMeals: {
    breakfast: { type: String, default: '' },
    lunch:     { type: String, default: '' },
    snacks:    { type: String, default: '' },
    dinner:    { type: String, default: '' }
  },
  foodsToAvoid: {
    type: String,
    trim: true,
    default: ''
  },
  hydrationGoalLiters: {
    type: Number,
    default: 3
  },
  savedAt: {
    type: Date,
    default: Date.now
  }
}, { 
  timestamps: true,
  collection: 'care_plans'
});

module.exports = mongoose.model('CarePlan', CarePlanSchema);
