const Prescription = require('../models/Prescription');
const MedicationLog = require('../models/MedicationLog');
const Appointment = require('../models/Appointment');
const Patient = require('../models/Patient');
const User = require('../models/User');
const { sendMedicationDigestEmail } = require('../config/mailer');

/**
 * Parses duration strings into integer days
 * e.g. "5 Days" -> 5, "1 Month" -> 30, "2 Weeks" -> 14
 */
const parseDurationDays = (durationStr) => {
  if (!durationStr) return 7;
  const match = durationStr.match(/(\d+)/);
  if (match) {
    const num = parseInt(match[1], 10);
    if (/month/i.test(durationStr)) return num * 30;
    if (/week/i.test(durationStr)) return num * 7;
    return num;
  }
  if (/continuous|long|ongoing/i.test(durationStr)) return 30;
  return 7;
};

/**
 * Parses dosage strings like "1-0-1", "1-1-1", "1-0-0"
 */
const parseDosageSlots = (dosageStr) => {
  if (!dosageStr) return { morning: true, afternoon: false, night: true };
  const parts = dosageStr.split('-').map(p => p.trim());
  if (parts.length === 3) {
    return {
      morning: parts[0] === '1' || parts[0] === '2',
      afternoon: parts[1] === '1' || parts[1] === '2',
      night: parts[2] === '1' || parts[2] === '2'
    };
  }
  const lower = dosageStr.toLowerCase();
  const morning = lower.includes('morn') || lower.includes('once') || lower.includes('twice') || lower.includes('thrice');
  const afternoon = lower.includes('noon') || lower.includes('thrice');
  const night = lower.includes('night') || lower.includes('bed') || lower.includes('twice') || lower.includes('thrice');
  return { morning, afternoon, night };
};

/**
 * GET /api/medications/active-schedule
 * Returns today's active medicines parsed into Morning, Afternoon, Night slots
 */
const getActiveMedicationSchedule = async (req, res) => {
  try {
    const patientUserId = req.user._id;

    // Find Patient profile
    let patient = await Patient.findOne({ userId: patientUserId });
    const patientId = patient ? patient._id : patientUserId;

    // Today YYYY-MM-DD
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    // Find all prescriptions for patient
    const prescriptions = await Prescription.find({ patientId })
      .populate('doctorId', 'firstName lastName specialization')
      .populate('appointmentId', 'appointmentDate status clinicalNotes')
      .sort({ prescribedAt: -1 });

    // Fetch today's logged doses
    const todayLogs = await MedicationLog.find({
      patientId,
      date: todayStr
    });

    // Helper map of taken doses: `${medName}_${slot}` -> { isTaken, takenAt }
    const logMap = {};
    todayLogs.forEach(log => {
      if (log.isTaken) {
        logMap[`${log.medicineName}_${log.slot}`] = {
          isTaken: true,
          takenAt: log.takenAt
        };
      }
    });

    const morningMeds = [];
    const afternoonMeds = [];
    const nightMeds = [];
    const distinctDoctors = new Map();

    prescriptions.forEach(rx => {
      const startDate = new Date(rx.prescribedAt || rx.createdAt);
      // Strip time components to calculate day diff
      const startDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
      const currentDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const diffDays = Math.floor((currentDay - startDay) / (1000 * 60 * 60 * 24));
      const doctorName = rx.doctorId 
        ? `Dr. ${rx.doctorId.firstName} ${rx.doctorId.lastName}` 
        : 'Doctor';
      const specialty = rx.doctorId ? rx.doctorId.specialization : 'Specialist';
      const doctorIdStr = rx.doctorId ? rx.doctorId._id.toString() : 'unknown';

      if (rx.doctorId) {
        distinctDoctors.set(doctorIdStr, {
          doctorId: doctorIdStr,
          doctorName,
          specialty
        });
      }

      if (Array.isArray(rx.medicines)) {
        rx.medicines.forEach((med, idx) => {
          const totalDays = parseDurationDays(med.duration);

          // Course active if diffDays >= 0 and diffDays < totalDays
          // If prescribed recently (e.g. today or last few days), it is active
          if (diffDays >= 0 && diffDays < totalDays) {
            const dayCurrent = diffDays + 1;
            const daysRemaining = Math.max(0, totalDays - dayCurrent);
            const slots = parseDosageSlots(med.dosage);

            const baseItem = {
              medicineId: `${rx._id}_${idx}`,
              prescriptionId: rx._id,
              appointmentId: rx.appointmentId?._id || rx.appointmentId,
              medicineName: med.medicineName,
              composition: med.composition || [],
              dosage: med.dosage,
              duration: med.duration,
              instructions: med.instructions || 'Take after food with water',
              doctorId: doctorIdStr,
              doctorName,
              specialty,
              dayCurrent,
              daysTotal: totalDays,
              daysRemaining
            };

            // Morning
            if (slots.morning) {
              const logKey = `${med.medicineName}_Morning`;
              const logInfo = logMap[logKey];
              morningMeds.push({
                ...baseItem,
                slot: 'Morning',
                isTaken: !!logInfo,
                takenAt: logInfo ? logInfo.takenAt : null
              });
            }

            // Afternoon
            if (slots.afternoon) {
              const logKey = `${med.medicineName}_Afternoon`;
              const logInfo = logMap[logKey];
              afternoonMeds.push({
                ...baseItem,
                slot: 'Afternoon',
                isTaken: !!logInfo,
                takenAt: logInfo ? logInfo.takenAt : null
              });
            }

            // Night
            if (slots.night) {
              const logKey = `${med.medicineName}_Night`;
              const logInfo = logMap[logKey];
              nightMeds.push({
                ...baseItem,
                slot: 'Night',
                isTaken: !!logInfo,
                takenAt: logInfo ? logInfo.takenAt : null
              });
            }
          }
        });
      }
    });

    const totalDosesToday = morningMeds.length + afternoonMeds.length + nightMeds.length;
    const takenDosesToday = [...morningMeds, ...afternoonMeds, ...nightMeds].filter(m => m.isTaken).length;
    const compliancePct = totalDosesToday > 0 
      ? Math.round((takenDosesToday / totalDosesToday) * 100) 
      : 100;

    res.json({
      success: true,
      date: todayStr,
      schedule: {
        morning: morningMeds,
        afternoon: afternoonMeds,
        night: nightMeds
      },
      stats: {
        totalDosesToday,
        takenDosesToday,
        compliancePct
      },
      doctors: Array.from(distinctDoctors.values())
    });
  } catch (err) {
    console.error('[MEDICATION CONTROLLER] getActiveMedicationSchedule error:', err);
    res.status(500).json({ message: 'Failed to retrieve active medication schedule.', error: err.message });
  }
};

