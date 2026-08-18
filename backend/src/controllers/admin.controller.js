const Doctor = require('../models/Doctor');
const Patient = require('../models/Patient');
const User = require('../models/User');

// @desc    Get Admin Dashboard Stats
// @route   GET /api/admin/stats
// @access  Private/Admin
const getAdminStats = async (req, res) => {
  try {
    const totalDoctors = await Doctor.countDocuments();
    const pendingVerifications = await Doctor.countDocuments({ 
      $or: [{ status: 'pending' }, { status: { $exists: false }, isVerified: false }]
    });
    const approvedDoctors = await Doctor.countDocuments({ isVerified: true, status: 'approved' });
    const suspendedDoctors = await Doctor.countDocuments({ status: 'suspended' });
    const rejectedDoctors = await Doctor.countDocuments({ status: 'rejected' });
    const totalPatients = await Patient.countDocuments();

    res.json({
      success: true,
      stats: {
        totalDoctors,
        pendingVerifications,
        approvedDoctors,
        suspendedDoctors,
        rejectedDoctors,
        totalPatients
      }
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({ message: 'Server error fetching stats.', error: error.message });
  }
};

// @desc    Get doctor verification/management requests with filter option
// @route   GET /api/admin/doctors?status=pending|approved|suspended|rejected|all
// @access  Private/Admin
const getDoctorVerificationRequests = async (req, res) => {
  try {
    const { status } = req.query;
    let queryFilter = {};

    if (status === 'pending') {
      queryFilter.$or = [{ status: 'pending' }, { status: { $exists: false }, isVerified: false }];
    } else if (status === 'approved') {
      queryFilter.$or = [{ status: 'approved' }, { status: { $exists: false }, isVerified: true }];
    } else if (status === 'suspended') {
      queryFilter.status = 'suspended';
    } else if (status === 'rejected') {
      queryFilter.status = 'rejected';
    }

    const doctors = await Doctor.find(queryFilter)
      .populate('userId', 'email isActive createdAt')
      .sort({ createdAt: -1 });

    const formattedDoctors = doctors.map(doc => {
      const docObj = doc.toObject();
      if (!docObj.status) {
        docObj.status = docObj.isVerified ? 'approved' : 'pending';
      }
      if (typeof docObj.clinicAddress === 'object' && docObj.clinicAddress !== null) {
        const parts = [docObj.clinicName, docObj.clinicAddress.city, docObj.clinicAddress.district, docObj.clinicAddress.state, docObj.clinicAddress.pincode].filter(Boolean);
        const displayAddr = parts.join(', ');
        docObj.clinicAddressDisplay = displayAddr;
        if (typeof docObj.clinicAddress !== 'string') {
          docObj.clinicAddress = displayAddr || 'Location not specified';
        }
      }
      return docObj;
    });

    res.json({
      success: true,
      count: formattedDoctors.length,
      doctors: formattedDoctors
    });
  } catch (error) {
    console.error('Error fetching doctor requests:', error);
    res.status(500).json({ message: 'Server error fetching doctor requests.', error: error.message });
  }
};

// @desc    Approve / Verify a Doctor Request
// @route   PUT /api/admin/doctors/:id/approve
// @access  Private/Admin
const approveDoctor = async (req, res) => {
  try {
    const doctorId = req.params.id;

    let doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      doctor = await Doctor.findOne({ userId: doctorId });
    }

    if (!doctor) {
      return res.status(404).json({ message: 'Doctor profile not found.' });
    }

    doctor.isVerified = true;
    doctor.status = 'approved';
    doctor.suspensionReason = null;
    doctor.suspendedAt = null;
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

// @desc    Decline / Reject a Doctor Verification Request
// @route   PUT /api/admin/doctors/:id/reject
// @access  Private/Admin
const rejectDoctor = async (req, res) => {
  try {
    const doctorId = req.params.id;
    const { reason } = req.body;

    let doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      doctor = await Doctor.findOne({ userId: doctorId });
    }

    if (!doctor) {
      return res.status(404).json({ message: 'Doctor profile not found.' });
    }

    doctor.isVerified = false;
    doctor.status = 'rejected';
    if (reason) {
      doctor.suspensionReason = reason;
    }
    await doctor.save();

    const populatedDoctor = await Doctor.findById(doctor._id).populate('userId', 'email isActive createdAt');

    res.json({
      success: true,
      message: `Application for Dr. ${doctor.firstName} ${doctor.lastName} has been declined.`,
      doctor: populatedDoctor
    });
  } catch (error) {
    console.error('Error rejecting doctor:', error);
    res.status(500).json({ message: 'Server error rejecting doctor.', error: error.message });
  }
};

// @desc    Suspend / Block a Doctor Account with Mandatory Reason Note
// @route   PUT /api/admin/doctors/:id/suspend
// @access  Private/Admin
const suspendDoctor = async (req, res) => {
  try {
    const doctorId = req.params.id;
    const { reason } = req.body;

    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      return res.status(400).json({ message: 'A mandatory suspension reason note is required.' });
    }

    let doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      doctor = await Doctor.findOne({ userId: doctorId });
    }

    if (!doctor) {
      return res.status(404).json({ message: 'Doctor profile not found.' });
    }

    doctor.status = 'suspended';
    doctor.suspensionReason = reason.trim();
    doctor.suspendedAt = new Date();
    await doctor.save();

    const populatedDoctor = await Doctor.findById(doctor._id).populate('userId', 'email isActive createdAt');

    res.json({
      success: true,
      message: `Doctor Dr. ${doctor.firstName} ${doctor.lastName} has been suspended/blocked.`,
      doctor: populatedDoctor
    });
  } catch (error) {
    console.error('Error suspending doctor:', error);
    res.status(500).json({ message: 'Server error suspending doctor.', error: error.message });
  }
};

