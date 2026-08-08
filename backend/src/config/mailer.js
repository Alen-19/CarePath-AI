const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');

// Path to logo_circle.png asset
const logoCirclePath = path.resolve(__dirname, '../../../frontend/public/assets/photos/logo_circle.png');
const hasLogoCircle = fs.existsSync(logoCirclePath);

// Create reusable transporter object using SMTP transport or Ethereal fallback
const createTransporter = async () => {
  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    return nodemailer.createTransport({
      service: process.env.EMAIL_SERVICE || 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
  }

  // Fallback to auto-created Ethereal test account if SMTP credentials not specified
  try {
    const testAccount = await nodemailer.createTestAccount();
    console.log(`[MAILER] Created temporary test SMTP account: ${testAccount.user}`);
    return nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass
      }
    });
  } catch (err) {
    console.error('[MAILER] Error creating test email account:', err);
    return null;
  }
};

const sendResetOtpEmail = async (toEmail, otp) => {
  try {
    const transporter = await createTransporter();
    if (!transporter) {
      console.error('[MAILER] Transporter unavailable. Cannot send email.');
      return false;
    }

    const logoHtml = hasLogoCircle 
      ? `<img src="cid:carepath_logo_circle" alt="CarePath AI Logo" style="width: 52px; height: 52px; border-radius: 50%; vertical-align: middle; object-fit: cover;" />`
      : `<span style="font-size: 24px; color: #ffffff; line-height: 46px; display: block;">✦</span>`;

    const htmlContent = `
      <div style="font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #08131f; color: #f8fafc; padding: 40px 20px; border-radius: 12px; max-width: 520px; margin: 0 auto; border: 1px solid rgba(0, 180, 216, 0.2);">
        <!-- Header with CarePath AI Logo Badge -->
        <div style="text-align: center; margin-bottom: 25px;">
          <table align="center" border="0" cellpadding="0" cellspacing="0" style="margin: 0 auto;">
            <tr>
              <td style="vertical-align: middle; text-align: center;">
                ${logoHtml}
              </td>
              <td style="padding-left: 14px; vertical-align: middle; text-align: left;">
                <span style="font-family: 'Plus Jakarta Sans', Arial, sans-serif; font-size: 26px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px; line-height: 1;">CarePath</span>
                <span style="font-family: 'Plus Jakarta Sans', Arial, sans-serif; font-size: 26px; font-weight: 800; color: #00b4d8; letter-spacing: -0.5px; line-height: 1; padding-left: 4px;">AI</span>
              </td>
            </tr>
          </table>
          <p style="color: #94a3b8; font-size: 13px; margin-top: 8px; font-weight: 500;">Continuous Medical Insights & Diagnostics</p>
        </div>

        <div style="background: rgba(13, 35, 58, 0.9); border: 1px solid rgba(0, 180, 216, 0.3); border-radius: 12px; padding: 25px; text-align: center;">
          <h2 style="font-size: 18px; color: #ffffff; margin-top: 0;">Password Reset Request</h2>
          <p style="color: #cbd5e1; font-size: 14px; line-height: 1.6;">
            We received a request to reset your password for your CarePath AI account registered to <strong>${toEmail}</strong>.
          </p>

          <div style="margin: 25px 0;">
            <span style="font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; display: block; margin-bottom: 8px;">Your 6-Digit Reset OTP</span>
            <div style="display: inline-block; background: #008094; color: #ffffff; font-size: 32px; font-weight: 800; letter-spacing: 6px; padding: 12px 28px; border-radius: 10px; box-shadow: 0 4px 14px rgba(0, 128, 148, 0.4);">
              ${otp}
            </div>
          </div>

          <p style="color: #f59e0b; font-size: 13px; margin-bottom: 0;">
            ⏳ This OTP code is valid for <strong>15 minutes</strong>. Do not share this code with anyone.
          </p>
        </div>

        <div style="text-align: center; margin-top: 25px; color: #64748b; font-size: 12px; line-height: 1.5;">
          If you did not request a password reset, please ignore this email or contact support at carepathaiadmin@gmail.com.<br>
          © 2026 CarePath AI Health System. All rights reserved.
        </div>
      </div>
    `;

    const attachments = [];
    if (hasLogoCircle) {
      attachments.push({
        filename: 'logo_circle.png',
        path: logoCirclePath,
        cid: 'carepath_logo_circle'
      });
    }

    const mailOptions = {
      from: '"CarePath AI Support" <carepathaiadmin@gmail.com>',
      to: toEmail,
      subject: `🔑 ${otp} is your CarePath AI Password Reset Code`,
      html: htmlContent,
      attachments
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`[MAILER] Password reset email sent successfully to ${toEmail}. Message ID: ${info.messageId}`);
    
    // If using ethereal preview URL
    if (nodemailer.getTestMessageUrl(info)) {
      console.log(`[MAILER] 📧 Preview Sent Email online: ${nodemailer.getTestMessageUrl(info)}`);
    }

    return true;
  } catch (error) {
    console.error(`[MAILER] Failed to send email to ${toEmail}:`, error);
    return false;
  }
};

