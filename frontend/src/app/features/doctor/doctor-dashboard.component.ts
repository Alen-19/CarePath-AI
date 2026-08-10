import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import {
  AppointmentService,
  DoctorScheduleData,
  DaySchedule,
  DoctorDateOverrideData,
  DoctorAppointmentItem
} from '../../core/services/appointment.service';

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

  todayAppointments = [
    { patientName: 'John Doe', age: 42, time: '09:00 AM', type: 'Follow-up', status: 'Completed', symptoms: 'Hypertension, Mild Dizziness' },
    { patientName: 'Demo Patient', age: 31, time: '10:30 AM', type: 'Care Plan Review', status: 'Confirmed', symptoms: 'Blood Pressure Monitoring' },
    { patientName: 'Robert Vance', age: 58, time: '02:00 PM', type: 'Initial Consultation', status: 'Pending', symptoms: 'Chest tightness, Shortness of breath' }
  ];

  activeCarePlans = [
    { patientName: 'Demo Patient', planTitle: 'Hypertension Management Protocol', progress: '75%', nextReview: 'July 31, 2026' },
    { patientName: 'John Doe', planTitle: 'Post-Cardiac Rehab Recovery', progress: '40%', nextReview: 'August 05, 2026' }
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

  // Appointments
  todayApptsList: DoctorAppointmentItem[] = [];
  upcomingApptsList: DoctorAppointmentItem[] = [];
  loadingAppts = false;
  apptTab: 'today' | 'upcoming' = 'today';

  constructor(
    private authService: AuthService,
    private appointmentService: AppointmentService,
    private router: Router
  ) {
    const user = this.authService.currentUser();
    if (user && user.doctorProfile) {
      this.doctorName = `Dr. ${user.doctorProfile.firstName} ${user.doctorProfile.lastName}`.trim();
      this.specialization = user.doctorProfile.specialization || 'General Physician';
      this.licenseNumber = user.doctorProfile.licenseNumber || 'LIC-Pending';
      this.isVerified = user.doctorProfile.isVerified ?? false;
      if (user.doctorProfile.experienceYears) {
        this.experienceYears = user.doctorProfile.experienceYears;
      }
      
      const doc = user.doctorProfile;
      if (doc.clinicName) {
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

  loadDoctorAppointments(): void {
    this.loadingAppts = true;
    this.appointmentService.getDoctorAppointments().subscribe({
      next: (res) => {
        this.todayApptsList = res.today || [];
        this.upcomingApptsList = res.upcoming || [];
        this.loadingAppts = false;
      },
      error: () => { this.loadingAppts = false; }
    });
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

  onLogout(): void {
    this.authService.logout();
    this.router.navigate(['/auth/login']);
  }
}