// @desc    Unsuspend / Reinstate a Doctor Account
// @route   PUT /api/admin/doctors/:id/unsuspend
// @access  Private/Admin
const unsuspendDoctor = async (req, res) => {
  try {
    const doctorId = req.params.id;

    let doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      doctor = await Doctor.findOne({ userId: doctorId });
    }

    if (!doctor) {
      return res.status(404).json({ message: 'Doctor profile not found.' });
    }

    doctor.isVerified = true;
    doctor.status = 'approved';
    doctor.suspensionReason = null;
    doctor.suspendedAt = null;
    await doctor.save();

    const populatedDoctor = await Doctor.findById(doctor._id).populate('userId', 'email isActive createdAt');

    res.json({
      success: true,
      message: `Doctor Dr. ${doctor.firstName} ${doctor.lastName} has been reinstated and unblocked.`,
      doctor: populatedDoctor
    });
  } catch (error) {
    console.error('Error unsuspending doctor:', error);
    res.status(500).json({ message: 'Server error unsuspending doctor.', error: error.message });
  }
};

// @desc    Get All Registered Patients (Basic Details)
// @route   GET /api/admin/patients
// @access  Private/Admin
const getPatientsList = async (req, res) => {
  try {
    const patients = await Patient.find({})
      .populate('userId', 'email isActive createdAt')
      .sort({ createdAt: -1 });

    const formatted = patients.map(p => {
      const pObj = p.toObject();
      let addressDisplay = 'Not specified';
      if (pObj.address && typeof pObj.address === 'object') {
        const parts = [
          pObj.address.houseName,
          pObj.address.city,
          pObj.address.district,
          pObj.address.state,
          pObj.address.pincode
        ].filter(Boolean);
        addressDisplay = parts.join(', ');
      }
      pObj.addressDisplay = addressDisplay || 'Not specified';
      return pObj;
    });

    res.json({
      success: true,
      count: formatted.length,
      patients: formatted
    });
  } catch (error) {
    console.error('Error fetching patients list:', error);
    res.status(500).json({ message: 'Server error fetching patients.', error: error.message });
  }
};

module.exports = {
  getAdminStats,
  getDoctorVerificationRequests,
  getPatientsList,
  approveDoctor,
  rejectDoctor,
  suspendDoctor,
  unsuspendDoctor
};
