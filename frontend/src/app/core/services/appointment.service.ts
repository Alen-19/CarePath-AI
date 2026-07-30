import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface DaySchedule {
  dayOfWeek: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';
  isWorkingDay: boolean;
  session1Start: string;
  session1End: string;
  hasSecondSession: boolean;
  session2Start: string;
  session2End: string;
}

export interface DoctorScheduleData {
  _id?: string;
  doctorId?: string;
  consultationFee: number;
  slotDurationMinutes: number;
  weeklySchedule: DaySchedule[];
}

export interface DoctorDateOverrideData {
  _id?: string;
  doctorId?: string;
  date: string; // YYYY-MM-DD
  isOffDay: boolean;
  session1Start?: string;
  session1End?: string;
  hasSecondSession?: boolean;
  session2Start?: string;
  session2End?: string;
  reason?: string;
}

export interface AvailableSlotItem {
  startTime: string;
  endTime: string;
  timeLabel: string;
  isBooked: boolean;
}

export interface AvailableSlotsResponse {
  success: boolean;
  date: string;
  isOffDay: boolean;
  reason?: string;
  consultationFee: number;
  slotDurationMinutes?: number;
  slots: AvailableSlotItem[];
}

export interface ScheduleResponse {
  success: boolean;
  schedule: DoctorScheduleData;
  overrides: DoctorDateOverrideData[];
}

@Injectable({
  providedIn: 'root'
})
export class AppointmentService {
  private apiUrl = 'http://localhost:5000/api/appointments';

  constructor(private http: HttpClient) {}

  getMyDoctorSchedule(): Observable<ScheduleResponse> {
    return this.http.get<ScheduleResponse>(`${this.apiUrl}/schedule/my-schedule`);
  }

  updateWeeklySchedule(payload: {
    consultationFee?: number;
    slotDurationMinutes?: number;
    weeklySchedule?: DaySchedule[];
  }): Observable<{ success: boolean; message: string; schedule: DoctorScheduleData }> {
    return this.http.put<{ success: boolean; message: string; schedule: DoctorScheduleData }>(
      `${this.apiUrl}/schedule/weekly`,
      payload
    );
  }

  saveDateOverride(override: DoctorDateOverrideData): Observable<{ success: boolean; message: string; override: DoctorDateOverrideData }> {
    return this.http.post<{ success: boolean; message: string; override: DoctorDateOverrideData }>(
      `${this.apiUrl}/schedule/override-date`,
      override
    );
  }

  deleteDateOverride(id: string): Observable<{ success: boolean; message: string }> {
    return this.http.delete<{ success: boolean; message: string }>(
      `${this.apiUrl}/schedule/override-date/${id}`
    );
  }

  getAvailableSlots(doctorId: string, dateStr: string): Observable<AvailableSlotsResponse> {
    const params = new HttpParams()
      .set('doctorId', doctorId)
      .set('date', dateStr);
    return this.http.get<AvailableSlotsResponse>(`${this.apiUrl}/slots/available`, { params });
  }
}
