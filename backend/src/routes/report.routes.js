const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authenticateJWT, authorizeRoles } = require('../middlewares/auth.middleware');
const {
  uploadReport,
  getMyReports,
  getReportById,
  updateSharing,
  linkConsultation,
  deleteReport,
  getPatientReportsForDoctor,
  getAppointmentReports
} = require('../controllers/report.controller');

// Ensure destination folder exists
const uploadDir = path.join(__dirname, '../../uploads/reports');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer storage configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const sanitizedBase = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `report-${sanitizedBase}-${uniqueSuffix}${ext}`);
  }
});

// File filter: accept PDFs and standard medical imaging types
const fileFilter = (req, file, cb) => {
  const allowedMimes = [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp'
  ];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file format. Only PDF, JPG, PNG, and WebP medical reports are supported.'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB limit
});

// ─── REPORT ROUTES ─────────────────────────────────────────────────────────────

// Patient uploads report (Scenario A or Scenario B)
router.post('/upload', authenticateJWT, upload.single('reportFile'), uploadReport);

// Patient records vault list
router.get('/my-reports', authenticateJWT, getMyReports);

// Live video call consultation reports
router.get('/consultation/:appointmentId', authenticateJWT, getAppointmentReports);

// Doctor viewing patient's shared longitudinal reports (Scenario C)
router.get('/patient/:patientId', authenticateJWT, authorizeRoles(['doctor', 'admin']), getPatientReportsForDoctor);

// Single report details
router.get('/:id', authenticateJWT, getReportById);

// Update doctor sharing / permission toggle (Scenario C)
router.patch('/:id/share', authenticateJWT, updateSharing);

// Link report to consultation / appointment (Scenario B)
router.post('/:id/link-consultation', authenticateJWT, linkConsultation);

// Delete report
router.delete('/:id', authenticateJWT, deleteReport);

module.exports = router;
