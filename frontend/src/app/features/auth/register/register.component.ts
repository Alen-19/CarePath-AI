import { Component, AfterViewInit, NgZone, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
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
    return this.firstName.trim().length >= 2;
  }

  get isLastNameValid(): boolean {
    return this.lastName.trim().length >= 2;
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

  get isPhoneValid(): boolean {
    if (!this.phone.trim()) return true; // Phone is optional
    return /^(?:\+?91[\s\-]?)?[6-9]\d{9}$/.test(this.phone.trim());
  }

  get isExperienceValid(): boolean {
    if (this.experienceYears === null || this.experienceYears === undefined || (this.experienceYears as any) === '') return true;
    return this.experienceYears >= 0 && this.experienceYears <= 60;
  }

  get isDoctorValid(): boolean {
    if (this.role !== 'doctor') return true;
    return this.specialization.trim().length >= 2 && this.licenseNumber.trim().length >= 3;
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
      if (!this.specialization.trim() || !this.licenseNumber.trim()) {
        this.errorMessage = 'Doctors must provide both Specialization and Medical License Number.';
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
    } else {
      profile.specialization = this.specialization.trim();
      profile.licenseNumber = this.licenseNumber.trim();
      profile.experienceYears = this.experienceYears || 0;
      profile.clinicAddress = this.clinicAddress.trim();
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

  private redirectUser(role: 'patient' | 'doctor' | 'admin' | null) {
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
