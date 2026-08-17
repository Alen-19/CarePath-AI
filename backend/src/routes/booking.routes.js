const express = require('express');
const router = express.Router();
const { authenticateJWT, authorizeRoles } = require('../middlewares/auth.middleware');
const {
  getDoctors,
  getAvailableSlots,
  bookAppointment,
  verifyPayment,
  getPatientAppointments,
  getDoctorAppointments,
  cancelAppointment,
  retryPayment,
  addPrescription,
  saveClinicalNotes,
  getClinicalNotes
} = require('../controllers/booking.controller');

// Public: doctor listing and slot availability
router.get('/doctors', getDoctors);
router.get('/doctors/:doctorId/slots', getAvailableSlots);

// Patient only
router.post('/book', authenticateJWT, authorizeRoles('patient'), bookAppointment);
router.post('/verify-payment', authenticateJWT, authorizeRoles('patient'), verifyPayment);
router.get('/my-appointments', authenticateJWT, authorizeRoles('patient'), getPatientAppointments);
router.post('/:id/cancel', authenticateJWT, authorizeRoles('patient'), cancelAppointment);
router.post('/:id/retry-payment', authenticateJWT, authorizeRoles('patient'), retryPayment);

// Doctor only
router.get('/doctor-appointments', authenticateJWT, authorizeRoles('doctor'), getDoctorAppointments);
router.post('/:id/prescription', authenticateJWT, authorizeRoles('doctor'), addPrescription);
router.post('/:id/clinical-notes', authenticateJWT, authorizeRoles('doctor'), saveClinicalNotes);
router.get('/:id/clinical-notes', authenticateJWT, getClinicalNotes);

module.exports = router;
