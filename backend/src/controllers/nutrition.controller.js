const Appointment = require('../models/Appointment');
const CarePlan = require('../models/CarePlan');
const FoodLog = require('../models/FoodLog');
const { fetchMealRecipes, analyzeFoodItemNutrition } = require('../services/edamam.service');
const { identifyFoodFromImage } = require('../services/gemini.service');
const fs = require('fs');

/**
 * GET /api/nutrition/meal-plan?appointmentId=...
 * Generates an Edamam-powered dynamic meal plan based on doctor's prescribed tags
 */
const getDynamicMealPlan = async (req, res) => {
  try {
    const { appointmentId } = req.query;

    let tags = ['High-Protein', 'Balanced'];
    let doctorNotes = null;

    if (appointmentId) {
      const appt = await Appointment.findById(appointmentId);
      if (appt && appt.clinicalNotes) {
        doctorNotes = appt.clinicalNotes;
        if (appt.clinicalNotes.nutritionalTags && appt.clinicalNotes.nutritionalTags.length > 0) {
          tags = appt.clinicalNotes.nutritionalTags;
        }
      }
    }

    // Fetch recipes for Breakfast, Lunch, and Dinner
    const [breakfasts, lunches, dinners] = await Promise.all([
      fetchMealRecipes('Breakfast', tags),
      fetchMealRecipes('Lunch', tags),
      fetchMealRecipes('Dinner', tags)
    ]);

    res.json({
      success: true,
      prescribedTags: tags,
      doctorNotes,
      mealPlan: {
        breakfast: breakfasts,
        lunch: lunches,
        dinner: dinners
      }
    });
  } catch (err) {
    console.error('Get dynamic meal plan error:', err);
    res.status(500).json({ message: 'Failed to generate dynamic meal plan.', error: err.message });
  }
};

/**
 * POST /api/nutrition/recognize-food
 * Recognizes dish name and suggested meal type from uploaded image using Gemini Vision
 */
const recognizeFoodImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No food image file provided.' });
    }

    const imageBuffer = req.file.buffer ? req.file.buffer : fs.readFileSync(req.file.path);
    const recognition = await identifyFoodFromImage(imageBuffer, req.file.mimetype);

    const relativeImageUrl = req.file.filename ? `/uploads/meals/${req.file.filename}` : null;

    res.json({
      success: true,
      dishName: recognition.dishName,
      suggestedMealType: recognition.suggestedMealType,
      ingredients: recognition.ingredients,
      confidence: recognition.confidence,
      imageUrl: relativeImageUrl
    });
  } catch (err) {
    console.error('Recognize food image error:', err);
    res.status(500).json({ message: 'Failed to recognize food image.', error: err.message });
  }
};

/**
 * POST /api/nutrition/log-meal
 * Logs a meal photo / recognized food item into the food_logs collection
 */
const logMeal = async (req, res) => {
  try {
    const { appointmentId, mealType, foodItemName, imageUrl, nutritionalData } = req.body;

    const newLog = await FoodLog.create({
      patientId: req.user._id,
      carePlanId: null,
      loggedDate: new Date().toISOString().split('T')[0],
      mealType: mealType || 'Lunch',
      foodItemName,
      imageUrl,
      nutritionalData: nutritionalData || {}
    });

    res.json({
      success: true,
      message: 'Meal logged successfully.',
      log: newLog
    });
  } catch (err) {
    console.error('Log meal error:', err);
    res.status(500).json({ message: 'Failed to log meal.', error: err.message });
  }
};

/**
 * POST /api/nutrition/analyze-food
 * Analyzes food name or Gemini Vision output using Edamam Food Database Parser API
 */
const analyzeFood = async (req, res) => {
  try {
    const { foodName } = req.body;
    if (!foodName) {
      return res.status(400).json({ message: 'foodName is required in request body.' });
    }

    const nutritionProfile = await analyzeFoodItemNutrition(foodName);

    if (nutritionProfile && nutritionProfile.isFood === false) {
      return res.status(400).json({
        success: false,
        message: nutritionProfile.error || `'${foodName}' is not recognized as an edible food dish.`
      });
    }

    res.json({
      success: true,
      data: nutritionProfile
    });
  } catch (err) {
    console.error('Analyze food error:', err);
    res.status(500).json({ message: 'Failed to analyze food item.', error: err.message });
  }
};

module.exports = {
  getDynamicMealPlan,
  recognizeFoodImage,
  logMeal,
  analyzeFood
};
