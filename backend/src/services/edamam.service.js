const axios = require('axios');

/**
 * 🥗 Edamam Recipe Search & Nutritional CarePath Service
 * Connects to Edamam Recipe Search API v2 with intelligent fallback clinical recipes
 */

const EDAMAM_BASE_URL = 'https://api.edamam.com/api/recipes/v2';

/**
 * Map Clinical Tags to Edamam Nutrient Filter Ranges
 */
function mapTagsToEdamamNutrients(tags = []) {
  const nutrients = {};

  for (const tag of tags) {
    const lower = tag.toLowerCase();

    if (lower.includes('high-protein')) {
      nutrients['PROCNT'] = '25+'; // 25g+ protein per serving
    } else if (lower.includes('low-protein')) {
      nutrients['PROCNT'] = '1-10';
    }

    if (lower.includes('low-sodium')) {
      nutrients['NA'] = '0-400'; // Under 400mg sodium
    }

    if (lower.includes('diabetic') || lower.includes('low-carbs') || lower.includes('low-gi')) {
      nutrients['CHOCDF'] = '5-30'; // Low glycemic index / low carb
    }

    if (lower.includes('high-fiber')) {
      nutrients['FIBTG'] = '8+'; // 8g+ dietary fiber
    }

    if (lower.includes('high-iron')) {
      nutrients['FE'] = '4+'; // 4mg+ iron
    }

    if (lower.includes('calcium')) {
      nutrients['CA'] = '300+'; // 300mg+ calcium
    }
  }

  return nutrients;
}

const { generateClinicalRecipesWithGemini } = require('./gemini.service');

/**
 * Fetch condition-tailored clinical recipes using Gemini AI Clinical Recipe Engine
 * with hyper-local regional customization and instant fallback.
 */
async function fetchMealRecipes(mealType = 'Breakfast', tags = [], doctorRemarks = '', patientRegion = 'Kerala, India') {
  try {
    // 1. Synthesize smart therapeutic clinical recipes using Gemini AI with local regional adaptation
    const aiRecipes = await generateClinicalRecipesWithGemini(mealType, tags, doctorRemarks, patientRegion);
    if (aiRecipes && aiRecipes.length > 0) {
      return aiRecipes;
    }
  } catch (err) {
    console.warn(`[CLINICAL RECIPES] AI generation fallback for ${mealType}:`, err.message);
  }

  // 2. Curated condition-specific fallback dictionary
  return getClinicalFallbackRecipes(mealType, tags);
}

/**
 * High-quality curated clinical fallbacks when offline or quota exceeded
 */
