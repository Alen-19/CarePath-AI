import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { getApiBaseUrl } from '../config/api.config';

export type BiomarkerFlag = 'Normal' | 'Borderline' | 'High' | 'Low' | 'Critical';

export interface Biomarker {
  name: string;
  value: string;
  unit?: string;
  referenceRange?: string;
  flag: BiomarkerFlag;
}

export interface AiReportAnalysis {
  status: 'Pending' | 'Completed' | 'Failed';
  summary: string;
  clinicalImpression: string;
  keyObservations: string[];
  criticalAlerts: string[];
  recommendedSpecialty: string;
  biomarkers: Biomarker[];
}

export interface SharedDoctorInfo {
  _id: string;
  firstName: string;
  lastName: string;
  specialization: string;
  profileImage?: string;
}

export interface LinkedConsultationInfo {
  _id: string;
  appointmentDate: string;
  startTime: string;
  type: string;
  status: string;
  doctorId?: {
    _id?: string;
    firstName?: string;
    lastName?: string;
    specialization?: string;
  };
}

export interface MedicalReport {
  _id: string;
  patientId: any;
  title: string;
  reportType: 'Blood Test' | 'Imaging (X-Ray/MRI/CT)' | 'Pathology' | 'Cardiology (ECG/Echo)' | 'Urine/Renal' | 'Prescription/Discharge' | 'Other';
  reportDate?: string;
  fileUrl: string;
  fileType: string;
  originalFilename: string;
  fileSize: number;
  aiAnalysis: AiReportAnalysis;
  linkedConsultationIds: LinkedConsultationInfo[];
  sharedWithDoctorIds: SharedDoctorInfo[];
  isSharedWithAllConsultingDoctors: boolean;
  createdAt: string;
  updatedAt: string;
}

@Injectable({
  providedIn: 'root'
})
export class ReportService {
  private apiUrl = `${getApiBaseUrl()}/api/reports`;

  constructor(private http: HttpClient) {}

  uploadReport(formData: FormData): Observable<{ success: boolean; message: string; report: MedicalReport }> {
    return this.http.post<{ success: boolean; message: string; report: MedicalReport }>(`${this.apiUrl}/upload`, formData);
  }

  getMyReports(): Observable<{ success: boolean; count: number; reports: MedicalReport[] }> {
    return this.http.get<{ success: boolean; count: number; reports: MedicalReport[] }>(`${this.apiUrl}/my-reports`);
  }

  getReportById(id: string): Observable<{ success: boolean; report: MedicalReport }> {
    return this.http.get<{ success: boolean; report: MedicalReport }>(`${this.apiUrl}/${id}`);
  }

  updateSharing(id: string, payload: { doctorId?: string; action?: 'grant' | 'revoke'; isSharedWithAllConsultingDoctors?: boolean }): Observable<{ success: boolean; message: string; report: MedicalReport }> {
    return this.http.patch<{ success: boolean; message: string; report: MedicalReport }>(`${this.apiUrl}/${id}/share`, payload);
  }

  linkToConsultation(id: string, appointmentId: string): Observable<{ success: boolean; message: string; report: MedicalReport }> {
    return this.http.post<{ success: boolean; message: string; report: MedicalReport }>(`${this.apiUrl}/${id}/link-consultation`, { appointmentId });
  }

  deleteReport(id: string): Observable<{ success: boolean; message: string }> {
    return this.http.delete<{ success: boolean; message: string }>(`${this.apiUrl}/${id}`);
  }

  getPatientReportsForDoctor(patientId: string): Observable<{ success: boolean; count: number; reports: MedicalReport[] }> {
    return this.http.get<{ success: boolean; count: number; reports: MedicalReport[] }>(`${this.apiUrl}/patient/${patientId}`);
  }

  getAppointmentReports(appointmentId: string): Observable<{ success: boolean; count: number; reports: MedicalReport[] }> {
    return this.http.get<{ success: boolean; count: number; reports: MedicalReport[] }>(`${this.apiUrl}/consultation/${appointmentId}`);
  }
}
