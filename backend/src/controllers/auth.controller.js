const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const Patient = require('../models/Patient');
const Doctor = require('../models/Doctor');
const Admin = require('../models/Admin');
const { sendResetOtpEmail } = require('../config/mailer');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Helper to generate token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'carepath_ai_super_secret_jwt_key_2026', {
    expiresIn: '30d'
  });
};

// Validation Helpers
const isValidName = (name) => {
  if (!name || typeof name !== 'string') return false;
  const clean = name.trim();
  if (clean.length < 2 || clean.length > 50) return false;
  const nameRegex = /^[a-zA-Z]+(?:[\s'\.\-][a-zA-Z]+)*$/;
  return nameRegex.test(clean);
};

const isValidEmail = (email) => {
  const strictEmailRegex = /^(?=[a-zA-Z0-9._-]{6,64}@)[a-zA-Z0-9]+(?:[._-][a-zA-Z0-9]+)*@[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*(?:\.[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*)*\.[a-zA-Z]{2,}$/;
  return strictEmailRegex.test(email);
};

const isStrongPassword = (password) => {
  const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*#?&]{8,}$/;
  return passwordRegex.test(password);
};

const isValidPhone = (phone) => {
  if (!phone) return true;
  const phoneRegex = /^(?:\+?91[\s\-]?)?[6-9]\d{9}$/;
  return phoneRegex.test(phone.trim());
};

const isValidExperience = (exp) => {
  if (exp === undefined || exp === null || exp === '') return true;
  const num = Number(exp);
  return !isNaN(num) && num >= 0 && num <= 60;
};

const isValidLicenseNumber = (license) => {
  if (!license || typeof license !== 'string') return false;
  const clean = license.trim();
  if (clean.length < 4 || clean.length > 35) return false;
  if (/^(.)\1+$/.test(clean)) return false; // Reject single repeating chars like "000"
  const licenseRegex = /^[a-zA-Z0-9]+(?:[\/\-][a-zA-Z0-9]+)*$/;
  return licenseRegex.test(clean);
};

const isValidClinicAddress = (addr) => {
  if (!addr) return true;
  if (typeof addr !== 'string') return false;
  const clean = addr.trim();
  if (clean.length < 8 || clean.length > 250) return false;
  if ((clean.match(/[a-zA-Z]/g) || []).length < 3) return false; // Must contain at least 3 letters
  if (/^(.)\1+$/.test(clean)) return false;
  return true;
};

// Helper to fetch user profile document
const getProfileForUser = async (userId, role) => {
  if (role === 'patient') {
    return await Patient.findOne({ userId });
  } else if (role === 'doctor') {
    return await Doctor.findOne({ userId });
  } else if (role === 'admin') {
    let adminProfile = await Admin.findOne({ userId });
    if (!adminProfile) {
      adminProfile = await Admin.create({
        userId,
        firstName: 'System',
        lastName: 'Admin',
        department: 'System Administration'
      });
    }
    return adminProfile;
  }
  return null;
};

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
const registerUser = async (req, res) => {
  const { email, password, role, profile } = req.body;

  try {
    if (!email || !password || !role) {
      return res.status(400).json({ message: 'Please provide email, password, and role.' });
    }

    if (!profile?.firstName || !isValidName(profile.firstName)) {
      return res.status(400).json({ message: 'First name must contain only letters and be between 2 and 50 characters long.' });
    }

    if (!profile?.lastName || !isValidName(profile.lastName)) {
      return res.status(400).json({ message: 'Last name must contain only letters and be between 2 and 50 characters long.' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: 'Please enter a valid email address.' });
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({ 
        message: 'Password must be at least 8 characters long and contain at least one letter and one number.' 
      });
    }

    if (profile?.phone && !isValidPhone(profile.phone)) {
      return res.status(400).json({ message: 'Please enter a valid 10-digit Indian phone number (e.g. 9876543210 or +91 9876543210).' });
    }

    if (role === 'doctor') {
      if (!profile?.specialization || !profile?.licenseNumber) {
        return res.status(400).json({ message: 'Doctors must provide specialization and medical license number.' });
      }

      if (!isValidLicenseNumber(profile.licenseNumber)) {
        return res.status(400).json({ message: 'Please enter a valid Medical License Number (between 4 and 35 alphanumeric characters). Dummy entries like 000 are disallowed.' });
      }

      if (profile?.clinicAddress && !isValidClinicAddress(profile.clinicAddress)) {
        return res.status(400).json({ message: 'Please enter a valid Clinic/Hospital Address (at least 8 characters long). Dummy entries like 00000000 are disallowed.' });
      }

      if (profile?.experienceYears !== undefined && !isValidExperience(profile.experienceYears)) {
        return res.status(400).json({ message: 'Years of experience must be a number between 0 and 60.' });
      }

      const existingDoc = await Doctor.findOne({ licenseNumber: profile.licenseNumber.trim() });
      if (existingDoc) {
        return res.status(400).json({ message: 'A doctor is already registered with this medical license number.' });
      }
    }

    const userExists = await User.findOne({ email: email.toLowerCase() });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists with this email address.' });
    }

    // 1. Create auth credentials
    const user = await User.create({
      email: email.toLowerCase(),
      passwordHash: password,
      role
    });

    // 2. Create role-specific profile document
    let createdProfile = null;

    if (role === 'patient') {
      createdProfile = await Patient.create({
        userId: user._id,
        firstName: profile?.firstName || '',
        lastName: profile?.lastName || '',
        dateOfBirth: profile?.dateOfBirth ? new Date(profile.dateOfBirth) : null,
        gender: profile?.gender || 'Prefer not to say',
        phone: profile?.phone || '',
        bloodGroup: profile?.bloodGroup || '',
        address: {
          houseName: profile?.address?.houseName || '',
          city: profile?.address?.city || '',
          district: profile?.address?.district || '',
          state: profile?.address?.state || '',
          pincode: profile?.address?.pincode || '',
          country: profile?.address?.country || 'India'
        }
      });
    } else if (role === 'doctor') {
      createdProfile = await Doctor.create({
        userId: user._id,
        firstName: profile?.firstName || '',
        lastName: profile?.lastName || '',
        specialization: profile?.specialization || '',
        licenseNumber: profile?.licenseNumber?.trim() || '',
        experienceYears: profile?.experienceYears || 0,
        clinicAddress: profile?.clinicAddress || '',
        isVerified: false
      });
    } else if (role === 'admin') {
      createdProfile = await Admin.create({
        userId: user._id,
        firstName: profile?.firstName || 'Admin',
        lastName: profile?.lastName || 'User'
      });
    }

    const isDoctorPending = role === 'doctor';

    res.status(201).json({
      message: isDoctorPending
        ? 'Registration successful. Your doctor account is pending administrator verification. You will be able to log in once an administrator approves your medical license.'
        : 'Registration successful.',
      token: isDoctorPending ? null : generateToken(user._id),
      user: {
        _id: user._id,
        email: user.email,
        role: user.role,
        patientProfile: role === 'patient' ? createdProfile : undefined,
        doctorProfile: role === 'doctor' ? createdProfile : undefined,
        adminProfile: role === 'admin' ? createdProfile : undefined
      }
    });
  } catch (error) {
    console.error('Error in registration:', error);
    res.status(500).json({ message: 'Server error during registration.' });
  }
};

// @desc    Authenticate user & get token
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res) => {
  const { email, password } = req.body;

  try {
    if (!email || !password) {
      return res.status(400).json({ message: 'Please provide email and password.' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: 'Please enter a valid email address.' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: 'Your account has been deactivated. Please contact support.' });
    }

    // Fetch corresponding profile document
    const userProfile = await getProfileForUser(user._id, user.role);

    // Doctor Verification & Suspension Guard
    if (user.role === 'doctor') {
      if (userProfile && userProfile.status === 'suspended') {
        return res.status(403).json({ 
          isSuspended: true,
          message: userProfile.suspensionReason || 'Your doctor account has been suspended by system administration.' 
        });
      } else if (!userProfile || (!userProfile.isVerified && userProfile.status !== 'approved')) {
        return res.status(403).json({ 
          isSuspended: false,
          message: 'Your doctor account is pending admin verification. You will be able to log in once an administrator approves your medical license.' 
        });
      }
    }

    res.json({
      message: 'Login successful.',
      token: generateToken(user._id),
      user: {
        _id: user._id,
        email: user.email,
        role: user.role,
        patientProfile: user.role === 'patient' ? userProfile : undefined,
        doctorProfile: user.role === 'doctor' ? userProfile : undefined,
        adminProfile: user.role === 'admin' ? userProfile : undefined
      }
    });
  } catch (error) {
    console.error('Error in login:', error);
    res.status(500).json({ message: 'Server error during login.' });
  }
};

// @desc    Get user profile
// @route   GET /api/auth/profile
// @access  Private
const getUserProfile = async (req, res) => {
  try {
    const userProfile = await getProfileForUser(req.user._id, req.user.role);

    res.json({
      user: {
        _id: req.user._id,
        email: req.user.email,
        role: req.user.role,
        patientProfile: req.user.role === 'patient' ? userProfile : undefined,
        doctorProfile: req.user.role === 'doctor' ? userProfile : undefined,
        adminProfile: req.user.role === 'admin' ? userProfile : undefined
      }
    });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ message: 'Server error fetching profile.' });
  }
};

