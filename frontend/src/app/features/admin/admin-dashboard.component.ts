import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { AdminService, DoctorVerificationItem, AdminStats } from '../../core/services/admin.service';
import { NmcService, MedicalCouncil, NMCDoctorSummary, NMCDoctorDetails } from '../../core/services/nmc.service';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './admin-dashboard.component.html',
  styleUrls: ['./admin-dashboard.component.css']
})
export class AdminDashboardComponent implements OnInit {
  adminName = 'System Admin';
  adminDepartment = 'System Administration';
  
  stats: AdminStats = {
    totalDoctors: 0,
    pendingVerifications: 0,
    approvedDoctors: 0,
    suspendedDoctors: 0,
    totalPatients: 0
  };

  doctors: DoctorVerificationItem[] = [];
  filteredDoctors: DoctorVerificationItem[] = [];

  activeTab: 'pending' | 'approved' | 'suspended' | 'rejected' | 'all' = 'pending';
  searchQuery: string = '';
  
  isLoadingStats = true;
  isLoadingDoctors = true;
  actionInProgressId: string | null = null;

  toastMessage: string | null = null;
  toastType: 'success' | 'error' = 'success';

  selectedDoctorForModal: DoctorVerificationItem | null = null;

  // Suspend Doctor Modal state
  showSuspendModal = false;
  doctorToSuspend: DoctorVerificationItem | null = null;
  suspensionReasonInput = '';
  suspensionErrorMsg = '';

  // 🇮🇳 NMC Live Verification State
  councilsList: MedicalCouncil[] = [];
  selectedCouncilId = '';
  isVerifyingNmc = false;
  nmcResults: NMCDoctorSummary[] = [];
  nmcSearched = false;
  nmcError: string | null = null;
  selectedNmcDetails: NMCDoctorDetails | null = null;
  isLoadingNmcDetails = false;
  nmcCustomRegNo = '';
  nmcCustomName = '';

  constructor(
    private authService: AuthService,
    private adminService: AdminService,
    private nmcService: NmcService,
    private router: Router
  ) {
    const user = this.authService.currentUser();
    if (user && user.role === 'admin') {
      const adminProfile = (user as any).adminProfile;
      if (adminProfile?.firstName) {
        this.adminName = `${adminProfile.firstName} ${adminProfile.lastName || ''}`.trim();
        if (adminProfile.department) {
          this.adminDepartment = adminProfile.department;
        }
      }
    }
  }

  ngOnInit(): void {
    this.loadStats();
    this.loadDoctors();
    this.loadCouncils();
  }

  loadCouncils(): void {
    this.nmcService.getCouncils().subscribe({
      next: (res) => {
        if (res.success) {
          this.councilsList = res.councils || [];
        }
      },
      error: (err) => console.warn('Could not load NMC councils:', err)
    });
  }

  loadStats(): void {
    this.isLoadingStats = true;
    this.adminService.getStats().subscribe({
      next: (res) => {
        if (res.success) {
          this.stats = res.stats;
        }
        this.isLoadingStats = false;
      },
      error: (err) => {
        console.error('Error fetching admin stats:', err);
        this.isLoadingStats = false;
      }
    });
  }

  loadDoctors(): void {
    this.isLoadingDoctors = true;
    this.adminService.getDoctorRequests(this.activeTab).subscribe({
      next: (res) => {
        if (res.success) {
          this.doctors = res.doctors;
          this.applyFilter();
        }
        this.isLoadingDoctors = false;
      },
      error: (err) => {
        console.error('Error loading doctor requests:', err);
        this.showToast('Failed to load doctor requests.', 'error');
        this.isLoadingDoctors = false;
      }
    });
  }

  setTab(tab: 'pending' | 'approved' | 'suspended' | 'rejected' | 'all'): void {
    this.activeTab = tab;
    this.loadDoctors();
  }

