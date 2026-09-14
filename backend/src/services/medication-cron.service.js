const cron = require('node-cron');
const Prescription = require('../models/Prescription');
const Patient = require('../models/Patient');
const User = require('../models/User');
const { sendMedicationDigestEmail } = require('../config/mailer');
const { parseDurationDays, parseDosageSlots } = require('../controllers/medication.controller');

/**
 * Initializes the automated daily morning medication reminder cron job.
 * Runs at 07:30 AM every day (India Standard Time).
 */
const initMedicationCron = () => {
  console.log('[MEDICATION CRON] Initializing daily morning medication reminder scheduler (07:30 AM)...');

  // Cron schedule: minute 30, hour 7 (07:30 AM daily)
  cron.schedule('30 7 * * *', async () => {
    console.log('[MEDICATION CRON] ⏰ Running daily morning medication digest dispatcher...');
    try {
      const now = new Date();
      const todayFormatted = now.toLocaleDateString('en-IN', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });

      // Find all distinct patients who have prescriptions
      const patientIds = await Prescription.distinct('patientId');
      console.log(`[MEDICATION CRON] Evaluating active prescriptions for ${patientIds.length} patient(s)...`);

      for (const patientId of patientIds) {
        try {
          const patient = await Patient.findById(patientId);
          if (!patient || !patient.userId) continue;

          const user = await User.findById(patient.userId);
          if (!user || !user.email) continue;

          const patientName = `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || 'Patient';

          // Fetch prescriptions for this patient
          const prescriptions = await Prescription.find({ patientId })
            .populate('doctorId', 'firstName lastName specialization');

          const morningMeds = [];
          const afternoonMeds = [];
          const nightMeds = [];

          prescriptions.forEach(rx => {
            const startDate = new Date(rx.prescribedAt || rx.createdAt);
            const diffDays = Math.floor((now - startDate) / (1000 * 60 * 60 * 24));
            const doctorName = rx.doctorId ? `Dr. ${rx.doctorId.firstName} ${rx.doctorId.lastName}` : '';

            if (Array.isArray(rx.medicines)) {
              rx.medicines.forEach(med => {
                const totalDays = parseDurationDays(med.duration);
                if (diffDays >= 0 && diffDays < totalDays) {
                  const slots = parseDosageSlots(med.dosage);
                  const item = {
                    medicineName: med.medicineName,
                    duration: med.duration,
                    instructions: med.instructions,
                    doctorName
                  };
                  if (slots.morning) morningMeds.push(item);
                  if (slots.afternoon) afternoonMeds.push(item);
                  if (slots.night) nightMeds.push(item);
                }
              });
            }
          });

          // Only send if patient has at least one active medicine scheduled
          if (morningMeds.length > 0 || afternoonMeds.length > 0 || nightMeds.length > 0) {
            await sendMedicationDigestEmail(
              user.email,
              patientName,
              todayFormatted,
              morningMeds,
              afternoonMeds,
              nightMeds,
              2.5
            );
          }
        } catch (patientErr) {
          console.error(`[MEDICATION CRON] Error dispatching to patient ${patientId}:`, patientErr.message);
        }
      }
      console.log('[MEDICATION CRON] Finished daily morning medication digest dispatch.');
    } catch (cronErr) {
      console.error('[MEDICATION CRON] Fatal error in morning cron execution:', cronErr);
    }
  });
};

module.exports = {
  initMedicationCron
};
