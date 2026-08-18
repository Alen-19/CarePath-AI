import { Component, OnInit, NgZone, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { HttpClient } from '@angular/common/http';
import {
  AppointmentService,
  DoctorCard,
  BookingSlot,
  AppointmentItem
} from '../../core/services/appointment.service';

declare var Razorpay: any;

@Component({
  selector: 'app-patient-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './patient-dashboard.component.html',
  styleUrls: ['./patient-dashboard.component.css']
})
export class PatientDashboardComponent implements OnInit {
  patientName = '';
  patientId = '';
  patientEmail = '';
  activeTab: 'find-doctors' | 'my-appointments' | 'profile' = 'find-doctors';
  showUserDropdown = false;

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

  get totalBookingFee(): number {
    return this.appointmentType === 'Emergency Sync' ? Math.round(this.baseConsultationFee * 1.1) : this.baseConsultationFee;
  }

  constructor(
    private authService: AuthService,
    private appointmentService: AppointmentService,
    private http: HttpClient,
    private router: Router,
    private ngZone: NgZone
  ) {
    this.syncPatientInfo();
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
    this.http.get<any[]>(`http://localhost:5000/api/auth/pincode/${pincode}`).subscribe({
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
  setTab(tab: 'find-doctors' | 'my-appointments' | 'profile') {
    this.activeTab = tab;
    this.closeUserDropdown();
    if (tab === 'my-appointments') {
      this.loadMyAppointments();
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

  proceedToBookingModal(doctor: DoctorCard) {
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

  onSelectAppointmentType(t: string): void {
    if (t === 'Follow-up' || t === 'Care Plan Review') {
      return;
    }
    this.appointmentType = t;
  }

  closeBookingModal() {
    this.showBookingModal = false;
    this.selectedDoctor = null;
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
  }

  nextStep() {
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
    if (this.bookingStep === 4 && this.appointmentType === 'Emergency Sync') {
      this.bookingStep = 1;
    } else if (this.bookingStep > 1) {
      this.bookingStep--;
    }
  }

  proceedToPayment() {
    if (!this.selectedDoctor) return;
    const isEmergency = this.appointmentType === 'Emergency Sync';
    if (!isEmergency && (!this.selectedDate || !this.selectedSlot)) return;

    this.bookingInProgress = true;

    const todayStr = this.getTodayDateString();
    const payload = {
      doctorId: this.selectedDoctor._id,
      appointmentDate: isEmergency ? todayStr : (this.selectedDate || todayStr),
      startTime: isEmergency ? 'Immediate Queue' : (this.selectedSlot?.start || '09:00 AM'),
      endTime: isEmergency ? 'Immediate Queue' : (this.selectedSlot?.end || '09:30 AM'),
      type: this.appointmentType,
      symptoms: this.symptoms || (isEmergency ? 'Emergency Triage Request' : '')
    };

    this.appointmentService.bookAppointment(payload).subscribe({
      next: (res) => {
        this.bookingInProgress = false;
        this.closeBookingModal();
        this.openRazorpayCheckout(res);
      },
      error: (err) => {
        this.bookingInProgress = false;
        this.showToast(err.error?.message || 'Booking failed. Please try again.', 'error');
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

  onLogout() {
    this.authService.logout();
    this.router.navigate(['/auth/login']);
  }
}
