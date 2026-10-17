const Razorpay = require('razorpay');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const Doctor = require('../models/Doctor');
const Patient = require('../models/Patient');
const DoctorSchedule = require('../models/DoctorSchedule');
const DoctorDateOverride = require('../models/DoctorDateOverride');
const Appointment = require('../models/Appointment');
const Prescription = require('../models/Prescription');
const CarePlan = require('../models/CarePlan');
const MedicalReport = require('../models/MedicalReport');
const Payment = require('../models/Payment');
const User = require('../models/User');
const ExerciseLog = require('../models/ExerciseLog');
const { sendAppointmentReceiptEmail, sendPrescriptionEmail, sendExerciseEmergencyAlertEmail } = require('../config/mailer');

// Lazily initialize Razorpay so it doesn't throw at module load time
// when env vars haven't been set yet.
let _razorpay = null;
function getRazorpay() {
  if (!_razorpay) {
    _razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });
  }
  return _razorpay;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function parseTimeToMinutes(timeStr) {
  if (!timeStr) return -1;
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return -1;
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const mod = match[3].toUpperCase();
  if (mod === 'PM' && h < 12) h += 12;
  if (mod === 'AM' && h === 12) h = 0;
  return h * 60 + m;
}

function formatMinutesToTime(totalMinutes) {
  let h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const mod = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} ${mod}`;
}

function generateSlots(startStr, endStr, duration = 30) {
  const start = parseTimeToMinutes(startStr);
  const end = parseTimeToMinutes(endStr);
  if (start < 0 || end < 0 || start >= end) return [];
  const slots = [];
  for (let t = start; t + duration <= end; t += duration) {
    slots.push({ start: formatMinutesToTime(t), end: formatMinutesToTime(t + duration) });
  }
  return slots;
}

function getDayName(dateStr) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[new Date(dateStr + 'T00:00:00').getDay()];
}

function getNowIST() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(now);

  let y, m, d, h = 0, min = 0;
  parts.forEach(p => {
    if (p.type === 'year') y = p.value;
    if (p.type === 'month') m = p.value;
    if (p.type === 'day') d = p.value;
    if (p.type === 'hour') h = parseInt(p.value, 10) % 24;
    if (p.type === 'minute') min = parseInt(p.value, 10);
  });

  const todayStr = `${y}-${m}-${d}`;
  const nowMinutes = h * 60 + min;
  return { todayStr, nowMinutes };
}

function getHaversineDistanceKm(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

// ─── GET /api/booking/doctors ───────────────────────────────────────────────
// List all approved, active doctors for patient search with proximity calculation
const getDoctors = async (req, res) => {
  try {
    const { search, specialization } = req.query;

    // Extract patient coordinates from query or JWT token if available
    let patientLat = req.query.patientLat ? parseFloat(req.query.patientLat) : null;
    let patientLng = req.query.patientLng ? parseFloat(req.query.patientLng) : null;

    if ((patientLat == null || patientLng == null) && req.headers.authorization) {
      try {
        const token = req.headers.authorization.split(' ')[1];
        if (token) {
          const decoded = jwt.verify(token, process.env.JWT_SECRET || 'carepath_ai_super_secret_jwt_key_2026');
          if (decoded && decoded.id) {
            const patient = await Patient.findOne({ userId: decoded.id });
            if (patient && patient.address) {
              patientLat = patient.address.latitude ?? null;
              patientLng = patient.address.longitude ?? null;
            }
          }
        }
      } catch (e) {}
    }

    const filter = { status: 'approved', isVerified: true };
    const doctors = await Doctor.find(filter).populate('userId', 'email');

    // Fetch schedules to sync consultation fees set by doctors
    const schedules = await DoctorSchedule.find({});
    const scheduleMap = new Map(schedules.map(s => [s.doctorId.toString(), s.consultationFee]));

    let result = doctors.map(d => {
      const docLat = d.latitude ?? (typeof d.clinicAddress === 'object' ? d.clinicAddress?.latitude : null);
      const docLng = d.longitude ?? (typeof d.clinicAddress === 'object' ? d.clinicAddress?.longitude : null);

      let distanceKm = null;
      if (patientLat != null && patientLng != null && docLat != null && docLng != null) {
        distanceKm = getHaversineDistanceKm(patientLat, patientLng, docLat, docLng);
      }

      // Format clean display address string (fixes [object Object] bug)
      let clinicAddressDisplay = 'Location not specified';
      if (typeof d.clinicAddress === 'object' && d.clinicAddress !== null) {
        const parts = [
          d.clinicName,
          d.clinicAddress.city,
          d.clinicAddress.district,
          d.clinicAddress.state,
          d.clinicAddress.pincode
        ].filter(Boolean);
        clinicAddressDisplay = parts.join(', ');
      } else if (typeof d.clinicAddress === 'string' && d.clinicAddress) {
        clinicAddressDisplay = d.clinicAddress;
      }

      return {
        _id: d._id,
        firstName: d.firstName,
        lastName: d.lastName,
        specialization: d.specialization,
        licenseNumber: d.licenseNumber,
        experienceYears: d.experienceYears,
        clinicName: d.clinicName || '',
        clinicAddress: clinicAddressDisplay,
        clinicAddressDisplay: clinicAddressDisplay,
        distanceKm: distanceKm,
        latitude: docLat,
        longitude: docLng,
        rating: d.rating,
        consultationFee: scheduleMap.get(d._id.toString()) ?? d.consultationFee ?? 500,
        email: d.userId?.email
      };
    });

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(d =>
        `${d.firstName} ${d.lastName}`.toLowerCase().includes(q) ||
        (d.specialization || '').toLowerCase().includes(q) ||
        (d.clinicAddressDisplay || '').toLowerCase().includes(q)
      );
    }

    if (specialization) {
      result = result.filter(d =>
        (d.specialization || '').toLowerCase().includes(specialization.toLowerCase())
      );
    }

    // Sort doctors: Closest doctors first if distance exists
    result.sort((a, b) => {
      if (a.distanceKm != null && b.distanceKm != null) {
        return a.distanceKm - b.distanceKm;
      }
      if (a.distanceKm != null) return -1;
      if (b.distanceKm != null) return 1;
      return 0;
    });

    res.json({ success: true, count: result.length, doctors: result });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching doctors.', error: err.message });
  }
};

// ─── GET /api/booking/doctors/:doctorId/slots?date=YYYY-MM-DD ──────────────
const getAvailableSlots = async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { date } = req.query;

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ message: 'Valid date (YYYY-MM-DD) is required.' });
    }

    const { todayStr, nowMinutes } = getNowIST();
    if (date < todayStr) {
      return res.status(400).json({ message: 'Cannot query slots for past dates.' });
    }

    const doctor = await Doctor.findById(doctorId);
    if (!doctor || doctor.status !== 'approved') {
      return res.status(404).json({ message: 'Doctor not found or not active.' });
    }

    // Check for date override (day off or custom hours)
    const override = await DoctorDateOverride.findOne({ doctorId, date });
    if (override && override.isOffDay) {
      return res.json({ success: true, slots: [], isOffDay: true, reason: override.reason || 'Doctor is on leave on this date' });
    }

    let allSlots = [];
    const schedule = await DoctorSchedule.findOne({ doctorId });
    const slotDuration = schedule?.slotDurationMinutes || 30;

    if (override && !override.isOffDay) {
      // Use override session hours
      const s1Start = override.session1Start || '09:00 AM';
      const s1End = override.session1End || '01:00 PM';
      allSlots = generateSlots(s1Start, s1End, slotDuration);

      if (override.hasSecondSession && override.session2Start && override.session2End) {
        allSlots = allSlots.concat(generateSlots(override.session2Start, override.session2End, slotDuration));
      }
    } else {
      const dayName = getDayName(date);

      if (!schedule || !schedule.weeklySchedule || schedule.weeklySchedule.length === 0) {
        // Fallback default: Mon-Fri working days if schedule is not explicitly saved yet
        if (['Saturday', 'Sunday'].includes(dayName)) {
          return res.json({ success: true, slots: [], isOffDay: true });
        }
        allSlots = generateSlots('09:00 AM', '01:00 PM', 30).concat(generateSlots('04:00 PM', '07:00 PM', 30));
      } else {
        const dayData = schedule.weeklySchedule.find(d => (d.dayOfWeek || d.day) === dayName);
        const isWorking = dayData ? (dayData.isWorkingDay ?? dayData.isActive ?? true) : (!['Saturday', 'Sunday'].includes(dayName));

        if (!isWorking) {
          return res.json({ success: true, slots: [], isOffDay: true });
        }

        const s1Start = dayData?.session1Start || dayData?.startTime || '09:00 AM';
        const s1End = dayData?.session1End || dayData?.endTime || '01:00 PM';
        allSlots = generateSlots(s1Start, s1End, slotDuration);

        const hasS2 = dayData?.hasSecondSession ?? true;
        if (hasS2) {
          const s2Start = dayData?.session2Start || '04:00 PM';
          const s2End = dayData?.session2End || '07:00 PM';
          allSlots = allSlots.concat(generateSlots(s2Start, s2End, slotDuration));
        }
      }
    }

    // Filter out past slots for today's date
    if (date === todayStr) {
      allSlots = allSlots.filter(s => parseTimeToMinutes(s.start) > nowMinutes);
    }

    // Remove already booked slots (Only Confirmed or recent Pending Payment < 15 mins)
    const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
    const booked = await Appointment.find({
      doctorId,
      appointmentDate: date,
      $or: [
        { status: 'Confirmed' },
        { status: 'Pending Payment', createdAt: { $gte: fifteenMinsAgo } }
      ]
    }).select('startTime');

    const bookedTimes = new Set(booked.map(b => b.startTime));
    const availableSlots = allSlots.filter(s => !bookedTimes.has(s.start));

    res.json({ success: true, date, slots: availableSlots, totalAvailable: availableSlots.length });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching slots.', error: err.message });
  }
};

// ─── POST /api/booking/book ─────────────────────────────────────────────────
// Patient books appointment → creates Razorpay order
const bookAppointment = async (req, res) => {
  try {
    let { doctorId, appointmentDate, startTime, endTime, type, symptoms, parentAppointmentId } = req.body;

    const { todayStr, nowMinutes } = getNowIST();
    const isEmergencySync = type === 'Emergency Sync';

    // Auto-fill immediate date/time for Emergency Sync
    if (isEmergencySync) {
      appointmentDate = todayStr;
      if (!startTime || startTime === 'Immediate Queue') {
        startTime = 'Immediate Queue';
        endTime = 'Immediate Queue';
      }
    }

    if (!doctorId || !appointmentDate || !startTime || !endTime) {
      return res.status(400).json({ message: 'doctorId, appointmentDate, startTime, endTime are required.' });
    }

    if (!isEmergencySync && (appointmentDate < todayStr || (appointmentDate === todayStr && parseTimeToMinutes(startTime) <= nowMinutes))) {
      return res.status(400).json({ message: 'Cannot book appointment slots in the past.' });
    }

    const patient = await Patient.findOne({ userId: req.user._id });
    if (!patient) return res.status(404).json({ message: 'Patient profile not found.' });

    const doctor = await Doctor.findById(doctorId);
    if (!doctor || doctor.status !== 'approved') {
      return res.status(404).json({ message: 'Doctor not found or not active.' });
    }

    // Validate Follow-up eligibility & link parent appointment
    let linkedParentAppt = null;
    const isFollowUp = type === 'Follow-up';

    if (isFollowUp) {
      if (parentAppointmentId) {
        linkedParentAppt = await Appointment.findOne({
          _id: parentAppointmentId,
          patientId: patient._id,
          doctorId: doctor._id,
          status: 'Completed'
        });

        if (!linkedParentAppt) {
          const anyParent = await Appointment.findOne({ _id: parentAppointmentId, patientId: patient._id });
          if (!anyParent) {
            return res.status(404).json({ message: 'Prior consultation record not found or does not belong to your account.' });
          }
          if (anyParent.doctorId.toString() !== doctor._id.toString()) {
            return res.status(400).json({ message: 'Follow-up consultations must be booked with the same doctor from your previous visit.' });
          }
          if (anyParent.status !== 'Completed') {
            return res.status(400).json({ message: 'A follow-up can only be booked for a completed consultation.' });
          }
        }
      } else {
        // Automatically find the latest completed consultation with this doctor
        linkedParentAppt = await Appointment.findOne({
          patientId: patient._id,
          doctorId: doctor._id,
          status: 'Completed'
        }).sort({ appointmentDate: -1, createdAt: -1 });

        if (!linkedParentAppt) {
          return res.status(400).json({
            message: `Follow-up consultations are only available for returning patients with a previously completed visit with Dr. ${doctor.firstName} ${doctor.lastName}. Please book a General Consultation.`
          });
        }
      }

      if (linkedParentAppt && linkedParentAppt.hasFollowUpBooked) {
        return res.status(400).json({ message: 'A follow-up consultation has already been scheduled for this previous visit.' });
      }
    }

    const doctorSchedule = await DoctorSchedule.findOne({ doctorId });

    // Check slot availability and leave status for routine bookings
    if (!isEmergencySync) {
      // 1. Doctor Leave / Day-Off Guard: Ensure doctor has not marked leave on this date
      const dateOverride = await DoctorDateOverride.findOne({ doctorId, date: appointmentDate });
      if (dateOverride && dateOverride.isOffDay) {
        return res.status(409).json({
          message: `The doctor is on leave on ${appointmentDate} (${dateOverride.reason || 'Unavailable'}). Please choose another date.`
        });
      }

      // 2. Weekly Working Day Check: Ensure the day is an active consulting day
      const dayName = getDayName(appointmentDate);
      if (doctorSchedule && doctorSchedule.weeklySchedule && doctorSchedule.weeklySchedule.length > 0) {
        const dayData = doctorSchedule.weeklySchedule.find(d => (d.dayOfWeek || d.day) === dayName);
        const isWorking = dayData ? (dayData.isWorkingDay ?? dayData.isActive ?? true) : (!['Saturday', 'Sunday'].includes(dayName));
        if (!isWorking && (!dateOverride || dateOverride.isOffDay)) {
          return res.status(409).json({
            message: `Dr. ${doctor.firstName} ${doctor.lastName} does not consult on ${dayName}s. Please choose another date.`
          });
        }
      }

      const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);

      // 3. Doctor Slot Availability Check: Ensure this doctor is not already booked at this slot
      const conflictingDoctor = await Appointment.findOne({
        doctorId,
        appointmentDate,
        startTime,
        $or: [
          { status: 'Confirmed' },
          { status: 'Pending Payment', createdAt: { $gte: fifteenMinsAgo } }
        ]
      });
      if (conflictingDoctor) {
        return res.status(409).json({ message: 'This slot is already booked for this doctor. Please choose another.' });
      }

      // 4. Patient Schedule Conflict Guard: Ensure the patient does not already have an active appointment at this exact date & time
      const conflictingPatient = await Appointment.findOne({
        patientId: patient._id,
        appointmentDate,
        startTime,
        $or: [
          { status: 'Confirmed' },
          { status: 'Pending Payment', createdAt: { $gte: fifteenMinsAgo } }
        ]
      }).populate('doctorId', 'firstName lastName specialization');

      if (conflictingPatient) {
        const docName = conflictingPatient.doctorId
          ? `Dr. ${conflictingPatient.doctorId.firstName} ${conflictingPatient.doctorId.lastName}`
          : 'another doctor';
        return res.status(409).json({
          message: `Schedule Conflict: You already have a consultation booked at ${startTime} on ${appointmentDate} with ${docName}. Please select a different time slot.`
        });
      }
    }

    const baseFee = doctorSchedule?.consultationFee || doctor.consultationFee || 500;
    
    // Fee Calculation: 50% discount for Follow-up, +10% for Emergency Sync
    let fee = baseFee;
    let discountAmount = 0;
    if (isEmergencySync) {
      fee = Math.round(baseFee * 1.1); // Emergency priority fee (+10%)
    } else if (isFollowUp) {
      discountAmount = Math.round(baseFee * 0.5); // 50% Follow-up Concession
      fee = baseFee - discountAmount;
    }

    // 💰 Option 1 Revenue Split: 80% Doctor Share, 20% Admin Platform Share
    const doctorShare = Math.round(fee * 0.80);
    const platformShare = fee - doctorShare;

    const orderPayload = {
      amount: fee * 100, // Total amount in paise
      currency: 'INR',
      receipt: `rcpt_${Date.now()}`,
      notes: {
        doctorName: `Dr. ${doctor.firstName} ${doctor.lastName}`,
        patientId: patient._id.toString(),
        appointmentDate,
        startTime,
        type: type || 'General Consultation',
        isFollowUp: isFollowUp ? 'true' : 'false',
        discountApplied: discountAmount > 0 ? `₹${discountAmount} (50% Off)` : 'none'
      }
    };

    // 🚀 Razorpay Route Automated Split Transfer (if doctor has linked account)
    if (doctor.razorpayAccountId) {
      orderPayload.transfers = [
        {
          account: doctor.razorpayAccountId,
          amount: doctorShare * 100, // 80% in paise transferred to doctor
          currency: 'INR',
          on_hold: 0,                // Auto-settle immediately when payment is captured
          notes: {
            doctorName: `Dr. ${doctor.firstName} ${doctor.lastName}`,
            appointmentDate,
            type: type || 'General Consultation'
          }
        }
      ];
    }

    // Create Razorpay order
    const razorpayOrder = await getRazorpay().orders.create(orderPayload);

    const attachedReportIds = Array.isArray(req.body.attachedReportIds) ? req.body.attachedReportIds : [];

    // Create appointment in Pending Payment status
    const appointment = await Appointment.create({
      patientId: patient._id,
      doctorId: doctor._id,
      appointmentDate,
      startTime,
      endTime,
      type: type || 'General Consultation',
      symptoms: symptoms || '',
      status: 'Pending Payment',
      amount: fee,
      currency: 'INR',
      razorpayOrderId: razorpayOrder.id,
      isEmergency: isEmergencySync,
      emergencyStatus: isEmergencySync ? 'Pending' : 'None',
      parentAppointmentId: linkedParentAppt ? linkedParentAppt._id : null,
      patientConditionStatus: req.body.patientConditionStatus || null,
      discountAmount,
      originalAmount: baseFee,
      attachedReportIds
    });

    // Link reports to this consultation and share with doctor
    if (attachedReportIds.length > 0) {
      await MedicalReport.updateMany(
        { _id: { $in: attachedReportIds } },
        {
          $addToSet: {
            linkedConsultationIds: appointment._id,
            sharedWithDoctorIds: doctor._id
          }
        }
      );
    }

    // Create Payment record with 80/20 revenue audit
    await Payment.create({
      appointmentId: appointment._id,
      patientId: patient._id,
      doctorId: doctor._id,
      razorpayOrderId: razorpayOrder.id,
      amount: fee,
      currency: 'INR',
      platformFeePercent: 20,
      platformFee: platformShare,
      doctorEarning: doctorShare,
      transferStatus: doctor.razorpayAccountId ? 'Pending' : 'Not Applicable',
      status: 'Pending'
    });

    res.status(201).json({
      success: true,
      appointmentId: appointment._id,
      razorpayOrderId: razorpayOrder.id,
      amount: fee,
      currency: 'INR',
      keyId: process.env.RAZORPAY_KEY_ID,
      doctorName: `Dr. ${doctor.firstName} ${doctor.lastName}`,
      appointmentDate,
      startTime,
      endTime
    });
  } catch (err) {
    console.error('Booking error:', err);
    res.status(500).json({ message: 'Error creating booking.', error: err.message });
  }
};

// ─── POST /api/booking/verify-payment ──────────────────────────────────────
const verifyPayment = async (req, res) => {
  try {
    const { appointmentId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

    // Verify signature
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    if (expectedSignature !== razorpaySignature) {
      return res.status(400).json({ message: 'Payment verification failed. Invalid signature.' });
    }

    const existingAppt = await Appointment.findById(appointmentId).populate('patientId').populate('doctorId');
    if (!existingAppt) return res.status(404).json({ message: 'Appointment not found.' });

    // Check if doctor marked this date as leave while patient was completing payment checkout
    const leaveOverride = await DoctorDateOverride.findOne({
      doctorId: existingAppt.doctorId?._id || existingAppt.doctorId,
      date: existingAppt.appointmentDate,
      isOffDay: true
    });

    if (existingAppt.status === 'Cancelled' || leaveOverride) {
      let refundId = null;
      try {
        const refund = await getRazorpay().payments.refund(razorpayPaymentId, {
          amount: Math.round((existingAppt.amount || 0) * 100)
        });
        refundId = refund.id;
      } catch (refundErr) {
        if (process.env.RAZORPAY_KEY_ID?.startsWith('rzp_test')) {
          refundId = 'rfnd_test_' + crypto.randomBytes(6).toString('hex');
        }
      }

      existingAppt.status = 'Cancelled';
      existingAppt.paymentStatus = 'Refunded';
      existingAppt.razorpayPaymentId = razorpayPaymentId;
      existingAppt.refundId = refundId;
      existingAppt.cancelledAt = new Date();
      existingAppt.cancellationReason = `Doctor on leave (${leaveOverride?.reason || 'Leave Override'})`;
      await existingAppt.save();

      await Payment.findOneAndUpdate(
        { razorpayOrderId },
        {
          razorpayPaymentId,
          razorpaySignature,
          status: 'Refunded',
          refundAmount: existingAppt.amount || 0,
          refundPercentage: 100,
          razorpayRefundId: refundId,
          refundStatus: 'Processed',
          refundInitiatedAt: new Date()
        }
      );

      return res.status(409).json({
        success: false,
        conflict: true,
        message: 'The doctor marked this date as leave while checkout was completing. Your payment has been automatically refunded 100% in full.',
        refundId
      });
    }

    // Update appointment
    const appointment = await Appointment.findByIdAndUpdate(
      appointmentId,
      {
        status: 'Confirmed',
        razorpayPaymentId,
        paymentStatus: 'Paid',
        paidAt: new Date()
      },
      { new: true }
    ).populate('patientId').populate('doctorId');

    // Update payment record
    const hasLinkedAccount = !!(appointment.doctorId?.razorpayAccountId);
    await Payment.findOneAndUpdate(
      { razorpayOrderId },
      {
        razorpayPaymentId,
        razorpaySignature,
        status: 'Paid',
        paidAt: new Date(),
        transferStatus: hasLinkedAccount ? 'Transferred' : 'Not Applicable'
      }
    );

    // If this was a follow-up appointment, mark the parent appointment as having scheduled its follow-up
    if (appointment.parentAppointmentId) {
      await Appointment.findByIdAndUpdate(appointment.parentAppointmentId, {
        hasFollowUpBooked: true
      });
    }

    // 🚨 Emit Live Socket.io Emergency Alert to Doctor if Emergency Sync
    if (appointment.type === 'Emergency Sync' || appointment.isEmergency) {
      try {
        const { getIO } = require('../config/socket');
        const io = getIO();
        const docId = appointment.doctorId?._id?.toString() || appointment.doctorId?.toString();
        const patientName = appointment.patientId ? `${appointment.patientId.firstName || ''} ${appointment.patientId.lastName || ''}`.trim() || 'Patient' : 'Patient';

        io.to(`doctor_${docId}`).emit('emergency-alert', {
          appointmentId: appointment._id.toString(),
          patientName,
          symptomSummary: appointment.symptoms || 'Emergency Triage Request',
          timestamp: new Date()
        });
        console.log(`[Socket.io] 🚨 Live Emergency Alert sent to doctor_${docId} for ${patientName}`);
      } catch (socketErr) {
        console.warn('[Socket.io] Could not emit socket alert (non-fatal):', socketErr.message);
      }
    }

    // Send Receipt Email to Patient
    try {
      const patientDoc = appointment.patientId;
      const doctorDoc = appointment.doctorId;

      let patientEmail = '';
      if (patientDoc?.userId) {
        const userAccount = await User.findById(patientDoc.userId);
        patientEmail = userAccount?.email || '';
      }

      if (patientEmail) {
        const patientFullName = `${patientDoc?.firstName || 'Patient'} ${patientDoc?.lastName || ''}`.trim();
        const doctorFullName = `Dr. ${doctorDoc?.firstName || 'Doctor'} ${doctorDoc?.lastName || ''}`.trim();

        await sendAppointmentReceiptEmail({
          patientEmail,
          patientName: patientFullName,
          doctorName: doctorFullName,
          specialization: doctorDoc?.specialization || 'General Physician',
          appointmentDate: appointment.appointmentDate,
          startTime: appointment.startTime,
          endTime: appointment.endTime,
          consultationType: appointment.type || 'General Consultation',
          clinicAddress: doctorDoc?.clinicAddress || '',
          paymentId: razorpayPaymentId,
          bookingRef: `CP-${appointment._id.toString().slice(-6).toUpperCase()}`,
          amountPaid: appointment.amount || 500,
          paidAt: appointment.paidAt
        });
      }
    } catch (emailErr) {
      console.error('[BOOKING] Error sending appointment receipt email:', emailErr);
      // Non-blocking: continue responding to user even if email dispatch fails
    }

    res.json({ success: true, message: 'Payment verified. Appointment confirmed!', appointment });
  } catch (err) {
    res.status(500).json({ message: 'Error verifying payment.', error: err.message });
  }
};

// ─── GET /api/booking/my-appointments ──────────────────────────────────────
const getPatientAppointments = async (req, res) => {
  try {
    const patient = await Patient.findOne({ userId: req.user._id });
    if (!patient) return res.status(404).json({ message: 'Patient profile not found.' });

    const appointments = await Appointment.find({ patientId: patient._id })
      .populate('doctorId', 'firstName lastName specialization clinicAddress consultationFee')
      .populate({
        path: 'parentAppointmentId',
        select: 'appointmentDate startTime type symptoms prescription clinicalNotes followUpRecommendation patientConditionStatus'
      })
      .sort({ appointmentDate: -1, startTime: -1 });

    res.json({ success: true, count: appointments.length, appointments });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching appointments.', error: err.message });
  }
};

// ─── GET /api/booking/doctor-appointments ──────────────────────────────────
const getDoctorAppointments = async (req, res) => {
  try {
    const doctor = await Doctor.findOne({ userId: req.user._id });
    if (!doctor) return res.status(404).json({ message: 'Doctor profile not found.' });

    const { todayStr: today } = getNowIST();
    const appointments = await Appointment.find({
      doctorId: doctor._id,
      status: { $in: ['Confirmed', 'Completed'] }
    })
      .populate('patientId', 'firstName lastName dateOfBirth gender phone email bloodGroup profileImage')
      .populate({
        path: 'parentAppointmentId',
        select: 'appointmentDate startTime type symptoms prescription clinicalNotes followUpRecommendation patientConditionStatus exercisePrescription'
      })
      .sort({ appointmentDate: 1, startTime: 1 });

    const todayAppts = appointments.filter(a => a.appointmentDate === today && a.status === 'Confirmed');
    const upcoming = appointments.filter(a => a.appointmentDate > today && a.status === 'Confirmed');
    const past = appointments.filter(a => a.appointmentDate < today || a.status === 'Completed');

    res.json({ success: true, today: todayAppts, upcoming, past, all: appointments });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching doctor appointments.', error: err.message });
  }
};

// ─── POST /api/booking/:id/cancel ──────────────────────────────────────────
const cancelAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const patient = await Patient.findOne({ userId: req.user._id });
    if (!patient) return res.status(404).json({ message: 'Patient profile not found.' });

    const appointment = await Appointment.findOne({ _id: id, patientId: patient._id });
    if (!appointment) return res.status(404).json({ message: 'Appointment not found.' });

    if (!['Confirmed', 'Pending Payment'].includes(appointment.status)) {
      return res.status(400).json({ message: 'Only confirmed appointments can be cancelled.' });
    }

    // Calculate refund based on time before appointment
    const appointmentDateTime = new Date(`${appointment.appointmentDate}T${convertTo24h(appointment.startTime)}`);
    const now = new Date();
    const hoursUntil = (appointmentDateTime - now) / (1000 * 60 * 60);

    let refundPercentage = 0;
    let refundAmount = 0;

    if (hoursUntil > 12) {
      refundPercentage = 100;
      refundAmount = appointment.amount;
    } else if (hoursUntil >= 6) {
      refundPercentage = 50;
      refundAmount = Math.floor(appointment.amount * 0.5);
    } else {
      refundPercentage = 0;
      refundAmount = 0;
    }

    let razorpayRefundId = null;

    // Initiate Razorpay refund if payment was made and refund amount > 0
    if (appointment.paymentStatus === 'Paid' && appointment.razorpayPaymentId && refundAmount > 0) {
      try {
        const refund = await getRazorpay().payments.refund(appointment.razorpayPaymentId, {
          amount: Math.round(refundAmount * 100) // in paise
        });
        razorpayRefundId = refund.id;
      } catch (refundErr) {
        const errDesc = refundErr.error?.description || refundErr.description || refundErr.message || 'Refund error';
        console.error(`Razorpay refund error for appointment ${id}:`, errDesc);

        // In Razorpay Test Mode, if account has 0 refund credits, generate simulated test refund ID
        if (process.env.RAZORPAY_KEY_ID?.startsWith('rzp_test')) {
          razorpayRefundId = 'rfnd_test_' + crypto.randomBytes(6).toString('hex');
          console.log(`[Razorpay Test Mode] Generated simulated refund ID: ${razorpayRefundId}`);
        }
      }
    }

    // Update appointment
    await Appointment.findByIdAndUpdate(id, {
      status: 'Cancelled',
      paymentStatus: refundAmount > 0 ? (refundPercentage === 100 ? 'Refunded' : 'Partially Refunded') : appointment.paymentStatus,
      cancelledAt: new Date(),
      cancellationReason: reason || 'Cancelled by patient',
      refundId: razorpayRefundId
    });

    // Update payment record
    if (refundAmount > 0) {
      await Payment.findOneAndUpdate(
        { appointmentId: id },
        {
          status: refundPercentage === 100 ? 'Refunded' : 'Partially Refunded',
          refundAmount,
          refundPercentage,
          razorpayRefundId,
          refundInitiatedAt: new Date(),
          refundStatus: razorpayRefundId ? 'Initiated' : 'Failed'
        }
      );
    }

    const estimatedRefundDate = new Date();
    estimatedRefundDate.setDate(estimatedRefundDate.getDate() + 7);

    res.json({
      success: true,
      message: 'Appointment cancelled successfully.',
      refundPercentage,
      refundAmount,
      estimatedRefundDate: refundAmount > 0 ? estimatedRefundDate.toDateString() : null,
      policy: refundPercentage === 100
        ? 'Full refund of ₹' + refundAmount + ' will be credited within 5–7 business days.'
        : refundPercentage === 50
        ? '50% refund of ₹' + refundAmount + ' will be credited within 5–7 business days.'
        : 'No refund applicable (cancelled less than 6 hours before appointment).'
    });
  } catch (err) {
    res.status(500).json({ message: 'Error cancelling appointment.', error: err.message });
  }
};

// Helper: convert "09:00 AM" to "09:00" 24h
function convertTo24h(timeStr) {
  const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return '00:00';
  let h = parseInt(match[1]);
  const m = match[2];
  const mod = match[3].toUpperCase();
  if (mod === 'PM' && h < 12) h += 12;
  if (mod === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${m}`;
}

