const mongoose = require('mongoose');

const FoodLogSchema = new mongoose.Schema({
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true,
    index: true
  },
  carePlanId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CarePlan',
    default: null,
    index: true
  },
  loggedDate: {
    type: String, // YYYY-MM-DD
    required: true,
    index: true
  },
  mealType: {
    type: String,
    enum: ['Breakfast', 'Lunch', 'Snack', 'Dinner'],
    required: true
  },
  foodItemName: {
    type: String,
    required: true,
    trim: true
  },
  imageUrl: {
    type: String,
    default: null
  },
  nutritionalData: {
    calories: { type: Number, default: 0 },
    proteinGrams: { type: Number, default: 0 },
    carbsGrams: { type: Number, default: 0 },
    fatGrams: { type: Number, default: 0 },
    sodiumMg: { type: Number, default: 0 },
    fiberGrams: { type: Number, default: 0 }
  },
  geminiAnalysis: {
    confidence: { type: Number, default: null },
    rawResponse: { type: String, default: null }
  },
  complianceStatus: {
    type: String,
    enum: ['Compliant', 'Non-Compliant', 'Warning'],
    default: 'Compliant'
  }
}, { 
  timestamps: true,
  collection: 'food_logs'
});

module.exports = mongoose.model('FoodLog', FoodLogSchema);
