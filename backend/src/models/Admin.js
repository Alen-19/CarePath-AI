const mongoose = require('mongoose');

const AdminSchema = new mongoose.Schema({
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
  department: {
    type: String,
    default: 'System Administration'
  }
}, { 
  timestamps: true,
  collection: 'admins'
});

module.exports = mongoose.model('Admin', AdminSchema);
