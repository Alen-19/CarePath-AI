const Specialty = require('../models/Specialty');
const { extractSymptoms } = require('../services/gemini.service');

// Hardcoded urgent keywords as a secondary safety net
const URGENT_KEYWORDS = [
  'severe chest pain', 'heart attack', 'unconscious', 'fainted', "can't breathe",
  'cant breathe', 'cannot breathe', 'severe breathing', 'loss of consciousness', 'stroke', 
  'face drooping', 'severe bleeding', 'uncontrolled bleeding', 'sudden weakness', 
  'sudden numbness', 'suicide', 'kill myself'
];

exports.analyzeSymptoms = async (req, res) => {
  try {
    const { description } = req.body;
    
    if (!description || description.trim().length < 5) {
      return res.json({
        needsMoreInformation: true,
        message: 'Please provide a more detailed description of your symptoms.'
      });
    }

    // 1. Hardcoded safety check (pre-AI)
    const lowerDesc = description.toLowerCase();
    const hasHardcodedUrgency = URGENT_KEYWORDS.some(kw => lowerDesc.includes(kw));

    // 2. Call Gemini for extraction
    const extractedData = await extractSymptoms(description);

    if (!extractedData) {
      return res.status(503).json({
        message: 'Unable to analyze symptoms right now. Please try again later.'
      });
    }

    if (extractedData.isOffTopic === true || extractedData.isOffTopic === 'true') {
      return res.json({
        isOffTopic: true,
        message: 'I am a clinical AI assistant designed to help match your symptoms to the right medical specialty. I cannot answer general questions. Please describe what you are experiencing health-wise.'
      });
    }

    // 3. Evaluate Urgency (AI OR Hardcoded)
    const geminiUrgent = extractedData.isPotentiallyUrgent === true || extractedData.isPotentiallyUrgent === 'true';
    const isUrgent = hasHardcodedUrgency || geminiUrgent;
    
    // Guarantee symptoms is a valid array to prevent crashes
    const safeSymptoms = Array.isArray(extractedData.symptoms) 
      ? extractedData.symptoms 
      : (extractedData.symptoms ? [extractedData.symptoms] : []);

    if (isUrgent) {
      return res.json({
        isUrgent: true,
        symptoms: safeSymptoms,
        specialties: [],
        message: 'Potentially urgent symptoms detected. Seek immediate medical attention or visit an emergency room.'
      });
    }

    // 4. Handle insufficient info
    if (safeSymptoms.length === 0 || (safeSymptoms.length === 1 && safeSymptoms[0].toLowerCase() === 'fatigue')) {
      return res.json({
        needsMoreInformation: true,
        symptoms: safeSymptoms,
        message: 'More information is needed to suggest a suitable specialty. How long have you been experiencing this?'
      });
    }

    // 5. Match symptoms to specialties
    const allSpecialties = await Specialty.find({});
    
    let scoredSpecialties = allSpecialties.map(spec => {
      let score = 0;
      safeSymptoms.forEach(sym => {
        const lowerSym = sym.toLowerCase();
        // Check if the specialty has matching symptom keywords
        const isMatch = spec.symptoms.some(s => s.toLowerCase().includes(lowerSym) || lowerSym.includes(s.toLowerCase()));
        if (isMatch) score += 1;
      });
      return { specialty: spec, score };
    });

    // Sort by score
    scoredSpecialties.sort((a, b) => b.score - a.score);

    // Keep those with a score > 0, up to top 3
    const matchedSpecialties = scoredSpecialties
      .filter(s => s.score > 0)
      .slice(0, 3)
      .map(s => ({
        name: s.specialty.name,
        description: s.specialty.description
      }));

    if (matchedSpecialties.length === 0) {
      // Fallback if no specific match
      const genMed = allSpecialties.find(s => s.name === 'General Medicine');
      if (genMed) {
        matchedSpecialties.push({ name: genMed.name, description: genMed.description });
      }
    }

    res.json({
      symptoms: safeSymptoms,
      duration: extractedData.duration,
      severity: extractedData.severity,
      isUrgent: false,
      specialties: matchedSpecialties
    });
    
  } catch (err) {
    console.error('[SYMPTOM ANALYZER ERROR]', err);
    res.status(500).json({ message: 'Internal server error during symptom analysis.' });
  }
};
