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
  rating?: number;
  createdAt?: string;
}

export interface AdminStats {
  totalDoctors: number;
  pendingVerifications: number;
  approvedDoctors: number;
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

  getDoctorRequests(status?: 'pending' | 'approved' | 'all'): Observable<DoctorsResponse> {
    const url = status && status !== 'all' ? `${this.apiUrl}/doctors?status=${status}` : `${this.apiUrl}/doctors`;
    return this.http.get<DoctorsResponse>(url);
  }

  approveDoctor(doctorId: string): Observable<ActionResponse> {
    return this.http.put<ActionResponse>(`${this.apiUrl}/doctors/${doctorId}/approve`, {});
  }

  rejectDoctor(doctorId: string): Observable<ActionResponse> {
    return this.http.put<ActionResponse>(`${this.apiUrl}/doctors/${doctorId}/reject`, {});
  }
}
