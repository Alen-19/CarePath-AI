import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface EdamamRecipe {
  title: string;
  image: string;
  source?: string;
  url?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  sodium: number;
  clinicalReason?: string;
  ingredients: string[];
}

export interface DynamicMealPlanResponse {
  success: boolean;
  prescribedTags: string[];
  patientRegion?: string;
  doctorNotes?: {
    doctorRemarks?: string;
    nutritionalTags?: string[];
    recommendedFoods?: string;
    foodsToAvoid?: string;
    hydrationGoalLiters?: number;
  };
  mealPlan: {
    breakfast: EdamamRecipe[];
    lunch: EdamamRecipe[];
    dinner: EdamamRecipe[];
  };
}

export interface FoodAnalysisResponse {
  success: boolean;
  data: {
    foodItem: string;
    category?: string;
    image?: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
    sodium: number;
  };
}

export interface FoodLogPayload {
  appointmentId?: string;
  mealType: 'Breakfast' | 'Lunch' | 'Snack' | 'Dinner';
  foodItemName: string;
  imageUrl?: string;
  nutritionalData: {
    calories: number;
    proteinGrams: number;
    carbsGrams: number;
    fatGrams: number;
    sodiumMg: number;
    fiberGrams?: number;
  };
}

@Injectable({
  providedIn: 'root'
})
export class NutritionService {
  private apiUrl = 'http://localhost:5000/api/nutrition';

  constructor(private http: HttpClient) {}

  getDynamicMealPlan(appointmentId?: string): Observable<DynamicMealPlanResponse> {
    let params = new HttpParams();
    if (appointmentId) {
      params = params.set('appointmentId', appointmentId);
    }
    return this.http.get<DynamicMealPlanResponse>(`${this.apiUrl}/meal-plan`, { params });
  }

  recognizeFoodImage(formData: FormData): Observable<{
    success: boolean;
    dishName: string;
    suggestedMealType: 'Breakfast' | 'Lunch' | 'Snack' | 'Dinner';
    ingredients: string[];
    confidence: number;
    imageUrl?: string;
  }> {
    return this.http.post<{
      success: boolean;
      dishName: string;
      suggestedMealType: 'Breakfast' | 'Lunch' | 'Snack' | 'Dinner';
      ingredients: string[];
      confidence: number;
      imageUrl?: string;
    }>(`${this.apiUrl}/recognize-food`, formData);
  }

  analyzeFood(foodName: string): Observable<FoodAnalysisResponse> {
    return this.http.post<FoodAnalysisResponse>(`${this.apiUrl}/analyze-food`, { foodName });
  }

  logMeal(payload: FoodLogPayload): Observable<{ success: boolean; message: string; log: any }> {
    return this.http.post<{ success: boolean; message: string; log: any }>(`${this.apiUrl}/log-meal`, payload);
  }

  getTodayFoodLogs(): Observable<{ success: boolean; logs: any[] }> {
    return this.http.get<{ success: boolean; logs: any[] }>(`${this.apiUrl}/today-logs`);
  }
}