const sendAppointmentReceiptEmail = async (details) => {
  try {
    const transporter = await createTransporter();
    if (!transporter) {
      console.error('[MAILER] Transporter unavailable. Cannot send receipt email.');
      return false;
    }

    const {
      patientEmail,
      patientName,
      doctorName,
      specialization,
      appointmentDate,
      startTime,
      endTime,
      consultationType,
      clinicAddress,
      paymentId,
      bookingRef,
      amountPaid,
      paidAt
    } = details;

    const formattedPaidAt = paidAt ? new Date(paidAt).toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }) : new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

    const logoHtml = hasLogoCircle 
      ? `<img src="cid:carepath_logo_circle" alt="CarePath AI Logo" style="width: 56px; height: 56px; border-radius: 50%; vertical-align: middle; object-fit: cover;" />`
      : `<span style="font-size: 24px; color: #ffffff; line-height: 46px; display: block;">✦</span>`;

    const htmlContent = `
      <div style="font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b1329; color: #f8fafc; padding: 40px 20px; max-width: 600px; margin: 0 auto; border-radius: 16px; border: 1px solid rgba(0, 180, 216, 0.25);">
        
        <!-- Header with CarePath AI Logo Badge -->
        <div style="text-align: center; padding-bottom: 24px; border-bottom: 1px solid rgba(255, 255, 255, 0.1); margin-bottom: 24px;">
          <table align="center" border="0" cellpadding="0" cellspacing="0" style="margin: 0 auto;">
            <tr>
              <td style="vertical-align: middle; text-align: center;">
                ${logoHtml}
              </td>
              <td style="padding-left: 14px; vertical-align: middle; text-align: left;">
                <span style="font-family: 'Plus Jakarta Sans', Arial, sans-serif; font-size: 28px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px; line-height: 1;">CarePath</span>
                <span style="font-family: 'Plus Jakarta Sans', Arial, sans-serif; font-size: 28px; font-weight: 800; color: #00b4d8; letter-spacing: -0.5px; line-height: 1; padding-left: 4px;">AI</span>
              </td>
            </tr>
          </table>
          <p style="color: #94a3b8; font-size: 13px; margin: 10px 0 0 0; font-weight: 500; letter-spacing: 0.2px;">Official Payment & Consultation Booking Receipt</p>
        </div>

        <!-- Status Badge -->
        <div style="background: rgba(34, 197, 94, 0.12); border: 1px solid rgba(34, 197, 94, 0.3); border-radius: 12px; padding: 16px 20px; text-align: center; margin-bottom: 24px;">
          <span style="display: inline-block; font-size: 20px; margin-right: 6px;">✓</span>
          <strong style="color: #4ade80; font-size: 16px;">Booking & Payment Confirmed</strong>
          <p style="color: #cbd5e1; font-size: 13px; margin: 4px 0 0 0;">Transaction completed via Razorpay on ${formattedPaidAt}</p>
        </div>

        <!-- Receipt Information Table -->
        <div style="background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; padding: 20px; margin-bottom: 24px;">
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr>
              <td style="padding: 8px 0; color: #94a3b8;">Receipt Reference #:</td>
              <td style="padding: 8px 0; color: #ffffff; font-weight: 700; text-align: right; font-family: monospace; font-size: 15px;">${bookingRef || 'CP-' + Date.now().toString().slice(-6)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #94a3b8;">Razorpay Payment ID:</td>
              <td style="padding: 8px 0; color: #38bdf8; font-weight: 600; text-align: right; font-family: monospace; font-size: 13px;">${paymentId || 'pay_demo_confirmed'}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #94a3b8;">Patient Name:</td>
              <td style="padding: 8px 0; color: #ffffff; font-weight: 600; text-align: right;">${patientName}</td>
            </tr>
          </table>
        </div>

        <!-- Appointment Card -->
        <div style="background: linear-gradient(135deg, rgba(14, 116, 144, 0.25) 0%, rgba(15, 23, 42, 0.9) 100%); border: 1px solid rgba(6, 182, 212, 0.35); border-radius: 14px; padding: 22px; margin-bottom: 24px;">
          <h3 style="color: #38bdf8; font-size: 15px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 16px 0;">
            🩺 Scheduled Appointment Details
          </h3>

          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr>
              <td style="padding: 10px 0; color: #94a3b8; width: 40%;">Attending Doctor:</td>
              <td style="padding: 10px 0; color: #ffffff; font-weight: 700; text-align: right; font-size: 16px;">
                ${doctorName}
                <div style="font-size: 12px; color: #38bdf8; font-weight: normal; margin-top: 2px;">${specialization || 'General Physician'}</div>
              </td>
            </tr>
            <tr style="border-top: 1px dashed rgba(255, 255, 255, 0.1);">
              <td style="padding: 10px 0; color: #94a3b8;">Appointment Date:</td>
              <td style="padding: 10px 0; color: #ffffff; font-weight: 600; text-align: right;">${appointmentDate}</td>
            </tr>
            <tr style="border-top: 1px dashed rgba(255, 255, 255, 0.1);">
              <td style="padding: 10px 0; color: #94a3b8;">Time Slot:</td>
              <td style="padding: 10px 0; color: #4ade80; font-weight: 700; text-align: right;">${startTime} - ${endTime}</td>
            </tr>
            <tr style="border-top: 1px dashed rgba(255, 255, 255, 0.1);">
              <td style="padding: 10px 0; color: #94a3b8;">Consultation Type:</td>
              <td style="padding: 10px 0; color: #f59e0b; font-weight: 600; text-align: right;">${consultationType || 'General Consultation'}</td>
            </tr>
            ${clinicAddress ? `
            <tr style="border-top: 1px dashed rgba(255, 255, 255, 0.1);">
              <td style="padding: 10px 0; color: #94a3b8;">Clinic Address:</td>
              <td style="padding: 10px 0; color: #cbd5e1; text-align: right; font-size: 13px;">${clinicAddress}</td>
            </tr>
            ` : ''}
          </table>
        </div>

        <!-- Payment Breakdown Table -->
        <div style="background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; padding: 20px; margin-bottom: 24px;">
          <h3 style="color: #ffffff; font-size: 14px; margin: 0 0 12px 0;">Payment Breakdown</h3>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr>
              <td style="padding: 6px 0; color: #94a3b8;">Doctor Consultation Fee:</td>
              <td style="padding: 6px 0; color: #ffffff; text-align: right;">₹${amountPaid}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #94a3b8;">AI Platform & Diagnostics Fee:</td>
              <td style="padding: 6px 0; color: #4ade80; text-align: right;">FREE (Included)</td>
            </tr>
            <tr style="border-top: 1px solid rgba(255, 255, 255, 0.15);">
              <td style="padding: 12px 0 4px 0; color: #ffffff; font-weight: 700; font-size: 16px;">Total Paid:</td>
              <td style="padding: 12px 0 4px 0; color: #00b4d8; font-weight: 800; text-align: right; font-size: 20px;">₹${amountPaid}</td>
            </tr>
          </table>
        </div>

        <!-- Patient Instructions -->
        <div style="background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.25); border-radius: 12px; padding: 16px; margin-bottom: 24px; font-size: 13px; color: #bfdbfe; line-height: 1.6;">
          📌 <strong>Important Instructions for Patient:</strong>
          <ul style="margin: 8px 0 0 0; padding-left: 20px;">
            <li>Please log in to your CarePath AI Patient Dashboard 5–10 minutes before your scheduled appointment time.</li>
            <li>For online consultations, click the <strong>"Join Video Call"</strong> button when your slot starts.</li>
            <li>Keep any previous medical prescriptions or diagnostic reports handy for reference during your consultation.</li>
          </ul>
        </div>

        <!-- Footer -->
        <div style="text-align: center; color: #64748b; font-size: 12px; line-height: 1.5; border-top: 1px solid rgba(255, 255, 255, 0.1); padding-top: 20px;">
          Need help or need to reschedule? Contact CarePath AI Patient Care at <a href="mailto:carepathaiadmin@gmail.com" style="color: #38bdf8; text-decoration: underline;">carepathaiadmin@gmail.com</a><br>
          © 2026 CarePath AI Digital Health Technologies. All rights reserved.
        </div>

      </div>
    `;

    const attachments = [];
    if (hasLogoCircle) {
      attachments.push({
        filename: 'logo_circle.png',
        path: logoCirclePath,
        cid: 'carepath_logo_circle'
      });
    }

    const mailOptions = {
      from: '"CarePath AI Booking" <carepathaiadmin@gmail.com>',
      to: patientEmail,
      subject: `📄 Booking Receipt Confirmed - ${doctorName} (${appointmentDate})`,
      html: htmlContent,
      attachments
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`[MAILER] Appointment receipt email sent to ${patientEmail}. Message ID: ${info.messageId}`);
    
    if (nodemailer.getTestMessageUrl(info)) {
      console.log(`[MAILER] 📧 Receipt Email Preview Link: ${nodemailer.getTestMessageUrl(info)}`);
    }

    return true;
  } catch (error) {
    console.error('[MAILER] Failed to send appointment receipt email:', error);
    return false;
  }
};

