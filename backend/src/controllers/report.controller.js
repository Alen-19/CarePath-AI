const fs = require('fs');
const path = require('path');
const MedicalReport = require('../models/MedicalReport');
const Patient = require('../models/Patient');
const Doctor = require('../models/Doctor');
const Appointment = require('../models/Appointment');
const { analyzeMedicalReport } = require('../services/gemini.service');

/**
 * Upload and automatically analyze a medical report using Gemini Multimodal AI
 * POST /api/reports/upload
 */
const uploadReport = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please upload a PDF or image medical report file.' });
    }

    // Resolve patient
    let patient = null;
    if (req.user.role === 'patient') {
      patient = await Patient.findOne({ userId: req.user._id });
    } else if (req.body.patientId) {
      // Allow doctor to upload on patient's behalf during or after consultation
      patient = await Patient.findById(req.body.patientId);
    }

    if (!patient) {
      // Remove uploaded file if patient not found
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(404).json({ success: false, message: 'Patient profile not found.' });
    }

    // Read buffer for Gemini AI analysis
    const fileBuffer = fs.readFileSync(req.file.path);
    const mimeType = req.file.mimetype;
    const originalFilename = req.file.originalname;

    console.log(`[REPORT CONTROLLER] Analyzing uploaded file ${originalFilename} (${mimeType}, ${req.file.size} bytes) with Gemini AI...`);

    let aiAnalysisResult = null;
    try {
      aiAnalysisResult = await analyzeMedicalReport(fileBuffer, mimeType, originalFilename);
    } catch (aiErr) {
      console.error('[REPORT CONTROLLER] AI Analysis error:', aiErr.message);
      aiAnalysisResult = {
        status: 'Failed',
        summary: 'Automatic AI analysis encountered a temporary delay. File is safely stored.',
        clinicalImpression: 'Report uploaded successfully. Manual clinical review pending.',
        keyObservations: ['Report file archived in patient medical records vault.'],
        criticalAlerts: [],
        recommendedSpecialty: 'General Practice',
        biomarkers: []
      };
    }

    const fileUrl = `/uploads/reports/${req.file.filename}`;
    const { title, reportType, reportDate, appointmentId, doctorId, isSharedWithAllConsultingDoctors } = req.body;

    const linkedConsultationIds = [];
    const sharedWithDoctorIds = [];

    // Scenario B: Linked to specific consultation
    if (appointmentId) {
      linkedConsultationIds.push(appointmentId);
      const appt = await Appointment.findById(appointmentId);
      if (appt && appt.doctorId) {
        sharedWithDoctorIds.push(appt.doctorId);
      }
    }

    // Specific doctor assigned
    if (doctorId && !sharedWithDoctorIds.some(id => id.toString() === doctorId.toString())) {
      sharedWithDoctorIds.push(doctorId);
    }

    const newReport = new MedicalReport({
      patientId: patient._id,
      title: title && title.trim() ? title.trim() : originalFilename.replace(/\.[^/.]+$/, ''),
      reportType: reportType || 'Blood Test',
      reportDate: reportDate || new Date().toISOString().split('T')[0],
      fileUrl,
      fileType: mimeType,
      originalFilename,
      fileSize: req.file.size,
      aiAnalysis: aiAnalysisResult,
      linkedConsultationIds,
      sharedWithDoctorIds,
      isSharedWithAllConsultingDoctors: isSharedWithAllConsultingDoctors !== undefined 
        ? (isSharedWithAllConsultingDoctors === 'true' || isSharedWithAllConsultingDoctors === true)
        : true
    });

    await newReport.save();

    // If linked to consultation, append to Appointment.attachedReportIds
    if (appointmentId) {
      await Appointment.findByIdAndUpdate(appointmentId, {
        $addToSet: { attachedReportIds: newReport._id }
      });
    }

    const populatedReport = await MedicalReport.findById(newReport._id)
      .populate('sharedWithDoctorIds', 'firstName lastName specialization profileImage')
      .populate('linkedConsultationIds', 'appointmentDate startTime type status doctorId');

    return res.status(201).json({
      success: true,
      message: 'Medical report uploaded and analyzed successfully.',
      report: populatedReport
    });
  } catch (error) {
    console.error('[REPORT CONTROLLER] uploadReport fatal error:', error);
    // Cleanup orphaned file on failure
    if (req.file && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
    return res.status(500).json({ success: false, message: 'Server error processing medical report.' });
  }
};

/**
 * Get all reports for the logged in patient (Patient Records Vault)
 * GET /api/reports/my-reports
 */
