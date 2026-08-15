const Razorpay = require('razorpay');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const Doctor = require('../models/Doctor');
const Patient = require('../models/Patient');
const DoctorSchedule = require('../models/DoctorSchedule');
const DoctorDateOverride = require('../models/DoctorDateOverride');
const Appointment = require('../models/Appointment');
const Payment = require('../models/Payment');
const User = require('../models/User');
const { sendAppointmentReceiptEmail, sendPrescriptionEmail } = require('../config/mailer');

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
    let { doctorId, appointmentDate, startTime, endTime, type, symptoms } = req.body;

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

    // Check slot availability for routine bookings
    if (!isEmergencySync) {
      const conflicting = await Appointment.findOne({
        doctorId,
        appointmentDate,
        startTime,
        status: { $in: ['Pending Payment', 'Confirmed'] }
      });
      if (conflicting) {
        return res.status(409).json({ message: 'This slot is already booked. Please choose another.' });
      }
    }

    const doctorSchedule = await DoctorSchedule.findOne({ doctorId });
    const fee = isEmergencySync 
      ? Math.round((doctorSchedule?.consultationFee || doctor.consultationFee || 500) * 1.2) // Emergency priority fee
      : (doctorSchedule?.consultationFee || doctor.consultationFee || 500);

    // Create Razorpay order (amount in paise = fee * 100)
    const razorpayOrder = await getRazorpay().orders.create({
      amount: fee * 100,
      currency: 'INR',
      receipt: `rcpt_${Date.now()}`,
      notes: {
        doctorName: `Dr. ${doctor.firstName} ${doctor.lastName}`,
        patientId: patient._id.toString(),
        appointmentDate,
        startTime
      }
    });

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
      emergencyStatus: isEmergencySync ? 'Pending' : 'None'
    });

    // Create Payment record
    await Payment.create({
      appointmentId: appointment._id,
      patientId: patient._id,
      doctorId: doctor._id,
      razorpayOrderId: razorpayOrder.id,
      amount: fee,
      currency: 'INR',
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

    if (!appointment) return res.status(404).json({ message: 'Appointment not found.' });

    // Update payment record
    await Payment.findOneAndUpdate(
      { razorpayOrderId },
      {
        razorpayPaymentId,
        razorpaySignature,
        status: 'Paid',
        paidAt: new Date()
      }
    );

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
      .populate('patientId', 'firstName lastName age phone email bloodGroup')
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
          amount: refundAmount * 100 // in paise
        });
        razorpayRefundId = refund.id;
      } catch (refundErr) {
        console.error('Razorpay refund error:', refundErr.message);
        // Continue with cancellation even if refund API fails
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
      sendPrescriptionEmail(patientEmail, patientName, doctorName, specialty, prescription, appointment.appointmentDate);
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

module.exports = {
  getDoctors,
  getAvailableSlots,
  bookAppointment,
  verifyPayment,
  getPatientAppointments,
  getDoctorAppointments,
  cancelAppointment,
  retryPayment,
  addPrescription
};