const sendPrescriptionEmail = async (patientEmail, patientName, doctorName, specialty, prescriptionList, dateStr) => {
  try {
    const transporter = await createTransporter();
    if (!transporter) return false;

    const logoHtml = hasLogoCircle 
      ? `<img src="cid:carepath_logo_circle" alt="CarePath AI Logo" style="width: 52px; height: 52px; border-radius: 50%; vertical-align: middle; object-fit: cover;" />`
      : `<span style="font-size: 24px; color: #2563EB;">✦</span>`;

    const medsTableRows = prescriptionList.map((m, idx) => `
      <tr style="border-bottom: 1px solid #E2E8F0;">
        <td style="padding: 12px; font-weight: 700; color: #0F172A;">${idx + 1}. ${m.medicineName}</td>
        <td style="padding: 12px; color: #2563EB; font-weight: 700; text-align: center;">${m.dosage}</td>
        <td style="padding: 12px; color: #64748B; text-align: center;">${m.duration}</td>
        <td style="padding: 12px; color: #475569; font-size: 0.85rem;">${m.instructions || 'After food'}</td>
      </tr>
    `).join('');

    const htmlContent = `
      <div style="font-family: 'Plus Jakarta Sans', -apple-system, sans-serif; background-color: #F8FAFC; color: #0F172A; padding: 40px 20px; max-width: 600px; margin: 0 auto; border: 1px solid #E2E8F0; border-radius: 16px;">
        <div style="text-align: center; margin-bottom: 20px;">
          ${logoHtml}
          <h2 style="color: #2563EB; margin: 10px 0 2px;">CarePath AI E-Prescription</h2>
          <p style="color: #64748B; font-size: 0.85rem; margin: 0;">Official Digital Clinical Prescription</p>
        </div>

        <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
          <table width="100%" style="font-size: 0.9rem;">
            <tr>
              <td><strong>Patient:</strong> ${patientName}</td>
              <td align="right"><strong>Date:</strong> ${dateStr}</td>
            </tr>
            <tr>
              <td><strong>Prescribing Doctor:</strong> ${doctorName} (${specialty})</td>
              <td align="right"><strong>Rx Code:</strong> <span style="color: #2563EB; font-family: monospace;">CP-RX-${Date.now().toString().slice(-6)}</span></td>
            </tr>
          </table>
        </div>

        <h3 style="color: #0F172A; font-size: 1rem; margin-bottom: 10px;">💊 Prescribed Medications</h3>
        <table width="100%" style="border-collapse: collapse; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 10px; overflow: hidden; margin-bottom: 25px;">
          <thead>
            <tr style="background: #EFF6FF; color: #2563EB; font-size: 0.82rem; text-transform: uppercase;">
              <th style="padding: 10px; text-align: left;">Medicine</th>
              <th style="padding: 10px; text-align: center;">Frequency</th>
              <th style="padding: 10px; text-align: center;">Duration</th>
              <th style="padding: 10px; text-align: left;">Instructions</th>
            </tr>
          </thead>
          <tbody>
            ${medsTableRows}
          </tbody>
        </table>

        <div style="background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 10px; padding: 15px; font-size: 0.82rem; color: #15803D; margin-bottom: 20px;">
          ✔ Verified by <strong>${doctorName}</strong>. Please follow all dosage timings specified above. Contact carepathaiadmin@gmail.com for support.
        </div>
      </div>
    `;

    const attachments = [];
    if (hasLogoCircle) {
      attachments.push({ filename: 'logo_circle.png', path: logoCirclePath, cid: 'carepath_logo_circle' });
    }

    await transporter.sendMail({
      from: '"CarePath AI Clinical Team" <carepathaiadmin@gmail.com>',
      to: patientEmail,
      subject: `💊 Digital E-Prescription Issued by ${doctorName}`,
      html: htmlContent,
      attachments
    });

    console.log(`[MAILER] Prescription email successfully sent to ${patientEmail}`);
    return true;
  } catch (err) {
    console.error('[MAILER] Failed to send prescription email:', err);
    return false;
  }
};

module.exports = {
  sendResetOtpEmail,
  sendAppointmentReceiptEmail,
  sendPrescriptionEmail
};