  applyFilter(): void {
    const query = this.searchQuery.toLowerCase().trim();
    if (!query) {
      this.filteredDoctors = [...this.doctors];
      return;
    }

    this.filteredDoctors = this.doctors.filter(doc => {
      const fullName = `${doc.firstName} ${doc.lastName}`.toLowerCase();
      const spec = (doc.specialization || '').toLowerCase();
      const license = (doc.licenseNumber || '').toLowerCase();
      const email = (doc.userId?.email || '').toLowerCase();

      return fullName.includes(query) || spec.includes(query) || license.includes(query) || email.includes(query);
    });
  }

  approveDoctor(doctor: DoctorVerificationItem, event?: Event): void {
    if (event) event.stopPropagation();
    this.actionInProgressId = doctor._id;

    this.adminService.approveDoctor(doctor._id).subscribe({
      next: (res) => {
        this.actionInProgressId = null;
        if (res.success) {
          this.showToast(`Doctor Dr. ${doctor.firstName} ${doctor.lastName} approved successfully!`, 'success');
          this.loadStats();
          this.loadDoctors();
          if (this.selectedDoctorForModal?._id === doctor._id) {
            this.selectedDoctorForModal = res.doctor;
          }
        }
      },
      error: (err) => {
        this.actionInProgressId = null;
        console.error('Error approving doctor:', err);
        this.showToast(err.error?.message || 'Failed to approve doctor.', 'error');
      }
    });
  }

  openSuspendModal(doctor: DoctorVerificationItem, event?: Event): void {
    if (event) event.stopPropagation();
    this.doctorToSuspend = doctor;
    this.suspensionReasonInput = '';
    this.suspensionErrorMsg = '';
    this.showSuspendModal = true;
  }

  closeSuspendModal(): void {
    this.showSuspendModal = false;
    this.doctorToSuspend = null;
    this.suspensionReasonInput = '';
    this.suspensionErrorMsg = '';
  }

  confirmSuspendDoctor(): void {
    if (!this.doctorToSuspend) return;
    if (!this.suspensionReasonInput || !this.suspensionReasonInput.trim()) {
      this.suspensionErrorMsg = 'Please enter a mandatory suspension reason note for the doctor.';
      return;
    }

    this.actionInProgressId = this.doctorToSuspend._id;
    this.suspensionErrorMsg = '';

    this.adminService.suspendDoctor(this.doctorToSuspend._id, this.suspensionReasonInput.trim()).subscribe({
      next: (res) => {
        this.actionInProgressId = null;
        if (res.success) {
          this.showToast(`Doctor Dr. ${this.doctorToSuspend!.firstName} ${this.doctorToSuspend!.lastName} has been suspended.`, 'error');
          this.closeSuspendModal();
          this.loadStats();
          this.loadDoctors();
          if (this.selectedDoctorForModal?._id === res.doctor._id) {
            this.selectedDoctorForModal = res.doctor;
          }
        }
      },
      error: (err) => {
        this.actionInProgressId = null;
        this.suspensionErrorMsg = err?.error?.message || 'Failed to suspend doctor account.';
      }
    });
  }

  unsuspendDoctor(doctor: DoctorVerificationItem, event?: Event): void {
    if (event) event.stopPropagation();
    this.actionInProgressId = doctor._id;

    this.adminService.unsuspendDoctor(doctor._id).subscribe({
      next: (res) => {
        this.actionInProgressId = null;
        if (res.success) {
          this.showToast(`Doctor Dr. ${doctor.firstName} ${doctor.lastName} has been reinstated!`, 'success');
          this.loadStats();
          this.loadDoctors();
          if (this.selectedDoctorForModal?._id === doctor._id) {
            this.selectedDoctorForModal = res.doctor;
          }
        }
      },
      error: (err) => {
        this.actionInProgressId = null;
        console.error('Error unsuspending doctor:', err);
        this.showToast(err.error?.message || 'Failed to reinstate doctor.', 'error');
      }
    });
  }

  rejectDoctor(doctor: DoctorVerificationItem, event?: Event): void {
    if (event) event.stopPropagation();
    this.actionInProgressId = doctor._id;

    this.adminService.rejectDoctor(doctor._id).subscribe({
      next: (res) => {
        this.actionInProgressId = null;
        if (res.success) {
          this.showToast(`Application for Dr. ${doctor.firstName} ${doctor.lastName} was declined.`, 'error');
          this.loadStats();
          this.loadDoctors();
          if (this.selectedDoctorForModal?._id === doctor._id) {
            this.selectedDoctorForModal = res.doctor;
          }
        }
      },
      error: (err) => {
        this.actionInProgressId = null;
        console.error('Error declining doctor application:', err);
        this.showToast(err.error?.message || 'Failed to decline application.', 'error');
      }
    });
  }