// ─── POST /api/booking/:id/retry-payment ──────────────────────────────────
const retryPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const patient = await Patient.findOne({ userId: req.user._id });
    if (!patient) return res.status(404).json({ message: 'Patient profile not found.' });

    const appointment = await Appointment.findOne({ _id: id, patientId: patient._id })
      .populate('doctorId', 'firstName lastName consultationFee');

    if (!appointment) return res.status(404).json({ message: 'Appointment not found.' });

    if (appointment.status !== 'Pending Payment') {
      return res.status(400).json({ message: 'Only appointments in Pending Payment status can be paid.' });
    }

    const doctor = appointment.doctorId;
    const fee = appointment.amount || doctor?.consultationFee || 500;
    const doctorName = doctor ? `Dr. ${doctor.firstName} ${doctor.lastName}` : 'Doctor';

    // Always create a fresh Razorpay order matching the current active key
    const razorpayOrder = await getRazorpay().orders.create({
      amount: fee * 100,
      currency: 'INR',
      receipt: `rcpt_retry_${Date.now()}`,
      notes: {
        doctorName,
        patientId: patient._id.toString(),
        appointmentDate: appointment.appointmentDate,
        startTime: appointment.startTime
      }
    });
    const razorpayOrderId = razorpayOrder.id;
    appointment.razorpayOrderId = razorpayOrderId;
    await appointment.save();

    res.json({
      success: true,
      appointmentId: appointment._id,
      razorpayOrderId,
      amount: fee,
      currency: 'INR',
      keyId: process.env.RAZORPAY_KEY_ID,
      doctorName,
      appointmentDate: appointment.appointmentDate,
      startTime: appointment.startTime,
      endTime: appointment.endTime
    });
  } catch (err) {
    console.error('Retry payment error:', err);
    res.status(500).json({ message: 'Error re-initiating payment.', error: err.message });
  }
};