// @desc    Register or Login user via Google OAuth2
const googleLogin = async (req, res) => {
  const { idToken, role } = req.body;

  try {
    if (!idToken) {
      return res.status(400).json({ message: 'Google ID token is required.' });
    }

    let googlePayload;

    try {
      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID
      });
      googlePayload = ticket.getPayload();
    } catch (verifyError) {
      console.error('Google token verification failed:', verifyError);
      return res.status(400).json({ 
        message: 'Invalid Google ID token. Signature verification failed.' 
      });
    }

    const { sub: googleId, email, given_name: firstName, family_name: lastName } = googlePayload;

    let user = await User.findOne({ googleId });

    if (!user && email) {
      user = await User.findOne({ email });
      if (user) {
        user.googleId = googleId;
        await user.save();
      }
    }

    if (!user) {
      const selectedRole = role || 'patient';
      
      user = await User.create({
        email,
        role: selectedRole,
        googleId
      });

      if (selectedRole === 'patient') {
        await Patient.create({
          userId: user._id,
          firstName: firstName || 'Google',
          lastName: lastName || 'User'
        });
      } else if (selectedRole === 'doctor') {
        await Doctor.create({
          userId: user._id,
          firstName: firstName || 'Doctor',
          lastName: lastName || 'User',
          specialization: '',
          isVerified: false
        });
      } else if (selectedRole === 'admin') {
        await Admin.create({
          userId: user._id,
          firstName: firstName || 'System',
          lastName: lastName || 'Admin',
          department: 'System Administration'
        });
      }
    }

    if (!user.isActive) {
      return res.status(403).json({ message: 'Your account is deactivated.' });
    }

    const userProfile = await getProfileForUser(user._id, user.role);

    // Doctor Flow: If profile is incomplete (missing license/specialization), allow login token so doctor can reach /auth/complete-profile
    if (user.role === 'doctor') {
      const hasCompletedProfile = !!(userProfile && userProfile.licenseNumber && userProfile.specialization);
      
      // Only block with 403 if doctor has submitted their full profile and is waiting for admin verification
      if (hasCompletedProfile && !userProfile.isVerified) {
        return res.status(403).json({ 
          message: 'Your doctor account is pending admin verification. You will be able to log in once an administrator approves your medical license.' 
        });
      }
    }

    res.status(200).json({
      message: 'Google login successful.',
      token: generateToken(user._id),
      user: {
        _id: user._id,
        email: user.email,
        role: user.role,
        patientProfile: user.role === 'patient' ? userProfile : undefined,
        doctorProfile: user.role === 'doctor' ? userProfile : undefined
      }
    });
  } catch (error) {
    console.error('Error in Google Login:', error);
    res.status(500).json({ message: 'Server error during Google auth.' });
  }
};