/**
 * POST /api/medications/toggle-dose
 * Toggles a dose between taken and pending for today
 */
const toggleDoseStatus = async (req, res) => {
  try {
    const patientUserId = req.user._id;
    let patient = await Patient.findOne({ userId: patientUserId });
    const patientId = patient ? patient._id : patientUserId;

    const { prescriptionId, appointmentId, medicineName, slot, isTaken } = req.body;

    if (!medicineName || !slot) {
      return res.status(400).json({ message: 'medicineName and slot are required.' });
    }

    const todayStr = new Date().toISOString().split('T')[0];

    let log = await MedicationLog.findOne({
      patientId,
      date: todayStr,
      medicineName,
      slot
    });

    if (log) {
      // Toggle or set explicit status
      log.isTaken = isTaken !== undefined ? isTaken : !log.isTaken;
      log.takenAt = log.isTaken ? new Date() : null;
      await log.save();
    } else {
      log = await MedicationLog.create({
        patientId,
        prescriptionId: prescriptionId || null,
        appointmentId: appointmentId || null,
        medicineName,
        slot,
        date: todayStr,
        isTaken: isTaken !== undefined ? isTaken : true,
        takenAt: new Date()
      });
    }

    res.json({
      success: true,
      message: log.isTaken ? 'Dose marked as taken!' : 'Dose marked as pending.',
      log
    });
  } catch (err) {
    console.error('[MEDICATION CONTROLLER] toggleDoseStatus error:', err);
    res.status(500).json({ message: 'Failed to update dose status.', error: err.message });
  }
};

/**
 * POST /api/medications/send-test-digest
 * Dispatches an instant morning medication email for the logged-in patient
 */
const sendTestMorningDigest = async (req, res) => {
  try {
    const patientUserId = req.user._id;
    const user = await User.findById(patientUserId);
    let patient = await Patient.findOne({ userId: patientUserId });

    if (!user || !user.email) {
      return res.status(400).json({ message: 'Patient email not found.' });
    }

    const patientName = patient 
      ? `${patient.firstName} ${patient.lastName}`.trim() 
      : (user.name || 'Patient');

    // Get active schedule
    const now = new Date();
    const todayFormatted = now.toLocaleDateString('en-IN', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    const prescriptions = await Prescription.find({ patientId: patient ? patient._id : patientUserId })
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

    const emailSent = await sendMedicationDigestEmail(
      user.email,
      patientName,
      todayFormatted,
      morningMeds,
      afternoonMeds,
      nightMeds,
      2.5
    );

    if (emailSent) {
      res.json({
        success: true,
        message: `Morning medication digest successfully emailed to ${user.email}!`
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to send email. Check SMTP server configuration.'
      });
    }
  } catch (err) {
    console.error('[MEDICATION CONTROLLER] sendTestMorningDigest error:', err);
    res.status(500).json({ message: 'Failed to send digest email.', error: err.message });
  }
};

module.exports = {
  getActiveMedicationSchedule,
  toggleDoseStatus,
  sendTestMorningDigest,
  parseDurationDays,
  parseDosageSlots
};
