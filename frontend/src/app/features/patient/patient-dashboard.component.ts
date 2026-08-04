import { Component, OnInit, NgZone } from '@angular/core';
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
  activeTab: 'find-doctors' | 'my-appointments' = 'find-doctors';

  // ─── Toast ─────────────────────────────────────────────────────────────────
  toastMessage = '';
  toastType: 'success' | 'error' = 'success';

  // ─── Doctor Search ─────────────────────────────────────────────────────────
  doctors: DoctorCard[] = [];
  filteredDoctors: DoctorCard[] = [];
  searchQuery = '';
  loadingDoctors = false;

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

  // ─── Profile Completion State (Option B: Action-based) ────────────────────
  showProfileModal = false;
  savingProfile = false;
  pendingDoctorToBook: DoctorCard | null = null;
  profileForm = {
    phone: '',
    dateOfBirth: '',
    gender: 'Prefer not to say',
    bloodGroup: '',
    address: {
      houseName: '',
      pincode: '',
      city: '',
      district: '',
      state: '',
      country: 'India'
    }
  };

  // Smart Pincode Auto-Lookup State
  localitiesList: string[] = [];
  districtsList: string[] = [];
  postOfficeRecords: Array<{ name: string; district: string; state: string }> = [];
  loadingPincode = false;
  pincodeErrorMsg = '';

  // Validation Touch Trackers & Bounds
  profilePhoneTouched = false;
  profileDobTouched = false;
  maxDobDate = new Date().toISOString().split('T')[0];
  minDobDate = '1900-01-01';

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

  get isProfileModalValid(): boolean {
    return this.isProfilePhoneValid && this.isProfileDobValid;
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
    if (user && user.patientProfile) {
      this.patientName = `${user.patientProfile.firstName} ${user.patientProfile.lastName}`.trim() || 'Patient';
      this.profileForm.phone = user.patientProfile.phone || '';
      if (user.patientProfile.dateOfBirth) {
        this.profileForm.dateOfBirth = new Date(user.patientProfile.dateOfBirth).toISOString().split('T')[0];
      }
      this.profileForm.gender = user.patientProfile.gender || 'Prefer not to say';
      this.profileForm.bloodGroup = user.patientProfile.bloodGroup || '';
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

  isProfileIncomplete(): boolean {
    const user = this.authService.currentUser();
    if (!user || !user.patientProfile) return true;
    return !user.patientProfile.phone || !user.patientProfile.dateOfBirth;
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

  ngOnInit() {
    const today = new Date();
    const max = new Date();
    max.setFullYear(max.getFullYear() + 1);
    this.minDate = today.toISOString().split('T')[0];
    this.maxDate = max.toISOString().split('T')[0];
    this.loadDoctors();
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

  // ─── Tab ───────────────────────────────────────────────────────────────────
  setTab(tab: 'find-doctors' | 'my-appointments') {
    this.activeTab = tab;
    if (tab === 'my-appointments') {
      this.loadMyAppointments();
    }
  }

  // ─── Doctor Search ─────────────────────────────────────────────────────────
  loadDoctors() {
    this.loadingDoctors = true;
    this.appointmentService.getDoctors().subscribe({
      next: (res) => {
        this.doctors = res.doctors;
        this.filteredDoctors = res.doctors;
        this.loadingDoctors = false;
      },
      error: () => {
        this.loadingDoctors = false;
        this.showToast('Failed to load doctors. Please try again.', 'error');
      }
    });
  }

  onSearch() {
    const q = this.searchQuery.toLowerCase().trim();
    if (!q) {
      this.filteredDoctors = this.doctors;
      return;
    }
    this.filteredDoctors = this.doctors.filter(d =>
      `${d.firstName} ${d.lastName}`.toLowerCase().includes(q) ||
      (d.specialization || '').toLowerCase().includes(q) ||
      (d.clinicAddress || '').toLowerCase().includes(q)
    );
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
    if (this.bookingStep === 1 && this.selectedDate && !this.isOffDay) this.bookingStep = 2;
    else if (this.bookingStep === 2 && this.selectedSlot) this.bookingStep = 3;
    else if (this.bookingStep === 3) this.bookingStep = 4;
  }

  prevStep() {
    if (this.bookingStep > 1) this.bookingStep--;
  }

  proceedToPayment() {
    if (!this.selectedDoctor || !this.selectedDate || !this.selectedSlot) return;
    this.bookingInProgress = true;

    const payload = {
      doctorId: this.selectedDoctor._id,
      appointmentDate: this.selectedDate,
      startTime: this.selectedSlot.start,
      endTime: this.selectedSlot.end,
      type: this.appointmentType,
      symptoms: this.symptoms
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

  getTodayDateString(): string {
    const now = new Date();
    // Return YYYY-MM-DD in IST timezone (+5.5 hrs)
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(now.getTime() + istOffset);
    return istDate.toISOString().split('T')[0];
  }

  get todayAppointments(): AppointmentItem[] {
    const today = this.getTodayDateString();
    return this.myAppointments.filter(a =>
      a.appointmentDate === today && ['Confirmed', 'Pending Payment'].includes(a.status)
    );
  }

  isTodayAppt(appt: AppointmentItem): boolean {
    return appt.appointmentDate === this.getTodayDateString();
  }

  get filteredAppointments(): AppointmentItem[] {
    const today = this.getTodayDateString();
    if (this.appointmentFilter === 'today') {
      return this.myAppointments.filter(a =>
        a.appointmentDate === today && ['Confirmed', 'Pending Payment'].includes(a.status)
      );
    } else if (this.appointmentFilter === 'upcoming') {
      return this.myAppointments.filter(a =>
        a.appointmentDate >= today && ['Confirmed', 'Pending Payment'].includes(a.status)
      );
    } else if (this.appointmentFilter === 'past') {
      return this.myAppointments.filter(a =>
        a.appointmentDate < today || a.status === 'Completed' || a.status === 'Cancelled'
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
    const today = new Date().toISOString().split('T')[0];
    return appt.appointmentDate >= today;
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
