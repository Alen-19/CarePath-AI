const Specialty = require('../models/Specialty');

const SPECIALTIES_DATA = [
  {
    name: 'General Medicine',
    description: 'Provides comprehensive medical care for adults, diagnosing and treating a wide range of conditions.',
    symptoms: ['fever', 'fatigue', 'cough', 'cold', 'body ache', 'mild headache', 'nausea', 'weakness', 'chills']
  },
  {
    name: 'Cardiology',
    description: 'Specializes in the heart and cardiovascular system.',
    symptoms: ['chest pain', 'palpitations', 'irregular heartbeat', 'high blood pressure', 'shortness of breath', 'dizziness', 'fainting']
  },
  {
    name: 'Dermatology',
    description: 'Focuses on conditions related to the skin, hair, and nails.',
    symptoms: ['rash', 'itchy skin', 'acne', 'hair loss', 'skin lesions', 'moles', 'hives', 'dry skin']
  },
  {
    name: 'Orthopedics',
    description: 'Treats disorders of the bones, joints, ligaments, tendons, and muscles.',
    symptoms: ['joint pain', 'back pain', 'bone fracture', 'muscle strain', 'knee pain', 'stiffness', 'swelling in joints']
  },
  {
    name: 'Neurology',
    description: 'Deals with disorders of the nervous system, including the brain and spinal cord.',
    symptoms: ['severe headache', 'migraine', 'seizures', 'numbness', 'tingling', 'memory loss', 'tremors', 'muscle weakness']
  },
  {
    name: 'ENT (Otolaryngology)',
    description: 'Specializes in conditions of the ear, nose, and throat.',
    symptoms: ['earache', 'hearing loss', 'sore throat', 'sinus congestion', 'runny nose', 'tinnitus', 'swallowing difficulty']
  },
  {
    name: 'Gastroenterology',
    description: 'Focuses on the digestive system and its disorders.',
    symptoms: ['stomach pain', 'acid reflux', 'heartburn', 'chronic diarrhea', 'constipation', 'bloating', 'blood in stool', 'vomiting']
  },
  {
    name: 'Pulmonology',
    description: 'Treats conditions affecting the respiratory system, including the lungs.',
    symptoms: ['chronic cough', 'wheezing', 'asthma', 'breathing difficulty', 'chest tightness', 'phlegm']
  },
  {
    name: 'Ophthalmology',
    description: 'Specializes in eye and vision care.',
    symptoms: ['blurry vision', 'eye pain', 'red eyes', 'dry eyes', 'vision loss', 'light sensitivity']
  },
  {
    name: 'Urology',
    description: 'Focuses on diseases of the urinary-tract system and male reproductive organs.',
    symptoms: ['painful urination', 'frequent urination', 'blood in urine', 'lower abdominal pain', 'kidney stones', 'pelvic pain']
  },
  {
    name: 'Gynecology',
    description: 'Specializes in the female reproductive system and women\'s health.',
    symptoms: ['irregular periods', 'pelvic pain', 'heavy bleeding', 'cramps', 'vaginal discharge', 'hot flashes']
  },
  {
    name: 'Endocrinology',
    description: 'Deals with the endocrine system, its diseases, and its specific secretions known as hormones.',
    symptoms: ['excessive thirst', 'frequent urination', 'unexplained weight loss', 'unexplained weight gain', 'thyroid issues', 'hormonal imbalance']
  },
  {
    name: 'Psychiatry',
    description: 'Focuses on the diagnosis, treatment, and prevention of mental, emotional, and behavioral disorders.',
    symptoms: ['anxiety', 'depression', 'mood swings', 'insomnia', 'panic attacks', 'hallucinations', 'suicidal thoughts']
  },
  {
    name: 'Pediatrics',
    description: 'Provides medical care for infants, children, and adolescents.',
    symptoms: ['child fever', 'vaccination', 'growth issues', 'childhood asthma', 'bedwetting', 'child rash']
  },
  {
    name: 'Dentistry',
    description: 'Focuses on diagnosing and treating conditions of the oral cavity and teeth.',
    symptoms: ['toothache', 'bleeding gums', 'cavities', 'jaw pain', 'sensitive teeth', 'bad breath']
  }
];

const seedSpecialties = async () => {
  try {
    const count = await Specialty.countDocuments();
    if (count === 0) {
      console.log('[SEED] Seeding Specialties database...');
      await Specialty.insertMany(SPECIALTIES_DATA);
      console.log('[SEED] 15 Specialties successfully seeded.');
    }
  } catch (error) {
    console.error('[SEED ERROR] Failed to seed specialties:', error);
  }
};

module.exports = { seedSpecialties };
