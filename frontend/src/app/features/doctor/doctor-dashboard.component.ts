import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-doctor-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
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

  // Mock clinical data for initial module presentation
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

  constructor(
    private authService: AuthService,
    private router: Router
  ) {
    const user = this.authService.currentUser();
    if (user && user.doctorProfile) {
      this.doctorName = `Dr. ${user.doctorProfile.firstName} ${user.doctorProfile.lastName}`.trim();
      this.specialization = user.doctorProfile.specialization || 'General Physician';
      this.licenseNumber = user.doctorProfile.licenseNumber || 'LIC-Pending';
      this.isVerified = user.doctorProfile.isVerified ?? true;
      if (user.doctorProfile.experienceYears) {
        this.experienceYears = user.doctorProfile.experienceYears;
      }
      if (user.doctorProfile.clinicAddress) {
        this.clinicAddress = user.doctorProfile.clinicAddress;
      }
    }
  }

  ngOnInit(): void {}

  onLogout(): void {
    this.authService.logout();
    this.router.navigate(['/auth/login']);
  }
}
