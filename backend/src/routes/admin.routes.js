const express = require('express');
const router = express.Router();
const {
  getAdminStats,
  getDoctorVerificationRequests,
  approveDoctor,
  rejectDoctor,
  suspendDoctor,
  unsuspendDoctor
} = require('../controllers/admin.controller');
const {
  searchNMC,
  getNMCDoctorDetails,
  getCouncils
} = require('../controllers/nmc.controller');
const { authenticateJWT, authorizeRoles } = require('../middlewares/auth.middleware');

// Protect all admin routes with JWT authentication and Admin role authorization
router.use(authenticateJWT, authorizeRoles('admin'));

// Admin Dashboard Endpoints
router.get('/stats', getAdminStats);
router.get('/doctors', getDoctorVerificationRequests);
router.put('/doctors/:id/approve', approveDoctor);
router.put('/doctors/:id/reject', rejectDoctor);
router.put('/doctors/:id/suspend', suspendDoctor);
router.put('/doctors/:id/unsuspend', unsuspendDoctor);

// NMC Live Doctor Verification Endpoints
router.get('/nmc/councils', getCouncils);
router.get('/nmc/search', searchNMC);
router.post('/nmc/doctor-details', getNMCDoctorDetails);

module.exports = router;