// POST /api/booking/:id/prescription
const addPrescription = async (req, res) => {
  try {
    const { id } = req.params;
    const { prescription } = req.body; // Array of { medicineName, composition, dosage, duration, instructions }

    if (!prescription || !Array.isArray(prescription) || prescription.length === 0) {
      return res.status(400).json({ message: 'Prescription array cannot be empty.' });
    }

    const appointment = await Appointment.findById(id)
      .populate({ path: 'patientId', populate: { path: 'userId' } })
      .populate({ path: 'doctorId', populate: { path: 'userId' } });

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found.' });
    }

    appointment.prescription = prescription;
    appointment.prescribedAt = new Date();
    await appointment.save();

    // Decoupled collection sync: Upsert into Prescription collection
    await Prescription.findOneAndUpdate(
      { appointmentId: appointment._id },
      {
        appointmentId: appointment._id,
        patientId: appointment.patientId?._id || appointment.patientId,
        doctorId: appointment.doctorId?._id || appointment.doctorId,
        medicines: prescription,
        prescribedAt: appointment.prescribedAt
      },
      { upsert: true, new: true }
    );

    // Trigger email to patient
    let patientEmail = '';
    let patientName = 'Patient';

    if (appointment.patientId) {
      patientName = `${appointment.patientId.firstName || ''} ${appointment.patientId.lastName || ''}`.trim() || 'Patient';
      if (appointment.patientId.userId && appointment.patientId.userId.email) {
        patientEmail = appointment.patientId.userId.email;
      } else if (appointment.patientId.userId) {
        const userDoc = await User.findById(appointment.patientId.userId);
        if (userDoc) patientEmail = userDoc.email;
      }
    }

    let doctorName = 'Doctor';
    let specialty = 'General Practice';
    if (appointment.doctorId) {
      const docFirst = appointment.doctorId.firstName || appointment.doctorId.userId?.firstName || '';
      const docLast = appointment.doctorId.lastName || appointment.doctorId.userId?.lastName || '';
      doctorName = `Dr. ${docFirst} ${docLast}`.trim();
      specialty = appointment.doctorId.specialization || 'General Practice';
    }

    if (patientEmail) {
      console.log(`[E-PRESCRIPTION] Sending email to patient: ${patientEmail}...`);
      sendPrescriptionEmail(
        patientEmail, 
        patientName, 
        doctorName, 
        specialty, 
        prescription, 
        appointment.appointmentDate, 
        appointment.clinicalNotes, 
        appointment.followUpRecommendation,
        appointment.exercisePrescription || []
      );
    } else {
      console.warn('[E-PRESCRIPTION] Could not find patient email to send prescription.');
    }

    res.json({
      success: true,
      message: 'Prescription saved and emailed to patient successfully.',
      prescription: appointment.prescription,
      prescribedAt: appointment.prescribedAt
    });
  } catch (err) {
    console.error('Add prescription error:', err);
    res.status(500).json({ message: 'Failed to save prescription.', error: err.message });
  }
};