const getMyReports = async (req, res) => {
  try {
    const patient = await Patient.findOne({ userId: req.user._id });
    if (!patient) {
      return res.status(404).json({ success: false, message: 'Patient profile not found.' });
    }

    const reports = await MedicalReport.find({ patientId: patient._id })
      .sort({ createdAt: -1 })
      .populate('sharedWithDoctorIds', 'firstName lastName specialization profileImage')
      .populate({
        path: 'linkedConsultationIds',
        select: 'appointmentDate startTime type status doctorId',
        populate: { path: 'doctorId', select: 'firstName lastName specialization' }
      });

    return res.json({
      success: true,
      count: reports.length,
      reports
    });
  } catch (error) {
    console.error('[REPORT CONTROLLER] getMyReports error:', error);
    return res.status(500).json({ success: false, message: 'Error retrieving patient reports.' });
  }
};

/**
 * Get a single report by ID with permissions check
 * GET /api/reports/:id
 */
const getReportById = async (req, res) => {
  try {
    const report = await MedicalReport.findById(req.params.id)
      .populate('patientId', 'firstName lastName dateOfBirth gender bloodGroup profileImage')
      .populate('sharedWithDoctorIds', 'firstName lastName specialization profileImage')
      .populate({
        path: 'linkedConsultationIds',
        select: 'appointmentDate startTime type status doctorId',
        populate: { path: 'doctorId', select: 'firstName lastName specialization' }
      });

    if (!report) {
      return res.status(404).json({ success: false, message: 'Medical report not found.' });
    }

    // Role-based authorization
    if (req.user.role === 'patient') {
      const patient = await Patient.findOne({ userId: req.user._id });
      if (!patient || report.patientId._id.toString() !== patient._id.toString()) {
        return res.status(403).json({ success: false, message: 'Access denied to this report.' });
      }
    } else if (req.user.role === 'doctor') {
      const doctor = await Doctor.findOne({ userId: req.user._id });
      if (!doctor) {
        return res.status(403).json({ success: false, message: 'Doctor profile not found.' });
      }

      const isDirectlyShared = report.sharedWithDoctorIds.some(
        doc => (doc._id || doc).toString() === doctor._id.toString()
      );

      if (!isDirectlyShared && !report.isSharedWithAllConsultingDoctors) {
        return res.status(403).json({ success: false, message: 'Patient has not granted access to this report.' });
      }
    }

    return res.json({ success: true, report });
  } catch (error) {
    console.error('[REPORT CONTROLLER] getReportById error:', error);
    return res.status(500).json({ success: false, message: 'Error fetching report details.' });
  }
};

/**
 * Toggle doctor access or overall consultation sharing (Scenario C: Multi-Doctor Patient-Centric)
 * PATCH /api/reports/:id/share
 */
const updateSharing = async (req, res) => {
  try {
    const patient = await Patient.findOne({ userId: req.user._id });
    if (!patient) {
      return res.status(404).json({ success: false, message: 'Patient not found.' });
    }

    const report = await MedicalReport.findOne({ _id: req.params.id, patientId: patient._id });
    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found or not owned by you.' });
    }

    const { doctorId, action, isSharedWithAllConsultingDoctors } = req.body;

    if (isSharedWithAllConsultingDoctors !== undefined) {
      report.isSharedWithAllConsultingDoctors = Boolean(isSharedWithAllConsultingDoctors);
    }

    if (doctorId && action) {
      const docIdStr = doctorId.toString();
      if (action === 'grant') {
        if (!report.sharedWithDoctorIds.some(id => id.toString() === docIdStr)) {
          report.sharedWithDoctorIds.push(doctorId);
        }
      } else if (action === 'revoke') {
        report.sharedWithDoctorIds = report.sharedWithDoctorIds.filter(id => id.toString() !== docIdStr);
      }
    }

    await report.save();

    const updated = await MedicalReport.findById(report._id)
      .populate('sharedWithDoctorIds', 'firstName lastName specialization profileImage')
      .populate('linkedConsultationIds');

    return res.json({
      success: true,
      message: 'Sharing permissions updated successfully.',
      report: updated
    });
  } catch (error) {
    console.error('[REPORT CONTROLLER] updateSharing error:', error);
    return res.status(500).json({ success: false, message: 'Error updating sharing settings.' });
  }
};

/**
 * Link an existing report to a consultation / appointment (Scenario B)
 * POST /api/reports/:id/link-consultation
 */
