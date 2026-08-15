const https = require('https');
const path = require('path');
const fs = require('fs');

// HTTPS Agent with relaxed SSL for government portal communication
const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

// Load 46 Indian State Medical Councils
let councilsList = [];
try {
  const councilsPath = path.join(__dirname, '..', 'data', 'councils.json');
  if (fs.existsSync(councilsPath)) {
    councilsList = JSON.parse(fs.readFileSync(councilsPath, 'utf8'));
  }
} catch (e) {
  console.error('[NMC Controller] Error loading councils.json:', e);
}

/**
 * @desc Get Indian State Medical Councils List
 * @route GET /api/admin/nmc/councils
 * @access Private (Admin)
 */
exports.getCouncils = (req, res) => {
  res.json({
    success: true,
    councils: councilsList
  });
};

/**
 * @desc Live Search NMC Indian Medical Register
 * @route GET /api/admin/nmc/search
 * @access Private (Admin)
 */
exports.searchNMC = async (req, res) => {
  try {
    const { name = '', registrationNo = '', smcId = '', year = '', start = 0, length = 50 } = req.query;

    const params = new URLSearchParams();
    params.append('service', 'getPaginatedDoctor');
    params.append('draw', '1');
    params.append('start', start.toString());
    params.append('length', length.toString());

    if (name && name.trim()) {
      params.append('name', name.trim());
    }
    if (registrationNo && registrationNo.trim()) {
      params.append('registrationNo', registrationNo.trim());
    }
    if (smcId && smcId.trim()) {
      params.append('smcId', smcId.trim());
    }
    if (year && year.trim()) {
      params.append('year', year.trim());
    }

    const targetUrl = `https://www.nmc.org.in/MCIRest/open/getPaginatedData?${params.toString()}`;

    const nmcReq = https.request(targetUrl, {
      method: 'GET',
      agent: httpsAgent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Referer': 'https://www.nmc.org.in/information-desk/indian-medical-register/'
      },
      timeout: 25000
    }, (nmcRes) => {
      let data = '';
      nmcRes.on('data', (chunk) => { data += chunk; });
      nmcRes.on('end', () => {
        try {
          if (!data || !data.trim()) {
            return res.json({
              success: true,
              source: 'National Medical Commission (NMC) Live Register',
              recordsTotal: 0,
              recordsFiltered: 0,
              data: []
            });
          }

          let parsed;
          try {
            parsed = JSON.parse(data);
            if (typeof parsed === 'string') {
              parsed = JSON.parse(parsed);
            }
          } catch (jsonErr) {
            console.warn('[NMC Controller] NMC returned non-JSON payload:', data.slice(0, 150));
            return res.json({
              success: true,
              source: 'National Medical Commission (NMC) Live Register',
              recordsTotal: 0,
              recordsFiltered: 0,
              data: [],
              notice: 'No matching records returned from National Medical Commission register.'
            });
          }

          const rawData = (parsed && Array.isArray(parsed.data)) ? parsed.data : [];

          const structured = rawData.map((item, index) => {
            // Raw item: [sno, year, regNo, council, name, fatherName, actionHtml]
            const sno = item[0] || (index + 1);
            const regYear = item[1] || 'N/A';
            const regNo = item[2] || 'N/A';
            const council = item[3] || 'N/A';
            const docName = item[4] || 'N/A';
            const fatherName = item[5] || 'N/A';
            const actionHtml = item[6] || '';

            let doctorId = '';
            const idMatch = actionHtml.match(/openDoctorDetails(?:new)?\s*\(\s*['"]([^'"]+)['"]/i);
            if (idMatch) {
              doctorId = idMatch[1];
            }

            return {
              sno,
              year: regYear,
              registrationNo: regNo,
              council,
              name: docName,
              fatherName,
              doctorId,
              actionHtml
            };
          });

          return res.json({
            success: true,
            source: 'National Medical Commission (NMC) Live Register',
            recordsTotal: parsed.recordsTotal || structured.length,
            recordsFiltered: parsed.recordsFiltered || structured.length,
            data: structured
          });
        } catch (parseErr) {
          console.error('[NMC Controller] Unexpected processing error:', parseErr);
          return res.json({
            success: true,
            source: 'National Medical Commission (NMC) Live Register',
            recordsTotal: 0,
            recordsFiltered: 0,
            data: []
          });
        }
      });
    });

    nmcReq.on('error', (err) => {
      console.error('[NMC Controller] Request Error:', err);
      return res.status(500).json({
        success: false,
        error: `Unable to connect to NMC gateway: ${err.message}`
      });
    });

    nmcReq.end();
  } catch (err) {
    console.error('[NMC Controller] Internal error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * @desc Get Full Doctor Verified Credentials by ID
 * @route POST /api/admin/nmc/doctor-details
 * @access Private (Admin)
 */
exports.getNMCDoctorDetails = (req, res) => {
  try {
    const { doctorId, regdNoValue } = req.body;
    if (!doctorId) {
      return res.status(400).json({ success: false, error: 'Doctor ID is required' });
    }

    const postData = JSON.stringify({
      doctorId: doctorId.toString(),
      regdNoValue: (regdNoValue || '').toString()
    });

    const nmcReq = https.request('https://www.nmc.org.in/MCIRest/open/getDataFromService?service=getDoctorDetailsByIdImrExt', {
      method: 'POST',
      agent: httpsAgent,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.nmc.org.in/information-desk/indian-medical-register/'
      },
      timeout: 20000
    }, (nmcRes) => {
      let data = '';
      nmcRes.on('data', (chunk) => { data += chunk; });
      nmcRes.on('end', () => {
        try {
          let parsed = JSON.parse(data);
          if (typeof parsed === 'string') {
            parsed = JSON.parse(parsed);
          }
          return res.json({
            success: true,
            details: parsed
          });
        } catch (e) {
          console.error('[NMC Controller] Error parsing doctor details:', e, data);
          return res.status(502).json({
            success: false,
            error: 'Failed to parse doctor details from NMC',
            raw: data.slice(0, 200)
          });
        }
      });
    });

    nmcReq.on('error', (err) => {
      console.error('[NMC Controller] Details Request Error:', err);
      return res.status(500).json({ success: false, error: err.message });
    });

    nmcReq.write(postData);
    nmcReq.end();
  } catch (err) {
    console.error('[NMC Controller] Internal error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};
