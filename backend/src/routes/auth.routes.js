const express = require('express');
const router = express.Router();
const {
  registerUser,
  loginUser,
  getUserProfile,
  googleLogin,
  completeProfile,
  getPincodeDetails,
  forgotPassword,
  resetPassword,
  updateProfile,
  changePassword,
  uploadProfileImage,
  profileUpload
} = require('../controllers/auth.controller');
const { authenticateJWT, authorizeRoles } = require('../middlewares/auth.middleware');

// Public routes
router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/google', googleLogin);
router.get('/pincode/:pincode', getPincodeDetails);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// Private routes
router.get('/profile', authenticateJWT, getUserProfile);
router.put('/complete-profile', authenticateJWT, completeProfile);
router.put('/update-profile', authenticateJWT, updateProfile);
router.put('/change-password', authenticateJWT, changePassword);
router.post('/profile-image', authenticateJWT, profileUpload.single('profileImage'), uploadProfileImage);

module.exports = router;
