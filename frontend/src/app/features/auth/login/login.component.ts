import { Component, AfterViewInit, NgZone, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

declare var google: any;

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent implements AfterViewInit {
  email = '';
  password = '';
  role: 'patient' | 'doctor' = 'patient';
  errorMessage = '';
  successMessage = '';
  isLoading = false;
  returnUrl = '';

  // Live Validation Touch Flags
  emailTouched = false;
  passwordTouched = false;

  get isEmailValid(): boolean {
    if (!this.email.trim()) return false;
    const strictEmailRegex = /^(?=[a-zA-Z0-9._-]{6,64}@)[a-zA-Z0-9]+(?:[._-][a-zA-Z0-9]+)*@[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*(?:\.[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*)*\.[a-zA-Z]{2,}$/;
    return strictEmailRegex.test(this.email.trim());
  }

  get isPasswordValid(): boolean {
    return this.password.length >= 6;
  }

  constructor(
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef
  ) {
    // Get return url from route parameters or default to '/'
    this.returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/';

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
        const btnContainer = document.getElementById('googleBtn');
        if (btnContainer) {
          google.accounts.id.initialize({
            client_id: '823212847150-alqfjevhndr4koevhv7thk851oikggch.apps.googleusercontent.com',
            callback: (response: any) => this.handleGoogleCredential(response.credential)
          });
          google.accounts.id.renderButton(
            btnContainer,
            { theme: 'outline', size: 'large', type: 'standard', width: 390 }
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
  pendingApprovalMessage = '';

  handleGoogleCredential(credential: string) {
    this.ngZone.run(() => {
      this.isLoading = true;
      this.errorMessage = '';
      this.successMessage = '';
      this.isPendingApproval = false;

      this.authService.loginWithGoogle(credential, this.role).subscribe({
        next: (res) => {
          this.isLoading = false;
          this.successMessage = 'Google login successful!';
          this.cdr.detectChanges();
          setTimeout(() => {
            this.redirectUser(res.user.role);
          }, 1000);
        },
        error: (err) => {
          this.isLoading = false;
          if (err.status === 403) {
            const msg = err.error?.message || 'Your doctor account is pending administrator verification.';
            this.isPendingApproval = true;
            this.pendingApprovalMessage = msg;
          } else {
            this.errorMessage = err.error?.message || 'Google authentication failed.';
          }
          this.cdr.detectChanges();
        }
      });
    });
  }

  onSubmit() {
    this.errorMessage = '';
    this.successMessage = '';
    this.isPendingApproval = false;

    const cleanEmail = this.email.trim();
    if (!cleanEmail || !this.password) {
      this.errorMessage = 'Please enter both email and password.';
      return;
    }

    const strictEmailRegex = /^(?=[a-zA-Z0-9._-]{6,64}@)[a-zA-Z0-9]+(?:[._-][a-zA-Z0-9]+)*@[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*(?:\.[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*)*\.[a-zA-Z]{2,}$/;
    if (!strictEmailRegex.test(cleanEmail)) {
      this.errorMessage = 'Please enter a valid email address.';
      return;
    }

    if (this.password.length < 6) {
      this.errorMessage = 'Password must be at least 6 characters long.';
      return;
    }

    this.isLoading = true;

    this.authService.login({ email: cleanEmail, passwordHash: this.password }).subscribe({
      next: (res) => {
        this.isLoading = false;
        this.successMessage = 'Login successful! Redirecting...';
        setTimeout(() => {
          this.redirectUser(res.user.role);
        }, 1000);
      },
      error: (err) => {
        this.isLoading = false;
        if (err.status === 403) {
          const msg = err.error?.message || 'Your doctor account is pending administrator verification.';
          if (this.role === 'doctor' || msg.toLowerCase().includes('doctor') || msg.toLowerCase().includes('pending') || msg.toLowerCase().includes('verification')) {
            this.isPendingApproval = true;
            this.pendingApprovalMessage = msg;
          } else {
            this.errorMessage = msg;
          }
        } else {
          this.errorMessage = err.error?.message || 'Login failed. Please check your credentials.';
        }
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
