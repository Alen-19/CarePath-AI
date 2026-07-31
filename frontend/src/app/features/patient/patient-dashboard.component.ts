import { Component, OnInit, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
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

  constructor(
    private authService: AuthService,
    private appointmentService: AppointmentService,
    private router: Router,
    private ngZone: NgZone
  ) {
    const user = this.authService.currentUser();
    if (user && user.patientProfile) {
      this.patientName = `${user.patientProfile.firstName} ${user.patientProfile.lastName}`;
    } else {
      this.patientName = 'Patient';
    }
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
