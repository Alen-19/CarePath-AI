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
  clinicName = '';

  // Address Fields
  address = {
    houseName: '',
    pincode: '',
    city: '',
    district: '',
    state: '',
    country: 'India',
    latitude: null as number | null,
    longitude: null as number | null
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

  get isClinicNameValid(): boolean {
    if (!this.clinicName.trim()) return true;
    return this.clinicName.trim().length >= 2;
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
    const queryParts = [selectedCity, this.address.district, this.address.state, this.address.pincode, 'India'].filter(Boolean);
    const query = queryParts.join(', ');
    this.geocodeCoordinates(query);
  }

  geocodeCoordinates(queryStr: string) {
    fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(queryStr)}&format=json&limit=1`)
      .then(res => res.json())
      .then(data => {
        if (data && data.length > 0) {
          this.address.latitude = parseFloat(data[0].lat);
          this.address.longitude = parseFloat(data[0].lon);
        }
      })
      .catch(() => {});
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
            country: user.patientProfile.address.country || 'India',
            latitude: (user.patientProfile.address as any).latitude || null,
            longitude: (user.patientProfile.address as any).longitude || null
          };
          if (user.patientProfile.address.pincode) {
            this.fetchPincodeDetails(user.patientProfile.address.pincode);
          }
        }
      } else if (user.role === 'doctor' && user.doctorProfile) {
        this.specialization = user.doctorProfile.specialization || '';
        this.experienceYears = user.doctorProfile.experienceYears || null;
        this.licenseNumber = user.doctorProfile.licenseNumber || '';
        this.clinicName = user.doctorProfile.clinicName || '';

        const cAddr = user.doctorProfile.clinicAddress as any;
        if (typeof cAddr === 'object' && cAddr !== null) {
          this.address = {
            houseName: '',
            pincode: cAddr.pincode || '',
            city: cAddr.city || '',
            district: cAddr.district || '',
            state: cAddr.state || '',
            country: cAddr.country || 'India',
            latitude: cAddr.latitude || null,
            longitude: cAddr.longitude || null
          };
          if (cAddr.pincode) {
            this.fetchPincodeDetails(cAddr.pincode);
          }
        }
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

      if (!this.specialization.trim()) {
        this.errorMessage = 'Please select a Doctor Specialization.';
        return;
      }

      if (!this.isLicenseNumberValid) {
        this.errorMessage = 'Please enter a valid Medical License Number (between 4 and 35 alphanumeric characters, e.g. KMC-12345). Dummy numbers like 000 are not allowed.';
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
      profilePayload.clinicName = this.clinicName.trim();
      profilePayload.clinicAddress = {
        city: this.address.city.trim(),
        district: this.address.district.trim(),
        state: this.address.state.trim(),
        pincode: this.address.pincode.trim(),
        country: this.address.country.trim() || 'India',
        latitude: this.address.latitude,
        longitude: this.address.longitude
      };
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
