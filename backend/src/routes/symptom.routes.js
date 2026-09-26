const express = require('express');
const router = express.Router();
const symptomController = require('../controllers/symptom.controller');
const { protect, authorizeRoles } = require('../middlewares/auth.middleware');

// Note: Using protect so only authenticated users can use the symptom checker
router.post('/analyze', protect, authorizeRoles('patient'), symptomController.analyzeSymptoms);

module.exports = router;
