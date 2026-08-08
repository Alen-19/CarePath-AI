const Doctor = require('../models/Doctor');
const DoctorSchedule = require('../models/DoctorSchedule');
const DoctorDateOverride = require('../models/DoctorDateOverride');
const Appointment = require('../models/Appointment');

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

// Helper: Get today's ISO date string YYYY-MM-DD
function getTodayDateString() {
  return getNowIST().todayStr;
}

// Helper: Get ISO date string YYYY-MM-DD for 1 year in future
function getMaxDateString() {
  const max = new Date();
  max.setFullYear(max.getFullYear() + 1);
  const year = max.getFullYear();
  const month = String(max.getMonth() + 1).padStart(2, '0');
  const day = String(max.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper: Strict time regex validation (e.g. "09:00 AM", "12:30 PM")
function isValidTimeFormat(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return false;
  return /^((0?[1-9]|1[0-2]):[0-5][0-9]\s*(AM|PM))$/i.test(timeStr.trim());
}

// Helper: Convert "09:00 AM" or "02:30 PM" to minutes past midnight
function parseTimeToMinutes(timeStr) {
  if (!isValidTimeFormat(timeStr)) return -1;
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return -1;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const modifier = match[3].toUpperCase();

  if (modifier === 'PM' && hours < 12) hours += 12;
  if (modifier === 'AM' && hours === 12) hours = 0;

  return hours * 60 + minutes;
}

// Helper: Convert minutes past midnight to "09:00 AM" format
function formatMinutesToTime(totalMinutes) {
  let hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const modifier = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) hours = 12;
  const strHours = hours < 10 ? `0${hours}` : `${hours}`;
  const strMins = minutes < 10 ? `0${minutes}` : `${minutes}`;
  return `${strHours}:${strMins} ${modifier}`;
}

// Helper: Generate array of slots from startTime to endTime
function generateTimeSlots(startTimeStr, endTimeStr, durationMinutes = 30) {
  const startMins = parseTimeToMinutes(startTimeStr);
  const endMins = parseTimeToMinutes(endTimeStr);
  if (startMins < 0 || endMins < 0 || startMins >= endMins) return [];

  const slots = [];
  for (let current = startMins; current + durationMinutes <= endMins; current += durationMinutes) {
    const slotStart = formatMinutesToTime(current);
    const slotEnd = formatMinutesToTime(current + durationMinutes);
    slots.push({
      startTime: slotStart,
      endTime: slotEnd,
      timeLabel: `${slotStart} - ${slotEnd}`
    });
  }
  return slots;
}

// Helper: Get day name from date string YYYY-MM-DD
function getDayName(dateStr) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dateObj = new Date(dateStr + 'T00:00:00');
  return days[dateObj.getDay()];
}

// Default weekly schedule template generator (with Morning & Evening sessions / lunch break)
function getDefaultWeeklyTemplate() {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  return days.map(day => ({
    dayOfWeek: day,
    isWorkingDay: ['Saturday', 'Sunday'].includes(day) ? false : true,
    session1Start: '09:00 AM',
    session1End: '01:00 PM',
    hasSecondSession: true,
    session2Start: '04:00 PM',
    session2End: '07:00 PM'
  }));
}

/**
 * GET /api/appointments/schedule/my-schedule
 * Get logged in doctor's schedule and fee settings
 */
exports.getMyDoctorSchedule = async (req, res) => {
  try {
    const doctor = await Doctor.findOne({ userId: req.user._id });
    if (!doctor) {
      return res.status(404).json({ message: 'Doctor profile not found.' });
    }

    let schedule = await DoctorSchedule.findOne({ doctorId: doctor._id });
    if (!schedule) {
      schedule = await DoctorSchedule.create({
        doctorId: doctor._id,
        consultationFee: doctor.consultationFee || 500,
        slotDurationMinutes: 30,
        weeklySchedule: getDefaultWeeklyTemplate()
      });
    }

    const todayStr = getTodayDateString();
    // Fetch non-expired date overrides
    const overrides = await DoctorDateOverride.find({ doctorId: doctor._id, date: { $gte: todayStr } }).sort({ date: 1 });

    res.json({
      success: true,
      schedule,
      overrides
    });
  } catch (error) {
    console.error('Error fetching doctor schedule:', error);
    res.status(500).json({ message: 'Failed to fetch doctor schedule.', error: error.message });
  }
};