// @desc    Complete or update user profile details
// @route   PUT /api/auth/complete-profile
// @access  Private
const completeProfile = async (req, res) => {
  const { role, profile } = req.body;

  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    if (role) {
      if (!['patient', 'doctor'].includes(role)) {
        return res.status(400).json({ message: 'Invalid role selection.' });
      }
      user.role = role;
      await user.save();
    }

    if (profile?.phone && !isValidPhone(profile.phone)) {
      return res.status(400).json({ message: 'Please enter a valid 10-digit Indian phone number (e.g. 9876543210 or +91 9876543210).' });
    }

    if (user.role === 'doctor') {
      if (profile?.licenseNumber && !isValidLicenseNumber(profile.licenseNumber)) {
        return res.status(400).json({ message: 'Please enter a valid Medical License Number (between 4 and 35 alphanumeric characters). Dummy entries like 000 are disallowed.' });
      }
      if (profile?.clinicAddress && !isValidClinicAddress(profile.clinicAddress)) {
        return res.status(400).json({ message: 'Please enter a valid Clinic/Hospital Address (at least 8 characters long). Dummy entries like 00000000 are disallowed.' });
      }
    }

    if (profile?.experienceYears !== undefined && !isValidExperience(profile.experienceYears)) {
      return res.status(400).json({ message: 'Years of experience must be a number between 0 and 60.' });
    }

    let userProfile = await getProfileForUser(user._id, user.role);

    if (user.role === 'patient') {
      if (!userProfile) {
        userProfile = new Patient({ 
          userId: user._id,
          firstName: profile?.firstName || 'Patient',
          lastName: profile?.lastName || ''
        });
      }
      userProfile.firstName = profile?.firstName || userProfile.firstName || 'Patient';
      userProfile.lastName = profile?.lastName || userProfile.lastName || '';
      userProfile.dateOfBirth = profile?.dateOfBirth ? new Date(profile.dateOfBirth) : userProfile.dateOfBirth;
      userProfile.gender = profile?.gender || userProfile.gender || 'Prefer not to say';
      userProfile.phone = profile?.phone || userProfile.phone || '';
      userProfile.bloodGroup = profile?.bloodGroup || userProfile.bloodGroup || '';
      if (profile?.address) {
        userProfile.address = {
          houseName: profile.address.houseName || userProfile.address?.houseName || '',
          city: profile.address.city || userProfile.address?.city || '',
          district: profile.address.district || userProfile.address?.district || '',
          state: profile.address.state || userProfile.address?.state || '',
          pincode: profile.address.pincode || userProfile.address?.pincode || '',
          country: profile.address.country || userProfile.address?.country || 'India'
        };
      }
      await userProfile.save();
    } else if (user.role === 'doctor') {
      if (!userProfile) {
        userProfile = new Doctor({ userId: user._id });
      }
      if (profile?.firstName) userProfile.firstName = profile.firstName.trim();
      if (profile?.lastName) userProfile.lastName = profile.lastName.trim();
      if (profile?.specialization) userProfile.specialization = profile.specialization.trim();
      if (profile?.licenseNumber) userProfile.licenseNumber = profile.licenseNumber.trim();
      if (profile?.experienceYears !== undefined && profile?.experienceYears !== null) {
        userProfile.experienceYears = profile.experienceYears;
      }
      if (profile?.clinicAddress) userProfile.clinicAddress = profile.clinicAddress.trim();
      await userProfile.save();
    }

    res.json({
      message: 'Profile completed successfully.',
      token: (user.role === 'doctor' && !userProfile.isVerified) ? null : generateToken(user._id),
      user: {
        _id: user._id,
        email: user.email,
        role: user.role,
        patientProfile: user.role === 'patient' ? userProfile : undefined,
        doctorProfile: user.role === 'doctor' ? userProfile : undefined
      }
    });
  } catch (error) {
    console.error('Error completing profile:', error);
    res.status(500).json({ message: 'Server error completing profile.' });
  }
};

