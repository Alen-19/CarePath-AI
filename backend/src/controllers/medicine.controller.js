const fs = require('fs');
const path = require('path');

let medicinesData = null;

// Lazy-load medicines.json into memory on first search
const loadMedicinesData = () => {
  if (!medicinesData) {
    try {
      const jsonPath = path.join(__dirname, '../../../frontend/public/assets/data/medicines.json');
      if (fs.existsSync(jsonPath)) {
        console.log('[MEDICINE CONTROLLER] Loading medicines.json dataset into memory...');
        const rawData = fs.readFileSync(jsonPath, 'utf8');
        medicinesData = JSON.parse(rawData);
        console.log(`[MEDICINE CONTROLLER] Loaded ${medicinesData.length} medicines into index.`);
      } else {
        console.warn('[MEDICINE CONTROLLER] medicines.json file not found at:', jsonPath);
        medicinesData = [];
      }
    } catch (err) {
      console.error('[MEDICINE CONTROLLER] Error loading medicines.json:', err.message);
      medicinesData = [];
    }
  }
  return medicinesData;
};

// GET /api/medicines/search?q=query
const searchMedicines = async (req, res) => {
  try {
    const query = req.query.q || req.query.query || '';
    if (!query || query.trim().length < 2) {
      return res.json({ success: true, count: 0, medicines: [] });
    }

    const data = loadMedicinesData();
    const cleanQuery = query.trim().toLowerCase();

    // Fast search top 15 matches by medicineName or composition
    const matches = [];
    for (let i = 0; i < data.length; i++) {
      const med = data[i];
      const nameMatch = med.medicineName && med.medicineName.toLowerCase().includes(cleanQuery);
      const compMatch = med.composition && Array.isArray(med.composition) && med.composition.some(c => c.toLowerCase().includes(cleanQuery));

      if (nameMatch || compMatch) {
        matches.push({
          medicineId: med.medicineId,
          medicineName: med.medicineName,
          manufacturer: med.manufacturer || 'Standard Pharma',
          packSize: med.packSize || '10 Tablets',
          composition: med.composition || [],
          uses: med.uses || [],
          sideEffects: med.sideEffects || []
        });

        if (matches.length >= 15) break; // Limit to top 15 results for instant UI response
      }
    }

    res.json({
      success: true,
      count: matches.length,
      medicines: matches
    });
  } catch (err) {
    console.error('[MEDICINE SEARCH ERROR]:', err.message);
    res.status(500).json({ message: 'Error searching medicines dataset.', error: err.message });
  }
};

module.exports = {
  searchMedicines
};
