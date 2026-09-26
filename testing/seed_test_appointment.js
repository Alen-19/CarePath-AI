const path = require('path');
require('../backend/node_modules/dotenv').config({ path: path.join(__dirname, '../backend/.env') });
const mongoose = require('../backend/node_modules/mongoose');
const Appointment = require('../backend/src/models/Appointment');
const Doctor = require('../backend/src/models/Doctor');
const Patient = require('../backend/src/models/Patient');
const User = require('../backend/src/models/User');

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);
  const user = await User.findOne({ email: 'alenkuriakose29@gmail.com' });
  const doctor = await Doctor.findOne({ userId: user._id });
  const justinUser = await User.findOne({ email: 'justinsaji2412@gmail.com' });
  const patient = await Patient.findOne({ userId: justinUser._id });

  const testDate = '2026-09-25';

  const res = await Appointment.findOneAndUpdate(
    { doctorId: doctor._id, appointmentDate: testDate },
    {
      $set: {
        patientId: patient._id,
        doctorId: doctor._id,
        appointmentDate: testDate,
        startTime: '10:00 AM',
        endTime: '10:30 AM',
        type: 'General Consultation',
        status: 'Confirmed',
        amount: 500,
        currency: 'INR',
        paymentStatus: 'Paid',
        meetingRoomId: 'room_test_alen_justin'
      }
    },
    { upsert: true, new: true }
  );

  console.log(`APPOINTMENT_ID:${res._id}`);
  await mongoose.disconnect();
}

seed().catch(console.error);
