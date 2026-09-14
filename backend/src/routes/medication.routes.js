const express = require('express');
const router = express.Router();
const { authenticateJWT } = require('../middlewares/auth.middleware');
const {
  getActiveMedicationSchedule,
  toggleDoseStatus,
  sendTestMorningDigest
} = require('../controllers/medication.controller');

// All medication routes require authenticated patient access
router.get('/active-schedule', authenticateJWT, getActiveMedicationSchedule);
router.post('/toggle-dose', authenticateJWT, toggleDoseStatus);
router.post('/send-test-digest', authenticateJWT, sendTestMorningDigest);

module.exports = router;