  openDetailsModal(doctor: DoctorVerificationItem, autoVerifyNmc = false): void {
    this.selectedDoctorForModal = doctor;
    this.clearNmcState();
    this.nmcCustomName = `${doctor.firstName} ${doctor.lastName}`.trim();
    this.nmcCustomRegNo = (doctor.licenseNumber || '').replace(/^LIC-?/i, '').trim();

    if (autoVerifyNmc || doctor.status === 'pending') {
      this.runNmcVerification();
    }
  }

  closeModal(): void {
    this.selectedDoctorForModal = null;
    this.clearNmcState();
  }

  clearNmcState(): void {
    this.nmcResults = [];
    this.nmcSearched = false;
    this.nmcError = null;
    this.selectedNmcDetails = null;
    this.isVerifyingNmc = false;
    this.isLoadingNmcDetails = false;
    this.selectedCouncilId = '';
  }

  runNmcVerification(): void {
    if (!this.selectedDoctorForModal) return;

    this.isVerifyingNmc = true;
    this.nmcError = null;
    this.nmcSearched = true;
    this.nmcResults = [];
    this.selectedNmcDetails = null;

    const nameToQuery = (this.nmcCustomName || this.selectedDoctorForModal.firstName || '').trim();
    const regNoToQuery = (this.nmcCustomRegNo || this.selectedDoctorForModal.licenseNumber || '').replace(/^LIC-?/i, '').trim();

    this.nmcService.searchNMC({
      name: nameToQuery,
      registrationNo: regNoToQuery,
      smcId: this.selectedCouncilId || undefined,
      length: 25
    }).subscribe({
      next: (res) => {
        this.isVerifyingNmc = false;
        if (res.success) {
          this.nmcResults = res.data || [];
          if (this.nmcResults.length === 0 && regNoToQuery) {
            // Fallback: If combined name + regNo yields 0, try searching by registrationNo only
            this.searchByRegNoOnly(regNoToQuery);
          }
        } else {
          this.nmcError = res.error || 'Unable to fetch results from NMC portal.';
        }
      },
      error: (err) => {
        this.isVerifyingNmc = false;
        console.error('NMC search error:', err);
        this.nmcError = err.error?.error || 'Failed to connect to National Medical Commission gateway.';
      }
    });
  }

  private searchByRegNoOnly(regNo: string): void {
    this.nmcService.searchNMC({
      registrationNo: regNo,
      smcId: this.selectedCouncilId || undefined,
      length: 25
    }).subscribe({
      next: (res) => {
        if (res.success && res.data && res.data.length > 0) {
          this.nmcResults = res.data;
        }
      },
      error: () => {}
    });
  }

  viewNmcDetails(item: NMCDoctorSummary): void {
    if (!item.doctorId) return;

    this.isLoadingNmcDetails = true;
    this.selectedNmcDetails = null;

    this.nmcService.getDoctorDetails(item.doctorId, item.registrationNo).subscribe({
      next: (res) => {
        this.isLoadingNmcDetails = false;
        if (res.success && res.details) {
          this.selectedNmcDetails = res.details;
        } else {
          this.showToast('Could not load official details for this record.', 'error');
        }
      },
      error: (err) => {
        this.isLoadingNmcDetails = false;
        console.error('Error fetching NMC doctor details:', err);
        this.showToast('Failed to load NMC doctor bio details.', 'error');
      }
    });
  }

  closeNmcDetails(): void {
    this.selectedNmcDetails = null;
  }

  showToast(message: string, type: 'success' | 'error' = 'success'): void {
    this.toastMessage = message;
    this.toastType = type;
    setTimeout(() => {
      this.toastMessage = null;
    }, 4000);
  }

  onLogout(): void {
    this.authService.logout();
    this.router.navigate(['/auth/login']);
  }
}
