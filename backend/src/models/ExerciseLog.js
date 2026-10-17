const mongoose = require('mongoose');

const ExerciseLogSchema = new mongoose.Schema({
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true,
    index: true
  },
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Doctor',
    required: false,
    index: true
  },
  appointmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Appointment',
    required: false,
    index: true
  },
  exerciseId: {
    type: String,
    required: true,
    trim: true
  },
  exerciseName: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    default: 'Physical Rehabilitation'
  },
  completedReps: {
    type: Number,
    required: true,
    default: 0
  },
  completedSets: {
    type: Number,
    required: true,
    default: 0
  },
  targetReps: {
    type: Number,
    default: 10
  },
  targetSets: {
    type: Number,
    default: 3
  },
  accuracyScore: {
    type: Number,
    default: 95
  },
  durationSeconds: {
    type: Number,
    default: 0
  },
  validReps: {
    type: Number,
    default: 0
  },
  incompleteReps: {
    type: Number,
    default: 0
  },
  minJointAngle: {
    type: Number,
    default: null
  },
  maxJointAngle: {
    type: Number,
    default: null
  },
  rangeOfMotion: {
    type: Number,
    default: null
  },
  formErrors: [{
    type: String
  }],
  compliancePercentage: {
    type: Number,
    default: 100
  },
  safetyEventsCount: {
    type: Number,
    default: 0
  },
  date: {
    type: String, // YYYY-MM-DD
    required: true,
    index: true
  },
  completedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  collection: 'exercise_logs'
});

module.exports = mongoose.model('ExerciseLog', ExerciseLogSchema);
