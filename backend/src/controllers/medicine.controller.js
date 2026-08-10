const fs = require('fs');
const path = require('path');

let medicinesData = null;

// Lazy-load medicines.json into memory on first search
const loadMedicinesData = () => {
  if (!medicinesData) {
    try {
      let jsonPath = path.join(__dirname, '../data/medicines.json');
      if (!fs.existsSync(jsonPath)) {
        jsonPath = path.join(__dirname, '../../../frontend/public/assets/data/medicines.json');
      }
      if (fs.existsSync(jsonPath)) {
        console.log('[MEDICINE CONTROLLER] Loading medicines.json dataset into memory from:', jsonPath);
        const rawData = fs.readFileSync(jsonPath, 'utf8');
        medicinesData = JSON.parse(rawData);
        console.log(`[MEDICINE CONTROLLER] Loaded ${medicinesData.length} medicines into index.`);
      } else {
        console.warn('[MEDICINE CONTROLLER] medicines.json file not found.');
        medicinesData = [];
      }
    } catch (err) {
      console.error('[MEDICINE CONTROLLER] Error loading medicines.json:', err.message);
      medicinesData = [];
    }
  }
  return medicinesData;
};

// Normalize common phonetic typos (e.g., parasetamol -> paracetamol)
const normalizeQuery = (q) => {
  let clean = q.trim().toLowerCase();
  clean = clean.replace(/setamol|cetemol|citamol|sitamol/g, 'cetamol');
  clean = clean.replace(/paracet|paraset|paracit|parasit/g, 'paracet');
  return clean;
};

// Top recognized fever brands & pure formulations
const topFeverBrands = ['dolo 650', 'dolo 500', 'calpol 500', 'crocin 650', 'paracip 650', 'paracetamol 500', 'paracetamol 650'];

// GET /api/medicines/search?q=query
const searchMedicines = async (req, res) => {
  try {
    const rawQuery = req.query.q || req.query.query || '';
    if (!rawQuery || rawQuery.trim().length < 2) {
      return res.json({ success: true, count: 0, medicines: [] });
    }

    const data = loadMedicinesData();
    const cleanQuery = normalizeQuery(rawQuery);

    const matches = [];
    for (let i = 0; i < data.length; i++) {
      const med = data[i];
      const name = (med.medicineName || '').toLowerCase();
      const comps = Array.isArray(med.composition) ? med.composition.map(c => c.toLowerCase()) : [];

      const nameMatch = name.includes(cleanQuery);
      const compMatch = comps.some(c => c.includes(cleanQuery));

      if (nameMatch || compMatch) {
        let score = 0;

        // Highest weight: medicine name starts with search query
        if (name.startsWith(cleanQuery)) {
          score += 100;
        } else if (nameMatch) {
          score += 60;
        }

        if (compMatch) {
          score += 40;
        }

        // Single active ingredient bonus (e.g. pure Paracetamol for fever vs combo NSAIDs/antispasmodics)
        if (comps.length === 1 && comps[0].includes(cleanQuery)) {
          score += 50;
        }

        // Top fever brands & standard dosages boost
        if (topFeverBrands.some(b => name.includes(b))) {
          score += 35;
        }

        matches.push({
          medicineId: med.medicineId,
          medicineName: med.medicineName,
          manufacturer: med.manufacturer || 'Standard Pharma',
          packSize: med.packSize || '10 Tablets',
          composition: med.composition || [],
          uses: med.uses || [],
          sideEffects: med.sideEffects || [],
          _score: score
        });
      }
    }

    // Sort by relevance score descending
    matches.sort((a, b) => b._score - a._score);

    // Pick top 15 results
    const topResults = matches.slice(0, 15).map(({ _score, ...med }) => med);

    res.json({
      success: true,
      count: topResults.length,
      medicines: topResults
    });
  } catch (err) {
    console.error('[MEDICINE SEARCH ERROR]:', err.message);
    res.status(500).json({ message: 'Error searching medicines dataset.', error: err.message });
  }
};

module.exports = {
  searchMedicines
};
