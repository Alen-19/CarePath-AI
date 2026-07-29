const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const User = require('./models/User');
const Patient = require('./models/Patient');
const Doctor = require('./models/Doctor');
const Admin = require('./models/Admin');

dotenv.config({ path: path.join(__dirname, '../.env') });

const seedDatabase = async () => {
  try {
    console.log('Connecting to database...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB Atlas.');

    // Find demo users to clean up
    const demoEmails = ['patient@carepath.com', 'doctor@carepath.com', 'carepathaiadmin@gmail.com'];
    const oldUsers = await User.find({ email: { $in: demoEmails } });
    const oldUserIds = oldUsers.map(u => u._id);

    await Patient.deleteMany({ userId: { $in: oldUserIds } });
    await Doctor.deleteMany({ userId: { $in: oldUserIds } });
    await Admin.deleteMany({ userId: { $in: oldUserIds } });
    await User.deleteMany({ _id: { $in: oldUserIds } });

    console.log('Cleaned old demo accounts.');

    // 1. Create Demo Patient
    const patientUser = await User.create({
      email: 'patient@carepath.com',
      passwordHash: 'password123',
      role: 'patient'
    });

    await Patient.create({
      userId: patientUser._id,
      firstName: 'Demo',
      lastName: 'Patient',
      dateOfBirth: new Date('1995-04-12'),
      gender: 'Male',
      phone: '+1 555-0199',
      bloodGroup: 'O+'
    });
    console.log('Demo Patient account seeded.');

    // 2. Create Demo Doctor (Verified by default for instant testing)
    const doctorUser = await User.create({
      email: 'doctor@carepath.com',
      passwordHash: 'password123',
      role: 'doctor'
    });

    await Doctor.create({
      userId: doctorUser._id,
      firstName: 'Sarah',
      lastName: 'Jenkins',
      specialization: 'Cardiologist',
      licenseNumber: 'LIC-77889900',
      experienceYears: 12,
      clinicAddress: 'Heart & Vascular Clinic, Medical Block C, Metro Hospital',
      isVerified: true
    });
    console.log('Demo Doctor account seeded (Verified).');

    // 3. Create Admin Account
    const adminUser = await User.create({
      email: 'carepathaiadmin@gmail.com',
      passwordHash: process.env.ADMIN_PASSWORD || 'admin12345',
      role: 'admin'
    });

    await Admin.create({
      userId: adminUser._id,
      firstName: 'System',
      lastName: 'Admin',
      department: 'System Administration'
    });
    console.log('Admin account (carepathaiadmin@gmail.com) seeded.');

    console.log('Database seeding completed successfully.');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  }
};

seedDatabase();
