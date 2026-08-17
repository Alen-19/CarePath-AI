import { Component, OnInit, OnDestroy, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { WebRtcService, ChatMessage, PeerUser } from '../../../core/services/webrtc.service';
import { AppointmentService } from '../../../core/services/appointment.service';
import { AuthService } from '../../../core/services/auth.service';
import { MedicineService, MedicineItem } from '../../../core/services/medicine.service';

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
  activeSidebarTab: 'chat' | 'rx' | 'notes' | 'info' | null = 'chat';

  // Streams & Remote Peer
  localStream: MediaStream | null = null;
  remoteStream: MediaStream | null = null;
  peerUsers: PeerUser[] = [];
  peerMediaStatus = { audioEnabled: true, videoEnabled: true };

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

  // Emergency Sync & Pause State
  activeEmergencyAlert: { appointmentId: string; patientName: string; symptomSummary: string } | null = null;
  isCallPaused: boolean = false;
  pauseReason: string = '';
  isEmergencyTriageMode: boolean = false;

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
          this.initializeMedia();
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
  }

  resumeCurrentConsultation(): void {
    this.isCallPaused = false;
    this.webRtcService.resumeConsultation(this.appointmentId);
  }

  resumeCallManually(): void {
    this.isCallPaused = false;
    this.pauseReason = '';
    if (this.userRole === 'doctor') {
      this.webRtcService.resumeConsultation(this.appointmentId);
    }
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

  toggleSidebar(tab: 'chat' | 'rx' | 'notes' | 'info'): void {
    if (this.activeSidebarTab === tab) {
      this.activeSidebarTab = null;
    } else {
      this.activeSidebarTab = tab;
    }
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
    }
    this.searchQuery = '';
    this.searchResults = [];
  }

  removeMedicineFromPrescription(index: number): void {
    this.prescriptionList.splice(index, 1);
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
      // If doctor has added medicines to prescription list, auto-save and email patient now!
      if (this.userRole === 'doctor' && this.prescriptionList.length > 0) {
        this.issuePrescription(() => {
          this.webRtcService.endCall(this.appointmentId);
          this.isCallEnded = true;
          this.isInCall = false;
          this.stopTimer();
        });
      } else {
        this.webRtcService.endCall(this.appointmentId);
        this.isCallEnded = true;
        this.isInCall = false;
        this.stopTimer();
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
      this.cdr.detectChanges();
    }, 1000);
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

  toggleNutritionalTag(tag: string): void {
    const idx = this.clinicalNotes.nutritionalTags.indexOf(tag);
    if (idx > -1) {
      this.clinicalNotes.nutritionalTags.splice(idx, 1);
    } else {
      this.clinicalNotes.nutritionalTags.push(tag);
    }
  }

  applyNutritionalPreset(presetType: 'iron' | 'protein' | 'sodium' | 'diabetic' | 'calcium'): void {
    if (presetType === 'iron') {
      this.toggleNutritionalTag('High-Iron');
      if (!this.clinicalNotes.recommendedFoods.includes('Spinach')) {
        const foods = ['Palak (Spinach)', 'Pomegranate', 'Lentils/Dal', 'Dates', 'Beetroot', 'Eggs/Red Meat'];
        this.clinicalNotes.recommendedFoods += (this.clinicalNotes.recommendedFoods ? ', ' : '') + foods.join(', ');
      }
    } else if (presetType === 'protein') {
      this.toggleNutritionalTag('High-Protein');
      if (!this.clinicalNotes.recommendedFoods.includes('Paneer')) {
        const foods = ['Paneer', 'Eggs', 'Chickpeas/Chana', 'Tofu/Soya', 'Greek Yogurt', 'Chicken/Fish'];
        this.clinicalNotes.recommendedFoods += (this.clinicalNotes.recommendedFoods ? ', ' : '') + foods.join(', ');
      }
    } else if (presetType === 'sodium') {
      this.toggleNutritionalTag('Low-Sodium');
      this.clinicalNotes.foodsToAvoid += (this.clinicalNotes.foodsToAvoid ? ', ' : '') + 'Table Salt (> 2g/day), Canned soups, Processed chips, Pickles';
    } else if (presetType === 'diabetic') {
      this.toggleNutritionalTag('Diabetic Friendly');
      this.clinicalNotes.foodsToAvoid += (this.clinicalNotes.foodsToAvoid ? ', ' : '') + 'Refined Sugars, Sweetened Beverages, White Bread, Deep-fried snacks';
    } else if (presetType === 'calcium') {
      this.toggleNutritionalTag('Calcium & Vit-D');
      this.clinicalNotes.recommendedFoods += (this.clinicalNotes.recommendedFoods ? ', ' : '') + 'Milk/Yogurt, Ragi, Sesame Seeds, Almonds, Fortified Cereals';
    }
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
    if (!this.appointmentDetails) return 'Doctor';
    const doc = this.appointmentDetails.doctorId;
    if (!doc) return 'Doctor';
    const name = `Dr. ${doc.firstName || doc.userId?.name || doc.name || ''} ${doc.lastName || ''}`.trim();
    return name.length > 4 ? name : 'Dr. Consultant';
  }

  get patientName(): string {
    if (!this.appointmentDetails) return 'Patient';
    const pat = this.appointmentDetails.patientId;
    if (!pat) return 'Patient';
    const name = `${pat.firstName || pat.userId?.name || pat.name || ''} ${pat.lastName || ''}`.trim();
    return name || 'Patient';
  }
}
