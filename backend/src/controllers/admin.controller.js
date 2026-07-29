const Doctor = require('../models/Doctor');
const Patient = require('../models/Patient');
const User = require('../models/User');

// @desc    Get Admin Dashboard Stats
// @route   GET /api/admin/stats
// @access  Private/Admin
const getAdminStats = async (req, res) => {
  try {
    const totalDoctors = await Doctor.countDocuments();
    const pendingVerifications = await Doctor.countDocuments({ isVerified: false });
    const approvedDoctors = await Doctor.countDocuments({ isVerified: true });
    const totalPatients = await Patient.countDocuments();

    res.json({
      success: true,
      stats: {
        totalDoctors,
        pendingVerifications,
        approvedDoctors,
        totalPatients
      }
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({ message: 'Server error fetching stats.', error: error.message });
  }
};

// @desc    Get all doctor verification requests with filter option
// @route   GET /api/admin/doctors?status=pending|approved|all
// @access  Private/Admin
const getDoctorVerificationRequests = async (req, res) => {
  try {
    const { status } = req.query;
    let queryFilter = {};

    if (status === 'pending') {
      queryFilter.isVerified = false;
    } else if (status === 'approved') {
      queryFilter.isVerified = true;
    }

    const doctors = await Doctor.find(queryFilter)
      .populate('userId', 'email isActive createdAt')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: doctors.length,
      doctors
    });
  } catch (error) {
    console.error('Error fetching doctor verification requests:', error);
    res.status(500).json({ message: 'Server error fetching doctor requests.', error: error.message });
  }
};

// @desc    Approve / Verify a Doctor Request
// @route   PUT /api/admin/doctors/:id/approve
// @access  Private/Admin
const approveDoctor = async (req, res) => {
  try {
    const doctorId = req.params.id;

    // Find by Doctor _id or by userId
    let doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      doctor = await Doctor.findOne({ userId: doctorId });
    }

    if (!doctor) {
      return res.status(404).json({ message: 'Doctor profile not found.' });
    }

    doctor.isVerified = true;
    await doctor.save();

    const populatedDoctor = await Doctor.findById(doctor._id).populate('userId', 'email isActive createdAt');

    res.json({
      success: true,
      message: `Doctor Dr. ${doctor.firstName} ${doctor.lastName} has been verified and approved successfully.`,
      doctor: populatedDoctor
    });
  } catch (error) {
    console.error('Error approving doctor:', error);
    res.status(500).json({ message: 'Server error approving doctor.', error: error.message });
  }
};

// @desc    Reject / Revoke a Doctor Verification
// @route   PUT /api/admin/doctors/:id/reject
// @access  Private/Admin
const rejectDoctor = async (req, res) => {
  try {
    const doctorId = req.params.id;

    let doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      doctor = await Doctor.findOne({ userId: doctorId });
    }

    if (!doctor) {
      return res.status(404).json({ message: 'Doctor profile not found.' });
    }

    doctor.isVerified = false;
    await doctor.save();

    const populatedDoctor = await Doctor.findById(doctor._id).populate('userId', 'email isActive createdAt');

    res.json({
      success: true,
      message: `Doctor Dr. ${doctor.firstName} ${doctor.lastName}'s verification status has been set to pending/rejected.`,
      doctor: populatedDoctor
    });
  } catch (error) {
    console.error('Error rejecting doctor:', error);
    res.status(500).json({ message: 'Server error rejecting doctor.', error: error.message });
  }
};

module.exports = {
  getAdminStats,
  getDoctorVerificationRequests,
  approveDoctor,
  rejectDoctor
};
