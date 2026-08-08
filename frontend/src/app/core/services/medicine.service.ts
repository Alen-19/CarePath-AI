import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

export interface MedicineItem {
  medicineId: number;
  medicineName: string;
  manufacturer: string;
  packSize: string;
  composition: string[];
  uses: string[];
  sideEffects: string[];
}

export interface SearchMedicineResponse {
  success: boolean;
  count: number;
  medicines: MedicineItem[];
}

@Injectable({
  providedIn: 'root'
})
export class MedicineService {
  private apiUrl = 'http://localhost:5000/api/medicines';

  constructor(private http: HttpClient) {}

  searchMedicines(query: string): Observable<SearchMedicineResponse> {
    if (!query || query.trim().length < 2) {
      return of({ success: true, count: 0, medicines: [] });
    }
    return this.http.get<SearchMedicineResponse>(`${this.apiUrl}/search?q=${encodeURIComponent(query)}`).pipe(
      catchError(err => {
        console.error('Error searching medicines:', err);
        return of({ success: false, count: 0, medicines: [] });
      })
    );
  }
}