// ─── POST /api/booking/:id/clinical-notes ──────────────────────────────────
const saveClinicalNotes = async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      doctorRemarks, 
      nutritionalTags, 
      recommendedFoods, 
      foodsToAvoid, 
      hydrationGoalLiters,
      followUpRecommendation,
      exercisePrescription 
    } = req.body;

    const doctor = await Doctor.findOne({ userId: req.user._id });
    if (!doctor) return res.status(404).json({ message: 'Doctor profile not found.' });

    const appointment = await Appointment.findOne({ _id: id, doctorId: doctor._id })
      .populate({
        path: 'patientId',
        populate: { path: 'userId', select: 'email' }
      })
      .populate({
        path: 'doctorId',
        populate: { path: 'userId', select: 'firstName lastName' }
      });

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found or unauthorized.' });
    }

    appointment.clinicalNotes = {
      doctorRemarks: doctorRemarks || '',
      nutritionalTags: nutritionalTags || [],
      recommendedFoods: recommendedFoods || '',
      foodsToAvoid: foodsToAvoid || '',
      hydrationGoalLiters: hydrationGoalLiters || 3,
      savedAt: new Date()
    };

    if (Array.isArray(exercisePrescription)) {
      appointment.exercisePrescription = exercisePrescription;
    }

    // Process Follow-Up Recommendation if provided
    if (followUpRecommendation && typeof followUpRecommendation === 'object') {
      const isRec = Boolean(followUpRecommendation.isRecommended);
      let recDays = parseInt(followUpRecommendation.recommendedAfterDays, 10) || 7;
      let recDate = followUpRecommendation.recommendedDate;
      let validUntil = followUpRecommendation.validUntil;

      if (isRec && !recDate && appointment.appointmentDate) {
        // Calculate recommended date as appointmentDate + recDays
        const [y, m, d] = appointment.appointmentDate.split('-').map(Number);
        const base = new Date(y, m - 1, d);
        base.setDate(base.getDate() + recDays);
        const by = base.getFullYear();
        const bm = String(base.getMonth() + 1).padStart(2, '0');
        const bd = String(base.getDate()).padStart(2, '0');
        recDate = `${by}-${bm}-${bd}`;
      }

      if (isRec && !validUntil && recDate) {
        // 7 days grace window after recommended date
        const [ry, rm, rd] = recDate.split('-').map(Number);
        const grace = new Date(ry, rm - 1, rd);
        grace.setDate(grace.getDate() + 7);
        const gy = grace.getFullYear();
        const gm = String(grace.getMonth() + 1).padStart(2, '0');
        const gd = String(grace.getDate()).padStart(2, '0');
        validUntil = `${gy}-${gm}-${gd}`;
      }

      appointment.followUpRecommendation = {
        isRecommended: isRec,
        recommendedAfterDays: recDays,
        recommendedDate: isRec ? recDate : null,
        validUntil: isRec ? validUntil : null,
        clinicalInstructions: followUpRecommendation.clinicalInstructions || ''
      };
    }

    await appointment.save();

    // Decoupled collection sync: Upsert into CarePlan collection
    await CarePlan.findOneAndUpdate(
      { appointmentId: appointment._id },
      {
        appointmentId: appointment._id,
        patientId: appointment.patientId?._id || appointment.patientId,
        doctorId: appointment.doctorId?._id || appointment.doctorId,
        doctorRemarks: doctorRemarks || '',
        nutritionalTags: nutritionalTags || [],
        recommendedFoods: recommendedFoods || '',
        foodsToAvoid: foodsToAvoid || '',
        hydrationGoalLiters: hydrationGoalLiters || 3,
        savedAt: appointment.clinicalNotes.savedAt
      },
      { upsert: true, new: true }
    );

    // Trigger email send to patient with remarks & dietary advice
    let patientEmail = '';
    let patientName = 'Patient';
    if (appointment.patientId) {
      patientName = `${appointment.patientId.firstName || ''} ${appointment.patientId.lastName || ''}`.trim() || 'Patient';
      if (appointment.patientId.userId && appointment.patientId.userId.email) {
        patientEmail = appointment.patientId.userId.email;
      }
    }

    let doctorName = 'Doctor';
    let specialty = 'General Practice';
    if (appointment.doctorId) {
      const docFirst = appointment.doctorId.firstName || appointment.doctorId.userId?.firstName || '';
      const docLast = appointment.doctorId.lastName || appointment.doctorId.userId?.lastName || '';
      doctorName = `Dr. ${docFirst} ${docLast}`.trim();
      specialty = appointment.doctorId.specialization || 'General Practice';
    }

    if (patientEmail) {
      console.log(`[CLINICAL-NOTES] Sending updated email to patient: ${patientEmail}...`);
      sendPrescriptionEmail(
        patientEmail,
        patientName,
        doctorName,
        specialty,
        appointment.prescription || [],
        appointment.appointmentDate,
        appointment.clinicalNotes,
        appointment.followUpRecommendation,
        appointment.exercisePrescription || []
      );
    }

    res.json({
      success: true,
      message: 'Clinical remarks, dietary advice and follow-up plan saved and emailed to patient.',
      clinicalNotes: appointment.clinicalNotes,
      followUpRecommendation: appointment.followUpRecommendation
    });
  } catch (err) {
    console.error('Save clinical notes error:', err);
    res.status(500).json({ message: 'Failed to save clinical notes.', error: err.message });
  }
};

