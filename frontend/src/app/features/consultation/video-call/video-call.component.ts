import { Component, OnInit, OnDestroy, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { WebRtcService, ChatMessage, PeerUser } from '../../../core/services/webrtc.service';
import { AppointmentService, ExerciseItem } from '../../../core/services/appointment.service';
import { AuthService } from '../../../core/services/auth.service';
import { MedicineService, MedicineItem } from '../../../core/services/medicine.service';
import { ReportService, MedicalReport } from '../../../core/services/report.service';
import { getMediaUrl } from '../../../core/config/api.config';

@Component({
  selector: 'app-video-call',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './video-call.component.html',
  styleUrls: ['./video-call.component.css']
})
export class VideoCallComponent implements OnInit, OnDestroy {
  @ViewChild('localVideo') localVideoRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('remoteVideo') remoteVideoRef!: ElementRef<HTMLVideoElement>;

  appointmentId: string = '';
  appointmentDetails: any = null;
  currentUser: any = null;
  userRole: 'doctor' | 'patient' | 'admin' = 'patient';

  // Call states
  isPreCall: boolean = true;
  isInCall: boolean = false;
  isCallEnded: boolean = false;
  loading: boolean = true;
  errorMessage: string = '';

  // Controls state
  isAudioMuted: boolean = false;
  isVideoOff: boolean = false;
  isScreenSharing: boolean = false;
  activeSidebarTab: 'chat' | 'rx' | 'notes' | 'info' | 'prior' | 'reports' | 'exercise' | null = 'chat';

  // 📑 Medical Reports State
  attachedReports: MedicalReport[] = [];
  loadingReports: boolean = false;

  // ⏱️ Dynamic Queue & Scheduling States
  nextAppointment: any = null;
  doctorLiveStatus: any = null;
  isCallOvertime: boolean = false;
  overtimeAlertShown: boolean = false;

  // 📧 Early Invitation Email State
  sendingEarlyInvite: boolean = false;
  earlyInviteSent: boolean = false;
  earlyInviteMsg: string = '';

  // ⏳ In-Call Delay Notification State
  sendingDelayNotice: boolean = false;
  delayNoticeSent: boolean = false;

  // Streams & Remote Peer
  localStream: MediaStream | null = null;
  remoteStream: MediaStream | null = null;
  peerUsers: PeerUser[] = [];
  peerMediaStatus = { audioEnabled: true, videoEnabled: true };

  // Follow-Up & Prior Consultation Helpers
  get isFollowUp(): boolean {
    return this.appointmentDetails?.type === 'Follow-up' || !!this.appointmentDetails?.parentAppointmentId;
  }

  get priorConsultation(): any {
    return this.appointmentDetails?.parentAppointmentId || null;
  }

  get patientCondition(): string {
    return this.appointmentDetails?.patientConditionStatus || '';
  }

  importPriorPrescription(): void {
    const priorMeds = this.priorConsultation?.prescription;
    if (!priorMeds || !Array.isArray(priorMeds) || priorMeds.length === 0) {
      this.prescriptionSuccessMsg = 'No prior medications found in previous visit record.';
      this.activeSidebarTab = 'rx';
      setTimeout(() => this.prescriptionSuccessMsg = '', 3500);
      return;
    }

    let addedCount = 0;
    priorMeds.forEach((m: any) => {
      const medName = m.medicineName || m.name || '';
      if (!medName) return;
      const exists = this.prescriptionList.some(p => p.medicineName.toLowerCase() === medName.toLowerCase());
      if (!exists) {
        this.prescriptionList.push({
          medicineName: medName,
          composition: Array.isArray(m.composition) ? m.composition : (m.composition ? [m.composition] : []),
          dosage: m.dosage || '1 tablet after food',
          duration: m.duration || '5 days',
          instructions: m.instructions || 'Twice daily after meals'
        });
        addedCount++;
      }
    });

    if (addedCount > 0) {
      if (this.userRole === 'doctor' && this.appointmentId) {
        this.webRtcService.syncLivePrescription(this.appointmentId, this.prescriptionList);
      }
      this.prescriptionSuccessMsg = `📋 Imported ${addedCount} medication(s) from prior visit!`;
      this.activeSidebarTab = 'rx';
    } else {
      this.prescriptionSuccessMsg = 'All medications from prior visit are already in your prescription.';
      this.activeSidebarTab = 'rx';
    }
    setTimeout(() => this.prescriptionSuccessMsg = '', 4000);
  }

  // Chat
  chatMessages: ChatMessage[] = [];
  newMessageText: string = '';

  // Medicine Dataset Search & E-Prescription
  searchQuery: string = '';
  searchResults: MedicineItem[] = [];
  isSearchingMedicines: boolean = false;
  prescriptionList: Array<{
    medicineName: string;
    composition: string[];
    dosage: string;
    duration: string;
    instructions: string;
  }> = [];
  isSavingPrescription: boolean = false;
  prescriptionSuccessMsg: string = '';

  // Doctor Clinical Remarks & Dietary Advice
  clinicalNotes: {
    doctorRemarks: string;
    nutritionalTags: string[];
    recommendedFoods: string;
    foodsToAvoid: string;
    hydrationGoalLiters: number;
  } = {
    doctorRemarks: '',
    nutritionalTags: [],
    recommendedFoods: '',
    foodsToAvoid: '',
    hydrationGoalLiters: 3
  };
  isSavingNotes: boolean = false;
  notesSuccessMsg: string = '';

  // 🥗 Dynamic Dual-Dropdown Nutrition State
  selectedNutrientLevel: 'High' | 'Moderate' | 'Low' = 'High';
  selectedNutrientCategory: string = 'Protein';

  availableLevels: Array<{ value: 'High' | 'Moderate' | 'Low'; label: string; icon: string }> = [
    { value: 'High', label: '⚡ High / Boost', icon: 'bi-arrow-up-circle-fill text-success' },
    { value: 'Moderate', label: '⚖️ Moderate / Balanced', icon: 'bi-dash-circle-fill text-info' },
    { value: 'Low', label: '🚫 Low / Restrict', icon: 'bi-arrow-down-circle-fill text-warning' }
  ];

  availableCategories: Array<{ value: string; label: string; group: string }> = [
    { value: 'Protein', label: '💪 Protein (Muscle & Post-Op)', group: 'Macronutrients' },
    { value: 'Fiber', label: '🌾 Dietary Fiber (Gut & Lipids)', group: 'Macronutrients' },
    { value: 'Carbs', label: '🩺 Carbs / Low-GI (Diabetic)', group: 'Macronutrients' },
    { value: 'Fats', label: '🥑 Healthy Omega-3 Fats (Cardio)', group: 'Macronutrients' },
    { value: 'Iron', label: '🩸 Iron (Hemoglobin & Anemia)', group: 'Micronutrients' },
    { value: 'Sodium', label: '🧂 Sodium / Salt (Hypertension)', group: 'Micronutrients' },
    { value: 'Calcium', label: '🥛 Calcium & Vitamin D (Bone)', group: 'Micronutrients' },
    { value: 'Potassium', label: '🫀 Potassium (Renal & BP)', group: 'Micronutrients' },
    { value: 'VitC', label: '🍊 Vitamin C (Immunity & Healing)', group: 'Micronutrients' },
    { value: 'VitB12', label: '🧠 Vitamin B12 & Folate (Nerves)', group: 'Micronutrients' },
    { value: 'UricAcid', label: '🦵 Uric Acid / Purines (Gout)', group: 'Clinical Therapeutic' },
    { value: 'AntiInflammatory', label: '🌿 Anti-Inflammatory (Recovery)', group: 'Clinical Therapeutic' }
  ];

  // Emergency Sync & Pause State
  activeEmergencyAlert: { appointmentId: string; patientName: string; symptomSummary: string } | null = null;
  isCallPaused: boolean = false;
  pauseReason: string = '';
  isEmergencyTriageMode: boolean = false;

  // 📡 Live In-Call Rx & Dietary Sync State (Patient Real-Time View)
  livePrescriptionList: Array<{
    medicineName: string;
    composition?: string[];
    dosage: string;
    duration: string;
    instructions: string;
  }> = [];
  liveDoctorName: string = '';
  livePrescriptionUpdatedTime: Date | null = null;
  liveClinicalNotes: {
    doctorRemarks?: string;
    nutritionalTags?: string[];
    recommendedFoods?: string;
    foodsToAvoid?: string;
    hydrationGoalLiters?: number;
  } | null = null;
  liveNotesUpdatedTime: Date | null = null;
  unreadRxCount: number = 0;
  unreadNotesCount: number = 0;

  // 🏋️ Clinical Physical Rehabilitation & AI Guided Exercises State
  exerciseCatalog: ExerciseItem[] = [
    {
      exerciseId: 'squats',
      name: 'Chair Squats (Knee & Hip Rehab)',
      category: 'Lower Body & Joint Mobility',
      targetReps: 10,
      targetSets: 3,
      frequencyPerWeek: 4,
      precautions: 'Keep spine neutral, hinge at hips, keep knees tracking above ankles without collapsing inward.',
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
    },
    {
      exerciseId: 'wall_pushup',
      name: 'Wall Push-Ups (Chest & Scapular)',
      category: 'Post-Surgical Upper Body Conditioning',
      targetReps: 10,
      targetSets: 2,
      frequencyPerWeek: 4,
      precautions: 'Maintain straight body plank line. Lower chest towards wall smoothly without sagging hips.',
      videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-woman-doing-squats-in-a-gym-42795-large.mp4',
      targetAngleMin: 75,
      targetAngleMax: 90
    },
    {
      exerciseId: 'calf_raises',
      name: 'Supported Calf Raises (Ankle Stability)',
      category: 'Ankle & Achilles Rehabilitation',
      targetReps: 15,
      targetSets: 3,
      frequencyPerWeek: 5,
      precautions: 'Hold onto chair for balance. Elevate smoothly onto balls of feet, hold 1s, lower slowly.',
      videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-young-man-exercising-in-the-gym-42823-large.mp4',
      targetAngleMin: 70,
      targetAngleMax: 110
    }
  ];
  selectedCatalogExerciseId: string = 'squats';
  prescribedExercises: ExerciseItem[] = [];
  liveExercisesList: ExerciseItem[] = [];
  unreadExerciseCount: number = 0;
  isSavingExercises: boolean = false;
  exerciseSuccessMsg: string = '';

  // Timer
  callTimer: string = '00:00';
  private timerInterval: any = null;
  private secondsElapsed: number = 0;

  // Subscriptions
  private subs: Subscription[] = [];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private webRtcService: WebRtcService,
    private appointmentService: AppointmentService,
    private medicineService: MedicineService,
    private reportService: ReportService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.currentUser = this.authService.currentUser();
    if (this.currentUser && this.currentUser.role) {
      this.userRole = (this.currentUser.role.toLowerCase() as any) || 'patient';
    }

    this.appointmentId = this.route.snapshot.paramMap.get('appointmentId') || '';
    if (!this.appointmentId) {
      this.errorMessage = 'Invalid Consultation Room ID.';
      this.loading = false;
      return;
    }

    this.loadConsultationDetails();
  }

  ngOnDestroy(): void {
    this.stopTimer();
    this.subs.forEach(s => s.unsubscribe());
    this.webRtcService.cleanup();
  }

  loadConsultationDetails(): void {
    this.loading = true;
    this.appointmentService.getConsultationDetails(this.appointmentId).subscribe({
      next: (res) => {
        if (res.success) {
          this.appointmentDetails = res.appointment;
          
          // Verify user role explicitly from logged-in user or appointment doctor assignment
          const user = this.authService.currentUser();
          const currentUserId = user?._id || (user as any)?.id;
          const userRoleStr = user?.role ? user.role.toLowerCase() : '';

          const docObj = this.appointmentDetails?.doctorId;
          const docUserId = docObj?.userId?._id || docObj?.userId || docObj?._id;
          const docProfileId = docObj?._id;

          if (
            userRoleStr === 'doctor' ||
            (currentUserId && (currentUserId.toString() === docUserId?.toString() || currentUserId.toString() === docProfileId?.toString()))
          ) {
            this.userRole = 'doctor';
          } else if (userRoleStr === 'admin') {
            this.userRole = 'admin';
          } else {
            this.userRole = 'patient';
          }

          if (res.iceServers) {
            this.webRtcService.setIceServers(res.iceServers);
          }

          if (res.nextAppointment) {
            this.nextAppointment = res.nextAppointment;
          }
          if (res.doctorLiveStatus) {
            this.doctorLiveStatus = res.doctorLiveStatus;
          }

          if (this.appointmentDetails?.exercisePrescription && Array.isArray(this.appointmentDetails.exercisePrescription)) {
            this.prescribedExercises = [...this.appointmentDetails.exercisePrescription];
            this.liveExercisesList = [...this.appointmentDetails.exercisePrescription];
          }

          this.initializeMedia();
          this.loadAttachedReports();
        } else {
          this.errorMessage = 'Failed to load consultation details.';
        }
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error loading consultation details:', err);
        this.errorMessage = err.error?.message || 'Failed to connect to consultation room.';
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  loadAttachedReports(): void {
    if (!this.appointmentId) return;
    this.loadingReports = true;
    this.reportService.getAppointmentReports(this.appointmentId).subscribe({
      next: (res) => {
        this.loadingReports = false;
        if (res && res.success) {
          this.attachedReports = res.reports || [];
        }
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loadingReports = false;
        console.warn('Could not load appointment reports:', err);
        this.cdr.detectChanges();
      }
    });
  }

  async initializeMedia(): Promise<void> {
    try {
      this.localStream = await this.webRtcService.startLocalStream(true, true);
      if (this.localVideoRef && this.localVideoRef.nativeElement) {
        this.localVideoRef.nativeElement.srcObject = this.localStream;
      }
      this.setupSubscriptions();
    } catch (err: any) {
      console.error('Device access denied or failed:', err);
      this.errorMessage = 'Camera & Microphone access is required for video consultations. Please allow access in browser permissions.';
    }
  }

  setupSubscriptions(): void {
    // Local Stream Sub
    this.subs.push(
      this.webRtcService.localStream$.subscribe(stream => {
        this.localStream = stream;
        if (this.localVideoRef && this.localVideoRef.nativeElement && stream) {
          this.localVideoRef.nativeElement.srcObject = stream;
        }
      })
    );

    // Remote Stream Sub (Auto-unpause when remote stream returns)
    this.subs.push(
      this.webRtcService.remoteStream$.subscribe(stream => {
        this.remoteStream = stream;
        if (stream && this.isCallPaused && this.userRole === 'patient') {
          this.isCallPaused = false;
          this.pauseReason = '';
        }
        this.cdr.detectChanges();
        if (this.remoteVideoRef && this.remoteVideoRef.nativeElement) {
          this.remoteVideoRef.nativeElement.srcObject = stream;
        }
      })
    );

    // Peer Users Sub (Auto-unpause when doctor peer joins)
    this.subs.push(
      this.webRtcService.peerUsers$.subscribe(users => {
        this.peerUsers = users;
        if (this.userRole === 'patient' && this.isCallPaused) {
          const hasDoctor = users.some(u => u.userRole === 'doctor');
          if (hasDoctor) {
            this.isCallPaused = false;
            this.pauseReason = '';
          }
        }
      })
    );

    // Peer Media Status Sub
    this.subs.push(
      this.webRtcService.peerMediaStatus$.subscribe(status => {
        this.peerMediaStatus = status;
      })
    );

    // Screen Share Status
    this.subs.push(
      this.webRtcService.isScreenSharing$.subscribe(sharing => {
        this.isScreenSharing = sharing;
      })
    );

    // Chat Messages
    this.subs.push(
      this.webRtcService.chatMessages$.subscribe(messages => {
        this.chatMessages = messages;
        this.cdr.detectChanges();
      })
    );

    // Call Ended
    this.subs.push(
      this.webRtcService.callEnded$.subscribe(data => {
        this.isCallEnded = true;
        this.isInCall = false;
        this.stopTimer();
        this.cdr.detectChanges();
      })
    );

    // Emergency Alert Sub (Doctor Mode)
    this.subs.push(
      this.webRtcService.emergencyAlert$.subscribe(alertData => {
        if (this.userRole === 'doctor' && alertData) {
          this.activeEmergencyAlert = alertData;
          this.cdr.detectChanges();
        }
      })
    );

    // Consultation Paused Sub (Patient Mode)
    this.subs.push(
      this.webRtcService.consultationPaused$.subscribe(data => {
        this.isCallPaused = true;
        this.pauseReason = data.reason || 'Doctor is currently attending a brief emergency case.';
        this.cdr.detectChanges();
      })
    );

    // Consultation Resumed Sub (Patient Mode)
    this.subs.push(
      this.webRtcService.consultationResumed$.subscribe(() => {
        this.isCallPaused = false;
        this.pauseReason = '';
        this.cdr.detectChanges();
      })
    );

    // 📡 Live In-Call E-Prescription Sub (Patient View)
    this.subs.push(
      this.webRtcService.livePrescription$.subscribe(data => {
        if (this.userRole === 'patient') {
          this.livePrescriptionList = data.prescriptionList || [];
          this.liveDoctorName = data.doctorName || 'Doctor';
          this.livePrescriptionUpdatedTime = data.timestamp ? new Date(data.timestamp) : new Date();

          if (this.activeSidebarTab !== 'rx' && this.livePrescriptionList.length > 0) {
            this.unreadRxCount = this.livePrescriptionList.length;
          }
          this.cdr.detectChanges();
        }
      })
    );

    // 📡 Live In-Call Clinical Remarks & Dietary Advice Sub (Patient View)
    this.subs.push(
      this.webRtcService.liveClinicalNotes$.subscribe(data => {
        if (this.userRole === 'patient' && data) {
          this.liveClinicalNotes = data.clinicalNotes;
          this.liveNotesUpdatedTime = data.timestamp ? new Date(data.timestamp) : new Date();

          if (this.activeSidebarTab !== 'notes' && this.liveClinicalNotes) {
            this.unreadNotesCount = 1;
          }
          this.cdr.detectChanges();
        }
      })
    );

    // 📡 Live In-Call Physical Rehabilitation & Exercises Sub (Patient View)
    this.subs.push(
      this.webRtcService.liveExercises$.subscribe(data => {
        if (this.userRole === 'patient') {
          this.liveExercisesList = data.exercises || [];
          if (this.activeSidebarTab !== 'exercise' && this.liveExercisesList.length > 0) {
            this.unreadExerciseCount = this.liveExercisesList.length;
          }
          this.cdr.detectChanges();
        }
      })
    );
  }

  // Doctor Action: Accept Emergency Triage & Pause Current Call
  acceptEmergencyTriage(): void {
    if (!this.activeEmergencyAlert) return;
    const targetEmergencyId = this.activeEmergencyAlert.appointmentId;
    this.activeEmergencyAlert = null;
    
    // Pause current active consultation for patient
    this.webRtcService.pauseConsultation(this.appointmentId, 'Doctor is attending a 5-minute urgent emergency triage.');
    this.isEmergencyTriageMode = true;
    
    // Open target emergency room in new tab or navigate
    window.open(`/consultation/${targetEmergencyId}`, '_blank');
  }

  dismissEmergencyAlert(): void {
    this.activeEmergencyAlert = null;
  }

  pauseCurrentConsultation(): void {
    this.isCallPaused = true;
    this.webRtcService.pauseConsultation(this.appointmentId, 'Doctor has paused the consultation temporarily.');
    this.cdr.detectChanges();
  }

  resumeCurrentConsultation(): void {
    this.isCallPaused = false;
    this.isEmergencyTriageMode = false;
    this.pauseReason = '';
    this.webRtcService.resumeConsultation(this.appointmentId);
    this.cdr.detectChanges();
  }

  resumeCallManually(): void {
    this.isCallPaused = false;
    this.isEmergencyTriageMode = false;
    this.pauseReason = '';
    if (this.userRole === 'doctor') {
      this.webRtcService.resumeConsultation(this.appointmentId);
    }
    this.cdr.detectChanges();
  }

  joinCall(): void {
    this.isPreCall = false;
    this.isInCall = true;
    this.startTimer();

    const userId = this.currentUser?._id || this.currentUser?.id || 'guest';
    const userName = this.currentUser?.name || (this.userRole === 'doctor' ? 'Dr. Consultant' : 'Patient');

    this.webRtcService.connect();
    this.webRtcService.joinRoom(this.appointmentId, userId, this.userRole, userName);

    // If Doctor joins/re-joins this call room, auto-emit resume signal to unpause patient!
    if (this.userRole === 'doctor') {
      this.webRtcService.resumeConsultation(this.appointmentId);
    }

    // Attach local video after view render
    setTimeout(() => {
      if (this.localVideoRef && this.localVideoRef.nativeElement && this.localStream) {
        this.localVideoRef.nativeElement.srcObject = this.localStream;
      }
    }, 100);
  }

  toggleMic(): void {
    const enabled = this.webRtcService.toggleAudio();
    this.isAudioMuted = !enabled;
  }

  toggleCamera(): void {
    const enabled = this.webRtcService.toggleVideo();
    this.isVideoOff = !enabled;
  }

  async toggleScreenShare(): Promise<void> {
    const sharing = await this.webRtcService.toggleScreenShare();
    this.isScreenSharing = sharing;
  }

  toggleSidebar(tab: 'chat' | 'rx' | 'notes' | 'info' | 'prior' | 'reports' | 'exercise'): void {
    if (this.activeSidebarTab === tab) {
      this.activeSidebarTab = null;
    } else {
      this.activeSidebarTab = tab;
      if (tab === 'rx') this.unreadRxCount = 0;
      if (tab === 'notes') this.unreadNotesCount = 0;
      if (tab === 'exercise') this.unreadExerciseCount = 0;
    }
  }

  // 📡 Live Synchronization Broadcasting Helpers (Doctor -> Patient)
  broadcastLivePrescription(): void {
    if (this.userRole === 'doctor' && this.appointmentId) {
      this.webRtcService.syncLivePrescription(this.appointmentId, this.prescriptionList);
    }
  }

  broadcastLiveClinicalNotes(): void {
    if (this.userRole === 'doctor' && this.appointmentId) {
      this.webRtcService.syncLiveClinicalNotes(this.appointmentId, this.clinicalNotes);
    }
  }

  broadcastLiveExercises(): void {
    if (this.userRole === 'doctor' && this.appointmentId) {
      this.webRtcService.syncLiveExercises(this.appointmentId, this.prescribedExercises);
    }
  }

  addSelectedExercise(): void {
    const item = this.exerciseCatalog.find(e => e.exerciseId === this.selectedCatalogExerciseId);
    if (!item) return;
    const exists = this.prescribedExercises.some(e => e.exerciseId === item.exerciseId);
    if (!exists) {
      this.prescribedExercises.push({ ...item });
      this.broadcastLiveExercises();
    }
  }

  removeExerciseFromPrescription(index: number): void {
    this.prescribedExercises.splice(index, 1);
    this.broadcastLiveExercises();
  }

  onExerciseItemChange(): void {
    this.broadcastLiveExercises();
  }

  saveExercisePrescription(onComplete?: () => void): void {
    if (!this.appointmentId) {
      if (onComplete) onComplete();
      return;
    }
    this.isSavingExercises = true;
    this.exerciseSuccessMsg = '';

    this.appointmentService.saveExercisePrescription(this.appointmentId, this.prescribedExercises).subscribe({
      next: (res) => {
        this.isSavingExercises = false;
        if (res.success) {
          this.exerciseSuccessMsg = '✅ Physical rehabilitation exercises saved & synced!';
          this.broadcastLiveExercises();
          setTimeout(() => {
            this.exerciseSuccessMsg = '';
            this.cdr.detectChanges();
          }, 4000);
        }
        this.cdr.detectChanges();
        if (onComplete) onComplete();
      },
      error: (err) => {
        this.isSavingExercises = false;
        console.error('Failed to save exercise prescription:', err);
        this.cdr.detectChanges();
        if (onComplete) onComplete();
      }
    });
  }

  onPrescriptionItemChange(): void {
    this.broadcastLivePrescription();
  }

  onClinicalNotesChange(): void {
    this.broadcastLiveClinicalNotes();
  }

  // 💊 Medicine Search & E-Prescription Logic
  onSearchMedicine(): void {
    if (!this.searchQuery || this.searchQuery.trim().length < 2) {
      this.searchResults = [];
      return;
    }
    this.isSearchingMedicines = true;
    this.medicineService.searchMedicines(this.searchQuery).subscribe({
      next: (res) => {
        this.searchResults = res.medicines || [];
        this.isSearchingMedicines = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error searching medicines dataset:', err);
        this.isSearchingMedicines = false;
      }
    });
  }

  addMedicineToPrescription(med: MedicineItem): void {
    const existing = this.prescriptionList.find(p => p.medicineName.toLowerCase() === med.medicineName.toLowerCase());
    if (!existing) {
      this.prescriptionList.push({
        medicineName: med.medicineName,
        composition: med.composition || [],
        dosage: '1-0-1',
        duration: '5 Days',
        instructions: 'Take after food with water'
      });
      this.broadcastLivePrescription();
    }
    this.searchQuery = '';
    this.searchResults = [];
  }

  removeMedicineFromPrescription(index: number): void {
    this.prescriptionList.splice(index, 1);
    this.broadcastLivePrescription();
  }

  issuePrescription(onComplete?: () => void): void {
    if (this.prescriptionList.length === 0) {
      if (onComplete) onComplete();
      return;
    }
    this.isSavingPrescription = true;
    this.prescriptionSuccessMsg = '';

    this.appointmentService.addPrescription(this.appointmentId, this.prescriptionList).subscribe({
      next: (res) => {
        this.isSavingPrescription = false;
        if (res.success) {
          console.log('[E-PRESCRIPTION] Successfully saved & emailed prescription to patient.');
          if (this.appointmentDetails) {
            this.appointmentDetails.prescription = res.prescription;
          }
        }
        this.cdr.detectChanges();
        if (onComplete) onComplete();
      },
      error: (err) => {
        console.error('Error issuing prescription on call end:', err);
        this.isSavingPrescription = false;
        if (onComplete) onComplete();
      }
    });
  }

  sendChatMessage(): void {
    if (!this.newMessageText.trim()) return;
    const senderName = this.currentUser?.name || (this.userRole === 'doctor' ? 'Doctor' : 'Patient');
    this.webRtcService.sendChatMessage(this.newMessageText, senderName, this.userRole);
    this.newMessageText = '';
  }

  endCall(): void {
    if (confirm('Are you sure you want to end this video consultation?')) {
      const finalizeCall = () => {
        this.webRtcService.endCall(this.appointmentId);
        this.isCallEnded = true;
        this.isInCall = false;
        this.stopTimer();
      };

      if (this.userRole === 'doctor') {
        const hasExercises = this.prescribedExercises && this.prescribedExercises.length > 0;
        const hasMedicines = this.prescriptionList && this.prescriptionList.length > 0;

        if (hasExercises && hasMedicines) {
          // Auto-save both exercises and medicines
          this.saveExercisePrescription(() => {
            this.issuePrescription(() => {
              finalizeCall();
            });
          });
        } else if (hasExercises) {
          // Auto-save exercises
          this.saveExercisePrescription(() => {
            finalizeCall();
          });
        } else if (hasMedicines) {
          // Auto-save medicines
          this.issuePrescription(() => {
            finalizeCall();
          });
        } else {
          finalizeCall();
        }
      } else {
        finalizeCall();
      }
    }
  }

  leaveRoom(): void {
    if (this.userRole === 'doctor') {
      this.router.navigate(['/doctor/dashboard']);
    } else {
      this.router.navigate(['/patient/dashboard']);
    }
  }

  // 10-Min Emergency Cap Warning
  showEmergency8MinWarning: boolean = false;

  private startTimer(): void {
    this.secondsElapsed = 0;
    this.timerInterval = setInterval(() => {
      this.secondsElapsed++;
      const mins = Math.floor(this.secondsElapsed / 60);
      const secs = this.secondsElapsed % 60;
      this.callTimer = `${mins < 10 ? '0' + mins : mins}:${secs < 10 ? '0' + secs : secs}`;

      if ((this.isEmergencyTriageMode || this.appointmentDetails?.isEmergency) && this.secondsElapsed >= 480) {
        this.showEmergency8MinWarning = true;
      }

      // Check Overtime ONLY IF doctor has a next booked appointment today!
      if (this.userRole === 'doctor' && this.nextAppointment && this.secondsElapsed >= 25 * 60) {
        this.isCallOvertime = true;
        this.overtimeAlertShown = true;
      }

      this.cdr.detectChanges();
    }, 1000);
  }

  sendEarlyInviteEmail(): void {
    if (!this.appointmentId || this.sendingEarlyInvite) return;
    this.sendingEarlyInvite = true;
    this.earlyInviteMsg = '';
    this.appointmentService.inviteNextPatientEarly(this.appointmentId).subscribe({
      next: (res) => {
        this.sendingEarlyInvite = false;
        this.earlyInviteSent = true;
        this.earlyInviteMsg = res.message || 'Invitation email sent successfully!';
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.sendingEarlyInvite = false;
        this.earlyInviteMsg = err.error?.message || 'Failed to send early invitation email.';
        this.cdr.detectChanges();
      }
    });
  }

  broadcastDelay(mins: number = 5): void {
    if (!this.appointmentId || this.sendingDelayNotice) return;
    this.sendingDelayNotice = true;
    this.appointmentService.notifyPatientDelay(this.appointmentId, mins).subscribe({
      next: () => {
        this.sendingDelayNotice = false;
        this.delayNoticeSent = true;
        setTimeout(() => this.delayNoticeSent = false, 5000);
        this.cdr.detectChanges();
      },
      error: () => {
        this.sendingDelayNotice = false;
        this.cdr.detectChanges();
      }
    });
  }

  private stopTimer(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  // ─── Doctor Clinical Remarks & Dietary Advice Helpers ───────────────────────
  loadClinicalNotes(): void {
    if (!this.appointmentId) return;
    this.appointmentService.getClinicalNotes(this.appointmentId).subscribe({
      next: (res) => {
        if (res.success && res.clinicalNotes) {
          this.clinicalNotes = {
            doctorRemarks: res.clinicalNotes.doctorRemarks || '',
            nutritionalTags: res.clinicalNotes.nutritionalTags || [],
            recommendedFoods: res.clinicalNotes.recommendedFoods || '',
            foodsToAvoid: res.clinicalNotes.foodsToAvoid || '',
            hydrationGoalLiters: res.clinicalNotes.hydrationGoalLiters || 3
          };
          this.cdr.detectChanges();
        }
      },
      error: (err) => console.error('Failed to load clinical notes:', err)
    });
  }

  removeNutritionalTag(tag: string): void {
    const idx = this.clinicalNotes.nutritionalTags.indexOf(tag);
    if (idx > -1) {
      this.clinicalNotes.nutritionalTags.splice(idx, 1);
      this.broadcastLiveClinicalNotes();
    }
  }

  clearDietaryNotes(): void {
    this.clinicalNotes.nutritionalTags = [];
    this.clinicalNotes.recommendedFoods = '';
    this.clinicalNotes.foodsToAvoid = '';
    this.clinicalNotes.hydrationGoalLiters = 3;
    this.broadcastLiveClinicalNotes();
  }

  addDietaryFocus(): void {
    const level = this.selectedNutrientLevel;
    const cat = this.selectedNutrientCategory;
    const tag = `${level === 'High' ? '⚡ High' : level === 'Low' ? '🚫 Low' : '⚖️ Balanced'}-${cat}`;

    if (!this.clinicalNotes.nutritionalTags.includes(tag)) {
      this.clinicalNotes.nutritionalTags.push(tag);
    }

    // Dynamic Clinical Nutrition Matrix
    let breakfast = '';
    let lunch = '';
    let snacks = '';
    let dinner = '';
    let avoids = '';
    let suggestedHydration = this.clinicalNotes.hydrationGoalLiters;

    switch (cat) {
      case 'Protein':
        if (level === 'High') {
          breakfast = 'Boiled Eggs (2-3) or Paneer Bhurji with Multigrain Toast';
          lunch = 'Brown Rice / Roti + Double Dal (Moong/Rajma) + Grilled Chicken or Soya Chunks + Sprout Salad';
          snacks = 'Roasted Chana / Greek Yogurt / Sattu Protein Drink';
          dinner = 'Tofu & Vegetable Saute + Yellow Moong Dal Khichdi';
          avoids = 'Sugary bakery pastries, deep-fried snacks, ultra-processed meats';
          suggestedHydration = 3.5;
        } else if (level === 'Low') {
          breakfast = 'Vegetable Poha / Semolina Upma + 1 Apple';
          lunch = 'Steamed Rice with Bottle Gourd (Lauki) curry + Light Tomato Rasam';
          snacks = 'Roasted Makhana (Foxnuts), Cucumber slices';
          dinner = 'Vegetable Dalia Khichdi / Sago Porridge';
          avoids = 'Red meat, whey protein, high-protein legumes, paneer in excess (Renal/Hepatic Restrict)';
        } else {
          breakfast = 'Vegetable Omelette / Paneer Sandwich + Fresh Fruit';
          lunch = 'Chapati + Mixed Dal Tadka + Seasonal Sabzi + Curd';
          snacks = 'Boiled Sprouts with lemon & pomegranate';
          dinner = 'Lentil Soup with Multigrain Roti';
        }
        break;

      case 'Iron':
        if (level === 'High') {
          breakfast = 'Spinach-Poha / Ragi Idli + Fresh Pomegranate juice';
          lunch = 'Palak Dal + Red Rice / Beetroot Poriyal + Mutton Liver / Black Chana sundal';
          snacks = 'Dates (Khajoor), Dried Figs (Anjeer), Roasted Pumpkin Seeds';
          dinner = 'Methi (Fenugreek) Roti + Lentil Broth + Fresh Amla / Lime (Vit-C for absorption)';
          avoids = 'Tea, Coffee, Milk within 1 hour of meals (tannins & calcium block iron absorption)';
        } else {
          breakfast = 'Oatmeal with sliced banana';
          lunch = 'Rice with yellow dal + steamed zucchini';
          snacks = 'Apple slices with almond butter';
          dinner = 'Clear vegetable soup + multigrain phulka';
        }
        break;

      case 'Sodium':
        if (level === 'Low') {
          breakfast = 'Rolled Oats with banana & unsalted almonds / Steamed Idlis';
          lunch = 'Phulkas with zero-added-salt dal + Steamed Ridge Gourd (Turai) / Lauki';
          snacks = 'Fresh fruit bowl with lemon juice (No table salt or chaat masala)';
          dinner = 'Clear vegetable broth + Steamed Millets with homemade curd';
          avoids = 'Table salt (> 2g/day), Pickles, Papads, Processed Cheese, Canned Soups, Soy Sauce, Instant noodles';
          suggestedHydration = 3;
        } else {
          breakfast = 'Vegetable Dalia + Green Tea';
          lunch = 'Roti + Seasonal Sabzi with moderate rock salt';
          snacks = 'Roasted Chana';
          dinner = 'Khichdi + Curd';
        }
        break;

      case 'Carbs':
        if (level === 'Low') {
          breakfast = 'Besan Chilla (Gram flour) / Sprouted Moong Dosa with Mint Chutney';
          lunch = 'Jowar / Bajra Roti + Palak Paneer / Grilled Fish + Cucumber Salad Bowl';
          snacks = 'Roasted Makhana + Handful of Walnuts & Chia seeds';
          dinner = 'Clear vegetable stew + Soya chunks saute (Finish dinner before 8 PM)';
          avoids = 'Refined Sugar, Maida, White bread, Sweetened sodas, Packaged juices, Mango/Chiku/Grapes in excess';
        } else {
          breakfast = 'Oats porridge with chia seeds';
          lunch = 'Brown rice + Dal + Green beans';
          snacks = 'Roasted peanuts';
          dinner = 'Multigrain roti + vegetable curry';
        }
        break;

      case 'Calcium':
        if (level === 'High') {
          breakfast = 'Fortified Milk / Curd + Ragi Porridge + Soaked Almonds';
          lunch = 'Curd Rice + Sesame-crusted Paneer + Steamed Broccoli / Bok Choy';
          snacks = 'Sesame (Til) Ladoo with jaggery / Fortified Soy Milk';
          dinner = 'Tofu & Green Bean curry + Multigrain Phulka';
          avoids = 'Carbonated fizzy colas (depletes bone calcium), excessive caffeine';
        }
        break;

      case 'Fiber':
        if (level === 'High') {
          breakfast = 'Rolled Oats with Flaxseeds, Chia seeds & Papaya slices';
          lunch = 'Brown Rice / Barley + Chana Sundal + Raw Veggie Bowl (Carrot, Radish, Cucumber)';
          snacks = 'Fresh Guava / Pear with skin, Boiled Edamame';
          dinner = 'Mixed Bean & Vegetable Soup + Methi Thepla';
          avoids = 'White bread, refined pasta, deep-fried snacks, processed junk food';
          suggestedHydration = 3.5;
        }
        break;

      case 'Potassium':
        if (level === 'Low') {
          breakfast = 'White bread with apple compote, Poha with boiled carrots';
          lunch = 'Leached vegetables (cabbage, cauliflower, green beans) + White Rice';
          snacks = 'Apple slices, Blueberries, Cranberry juice';
          dinner = 'Light Rice Gruel + Steamed Ash Gourd soup';
          avoids = 'Bananas, Coconut Water, Potatoes, Tomatoes, Oranges, Dry Fruits (Renal/Hyperkalemia Restrict)';
        } else {
          breakfast = 'Banana smoothie + Spinach scramble';
          lunch = 'Baked Sweet Potato + Grilled Salmon / Dal';
          snacks = 'Coconut water + Oranges';
          dinner = 'Lentil soup + Steamed broccoli';
        }
        break;

      case 'UricAcid':
        if (level === 'Low') {
          breakfast = 'Fresh Cherries / Blueberries + Low-fat milk with cornflakes';
          lunch = 'White Rice / Multigrain roti with Lauki & Ridge Gourd curry + Curd (Generous fluids)';
          snacks = 'Cucumber & Celery sticks, Lemongrass tea';
          dinner = 'Vegetable Dalia Khichdi + Lime water';
          avoids = 'Red meat, Organ meats, Seafood (Shrimp/Crab/Sardines), Beer/Alcohol, High-Fructose corn syrup';
          suggestedHydration = 4;
        }
        break;

      case 'Fats':
        if (level === 'High') {
          breakfast = 'Avocado toast on sourdough with chia seeds & walnuts';
          lunch = 'Grilled Salmon / Mackerel + Flaxseed-dusted Quinoa Salad';
          snacks = 'Handful of Walnuts, Almonds & Pumpkin seeds';
          dinner = 'Extra virgin olive oil sauteed vegetables with Tofu';
          avoids = 'Trans-fats, Vanaspati, Palm oil, Deep-fried street food';
        }
        break;

      case 'VitC':
        breakfast = 'Citrus fruit bowl (Orange, Kiwi, Strawberries) + Chia Oats';
        lunch = 'Bell pepper stir-fry + Lemon-coriander Dal with Brown Rice';
        snacks = 'Fresh Amla juice / Guava slices';
        dinner = 'Broccoli & Tomato soup with whole wheat toast';
        break;

      case 'VitB12':
        breakfast = 'Fortified cereal with dairy milk / Boiled Eggs with nutritional yeast toast';
        lunch = 'Grilled Chicken breast / Salmon / Paneer Tikka + Curd Rice';
        snacks = 'Hard boiled eggs / Fortified plant milk';
        dinner = 'Mushroom & Tofu curry with Phulka';
        break;

      case 'AntiInflammatory':
      default:
        breakfast = 'Golden Turmeric Chia Pudding / Green Smoothie with fresh ginger';
        lunch = 'Quinoa / Brown Rice + Grilled Tofu with turmeric-curry + Steamed Broccoli';
        snacks = 'Walnuts, Blueberries, Green Tea';
        dinner = 'Garlic Vegetable Broth + Avocado-Greens Bowl';
        avoids = 'Trans-fats, Hydrogenated oils, Excess processed sugar';
        break;
    }

    // Build Formatted Day-Parted Meal Menu
    const formattedMenu = `🌅 Breakfast: ${breakfast}\n☀️ Lunch: ${lunch}\n🍵 Snacks: ${snacks}\n🌙 Dinner: ${dinner}`;

    if (!this.clinicalNotes.recommendedFoods) {
      this.clinicalNotes.recommendedFoods = formattedMenu;
    } else {
      this.clinicalNotes.recommendedFoods += `\n\n[${tag} Focus]:\n${formattedMenu}`;
    }

    if (avoids) {
      if (!this.clinicalNotes.foodsToAvoid) {
        this.clinicalNotes.foodsToAvoid = avoids;
      } else if (!this.clinicalNotes.foodsToAvoid.includes(avoids.substring(0, 15))) {
        this.clinicalNotes.foodsToAvoid += `, ${avoids}`;
      }
    }

    if (suggestedHydration > this.clinicalNotes.hydrationGoalLiters) {
      this.clinicalNotes.hydrationGoalLiters = suggestedHydration;
    }

    this.broadcastLiveClinicalNotes();
  }

  saveClinicalNotes(): void {
    if (!this.appointmentId) return;
    this.isSavingNotes = true;
    this.notesSuccessMsg = '';

    this.appointmentService.saveClinicalNotes(this.appointmentId, this.clinicalNotes).subscribe({
      next: (res) => {
        this.isSavingNotes = false;
        if (res.success) {
          this.notesSuccessMsg = '✅ Remarks & Dietary Advice saved & emailed to patient!';
          setTimeout(() => { this.notesSuccessMsg = ''; this.cdr.detectChanges(); }, 4000);
        }
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.isSavingNotes = false;
        console.error('Save notes error:', err);
        this.cdr.detectChanges();
      }
    });
  }

  get doctorName(): string {
    if (!this.appointmentDetails) return 'Dr. Consultant';
    const doc = this.appointmentDetails.doctorId;
    if (!doc) return 'Dr. Consultant';
    const rawName = `${doc.firstName || doc.userId?.name || doc.name || ''} ${doc.lastName || ''}`.trim();
    const cleanName = rawName.replace(/^(Dr\.?\s*)+/i, '').trim();
    return cleanName ? `Dr. ${cleanName}` : 'Dr. Consultant';
  }

  get patientName(): string {
    if (!this.appointmentDetails) return 'Patient';
    const pat = this.appointmentDetails.patientId;
    if (!pat) return 'Patient';
    const name = `${pat.firstName || pat.userId?.name || pat.name || ''} ${pat.lastName || ''}`.trim();
    return name || 'Patient';
  }

  getMediaUrl(path: string | null | undefined): string {
    return getMediaUrl(path);
  }
}
