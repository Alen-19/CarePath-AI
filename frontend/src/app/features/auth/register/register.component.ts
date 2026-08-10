import { Component, AfterViewInit, NgZone, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../../core/services/auth.service';

declare var google: any;

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.css']
})
export class RegisterComponent implements AfterViewInit {
  email = '';
  password = '';
  confirmPassword = '';
  role: 'patient' | 'doctor' = 'patient';
  
  // Profile Fields
  firstName = '';
  lastName = '';
  
  // Patient specific profile
  phone = '';
  bloodGroup = '';
  dateOfBirth = '';
  gender = 'Prefer not to say';

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
  districtsList: string[] = [];
  postOfficeRecords: Array<{ name: string; district: string; state: string }> = [];
  loadingPincode = false;
  pincodeErrorMsg = '';

  // Doctor specific profile
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
  licenseNumber = '';
  clinicName = '';
  experienceYears: number | null = null;
  clinicAddress = '';

  errorMessage = '';
  successMessage = '';
  isLoading = false;

  // Live Validation Touch Flags
  firstNameTouched = false;
  lastNameTouched = false;
  emailTouched = false;
  passwordTouched = false;
  confirmPasswordTouched = false;
  specializationTouched = false;
  licenseNumberTouched = false;
  phoneTouched = false;
  experienceYearsTouched = false;

  // Live Validation Getters
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

