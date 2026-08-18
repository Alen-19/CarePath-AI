import { Component, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import {
  AppointmentService,
  DoctorScheduleData,
  DaySchedule,
  DoctorDateOverrideData,
  DoctorAppointmentItem,
  ClinicalNotesData
} from '../../core/services/appointment.service';
import { WebRtcService } from '../../core/services/webrtc.service';

@Component({
  selector: 'app-doctor-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './doctor-dashboard.component.html',
  styleUrls: ['./doctor-dashboard.component.css']
})
export class DoctorDashboardComponent implements OnInit {
  doctorName = 'Dr. Sarah Jenkins';
  specialization = 'Cardiologist';
  licenseNumber = 'LIC-77889900';
  experienceYears = 12;
  clinicAddress = 'Heart & Vascular Clinic, Medical Block C, Metro Hospital';
  isVerified = true;
  today = new Date();
  showDoctorDropdown = false;

  // Emergency Live Alert State
  activeEmergencyAlert: { appointmentId: string; patientName: string; symptomSummary: string } | null = null;

  // Clean time options for strict dropdown selection
  timeOptions: string[] = [
    '07:00 AM', '07:30 AM', '08:00 AM', '08:30 AM', '09:00 AM', '09:30 AM',
    '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM', '12:00 PM', '12:30 PM',
    '01:00 PM', '01:30 PM', '02:00 PM', '02:30 PM', '03:00 PM', '03:30 PM',
    '04:00 PM', '04:30 PM', '05:00 PM', '05:30 PM', '06:00 PM', '06:30 PM',
    '07:00 PM', '07:30 PM', '08:00 PM', '08:30 PM', '09:00 PM', '09:30 PM', '10:00 PM'
  ];

  // Date Range Bounds (Today up to 1 Year in advance)
  minDateStr = this.getISOStringForDate(new Date());
  maxDateStr = this.getISOStringForDate(new Date(new Date().setFullYear(new Date().getFullYear() + 1)));

  // Mock clinical data for initial presentation
  stats = {
    totalAppointments: 18,
    pendingRequests: 4,
    activePatients: 32,
    rating: 4.9
  };

  ehrToastMsg = '';
  carePlanToastMsg = '';

  todayAppointments = [
    { patientName: 'Joy Joseph', age: 42, time: '09:00 AM', type: 'Follow-up', status: 'Completed', symptoms: 'Hypertension, Mild Dizziness' },
    { patientName: 'Evan Anil', age: 31, time: '10:30 AM', type: 'Care Plan Review', status: 'Confirmed', symptoms: 'Blood Pressure Monitoring' },
    { patientName: 'Jithu Binet', age: 58, time: '02:00 PM', type: 'Initial Consultation', status: 'Pending', symptoms: 'Chest tightness, Shortness of breath' }
  ];

  activeCarePlans = [
    { patientName: 'Evan Anil', planTitle: 'Hypertension Management Protocol', progress: '75%', nextReview: 'July 31, 2026' },
    { patientName: 'Joy Joseph', planTitle: 'Post-Cardiac Rehab Recovery', progress: '40%', nextReview: 'August 05, 2026' }
  ];

  // Schedule & Pricing Management State
  showScheduleModal = false;
  isLoadingSchedule = false;
  isSavingSchedule = false;
  scheduleSuccessMsg = '';
  scheduleErrMsg = '';

  consultationFee = 500; // in ₹ Rupees
  slotDurationMinutes = 30;
  weeklySchedule: DaySchedule[] = [
    { dayOfWeek: 'Monday', isWorkingDay: true, session1Start: '09:00 AM', session1End: '01:00 PM', hasSecondSession: true, session2Start: '04:00 PM', session2End: '07:00 PM' },
    { dayOfWeek: 'Tuesday', isWorkingDay: true, session1Start: '09:00 AM', session1End: '01:00 PM', hasSecondSession: true, session2Start: '04:00 PM', session2End: '07:00 PM' },
    { dayOfWeek: 'Wednesday', isWorkingDay: true, session1Start: '09:00 AM', session1End: '01:00 PM', hasSecondSession: true, session2Start: '04:00 PM', session2End: '07:00 PM' },
    { dayOfWeek: 'Thursday', isWorkingDay: true, session1Start: '09:00 AM', session1End: '01:00 PM', hasSecondSession: true, session2Start: '04:00 PM', session2End: '07:00 PM' },
    { dayOfWeek: 'Friday', isWorkingDay: true, session1Start: '09:00 AM', session1End: '01:00 PM', hasSecondSession: true, session2Start: '04:00 PM', session2End: '07:00 PM' },
    { dayOfWeek: 'Saturday', isWorkingDay: false, session1Start: '10:00 AM', session1End: '02:00 PM', hasSecondSession: false, session2Start: '04:00 PM', session2End: '07:00 PM' },
    { dayOfWeek: 'Sunday', isWorkingDay: false, session1Start: '10:00 AM', session1End: '02:00 PM', hasSecondSession: false, session2Start: '04:00 PM', session2End: '07:00 PM' }
  ];

  // Date Override State
  dateOverrides: DoctorDateOverrideData[] = [];
  overrideDateInput = '';
  overrideReason = 'Personal Leave';
  overrideIsOffDay = true;
  overrideSession1Start = '09:00 AM';
  overrideSession1End = '01:00 PM';
  overrideHasSecondSession = false;
  overrideSession2Start = '04:00 PM';
  overrideSession2End = '07:00 PM';

  // Suspension State
  isSuspended = false;
  suspensionReason = '';
  suspendedAt = '';

  // Location Completion State
  isLocationIncomplete = false;
  showLocationModal = false;
  isSavingLocation = false;
  locationSuccessMsg = '';
  locationErrMsg = '';

  editClinicName = '';
  editStreetAddress = '';
  editPincode = '';
  editCity = '';
  editDistrict = '';
  editState = '';
  editCountry = 'India';
  editLat: number | null = null;
  editLng: number | null = null;

  localitiesList: string[] = [];
  loadingPincode = false;
  pincodeErrorMsg = '';

  activeNavTab: 'appointments' | 'profile' = 'appointments';
  
  // Doctor Profile Editing State
  docFirstName = '';
  docLastName = '';
  docEmail = '';
  docSpecialization = '';
  specializationsList: string[] = [
    'General Practice / General Physician',
    'Allergy & Immunology',
    'Anesthesiology',
    'Cardiology',
    'Dermatology',
    'Emergency Medicine',
    'Endocrinology',
    'Family Medicine',
    'Gastroenterology',
    'General Surgery',
    'Geriatric Medicine',
    'Hematology',
    'Infectious Disease',
    'Internal Medicine',
    'Medical Genetics',
    'Nephrology',
    'Neurology',
    'Neurosurgery',
    'Obstetrics & Gynecology (OB-GYN)',
    'Oncology',
    'Ophthalmology',
    'Orthopedic Surgery',
    'Otolaryngology (ENT)',
    'Pathology',
    'Pediatrics',
    'Physical Medicine & Rehabilitation',
    'Plastic Surgery',
    'Psychiatry',
    'Pulmonology',
    'Radiology',
    'Rheumatology',
    'Sports Medicine',
    'Urology',
    'Vascular Surgery',
    'Other / Specialized'
  ];
  docLicenseNumber = '';
  docExperienceYears = 0;
  docClinicName = '';
  docConsultationFee = 500;
  docProfileImage = '';
  docStatus: 'pending' | 'approved' | 'suspended' | 'rejected' = 'approved';

  originalSpecialization = '';
  originalLicenseNumber = '';

  uploadingDoctorImage = false;
  isSavingProfile = false;
  profileSaveMsg = '';
  profileErrMsg = '';
  showReverificationModal = false;

  // Password Change State
  passwordForm = {
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  };
  changingPassword = false;
  passwordSuccess = '';
  passwordError = '';

  // Appointments
  todayApptsList: DoctorAppointmentItem[] = [];
  upcomingApptsList: DoctorAppointmentItem[] = [];
  pastApptsList: DoctorAppointmentItem[] = [];
  pastApptsSearch = '';
  selectedPastAppointment: DoctorAppointmentItem | null = null;
  loadingAppts = false;
  apptTab: 'today' | 'upcoming' | 'past' = 'today';

  get filteredPastApptsList(): DoctorAppointmentItem[] {
    const q = (this.pastApptsSearch || '').toLowerCase().trim();
    if (!q) return this.pastApptsList;
    return this.pastApptsList.filter(a => {
      const patientName = (a.patientId ? (a.patientId.firstName ? (a.patientId.firstName + ' ' + (a.patientId.lastName || '')) : (a.patientId.name || '')) : (a.patientName || '')).toLowerCase();
      const symptoms = (a.symptoms || '').toLowerCase();
      const type = (a.type || '').toLowerCase();
      const date = (a.appointmentDate || '').toLowerCase();
      return patientName.includes(q) || symptoms.includes(q) || type.includes(q) || date.includes(q);
    });
  }

  // Touch Trackers for Doctor Profile
  docFirstNameTouched = false;
  docLastNameTouched = false;
  docSpecializationTouched = false;
  docLicenseNumberTouched = false;
  docExperienceYearsTouched = false;
  docConsultationFeeTouched = false;
  docClinicNameTouched = false;
  docPincodeTouched = false;

  get isDocFirstNameValid(): boolean {
    const clean = (this.docFirstName || '').trim();
    if (clean.length < 2 || clean.length > 50) return false;
    return /^[a-zA-Z]+(?:[\s'\.\-][a-zA-Z]+)*$/.test(clean);
  }

  get isDocLastNameValid(): boolean {
    const clean = (this.docLastName || '').trim();
    if (!clean) return true;
    if (clean.length < 1 || clean.length > 50) return false;
    return /^[a-zA-Z]+(?:[\s'\.\-][a-zA-Z]+)*$/.test(clean);
  }

  get isDocSpecializationValid(): boolean {
    const clean = (this.docSpecialization || '').trim();
    if (clean.length < 2 || clean.length > 60) return false;
    return /^[a-zA-Z]+(?:[\s'\.\-\&][a-zA-Z]+)*$/.test(clean);
  }

  get isDocLicenseValid(): boolean {
    const clean = (this.docLicenseNumber || '').trim();
    if (clean.length < 4 || clean.length > 35) return false;
    if (/^(.)\1+$/.test(clean)) return false; // reject '0000', '1111', 'aaaa'
    return /^[a-zA-Z0-9]+(?:[\/\-][a-zA-Z0-9]+)*$/.test(clean);
  }

  get isDocExperienceValid(): boolean {
    if (this.docExperienceYears === null || this.docExperienceYears === undefined || (this.docExperienceYears as any) === '') return false;
    return this.docExperienceYears >= 0 && this.docExperienceYears <= 60;
  }

  get isDocFeeValid(): boolean {
    if (this.docConsultationFee === null || this.docConsultationFee === undefined || (this.docConsultationFee as any) === '') return false;
    return this.docConsultationFee >= 0 && this.docConsultationFee <= 25000;
  }

  get isDocClinicNameValid(): boolean {
    const clean = (this.docClinicName || '').trim();
    if (!clean) return true;
    return clean.length >= 2;
  }

  get isDocPincodeValid(): boolean {
    const clean = (this.editPincode || '').trim();
    if (!clean) return true;
    return /^\d{6}$/.test(clean);
  }

  get isDocProfileFormValid(): boolean {
    return this.isDocFirstNameValid &&
      this.isDocLastNameValid &&
      this.isDocSpecializationValid &&
      this.isDocLicenseValid &&
      this.isDocExperienceValid &&
      this.isDocFeeValid &&
      this.isDocClinicNameValid &&
      this.isDocPincodeValid;
  }

  get doctorInitials(): string {
    const f = this.docFirstName?.charAt(0) || 'D';
    const l = this.docLastName?.charAt(0) || 'R';
    return (f + l).toUpperCase();
  }

  constructor(
    private authService: AuthService,
    private appointmentService: AppointmentService,
    private webRtcService: WebRtcService,
    private router: Router
  ) {
    this.syncDoctorProfile();
  }

  syncDoctorProfile(): void {
    const user = this.authService.currentUser();
    if (user && user.doctorProfile) {
      this.docEmail = user.email || '';
      this.docFirstName = user.doctorProfile.firstName || '';
      this.docLastName = user.doctorProfile.lastName || '';
      this.doctorName = `Dr. ${this.docFirstName} ${this.docLastName}`.trim();
      this.docSpecialization = user.doctorProfile.specialization || 'General Physician';
      this.specialization = this.docSpecialization;
      this.originalSpecialization = this.docSpecialization;

      this.docLicenseNumber = user.doctorProfile.licenseNumber || 'LIC-Pending';
      this.licenseNumber = this.docLicenseNumber;
      this.originalLicenseNumber = this.docLicenseNumber;

      this.docProfileImage = user.doctorProfile.profileImage || '';
      this.isVerified = user.doctorProfile.isVerified ?? false;
      this.docStatus = user.doctorProfile.status || (this.isVerified ? 'approved' : 'pending');

      if (user.doctorProfile.experienceYears) {
        this.docExperienceYears = user.doctorProfile.experienceYears;
        this.experienceYears = this.docExperienceYears;
      }

      // Register doctor ID for real-time emergency WebSocket alerts
      const docId = (user.doctorProfile as any)?._id || (user.doctorProfile as any)?.id;
      if (docId) {
        this.webRtcService.registerDoctorDashboard(docId);
      }
      
      const doc = user.doctorProfile;
      if (doc.clinicName) {
        this.docClinicName = doc.clinicName;
        this.editClinicName = doc.clinicName;
      }

      if (typeof doc.clinicAddress === 'object' && doc.clinicAddress !== null) {
        this.editStreetAddress = doc.clinicAddress.streetAddress || '';
        this.editPincode = doc.clinicAddress.pincode || '';
        this.editCity = doc.clinicAddress.city || '';
        this.editDistrict = doc.clinicAddress.district || '';
        this.editState = doc.clinicAddress.state || '';
        this.editCountry = doc.clinicAddress.country || 'India';
        this.editLat = doc.clinicAddress.latitude || null;
        this.editLng = doc.clinicAddress.longitude || null;

        this.clinicAddress = [doc.clinicName, this.editStreetAddress, this.editCity, this.editState].filter(Boolean).join(', ');

        if (!this.editPincode || !this.editCity) {
          this.isLocationIncomplete = true;
        }
      } else if (typeof doc.clinicAddress === 'string' && doc.clinicAddress) {
        this.clinicAddress = doc.clinicAddress;
        this.editStreetAddress = doc.clinicAddress;
        this.isLocationIncomplete = true;
      } else {
        this.isLocationIncomplete = true;
      }

      if (user.doctorProfile.consultationFee) {
        this.docConsultationFee = user.doctorProfile.consultationFee;
        this.consultationFee = user.doctorProfile.consultationFee;
      }
      if (user.doctorProfile.status === 'suspended') {
        this.isSuspended = true;
        this.suspensionReason = user.doctorProfile.suspensionReason || 'Account suspended by system administration.';
        this.suspendedAt = user.doctorProfile.suspendedAt || '';
      }
    }
  }

  ngOnInit(): void {
    this.loadDoctorSchedule();
    this.loadDoctorAppointments();
    if (this.editPincode) {
      this.onLocationPincodeInput();
    }

    // Subscribe to real-time Emergency Alerts
    this.webRtcService.emergencyAlert$.subscribe(alertData => {
      if (alertData) {
        this.activeEmergencyAlert = alertData;
        this.playEmergencyChime();
        this.loadDoctorAppointments(); // Refresh appointment list
      }
    });
  }

  playEmergencyChime(): void {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 note
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.6);
    } catch (e) {
      console.warn('Audio chime unsupported or blocked by browser user gesture.');
    }
  }

  joinEmergencyRoom(appointmentId: string): void {
    this.activeEmergencyAlert = null;
    this.router.navigate([`/consultation/${appointmentId}`]);
  }

  openLocationModal(): void {
    this.showLocationModal = true;
    this.locationErrMsg = '';
    this.locationSuccessMsg = '';
  }

  closeLocationModal(): void {
    this.showLocationModal = false;
  }

  onLocationPincodeInput(): void {
    const cleanPin = this.editPincode ? this.editPincode.trim() : '';
    if (cleanPin.length === 6 && /^\d{6}$/.test(cleanPin)) {
      this.loadingPincode = true;
      this.pincodeErrorMsg = '';
      fetch(`https://api.postalpincode.in/pincode/${cleanPin}`)
        .then(res => res.json())
        .then(data => {
          this.loadingPincode = false;
          if (data && data[0] && data[0].Status === 'Success' && data[0].PostOffice) {
            const postOffices = data[0].PostOffice;
            this.localitiesList = Array.from(new Set(postOffices.map((po: any) => po.Name)));
            if (postOffices.length > 0) {
              if (!this.editCity || !this.localitiesList.includes(this.editCity)) {
                this.editCity = this.localitiesList[0];
              }
              this.editDistrict = postOffices[0].District || this.editDistrict;
              this.editState = postOffices[0].State || this.editState;
            }
            this.geocodeLocationQuery(`${cleanPin}, India`);
          } else {
            this.pincodeErrorMsg = 'Invalid Indian Pincode. Please check your 6-digit postal code.';
          }
        })
        .catch(() => {
          this.loadingPincode = false;
          this.pincodeErrorMsg = 'Could not fetch location data for this pincode.';
        });
    } else {
      this.localitiesList = [];
    }
  }

  geocodeLocationQuery(queryStr: string): void {
    fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(queryStr)}&format=json&limit=1`)
      .then(res => res.json())
      .then(data => {
        if (data && data.length > 0) {
          this.editLat = parseFloat(data[0].lat);
          this.editLng = parseFloat(data[0].lon);
        }
      })
      .catch(() => {});
  }

  saveClinicLocation(): void {
    if (!this.editPincode || !/^\d{6}$/.test(this.editPincode.trim())) {
      this.locationErrMsg = 'Please enter a valid 6-digit Indian Pincode.';
      return;
    }
    if (!this.editCity || !this.editCity.trim()) {
      this.locationErrMsg = 'Please enter or select your Locality / City.';
      return;
    }

    this.isSavingLocation = true;
    this.locationErrMsg = '';
    this.locationSuccessMsg = '';

    const payload = {
      clinicName: this.editClinicName.trim() || 'Clinician Clinic',
      clinicAddress: {
        city: this.editCity.trim(),
        district: this.editDistrict.trim(),
        state: this.editState.trim(),
        pincode: this.editPincode.trim(),
        country: this.editCountry || 'India',
        latitude: this.editLat,
        longitude: this.editLng
      }
    };

    this.authService.completeProfile({ role: 'doctor', profile: payload }).subscribe({
      next: (res) => {
        this.isSavingLocation = false;
        this.locationSuccessMsg = 'Clinic location saved successfully!';
        this.isLocationIncomplete = false;
        this.clinicAddress = [this.editClinicName, this.editCity, this.editState].filter(Boolean).join(', ');
        setTimeout(() => {
          this.closeLocationModal();
        }, 1200);
      },
      error: (err) => {
        this.isSavingLocation = false;
        this.locationErrMsg = err.error?.message || 'Failed to save clinic location.';
      }
    });
  }

  // ─── Doctor Profile Dropdown ──────────────────────────────────────────────
  toggleDoctorDropdown(event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.showDoctorDropdown = !this.showDoctorDropdown;
  }

  closeDoctorDropdown(): void {
    this.showDoctorDropdown = false;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.doctor-menu-container')) {
      this.closeDoctorDropdown();
    }
  }

  // ─── Doctor Profile Page Handlers ─────────────────────────────────────────
  setNavTab(tab: 'appointments' | 'profile'): void {
    this.activeNavTab = tab;
    this.closeDoctorDropdown();
    this.profileSaveMsg = '';
    this.profileErrMsg = '';
    this.passwordSuccess = '';
    this.passwordError = '';
  }

  onDoctorImageSelected(event: any): void {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      this.profileErrMsg = 'Image size exceeds 5MB limit. Please choose a smaller file.';
      return;
    }

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      this.profileErrMsg = 'Please select a valid image (JPEG, PNG, or WebP).';
      return;
    }

    const formData = new FormData();
    formData.append('profileImage', file);

    this.uploadingDoctorImage = true;
    this.authService.uploadProfileImage(formData).subscribe({
      next: (res) => {
        this.uploadingDoctorImage = false;
        this.docProfileImage = res.profileImage;
        this.syncDoctorProfile();
        this.profileSaveMsg = 'Profile photo updated successfully!';
      },
      error: (err) => {
        this.uploadingDoctorImage = false;
        this.profileErrMsg = err.error?.message || 'Failed to upload profile photo.';
      }
    });
  }

  initiateSaveDoctorProfile(): void {
    this.profileSaveMsg = '';
    this.profileErrMsg = '';

    this.docFirstNameTouched = true;
    this.docLastNameTouched = true;
    this.docSpecializationTouched = true;
    this.docLicenseNumberTouched = true;
    this.docExperienceYearsTouched = true;
    this.docConsultationFeeTouched = true;
    this.docClinicNameTouched = true;
    this.docPincodeTouched = true;

    if (!this.isDocProfileFormValid) {
      if (!this.isDocFirstNameValid) {
        this.profileErrMsg = 'Please enter a valid first name (letters only, min 2 characters).';
      } else if (!this.isDocLastNameValid) {
        this.profileErrMsg = 'Please enter a valid last name (letters only).';
      } else if (!this.isDocSpecializationValid) {
        this.profileErrMsg = 'Please enter a valid specialization (2–60 characters).';
      } else if (!this.isDocLicenseValid) {
        this.profileErrMsg = 'Please enter a valid medical license registration number (4–35 alphanumeric characters).';
      } else if (!this.isDocExperienceValid) {
        this.profileErrMsg = 'Experience must be between 0 and 60 years.';
      } else if (!this.isDocFeeValid) {
        this.profileErrMsg = 'Consultation fee must be between ₹0 and ₹25,000.';
      } else if (!this.isDocClinicNameValid) {
        this.profileErrMsg = 'Clinic name must be at least 2 characters.';
      } else if (!this.isDocPincodeValid) {
        this.profileErrMsg = 'Please enter a valid 6-digit Indian pincode.';
      }
      return;
    }

    const cleanSpec = (this.docSpecialization || '').trim();
    const cleanLic = (this.docLicenseNumber || '').trim();

    // Check if specialization or license changed compared to initial
    const specChanged = cleanSpec && this.originalSpecialization && cleanSpec.toLowerCase() !== this.originalSpecialization.toLowerCase();
    const licChanged = cleanLic && this.originalLicenseNumber && cleanLic.toLowerCase() !== this.originalLicenseNumber.toLowerCase();

    if (specChanged || licChanged) {
      // Trigger confirmation warning modal
      this.showReverificationModal = true;
    } else {
      this.executeSaveDoctorProfile();
    }
  }

  confirmReverificationAndSave(): void {
    this.showReverificationModal = false;
    this.executeSaveDoctorProfile();
  }

  cancelReverificationModal(): void {
    this.showReverificationModal = false;
  }

  private executeSaveDoctorProfile(): void {
    this.isSavingProfile = true;
    this.profileSaveMsg = '';
    this.profileErrMsg = '';

    const payload = {
      firstName: this.docFirstName.trim(),
      lastName: this.docLastName.trim(),
      specialization: this.docSpecialization.trim(),
      licenseNumber: this.docLicenseNumber.trim(),
      experienceYears: Number(this.docExperienceYears) || 0,
      clinicName: (this.docClinicName || '').trim(),
      consultationFee: Number(this.docConsultationFee) || 500,
      clinicAddress: {
        city: (this.editCity || '').trim(),
        district: (this.editDistrict || '').trim(),
        state: (this.editState || '').trim(),
        pincode: (this.editPincode || '').trim(),
        country: this.editCountry || 'India',
        latitude: this.editLat,
        longitude: this.editLng
      }
    };

    this.authService.updateProfile(payload).subscribe({
      next: (res) => {
        this.isSavingProfile = false;
        this.syncDoctorProfile();
        if (res.reverificationTriggered) {
          this.profileSaveMsg = '⚠️ Profile updated. Re-verification has been requested. Admin review is pending.';
        } else {
          this.profileSaveMsg = '✓ Doctor profile updated successfully!';
        }
      },
      error: (err) => {
        this.isSavingProfile = false;
        this.profileErrMsg = err.error?.message || 'Failed to update profile.';
      }
    });
  }

  changeDoctorPassword(): void {
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
      },
      error: (err) => {
        this.changingPassword = false;
        this.passwordError = err.error?.message || 'Failed to change password. Please verify your current password.';
      }
    });
  }

  loadDoctorAppointments(): void {
    this.loadingAppts = true;
    this.appointmentService.getDoctorAppointments().subscribe({
      next: (res) => {
        const rawToday = res.today || [];
        // Sort Emergency Sync appointments to top of list
        this.todayApptsList = rawToday.sort((a, b) => {
          const aEmerg = a.type === 'Emergency Sync' || a.isEmergency ? 1 : 0;
          const bEmerg = b.type === 'Emergency Sync' || b.isEmergency ? 1 : 0;
          return bEmerg - aEmerg;
        });

        const rawUpcoming = res.upcoming || [];
        this.upcomingApptsList = rawUpcoming.sort((a, b) => {
          const aEmerg = a.type === 'Emergency Sync' || a.isEmergency ? 1 : 0;
          const bEmerg = b.type === 'Emergency Sync' || b.isEmergency ? 1 : 0;
          return bEmerg - aEmerg;
        });

        const rawPast = res.past || [];
        this.pastApptsList = rawPast.sort((a, b) => {
          return new Date((b.appointmentDate || '2000-01-01') + 'T' + (b.startTime ? this.convertTo24h(b.startTime) : '00:00:00')).getTime() -
                 new Date((a.appointmentDate || '2000-01-01') + 'T' + (a.startTime ? this.convertTo24h(a.startTime) : '00:00:00')).getTime();
        });

        this.loadingAppts = false;
      },
      error: () => { this.loadingAppts = false; }
    });
  }

  private convertTo24h(time12h: string): string {
    if (!time12h) return '00:00:00';
    const match = time12h.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!match) return '00:00:00';
    let h = parseInt(match[1], 10);
    const m = match[2];
    const mod = match[3].toUpperCase();
    if (mod === 'PM' && h < 12) h += 12;
    if (mod === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${m}:00`;
  }

  formatApptDate(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  private getISOStringForDate(dateObj: Date): string {
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  loadDoctorSchedule(): void {
    this.isLoadingSchedule = true;
    this.appointmentService.getMyDoctorSchedule().subscribe({
      next: (res) => {
        this.isLoadingSchedule = false;
        if (res.success && res.schedule) {
          this.consultationFee = res.schedule.consultationFee || 500;
          this.slotDurationMinutes = res.schedule.slotDurationMinutes || 30;
          if (res.schedule.weeklySchedule && res.schedule.weeklySchedule.length) {
            this.weeklySchedule = res.schedule.weeklySchedule.map(d => ({
              dayOfWeek: d.dayOfWeek,
              isWorkingDay: d.isWorkingDay,
              session1Start: d.session1Start || (d as any).startTime || '09:00 AM',
              session1End: d.session1End || (d as any).endTime || '01:00 PM',
              hasSecondSession: d.hasSecondSession ?? true,
              session2Start: d.session2Start || '04:00 PM',
              session2End: d.session2End || '07:00 PM'
            }));
          }
        }
        if (res.overrides) {
          this.dateOverrides = res.overrides;
        }
      },
      error: (err) => {
        this.isLoadingSchedule = false;
        console.error('Error loading doctor schedule:', err);
      }
    });
  }

  openScheduleModal(): void {
    this.showScheduleModal = true;
    this.scheduleSuccessMsg = '';
    this.scheduleErrMsg = '';
    this.loadDoctorSchedule();
  }

  closeScheduleModal(): void {
    this.showScheduleModal = false;
  }

  onFeeInput(event: Event): void {
    const inputEl = event.target as HTMLInputElement;
    if (inputEl && inputEl.value !== '') {
      let val = Number(inputEl.value);
      if (val > 25000) {
        this.consultationFee = 25000;
        inputEl.value = '25000';
      } else if (val < 0) {
        this.consultationFee = 0;
        inputEl.value = '0';
      } else {
        this.consultationFee = val;
      }
    }
  }

  onSaveWeeklySchedule(): void {
    // 1. Fee validation
    if (this.consultationFee === null || this.consultationFee === undefined || isNaN(this.consultationFee) || this.consultationFee < 0 || this.consultationFee > 25000) {
      this.scheduleErrMsg = 'Consultation fee must be a valid amount between ₹0 and ₹25,000 INR.';
      return;
    }

    this.isSavingSchedule = true;
    this.scheduleSuccessMsg = '';
    this.scheduleErrMsg = '';

    this.appointmentService.updateWeeklySchedule({
      consultationFee: this.consultationFee,
      slotDurationMinutes: this.slotDurationMinutes,
      weeklySchedule: this.weeklySchedule
    }).subscribe({
      next: (res) => {
        this.isSavingSchedule = false;
        this.scheduleSuccessMsg = 'Weekly schedule & consultation fee updated successfully!';
      },
      error: (err) => {
        this.isSavingSchedule = false;
        this.scheduleErrMsg = err?.error?.message || 'Failed to save weekly schedule.';
      }
    });
  }

  onAddDateOverride(): void {
    if (!this.overrideDateInput) {
      this.scheduleErrMsg = 'Please select a date for the override.';
      return;
    }

    if (this.overrideDateInput < this.minDateStr) {
      this.scheduleErrMsg = 'Cannot set schedule overrides or slots for past dates.';
      return;
    }

    if (this.overrideDateInput > this.maxDateStr) {
      this.scheduleErrMsg = 'Single-day overrides can only be set up to 1 year in advance.';
      return;
    }

    this.isSavingSchedule = true;
    this.scheduleSuccessMsg = '';
    this.scheduleErrMsg = '';

    const payload: DoctorDateOverrideData = {
      date: this.overrideDateInput,
      isOffDay: this.overrideIsOffDay,
      reason: this.overrideReason || (this.overrideIsOffDay ? 'On Leave' : 'Custom Schedule'),
      session1Start: this.overrideSession1Start,
      session1End: this.overrideSession1End,
      hasSecondSession: this.overrideHasSecondSession,
      session2Start: this.overrideSession2Start,
      session2End: this.overrideSession2End
    };

    this.appointmentService.saveDateOverride(payload).subscribe({
      next: (res) => {
        this.isSavingSchedule = false;
        this.scheduleSuccessMsg = `Date override for ${this.overrideDateInput} saved!`;
        this.overrideDateInput = '';
        this.loadDoctorSchedule();
      },
      error: (err) => {
        this.isSavingSchedule = false;
        this.scheduleErrMsg = err?.error?.message || 'Failed to save date override.';
      }
    });
  }

  onDeleteDateOverride(id: string): void {
    this.appointmentService.deleteDateOverride(id).subscribe({
      next: () => {
        this.scheduleSuccessMsg = 'Date override removed.';
        this.loadDoctorSchedule();
      },
      error: (err) => {
        this.scheduleErrMsg = err?.error?.message || 'Failed to remove date override.';
      }
    });
  }

  // Clinical Remarks & Dietary Advice Modal State
  selectedNotesAppt: any = null;
  modalNotesData: ClinicalNotesData = {
    doctorRemarks: '',
    nutritionalTags: [],
    recommendedFoods: '',
    foodsToAvoid: '',
    hydrationGoalLiters: 3
  };
  isSavingNotesModal: boolean = false;
  notesModalMsg: string = '';

  openClinicalNotesModal(appt: any): void {
    this.selectedNotesAppt = appt;
    this.notesModalMsg = '';
    
    // Pre-fill from existing appt.clinicalNotes if available
    if (appt && appt.clinicalNotes) {
      this.modalNotesData = {
        doctorRemarks: appt.clinicalNotes.doctorRemarks || '',
        nutritionalTags: appt.clinicalNotes.nutritionalTags ? [...appt.clinicalNotes.nutritionalTags] : [],
        recommendedFoods: appt.clinicalNotes.recommendedFoods || '',
        foodsToAvoid: appt.clinicalNotes.foodsToAvoid || '',
        hydrationGoalLiters: appt.clinicalNotes.hydrationGoalLiters || 3
      };
    } else {
      this.modalNotesData = {
        doctorRemarks: '',
        nutritionalTags: [],
        recommendedFoods: '',
        foodsToAvoid: '',
        hydrationGoalLiters: 3
      };
    }

    if (appt && appt._id) {
      this.appointmentService.getClinicalNotes(appt._id).subscribe({
        next: (res) => {
          if (res.success && res.clinicalNotes) {
            this.modalNotesData = {
              doctorRemarks: res.clinicalNotes.doctorRemarks || '',
              nutritionalTags: res.clinicalNotes.nutritionalTags || [],
              recommendedFoods: res.clinicalNotes.recommendedFoods || '',
              foodsToAvoid: res.clinicalNotes.foodsToAvoid || '',
              hydrationGoalLiters: res.clinicalNotes.hydrationGoalLiters || 3
            };
            if (this.selectedNotesAppt) {
              this.selectedNotesAppt.clinicalNotes = res.clinicalNotes;
            }
          }
        }
      });
    }
  }

  closeClinicalNotesModal(): void {
    this.selectedNotesAppt = null;
    this.notesModalMsg = '';
  }

  toggleModalNutritionalTag(tag: string): void {
    if (!this.modalNotesData.nutritionalTags) this.modalNotesData.nutritionalTags = [];
    const idx = this.modalNotesData.nutritionalTags.indexOf(tag);
    if (idx > -1) {
      this.modalNotesData.nutritionalTags.splice(idx, 1);
    } else {
      this.modalNotesData.nutritionalTags.push(tag);
    }
  }

  applyModalNutritionalPreset(presetType: 'iron' | 'protein' | 'sodium' | 'diabetic' | 'calcium'): void {
    if (!this.modalNotesData.nutritionalTags) this.modalNotesData.nutritionalTags = [];
    if (!this.modalNotesData.recommendedFoods) this.modalNotesData.recommendedFoods = '';
    if (!this.modalNotesData.foodsToAvoid) this.modalNotesData.foodsToAvoid = '';

    if (presetType === 'iron') {
      this.toggleModalNutritionalTag('High-Iron');
      if (!this.modalNotesData.recommendedFoods.includes('Spinach')) {
        const foods = ['Palak (Spinach)', 'Pomegranate', 'Lentils/Dal', 'Dates', 'Beetroot', 'Eggs/Red Meat'];
        this.modalNotesData.recommendedFoods += (this.modalNotesData.recommendedFoods ? ', ' : '') + foods.join(', ');
      }
    } else if (presetType === 'protein') {
      this.toggleModalNutritionalTag('High-Protein');
      if (!this.modalNotesData.recommendedFoods.includes('Paneer')) {
        const foods = ['Paneer', 'Eggs', 'Chickpeas/Chana', 'Tofu/Soya', 'Greek Yogurt', 'Chicken/Fish'];
        this.modalNotesData.recommendedFoods += (this.modalNotesData.recommendedFoods ? ', ' : '') + foods.join(', ');
      }
    } else if (presetType === 'sodium') {
      this.toggleModalNutritionalTag('Low-Sodium');
      this.modalNotesData.foodsToAvoid += (this.modalNotesData.foodsToAvoid ? ', ' : '') + 'Table Salt (> 2g/day), Canned soups, Processed chips, Pickles';
    } else if (presetType === 'diabetic') {
      this.toggleModalNutritionalTag('Diabetic Friendly');
      this.modalNotesData.foodsToAvoid += (this.modalNotesData.foodsToAvoid ? ', ' : '') + 'Refined Sugars, Sweetened Beverages, White Bread, Deep-fried snacks';
    } else if (presetType === 'calcium') {
      this.toggleModalNutritionalTag('Calcium & Vit-D');
      this.modalNotesData.recommendedFoods += (this.modalNotesData.recommendedFoods ? ', ' : '') + 'Milk/Yogurt, Ragi, Sesame Seeds, Almonds, Fortified Cereals';
    }
  }

  saveClinicalNotesFromModal(): void {
    if (!this.selectedNotesAppt || !this.selectedNotesAppt._id) return;
    this.isSavingNotesModal = true;
    this.notesModalMsg = '';

    this.appointmentService.saveClinicalNotes(this.selectedNotesAppt._id, this.modalNotesData).subscribe({
      next: (res) => {
        this.isSavingNotesModal = false;
        if (res.success) {
          this.notesModalMsg = '✅ Remarks & Dietary Advice saved and emailed to patient!';
          if (this.selectedNotesAppt) {
            this.selectedNotesAppt.clinicalNotes = res.clinicalNotes;
          }
          setTimeout(() => { this.closeClinicalNotesModal(); }, 1800);
        }
      },
      error: (err) => {
        this.isSavingNotesModal = false;
        console.error('Save notes error:', err);
      }
    });
  }

  onViewEhr(patientName: string): void {
    this.ehrToastMsg = `EHR Portal for ${patientName}: Full Longitudinal Health Records coming soon!`;
    setTimeout(() => {
      if (this.ehrToastMsg.includes(patientName)) {
        this.ehrToastMsg = '';
      }
    }, 4000);
  }

  onCreateCarePlan(): void {
    this.carePlanToastMsg = 'CarePath AI: Automated 7-Day Care Plan Protocol Builder coming soon!';
    setTimeout(() => {
      this.carePlanToastMsg = '';
    }, 4000);
  }

  onLogout(): void {
    this.authService.logout();
    this.router.navigate(['/auth/login']);
  }
}
