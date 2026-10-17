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

router.get(
  '/schedule/override-conflicts',
  authenticateJWT,
  authorizeRoles(['doctor']),
  appointmentController.checkOverrideConflicts
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

// Doctor invites next scheduled patient early via email
router.post(
  '/:id/invite-next-early',
  authenticateJWT,
  authorizeRoles(['doctor']),
  appointmentController.inviteNextPatientEarly
);

// Doctor broadcasts delay notification to next waiting patient
router.post(
  '/:id/notify-delay',
  authenticateJWT,
  authorizeRoles(['doctor']),
  appointmentController.notifyPatientDelay
);

module.exports = router;
