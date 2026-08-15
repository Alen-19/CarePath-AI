import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface MedicalCouncil {
  id: string;
  name: string;
}

export interface NMCDoctorSummary {
  sno: number | string;
  year: string;
  registrationNo: string;
  council: string;
  name: string;
  fatherName: string;
  doctorId: string;
  actionHtml?: string;
}

export interface NMCDoctorDetails {
  firstName?: string;
  lastName?: string;
  name?: string;
  fatherName?: string;
  registrationNo?: string;
  smcId?: string;
  smcName?: string;
  yearOfInfo?: string;
  doctorAddress?: string;
  qualificationList?: Array<{
    qualification?: string;
    qualificationYear?: string;
    universityName?: string;
    collegeName?: string;
  }>;
  [key: string]: any;
}

export interface NMCSearchResponse {
  success: boolean;
  source: string;
  recordsTotal: number;
  recordsFiltered: number;
  data: NMCDoctorSummary[];
  error?: string;
}

export interface NMCDetailsResponse {
  success: boolean;
  details: NMCDoctorDetails;
  error?: string;
}

export interface NMCCouncilsResponse {
  success: boolean;
  councils: MedicalCouncil[];
}

@Injectable({
  providedIn: 'root'
})
export class NmcService {
  private apiUrl = 'http://localhost:5000/api/admin/nmc';

  constructor(private http: HttpClient) {}

  getCouncils(): Observable<NMCCouncilsResponse> {
    return this.http.get<NMCCouncilsResponse>(`${this.apiUrl}/councils`);
  }

  searchNMC(params: {
    name?: string;
    registrationNo?: string;
    smcId?: string;
    year?: string;
    start?: number;
    length?: number;
  }): Observable<NMCSearchResponse> {
    let httpParams = new HttpParams();
    if (params.name) httpParams = httpParams.set('name', params.name.trim());
    if (params.registrationNo) httpParams = httpParams.set('registrationNo', params.registrationNo.trim());
    if (params.smcId) httpParams = httpParams.set('smcId', params.smcId.trim());
    if (params.year) httpParams = httpParams.set('year', params.year.trim());
    if (params.start !== undefined) httpParams = httpParams.set('start', params.start.toString());
    if (params.length !== undefined) httpParams = httpParams.set('length', params.length.toString());

    return this.http.get<NMCSearchResponse>(`${this.apiUrl}/search`, { params: httpParams });
  }

  getDoctorDetails(doctorId: string, regdNoValue?: string): Observable<NMCDetailsResponse> {
    return this.http.post<NMCDetailsResponse>(`${this.apiUrl}/doctor-details`, {
      doctorId,
      regdNoValue: regdNoValue || ''
    });
  }
}
