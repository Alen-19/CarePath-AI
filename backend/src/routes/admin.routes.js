const express = require('express');
const router = express.Router();
const {
  getAdminStats,
  getDoctorVerificationRequests,
  approveDoctor,
  rejectDoctor
} = require('../controllers/admin.controller');
const { authenticateJWT, authorizeRoles } = require('../middlewares/auth.middleware');

// Protect all admin routes with JWT authentication and Admin role authorization
router.use(authenticateJWT, authorizeRoles('admin'));

// Admin Dashboard Endpoints
router.get('/stats', getAdminStats);
router.get('/doctors', getDoctorVerificationRequests);
router.put('/doctors/:id/approve', approveDoctor);
router.put('/doctors/:id/reject', rejectDoctor);

module.exports = router;