// ─── GET /api/booking/:id/clinical-notes ───────────────────────────────────
const getClinicalNotes = async (req, res) => {
  try {
    const { id } = req.params;
    const appointment = await Appointment.findById(id);
    if (!appointment) return res.status(404).json({ message: 'Appointment not found.' });

    res.json({
      success: true,
      clinicalNotes: appointment.clinicalNotes || {}
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch clinical notes.', error: err.message });
  }
};

// ─── POST /api/booking/:id/exercise-prescription ───────────────────────────
const saveExercisePrescription = async (req, res) => {
  try {
    const { id } = req.params;
    const { exercises } = req.body;
    const doctor = await Doctor.findOne({ userId: req.user._id });
    if (!doctor) return res.status(404).json({ message: 'Doctor profile not found.' });

    const appointment = await Appointment.findOne({ _id: id, doctorId: doctor._id });
    if (!appointment) return res.status(404).json({ message: 'Appointment not found.' });

    appointment.exercisePrescription = Array.isArray(exercises) ? exercises : [];
    await appointment.save();

    res.json({
      success: true,
      message: 'Physical rehabilitation exercise prescription saved successfully.',
      exercises: appointment.exercisePrescription
    });
  } catch (err) {
    console.error('Error saving exercise prescription:', err);
    res.status(500).json({ message: 'Failed to save exercise prescription.', error: err.message });
  }
};

// ─── GET /api/booking/my-exercises ─────────────────────────────────────────
const getPatientExercises = async (req, res) => {
  try {
    const patient = await Patient.findOne({ userId: req.user._id });
    if (!patient) return res.status(404).json({ message: 'Patient profile not found.' });

    // Find appointments that have exercise prescriptions, sorted by newest update/creation
    const appointments = await Appointment.find({
      patientId: patient._id,
      'exercisePrescription.0': { $exists: true }
    })
    .populate('doctorId', 'firstName lastName specialization')
    .sort({ updatedAt: -1, createdAt: -1, appointmentDate: -1 });

    const activeExercises = [];
    appointments.forEach(appt => {
      if (Array.isArray(appt.exercisePrescription)) {
        appt.exercisePrescription.forEach(ex => {
          const item = ex.toObject ? ex.toObject() : ex;
          // Deduplicate so latest prescribed parameters take precedence
          const alreadyExists = activeExercises.some(existing => 
            (existing.exerciseId && existing.exerciseId === item.exerciseId) ||
            (existing.name && existing.name.toLowerCase() === (item.name || '').toLowerCase())
          );
          if (!alreadyExists) {
            activeExercises.push({
              ...item,
              appointmentId: appt._id,
              appointmentDate: appt.appointmentDate,
              doctorName: appt.doctorId ? `Dr. ${appt.doctorId.firstName} ${appt.doctorId.lastName}` : 'Physician',
              doctorSpecialization: appt.doctorId?.specialization || 'Clinical Doctor'
            });
          }
        });
      }
    });

    res.json({
      success: true,
      exercises: activeExercises
    });
  } catch (err) {
    console.error('Error fetching patient exercises:', err);
    res.status(500).json({ message: 'Failed to fetch exercise prescriptions.', error: err.message });
  }
};

// ─── POST /api/booking/exercise-emergency ──────────────────────────────────
const triggerExerciseEmergency = async (req, res) => {
  try {
    const { exerciseName, triggerReason, reason, appointmentId, doctorId: reqDocId, location, latitude, longitude, accuracy } = req.body;
    const finalReason = triggerReason || reason || 'Unconfirmed Fall / Inactivity detected';
    const patient = await Patient.findOne({ userId: req.user._id });
    const user = await User.findById(req.user._id);

    const patientName = patient ? `${patient.firstName || ''} ${patient.lastName || ''}`.trim() : 'Patient';

    // 1. Resolve Location & Google Maps Link
    let patientAddress = '';
    let mapsUrl = null;

    let hasCoords = false;
    let lat = latitude;
    let lng = longitude;

    if (lat && lng) {
      hasCoords = true;
    } else if (location && typeof location === 'string') {
      const match = location.match(/Lat:\s*([0-9.-]+),\s*Lng:\s*([0-9.-]+)/i);
      if (match) {
        lat = parseFloat(match[1]);
        lng = parseFloat(match[2]);
        hasCoords = true;
      }
    }

    if (hasCoords) {
      mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
      patientAddress = `GPS Coordinates: Lat ${Number(lat).toFixed(5)}, Lng ${Number(lng).toFixed(5)}${accuracy ? ` (~${Math.round(accuracy)}m accuracy)` : ''}`;
      if (patient?.address?.city || patient?.address?.state || patient?.address?.houseName) {
        const fullAddr = [patient.address.houseName, patient.address.city, patient.address.district, patient.address.state, patient.address.pincode].filter(Boolean).join(', ');
        patientAddress += `\n• Registered Home Address: ${fullAddr}`;
      }
    } else if (location && !location.toLowerCase().includes('not provided')) {
      patientAddress = location;
      if (patient?.address?.city || patient?.address?.state || patient?.address?.houseName) {
        const fullAddr = [patient.address.houseName, patient.address.city, patient.address.district, patient.address.state, patient.address.pincode].filter(Boolean).join(', ');
        patientAddress += `\n• Registered Home Address: ${fullAddr}`;
      }
    } else if (patient?.address && (patient.address.city || patient.address.state || patient.address.houseName)) {
      const fullAddr = [patient.address.houseName, patient.address.city, patient.address.district, patient.address.state, patient.address.pincode].filter(Boolean).join(', ');
      patientAddress = `Registered Residential Address: ${fullAddr}`;
    } else {
      patientAddress = 'Home address on patient clinical file';
    }

    // 2. Identify Prescribing / Attending Doctor
    let doctorId = reqDocId || null;
    let doctorEmail = null;
    let doctorName = null;

    if (appointmentId) {
      const appt = await Appointment.findById(appointmentId).populate({
        path: 'doctorId',
        populate: { path: 'userId', select: 'email name' }
      });
      if (appt?.doctorId) {
        doctorId = appt.doctorId._id;
        doctorName = `Dr. ${appt.doctorId.firstName || ''} ${appt.doctorId.lastName || ''}`.trim();
        doctorEmail = appt.doctorId.userId?.email || null;
      }
    }

    // If doctor not resolved yet, search for the patient's latest appointment with an exercise prescription
    if (!doctorEmail && patient) {
      const recentAppt = await Appointment.findOne({
        patientId: patient._id,
        'exercisePrescription.0': { $exists: true }
      })
      .sort({ appointmentDate: -1, createdAt: -1 })
      .populate({
        path: 'doctorId',
        populate: { path: 'userId', select: 'email name' }
      });

      if (recentAppt?.doctorId) {
        doctorId = recentAppt.doctorId._id;
        doctorName = `Dr. ${recentAppt.doctorId.firstName || ''} ${recentAppt.doctorId.lastName || ''}`.trim();
        doctorEmail = recentAppt.doctorId.userId?.email || null;
      }
    }

    console.log(`[EXERCISE EMERGENCY] 🚨 Triggered for ${patientName} (${exerciseName}) - Reason: ${finalReason} | Prescribing Doctor: ${doctorName || 'None'} (${doctorEmail || 'No email'})`);

    const extraDetails = {
      doctorName,
      emergencyContact: patient?.emergencyContact || null,
      mapsUrl,
      patientAddress
    };

    // 3. Send Emergency Alert Email to Patient / Family
    const patientEmail = user?.email;
    if (patientEmail) {
      await sendExerciseEmergencyAlertEmail(
        patientEmail,
        patientName,
        exerciseName,
        finalReason,
        patientAddress,
        new Date(),
        { ...extraDetails, isDoctorAlert: false }
      );
    }

    // 4. Send Emergency Alert Email to Prescribing Doctor
    if (doctorEmail && doctorEmail !== patientEmail) {
      await sendExerciseEmergencyAlertEmail(
        doctorEmail,
        patientName,
        exerciseName,
        finalReason,
        patientAddress,
        new Date(),
        { ...extraDetails, isDoctorAlert: true }
      );
      console.log(`[EXERCISE EMERGENCY] ✉️ Notified doctor via email: ${doctorEmail}`);
    }

    // 5. Broadcast via Socket.IO directly to Doctor's Live Screen
    try {
      const { getIO } = require('../config/socket');
      const io = getIO();
      if (doctorId) {
        io.to(`doctor_${doctorId}`).emit('emergency-alert', {
          appointmentId: appointmentId || null,
          patientName,
          symptomSummary: `🚨 Fall / Unresponsive Medical Event during exercise: ${exerciseName}`,
          location: patientAddress,
          mapsUrl,
          timestamp: new Date()
        });
        console.log(`[EXERCISE EMERGENCY] ⚡ Socket alert dispatched to doctor_${doctorId}`);
      }
    } catch (sockErr) {
      console.warn('[EXERCISE EMERGENCY] Socket alert error:', sockErr.message);
    }

    res.json({
      success: true,
      message: 'Autonomous safety emergency dispatch completed successfully.',
      notifiedDoctor: !!doctorEmail,
      doctorName: doctorName || 'Physician on call',
      location: patientAddress,
      mapsUrl,
      timestamp: new Date()
    });
  } catch (err) {
    console.error('Error triggering exercise emergency:', err);
    res.status(500).json({ message: 'Failed to trigger exercise emergency.', error: err.message });
  }
};

// ─── POST /api/booking/exercise-log ─────────────────────────────────────────
const saveExerciseLog = async (req, res) => {
  try {
    const patient = await Patient.findOne({ userId: req.user._id });
    if (!patient) return res.status(404).json({ message: 'Patient profile not found.' });

    const {
      exerciseId,
      exerciseName,
      category,
      completedReps,
      completedSets,
      targetReps,
      targetSets,
      accuracyScore,
      durationSeconds,
      appointmentId,
      doctorId,
      validReps,
      incompleteReps,
      minJointAngle,
      maxJointAngle,
      rangeOfMotion,
      formErrors,
      compliancePercentage,
      safetyEventsCount
    } = req.body;

    const todayStr = new Date().toISOString().split('T')[0];

    const cSets = Number(completedSets) || 0;
    const tSets = Number(targetSets) || 3;
    const cReps = Number(completedReps) || 0;
    const vReps = validReps !== undefined && !isNaN(Number(validReps)) ? Number(validReps) : cReps;
    const iReps = incompleteReps !== undefined && !isNaN(Number(incompleteReps)) ? Number(incompleteReps) : 0;
    const computedCompliance = compliancePercentage !== undefined
      ? Number(compliancePercentage)
      : (tSets > 0 ? Math.min(100, Math.round((cSets / tSets) * 100)) : 100);

    const log = await ExerciseLog.create({
      patientId: patient._id,
      doctorId: doctorId || null,
      appointmentId: appointmentId || null,
      exerciseId: exerciseId || 'rehab_exercise',
      exerciseName: exerciseName || 'Physical Therapy Movement',
      category: category || 'Physical Rehabilitation',
      completedReps: cReps,
      completedSets: cSets,
      targetReps: Number(targetReps) || 10,
      targetSets: tSets,
      accuracyScore: Number(accuracyScore) || 95,
      durationSeconds: Number(durationSeconds) || 0,
      validReps: vReps,
      incompleteReps: iReps,
      minJointAngle: minJointAngle !== undefined && minJointAngle !== null ? Number(minJointAngle) : null,
      maxJointAngle: maxJointAngle !== undefined && maxJointAngle !== null ? Number(maxJointAngle) : null,
      rangeOfMotion: rangeOfMotion !== undefined && rangeOfMotion !== null ? Number(rangeOfMotion) : null,
      formErrors: Array.isArray(formErrors) ? formErrors : [],
      compliancePercentage: computedCompliance,
      safetyEventsCount: Number(safetyEventsCount) || 0,
      date: todayStr,
      completedAt: new Date()
    });

    console.log(`[EXERCISE LOG] 🏆 Saved log for ${patient.firstName}: ${exerciseName} (${cSets}/${tSets} sets, ${cReps} reps, Quality: ${log.accuracyScore}%)`);

    res.json({
      success: true,
      message: 'Exercise session successfully logged and stored in clinical records.',
      log
    });
  } catch (err) {
    console.error('Error saving exercise log:', err);
    res.status(500).json({ message: 'Failed to record exercise log.', error: err.message });
  }
};

// ─── GET /api/booking/exercise-logs ──────────────────────────────────────────
const getExerciseLogs = async (req, res) => {
  try {
    let patientId;
    if (req.user.role === 'doctor') {
      patientId = req.query.patientId;
      if (!patientId) {
        return res.status(400).json({ message: 'patientId query parameter is required for doctor role.' });
      }
    } else {
      const patient = await Patient.findOne({ userId: req.user._id });
      if (!patient) return res.status(404).json({ message: 'Patient profile not found.' });
      patientId = patient._id;
    }

    const logs = await ExerciseLog.find({ patientId })
      .sort({ completedAt: -1 })
      .limit(50);

    res.json({
      success: true,
      logs
    });
  } catch (err) {
    console.error('Error fetching exercise logs:', err);
    res.status(500).json({ message: 'Failed to fetch exercise logs.', error: err.message });
  }
};

// ─── GET /api/booking/exercise-analytics ─────────────────────────────────────
const getExerciseAnalytics = async (req, res) => {
  try {
    let patientId;
    if (req.user.role === 'doctor') {
      patientId = req.query.patientId;
      if (!patientId) {
        return res.status(400).json({ message: 'patientId query parameter is required for doctor role.' });
      }
    } else {
      const patient = await Patient.findOne({ userId: req.user._id });
      if (!patient) return res.status(404).json({ message: 'Patient profile not found.' });
      patientId = patient._id;
    }

    const logs = await ExerciseLog.find({ patientId })
      .sort({ completedAt: -1 })
      .limit(100);

    if (!logs || logs.length === 0) {
      return res.json({
        success: true,
        summary: {
          totalSessions: 0,
          totalCompletedReps: 0,
          totalValidReps: 0,
          totalIncompleteReps: 0,
          avgAccuracyScore: 0,
          avgCompliancePercentage: 0,
          totalDurationMinutes: 0,
          totalSafetyEvents: 0,
          overallTrend: 'No Activity Yet'
        },
        weeklyCompliance: [],
        perExerciseMetrics: [],
        recentLogs: []
      });
    }

    // Aggregates
    const totalSessions = logs.length;
    let totalCompletedReps = 0;
    let totalValidReps = 0;
    let totalIncompleteReps = 0;
    let sumAccuracy = 0;
    let sumCompliance = 0;
    let sumDurationSec = 0;
    let totalSafetyEvents = 0;

    const exerciseMap = new Map();

    logs.forEach(log => {
      totalCompletedReps += (log.completedReps || 0);
      totalValidReps += (log.validReps !== undefined ? log.validReps : (log.completedReps || 0));
      totalIncompleteReps += (log.incompleteReps || 0);
      sumAccuracy += (log.accuracyScore || 0);
      sumCompliance += (log.compliancePercentage || 100);
      sumDurationSec += (log.durationSeconds || 0);
      totalSafetyEvents += (log.safetyEventsCount || 0);

      const exKey = log.exerciseId || log.exerciseName;
      if (!exerciseMap.has(exKey)) {
        exerciseMap.set(exKey, {
          exerciseId: log.exerciseId,
          exerciseName: log.exerciseName,
          category: log.category,
          sessionsCount: 0,
          completedReps: 0,
          validReps: 0,
          incompleteReps: 0,
          targetReps: log.targetReps || 10,
          targetSets: log.targetSets || 3,
          sumAccuracy: 0,
          sumRom: 0,
          romCount: 0,
          allErrors: [],
          scoresHistory: []
        });
      }

      const item = exerciseMap.get(exKey);
      item.sessionsCount++;
      item.completedReps += (log.completedReps || 0);
      item.validReps += (log.validReps !== undefined ? log.validReps : (log.completedReps || 0));
      item.incompleteReps += (log.incompleteReps || 0);
      item.sumAccuracy += (log.accuracyScore || 0);
      item.scoresHistory.push(log.accuracyScore || 0);
      if (log.rangeOfMotion) {
        item.sumRom += log.rangeOfMotion;
        item.romCount++;
      }
      if (Array.isArray(log.formErrors)) {
        log.formErrors.forEach(err => {
          if (!item.allErrors.includes(err)) item.allErrors.push(err);
        });
      }
    });

    const avgAccuracyScore = Math.round(sumAccuracy / totalSessions);
    const avgCompliancePercentage = Math.round(sumCompliance / totalSessions);
    const totalDurationMinutes = Math.round(sumDurationSec / 60);

    // Trend calculation
    let overallTrend = 'Steady';
    if (logs.length >= 2) {
      const recentThree = logs.slice(0, 3);
      const priorSessions = logs.slice(3, 8);
      const recentAvg = recentThree.reduce((acc, l) => acc + (l.accuracyScore || 0), 0) / recentThree.length;
      if (priorSessions.length > 0) {
        const priorAvg = priorSessions.reduce((acc, l) => acc + (l.accuracyScore || 0), 0) / priorSessions.length;
        if (recentAvg >= priorAvg + 4) overallTrend = 'Improving';
        else if (recentAvg <= priorAvg - 8) overallTrend = 'Needs Attention';
      } else if (recentAvg >= 85) {
        overallTrend = 'Improving';
      }
    }

    const perExerciseMetrics = Array.from(exerciseMap.values()).map(ex => {
      const avgAcc = Math.round(ex.sumAccuracy / ex.sessionsCount);
      const avgRom = ex.romCount > 0 ? Math.round(ex.sumRom / ex.romCount) : null;
      let trend = 'Steady';
      if (ex.scoresHistory.length >= 2) {
        const first = ex.scoresHistory[ex.scoresHistory.length - 1];
        const latest = ex.scoresHistory[0];
        if (latest > first + 3) trend = 'Improving';
        else if (latest < first - 8) trend = 'Needs Attention';
      } else if (avgAcc >= 85) {
        trend = 'Improving';
      }

      // Assistive clinical progression recommendation (doctor retains 100% control)
      let progressionRecommendation = {
        readyForProgression: false,
        message: 'Patient is maintaining baseline rehabilitation volume.'
      };

      if (ex.sessionsCount >= 3 && avgAcc >= 85 && (ex.validReps / Math.max(1, ex.completedReps)) >= 0.8) {
        progressionRecommendation = {
          readyForProgression: true,
          message: `Consistent movement quality (${avgAcc}%) demonstrated across ${ex.sessionsCount} sessions. Clinician may consider advancing target volume (+2-5 reps) or difficulty.`
        };
      } else if (avgAcc < 70 || ex.incompleteReps > ex.validReps) {
        progressionRecommendation = {
          readyForProgression: false,
          message: `Kinematic form variance noted (movement quality ${avgAcc}%). Recommend continuing current prescription with focus on depth and cadence.`
        };
      }

      return {
        exerciseId: ex.exerciseId,
        exerciseName: ex.exerciseName,
        category: ex.category,
        sessionsCount: ex.sessionsCount,
        completedReps: ex.completedReps,
        validReps: ex.validReps,
        incompleteReps: ex.incompleteReps,
        targetReps: ex.targetReps,
        targetSets: ex.targetSets,
        avgAccuracy: avgAcc,
        avgRom,
        trend,
        commonErrors: ex.allErrors.slice(0, 4),
        progressionRecommendation
      };
    });

    // Weekly Compliance (Past 7 days)
    const weeklyCompliance = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const dayLogs = logs.filter(l => l.date === dateStr);
      const dayReps = dayLogs.reduce((acc, l) => acc + (l.completedReps || 0), 0);
      const dayAvgAcc = dayLogs.length > 0
        ? Math.round(dayLogs.reduce((acc, l) => acc + (l.accuracyScore || 0), 0) / dayLogs.length)
        : 0;

      weeklyCompliance.push({
        date: dateStr,
        dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
        sessionsCount: dayLogs.length,
        totalReps: dayReps,
        avgAccuracy: dayAvgAcc,
        completed: dayLogs.length > 0
      });
    }

    res.json({
      success: true,
      summary: {
        totalSessions,
        totalCompletedReps,
        totalValidReps,
        totalIncompleteReps,
        avgAccuracyScore,
        avgCompliancePercentage,
        totalDurationMinutes,
        totalSafetyEvents,
        overallTrend
      },
      weeklyCompliance,
      perExerciseMetrics,
      recentLogs: logs.slice(0, 10)
    });
  } catch (err) {
    console.error('Error fetching exercise analytics:', err);
    res.status(500).json({ message: 'Failed to fetch exercise analytics.', error: err.message });
  }
};

module.exports = {
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
  getClinicalNotes,
  saveExercisePrescription,
  getPatientExercises,
  triggerExerciseEmergency,
  saveExerciseLog,
  getExerciseLogs,
  getExerciseAnalytics
};