function getClinicalFallbackRecipes(mealType, tags = []) {
  const isHighProtein = tags.some(t => t.toLowerCase().includes('protein'));
  const isLowSodium = tags.some(t => t.toLowerCase().includes('sodium'));
  const isLowGI = tags.some(t => t.toLowerCase().includes('diabetic') || t.toLowerCase().includes('carb'));
  const isHighIron = tags.some(t => t.toLowerCase().includes('iron'));

  if (mealType === 'Breakfast') {
    if (isHighProtein) {
      return [
        {
          title: 'Paneer & Sprout Stuffed Besan Chilla',
          image: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=500&auto=format&fit=crop&q=60',
          calories: 320,
          protein: 22,
          carbs: 24,
          fat: 12,
          sodium: 210,
          ingredients: ['1 cup Gram flour (Besan)', '50g Grated paneer', '1/4 cup Sprouted moong', 'Fresh coriander & green chili', '1 tsp Olive oil']
        }
      ];
    } else if (isHighIron) {
      return [
        {
          title: 'Spinach-Ragi Porridge with Pomegranate',
          image: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=500&auto=format&fit=crop&q=60',
          calories: 280,
          protein: 9,
          carbs: 45,
          fat: 4,
          sodium: 95,
          ingredients: ['1/2 cup Ragi flour', '1 cup Blanched spinach puree', '1/4 cup Pomegranate seeds', '1 tsp Jaggery', '1 glass Low-fat milk']
        }
      ];
    } else {
      return [
        {
          title: 'Rolled Oats with Almond Milk & Chia',
          image: 'https://images.unsplash.com/photo-1584776296944-ab6fb57b0bdd?w=500&auto=format&fit=crop&q=60',
          calories: 290,
          protein: 11,
          carbs: 42,
          fat: 8,
          sodium: 110,
          ingredients: ['1/2 cup Rolled oats', '1 cup Almond milk', '1 tbsp Chia seeds', '1 sliced Banana', 'Handful of unsalted walnuts']
        }
      ];
    }
  }

  if (mealType === 'Lunch') {
    if (isLowSodium) {
      return [
        {
          title: 'Zero-Salt Tadka Dal with Steamed Millets & Lauki',
          image: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=500&auto=format&fit=crop&q=60',
          calories: 380,
          protein: 18,
          carbs: 58,
          fat: 6,
          sodium: 120,
          ingredients: ['1 cup Yellow Moong Dal', '1/2 cup Foxtail millet', '1 cup Diced Bottle Gourd', 'Lemon juice & Cumin tadka', 'Fresh cilantro']
        }
      ];
    } else if (isHighProtein) {
      return [
        {
          title: 'Grilled Herb Chicken / Soya Rice Bowl',
          image: 'https://images.unsplash.com/photo-1543339308-43e59d6b73a6?w=500&auto=format&fit=crop&q=60',
          calories: 450,
          protein: 38,
          carbs: 42,
          fat: 11,
          sodium: 310,
          ingredients: ['150g Chicken breast / Soya chunks', '1/2 cup Brown rice', '1 cup Steamed broccoli', '1 tsp Olive oil & garlic', 'Cucumber salad']
        }
      ];
    } else {
      return [
        {
          title: 'Palak Dal Tadka with Phulka & Curd',
          image: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=500&auto=format&fit=crop&q=60',
          calories: 410,
          protein: 19,
          carbs: 55,
          fat: 9,
          sodium: 260,
          ingredients: ['1 cup Toor dal with fresh spinach', '2 Whole wheat phulkas', '1/2 cup Homemade low-fat curd', 'Cumin & garlic seasoning']
        }
      ];
    }
  }

  // Dinner fallback
  return [
    {
      title: 'Light Quinoa-Moong Khichdi with Steamed Veggies',
      image: 'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=500&auto=format&fit=crop&q=60',
      calories: 310,
      protein: 14,
      carbs: 48,
      fat: 5,
      sodium: 180,
      ingredients: ['1/2 cup Quinoa', '1/2 cup Yellow moong dal', 'Diced carrots, beans, and peas', '1 tsp Ghee & turmeric', '1 bowl Clear vegetable soup']
    }
  ];
}

/**
 * Analyze a specific food item's nutrition using Gemini AI and Edamam Food Database Parser API
 * (Used for Gemini Vision Photo Tracker)
 */
async function analyzeFoodItemNutrition(foodItemName) {
  if (!foodItemName) {
    throw new Error('Food item name is required for nutritional analysis.');
  }

  // 1. Primary: Use Gemini AI for dynamic, highly accurate clinical nutrition
  try {
    const { calculateDishMacrosWithGemini } = require('./gemini.service');
    const geminiMacros = await calculateDishMacrosWithGemini(foodItemName);
    if (geminiMacros) {
      if (geminiMacros.isFood === false) {
        return {
          isFood: false,
          error: geminiMacros.error || `'${foodItemName}' is not recognized as an edible food or dish.`
        };
      }
      if (geminiMacros.calories > 0) {
        return geminiMacros;
      }
    }
  } catch (geminiErr) {
    console.warn('[NUTRITION] Gemini calculation fallback:', geminiErr.message);
  }

  // 2. Secondary: Query Edamam Food Database API if available
  const appId = process.env.EDAMAM_FOOD_APP_ID || process.env.EDAMAM_APP_ID;
  const appKey = process.env.EDAMAM_FOOD_APP_KEY || process.env.EDAMAM_APP_KEY;

  if (appId && appKey) {
    try {
      const url = 'https://api.edamam.com/api/food-database/v2/parser';
      const response = await axios.get(url, {
        params: {
          app_id: appId,
          app_key: appKey,
          ingr: foodItemName
        },
        timeout: 5000
      });

      if (response.data && response.data.parsed && response.data.parsed.length > 0) {
        const food = response.data.parsed[0].food;
        const nutrients = food.nutrients || {};

        return {
          foodItem: food.label || foodItemName,
          category: food.category,
          image: food.image,
          calories: Math.round(nutrients.ENERC_KCAL || 0),
          protein: Math.round(nutrients.PROCNT || 0),
          fat: Math.round(nutrients.FAT || 0),
          carbs: Math.round(nutrients.CHOCDF || 0),
          fiber: Math.round(nutrients.FIBTG || 0),
          sodium: Math.round(nutrients.NA || 0)
        };
      }
    } catch (err) {
      // Ignore 401 and fall to dictionary
    }
  }

  // 3. Clinical Fallback Dictionary
  return getEstimatedMacros(foodItemName);
}