// @desc    Backend Proxy for Postal Pincode Lookup (Bypasses Browser CORS)
// @route   GET /api/auth/pincode/:pincode
// @access  Public
const getPincodeDetails = async (req, res) => {
  try {
    const { pincode } = req.params;
    if (!pincode || !/^\d{6}$/.test(pincode)) {
      return res.status(400).json({ message: 'Please provide a valid 6-digit pincode.' });
    }

    const apiRes = await fetch(`https://api.postalpincode.in/pincode/${pincode}`);
    const data = await apiRes.json();
    res.json(data);
  } catch (error) {
    console.error('Error fetching pincode details from Postal API:', error);
    res.status(500).json({ message: 'Failed to fetch pincode details.' });
  }
};

// @desc    Request Password Reset OTP
// @route   POST /api/auth/forgot-password
// @access  Public
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ message: 'Please enter a valid registered email address.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: cleanEmail });

    if (!user) {
      // Security standard: do not disclose if email doesn't exist
      return res.json({ 
        message: `If an account exists for ${cleanEmail}, a 6-digit password reset OTP has been sent.`
      });
    }

    // Generate 6-digit OTP code
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.resetPasswordToken = otp;
    user.resetPasswordExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes validity
    await user.save();

    console.log(`[AUTH] Password reset OTP generated for ${cleanEmail}`);

    // Send real email via mailer module
    await sendResetOtpEmail(cleanEmail, otp);

    res.json({
      message: `Password reset OTP has been sent to ${cleanEmail}. (Valid for 15 minutes)`
    });
  } catch (error) {
    console.error('Error requesting password reset:', error);
    res.status(500).json({ message: 'Server error requesting password reset.' });
  }
};

// @desc    Reset Password using OTP
// @route   POST /api/auth/reset-password
// @access  Public
const resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ message: 'Please provide email, 6-digit OTP, and your new password.' });
    }

    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({ 
        message: 'New password must be at least 8 characters long and contain both letters and numbers.' 
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = await User.findOne({ 
      email: cleanEmail,
      resetPasswordToken: otp.trim(),
      resetPasswordExpires: { $gt: new Date() }
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired 6-digit reset OTP code.' });
    }

    // Set new password (pre-save middleware hashes passwordHash automatically)
    user.passwordHash = newPassword;
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();

    console.log(`[AUTH] Password successfully reset for ${cleanEmail}`);

    res.json({ message: 'Password reset successful! You can now log in with your new password.' });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ message: 'Server error resetting password.' });
  }
};

module.exports = {
  registerUser,
  loginUser,
  getUserProfile,
  googleLogin,
  completeProfile,
  getPincodeDetails,
  forgotPassword,
  resetPassword
};