  get isEmailValid(): boolean {
    if (!this.email.trim()) return false;
    const strictEmailRegex = /^(?=[a-zA-Z0-9._-]{6,64}@)[a-zA-Z0-9]+(?:[._-][a-zA-Z0-9]+)*@[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*(?:\.[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*)*\.[a-zA-Z]{2,}$/;
    return strictEmailRegex.test(this.email.trim());
  }

  get hasMinLength(): boolean {
    return this.password.length >= 8;
  }

  get hasLetterAndNumber(): boolean {
    return /[A-Za-z]/.test(this.password) && /\d/.test(this.password);
  }

  get isPasswordValid(): boolean {
    return this.hasMinLength && this.hasLetterAndNumber;
  }

  get isConfirmPasswordValid(): boolean {
    return this.confirmPassword.length > 0 && this.confirmPassword === this.password;
  }

  clinicAddressTouched = false;

  get isPhoneValid(): boolean {
    if (!this.phone.trim()) return true; // Phone is optional
    return /^(?:\+?91[\s\-]?)?[6-9]\d{9}$/.test(this.phone.trim());
  }

  get isExperienceValid(): boolean {
    if (this.experienceYears === null || this.experienceYears === undefined || (this.experienceYears as any) === '') return true;
    return this.experienceYears >= 0 && this.experienceYears <= 60;
  }

  get isLicenseNumberValid(): boolean {
    if (this.role !== 'doctor') return true;
    const clean = this.licenseNumber.trim();
    if (clean.length < 4 || clean.length > 35) return false;
    if (/^(.)\1+$/.test(clean)) return false; // Block single repeating chars like "000", "1111"
    const licenseRegex = /^[a-zA-Z0-9]+(?:[\/\-][a-zA-Z0-9]+)*$/;
    return licenseRegex.test(clean);
  }

  get isClinicNameValid(): boolean {
    if (!this.clinicName.trim()) return true;
    return this.clinicName.trim().length >= 2;
  }

  get isDoctorValid(): boolean {
    if (this.role !== 'doctor') return true;
    return this.specialization.trim().length >= 2 &&
           this.isLicenseNumberValid;
  }

  get isFormValid(): boolean {
    return this.isFirstNameValid &&
           this.isLastNameValid &&
           this.isEmailValid &&
           this.isPasswordValid &&
           this.isConfirmPasswordValid &&
           this.isPhoneValid &&
           this.isDoctorValid &&
           this.isExperienceValid;
  }

  constructor(
    private authService: AuthService,
    private http: HttpClient,
    private router: Router,
    private route: ActivatedRoute,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef
  ) {
    // Get pre-selected role from query parameters if provided
    const queryRole = this.route.snapshot.queryParams['role'];
    if (queryRole === 'doctor' || queryRole === 'patient') {
      this.role = queryRole;
    }

    // Redirect if already logged in
    if (this.authService.isAuthenticated()) {
      this.redirectUser(this.authService.userRole());
    }
  }

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
        this.cdr.detectChanges();
      },
      error: () => {
        this.loadingPincode = false;
        this.pincodeErrorMsg = 'Failed to fetch pincode details.';
        this.cdr.detectChanges();
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

  ngAfterViewInit() {
    this.initializeGoogleSignIn();
  }

  initializeGoogleSignIn() {
    const renderGoogleBtn = () => {
      if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
        const btnContainer = document.getElementById('googleBtnRegister');
        if (btnContainer) {
          google.accounts.id.initialize({
            client_id: '823212847150-alqfjevhndr4koevhv7thk851oikggch.apps.googleusercontent.com',
            callback: (response: any) => this.handleGoogleCredential(response.credential)
          });
          google.accounts.id.renderButton(
            btnContainer,
            { theme: 'outline', size: 'large', type: 'standard', width: 470 }
          );
        }
      } else {
        // Script is still loading asynchronously, retry in 100ms
        setTimeout(renderGoogleBtn, 100);
      }
    };

    renderGoogleBtn();
  }

  isPendingApproval = false;

  handleGoogleCredential(credential: string) {
    this.ngZone.run(() => {
      this.isLoading = true;
      this.errorMessage = '';
      this.successMessage = '';

      // Register with Google sends the chosen role to backend
      this.authService.loginWithGoogle(credential, this.role).subscribe({
        next: (res) => {
          this.isLoading = false;
          if (!res.token && res.user?.role === 'doctor') {
            this.isPendingApproval = true;
            this.successMessage = res.message || 'Your doctor account is pending administrator verification.';
          } else {
            this.successMessage = 'Google Sign-In successful!';
            setTimeout(() => {
              this.redirectUser(res.user.role);
            }, 1000);
          }
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.isLoading = false;
          this.errorMessage = err.error?.message || 'Google authentication failed.';
          this.cdr.detectChanges();
        }
      });
    });
  }

  onSubmit() {
    this.errorMessage = '';
    this.successMessage = '';

    const cleanEmail = this.email.trim();
    const cleanFirstName = this.firstName.trim();
    const cleanLastName = this.lastName.trim();

    if (!cleanFirstName || !cleanLastName || !cleanEmail || !this.password) {
      this.errorMessage = 'Please fill out all required fields marked with *';
      return;
    }

    if (!this.isFirstNameValid) {
      this.errorMessage = 'First name must contain only letters (at least 2 characters, e.g. John).';
      return;
    }

    if (!this.isLastNameValid) {
      this.errorMessage = 'Last name must contain only letters (at least 2 characters, e.g. Doe).';
      return;
    }

    // 1. Strict Email Format Validation
    const strictEmailRegex = /^(?=[a-zA-Z0-9._-]{6,64}@)[a-zA-Z0-9]+(?:[._-][a-zA-Z0-9]+)*@[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*(?:\.[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*)*\.[a-zA-Z]{2,}$/;
    if (!strictEmailRegex.test(cleanEmail)) {
      this.errorMessage = 'Please enter a valid email address (e.g. name@domain.com).';
      return;
    }

    // 2. Password Strength Validation (Min 8 chars, at least 1 letter & 1 number)
    const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*#?&]{8,}$/;
    if (!passwordRegex.test(this.password)) {
      this.errorMessage = 'Password must be at least 8 characters long and contain both letters and numbers.';
      return;
    }

    // 3. Confirm Password Match
    if (this.password !== this.confirmPassword) {
      this.errorMessage = 'Passwords do not match.';
      return;
    }

    // 4. Role-specific validations
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
    } else if (this.role === 'patient' && this.phone.trim()) {
      const phoneRegex = /^(?:\+?91[\s\-]?)?[6-9]\d{9}$/;
      if (!phoneRegex.test(this.phone.trim())) {
        this.errorMessage = 'Please enter a valid 10-digit Indian phone number (e.g. 9876543210 or +91 9876543210).';
        return;
      }
    }

    this.isLoading = true;

    // Build profile sub-document dynamically
    const profile: any = {
      firstName: cleanFirstName,
      lastName: cleanLastName
    };

    if (this.role === 'patient') {
      profile.phone = this.phone.trim();
      profile.bloodGroup = this.bloodGroup;
      profile.gender = this.gender;
      if (this.dateOfBirth) {
        profile.dateOfBirth = this.dateOfBirth;
      }
      profile.address = {
        houseName: this.address.houseName.trim(),
        pincode: this.address.pincode.trim(),
        city: this.address.city.trim(),
        district: this.address.district.trim(),
        state: this.address.state.trim(),
        country: this.address.country.trim() || 'India'
      };
    } else {
      profile.specialization = this.specialization.trim();
      profile.licenseNumber = this.licenseNumber.trim();
      profile.experienceYears = this.experienceYears || 0;
      profile.clinicName = this.clinicName.trim();
      profile.clinicAddress = {
        city: this.address.city.trim(),
        district: this.address.district.trim(),
        state: this.address.state.trim(),
        pincode: this.address.pincode.trim(),
        country: this.address.country.trim() || 'India'
      };
    }

    this.authService.register({
      email: cleanEmail,
      password: this.password,
      role: this.role,
      profile
    }).subscribe({
      next: (res) => {
        this.isLoading = false;
        if (!res.token) {
          this.isPendingApproval = true;
          this.successMessage = res.message || 'Your doctor account is pending administrator verification.';
        } else {
          this.successMessage = 'Registration successful! Redirecting...';
          setTimeout(() => {
            this.redirectUser(res.user.role);
          }, 1000);
        }
      },
      error: (err) => {
        this.isLoading = false;
        this.errorMessage = err.error?.message || 'Registration failed. Please try again.';
      }
    });
  }

  private redirectUser(userOrRole: any) {
    const user = typeof userOrRole === 'object' && userOrRole !== null ? userOrRole : this.authService.currentUser();
    const role = typeof userOrRole === 'string' ? userOrRole : user?.role;

    if (user && !this.authService.isProfileComplete(user)) {
      this.router.navigate(['/auth/complete-profile']);
      return;
    }

    if (role === 'patient') {
      this.router.navigate(['/patient']);
    } else if (role === 'doctor') {
      this.router.navigate(['/doctor']);
    } else if (role === 'admin') {
      this.router.navigate(['/admin']);
    } else {
      this.router.navigate(['/']);
    }
  }
}