/**
 * Clinical fallback macro estimator for common Indian and global foods
 */
function getEstimatedMacros(name = '') {
  const lower = name.toLowerCase();

  if (lower.includes('noodle') || lower.includes('chow mein') || lower.includes('pasta') || lower.includes('maggi')) {
    return { foodItem: name, calories: 460, protein: 10, carbs: 58, fat: 20, fiber: 4, sodium: 750 };
  }
  if (lower.includes('upma') || lower.includes('rava') || lower.includes('semolina')) {
    return { foodItem: name, calories: 290, protein: 7, carbs: 44, fat: 9, fiber: 5, sodium: 320 };
  }
  if (lower.includes('poha') || lower.includes('flattened rice')) {
    return { foodItem: name, calories: 250, protein: 5, carbs: 42, fat: 7, fiber: 3, sodium: 280 };
  }
  if (lower.includes('biryani') || lower.includes('pulao') || lower.includes('fried rice')) {
    return { foodItem: name, calories: 440, protein: 18, carbs: 56, fat: 14, fiber: 4, sodium: 480 };
  }
  if (lower.includes('dosa') || lower.includes('idli') || lower.includes('uttapam')) {
    return { foodItem: name, calories: 210, protein: 6, carbs: 36, fat: 4, fiber: 3, sodium: 220 };
  }
  if (lower.includes('paneer') || lower.includes('tofu')) {
    return { foodItem: name, calories: 320, protein: 20, carbs: 10, fat: 22, fiber: 2, sodium: 210 };
  }
  if (lower.includes('dal') || lower.includes('sambar') || lower.includes('chana') || lower.includes('rajma')) {
    return { foodItem: name, calories: 190, protein: 11, carbs: 28, fat: 3.5, fiber: 6, sodium: 290 };
  }
  if (lower.includes('roti') || lower.includes('chapati') || lower.includes('phulka')) {
    return { foodItem: name, calories: 130, protein: 4, carbs: 24, fat: 1.5, fiber: 3.5, sodium: 80 };
  }
  if (lower.includes('oat') || lower.includes('porridge') || lower.includes('cereal')) {
    return { foodItem: name, calories: 280, protein: 11, carbs: 44, fat: 6, fiber: 6, sodium: 90 };
  }
  if (lower.includes('khichdi')) {
    return { foodItem: name, calories: 260, protein: 8.5, carbs: 46, fat: 4, fiber: 5, sodium: 240 };
  }
  if (lower.includes('chicken') || lower.includes('mutton') || lower.includes('meat')) {
    return { foodItem: name, calories: 340, protein: 28, carbs: 8, fat: 21, fiber: 1, sodium: 420 };
  }
  if (lower.includes('fish') || lower.includes('prawn') || lower.includes('seafood')) {
    return { foodItem: name, calories: 240, protein: 24, carbs: 4, fat: 12, fiber: 0, sodium: 310 };
  }
  if (lower.includes('egg') || lower.includes('omelet') || lower.includes('bhurji')) {
    return { foodItem: name, calories: 210, protein: 14, carbs: 3, fat: 15, fiber: 0, sodium: 260 };
  }
  if (lower.includes('salad') || lower.includes('fruit') || lower.includes('sprout')) {
    return { foodItem: name, calories: 110, protein: 3, carbs: 22, fat: 1, fiber: 5, sodium: 40 };
  }

  return { foodItem: name, calories: 270, protein: 9, carbs: 38, fat: 8, fiber: 4, sodium: 240 };
}

module.exports = {
  fetchMealRecipes,
  analyzeFoodItemNutrition,
  mapTagsToEdamamNutrients
};
