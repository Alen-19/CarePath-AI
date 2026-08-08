const express = require('express');
const router = express.Router();
const appointmentController = require('../controllers/appointment.controller');
const { authenticateJWT, authorizeRoles } = require('../middlewares/auth.middleware');

// Public or Authenticated route to get available slots for any doctor and date
router.get('/slots/available', appointmentController.getAvailableSlots);

// Doctor specific schedule management routes
router.get(
  '/schedule/my-schedule',
  authenticateJWT,
  authorizeRoles(['doctor']),
  appointmentController.getMyDoctorSchedule
);

router.put(
  '/schedule/weekly',
  authenticateJWT,
  authorizeRoles(['doctor']),
  appointmentController.updateWeeklySchedule
);

router.post(
  '/schedule/override-date',
  authenticateJWT,
  authorizeRoles(['doctor']),
  appointmentController.saveDateOverride
);

router.delete(
  '/schedule/override-date/:id',
  authenticateJWT,
  authorizeRoles(['doctor']),
  appointmentController.deleteDateOverride
);

// Get consultation & WebRTC details for an appointment
router.get(
  '/:id/consultation',
  authenticateJWT,
  appointmentController.getConsultationDetails
);

module.exports = router;
