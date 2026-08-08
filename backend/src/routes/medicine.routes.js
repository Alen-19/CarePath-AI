const express = require('express');
const router = express.Router();
const { searchMedicines } = require('../controllers/medicine.controller');

// GET /api/medicines/search?q=augmentin
router.get('/search', searchMedicines);

module.exports = router;
