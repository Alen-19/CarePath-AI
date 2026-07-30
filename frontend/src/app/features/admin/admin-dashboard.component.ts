import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { AdminService, DoctorVerificationItem, AdminStats } from '../../core/services/admin.service';

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

  activeTab: 'pending' | 'approved' | 'suspended' | 'all' = 'pending';
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

  constructor(
    private authService: AuthService,
    private adminService: AdminService,
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

  setTab(tab: 'pending' | 'approved' | 'suspended' | 'all'): void {
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
          this.showToast(`Doctor Dr. ${doctor.firstName} ${doctor.lastName}'s verification set to pending.`, 'error');
          this.loadStats();
          this.loadDoctors();
          if (this.selectedDoctorForModal?._id === doctor._id) {
            this.selectedDoctorForModal = res.doctor;
          }
        }
      },
      error: (err) => {
        this.actionInProgressId = null;
        console.error('Error rejecting doctor:', err);
        this.showToast(err.error?.message || 'Failed to set pending status.', 'error');
      }
    });
  }

  openDetailsModal(doctor: DoctorVerificationItem): void {
    this.selectedDoctorForModal = doctor;
  }

  closeModal(): void {
    this.selectedDoctorForModal = null;
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