const linkConsultation = async (req, res) => {
  try {
    const { appointmentId } = req.body;
    if (!appointmentId) {
      return res.status(400).json({ success: false, message: 'appointmentId is required.' });
    }

    const appt = await Appointment.findById(appointmentId);
    if (!appt) {
      return res.status(404).json({ success: false, message: 'Appointment not found.' });
    }

    const report = await MedicalReport.findById(req.params.id);
    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found.' });
    }

    // Link both ways
    if (!report.linkedConsultationIds.some(id => id.toString() === appointmentId.toString())) {
      report.linkedConsultationIds.push(appointmentId);
    }
    if (appt.doctorId && !report.sharedWithDoctorIds.some(id => id.toString() === appt.doctorId.toString())) {
      report.sharedWithDoctorIds.push(appt.doctorId);
    }
    await report.save();

    await Appointment.findByIdAndUpdate(appointmentId, {
      $addToSet: { attachedReportIds: report._id }
    });

    const populated = await MedicalReport.findById(report._id)
      .populate('sharedWithDoctorIds', 'firstName lastName specialization profileImage')
      .populate('linkedConsultationIds');

    return res.json({
      success: true,
      message: 'Report linked to consultation successfully.',
      report: populated
    });
  } catch (error) {
    console.error('[REPORT CONTROLLER] linkConsultation error:', error);
    return res.status(500).json({ success: false, message: 'Error linking report to consultation.' });
  }
};

/**
 * Delete a report from vault
 * DELETE /api/reports/:id
 */
const deleteReport = async (req, res) => {
  try {
    const patient = await Patient.findOne({ userId: req.user._id });
    if (!patient) {
      return res.status(404).json({ success: false, message: 'Patient profile not found.' });
    }

    const report = await MedicalReport.findOne({ _id: req.params.id, patientId: patient._id });
    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found or not owned by you.' });
    }

    // Clean up physical file on disk
    if (report.fileUrl) {
      const filename = path.basename(report.fileUrl);
      const filePath = path.join(__dirname, '../../uploads/reports', filename);
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (e) {}
      }
    }

    // Remove reference from any appointments
    await Appointment.updateMany(
      { attachedReportIds: report._id },
      { $pull: { attachedReportIds: report._id } }
    );

    await MedicalReport.findByIdAndDelete(report._id);

    return res.json({ success: true, message: 'Medical report deleted successfully.' });
  } catch (error) {
    console.error('[REPORT CONTROLLER] deleteReport error:', error);
    return res.status(500).json({ success: false, message: 'Error deleting medical report.' });
  }
};

/**
 * Get all reports shared by a patient to a doctor (Clinician Longitudinal View)
 * GET /api/reports/patient/:patientId
 */
const getPatientReportsForDoctor = async (req, res) => {
  try {
    const doctor = await Doctor.findOne({ userId: req.user._id });
    if (!doctor) {
      return res.status(403).json({ success: false, message: 'Doctor profile not found.' });
    }

    const patientId = req.params.patientId;
    
    // Doctor can view if report is explicitly shared with them OR shared with all consulting doctors
    const query = {
      patientId,
      $or: [
        { isSharedWithAllConsultingDoctors: true },
        { sharedWithDoctorIds: doctor._id }
      ]
    };

    const reports = await MedicalReport.find(query)
      .sort({ createdAt: -1 })
      .populate('linkedConsultationIds', 'appointmentDate startTime type status');

    return res.json({
      success: true,
      count: reports.length,
      reports
    });
  } catch (error) {
    console.error('[REPORT CONTROLLER] getPatientReportsForDoctor error:', error);
    return res.status(500).json({ success: false, message: 'Error fetching patient reports.' });
  }
};

/**
 * Get reports attached to a specific consultation / appointment (Live Video Call View)
 * GET /api/reports/consultation/:appointmentId
 */
const getAppointmentReports = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const appt = await Appointment.findById(appointmentId);
    if (!appt) {
      return res.status(404).json({ success: false, message: 'Appointment not found.' });
    }

    // Find reports explicitly linked to this appointment or attached in appointment
    const reports = await MedicalReport.find({
      $or: [
        { linkedConsultationIds: appointmentId },
        { _id: { $in: appt.attachedReportIds || [] } }
      ]
    }).sort({ createdAt: -1 });

    return res.json({
      success: true,
      count: reports.length,
      reports
    });
  } catch (error) {
    console.error('[REPORT CONTROLLER] getAppointmentReports error:', error);
    return res.status(500).json({ success: false, message: 'Error fetching consultation reports.' });
  }
};

module.exports = {
  uploadReport,
  getMyReports,
  getReportById,
  updateSharing,
  linkConsultation,
  deleteReport,
  getPatientReportsForDoctor,
  getAppointmentReports
};
