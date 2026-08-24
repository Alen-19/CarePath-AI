const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { getDynamicMealPlan, recognizeFoodImage, logMeal, analyzeFood } = require('../controllers/nutrition.controller');
const { authenticateJWT } = require('../middlewares/auth.middleware');

// Configure multer storage for meal plate images
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '../../uploads/meals'));
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'meal-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

router.get('/meal-plan', authenticateJWT, getDynamicMealPlan);
router.post('/recognize-food', authenticateJWT, upload.single('image'), recognizeFoodImage);
router.post('/log-meal', authenticateJWT, logMeal);
router.post('/analyze-food', authenticateJWT, analyzeFood);

module.exports = router;
