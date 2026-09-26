const mongoose = require('mongoose');

const specialtySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  description: { type: String },
  symptoms: [{ type: String }]
}, { timestamps: true });

module.exports = mongoose.model('Specialty', specialtySchema);
