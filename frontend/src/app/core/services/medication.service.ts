import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface MedicationDoseItem {
  medicineId: string;
  prescriptionId: string;
  appointmentId?: string;
  medicineName: string;
  composition: string[];
  dosage: string;
  duration: string;
  instructions: string;
  doctorId: string;
  doctorName: string;
  specialty: string;
  dayCurrent: number;
  daysTotal: number;
  daysRemaining: number;
  slot: 'Morning' | 'Afternoon' | 'Night';
  isTaken: boolean;
  takenAt: string | null;
}

export interface DoctorMedFilterItem {
  doctorId: string;
  doctorName: string;
  specialty: string;
}

export interface MedicationScheduleResponse {
  success: boolean;
  date: string;
  schedule: {
    morning: MedicationDoseItem[];
    afternoon: MedicationDoseItem[];
    night: MedicationDoseItem[];
  };
  stats: {
    totalDosesToday: number;
    takenDosesToday: number;
    compliancePct: number;
  };
  doctors: DoctorMedFilterItem[];
}

@Injectable({
  providedIn: 'root'
})
export class MedicationService {
  private apiUrl = 'http://localhost:5000/api/medications';

  constructor(private http: HttpClient) {}

  getActiveMedicationSchedule(): Observable<MedicationScheduleResponse> {
    return this.http.get<MedicationScheduleResponse>(`${this.apiUrl}/active-schedule`);
  }

  toggleDoseStatus(payload: {
    medicineName: string;
    slot: 'Morning' | 'Afternoon' | 'Night';
    prescriptionId?: string;
    appointmentId?: string;
    isTaken?: boolean;
  }): Observable<{ success: boolean; message: string; log: any }> {
    return this.http.post<{ success: boolean; message: string; log: any }>(
      `${this.apiUrl}/toggle-dose`,
      payload
    );
  }

  sendTestMorningDigest(): Observable<{ success: boolean; message: string }> {
    return this.http.post<{ success: boolean; message: string }>(
      `${this.apiUrl}/send-test-digest`,
      {}
    );
  }
}
