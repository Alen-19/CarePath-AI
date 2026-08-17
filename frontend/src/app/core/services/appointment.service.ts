import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

// ─── Doctor Schedule Interfaces ──────────────────────────────────────────────
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
  date: string;
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

// ─── Booking Interfaces ───────────────────────────────────────────────────────
export interface DoctorCard {
  _id: string;
  firstName: string;
  lastName: string;
  specialization: string;
  licenseNumber: string;
  experienceYears: number;
  clinicName?: string;
  clinicAddress: string;
  clinicAddressDisplay?: string;
  distanceKm?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  rating: number;
  consultationFee: number;
  email?: string;
}

export interface BookingSlot {
  start: string;
  end: string;
}

export interface BookingSlotsResponse {
  success: boolean;
  date: string;
  slots: BookingSlot[];
  isOffDay?: boolean;
  totalAvailable: number;
}

export interface BookAppointmentPayload {
  doctorId: string;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  type?: string;
  symptoms?: string;
}

export interface BookingResponse {
  success: boolean;
  appointmentId: string;
  razorpayOrderId: string;
  amount: number;
  currency: string;
  keyId: string;
  doctorName: string;
  appointmentDate: string;
  startTime: string;
  endTime: string;
}

export interface VerifyPaymentPayload {
  appointmentId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

export interface AppointmentItem {
  _id: string;
  doctorId: {
    _id: string;
    firstName: string;
    lastName: string;
    specialization: string;
    clinicAddress: string;
    consultationFee: number;
  };
  appointmentDate: string;
  startTime: string;
  endTime: string;
  type: string;
  symptoms: string;
  status: 'Pending Payment' | 'Confirmed' | 'Completed' | 'Cancelled';
  amount: number;
  paymentStatus: string;
  cancelledAt?: string;
  cancellationReason?: string;
  isEmergency?: boolean;
  emergencyStatus?: string;
  clinicalNotes?: ClinicalNotesData;
}

export interface DoctorAppointmentItem {
  _id: string;
  patientId?: { _id: string; firstName?: string; lastName?: string; name?: string; age?: number; phone?: string; email?: string; bloodGroup?: string };
  patientName?: string;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  type: string;
  symptoms: string;
  status: string;
  amount: number;
  isEmergency?: boolean;
  emergencyStatus?: string;
  prescription?: any[];
  prescribedAt?: string;
  time?: string;
  age?: number;
  clinicalNotes?: ClinicalNotesData;
}

export interface CancelResponse {
  success: boolean;
  message: string;
  refundPercentage: number;
  refundAmount: number;
  estimatedRefundDate: string | null;
  policy: string;
}

export interface ClinicalNotesData {
  doctorRemarks?: string;
  nutritionalTags?: string[];
  recommendedFoods?: string;
  foodsToAvoid?: string;
  hydrationGoalLiters?: number;
  savedAt?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AppointmentService {
  private apiUrl = 'http://localhost:5000/api/appointments';
  private bookingUrl = 'http://localhost:5000/api/booking';

  constructor(private http: HttpClient) {}

  // ─── Doctor Schedule (for Doctor Dashboard) ────────────────────────────────
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

  // ─── Patient Booking APIs ──────────────────────────────────────────────────
  getDoctors(search?: string): Observable<{ success: boolean; count: number; doctors: DoctorCard[] }> {
    let params = new HttpParams();
    if (search) params = params.set('search', search);
    return this.http.get<{ success: boolean; count: number; doctors: DoctorCard[] }>(
      `${this.bookingUrl}/doctors`, { params }
    );
  }

  getBookingSlots(doctorId: string, date: string): Observable<BookingSlotsResponse> {
    const params = new HttpParams().set('date', date);
    return this.http.get<BookingSlotsResponse>(
      `${this.bookingUrl}/doctors/${doctorId}/slots`, { params }
    );
  }

  bookAppointment(payload: BookAppointmentPayload): Observable<BookingResponse> {
    return this.http.post<BookingResponse>(`${this.bookingUrl}/book`, payload);
  }

  verifyPayment(payload: VerifyPaymentPayload): Observable<{ success: boolean; message: string }> {
    return this.http.post<{ success: boolean; message: string }>(
      `${this.bookingUrl}/verify-payment`, payload
    );
  }

  getMyAppointments(): Observable<{ success: boolean; count: number; appointments: AppointmentItem[] }> {
    return this.http.get<{ success: boolean; count: number; appointments: AppointmentItem[] }>(
      `${this.bookingUrl}/my-appointments`
    );
  }

  cancelAppointment(id: string, reason?: string): Observable<CancelResponse> {
    return this.http.post<CancelResponse>(`${this.bookingUrl}/${id}/cancel`, { reason });
  }

  retryPayment(id: string): Observable<BookingResponse> {
    return this.http.post<BookingResponse>(`${this.bookingUrl}/${id}/retry-payment`, {});
  }

  // ─── Doctor Appointments ───────────────────────────────────────────────────
  getDoctorAppointments(): Observable<{ success: boolean; today: DoctorAppointmentItem[]; upcoming: DoctorAppointmentItem[]; past: DoctorAppointmentItem[] }> {
    return this.http.get<{ success: boolean; today: DoctorAppointmentItem[]; upcoming: DoctorAppointmentItem[]; past: DoctorAppointmentItem[] }>(
      `${this.bookingUrl}/doctor-appointments`
    );
  }

  // ─── Video Consultation APIs ──────────────────────────────────────────────
  getConsultationDetails(appointmentId: string): Observable<{
    success: boolean;
    appointment: any;
    meetingRoomId: string;
    callStatus: string;
    iceServers: any[];
  }> {
    return this.http.get<{
      success: boolean;
      appointment: any;
      meetingRoomId: string;
      callStatus: string;
      iceServers: any[];
    }>(`${this.apiUrl}/${appointmentId}/consultation`);
  }

  addPrescription(appointmentId: string, prescription: any[]): Observable<{
    success: boolean;
    message: string;
    prescription: any[];
    prescribedAt: string;
  }> {
    return this.http.post<{
      success: boolean;
      message: string;
      prescription: any[];
      prescribedAt: string;
    }>(`${this.bookingUrl}/${appointmentId}/prescription`, { prescription });
  }

  // ─── Clinical Consultation Notes & Dietary Advice ──────────────────────────
  saveClinicalNotes(appointmentId: string, payload: ClinicalNotesData): Observable<{
    success: boolean;
    message: string;
    clinicalNotes: ClinicalNotesData;
  }> {
    return this.http.post<{
      success: boolean;
      message: string;
      clinicalNotes: ClinicalNotesData;
    }>(`${this.bookingUrl}/${appointmentId}/clinical-notes`, payload);
  }

  getClinicalNotes(appointmentId: string): Observable<{
    success: boolean;
    clinicalNotes: ClinicalNotesData;
  }> {
    return this.http.get<{
      success: boolean;
      clinicalNotes: ClinicalNotesData;
    }>(`${this.bookingUrl}/${appointmentId}/clinical-notes`);
  }
}

