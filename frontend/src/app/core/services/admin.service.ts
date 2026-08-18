import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface DoctorVerificationItem {
  _id: string;
  userId?: {
    _id: string;
    email: string;
    isActive: boolean;
    createdAt?: string;
  };
  firstName: string;
  lastName: string;
  specialization: string;
  licenseNumber: string;
  experienceYears?: number;
  clinicAddress?: string;
  isVerified: boolean;
  status?: 'pending' | 'approved' | 'suspended' | 'rejected';
  suspensionReason?: string;
  suspendedAt?: string;
  rating?: number;
  createdAt?: string;
}

export interface PatientAdminItem {
  _id: string;
  userId?: {
    _id: string;
    email: string;
    isActive: boolean;
    createdAt?: string;
  };
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  gender?: string;
  phone?: string;
  bloodGroup?: string;
  emergencyContact?: {
    name?: string;
    phone?: string;
    relation?: string;
  };
  address?: {
    houseName?: string;
    city?: string;
    district?: string;
    state?: string;
    pincode?: string;
  };
  addressDisplay?: string;
  profileImage?: string;
  createdAt?: string;
}

export interface AdminStats {
  totalDoctors: number;
  pendingVerifications: number;
  approvedDoctors: number;
  suspendedDoctors?: number;
  rejectedDoctors?: number;
  totalPatients: number;
}

interface StatsResponse {
  success: boolean;
  stats: AdminStats;
}

interface DoctorsResponse {
  success: boolean;
  count: number;
  doctors: DoctorVerificationItem[];
}

interface PatientsResponse {
  success: boolean;
  count: number;
  patients: PatientAdminItem[];
}

interface ActionResponse {
  success: boolean;
  message: string;
  doctor: DoctorVerificationItem;
}

@Injectable({
  providedIn: 'root'
})
export class AdminService {
  private apiUrl = 'http://localhost:5000/api/admin';

  constructor(private http: HttpClient) {}

  getStats(): Observable<StatsResponse> {
    return this.http.get<StatsResponse>(`${this.apiUrl}/stats`);
  }

  getPatients(): Observable<PatientsResponse> {
    return this.http.get<PatientsResponse>(`${this.apiUrl}/patients`);
  }

  getDoctorRequests(status?: 'pending' | 'approved' | 'suspended' | 'rejected' | 'all'): Observable<DoctorsResponse> {
    const url = status && status !== 'all' ? `${this.apiUrl}/doctors?status=${status}` : `${this.apiUrl}/doctors`;
    return this.http.get<DoctorsResponse>(url);
  }

  approveDoctor(doctorId: string): Observable<ActionResponse> {
    return this.http.put<ActionResponse>(`${this.apiUrl}/doctors/${doctorId}/approve`, {});
  }

  rejectDoctor(doctorId: string): Observable<ActionResponse> {
    return this.http.put<ActionResponse>(`${this.apiUrl}/doctors/${doctorId}/reject`, {});
  }

  suspendDoctor(doctorId: string, reason: string): Observable<ActionResponse> {
    return this.http.put<ActionResponse>(`${this.apiUrl}/doctors/${doctorId}/suspend`, { reason });
  }

  unsuspendDoctor(doctorId: string): Observable<ActionResponse> {
    return this.http.put<ActionResponse>(`${this.apiUrl}/doctors/${doctorId}/unsuspend`, {});
  }
}
