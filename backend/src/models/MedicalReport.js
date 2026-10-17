const mongoose = require('mongoose');

const BiomarkerSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  value: {
    type: String,
    required: true,
    trim: true
  },
  unit: {
    type: String,
    trim: true,
    default: ''
  },
  referenceRange: {
    type: String,
    trim: true,
    default: ''
  },
  flag: {
    type: String,
    enum: ['Normal', 'Borderline', 'High', 'Low', 'Critical'],
    default: 'Normal'
  }
}, { _id: false });

const MedicalReportSchema = new mongoose.Schema({
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  reportType: {
    type: String,
    enum: [
      'Blood Test',
      'Imaging (X-Ray/MRI/CT)',
      'Pathology',
      'Cardiology (ECG/Echo)',
      'Urine/Renal',
      'Prescription/Discharge',
      'Other'
    ],
    default: 'Blood Test'
  },
  reportDate: {
    type: String, // e.g. "YYYY-MM-DD" or readable date from lab
    default: null
  },
  fileUrl: {
    type: String,
    required: true
  },
  fileType: {
    type: String, // 'application/pdf', 'image/jpeg', 'image/png', 'image/webp'
    required: true
  },
  originalFilename: {
    type: String,
    required: true
  },
  fileSize: {
    type: Number, // in bytes
    default: 0
  },

  // 🤖 Multimodal AI Analysis (Google Gemini)
  aiAnalysis: {
    status: {
      type: String,
      enum: ['Pending', 'Completed', 'Failed'],
      default: 'Pending'
    },
    summary: {
      type: String,
      default: '' // Patient-friendly plain English summary
    },
    clinicalImpression: {
      type: String,
      default: '' // Structured clinical impression for doctors
    },
    keyObservations: [{
      type: String
    }],
    criticalAlerts: [{
      type: String
    }],
    recommendedSpecialty: {
      type: String,
      default: 'General Practice'
    },
    biomarkers: [BiomarkerSchema]
  },

  // 🔗 Multi-Doctor & Consultation Links (Scenarios B & C)
  linkedConsultationIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Appointment'
  }],
  sharedWithDoctorIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Doctor'
  }],
  isSharedWithAllConsultingDoctors: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  collection: 'medical_reports'
});

module.exports = mongoose.model('MedicalReport', MedicalReportSchema);
