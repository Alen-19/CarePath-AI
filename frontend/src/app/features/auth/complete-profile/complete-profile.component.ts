import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
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
  experienceYears: number | null = null;
  licenseNumber = '';
  clinicAddress = '';

  // Address Fields
  address = {
    houseName: '',
    pincode: '',
    city: '',
    district: '',
    state: '',
    country: 'India'
  };

  // Pincode Lookup State
  localitiesList: string[] = [];
  loadingPincode = false;
  pincodeErrorMsg = '';

  errorMessage = '';
  successMessage = '';
  isLoading = false;
  isPendingApproval = false;

  // Validation Touch Flags & Bounds
  firstNameTouched = false;
  lastNameTouched = false;
  phoneTouched = false;
  licenseNumberTouched = false;
  clinicAddressTouched = false;
  experienceYearsTouched = false;
  maxDobDate = new Date().toISOString().split('T')[0];

  get isFirstNameValid(): boolean {
    const clean = this.firstName.trim();
    if (clean.length < 2 || clean.length > 50) return false;
    const nameRegex = /^[a-zA-Z]+(?:[\s'\.\-][a-zA-Z]+)*$/;
    return nameRegex.test(clean);
  }

  get isLastNameValid(): boolean {
    const clean = this.lastName.trim();
    if (clean.length < 2 || clean.length > 50) return false;
    const nameRegex = /^[a-zA-Z]+(?:[\s'\.\-][a-zA-Z]+)*$/;
    return nameRegex.test(clean);
  }

  get isLicenseNumberValid(): boolean {
    if (this.role !== 'doctor') return true;
    const clean = this.licenseNumber.trim();
    if (clean.length < 4 || clean.length > 35) return false;
    if (/^(.)\1+$/.test(clean)) return false;
    const licenseRegex = /^[a-zA-Z0-9]+(?:[\/\-][a-zA-Z0-9]+)*$/;
    return licenseRegex.test(clean);
  }

  get isClinicAddressValid(): boolean {
    if (!this.clinicAddress.trim()) return true;
    const clean = this.clinicAddress.trim();
    if (clean.length < 8 || clean.length > 250) return false;
    if ((clean.match(/[a-zA-Z]/g) || []).length < 3) return false;
    if (/^(.)\1+$/.test(clean)) return false;
    return true;
  }

  get isPhoneValid(): boolean {
    if (!this.phone.trim()) return true;
    const phoneRegex = /^(?:\+?91[\s\-]?)?[6-9]\d{9}$/;
    return phoneRegex.test(this.phone.trim());
  }

  get isExperienceValid(): boolean {
    if (this.experienceYears === null || this.experienceYears === undefined || (this.experienceYears as any) === '') return true;
    return this.experienceYears >= 0 && this.experienceYears <= 60;
  }

  constructor(
    private authService: AuthService,
    private http: HttpClient,
    private router: Router
  ) {}

  districtsList: string[] = [];
  postOfficeRecords: Array<{ name: string; district: string; state: string }> = [];

  onPincodeInput() {
    const cleanPin = (this.address.pincode || '').trim();
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

          this.localitiesList = Array.from(new Set(this.postOfficeRecords.map(r => r.name)));
          this.districtsList = Array.from(new Set(this.postOfficeRecords.map(r => r.district)));

          let targetCity = this.address.city;
          if (!targetCity || !this.localitiesList.includes(targetCity)) {
            targetCity = this.localitiesList[0] || '';
            this.address.city = targetCity;
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
        this.pincodeErrorMsg = 'Failed to fetch pincode details.';
      }
    });
  }

  onLocalitySelect(selectedCity: string) {
    this.address.city = selectedCity;
    const match = this.postOfficeRecords.find(r => r.name === selectedCity);
    if (match) {
      this.address.district = match.district;
      this.address.state = match.state;
      this.address.country = 'India';
    }
  }

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
        if (user.patientProfile.address) {
          this.address = {
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
      } else if (user.role === 'doctor' && user.doctorProfile) {
        this.specialization = user.doctorProfile.specialization || '';
        this.experienceYears = user.doctorProfile.experienceYears || null;
        this.licenseNumber = user.doctorProfile.licenseNumber || '';
        this.clinicAddress = user.doctorProfile.clinicAddress || '';
      }
    }
  }

  onSubmit() {
    this.firstNameTouched = true;
    this.lastNameTouched = true;

    if (!this.isFirstNameValid) {
      this.errorMessage = 'First name must contain only letters (at least 2 characters, e.g. John).';
      return;
    }

    if (!this.isLastNameValid) {
      this.errorMessage = 'Last name must contain only letters (at least 2 characters, e.g. Doe).';
      return;
    }

    if (this.role === 'doctor') {
      this.licenseNumberTouched = true;
      this.clinicAddressTouched = true;

      if (!this.specialization.trim()) {
        this.errorMessage = 'Please select a Doctor Specialization.';
        return;
      }

      if (!this.isLicenseNumberValid) {
        this.errorMessage = 'Please enter a valid Medical License Number (between 4 and 35 alphanumeric characters, e.g. KMC-12345). Dummy numbers like 000 are not allowed.';
        return;
      }

      if (this.clinicAddress.trim() && !this.isClinicAddressValid) {
        this.errorMessage = 'Please enter a valid Clinic/Hospital Address (at least 8 characters long containing street or clinic name). Dummy entries like 00000000 are not allowed.';
        return;
      }

      if (!this.isExperienceValid) {
        this.errorMessage = 'Years of experience must be a number between 0 and 60.';
        return;
      }
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
      profilePayload.address = this.address;
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
        if (res.user.role === 'doctor' && !res.user.doctorProfile?.isVerified) {
          this.authService.logout(); // Clear temporary token until admin approves
          this.isPendingApproval = true;
          this.successMessage = 'Profile completed successfully! Your doctor account has been submitted for administrator verification.';
        } else {
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
        }
      },
      error: (err) => {
        this.isLoading = false;
        this.errorMessage = err.error?.message || 'Failed to complete profile. Please try again.';
      }
    });
  }
}
