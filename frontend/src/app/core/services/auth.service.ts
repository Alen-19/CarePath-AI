import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

export interface User {
  _id: string;
  email: string;
  role: 'patient' | 'doctor' | 'admin';
  patientProfile?: {
    firstName: string;
    lastName: string;
    dateOfBirth?: string;
    gender?: string;
    phone?: string;
    bloodGroup?: string;
  };
  doctorProfile?: {
    firstName: string;
    lastName: string;
    specialization?: string;
    licenseNumber?: string;
    isVerified: boolean;
    experienceYears?: number;
    clinicAddress?: string;
  };
}

interface AuthResponse {
  message: string;
  token: string;
  user: User;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = 'http://localhost:5000/api/auth';
  
  // Use Angular 17/18+ signals for reactive, simple state management
  currentUser = signal<User | null>(null);
  isAuthenticated = computed(() => this.currentUser() !== null);
  userRole = computed(() => this.currentUser()?.role || null);

  constructor(private http: HttpClient) {
    this.loadUserFromStorage();
  }

  private loadUserFromStorage() {
    const token = localStorage.getItem('token');
    const userJson = localStorage.getItem('user');
    if (token && userJson) {
      try {
        this.currentUser.set(JSON.parse(userJson));
      } catch (e) {
        this.logout();
      }
    }
  }

  login(credentials: { email: string; passwordHash: string }): Observable<AuthResponse> {
    // Map passwordHash to password to match backend route
    const payload = {
      email: credentials.email,
      password: credentials.passwordHash
    };
    return this.http.post<AuthResponse>(`${this.apiUrl}/login`, payload).pipe(
      tap(res => this.handleAuthentication(res))
    );
  }

  register(payload: { email: string; password?: string; role: string; profile?: any }): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/register`, payload).pipe(
      tap(res => this.handleAuthentication(res))
    );
  }

  loginWithGoogle(idToken: string, role?: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/google`, { idToken, role }).pipe(
      tap(res => this.handleAuthentication(res))
    );
  }

  completeProfile(payload: { role: string; profile: any }): Observable<AuthResponse> {
    return this.http.put<AuthResponse>(`${this.apiUrl}/complete-profile`, payload).pipe(
      tap(res => this.handleAuthentication(res))
    );
  }

  isProfileComplete(user: User | null): boolean {
    if (!user) return false;
    if (user.role === 'patient') {
      return !!(user.patientProfile && user.patientProfile.phone && user.patientProfile.dateOfBirth);
    }
    if (user.role === 'doctor') {
      return !!(user.doctorProfile && user.doctorProfile.specialization && user.doctorProfile.licenseNumber);
    }
    return true; // admin or other
  }

  private handleAuthentication(res: AuthResponse) {
    if (res && res.token) {
      localStorage.setItem('token', res.token);
      localStorage.setItem('user', JSON.stringify(res.user));
      this.currentUser.set(res.user);
    }
  }

  logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    this.currentUser.set(null);
  }
}