/**
 * PUT /api/appointments/schedule/weekly
 * Save/Update doctor's weekly schedule template & fee with strict validation
 */
exports.updateWeeklySchedule = async (req, res) => {
  try {
    const doctor = await Doctor.findOne({ userId: req.user._id });
    if (!doctor) {
      return res.status(404).json({ message: 'Doctor profile not found.' });
    }

    const { consultationFee, slotDurationMinutes, weeklySchedule } = req.body;

    // 1. Validate Consultation Fee
    if (consultationFee !== undefined) {
      if (typeof consultationFee !== 'number' || isNaN(consultationFee) || consultationFee < 0 || consultationFee > 25000) {
        return res.status(400).json({ message: 'Consultation fee must be a valid number between ₹0 and ₹25,000 INR.' });
      }
    }

    // 2. Validate Weekly Schedule Sessions
    if (weeklySchedule && Array.isArray(weeklySchedule)) {
      for (const day of weeklySchedule) {
        if (day.isWorkingDay) {
          const s1Start = parseTimeToMinutes(day.session1Start || day.startTime);
          const s1End = parseTimeToMinutes(day.session1End || day.endTime);

          if (s1Start < 0 || s1End < 0) {
            return res.status(400).json({ message: `Invalid time format for ${day.dayOfWeek} (Session 1). Please use HH:MM AM/PM format.` });
          }
          if (s1Start >= s1End) {
            return res.status(400).json({ message: `${day.dayOfWeek} Session 1 start time must be strictly earlier than end time.` });
          }

          if (day.hasSecondSession) {
            const s2Start = parseTimeToMinutes(day.session2Start);
            const s2End = parseTimeToMinutes(day.session2End);
            if (s2Start < 0 || s2End < 0) {
              return res.status(400).json({ message: `Invalid time format for ${day.dayOfWeek} (Session 2). Please use HH:MM AM/PM format.` });
            }
            if (s2Start >= s2End) {
              return res.status(400).json({ message: `${day.dayOfWeek} Session 2 start time must be strictly earlier than end time.` });
            }
            if (s1End > s2Start) {
              return res.status(400).json({ message: `${day.dayOfWeek} Session 2 start time cannot overlap with Session 1.` });
            }
          }
        }
      }
    }

    let schedule = await DoctorSchedule.findOne({ doctorId: doctor._id });
    if (!schedule) {
      schedule = new DoctorSchedule({ doctorId: doctor._id });
    }

    if (consultationFee !== undefined) {
      schedule.consultationFee = consultationFee;
      doctor.consultationFee = consultationFee;
      await doctor.save();
    }

    if (slotDurationMinutes !== undefined) {
      schedule.slotDurationMinutes = slotDurationMinutes;
    }

    if (weeklySchedule && Array.isArray(weeklySchedule)) {
      schedule.weeklySchedule = weeklySchedule;
    }

    await schedule.save();

    res.json({
      success: true,
      message: 'Weekly schedule & consultation fee updated successfully.',
      schedule
    });
  } catch (error) {
    console.error('Error updating weekly schedule:', error);
    res.status(500).json({ message: 'Failed to update schedule.', error: error.message });
  }
};

/**
 * POST /api/appointments/schedule/override-date
 * Add or update date-specific exception with strict date range and session checks
 */
