const path = require('path');
require('../backend/node_modules/dotenv').config({ path: path.join(__dirname, '../backend/.env') });
const mongoose = require('../backend/node_modules/mongoose');
const bcrypt = require('../backend/node_modules/bcryptjs');
const User = require('../backend/src/models/User');

async function setup() {
  await mongoose.connect(process.env.MONGO_URI);
  const salt = await bcrypt.genSalt(10);
  
  // Doctor
  const docHash = await bcrypt.hash('Doctor@123', salt);
  await User.updateOne({ email: 'alenkuriakose29@gmail.com' }, { passwordHash: docHash });
  
  // Admin
  const adminHash = await bcrypt.hash('Admin@123', salt);
  await User.updateOne({ email: 'carepathaiadmin@gmail.com' }, { passwordHash: adminHash });

  // Patient
  const patientHash = await bcrypt.hash('Justin@123', salt);
  await User.updateOne({ email: 'justinsaji2412@gmail.com' }, { passwordHash: patientHash });

  console.log('Test accounts successfully configured:');
  console.log('Doctor: alenkuriakose29@gmail.com / Doctor@123');
  console.log('Admin: carepathaiadmin@gmail.com / Admin@123');
  console.log('Patient: justinsaji2412@gmail.com / Justin@123');
  
  await mongoose.disconnect();
}

setup().catch(console.error);
