import { Component, OnInit, OnDestroy, NgZone, HostListener, ChangeDetectorRef, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { HttpClient } from '@angular/common/http';
import { getApiBaseUrl, getMediaUrl } from '../../core/config/api.config';
import {
  AppointmentService,
  DoctorCard,
  BookingSlot,
  AppointmentItem,
  BookAppointmentPayload,
  ExerciseItem
} from '../../core/services/appointment.service';
import { NutritionService, ClinicalRecipe } from '../../core/services/nutrition.service';
import {
  MedicationService,
  MedicationDoseItem,
  DoctorMedFilterItem,
  MedicationScheduleResponse
} from '../../core/services/medication.service';
import { ReportService, MedicalReport, Biomarker } from '../../core/services/report.service';

declare var Razorpay: any;
declare var Pose: any;
declare var Camera: any;

@Component({
  selector: 'app-patient-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './patient-dashboard.component.html',
  styleUrls: ['./patient-dashboard.component.css']
})
export class PatientDashboardComponent implements OnInit, OnDestroy {
  patientName = '';
  patientId = '';
  patientEmail = '';
  activeTab: 'find-doctors' | 'my-appointments' | 'food-tracker' | 'reports' | 'profile' | 'symptom-checker' = 'find-doctors';
  showUserDropdown = false;

  // ─── 📑 Medical Records Vault & Multimodal AI State ─────────────────────────
  reports: MedicalReport[] = [];
  loadingReports: boolean = false;
  reportSearch: string = '';
  selectedReportTypeFilter: string = 'all';

  // Upload modal state
  showUploadModal: boolean = false;
  uploadingReport: boolean = false;
  uploadErrorMsg: string = '';
  selectedFileToUpload: File | null = null;
  selectedFilePreviewUrl: string | null = null;
  uploadTitle: string = '';
  uploadReportType: 'Blood Test' | 'Imaging (X-Ray/MRI/CT)' | 'Pathology' | 'Cardiology (ECG/Echo)' | 'Urine/Renal' | 'Prescription/Discharge' | 'Other' = 'Blood Test';
  uploadReportDate: string = '';
  uploadAppointmentId: string = '';
  isSharedAllToggle: boolean = true;

  // Detail Drawer / Modal
  selectedReportDetail: MedicalReport | null = null;
  showReportDetailModal: boolean = false;

  // Link to Consultation Modal (Scenario B)
  showLinkModal: boolean = false;
  linkingReport: MedicalReport | null = null;
  targetAppointmentIdForLink: string = '';
  linkingInProgress: boolean = false;

  // Booking Modal Attachment (Pre-Consultation Scenario A & Follow-Up Scenario B)
  attachedReportIdsForBooking: string[] = [];

  // ─── 🌟 Daily CarePath & Lifestyle Goal Center State ────────────────────────
  todayWaterMl: number = 0;
  isExerciseDone: boolean = false;
  dailyExerciseMinutes: number = 30;
  mealChecklistState: { [key: string]: boolean } = {};

  // ─── 🏋️ Clinical Physical Rehabilitation & AI Guided Studio State ──────────
  @ViewChild('studioVideo') studioVideoRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('studioCanvas') studioCanvasRef!: ElementRef<HTMLCanvasElement>;

  prescribedExercisesList: ExerciseItem[] = [];
  loadingExercises: boolean = false;

  defaultCatalogExercises: ExerciseItem[] = [
    {
      exerciseId: 'squats',
      name: 'Chair Squats (Knee & Hip Rehab)',
      category: 'Lower Body & Joint Mobility',
      targetReps: 10,
      targetSets: 3,
      frequencyPerWeek: 4,
      precautions: 'Keep spine neutral, hinge at hips, maintain knees aligned with toes without collapsing inward.',
      videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-woman-doing-squats-in-a-gym-42795-large.mp4',
      targetAngleMin: 85,
      targetAngleMax: 95
    },
    {
      exerciseId: 'knee_extension',
      name: 'Seated Knee Extension (Quadriceps)',
      category: 'Knee Strengthening & Mobility',
      targetReps: 12,
      targetSets: 3,
      frequencyPerWeek: 5,
      precautions: 'Sit upright, pause for 2 seconds at full extension. Do not kick rapidly or hyper-extend.',
      videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-young-man-exercising-in-the-gym-42823-large.mp4',
      targetAngleMin: 160,
      targetAngleMax: 180
    },
    {
      exerciseId: 'shoulder_abduction',
      name: 'Shoulder Lateral Abduction (Rotator Cuff)',
      category: 'Upper Extremity Rehabilitation',
      targetReps: 10,
      targetSets: 3,
      frequencyPerWeek: 3,
      precautions: 'Lift arms to shoulder level only (90 degrees). Do not shrug shoulders or arch lower back.',
      videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-athlete-working-out-with-dumbbells-42831-large.mp4',
      targetAngleMin: 80,
      targetAngleMax: 95
    },
    {
      exerciseId: 'bicep_curl',
      name: 'Standing Bicep Curls (Arm Rehab)',
      category: 'Arm Strength & Joint Conditioning',
      targetReps: 12,
      targetSets: 3,
      frequencyPerWeek: 4,
      precautions: 'Keep elbows tucked into sides. Full contraction and controlled eccentric descent.',
      videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-young-man-exercising-in-the-gym-42823-large.mp4',
      targetAngleMin: 45,
      targetAngleMax: 160
    }
  ];

  // Video Demonstration Modal & Biomechanical Visualizer
  showDemoModal: boolean = false;
  selectedDemoExercise: ExerciseItem | null = null;
  demoVideoFailed: boolean = false;
  demoActiveTab: 'kinematics' | 'video' = 'kinematics';

  // Clinical Rehabilitation Telemetry History
  exerciseLogsHistory: any[] = [];
  loadingExerciseLogs: boolean = false;

  // AI Interactive Studio State
  isExerciseStudioOpen: boolean = false;
  activeStudioExercise: ExerciseItem | null = null;
  studioCurrentReps: number = 0;
  studioTargetReps: number = 10;
  studioCurrentSets: number = 1;
  studioTargetSets: number = 3;
  studioCurrentAngle: number = 0;
  studioAngleTargetLabel: string = 'Joint Flexion';
  studioFeedbackText: string = 'Position yourself in front of the camera';
  studioFeedbackStatus: 'good' | 'adjust' | 'neutral' = 'neutral';
  studioIsDetecting: boolean = false;
  isCameraActive: boolean = false;
  cameraErrorMsg: string = '';
  private poseDetector: any = null;
  private studioMediaStream: MediaStream | null = null;
  private exerciseRepStage: 'up' | 'down' = 'up';
  private lastSpokenTime: number = 0;

  // 🔄 Multi-Exercise Routine Runner State
  studioRoutineIndex: number = 0;
  hasNextRoutineExercise: boolean = false;
  nextRoutineExercise: ExerciseItem | null = null;
  isRoutineCompleted: boolean = false;

  // 🚨 Fall & Inactivity Emergency Monitor State
  isSafetyVerificationActive: boolean = false;
  safetyCountdownSeconds: number = 15;
  private safetyCountdownInterval: any = null;
  isEmergencyDispatched: boolean = false;
  emergencyDispatchDetails: any = null;
  private lastLandmarkMovementTime: number = Date.now();
  private prevNoseY: number | null = null;
  private prevNoseTime: number = Date.now();

  // 📊 Clinical Telemetry & Exercise Analytics State
  exerciseAnalytics: any = null;
  loadingExerciseAnalytics: boolean = false;

  // ⏱ Studio Phase & Recovery State Machine (Feature 7 & 9)
  studioPhase: 'ACTIVE' | 'SET_REST' | 'SUMMARY' = 'ACTIVE';
  restCountdownSeconds: number = 30;
  private restIntervalTimer: any = null;

  // 📈 Biomechanical Telemetry Accumulator (Feature 3, 4, & 9)
  sessionStartTime: number = 0;
  sessionValidReps: number = 0;
  sessionIncompleteReps: number = 0;
  sessionMinAngle: number = 999;
  sessionMaxAngle: number = 0;
  sessionFormErrors: string[] = [];
  sessionSafetyIncidents: number = 0;
  currentRepMinAngle: number = 180;
  currentRepMaxAngle: number = 0;
  sessionSummaryData: any = null;

  // 🧪 Validation / Simulation Dev Mode (Feature 8)
  showDevSimControls: boolean = false;

  // ─── 💊 Daily Medication & Pill Schedule State ─────────────────────────────
  medicationSchedule: MedicationScheduleResponse | null = null;
  loadingMedications: boolean = false;
  selectedDoctorMedFilter: string = 'all';
  isTogglingDose: boolean = false;
  sendingMedEmail: boolean = false;

  // ─── Dietary CarePath & Clinical Meal Plan Modal State ─────────────────────
  showCarePathModal = false;
  selectedCarePathAppt: AppointmentItem | null = null;
  activeCarePathTab: 'careplan' | 'recipes' = 'careplan';
  mealPlan: { breakfast: ClinicalRecipe[]; lunch: ClinicalRecipe[]; dinner: ClinicalRecipe[] } | null = null;
  mealPlanRegion: string = '';
  loadingMealPlan = false;

  // ─── AI Food & Macro Tracker State ─────────────────────────────────────────
  foodTrackerInput = '';
  foodTrackerMealType: 'Breakfast' | 'Lunch' | 'Snack' | 'Dinner' = 'Lunch';
  selectedFoodFile: File | null = null;
  foodImagePreview: string | null = null;
  uploadedFoodImageUrl: string | null = null;
  isRecognizingImage = false;
  geminiRecognizedDish = '';
  geminiConfidence = 0;

  getMediaUrl(path: string | null | undefined): string {
    return getMediaUrl(path);
  }
  geminiIngredients: string[] = [];
  analyzedFoodResult: {
    foodItem: string;
    category?: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
    sodium: number;
  } | null = null;
  isAnalyzingFood = false;
  isLoggingFood = false;
  loggedMeals: Array<{
    mealType: string;
    foodItemName: string;
    imageUrl?: string;
    calories: number;
    protein: number;
    carbs: number;
    sodium: number;
    time: string;
  }> = [];

  // ─── Symptom Checker State ────────────────────────────────────────────────
  isSymptomBotOpen = false;
  symptomInput = '';
  isAnalyzingSymptoms = false;
  chatMessages: any[] = [
    { type: 'bot', text: 'Describe what you are experiencing. I\'ll help identify relevant medical specialties and connect you with the right doctor.' }
  ];

  // ─── Toast ─────────────────────────────────────────────────────────────────
  toastMessage = '';
  toastType: 'success' | 'error' = 'success';

  // ─── Doctor Search & Proximity ─────────────────────────────────────────────
  doctors: DoctorCard[] = [];
  filteredDoctors: DoctorCard[] = [];
  searchQuery = '';
  loadingDoctors = false;
  selectedMaxDistance: number = 0; // 0 = All distances
  sortBy: 'nearest' | 'experience' | 'fee' = 'nearest';

  // ─── Booking Modal ─────────────────────────────────────────────────────────
  showBookingModal = false;
  selectedDoctor: DoctorCard | null = null;
  bookingStep = 1; // 1=date, 2=slot, 3=details, 4=policy+pay
  selectedDate = '';
  minDate = '';
  maxDate = '';
  availableSlots: BookingSlot[] = [];
  loadingSlots = false;
  selectedSlot: BookingSlot | null = null;
  appointmentType = 'General Consultation';
  symptoms = '';
  appointmentTypes = ['General Consultation', 'Follow-up', 'Care Plan Review', 'Emergency Sync'];
  isOffDay = false;
  bookingInProgress = false;

  // ─── My Appointments ───────────────────────────────────────────────────────
  myAppointments: AppointmentItem[] = [];
  loadingAppointments = false;
  appointmentFilter: 'today' | 'upcoming' | 'past' | 'all' = 'upcoming';

  // ─── Confirmation Modal ───────────────────────────────────────────────────
  showConfirmationModal = false;
  confirmationData: { paymentId?: string; appointmentId?: string } | null = null;

  // ─── Cancel Modal ──────────────────────────────────────────────────────────
  showCancelModal = false;
  appointmentToCancel: AppointmentItem | null = null;
  cancelReason = '';
  cancellingInProgress = false;
  cancelResult: { refundPercentage: number; refundAmount: number; estimatedRefundDate: string | null; policy: string } | null = null;

  // ─── Profile Management State ─────────────────────────────────────────────
  showProfileModal = false;
  savingProfile = false;
  uploadingImage = false;
  pendingDoctorToBook: DoctorCard | null = null;

  profileForm = {
    firstName: '',
    lastName: '',
    phone: '',
    dateOfBirth: '',
    gender: 'Prefer not to say',
    bloodGroup: '',
    profileImage: '',
    emergencyContact: {
      name: '',
      phone: '',
      relation: 'Parent'
    },
    address: {
      houseName: '',
      pincode: '',
      city: '',
      district: '',
      state: '',
      country: 'India'
    }
  };

  // ─── Password Change State ────────────────────────────────────────────────
  passwordForm = {
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  };
  changingPassword = false;
  passwordError = '';
  passwordSuccess = '';

  // Smart Pincode Auto-Lookup State
  localitiesList: string[] = [];
  districtsList: string[] = [];
  postOfficeRecords: Array<{ name: string; district: string; state: string }> = [];
  loadingPincode = false;
  pincodeErrorMsg = '';

  // Validation Touch Trackers & Bounds
  profileFirstNameTouched = false;
  profileLastNameTouched = false;
  profilePhoneTouched = false;
  profileDobTouched = false;
  profileHouseNameTouched = false;
  profilePincodeTouched = false;
  profileEmergencyNameTouched = false;
  profileEmergencyPhoneTouched = false;

  maxDobDate = this.getLocalDateString();
  minDobDate = '1900-01-01';

  get patientInitials(): string {
    const f = this.profileForm.firstName?.charAt(0) || 'P';
    const l = this.profileForm.lastName?.charAt(0) || '';
    return (f + l).toUpperCase();
  }

  get isFirstNameValid(): boolean {
    const clean = (this.profileForm.firstName || '').trim();
    if (clean.length < 2 || clean.length > 50) return false;
    return /^[a-zA-Z]+(?:[\s'\.\-][a-zA-Z]+)*$/.test(clean);
  }

  get isLastNameValid(): boolean {
    const clean = (this.profileForm.lastName || '').trim();
    if (!clean) return true; // Optional
    if (clean.length < 1 || clean.length > 50) return false;
    return /^[a-zA-Z]+(?:[\s'\.\-][a-zA-Z]+)*$/.test(clean);
  }

  get isProfilePhoneValid(): boolean {
    if (!this.profileForm.phone) return false;
    const cleanPhone = this.profileForm.phone.trim().replace(/[\s-]/g, '');
    return /^(\+91)?[6-9]\d{9}$/.test(cleanPhone);
  }

  get isProfileDobValid(): boolean {
    if (!this.profileForm.dateOfBirth) return false;
    const selectedDate = new Date(this.profileForm.dateOfBirth);
    const today = new Date();
    const minDate = new Date('1900-01-01');
    return selectedDate <= today && selectedDate >= minDate;
  }

  get isEmergencyNameValid(): boolean {
    const clean = (this.profileForm.emergencyContact?.name || '').trim();
    if (!clean) return true;
    if (clean.length < 2 || clean.length > 50) return false;
    return /^[a-zA-Z]+(?:[\s'\.\-][a-zA-Z]+)*$/.test(clean);
  }

  get isEmergencyPhoneSelf(): boolean {
    const clean = (this.profileForm.emergencyContact?.phone || '').trim().replace(/[\s-]/g, '');
    const patientClean = (this.profileForm.phone || '').trim().replace(/[\s-]/g, '');
    return !!clean && clean === patientClean;
  }

  get isEmergencyPhoneValid(): boolean {
    const clean = (this.profileForm.emergencyContact?.phone || '').trim().replace(/[\s-]/g, '');
    if (!clean) return true;
    if (this.isEmergencyPhoneSelf) return false;
    return /^(\+91)?[6-9]\d{9}$/.test(clean);
  }

  get isPincodeValid(): boolean {
    const clean = (this.profileForm.address?.pincode || '').trim();
    if (!clean) return true;
    return /^\d{6}$/.test(clean);
  }

  get isHouseNameValid(): boolean {
    const clean = (this.profileForm.address?.houseName || '').trim();
    if (!clean) return true;
    return clean.length >= 2;
  }

  get isProfileFormValid(): boolean {
    return this.isFirstNameValid &&
      this.isLastNameValid &&
      this.isProfilePhoneValid &&
      this.isProfileDobValid &&
      this.isEmergencyNameValid &&
      this.isEmergencyPhoneValid &&
      this.isPincodeValid &&
      this.isHouseNameValid;
  }

  get isProfileModalValid(): boolean {
    return this.isProfilePhoneValid && this.isProfileDobValid;
  }

  get baseConsultationFee(): number {
    return this.selectedDoctor?.consultationFee || 500;
  }

  get emergencySurcharge(): number {
    return this.appointmentType === 'Emergency Sync' ? Math.round(this.baseConsultationFee * 0.1) : 0;
  }

  get followUpDiscount(): number {
    return this.appointmentType === 'Follow-up' ? Math.round(this.baseConsultationFee * 0.5) : 0;
  }

  get totalBookingFee(): number {
    if (this.appointmentType === 'Emergency Sync') {
      return Math.round(this.baseConsultationFee * 1.1);
    }
    if (this.appointmentType === 'Follow-up') {
      return Math.round(this.baseConsultationFee * 0.5);
    }
    return this.baseConsultationFee;
  }

  // ─── 🌟 Active Doctor-Prescribed CarePath & Macro Ring Getters ──────────────
  get activeCarePathAppt(): AppointmentItem | null {
    if (!this.myAppointments || this.myAppointments.length === 0) return null;
    const sorted = [...this.myAppointments]
      .filter(a => a.status === 'Completed' && a.clinicalNotes && (a.clinicalNotes.doctorRemarks || a.clinicalNotes.nutritionalTags?.length || a.clinicalNotes.recommendedFoods))
      .sort((a, b) => new Date(b.appointmentDate).getTime() - new Date(a.appointmentDate).getTime());
    return sorted[0] || null;
  }

  get todayCalories(): number {
    return this.loggedMeals.reduce((sum, m) => sum + (m.calories || 0), 0);
  }

  get todayProtein(): number {
    return this.loggedMeals.reduce((sum, m) => sum + (m.protein || 0), 0);
  }

  get todayCarbs(): number {
    return this.loggedMeals.reduce((sum, m) => sum + (m.carbs || 0), 0);
  }

  get todaySodium(): number {
    return this.loggedMeals.reduce((sum, m) => sum + (m.sodium || 0), 0);
  }

  get targetCalories(): number {
    return 2000;
  }

  get targetProtein(): number {
    const isHigh = this.activeCarePathAppt?.clinicalNotes?.nutritionalTags?.some(t => t.toLowerCase().includes('protein'));
    return isHigh ? 85 : 70;
  }

  get targetCarbs(): number {
    const isLow = this.activeCarePathAppt?.clinicalNotes?.nutritionalTags?.some(t => t.toLowerCase().includes('carb') || t.toLowerCase().includes('diabetic'));
    return isLow ? 160 : 230;
  }

  get targetWaterMl(): number {
    const liters = this.activeCarePathAppt?.clinicalNotes?.hydrationGoalLiters || 2.5;
    return Math.round(liters * 1000);
  }

  get caloriePct(): number {
    return Math.min(100, Math.round((this.todayCalories / this.targetCalories) * 100));
  }

  get proteinPct(): number {
    return Math.min(100, Math.round((this.todayProtein / this.targetProtein) * 100));
  }

  get carbPct(): number {
    return Math.min(100, Math.round((this.todayCarbs / this.targetCarbs) * 100));
  }

  get waterPct(): number {
    return Math.min(100, Math.round((this.todayWaterMl / this.targetWaterMl) * 100));
  }

  // ─── 💊 Medication Schedule Getters ─────────────────────────────────────────
  get filteredMorningMeds(): MedicationDoseItem[] {
    if (!this.medicationSchedule?.schedule?.morning) return [];
    if (this.selectedDoctorMedFilter === 'all') return this.medicationSchedule.schedule.morning;
    return this.medicationSchedule.schedule.morning.filter(m => m.doctorId === this.selectedDoctorMedFilter);
  }

  get filteredAfternoonMeds(): MedicationDoseItem[] {
    if (!this.medicationSchedule?.schedule?.afternoon) return [];
    if (this.selectedDoctorMedFilter === 'all') return this.medicationSchedule.schedule.afternoon;
    return this.medicationSchedule.schedule.afternoon.filter(m => m.doctorId === this.selectedDoctorMedFilter);
  }

  get filteredNightMeds(): MedicationDoseItem[] {
    if (!this.medicationSchedule?.schedule?.night) return [];
    if (this.selectedDoctorMedFilter === 'all') return this.medicationSchedule.schedule.night;
    return this.medicationSchedule.schedule.night.filter(m => m.doctorId === this.selectedDoctorMedFilter);
  }

  get totalActiveMedsCount(): number {
    return this.filteredMorningMeds.length + this.filteredAfternoonMeds.length + this.filteredNightMeds.length;
  }

  get takenMedsCount(): number {
    const all = [...this.filteredMorningMeds, ...this.filteredAfternoonMeds, ...this.filteredNightMeds];
    return all.filter(m => m.isTaken).length;
  }

  get medicationCompliancePct(): number {
    if (this.totalActiveMedsCount === 0) return 100;
    return Math.round((this.takenMedsCount / this.totalActiveMedsCount) * 100);
  }

  // ─── 💧 Interactive Hydration & Wellness Tracker Handlers ──────────────────
  loadTodayWellnessTracker(): void {
    const todayStr = this.getTodayDateString();
    const savedWater = localStorage.getItem(`carepath_water_${todayStr}`);
    this.todayWaterMl = savedWater ? parseInt(savedWater, 10) || 0 : 0;

    const savedExercise = localStorage.getItem(`carepath_exercise_${todayStr}`);
    this.isExerciseDone = savedExercise === 'true';

    const savedMeals = localStorage.getItem(`carepath_meals_${todayStr}`);
    this.mealChecklistState = savedMeals ? JSON.parse(savedMeals) : {};
  }

  loadTodayNutritionLogs(): void {
    const todayStr = this.getTodayDateString();
    
    // 1. Instant local restore from cache
    const cachedLogs = localStorage.getItem(`carepath_logged_meals_${todayStr}`);
    if (cachedLogs) {
      try {
        const parsed = JSON.parse(cachedLogs);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.loggedMeals = parsed;
        }
      } catch (e) {}
    }

    // 2. Fetch authoritative records from backend MongoDB Atlas
    this.nutritionService.getTodayFoodLogs().subscribe({
      next: (res) => {
        if (res && res.success && res.logs && res.logs.length > 0) {
          this.loggedMeals = res.logs.map(log => ({
            mealType: log.mealType,
            foodItemName: log.foodItemName,
            imageUrl: log.imageUrl || undefined,
            calories: log.nutritionalData?.calories || 0,
            protein: log.nutritionalData?.proteinGrams || 0,
            carbs: log.nutritionalData?.carbsGrams || 0,
            sodium: log.nutritionalData?.sodiumMg || 0,
            time: log.createdAt 
              ? new Date(log.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) 
              : new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
          }));

          // Automatically mark checklist items as eaten for any logged meal categories
          res.logs.forEach(log => {
            if (log.mealType) {
              this.mealChecklistState[log.mealType.toLowerCase()] = true;
            }
          });

          // Cache updated list and checklist
          localStorage.setItem(`carepath_logged_meals_${todayStr}`, JSON.stringify(this.loggedMeals));
          localStorage.setItem(`carepath_meals_${todayStr}`, JSON.stringify(this.mealChecklistState));
        }
      },
      error: (err) => {
        console.warn('Could not fetch today nutrition logs from server:', err);
      }
    });
  }

  addWater(ml: number): void {
    this.todayWaterMl = Math.min(6000, this.todayWaterMl + ml);
    const todayStr = this.getTodayDateString();
    localStorage.setItem(`carepath_water_${todayStr}`, this.todayWaterMl.toString());
    this.showToast(`💧 Added ${ml}ml water! Today's intake: ${(this.todayWaterMl / 1000).toFixed(2)}L / ${(this.targetWaterMl / 1000).toFixed(1)}L`, 'success');
  }

  resetWater(): void {
    this.todayWaterMl = 0;
    const todayStr = this.getTodayDateString();
    localStorage.setItem(`carepath_water_${todayStr}`, '0');
    this.showToast('💧 Water intake reset for today.', 'success');
  }

  toggleExercise(): void {
    this.isExerciseDone = !this.isExerciseDone;
    const todayStr = this.getTodayDateString();
    localStorage.setItem(`carepath_exercise_${todayStr}`, this.isExerciseDone.toString());
    if (this.isExerciseDone) {
      this.showToast('🎉 Awesome! Daily activity goal completed.', 'success');
    }
  }

  toggleMealCheck(mealKey: string): void {
    this.mealChecklistState[mealKey] = !this.mealChecklistState[mealKey];
    const todayStr = this.getTodayDateString();
    localStorage.setItem(`carepath_meals_${todayStr}`, JSON.stringify(this.mealChecklistState));
  }

  constructor(
    private authService: AuthService,
    private appointmentService: AppointmentService,
    private nutritionService: NutritionService,
    private medicationService: MedicationService,
    private reportService: ReportService,
    private http: HttpClient,
    private router: Router,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef
  ) {
    this.syncPatientInfo();
  }

  // ─── 💊 Medication Schedule Handlers ─────────────────────────────────────────
  loadActiveMedications(): void {
    this.loadingMedications = true;
    this.medicationService.getActiveMedicationSchedule().subscribe({
      next: (res) => {
        this.loadingMedications = false;
        if (res && res.success) {
          this.medicationSchedule = res;
        }
      },
      error: (err) => {
        this.loadingMedications = false;
        console.warn('[MEDICATION] Could not load active medication schedule:', err);
      }
    });
  }

  toggleMedDose(med: MedicationDoseItem, slot: 'Morning' | 'Afternoon' | 'Night'): void {
    const previousState = med.isTaken;
    med.isTaken = !med.isTaken;
    med.takenAt = med.isTaken ? new Date().toISOString() : null;

    this.medicationService.toggleDoseStatus({
      medicineName: med.medicineName,
      slot,
      prescriptionId: med.prescriptionId,
      appointmentId: med.appointmentId,
      isTaken: med.isTaken
    }).subscribe({
      next: (res) => {
        if (res && res.success) {
          this.showToast(
            med.isTaken 
              ? `✔ Taken: ${med.medicineName} (${slot} dose)` 
              : `Pending: ${med.medicineName} (${slot} dose)`, 
            'success'
          );
        }
      },
      error: () => {
        med.isTaken = previousState;
        this.showToast('Failed to update dose status. Please try again.', 'error');
      }
    });
  }

  sendTestMedicationDigestEmail(): void {
    this.sendingMedEmail = true;
    this.medicationService.sendTestMorningDigest().subscribe({
      next: (res) => {
        this.sendingMedEmail = false;
        this.showToast(res.message || 'Morning medication digest email sent successfully!', 'success');
      },
      error: (err) => {
        this.sendingMedEmail = false;
        this.showToast(err.error?.message || 'Failed to dispatch email.', 'error');
      }
    });
  }

  syncPatientInfo() {
    const user = this.authService.currentUser();
    if (user) {
      this.patientEmail = user.email || '';
      if (user.patientProfile) {
        this.patientName = `${user.patientProfile.firstName} ${user.patientProfile.lastName}`.trim() || 'Patient';
        this.profileForm.firstName = user.patientProfile.firstName || '';
        this.profileForm.lastName = user.patientProfile.lastName || '';
        this.profileForm.phone = user.patientProfile.phone || '';
        this.profileForm.profileImage = user.patientProfile.profileImage || '';
        if (user.patientProfile.dateOfBirth) {
          this.profileForm.dateOfBirth = this.getLocalDateString(new Date(user.patientProfile.dateOfBirth));
        }
        this.profileForm.gender = user.patientProfile.gender || 'Prefer not to say';
        this.profileForm.bloodGroup = user.patientProfile.bloodGroup || '';
        
        if (user.patientProfile.emergencyContact) {
          this.profileForm.emergencyContact = {
            name: user.patientProfile.emergencyContact.name || '',
            phone: user.patientProfile.emergencyContact.phone || '',
            relation: user.patientProfile.emergencyContact.relation || 'Parent'
          };
        }

        if (user.patientProfile.address) {
          this.profileForm.address = {
            houseName: user.patientProfile.address.houseName || '',
            pincode: user.patientProfile.address.pincode || '',
            city: user.patientProfile.address.city || '',
            district: user.patientProfile.address.district || '',
            state: user.patientProfile.address.state || '',
            country: user.patientProfile.address.country || 'India'
          };
          if (user.patientProfile.address.pincode) {
            this.fetchPincodeDetails(user.patientProfile.address.pincode);
          }
        }
      }
    } else {
      this.patientName = 'Patient';
    }
  }

  // ─── Smart Pincode Auto-Lookup (api.postalpincode.in) ─────────────────────
  onPincodeInput() {
    const cleanPin = (this.profileForm.address.pincode || '').trim();
    this.pincodeErrorMsg = '';
    if (cleanPin.length === 6 && /^\d{6}$/.test(cleanPin)) {
      this.fetchPincodeDetails(cleanPin);
    } else {
      this.localitiesList = [];
      this.districtsList = [];
      this.postOfficeRecords = [];
    }
  }

  fetchPincodeDetails(pincode: string) {
    this.loadingPincode = true;
    this.pincodeErrorMsg = '';
    this.http.get<any[]>(`${getApiBaseUrl()}/api/auth/pincode/${pincode}`).subscribe({
      next: (response) => {
        this.loadingPincode = false;
        if (response && response[0] && response[0].Status === 'Success' && response[0].PostOffice && response[0].PostOffice.length > 0) {
          const postOffices = response[0].PostOffice;
          this.postOfficeRecords = postOffices.map((po: any) => ({
            name: po.Name,
            district: po.District,
            state: po.State
          }));

          // Unique locality names
          this.localitiesList = Array.from(new Set(this.postOfficeRecords.map(r => r.name)));
          // Unique districts available for this pincode
          this.districtsList = Array.from(new Set(this.postOfficeRecords.map(r => r.district)));

          // Default selection to 1st locality and match its district & state
          let targetCity = this.profileForm.address.city;
          if (!targetCity || !this.localitiesList.includes(targetCity)) {
            targetCity = this.localitiesList[0] || '';
            this.profileForm.address.city = targetCity;
          }
          this.onLocalitySelect(targetCity);
        } else {
          this.pincodeErrorMsg = 'No details found for this pincode.';
          this.localitiesList = [];
          this.districtsList = [];
          this.postOfficeRecords = [];
        }
      },
      error: () => {
        this.loadingPincode = false;
        this.pincodeErrorMsg = 'Failed to fetch pincode details. Enter city manually.';
      }
    });
  }

  onLocalitySelect(selectedCity: string) {
    this.profileForm.address.city = selectedCity;
    const match = this.postOfficeRecords.find(r => r.name === selectedCity);
    if (match) {
      this.profileForm.address.district = match.district;
      this.profileForm.address.state = match.state;
      this.profileForm.address.country = 'India';
    }
  }

  onLocalityChange(event: any) {
    const selectedCity = event.target?.value;
    if (selectedCity) {
      this.onLocalitySelect(selectedCity);
    }
  }

  isProfileIncomplete(): boolean {
    const user = this.authService.currentUser();
    if (!user || !user.patientProfile) return true;
    const p = user.patientProfile;
    const hasAddr = !!(p.address && (p.address.pincode || p.address.city));
    return !p.phone || !p.dateOfBirth || !hasAddr;
  }

  openProfileModal(doctorToBook: DoctorCard | null = null) {
    this.syncPatientInfo();
    this.profilePhoneTouched = false;
    this.profileDobTouched = false;
    this.pendingDoctorToBook = doctorToBook;
    this.showProfileModal = true;
  }

  closeProfileModal() {
    this.showProfileModal = false;
    this.pendingDoctorToBook = null;
  }

  saveProfile() {
    this.profilePhoneTouched = true;
    this.profileDobTouched = true;

    if (!this.isProfileModalValid) {
      if (!this.isProfilePhoneValid) {
        this.showToast('Please enter a valid 10-digit Indian phone number (starts with 6-9).', 'error');
      } else if (!this.isProfileDobValid) {
        this.showToast('Please enter a valid Date of Birth (cannot be in the future).', 'error');
      }
      return;
    }

    this.savingProfile = true;
    const user = this.authService.currentUser();
    const payload = {
      role: 'patient',
      profile: {
        firstName: user?.patientProfile?.firstName || 'Patient',
        lastName: user?.patientProfile?.lastName || '',
        phone: this.profileForm.phone,
        dateOfBirth: this.profileForm.dateOfBirth,
        gender: this.profileForm.gender,
        bloodGroup: this.profileForm.bloodGroup,
        address: this.profileForm.address
      }
    };

    this.authService.completeProfile(payload).subscribe({
      next: (res) => {
        this.savingProfile = false;
        this.syncPatientInfo();
        this.showToast('✓ Profile completed successfully!', 'success');
        this.showProfileModal = false;

        // If user was trying to book a doctor, continue to booking modal!
        if (this.pendingDoctorToBook) {
          const doc = this.pendingDoctorToBook;
          this.pendingDoctorToBook = null;
          this.proceedToBookingModal(doc);
        }
      },
      error: (err) => {
        this.savingProfile = false;
        this.showToast(err.error?.message || 'Failed to save profile. Please try again.', 'error');
      }
    });
  }

  // ─── Profile Page Handlers ────────────────────────────────────────────────
  onProfileImageSelected(event: any) {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate size (max 5MB) and type
    if (file.size > 5 * 1024 * 1024) {
      this.showToast('Image size exceeds 5MB limit. Please choose a smaller file.', 'error');
      return;
    }

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      this.showToast('Please select a valid image (JPEG, PNG, or WebP).', 'error');
      return;
    }

    const formData = new FormData();
    formData.append('profileImage', file);

    this.uploadingImage = true;
    this.authService.uploadProfileImage(formData).subscribe({
      next: (res) => {
        this.uploadingImage = false;
        this.profileForm.profileImage = res.profileImage;
        this.syncPatientInfo();
        this.showToast('✓ Profile photo updated successfully!', 'success');
      },
      error: (err) => {
        this.uploadingImage = false;
        this.showToast(err.error?.message || 'Failed to upload image.', 'error');
      }
    });
  }

  saveFullProfile() {
    this.profileFirstNameTouched = true;
    this.profileLastNameTouched = true;
    this.profilePhoneTouched = true;
    this.profileDobTouched = true;
    this.profileEmergencyNameTouched = true;
    this.profileEmergencyPhoneTouched = true;
    this.profileHouseNameTouched = true;
    this.profilePincodeTouched = true;

    if (!this.isProfileFormValid) {
      if (!this.isFirstNameValid) {
        this.showToast('Please enter a valid first name (letters only, min 2 characters).', 'error');
      } else if (!this.isLastNameValid) {
        this.showToast('Please enter a valid last name (letters only).', 'error');
      } else if (!this.isProfilePhoneValid) {
        this.showToast('Please enter a valid 10-digit Indian phone number (starts with 6-9).', 'error');
      } else if (!this.isProfileDobValid) {
        this.showToast('Please enter a valid Date of Birth (cannot be in the future).', 'error');
      } else if (!this.isEmergencyNameValid) {
        this.showToast('Please enter a valid emergency contact name.', 'error');
      } else if (this.isEmergencyPhoneSelf) {
        this.showToast('Emergency contact phone cannot be the same as your personal phone.', 'error');
      } else if (!this.isEmergencyPhoneValid) {
        this.showToast('Please enter a valid 10-digit emergency contact phone number.', 'error');
      } else if (!this.isPincodeValid) {
        this.showToast('Please enter a valid 6-digit Indian postal pincode.', 'error');
      }
      return;
    }

    this.savingProfile = true;
    const payload = {
      firstName: this.profileForm.firstName.trim(),
      lastName: this.profileForm.lastName.trim(),
      phone: this.profileForm.phone,
      dateOfBirth: this.profileForm.dateOfBirth,
      gender: this.profileForm.gender,
      bloodGroup: this.profileForm.bloodGroup,
      emergencyContact: this.profileForm.emergencyContact,
      address: this.profileForm.address
    };

    this.authService.updateProfile(payload).subscribe({
      next: (res) => {
        this.savingProfile = false;
        this.syncPatientInfo();
        this.showToast('✓ Profile updated successfully!', 'success');
      },
      error: (err) => {
        this.savingProfile = false;
        this.showToast(err.error?.message || 'Failed to update profile.', 'error');
      }
    });
  }

  changeAccountPassword() {
    this.passwordError = '';
    this.passwordSuccess = '';

    if (!this.passwordForm.currentPassword || !this.passwordForm.newPassword) {
      this.passwordError = 'Please fill in all password fields.';
      return;
    }

    if (this.passwordForm.newPassword !== this.passwordForm.confirmPassword) {
      this.passwordError = 'New password and confirm password do not match.';
      return;
    }

    if (this.passwordForm.newPassword.length < 8) {
      this.passwordError = 'New password must be at least 8 characters long.';
      return;
    }

    const regex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*#?&]{8,}$/;
    if (!regex.test(this.passwordForm.newPassword)) {
      this.passwordError = 'Password must contain both letters and numbers.';
      return;
    }

    this.changingPassword = true;
    this.authService.changePassword({
      currentPassword: this.passwordForm.currentPassword,
      newPassword: this.passwordForm.newPassword
    }).subscribe({
      next: (res) => {
        this.changingPassword = false;
        this.passwordSuccess = '✓ Password changed successfully!';
        this.passwordForm = { currentPassword: '', newPassword: '', confirmPassword: '' };
        this.showToast('✓ Password updated successfully!', 'success');
      },
      error: (err) => {
        this.changingPassword = false;
        this.passwordError = err.error?.message || 'Failed to change password. Please check your current password.';
      }
    });
  }

  ngOnInit() {
    const today = new Date();
    const max = new Date();
    max.setFullYear(max.getFullYear() + 1);
    this.minDate = this.getTodayDateString();
    this.maxDate = this.getLocalDateString(max);
    this.loadDoctors();
    this.loadMyAppointments();
    this.loadTodayWellnessTracker();
    this.loadTodayNutritionLogs();
    this.loadActiveMedications();
    this.loadReports();
    this.loadPrescribedExercises();
    this.loadExerciseLogs();
    this.loadExerciseAnalytics();

    if (this.isProfileIncomplete()) {
      setTimeout(() => {
        this.openProfileModal();
      }, 600);
    }
  }

  // ─── Toast ─────────────────────────────────────────────────────────────────
  showToast(message: string, type: 'success' | 'error' = 'success') {
    this.toastMessage = message;
    this.toastType = type;
    setTimeout(() => (this.toastMessage = ''), 5000);
  }

  clearToast() {
    this.toastMessage = '';
  }

  // ─── User Profile Dropdown ────────────────────────────────────────────────
  toggleUserDropdown(event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    this.showUserDropdown = !this.showUserDropdown;
  }

  closeUserDropdown() {
    this.showUserDropdown = false;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.user-menu-container')) {
      this.closeUserDropdown();
    }
  }

  // ─── Tab ───────────────────────────────────────────────────────────────────
  setTab(tab: 'find-doctors' | 'my-appointments' | 'food-tracker' | 'reports' | 'profile' | 'symptom-checker') {
    this.activeTab = tab;
    this.closeUserDropdown();
    if (tab === 'my-appointments') {
      this.loadMyAppointments();
    } else if (tab === 'food-tracker') {
      this.loadTodayNutritionLogs();
      this.loadTodayWellnessTracker();
      this.loadActiveMedications();
    } else if (tab === 'reports') {
      this.loadReports();
    } else if (tab === 'profile') {
      this.syncPatientInfo();
    }
  }

  // ─── Doctor Search ─────────────────────────────────────────────────────────
  loadDoctors() {
    this.loadingDoctors = true;
    this.appointmentService.getDoctors().subscribe({
      next: (res) => {
        this.doctors = res.doctors;
        this.filterAndSortDoctors();
        this.loadingDoctors = false;
      },
      error: () => {
        this.loadingDoctors = false;
        this.showToast('Failed to load doctors. Please try again.', 'error');
      }
    });
  }

  filterAndSortDoctors() {
    let result = [...this.doctors];

    const q = this.searchQuery.toLowerCase().trim();
    if (q) {
      result = result.filter(d =>
        `${d.firstName} ${d.lastName}`.toLowerCase().includes(q) ||
        (d.specialization || '').toLowerCase().includes(q) ||
        (d.clinicAddressDisplay || d.clinicAddress || '').toLowerCase().includes(q)
      );
    }

    if (this.selectedMaxDistance > 0) {
      result = result.filter(d => d.distanceKm != null && d.distanceKm <= this.selectedMaxDistance);
    }

    result.sort((a, b) => {
      if (this.sortBy === 'nearest') {
        if (a.distanceKm != null && b.distanceKm != null) return a.distanceKm - b.distanceKm;
        if (a.distanceKm != null) return -1;
        if (b.distanceKm != null) return 1;
        return 0;
      } else if (this.sortBy === 'experience') {
        return (b.experienceYears || 0) - (a.experienceYears || 0);
      } else if (this.sortBy === 'fee') {
        return (a.consultationFee || 0) - (b.consultationFee || 0);
      }
      return 0;
    });

    this.filteredDoctors = result;
  }

  onSearch() {
    this.filterAndSortDoctors();
  }

  // ─── Booking Modal ─────────────────────────────────────────────────────────
  openBookingModal(doctor: DoctorCard) {
    if (this.isProfileIncomplete()) {
      // Action-based completion: Open profile modal first with pending doctor target!
      this.openProfileModal(doctor);
      return;
    }
    this.proceedToBookingModal(doctor);
  }

  pendingParentAppointmentId: string | null = null;
  patientConditionStatus: 'Improved' | 'Unchanged' | 'Worsened' | '' = '';

  isFollowUpEligibleForDoctor(doctorId?: string): boolean {
    if (!doctorId || !this.myAppointments || this.myAppointments.length === 0) return false;
    return this.myAppointments.some(a => {
      const aDoc = a.doctorId as any;
      const aDocId = aDoc?._id || (typeof aDoc === 'string' ? aDoc : null);
      return aDocId === doctorId && a.status === 'Completed';
    });
  }

  get isFollowUpEligibleForSelectedDoctor(): boolean {
    return this.isFollowUpEligibleForDoctor(this.selectedDoctor?._id);
  }

  getLatestCompletedApptForSelectedDoctor(): AppointmentItem | null {
    if (!this.selectedDoctor || !this.myAppointments) return null;
    const docId = this.selectedDoctor._id;
    const matches = this.myAppointments
      .filter(a => {
        const aDoc = a.doctorId as any;
        const aDocId = aDoc?._id || (typeof aDoc === 'string' ? aDoc : null);
        return aDocId === docId && a.status === 'Completed';
      })
      .sort((a, b) => new Date(b.appointmentDate).getTime() - new Date(a.appointmentDate).getTime());
    return matches[0] || null;
  }

  proceedToBookingModal(doctor: DoctorCard) {
    this.pendingParentAppointmentId = null;
    this.patientConditionStatus = '';
    this.selectedDoctor = doctor;
    this.bookingStep = 1;
    this.selectedDate = '';
    this.selectedSlot = null;
    this.availableSlots = [];
    this.appointmentType = 'General Consultation';
    this.symptoms = '';
    this.isOffDay = false;
    this.showBookingModal = true;
  }

  initiateFollowUpBooking(parentAppt: any) {
    if (this.isProfileIncomplete()) {
      this.openProfileModal();
      return;
    }

    const docObj = parentAppt.doctorId;
    if (!docObj) {
      this.showToast('Doctor information unavailable for follow-up.', 'error');
      return;
    }

    // Match doctor card or construct fallback
    let targetDoc = this.doctors.find(d => d._id === (docObj._id || docObj));
    if (!targetDoc) {
      targetDoc = {
        _id: docObj._id || docObj,
        firstName: docObj.firstName || 'Doctor',
        lastName: docObj.lastName || '',
        specialization: docObj.specialization || 'General Practice',
        licenseNumber: docObj.licenseNumber || '',
        experienceYears: docObj.experienceYears || 5,
        clinicAddress: docObj.clinicAddress || '',
        rating: 5.0,
        consultationFee: docObj.consultationFee || 500
      };
    }

    this.selectedDoctor = targetDoc;
    this.pendingParentAppointmentId = parentAppt._id;
    this.patientConditionStatus = '';
    this.appointmentType = 'Follow-up';
    this.bookingStep = 2; // Jump directly to date selection
    this.symptoms = `Follow-Up Consultation (Prior: ${this.normalizeDateStr(parentAppt.appointmentDate)})`;
    if (parentAppt.followUpRecommendation?.clinicalInstructions) {
      this.symptoms += ` - ${parentAppt.followUpRecommendation.clinicalInstructions}`;
    }

    // Pre-fill recommended date if in future, else today
    const recDate = parentAppt.followUpRecommendation?.recommendedDate;
    const todayStr = this.getTodayDateString();
    if (recDate && recDate >= todayStr) {
      this.selectedDate = recDate;
      this.onDateChange();
    } else {
      this.selectedDate = todayStr;
      this.onDateChange();
    }

    this.selectedSlot = null;
    this.showBookingModal = true;
  }

  onSelectAppointmentType(t: string): void {
    if (t === 'Care Plan Review') {
      return;
    }
    if (t === 'Follow-up') {
      if (!this.isFollowUpEligibleForSelectedDoctor) {
        this.showToast(
          `Follow-up is available only for returning patients who have completed a prior visit with Dr. ${this.selectedDoctor?.firstName || 'this doctor'}.`,
          'error'
        );
        return;
      }
      if (!this.pendingParentAppointmentId) {
        const latest = this.getLatestCompletedApptForSelectedDoctor();
        if (latest) {
          this.pendingParentAppointmentId = latest._id;
        }
      }
    }
    this.appointmentType = t;
  }

  closeBookingModal() {
    this.showBookingModal = false;
    this.selectedDoctor = null;
    this.pendingParentAppointmentId = null;
    this.patientConditionStatus = '';
  }

  onDateChange() {
    if (!this.selectedDate || !this.selectedDoctor) return;
    this.loadingSlots = true;
    this.selectedSlot = null;
    this.availableSlots = [];
    this.isOffDay = false;

    this.appointmentService.getBookingSlots(this.selectedDoctor._id, this.selectedDate).subscribe({
      next: (res) => {
        this.loadingSlots = false;
        if (res.isOffDay) {
          this.isOffDay = true;
        } else {
          this.availableSlots = res.slots;
        }
      },
      error: () => {
        this.loadingSlots = false;
        this.showToast('Could not load slots for this date.', 'error');
      }
    });
  }

  selectSlot(slot: BookingSlot) {
    this.selectedSlot = slot;
    this.bookingConflictError = '';
  }

  nextStep() {
    this.bookingConflictError = '';
    if (this.bookingStep === 1) {
      if (this.appointmentType === 'Emergency Sync') {
        // Emergency Sync bypasses date and slot selection -> jumps directly to Payment
        const todayStr = this.getTodayDateString();
        this.selectedDate = todayStr;
        this.bookingStep = 4;
      } else {
        this.bookingStep = 2;
      }
    } else if (this.bookingStep === 2 && this.selectedDate && !this.isOffDay) {
      this.bookingStep = 3;
    } else if (this.bookingStep === 3 && this.selectedSlot) {
      this.bookingStep = 4;
    }
  }

  prevStep() {
    this.bookingConflictError = '';
    if (this.bookingStep === 4 && this.appointmentType === 'Emergency Sync') {
      this.bookingStep = 1;
    } else if (this.bookingStep > 1) {
      this.bookingStep--;
    }
  }

  bookingConflictError: string = '';

  proceedToPayment() {
    if (!this.selectedDoctor) return;
    const isEmergency = this.appointmentType === 'Emergency Sync';
    if (!isEmergency && (!this.selectedDate || !this.selectedSlot)) return;

    this.bookingInProgress = true;
    this.bookingConflictError = '';

    const todayStr = this.getTodayDateString();
    const payload: BookAppointmentPayload = {
      doctorId: this.selectedDoctor._id,
      appointmentDate: isEmergency ? todayStr : (this.selectedDate || todayStr),
      startTime: isEmergency ? 'Immediate Queue' : (this.selectedSlot?.start || '09:00 AM'),
      endTime: isEmergency ? 'Immediate Queue' : (this.selectedSlot?.end || '09:30 AM'),
      type: this.appointmentType,
      symptoms: this.symptoms || (isEmergency ? 'Emergency Triage Request' : ''),
      parentAppointmentId: this.pendingParentAppointmentId || undefined,
      patientConditionStatus: this.appointmentType === 'Follow-up' ? (this.patientConditionStatus || 'Unchanged') : undefined,
      attachedReportIds: this.attachedReportIdsForBooking && this.attachedReportIdsForBooking.length > 0 ? this.attachedReportIdsForBooking : undefined
    };

    this.appointmentService.bookAppointment(payload).subscribe({
      next: (res) => {
        this.bookingInProgress = false;
        this.bookingConflictError = '';
        this.closeBookingModal();
        this.openRazorpayCheckout(res);
      },
      error: (err) => {
        this.bookingInProgress = false;
        const msg = err.error?.message || 'Booking failed. Please try again.';
        this.bookingConflictError = msg;
        this.showToast(msg, 'error');
      }
    });
  }

  openRazorpayCheckout(booking: any) {
    const options = {
      key: booking.keyId,
      amount: booking.amount * 100,
      currency: 'INR',
      name: 'CarePath AI',
      description: `Appointment with ${booking.doctorName}`,
      order_id: booking.razorpayOrderId,
      handler: (response: any) => {
        this.ngZone.run(() => {
          this.verifyAndConfirm(booking.appointmentId, booking.razorpayOrderId, response);
        });
      },
      prefill: { name: this.patientName },
      theme: { color: '#008094' },
      modal: {
        ondismiss: () => {
          this.ngZone.run(() => {
            this.showToast('Payment cancelled. Appointment is not confirmed.', 'error');
          });
        }
      }
    };
    const rzp = new Razorpay(options);
    rzp.open();
  }

  onRetryPayment(appointmentId: string) {
    this.appointmentService.retryPayment(appointmentId).subscribe({
      next: (res) => {
        this.openRazorpayCheckout(res);
      },
      error: (err) => {
        this.showToast(err.error?.message || 'Could not re-initiate payment.', 'error');
      }
    });
  }

  verifyAndConfirm(appointmentId: string, razorpayOrderId: string, response: any) {
    // ⚡ Display confirmation modal INSTANTLY (0ms delay)
    this.confirmationData = {
      paymentId: response.razorpay_payment_id,
      appointmentId
    };
    this.showConfirmationModal = true;
    this.showToast('🎉 Appointment confirmed! Payment successful.', 'success');

    // Execute HMAC signature verification & DB update in background
    this.appointmentService.verifyPayment({
      appointmentId,
      razorpayOrderId,
      razorpayPaymentId: response.razorpay_payment_id,
      razorpaySignature: response.razorpay_signature
    }).subscribe({
      next: () => {
        this.loadMyAppointments();
      },
      error: () => {
        this.showToast('Payment verification issue. Contact support if needed.', 'error');
      }
    });
  }

  closeConfirmationModal() {
    this.showConfirmationModal = false;
    this.confirmationData = null;
    this.appointmentFilter = 'today';
    this.setTab('my-appointments');
  }

  // ─── My Appointments ───────────────────────────────────────────────────────
  loadMyAppointments() {
    this.loadingAppointments = true;
    this.appointmentService.getMyAppointments().subscribe({
      next: (res) => {
        this.myAppointments = res.appointments;
        this.loadingAppointments = false;
      },
      error: () => {
        this.loadingAppointments = false;
        this.showToast('Failed to load appointments.', 'error');
      }
    });
  }

  normalizeDateStr(dateInput: string): string {
    if (!dateInput) return '';
    return dateInput.split('T')[0];
  }

  getLocalDateString(d: Date = new Date()): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  getTodayDateString(): string {
    return this.getLocalDateString(new Date());
  }

  get todayAppointments(): AppointmentItem[] {
    const today = this.getTodayDateString();
    return this.myAppointments.filter(a =>
      this.normalizeDateStr(a.appointmentDate) === today && ['Confirmed', 'Pending Payment'].includes(a.status)
    );
  }

  isTodayAppt(appt: AppointmentItem): boolean {
    return this.normalizeDateStr(appt.appointmentDate) === this.getTodayDateString();
  }

  canJoinCall(appt: AppointmentItem): boolean {
    if (appt.status !== 'Confirmed') return false;
    const today = this.getTodayDateString();
    return this.normalizeDateStr(appt.appointmentDate) >= today;
  }

  get filteredAppointments(): AppointmentItem[] {
    const today = this.getTodayDateString();
    if (this.appointmentFilter === 'today') {
      return this.myAppointments.filter(a =>
        this.normalizeDateStr(a.appointmentDate) === today && ['Confirmed', 'Pending Payment'].includes(a.status)
      );
    } else if (this.appointmentFilter === 'upcoming') {
      return this.myAppointments.filter(a =>
        this.normalizeDateStr(a.appointmentDate) >= today && ['Confirmed', 'Pending Payment'].includes(a.status)
      );
    } else if (this.appointmentFilter === 'past') {
      return this.myAppointments.filter(a =>
        this.normalizeDateStr(a.appointmentDate) < today || a.status === 'Completed' || a.status === 'Cancelled'
      );
    }
    return this.myAppointments;
  }

  getStatusClass(status: string): string {
    const map: Record<string, string> = {
      'Confirmed': 'badge-confirmed',
      'Pending Payment': 'badge-pending',
      'Completed': 'badge-completed',
      'Cancelled': 'badge-cancelled'
    };
    return map[status] || '';
  }

  canCancel(appt: AppointmentItem): boolean {
    if (appt.status !== 'Confirmed') return false;
    const today = this.getTodayDateString();
    return this.normalizeDateStr(appt.appointmentDate) >= today;
  }

  // ─── Cancel Modal ──────────────────────────────────────────────────────────
  openCancelModal(appt: AppointmentItem) {
    this.appointmentToCancel = appt;
    this.cancelReason = '';
    this.cancelResult = null;
    this.showCancelModal = true;
  }

  closeCancelModal() {
    this.showCancelModal = false;
    this.appointmentToCancel = null;
    this.cancelResult = null;
  }

  getRefundPreview(appt: AppointmentItem): string {
    const apptDateTime = new Date(`${appt.appointmentDate}T${this.to24h(appt.startTime)}`);
    const hours = (apptDateTime.getTime() - Date.now()) / (1000 * 60 * 60);
    if (hours > 12) return `Full refund of ₹${appt.amount}`;
    if (hours >= 6) return `50% refund of ₹${Math.floor(appt.amount * 0.5)}`;
    return 'No refund (less than 6 hours before appointment)';
  }

  confirmCancel() {
    if (!this.appointmentToCancel) return;
    this.cancellingInProgress = true;

    this.appointmentService.cancelAppointment(this.appointmentToCancel._id, this.cancelReason).subscribe({
      next: (res) => {
        this.cancellingInProgress = false;
        this.cancelResult = res;
        this.loadMyAppointments();
      },
      error: (err) => {
        this.cancellingInProgress = false;
        this.showToast(err.error?.message || 'Cancellation failed.', 'error');
      }
    });
  }

  to24h(timeStr: string): string {
    const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!match) return '00:00';
    let h = parseInt(match[1]);
    const m = match[2];
    const mod = match[3].toUpperCase();
    if (mod === 'PM' && h < 12) h += 12;
    if (mod === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${m}`;
  }

  formatDate(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  }

  // ─── 🥗 Dietary CarePath & Clinical Meal Plan Modal Handlers ───────────────
  openCarePathModal(appt: AppointmentItem): void {
    this.selectedCarePathAppt = appt;
    this.showCarePathModal = true;
    this.activeCarePathTab = 'careplan';
    this.loadMealPlan(appt._id);
  }

  closeCarePathModal(): void {
    this.showCarePathModal = false;
    this.selectedCarePathAppt = null;
  }

  loadMealPlan(appointmentId?: string): void {
    this.loadingMealPlan = true;
    this.nutritionService.getDynamicMealPlan(appointmentId).subscribe({
      next: (res) => {
        this.loadingMealPlan = false;
        if (res && res.success) {
          this.mealPlan = res.mealPlan;
          this.mealPlanRegion = res.patientRegion || 'Kerala, India';
        }
      },
      error: (err) => {
        this.loadingMealPlan = false;
        console.error('Failed to load clinical meal plan:', err);
      }
    });
  }

  // ─── 📸 AI Food & Macro Tracker Handlers ──────────────────────────────────
  onFoodImageSelected(event: any): void {
    const file = event.target?.files?.[0];
    if (file) {
      this.uploadAndRecognizeFood(file);
    }
  }

  uploadAndRecognizeFood(file: File): void {
    if (!file.type.startsWith('image/')) {
      this.showToast('Please select a valid food image (JPEG, PNG, WEBP).', 'error');
      return;
    }

    this.selectedFoodFile = file;
    this.isRecognizingImage = true;
    this.analyzedFoodResult = null;

    // Create local image preview
    const reader = new FileReader();
    reader.onload = (e: any) => {
      this.foodImagePreview = e.target.result;
    };
    reader.readAsDataURL(file);

    const formData = new FormData();
    formData.append('image', file);

    this.nutritionService.recognizeFoodImage(formData).subscribe({
      next: (res) => {
        this.isRecognizingImage = false;
        if (res && res.success) {
          this.geminiRecognizedDish = res.dishName;
          this.geminiConfidence = res.confidence;
          this.geminiIngredients = res.ingredients || [];
          this.uploadedFoodImageUrl = res.imageUrl || null;
          
          // Auto-populate editable input box
          this.foodTrackerInput = res.dishName;
          if (res.suggestedMealType) {
            this.foodTrackerMealType = res.suggestedMealType;
          }
          this.showToast(`✨ Gemini Vision identified: "${res.dishName}"!`, 'success');

          // Automatically trigger clinical macro analysis
          this.analyzeFoodItem();
        }
      },
      error: (err) => {
        this.isRecognizingImage = false;
        this.showToast(err.error?.message || 'Food image recognition failed.', 'error');
      }
    });
  }

  removeFoodImage(): void {
    this.selectedFoodFile = null;
    this.foodImagePreview = null;
    this.uploadedFoodImageUrl = null;
    this.geminiRecognizedDish = '';
    this.geminiConfidence = 0;
    this.geminiIngredients = [];
  }

  foodInputError: string = '';

  onFoodInputChange(): void {
    this.foodInputError = '';
  }

  analyzeFoodItem(): void {
    const query = (this.foodTrackerInput || '').trim();
    this.foodInputError = '';

    if (!query) {
      this.foodInputError = 'Please enter a dish name to analyze macros.';
      this.showToast('Please enter or verify the dish name to analyze macros.', 'error');
      return;
    }

    // Validation: Must contain at least 2 alphabetic characters (rejects pure numbers like "3333333000" or random symbols)
    const hasLetters = /[a-zA-Z]{2,}/.test(query);
    const validCharsRegex = /^[a-zA-Z0-9\s,.\-()'&/]+$/;

    if (!hasLetters || !validCharsRegex.test(query)) {
      this.foodInputError = 'Please enter a recognizable food dish name (e.g. "Vegetable Hakka Noodles", "2 Rotis").';
      this.showToast('Invalid dish name: please enter an edible food name, not pure numbers or random symbols.', 'error');
      return;
    }

    this.isAnalyzingFood = true;
    this.analyzedFoodResult = null;

    this.nutritionService.analyzeFood(query).subscribe({
      next: (res) => {
        this.isAnalyzingFood = false;
        if (res && res.success && res.data) {
          this.analyzedFoodResult = res.data;
          this.showToast(`✅ Macros calculated for ${res.data.foodItem}!`, 'success');
        }
      },
      error: (err) => {
        this.isAnalyzingFood = false;
        const msg = err.error?.message || 'Could not calculate macros. Please verify the food dish name.';
        this.foodInputError = msg;
        this.showToast(msg, 'error');
      }
    });
  }

  quickAnalyzeFood(sampleName: string): void {
    this.foodTrackerInput = sampleName;
    this.analyzeFoodItem();
  }

  triggerMealPhotoUpload(mealType: 'Breakfast' | 'Lunch' | 'Dinner', dishName: string): void {
    this.foodTrackerMealType = mealType;
    this.foodTrackerInput = dishName;
    this.showToast(`📸 Opening camera / photo upload for ${mealType}...`, 'success');
    
    // Smooth scroll down to photo uploader section
    const el = document.getElementById('ai-food-uploader-section');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    
    setTimeout(() => {
      const inputEl = document.getElementById('carepath-food-photo-file-input') as HTMLInputElement;
      if (inputEl) {
        inputEl.click();
      }
    }, 250);
  }

  confirmAndLogMeal(): void {
    if (!this.analyzedFoodResult) return;

    this.isLoggingFood = true;
    const currentMealType = this.foodTrackerMealType;
    const payload = {
      mealType: currentMealType,
      foodItemName: this.analyzedFoodResult.foodItem,
      imageUrl: this.uploadedFoodImageUrl || undefined,
      nutritionalData: {
        calories: this.analyzedFoodResult.calories,
        proteinGrams: this.analyzedFoodResult.protein,
        carbsGrams: this.analyzedFoodResult.carbs,
        fatGrams: this.analyzedFoodResult.fat,
        sodiumMg: this.analyzedFoodResult.sodium,
        fiberGrams: this.analyzedFoodResult.fiber
      }
    };

    this.nutritionService.logMeal(payload).subscribe({
      next: (res) => {
        this.isLoggingFood = false;
        this.loggedMeals.unshift({
          mealType: currentMealType,
          foodItemName: this.analyzedFoodResult!.foodItem,
          imageUrl: this.uploadedFoodImageUrl || undefined,
          calories: this.analyzedFoodResult!.calories,
          protein: this.analyzedFoodResult!.protein,
          carbs: this.analyzedFoodResult!.carbs,
          sodium: this.analyzedFoodResult!.sodium,
          time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
        });

        // Automatically mark this meal category as eaten in today's checklist
        const mealKey = currentMealType.toLowerCase();
        this.mealChecklistState[mealKey] = true;
        const todayStr = this.getTodayDateString();
        localStorage.setItem(`carepath_meals_${todayStr}`, JSON.stringify(this.mealChecklistState));

        this.showToast(`🎉 ${this.analyzedFoodResult!.foodItem} logged to your CarePath history!`, 'success');
        this.analyzedFoodResult = null;
        this.foodTrackerInput = '';
        this.removeFoodImage();
      },
      error: (err) => {
        this.isLoggingFood = false;
        this.showToast(err.error?.message || 'Failed to log meal.', 'error');
      }
    });
  }

  onLogout() {
    this.authService.logout();
    this.router.navigate(['/auth/login']);
  }
  // ─── Symptom Checker Methods ──────────────────────────────────────────────
  toggleSymptomBot() {
    this.isSymptomBotOpen = !this.isSymptomBotOpen;
  }

  analyzeSymptoms() {
    if (!this.symptomInput || this.symptomInput.trim().length === 0) {
      return;
    }

    const userText = this.symptomInput.trim();
    this.chatMessages.push({ type: 'user', text: userText });
    this.symptomInput = '';
    
    // Build context from previous user messages
    const previousUserContext = this.chatMessages
      .filter(m => m.type === 'user' && m.text !== userText)
      .map(m => m.text)
      .join('. ');
      
    const fullDescription = previousUserContext 
      ? `Previous context: ${previousUserContext}. Current input: ${userText}`
      : userText;

    this.isAnalyzingSymptoms = true;
    this.chatMessages.push({ type: 'bot', isTyping: true });

    // Auto-scroll to bottom (timeout ensures DOM has updated)
    setTimeout(() => this.scrollToChatBottom(), 50);

    this.http.post<any>(`${getApiBaseUrl()}/api/symptoms/analyze`, { description: fullDescription })
      .subscribe({
        next: (res) => {
          this.isAnalyzingSymptoms = false;
          // Remove typing indicator
          this.chatMessages = this.chatMessages.filter(m => !m.isTyping);
          // Add bot response
          this.chatMessages.push({ type: 'bot', result: res });
          setTimeout(() => this.scrollToChatBottom(), 50);
        },
        error: (err) => {
          this.isAnalyzingSymptoms = false;
          this.chatMessages = this.chatMessages.filter(m => !m.isTyping);
          this.showToast(err.error?.message || 'Failed to analyze symptoms. Please try again.', 'error');
        }
      });
  }

  private scrollToChatBottom() {
    const chatBody = document.querySelector('.symptom-bot-body');
    if (chatBody) {
      chatBody.scrollTop = chatBody.scrollHeight;
    }
  }

  bookSpecialist(specialtyName: string) {
    this.searchQuery = specialtyName;
    this.isSymptomBotOpen = false; // Close the bot
    this.setTab('find-doctors');
    // apply filtering
    this.onSearch();
  }

  // ─── 📑 Medical Records Vault Handlers ─────────────────────────────────────
  loadReports(): void {
    this.loadingReports = true;
    this.reportService.getMyReports().subscribe({
      next: (res) => {
        this.loadingReports = false;
        if (res && res.success) {
          this.reports = res.reports || [];
        }
      },
      error: (err) => {
        this.loadingReports = false;
        console.warn('Could not load medical reports:', err);
      }
    });
  }

  get filteredReports(): MedicalReport[] {
    let list = this.reports;
    if (this.selectedReportTypeFilter !== 'all') {
      list = list.filter(r => r.reportType === this.selectedReportTypeFilter);
    }
    if (this.reportSearch.trim()) {
      const q = this.reportSearch.toLowerCase().trim();
      list = list.filter(r => 
        (r.title && r.title.toLowerCase().includes(q)) ||
        (r.originalFilename && r.originalFilename.toLowerCase().includes(q)) ||
        (r.aiAnalysis?.summary && r.aiAnalysis.summary.toLowerCase().includes(q)) ||
        (r.aiAnalysis?.recommendedSpecialty && r.aiAnalysis.recommendedSpecialty.toLowerCase().includes(q)) ||
        (r.aiAnalysis?.biomarkers && r.aiAnalysis.biomarkers.some(b => b.name.toLowerCase().includes(q)))
      );
    }
    return list;
  }

  get totalNormalBiomarkersCount(): number {
    return this.reports.reduce((acc, r) => {
      const n = (r.aiAnalysis?.biomarkers || []).filter(b => b.flag === 'Normal').length;
      return acc + n;
    }, 0);
  }

  get totalCriticalOrAttentionFlagsCount(): number {
    return this.reports.reduce((acc, r) => {
      const n = (r.aiAnalysis?.biomarkers || []).filter(b => b.flag === 'High' || b.flag === 'Critical' || b.flag === 'Borderline').length;
      return acc + n;
    }, 0);
  }

  openUploadModal(preselectedApptId?: string): void {
    this.uploadTitle = '';
    this.uploadReportType = 'Blood Test';
    this.uploadReportDate = this.getTodayDateString();
    this.uploadAppointmentId = preselectedApptId || '';
    this.isSharedAllToggle = true;
    this.selectedFileToUpload = null;
    this.selectedFilePreviewUrl = null;
    this.uploadErrorMsg = '';
    this.showUploadModal = true;
  }

  closeUploadModal(): void {
    if (this.uploadingReport) return;
    this.showUploadModal = false;
    this.selectedFileToUpload = null;
    this.selectedFilePreviewUrl = null;
    this.uploadErrorMsg = '';
  }

  onReportFileSelected(event: any): void {
    const file = event.target?.files?.[0];
    if (!file) return;

    if (file.size > 25 * 1024 * 1024) {
      this.uploadErrorMsg = 'File size exceeds 25MB limit. Please upload a smaller PDF or image.';
      return;
    }

    this.uploadErrorMsg = '';
    this.selectedFileToUpload = file;
    if (!this.uploadTitle) {
      this.uploadTitle = file.name.replace(/\.[^/.]+$/, '');
    }

    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => {
        this.selectedFilePreviewUrl = reader.result as string;
      };
      reader.readAsDataURL(file);
    } else {
      this.selectedFilePreviewUrl = null;
    }
  }

  submitUploadReport(): void {
    if (!this.selectedFileToUpload) {
      this.uploadErrorMsg = 'Please select a PDF or image medical report to upload.';
      return;
    }

    this.uploadingReport = true;
    this.uploadErrorMsg = '';

    const formData = new FormData();
    formData.append('reportFile', this.selectedFileToUpload);
    formData.append('title', this.uploadTitle || this.selectedFileToUpload.name);
    formData.append('reportType', this.uploadReportType);
    if (this.uploadReportDate) {
      formData.append('reportDate', this.uploadReportDate);
    }
    if (this.uploadAppointmentId) {
      formData.append('appointmentId', this.uploadAppointmentId);
    }
    formData.append('isSharedWithAllConsultingDoctors', this.isSharedAllToggle.toString());

    this.reportService.uploadReport(formData).subscribe({
      next: (res) => {
        this.uploadingReport = false;
        if (res && res.success) {
          this.showToast('🎉 Medical report uploaded and analyzed by CarePath AI!', 'success');
          this.closeUploadModal();
          this.loadReports();
          if (res.report) {
            this.openReportDetailModal(res.report);
          }
        }
      },
      error: (err) => {
        this.uploadingReport = false;
        this.uploadErrorMsg = err.error?.message || 'Failed to upload report. Please check file format and try again.';
      }
    });
  }

  openReportDetailModal(report: MedicalReport): void {
    this.selectedReportDetail = report;
    this.showReportDetailModal = true;
  }

  closeReportDetailModal(): void {
    this.showReportDetailModal = false;
    this.selectedReportDetail = null;
  }

  deleteReport(reportId: string, event?: Event): void {
    if (event) event.stopPropagation();
    if (!confirm('Are you sure you want to permanently delete this report from your vault?')) {
      return;
    }

    this.reportService.deleteReport(reportId).subscribe({
      next: () => {
        this.showToast('Medical report removed from vault.', 'success');
        if (this.selectedReportDetail?._id === reportId) {
          this.closeReportDetailModal();
        }
        this.loadReports();
      },
      error: () => {
        this.showToast('Failed to delete report. Please try again.', 'error');
      }
    });
  }

  toggleDoctorSharing(report: MedicalReport, doctorId: string, isCurrentlyShared: boolean): void {
    const action = isCurrentlyShared ? 'revoke' : 'grant';
    this.reportService.updateSharing(report._id, { doctorId, action }).subscribe({
      next: (res) => {
        if (res && res.success) {
          report.sharedWithDoctorIds = res.report.sharedWithDoctorIds;
          this.showToast(`Doctor access ${action === 'grant' ? 'granted' : 'revoked'}.`, 'success');
        }
      },
      error: () => this.showToast('Could not update doctor access permissions.', 'error')
    });
  }

  toggleShareAllDoctors(report: MedicalReport): void {
    const newVal = !report.isSharedWithAllConsultingDoctors;
    this.reportService.updateSharing(report._id, { isSharedWithAllConsultingDoctors: newVal }).subscribe({
      next: (res) => {
        if (res && res.success) {
          report.isSharedWithAllConsultingDoctors = newVal;
          this.showToast(newVal ? 'Sharing enabled for all consulting doctors.' : 'Sharing restricted to linked doctors.', 'success');
        }
      },
      error: () => this.showToast('Could not update sharing permissions.', 'error')
    });
  }

  openLinkModal(report: MedicalReport, event?: Event): void {
    if (event) event.stopPropagation();
    this.linkingReport = report;
    this.targetAppointmentIdForLink = '';
    this.showLinkModal = true;
  }

  closeLinkModal(): void {
    this.showLinkModal = false;
    this.linkingReport = null;
    this.targetAppointmentIdForLink = '';
  }

  confirmLinkToConsultation(): void {
    if (!this.linkingReport || !this.targetAppointmentIdForLink) return;
    this.linkingInProgress = true;
    this.reportService.linkToConsultation(this.linkingReport._id, this.targetAppointmentIdForLink).subscribe({
      next: (res) => {
        this.linkingInProgress = false;
        if (res && res.success) {
          this.showToast('Report linked to consultation successfully.', 'success');
          this.closeLinkModal();
          this.loadReports();
        }
      },
      error: () => {
        this.linkingInProgress = false;
        this.showToast('Failed to link report to consultation.', 'error');
      }
    });
  }

  bookSpecialistForReport(report: MedicalReport, event?: Event): void {
    if (event) event.stopPropagation();
    const specialty = report.aiAnalysis?.recommendedSpecialty || 'General Practice';
    
    // Auto-attach this report to next booking
    this.attachedReportIdsForBooking = [report._id];

    // Filter doctors by specialty
    this.searchQuery = specialty;
    this.setTab('find-doctors');
    this.onSearch();
    
    this.showToast(`🔍 Showing doctors specializing in ${specialty}. Report "${report.title}" is attached for your consultation!`, 'success');
  }

  toggleReportAttachmentForBooking(reportId: string): void {
    const idx = this.attachedReportIdsForBooking.indexOf(reportId);
    if (idx > -1) {
      this.attachedReportIdsForBooking.splice(idx, 1);
    } else {
      this.attachedReportIdsForBooking.push(reportId);
    }
  }

  isReportAttachedForBooking(reportId: string): boolean {
    return this.attachedReportIdsForBooking.includes(reportId);
  }

  getBiomarkerBadgeClass(flag: string): string {
    switch (flag) {
      case 'High': return 'badge-flag-high';
      case 'Critical': return 'badge-flag-critical';
      case 'Borderline': return 'badge-flag-borderline';
      case 'Low': return 'badge-flag-low';
      case 'Normal':
      default:
        return 'badge-flag-normal';
    }
  }

  formatReportFileSize(bytes: number): string {
    if (!bytes) return '0 KB';
    if (bytes < 1024 * 1024) {
      return (bytes / 1024).toFixed(1) + ' KB';
    }
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  // ─── 🏋️ Clinical Physical Rehabilitation & AI Guided Studio Handlers ───────
  loadPrescribedExercises(): void {
    this.loadingExercises = true;
    this.appointmentService.getMyPrescribedExercises().subscribe({
      next: (res) => {
        this.loadingExercises = false;
        if (res && res.success && res.exercises && res.exercises.length > 0) {
          this.prescribedExercisesList = res.exercises;
        } else {
          this.prescribedExercisesList = [];
        }
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loadingExercises = false;
        console.warn('Failed to load prescribed exercises:', err);
        this.cdr.detectChanges();
      }
    });
  }

  get activeExercises(): ExerciseItem[] {
    return this.prescribedExercisesList.length > 0 ? this.prescribedExercisesList : this.defaultCatalogExercises;
  }

  openDemoModal(exercise: ExerciseItem): void {
    this.selectedDemoExercise = exercise;
    this.demoVideoFailed = false;
    this.demoActiveTab = 'kinematics';
    this.showDemoModal = true;
  }

  closeDemoModal(): void {
    this.showDemoModal = false;
    this.selectedDemoExercise = null;
    this.demoVideoFailed = false;
  }

  onDemoVideoError(): void {
    console.warn('[DEMO VIDEO] Video stream unavailable or hotlink restricted. Displaying AI Biomechanical Kinematics.');
    this.demoVideoFailed = true;
    this.demoActiveTab = 'kinematics';
    this.cdr.detectChanges();
  }

  previewExerciseVoiceCue(exercise: ExerciseItem | null): void {
    if (!exercise) return;
    const cues: Record<string, string> = {
      squats: 'Keep your chest tall, hinge your hips back, and bend your knees smoothly until 90 degrees.',
      knee_extension: 'Sit tall, extend your leg straight until your knee reaches 180 degrees, and pause for two seconds.',
      shoulder_abduction: 'Raise both arms smoothly out to your sides until shoulder level at 90 degrees, then lower with control.',
      bicep_curl: 'Keep your elbows glued to your sides, curl upward toward your shoulders, then lower slowly.'
    };
    const cue = cues[exercise.exerciseId] || `Perform ${exercise.name} with controlled tempo and steady breathing.`;
    this.speakVoiceFeedback(cue, 0);
  }

  loadExerciseLogs(): void {
    this.loadingExerciseLogs = true;
    this.appointmentService.getExerciseLogs().subscribe({
      next: (res) => {
        this.loadingExerciseLogs = false;
        if (res && res.success && res.logs) {
          this.exerciseLogsHistory = res.logs;
        }
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loadingExerciseLogs = false;
        console.warn('[EXERCISE LOGS] Could not fetch exercise logs from MongoDB:', err);
        this.cdr.detectChanges();
      }
    });
  }

  loadExerciseAnalytics(): void {
    this.loadingExerciseAnalytics = true;
    this.appointmentService.getExerciseAnalytics().subscribe({
      next: (res) => {
        this.loadingExerciseAnalytics = false;
        if (res && res.success) {
          this.exerciseAnalytics = res;
        }
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loadingExerciseAnalytics = false;
        console.warn('[EXERCISE ANALYTICS] Could not fetch exercise analytics from MongoDB:', err);
        this.cdr.detectChanges();
      }
    });
  }

  recordFormError(errorMsg: string): void {
    if (!this.sessionFormErrors.includes(errorMsg)) {
      this.sessionFormErrors.push(errorMsg);
    }
  }

  async openExerciseStudio(exercise: ExerciseItem): Promise<void> {
    this.activeStudioExercise = exercise;
    this.studioTargetReps = exercise.targetReps || 10;
    this.studioTargetSets = exercise.targetSets || 3;
    this.studioCurrentReps = 0;
    this.studioCurrentSets = 1;
    this.exerciseRepStage = 'up';
    this.studioCurrentAngle = 0;
    this.studioFeedbackText = 'Position yourself so your full body is visible in the frame';
    this.studioFeedbackStatus = 'neutral';
    this.isExerciseStudioOpen = true;
    this.isSafetyVerificationActive = false;
    this.isEmergencyDispatched = false;
    this.isRoutineCompleted = false;
    this.lastLandmarkMovementTime = Date.now();
    this.prevNoseY = null;
    this.prevNoseTime = Date.now();
    this.showDemoModal = false;

    // Reset Biomechanical Telemetry Accumulator (Features 3, 4, 7, 9)
    this.studioPhase = 'ACTIVE';
    this.sessionStartTime = Date.now();
    this.sessionValidReps = 0;
    this.sessionIncompleteReps = 0;
    this.sessionMinAngle = 999;
    this.sessionMaxAngle = 0;
    this.sessionFormErrors = [];
    this.sessionSafetyIncidents = 0;
    this.currentRepMinAngle = 180;
    this.currentRepMaxAngle = 0;
    this.sessionSummaryData = null;

    // Resolve Routine Index
    const idx = this.prescribedExercisesList.findIndex(e => (e.exerciseId === exercise.exerciseId || e.name === exercise.name));
    this.studioRoutineIndex = idx >= 0 ? idx : 0;
    this.checkNextRoutineExercise();

    this.speakVoiceFeedback(`Starting ${exercise.name}. Follow my voice cues and keep steady form!`, 0);

    setTimeout(() => {
      this.initPoseDetection();
    }, 250);
  }

  checkNextRoutineExercise(): void {
    if (this.prescribedExercisesList && this.studioRoutineIndex < this.prescribedExercisesList.length - 1) {
      this.hasNextRoutineExercise = true;
      this.nextRoutineExercise = this.prescribedExercisesList[this.studioRoutineIndex + 1];
    } else {
      this.hasNextRoutineExercise = false;
      this.nextRoutineExercise = null;
    }
  }

  startNextRoutineExercise(): void {
    if (!this.nextRoutineExercise) return;
    const nextEx = this.nextRoutineExercise;
    this.activeStudioExercise = nextEx;
    this.studioRoutineIndex++;
    this.checkNextRoutineExercise();
    this.studioTargetReps = nextEx.targetReps || 10;
    this.studioTargetSets = nextEx.targetSets || 3;
    this.studioCurrentReps = 0;
    this.studioCurrentSets = 1;
    this.exerciseRepStage = 'up';
    this.studioCurrentAngle = 0;
    this.studioFeedbackText = `Ready! Begin ${nextEx.name}`;
    this.studioFeedbackStatus = 'neutral';
    this.isExerciseDone = false;

    // Reset Telemetry for next routine exercise
    this.studioPhase = 'ACTIVE';
    this.sessionStartTime = Date.now();
    this.sessionValidReps = 0;
    this.sessionIncompleteReps = 0;
    this.sessionMinAngle = 999;
    this.sessionMaxAngle = 0;
    this.sessionFormErrors = [];
    this.sessionSafetyIncidents = 0;
    this.currentRepMinAngle = 180;
    this.currentRepMaxAngle = 0;
    this.sessionSummaryData = null;

    this.speakVoiceFeedback(`Next exercise: ${nextEx.name}. Follow my cues!`, 0);
    this.cdr.detectChanges();
  }

  closeExerciseStudio(): void {
    if (this.restIntervalTimer) {
      clearInterval(this.restIntervalTimer);
      this.restIntervalTimer = null;
    }

    if (this.safetyCountdownInterval) {
      clearInterval(this.safetyCountdownInterval);
      this.safetyCountdownInterval = null;
    }

    if (this.studioMediaStream) {
      this.studioMediaStream.getTracks().forEach(t => t.stop());
      this.studioMediaStream = null;
    }

    if (this.poseDetector && typeof this.poseDetector.close === 'function') {
      try {
        this.poseDetector.close();
      } catch (e) {}
      this.poseDetector = null;
    }

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    this.isExerciseStudioOpen = false;
    this.activeStudioExercise = null;
    this.isCameraActive = false;
    this.studioIsDetecting = false;
    this.isSafetyVerificationActive = false;
    this.isEmergencyDispatched = false;
    this.studioPhase = 'ACTIVE';
    this.sessionSummaryData = null;
  }

  async initPoseDetection(): Promise<void> {
    this.cameraErrorMsg = '';
    this.studioIsDetecting = true;
    this.isCameraActive = false;

    try {
      this.studioMediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false
      });

      if (this.studioVideoRef && this.studioVideoRef.nativeElement) {
        const videoEl = this.studioVideoRef.nativeElement;
        videoEl.srcObject = this.studioMediaStream;
        await videoEl.play();
        this.isCameraActive = true;
        this.cdr.detectChanges();
      }
    } catch (err: any) {
      console.error('Camera access failed:', err);
      this.cameraErrorMsg = 'Camera permission was denied or camera is unavailable. Please grant camera access in browser permissions.';
      this.studioIsDetecting = false;
      this.cdr.detectChanges();
      return;
    }

    try {
      if (typeof Pose === 'undefined') {
        console.warn('MediaPipe Pose script loading from CDN...');
        await new Promise(r => setTimeout(r, 1200));
      }

      if (typeof Pose !== 'undefined') {
        this.poseDetector = new Pose({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
        });

        this.poseDetector.setOptions({
          modelComplexity: 1,
          smoothLandmarks: true,
          enableSegmentation: false,
          smoothSegmentation: false,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5
        });

        this.poseDetector.onResults((results: any) => {
          this.ngZone.run(() => {
            this.processPoseResults(results);
          });
        });

        const videoEl = this.studioVideoRef?.nativeElement;
        if (videoEl) {
          const sendFrame = async () => {
            if (!this.isExerciseStudioOpen || !this.isCameraActive) return;
            if (videoEl.readyState >= 2 && this.poseDetector) {
              try {
                await this.poseDetector.send({ image: videoEl });
              } catch (e) {}
            }
            if (this.isExerciseStudioOpen) {
              requestAnimationFrame(sendFrame);
            }
          };
          requestAnimationFrame(sendFrame);
        }
      } else {
        this.studioFeedbackText = 'Pose model loading... Position yourself in frame to start.';
      }
    } catch (poseErr) {
      console.warn('Pose detector init notice:', poseErr);
    }
  }

  processPoseResults(results: any): void {
    if (!this.studioCanvasRef || !this.studioCanvasRef.nativeElement) return;
    const canvas = this.studioCanvasRef.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width = canvas.parentElement?.clientWidth || 640;
    const height = canvas.height = canvas.parentElement?.clientHeight || 480;

    ctx.clearRect(0, 0, width, height);

    if (results.poseLandmarks && results.poseLandmarks.length > 0) {
      const landmarks = results.poseLandmarks;

      this.detectFallAndInactivity(landmarks);
      if (this.isSafetyVerificationActive || this.isEmergencyDispatched) {
        return;
      }
      this.evaluateExerciseForm(landmarks);
      this.drawPoseSkeleton(ctx, landmarks, width, height);
    } else {
      this.studioFeedbackText = 'Step back so your full body is in the camera view';
      this.studioFeedbackStatus = 'neutral';
    }

    this.cdr.detectChanges();
  }

  detectFallAndInactivity(landmarks: any[]): void {
    if (this.isSafetyVerificationActive || this.isEmergencyDispatched) return;

    const nose = landmarks[0];
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    const now = Date.now();

    if (!nose || !leftShoulder || !rightShoulder) return;

    if (this.prevNoseY !== null) {
      const dt = Math.max(0.01, (now - this.prevNoseTime) / 1000);
      const velocityY = (nose.y - this.prevNoseY) / dt;

      if (velocityY > 1.25 && nose.y > 0.72) {
        this.triggerSafetyVerification('Sudden downward fall detected during exercise');
        return;
      }

      if (nose.y > 0.82 && leftShoulder.y > 0.78 && rightShoulder.y > 0.78) {
        this.triggerSafetyVerification('Patient collapsed on floor during exercise');
        return;
      }

      // Inactivity / stillness check (ONLY during active exercise phase, NOT during rest intervals!)
      if (this.studioPhase === 'ACTIVE') {
        const dNose = Math.abs(nose.y - this.prevNoseY);
        if (dNose > 0.02) {
          this.lastLandmarkMovementTime = now;
        } else {
          if (now - this.lastLandmarkMovementTime > 15000) {
            this.triggerSafetyVerification('Prolonged unresponsiveness detected mid-exercise');
            return;
          }
        }
      }
    }

    this.prevNoseY = nose.y;
    this.prevNoseTime = now;
  }

  evaluateExerciseForm(landmarks: any[]): void {
    if (!this.activeStudioExercise || this.isSafetyVerificationActive || this.isEmergencyDispatched || this.studioPhase !== 'ACTIVE') return;
    const exId = this.activeStudioExercise.exerciseId || 'squats';

    const lHip = landmarks[23];
    const rHip = landmarks[24];
    const lKnee = landmarks[25];
    const rKnee = landmarks[26];
    const lAnkle = landmarks[27];
    const rAnkle = landmarks[28];
    const lShoulder = landmarks[11];
    const rShoulder = landmarks[12];
    const lElbow = landmarks[13];
    const rElbow = landmarks[14];
    const lWrist = landmarks[15];
    const rWrist = landmarks[16];

    const isLeftMoreVisible = (lKnee?.visibility || 0) > (rKnee?.visibility || 0);

    if (exId === 'squats') {
      const hip = isLeftMoreVisible ? lHip : rHip;
      const knee = isLeftMoreVisible ? lKnee : rKnee;
      const ankle = isLeftMoreVisible ? lAnkle : rAnkle;

      if (!hip || !knee || !ankle) return;
      const angle = this.calculateAngle(hip, knee, ankle);
      this.studioCurrentAngle = angle;
      this.studioAngleTargetLabel = 'Knee Flexion (Target: 90°)';

      // Accumulate joint angle telemetry
      this.currentRepMinAngle = Math.min(this.currentRepMinAngle, angle);
      this.sessionMinAngle = Math.min(this.sessionMinAngle, angle);
      this.sessionMaxAngle = Math.max(this.sessionMaxAngle, angle);

      if (angle > 155) {
        if (this.exerciseRepStage === 'down') {
          this.studioCurrentReps++;
          this.exerciseRepStage = 'up';

          if (this.currentRepMinAngle <= 95) {
            this.sessionValidReps++;
            this.studioFeedbackText = `✓ Rep ${this.studioCurrentReps} complete: Excellent depth (${this.currentRepMinAngle}°)`;
            this.studioFeedbackStatus = 'good';
            this.speakVoiceFeedback(`Rep ${this.studioCurrentReps} complete! Great depth.`, 3500);
          } else {
            this.sessionIncompleteReps++;
            this.recordFormError(`Shallow squat depth (${this.currentRepMinAngle}° vs 90° target)`);
            this.studioFeedbackText = `⚠ Rep ${this.studioCurrentReps}: Shallow depth (${this.currentRepMinAngle}°). Bend deeper next rep.`;
            this.studioFeedbackStatus = 'adjust';
            this.speakVoiceFeedback(`Rep ${this.studioCurrentReps} counted. Bend a little deeper next rep.`, 3500);
          }
          this.currentRepMinAngle = 180;
          this.checkSetCompletion();
        } else {
          this.studioFeedbackText = 'Begin squatting down by pushing hips back smoothly';
          this.studioFeedbackStatus = 'neutral';
        }
      } else if (angle <= 95 && angle >= 70) {
        this.exerciseRepStage = 'down';
        this.studioFeedbackText = `Great depth (${angle}° reached)! Hold and push back up through heels`;
        this.studioFeedbackStatus = 'good';
        this.speakVoiceFeedback('Good depth! Now push up smoothly.', 3500);
      } else if (angle > 95 && angle < 140) {
        this.studioFeedbackText = 'Bend your knees further to reach the 90° target zone';
        this.studioFeedbackStatus = 'adjust';
        this.speakVoiceFeedback('Bend your knees a little further.', 3500);
      }
    } else if (exId === 'knee_extension') {
      const hip = isLeftMoreVisible ? lHip : rHip;
      const knee = isLeftMoreVisible ? lKnee : rKnee;
      const ankle = isLeftMoreVisible ? lAnkle : rAnkle;

      if (!hip || !knee || !ankle) return;
      const angle = this.calculateAngle(hip, knee, ankle);
      this.studioCurrentAngle = angle;
      this.studioAngleTargetLabel = 'Knee Extension (Target: 170°)';

      this.currentRepMaxAngle = Math.max(this.currentRepMaxAngle, angle);
      this.sessionMinAngle = Math.min(this.sessionMinAngle, angle);
      this.sessionMaxAngle = Math.max(this.sessionMaxAngle, angle);

      if (angle >= 160) {
        if (this.exerciseRepStage === 'up') {
          this.studioFeedbackText = `Full extension (${angle}°)! Hold for a moment, then lower slowly`;
          this.studioFeedbackStatus = 'good';
          this.speakVoiceFeedback('Good hold! Now lower slowly with control.', 3500);
          this.exerciseRepStage = 'down';
        }
      } else if (angle < 105) {
        if (this.exerciseRepStage === 'down') {
          this.studioCurrentReps++;
          this.exerciseRepStage = 'up';

          if (this.currentRepMaxAngle >= 160) {
            this.sessionValidReps++;
            this.studioFeedbackText = `✓ Rep ${this.studioCurrentReps} complete: Full extension (${this.currentRepMaxAngle}°)`;
            this.studioFeedbackStatus = 'good';
            this.speakVoiceFeedback(`Rep ${this.studioCurrentReps} done! Full extension.`, 3500);
          } else {
            this.sessionIncompleteReps++;
            this.recordFormError(`Incomplete knee extension (${this.currentRepMaxAngle}° vs 170° target)`);
            this.studioFeedbackText = `⚠ Rep ${this.studioCurrentReps}: Incomplete extension (${this.currentRepMaxAngle}°). Straighten fully.`;
            this.studioFeedbackStatus = 'adjust';
            this.speakVoiceFeedback(`Rep ${this.studioCurrentReps} counted. Straighten knee fully next time.`, 3500);
          }
          this.currentRepMaxAngle = 0;
          this.checkSetCompletion();
        } else {
          this.studioFeedbackText = 'Extend your lower leg straight outward';
          this.studioFeedbackStatus = 'neutral';
        }
      } else if (angle >= 115 && angle < 155) {
        this.studioFeedbackText = 'Extend your knee further to reach full straightening';
        this.studioFeedbackStatus = 'adjust';
        this.speakVoiceFeedback('Extend your knee further.', 3500);
      }
    } else if (exId === 'shoulder_abduction') {
      const isLeftArm = (lShoulder?.visibility || 0) > (rShoulder?.visibility || 0);
      const hip = isLeftArm ? lHip : rHip;
      const shoulder = isLeftArm ? lShoulder : rShoulder;
      const elbow = isLeftArm ? lElbow : rElbow;

      if (!hip || !shoulder || !elbow) return;
      const angle = this.calculateAngle(hip, shoulder, elbow);
      this.studioCurrentAngle = angle;
      this.studioAngleTargetLabel = 'Shoulder Elevation (Target: 90°)';

      this.currentRepMaxAngle = Math.max(this.currentRepMaxAngle, angle);
      this.sessionMinAngle = Math.min(this.sessionMinAngle, angle);
      this.sessionMaxAngle = Math.max(this.sessionMaxAngle, angle);

      if (angle >= 80 && angle <= 98) {
        this.exerciseRepStage = 'down';
        this.studioFeedbackText = `Optimal shoulder level (${angle}°)! Hold and lower with control`;
        this.studioFeedbackStatus = 'good';
        this.speakVoiceFeedback('Perfect height! Lower slowly.', 3500);
      } else if (angle > 105) {
        this.studioFeedbackText = `Arms raised too high (${angle}°). Keep parallel to shoulders`;
        this.studioFeedbackStatus = 'adjust';
        this.recordFormError(`Shoulder hyper-abduction (${angle}°)`);
        this.speakVoiceFeedback('A little lower, parallel to shoulders.', 3500);
      } else if (angle < 35) {
        if (this.exerciseRepStage === 'down') {
          this.studioCurrentReps++;
          this.exerciseRepStage = 'up';

          if (this.currentRepMaxAngle >= 80 && this.currentRepMaxAngle <= 102) {
            this.sessionValidReps++;
            this.studioFeedbackText = `✓ Rep ${this.studioCurrentReps} complete: Optimal height (${this.currentRepMaxAngle}°)`;
            this.studioFeedbackStatus = 'good';
            this.speakVoiceFeedback(`Rep ${this.studioCurrentReps} completed! Good control.`, 3500);
          } else {
            this.sessionIncompleteReps++;
            this.recordFormError(`Shoulder elevation out of target range (${this.currentRepMaxAngle}°)`);
            this.studioFeedbackText = `⚠ Rep ${this.studioCurrentReps}: Raise arms to 90° shoulder level next rep.`;
            this.studioFeedbackStatus = 'adjust';
            this.speakVoiceFeedback(`Rep ${this.studioCurrentReps} counted. Aim for shoulder height.`, 3500);
          }
          this.currentRepMaxAngle = 0;
          this.checkSetCompletion();
        } else {
          this.studioFeedbackText = 'Raise your arms laterally towards shoulder height';
          this.studioFeedbackStatus = 'neutral';
        }
      } else if (angle >= 45 && angle < 78) {
        this.studioFeedbackText = 'Raise your arms a little higher towards shoulder level';
        this.studioFeedbackStatus = 'adjust';
        this.speakVoiceFeedback('Raise your arms a little higher.', 3500);
      }
    } else if (exId === 'bicep_curl') {
      const isLeftArm = (lElbow?.visibility || 0) > (rElbow?.visibility || 0);
      const shoulder = isLeftArm ? lShoulder : rShoulder;
      const elbow = isLeftArm ? lElbow : rElbow;
      const wrist = isLeftArm ? lWrist : rWrist;

      if (!shoulder || !elbow || !wrist) return;
      const angle = this.calculateAngle(shoulder, elbow, wrist);
      this.studioCurrentAngle = angle;
      this.studioAngleTargetLabel = 'Elbow Flexion (Target: 50°)';

      this.currentRepMinAngle = Math.min(this.currentRepMinAngle, angle);
      this.sessionMinAngle = Math.min(this.sessionMinAngle, angle);
      this.sessionMaxAngle = Math.max(this.sessionMaxAngle, angle);

      if (angle <= 55) {
        this.exerciseRepStage = 'down';
        this.studioFeedbackText = `Great peak squeeze (${angle}°)! Now lower slowly with control`;
        this.studioFeedbackStatus = 'good';
        this.speakVoiceFeedback('Great curl! Lower slowly with control.', 3500);
      } else if (angle > 145) {
        if (this.exerciseRepStage === 'down') {
          this.studioCurrentReps++;
          this.exerciseRepStage = 'up';

          if (this.currentRepMinAngle <= 60) {
            this.sessionValidReps++;
            this.studioFeedbackText = `✓ Rep ${this.studioCurrentReps} complete: Full bicep flexion (${this.currentRepMinAngle}°)`;
            this.studioFeedbackStatus = 'good';
            this.speakVoiceFeedback(`Rep ${this.studioCurrentReps} completed!`, 3500);
          } else {
            this.sessionIncompleteReps++;
            this.recordFormError(`Incomplete bicep curl flexion (${this.currentRepMinAngle}°)`);
            this.studioFeedbackText = `⚠ Rep ${this.studioCurrentReps}: Incomplete curl (${this.currentRepMinAngle}°). Squeeze tighter at top.`;
            this.studioFeedbackStatus = 'adjust';
            this.speakVoiceFeedback(`Rep ${this.studioCurrentReps} counted. Squeeze tighter at top next rep.`, 3500);
          }
          this.currentRepMinAngle = 180;
          this.checkSetCompletion();
        } else {
          this.studioFeedbackText = 'Curl your forearm upwards towards your shoulder';
          this.studioFeedbackStatus = 'neutral';
        }
      } else if (angle > 65 && angle < 135) {
        this.studioFeedbackText = 'Curl a little further up to squeeze your bicep';
        this.studioFeedbackStatus = 'adjust';
        this.speakVoiceFeedback('Curl a little further up.', 3500);
      }
    } else {
      this.studioAngleTargetLabel = 'Joint Mobility Motion';
      this.studioFeedbackText = 'Maintain steady controlled pace and breathe evenly';
      this.studioFeedbackStatus = 'good';
    }
  }

  checkSetCompletion(): void {
    if (this.studioCurrentReps >= this.studioTargetReps) {
      if (this.studioCurrentSets < this.studioTargetSets) {
        this.startInterSetRest();
      } else {
        this.finishExerciseSession();
      }
    }
  }

  startInterSetRest(): void {
    if (this.restIntervalTimer) {
      clearInterval(this.restIntervalTimer);
      this.restIntervalTimer = null;
    }
    this.studioPhase = 'SET_REST';
    this.restCountdownSeconds = 30;
    this.studioFeedbackText = `Set ${this.studioCurrentSets} complete! Rest recovery active (30s).`;
    this.studioFeedbackStatus = 'neutral';
    this.speakVoiceFeedback(`Set ${this.studioCurrentSets} completed! Rest for 30 seconds before your next set.`, 0);

    this.restIntervalTimer = setInterval(() => {
      this.restCountdownSeconds--;
      if (this.restCountdownSeconds <= 0) {
        this.skipInterSetRest();
      }
      this.cdr.detectChanges();
    }, 1000);
    this.cdr.detectChanges();
  }

  skipInterSetRest(): void {
    if (this.restIntervalTimer) {
      clearInterval(this.restIntervalTimer);
      this.restIntervalTimer = null;
    }
    this.studioCurrentSets++;
    this.studioCurrentReps = 0;
    this.exerciseRepStage = 'up';
    this.currentRepMinAngle = 180;
    this.currentRepMaxAngle = 0;
    this.lastLandmarkMovementTime = Date.now();
    this.studioPhase = 'ACTIVE';
    this.studioFeedbackText = `Ready! Begin Set ${this.studioCurrentSets} of ${this.studioTargetSets}`;
    this.studioFeedbackStatus = 'neutral';
    this.speakVoiceFeedback(`Set ${this.studioCurrentSets} starting. Maintain steady form!`, 0);
    this.cdr.detectChanges();
  }

  finishExerciseSession(): void {
    if (this.restIntervalTimer) {
      clearInterval(this.restIntervalTimer);
      this.restIntervalTimer = null;
    }
    this.studioPhase = 'SUMMARY';
    this.isExerciseDone = true;
    this.saveExerciseDoneToStorage();

    const totalReps = this.sessionValidReps + this.sessionIncompleteReps;
    const finalAccuracy = totalReps > 0
      ? Math.round((this.sessionValidReps / totalReps) * 100)
      : 95;
    const durationSeconds = Math.max(30, Math.round((Date.now() - this.sessionStartTime) / 1000));
    const rangeOfMotion = (this.sessionMaxAngle > this.sessionMinAngle && this.sessionMinAngle < 900)
      ? (this.sessionMaxAngle - this.sessionMinAngle)
      : null;

    this.sessionSummaryData = {
      exerciseName: this.activeStudioExercise?.name || 'Rehab Exercise',
      category: this.activeStudioExercise?.category || 'Physical Rehabilitation',
      targetSets: this.studioTargetSets,
      completedSets: this.studioCurrentSets,
      targetReps: this.studioTargetReps,
      totalCompletedReps: totalReps,
      validReps: this.sessionValidReps,
      incompleteReps: this.sessionIncompleteReps,
      accuracyScore: finalAccuracy,
      durationSeconds,
      minJointAngle: this.sessionMinAngle < 900 ? this.sessionMinAngle : null,
      maxJointAngle: this.sessionMaxAngle > 0 ? this.sessionMaxAngle : null,
      rangeOfMotion,
      formErrors: [...this.sessionFormErrors],
      safetyEventsCount: this.sessionSafetyIncidents,
      compliancePercentage: Math.min(100, Math.round((this.studioCurrentSets / this.studioTargetSets) * 100))
    };

    this.persistExerciseLog(this.activeStudioExercise, this.sessionSummaryData);

    this.speakVoiceFeedback(`Outstanding session! You completed all sets with ${finalAccuracy}% movement quality. Review your session summary!`, 0);
    this.cdr.detectChanges();
  }

  saveExerciseDoneToStorage(): void {
    const todayStr = this.getTodayDateString();
    localStorage.setItem(`carepath_exercise_${todayStr}`, 'true');
  }

  persistExerciseLog(exercise: ExerciseItem | null, summary?: any): void {
    if (!exercise) return;
    const completedReps = summary ? summary.totalCompletedReps : ((this.studioTargetReps || 10) * (this.studioTargetSets || 3));
    const completedSets = summary ? summary.completedSets : (this.studioTargetSets || 3);
    const accuracyScore = summary ? summary.accuracyScore : 96;
    const durationSeconds = summary ? summary.durationSeconds : 180;

    const payload = {
      exerciseId: exercise.exerciseId || 'rehab_exercise',
      exerciseName: exercise.name,
      category: exercise.category || 'Physical Rehabilitation',
      completedReps,
      completedSets,
      targetReps: this.studioTargetReps || 10,
      targetSets: this.studioTargetSets || 3,
      accuracyScore,
      durationSeconds,
      appointmentId: exercise.appointmentId,
      doctorId: (exercise as any).doctorId,
      validReps: summary ? summary.validReps : completedReps,
      incompleteReps: summary ? summary.incompleteReps : 0,
      minJointAngle: summary ? summary.minJointAngle : null,
      maxJointAngle: summary ? summary.maxJointAngle : null,
      rangeOfMotion: summary ? summary.rangeOfMotion : null,
      formErrors: summary ? summary.formErrors : [],
      compliancePercentage: summary ? summary.compliancePercentage : 100,
      safetyEventsCount: summary ? summary.safetyEventsCount : 0
    };

    this.appointmentService.recordExerciseLog(payload).subscribe({
      next: (res) => {
        console.log('[EXERCISE LOG] Telemetry recorded to MongoDB Atlas:', res);
        this.showToast(`🏆 ${exercise.name} logged to your medical record!`, 'success');
        if (res && res.log) {
          this.exerciseLogsHistory = [res.log, ...this.exerciseLogsHistory];
        } else {
          this.exerciseLogsHistory = [{
            ...payload,
            date: this.getTodayDateString(),
            completedAt: new Date().toISOString()
          }, ...this.exerciseLogsHistory];
        }
        this.loadExerciseAnalytics();
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.warn('Could not save exercise log to DB:', err);
      }
    });
  }

  // 🧪 Feature 8: Exercise Validation / Test Mode Simulators
  runSimulatorRep(type: 'valid' | 'shallow'): void {
    if (!this.activeStudioExercise) return;
    if (this.studioPhase !== 'ACTIVE') {
      this.studioPhase = 'ACTIVE';
    }

    if (type === 'valid') {
      this.studioCurrentReps++;
      this.sessionValidReps++;
      const simulatedAngle = this.activeStudioExercise.exerciseId === 'squats' ? 88 
        : this.activeStudioExercise.exerciseId === 'knee_extension' ? 172 
        : this.activeStudioExercise.exerciseId === 'shoulder_abduction' ? 90 
        : 48;
      this.studioCurrentAngle = simulatedAngle;
      this.sessionMinAngle = Math.min(this.sessionMinAngle, simulatedAngle);
      this.sessionMaxAngle = Math.max(this.sessionMaxAngle, simulatedAngle);
      this.studioFeedbackText = `✓ Rep ${this.studioCurrentReps} complete: Optimal form achieved (${simulatedAngle}°)`;
      this.studioFeedbackStatus = 'good';
      this.speakVoiceFeedback(`Rep ${this.studioCurrentReps} complete! Great form.`, 1500);
    } else {
      this.studioCurrentReps++;
      this.sessionIncompleteReps++;
      const simulatedAngle = this.activeStudioExercise.exerciseId === 'squats' ? 118 
        : this.activeStudioExercise.exerciseId === 'knee_extension' ? 135 
        : this.activeStudioExercise.exerciseId === 'shoulder_abduction' ? 62 
        : 85;
      this.studioCurrentAngle = simulatedAngle;
      this.recordFormError(`Incomplete range of motion (${simulatedAngle}°)`);
      this.studioFeedbackText = `⚠ Rep ${this.studioCurrentReps}: Shallow range (${simulatedAngle}°). Increase joint depth.`;
      this.studioFeedbackStatus = 'adjust';
      this.speakVoiceFeedback(`Rep ${this.studioCurrentReps} counted, but shallow. Aim deeper!`, 1500);
    }

    this.checkSetCompletion();
    this.cdr.detectChanges();
  }

  runSimulatorRest(): void {
    this.startInterSetRest();
  }

  runSimulatorSafetyTest(): void {
    this.triggerSafetyVerification('Telemetry validation drill (Simulated Inactivity)');
  }

  drawPoseSkeleton(ctx: CanvasRenderingContext2D, landmarks: any[], width: number, height: number): void {
    const connections = [
      [11, 12],
      [11, 13], [13, 15],
      [12, 14], [14, 16],
      [11, 23], [12, 24],
      [23, 24],
      [23, 25], [25, 27],
      [24, 26], [26, 28]
    ];

    const lineColor = this.studioFeedbackStatus === 'good' 
      ? '#10B981' 
      : this.studioFeedbackStatus === 'adjust' 
      ? '#F59E0B' 
      : '#38BDF8';

    ctx.lineWidth = 4;
    ctx.strokeStyle = lineColor;
    ctx.lineCap = 'round';

    connections.forEach(([p1, p2]) => {
      const a = landmarks[p1];
      const b = landmarks[p2];
      if (a && b && (a.visibility || 1) > 0.4 && (b.visibility || 1) > 0.4) {
        ctx.beginPath();
        ctx.moveTo(a.x * width, a.y * height);
        ctx.lineTo(b.x * width, b.y * height);
        ctx.stroke();
      }
    });

    landmarks.forEach((pt: any, idx: number) => {
      if ((pt.visibility || 1) > 0.4 && idx <= 28) {
        ctx.beginPath();
        ctx.arc(pt.x * width, pt.y * height, 5, 0, 2 * Math.PI);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = lineColor;
        ctx.stroke();
      }
    });

    if (this.studioCurrentAngle > 0) {
      const activeJoint = (this.activeStudioExercise?.exerciseId === 'squats' || this.activeStudioExercise?.exerciseId === 'knee_extension')
        ? (landmarks[26] || landmarks[25])
        : (landmarks[14] || landmarks[13]);

      if (activeJoint) {
        const x = activeJoint.x * width;
        const y = Math.max(30, activeJoint.y * height - 20);

        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.beginPath();
        ctx.roundRect(x - 35, y - 22, 70, 26, 6);
        ctx.fill();

        ctx.fillStyle = lineColor;
        ctx.font = 'bold 14px Outfit, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${this.studioCurrentAngle}°`, x, y - 4);
      }
    }
  }

  calculateAngle(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }): number {
    const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let angle = Math.abs((radians * 180.0) / Math.PI);
    if (angle > 180.0) {
      angle = 360.0 - angle;
    }
    return Math.round(angle);
  }

  speakVoiceFeedback(text: string, throttleMs: number = 3000): void {
    const isEmergencyAlert = text.toLowerCase().includes('safety') || 
                             text.toLowerCase().includes('emergency') || 
                             text.toLowerCase().includes('seconds remaining') ||
                             text.toLowerCase().includes('glad you are ok');

    // While emergency countdown or dispatch is active, strictly suppress any exercise form cues!
    if ((this.isSafetyVerificationActive || this.isEmergencyDispatched) && !isEmergencyAlert) {
      return;
    }

    const now = Date.now();
    if (throttleMs > 0 && now - this.lastSpokenTime < throttleMs) return;
    this.lastSpokenTime = now;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  }

  playWarningBeep(): void {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } catch (e) {
      console.warn('AudioContext not allowed or failed:', e);
    }
  }

  playSirenTone(): void {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(1000, ctx.currentTime + 0.3);
      osc.frequency.linearRampToValueAtTime(600, ctx.currentTime + 0.6);
      osc.frequency.linearRampToValueAtTime(1000, ctx.currentTime + 0.9);
      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 1.2);
    } catch (e) {
      console.warn('AudioContext siren failed:', e);
    }
  }

  triggerSafetyVerification(reason: string): void {
    if (this.isSafetyVerificationActive || this.isEmergencyDispatched) return;
    this.sessionSafetyIncidents++;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    this.isSafetyVerificationActive = true;
    this.safetyCountdownSeconds = 15;
    this.studioFeedbackText = '⚠️ Safety Alert: Please confirm you are safe or tap I Am OK';
    this.studioFeedbackStatus = 'adjust';
    this.speakVoiceFeedback('Safety Alert. Are you OK? Please tap I am OK or move to continue.', 0);
    this.playWarningBeep();

    if (this.safetyCountdownInterval) clearInterval(this.safetyCountdownInterval);
    this.safetyCountdownInterval = setInterval(() => {
      this.safetyCountdownSeconds--;
      if (this.safetyCountdownSeconds <= 0) {
        clearInterval(this.safetyCountdownInterval);
        this.safetyCountdownInterval = null;
        this.dispatchExerciseEmergency(reason);
      } else if (this.safetyCountdownSeconds === 5) {
        this.playWarningBeep();
        this.speakVoiceFeedback('5 seconds remaining before emergency contact dispatch.', 0);
      }
      this.cdr.detectChanges();
    }, 1000);
  }

  dismissSafetyVerification(): void {
    if (this.safetyCountdownInterval) {
      clearInterval(this.safetyCountdownInterval);
      this.safetyCountdownInterval = null;
    }
    this.isSafetyVerificationActive = false;
    this.lastLandmarkMovementTime = Date.now();
    this.prevNoseY = null;
    this.speakVoiceFeedback('Glad you are OK! Resuming your exercise session.', 0);
    this.cdr.detectChanges();
  }

  dispatchExerciseEmergency(reason: string): void {
    this.isSafetyVerificationActive = false;
    this.isEmergencyDispatched = true;
    this.playSirenTone();
    this.speakVoiceFeedback('Emergency detected. Contacting your emergency contacts and care team now.', 0);

    let locationStr = 'Location coordinates not provided';
    let latitude: number | undefined;
    let longitude: number | undefined;
    let accuracy: number | undefined;

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          latitude = pos.coords.latitude;
          longitude = pos.coords.longitude;
          accuracy = pos.coords.accuracy;
          locationStr = `Lat: ${latitude.toFixed(5)}, Lng: ${longitude.toFixed(5)} (Accuracy: ~${Math.round(accuracy)}m)`;
          this.sendEmergencyPayload(reason, locationStr, latitude, longitude, accuracy);
        },
        () => {
          this.sendEmergencyPayload(reason, locationStr);
        },
        { timeout: 4000 }
      );
    } else {
      this.sendEmergencyPayload(reason, locationStr);
    }
    this.cdr.detectChanges();
  }

  private sendEmergencyPayload(reason: string, locationStr: string, lat?: number, lng?: number, acc?: number): void {
    const payload = {
      exerciseName: this.activeStudioExercise?.name || 'Rehabilitation Routine',
      reason: reason || 'Sudden fall or prolonged unresponsiveness detected during exercise',
      location: locationStr,
      latitude: lat,
      longitude: lng,
      accuracy: acc,
      appointmentId: this.activeStudioExercise?.appointmentId,
      doctorId: (this.activeStudioExercise as any)?.doctorId,
      clientTimestamp: new Date().toISOString()
    };

    this.appointmentService.triggerExerciseEmergency(payload).subscribe({
      next: (res) => {
        this.emergencyDispatchDetails = res;
        const docMsg = res.notifiedDoctor ? ` and ${res.doctorName}` : '';
        this.showToast(`🚨 Emergency alert dispatched to your contact${docMsg}!`, 'error');
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Failed to dispatch emergency API:', err);
      }
    });
  }

  ngOnDestroy(): void {
    this.closeExerciseStudio();
  }
}

