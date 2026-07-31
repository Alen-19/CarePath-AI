const Razorpay = require('razorpay');
const crypto = require('crypto');
const Doctor = require('../models/Doctor');
const DoctorSchedule = require('../models/DoctorSchedule');
const DoctorDateOverride = require('../models/DoctorDateOverride');
const Appointment = require('../models/Appointment');
const Payment = require('../models/Payment');
const Patient = require('../models/Patient');

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

// ─── GET /api/booking/doctors ───────────────────────────────────────────────
// List all approved, active doctors for patient search
const getDoctors = async (req, res) => {
  try {
    const { search, specialization } = req.query;
    const filter = { status: 'approved', isVerified: true };
    const doctors = await Doctor.find(filter).populate('userId', 'email');

    // Fetch schedules to sync consultation fees set by doctors
    const schedules = await DoctorSchedule.find({});
    const scheduleMap = new Map(schedules.map(s => [s.doctorId.toString(), s.consultationFee]));

    let result = doctors.map(d => ({
      _id: d._id,
      firstName: d.firstName,
      lastName: d.lastName,
      specialization: d.specialization,
      licenseNumber: d.licenseNumber,
      experienceYears: d.experienceYears,
      clinicAddress: d.clinicAddress,
      rating: d.rating,
      consultationFee: scheduleMap.get(d._id.toString()) ?? d.consultationFee ?? 500,
      email: d.userId?.email
    }));

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(d =>
        `${d.firstName} ${d.lastName}`.toLowerCase().includes(q) ||
        (d.specialization || '').toLowerCase().includes(q)
      );
    }

    if (specialization) {
      result = result.filter(d =>
        (d.specialization || '').toLowerCase().includes(specialization.toLowerCase())
      );
    }

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

    // Remove already booked slots
    const booked = await Appointment.find({
      doctorId,
      appointmentDate: date,
      status: { $in: ['Pending Payment', 'Confirmed'] }
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
    const { doctorId, appointmentDate, startTime, endTime, type, symptoms } = req.body;

    if (!doctorId || !appointmentDate || !startTime || !endTime) {
      return res.status(400).json({ message: 'doctorId, appointmentDate, startTime, endTime are required.' });
    }

    const { todayStr, nowMinutes } = getNowIST();
    if (appointmentDate < todayStr || (appointmentDate === todayStr && parseTimeToMinutes(startTime) <= nowMinutes)) {
      return res.status(400).json({ message: 'Cannot book appointment slots in the past.' });
    }

    const patient = await Patient.findOne({ userId: req.user._id });
    if (!patient) return res.status(404).json({ message: 'Patient profile not found.' });

    const doctor = await Doctor.findById(doctorId);
    if (!doctor || doctor.status !== 'approved') {
      return res.status(404).json({ message: 'Doctor not found or not active.' });
    }

    // Check slot still available
    const conflicting = await Appointment.findOne({
      doctorId,
      appointmentDate,
      startTime,
      status: { $in: ['Pending Payment', 'Confirmed'] }
    });
    if (conflicting) {
      return res.status(409).json({ message: 'This slot is already booked. Please choose another.' });
    }

    const doctorSchedule = await DoctorSchedule.findOne({ doctorId });
    const fee = doctorSchedule?.consultationFee || doctor.consultationFee || 500;

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
      razorpayOrderId: razorpayOrder.id
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
    );

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

    const today = new Date().toISOString().split('T')[0];
    const appointments = await Appointment.find({
      doctorId: doctor._id,
      status: { $in: ['Confirmed', 'Completed'] }
    })
      .populate('patientId', 'firstName lastName')
      .sort({ appointmentDate: 1, startTime: 1 });

    const todayAppts = appointments.filter(a => a.appointmentDate === today);
    const upcoming = appointments.filter(a => a.appointmentDate > today);
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

module.exports = {
  getDoctors,
  getAvailableSlots,
  bookAppointment,
  verifyPayment,
  getPatientAppointments,
  getDoctorAppointments,
  cancelAppointment,
  retryPayment
};
