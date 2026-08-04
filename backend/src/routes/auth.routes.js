const express = require('express');
const router = express.Router();
const { registerUser, loginUser, getUserProfile, googleLogin, completeProfile, getPincodeDetails } = require('../controllers/auth.controller');
const { authenticateJWT, authorizeRoles } = require('../middlewares/auth.middleware');

// Public routes
router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/google', googleLogin);
router.get('/pincode/:pincode', getPincodeDetails);

// Private routes
router.get('/profile', authenticateJWT, getUserProfile);
router.put('/complete-profile', authenticateJWT, completeProfile);

module.exports = router;