exports.saveDateOverride = async (req, res) => {
  try {
    const doctor = await Doctor.findOne({ userId: req.user._id });
    if (!doctor) {
      return res.status(404).json({ message: 'Doctor profile not found.' });
    }

    const { date, isOffDay, session1Start, session1End, hasSecondSession, session2Start, session2End, reason } = req.body;

    if (!date) {
      return res.status(400).json({ message: 'Date string (YYYY-MM-DD) is required.' });
    }

    const todayStr = getTodayDateString();
    const maxDateStr = getMaxDateString();

    if (date < todayStr) {
      return res.status(400).json({ message: 'Cannot set schedule overrides or slots for past dates.' });
    }

    if (date > maxDateStr) {
      return res.status(400).json({ message: 'Single-day overrides can only be set up to 1 year in advance.' });
    }

    if (!isOffDay) {
      const s1Start = parseTimeToMinutes(session1Start || '09:00 AM');
      const s1End = parseTimeToMinutes(session1End || '01:00 PM');
      if (s1Start < 0 || s1End < 0 || s1Start >= s1End) {
        return res.status(400).json({ message: 'Invalid session times. Session 1 start time must be strictly earlier than end time.' });
      }

      if (hasSecondSession) {
        const s2Start = parseTimeToMinutes(session2Start || '04:00 PM');
        const s2End = parseTimeToMinutes(session2End || '07:00 PM');
        if (s2Start < 0 || s2End < 0 || s2Start >= s2End || s1End > s2Start) {
          return res.status(400).json({ message: 'Invalid Session 2 times or session overlap.' });
        }
      }
    }

    const override = await DoctorDateOverride.findOneAndUpdate(
      { doctorId: doctor._id, date },
      {
        doctorId: doctor._id,
        date,
        isOffDay: isOffDay ?? true,
        session1Start: session1Start || '09:00 AM',
        session1End: session1End || '01:00 PM',
        hasSecondSession: !!hasSecondSession,
        session2Start: session2Start || '04:00 PM',
        session2End: session2End || '07:00 PM',
        reason: reason || (isOffDay ? 'On Leave' : 'Custom Hours')
      },
      { upsert: true, new: true }
    );

    res.json({
      success: true,
      message: 'Date override saved successfully.',
      override
    });
  } catch (error) {
    console.error('Error saving date override:', error);
    res.status(500).json({ message: 'Failed to save date override.', error: error.message });
  }
};

/**
 * DELETE /api/appointments/schedule/override-date/:id
 */
exports.deleteDateOverride = async (req, res) => {
  try {
    const doctor = await Doctor.findOne({ userId: req.user._id });
    if (!doctor) {
      return res.status(404).json({ message: 'Doctor profile not found.' });
    }

    await DoctorDateOverride.findOneAndDelete({ _id: req.params.id, doctorId: doctor._id });

    res.json({
      success: true,
      message: 'Date override removed successfully.'
    });
  } catch (error) {
    console.error('Error deleting date override:', error);
    res.status(500).json({ message: 'Failed to delete date override.', error: error.message });
  }
};

/**
 * GET /api/appointments/slots/available
 * Calculate available slots for a given doctor & date considering session breaks
 */
