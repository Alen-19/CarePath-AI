import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-complete-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './complete-profile.component.html',
  styleUrls: ['./complete-profile.component.css']
})
export class CompleteProfileComponent implements OnInit {
  role: 'patient' | 'doctor' = 'patient';
  roleSelected = false;

  // Profile Fields
  firstName = '';
  lastName = '';

  // Patient Specific
  dateOfBirth = '';
  gender = 'Prefer not to say';
  phone = '';
  bloodGroup = '';

  // Doctor Specific
  specialization = '';
  experienceYears: number | null = null;
  licenseNumber = '';
  clinicAddress = '';

  errorMessage = '';
  successMessage = '';
  isLoading = false;

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit() {
    const user = this.authService.currentUser();
    if (user) {
      this.role = user.role === 'admin' ? 'patient' : user.role;
      // Pre-fill names from Google if available
      const profile = user.role === 'patient' ? user.patientProfile : user.doctorProfile;
      this.firstName = profile?.firstName || '';
      this.lastName = profile?.lastName || '';
      
      // If the user already had profile fields filled, pre-fill them
      if (user.role === 'patient' && user.patientProfile) {
        this.dateOfBirth = user.patientProfile.dateOfBirth ? new Date(user.patientProfile.dateOfBirth).toISOString().split('T')[0] : '';
        this.gender = user.patientProfile.gender || 'Prefer not to say';
        this.phone = user.patientProfile.phone || '';
        this.bloodGroup = user.patientProfile.bloodGroup || '';
      } else if (user.role === 'doctor' && user.doctorProfile) {
        this.specialization = user.doctorProfile.specialization || '';
        this.experienceYears = user.doctorProfile.experienceYears || null;
        this.licenseNumber = user.doctorProfile.licenseNumber || '';
        this.clinicAddress = user.doctorProfile.clinicAddress || '';
      }
    }
  }

  selectRole(chosenRole: 'patient' | 'doctor') {
    this.role = chosenRole;
    this.roleSelected = true;
  }

  onSubmit() {
    if (!this.firstName || !this.lastName) {
      this.errorMessage = 'First and Last name are required.';
      return;
    }

    if (this.role === 'doctor' && (!this.specialization || !this.licenseNumber)) {
      this.errorMessage = 'Specialization and Medical License are required for Doctors.';
      return;
    }

    if (this.role === 'patient' && (!this.dateOfBirth || !this.phone)) {
      this.errorMessage = 'Date of Birth and Phone Number are required for Patients.';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';

    const profilePayload: any = {
      firstName: this.firstName,
      lastName: this.lastName
    };

    if (this.role === 'patient') {
      profilePayload.dateOfBirth = this.dateOfBirth;
      profilePayload.gender = this.gender;
      profilePayload.phone = this.phone;
      profilePayload.bloodGroup = this.bloodGroup;
    } else {
      profilePayload.specialization = this.specialization;
      profilePayload.experienceYears = this.experienceYears || 0;
      profilePayload.licenseNumber = this.licenseNumber;
      profilePayload.clinicAddress = this.clinicAddress;
    }

    this.authService.completeProfile({
      role: this.role,
      profile: profilePayload
    }).subscribe({
      next: (res) => {
        this.isLoading = false;
        this.successMessage = 'Profile completed successfully! Redirecting...';
        setTimeout(() => {
          if (res.user.role === 'patient') {
            this.router.navigate(['/patient']);
          } else if (res.user.role === 'doctor') {
            this.router.navigate(['/doctor']);
          } else {
            this.router.navigate(['/']);
          }
        }, 1500);
      },
      error: (err) => {
        this.isLoading = false;
        this.errorMessage = err.error?.message || 'Failed to complete profile. Please try again.';
      }
    });
  }
}