exports.getAvailableSlots = async (req, res) => {
  try {
    const { doctorId, date } = req.query;
    if (!doctorId || !date) {
      return res.status(400).json({ message: 'doctorId and date query parameters are required.' });
    }

    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found.' });
    }

    const { todayStr, nowMinutes } = getNowIST();
    if (date < todayStr) {
      return res.json({
        success: true,
        date,
        isOffDay: true,
        reason: 'Date is in the past. Slots cannot be booked for past dates.',
        slots: [],
        consultationFee: doctor.consultationFee || 500
      });
    }

    // 1. Check Date Override first
    const dateOverride = await DoctorDateOverride.findOne({ doctorId, date });
    if (dateOverride && dateOverride.isOffDay) {
      return res.json({
        success: true,
        date,
        isOffDay: true,
        reason: dateOverride.reason || 'Doctor is on leave on this date',
        slots: [],
        consultationFee: doctor.consultationFee || 500
      });
    }

    // 2. Fetch Doctor Schedule
    let schedule = await DoctorSchedule.findOne({ doctorId });
    const slotDuration = schedule ? schedule.slotDurationMinutes : 30;
    const fee = schedule ? schedule.consultationFee : (doctor.consultationFee || 500);

    let isWorking = true;
    let s1Start = '09:00 AM';
    let s1End = '01:00 PM';
    let hasS2 = true;
    let s2Start = '04:00 PM';
    let s2End = '07:00 PM';

    if (dateOverride && !dateOverride.isOffDay) {
      s1Start = dateOverride.session1Start || '09:00 AM';
      s1End = dateOverride.session1End || '01:00 PM';
      hasS2 = dateOverride.hasSecondSession;
      s2Start = dateOverride.session2Start || '04:00 PM';
      s2End = dateOverride.session2End || '07:00 PM';
    } else if (schedule && schedule.weeklySchedule) {
      const dayName = getDayName(date);
      const daySetting = schedule.weeklySchedule.find(d => d.dayOfWeek === dayName);
      if (daySetting) {
        isWorking = daySetting.isWorkingDay;
        s1Start = daySetting.session1Start || daySetting.startTime || '09:00 AM';
        s1End = daySetting.session1End || daySetting.endTime || '01:00 PM';
        hasS2 = daySetting.hasSecondSession ?? true;
        s2Start = daySetting.session2Start || '04:00 PM';
        s2End = daySetting.session2End || '07:00 PM';
      }
    }

    if (!isWorking) {
      return res.json({
        success: true,
        date,
        isOffDay: true,
        reason: 'Doctor is not available on this day of the week.',
        slots: [],
        consultationFee: fee
      });
    }

    // 3. Generate slots for Session 1 and Session 2 (Leaving break time free!)
    const candidateSlots = [
      ...generateTimeSlots(s1Start, s1End, slotDuration),
      ...(hasS2 ? generateTimeSlots(s2Start, s2End, slotDuration) : [])
    ];

    // 4. Fetch booked appointments for this doctor & date
    const bookedAppointments = await Appointment.find({
      doctorId,
      appointmentDate: date,
      status: { $in: ['Confirmed', 'Pending Payment', 'Completed'] }
    });

    const bookedTimes = new Set(bookedAppointments.map(a => a.startTime));

    // 5. Mark booked status & filter out past slots for today
    let slots = candidateSlots.map(slot => ({
      ...slot,
      isBooked: bookedTimes.has(slot.startTime)
    }));

    if (date === todayStr) {
      slots = slots.filter(slot => parseTimeToMinutes(slot.startTime) > nowMinutes);
    }

    res.json({
      success: true,
      date,
      isOffDay: false,
      consultationFee: fee,
      slotDurationMinutes: slotDuration,
      slots
    });

  } catch (error) {
    console.error('Error fetching available slots:', error);
    res.status(500).json({ message: 'Failed to calculate available slots.', error: error.message });
  }
};

/**
 * GET /api/appointments/:id/consultation
 * Get video consultation session details for an appointment
 */
exports.getConsultationDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const appointment = await Appointment.findById(id)
      .populate({
        path: 'patientId',
        populate: { path: 'userId', select: 'name email profileImage' }
      })
      .populate({
        path: 'doctorId',
        populate: { path: 'userId', select: 'name email profileImage' }
      });

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found.' });
    }

    // Assign meetingRoomId if not set
    if (!appointment.meetingRoomId) {
      appointment.meetingRoomId = `room_${appointment._id}`;
      await appointment.save();
    }

    // Default public STUN servers for WebRTC
    const iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' }
    ];

    res.json({
      success: true,
      appointment,
      meetingRoomId: appointment.meetingRoomId,
      callStatus: appointment.callStatus,
      iceServers
    });
  } catch (error) {
    console.error('Error fetching consultation details:', error);
    res.status(500).json({ message: 'Failed to fetch consultation details.', error: error.message });
  }
};

