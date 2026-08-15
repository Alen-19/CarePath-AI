import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { patientGuard } from './core/guards/patient.guard';
import { doctorGuard } from './core/guards/doctor.guard';
import { adminGuard } from './core/guards/admin.guard';
import { profileCompletionGuard } from './core/guards/profile-completion.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/landing/landing.component').then(m => m.LandingComponent)
  },
  {
    path: 'auth/login',
    loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'auth/register',
    loadComponent: () => import('./features/auth/register/register.component').then(m => m.RegisterComponent)
  },
  {
    path: 'auth/complete-profile',
    loadComponent: () => import('./features/auth/complete-profile/complete-profile.component').then(m => m.CompleteProfileComponent),
    canActivate: [authGuard]
  },
  {
    path: 'patient',
    loadComponent: () => import('./features/patient/patient-dashboard.component').then(m => m.PatientDashboardComponent),
    canActivate: [authGuard, patientGuard]
  },
  {
    path: 'doctor',
    loadComponent: () => import('./features/doctor/doctor-dashboard.component').then(m => m.DoctorDashboardComponent),
    canActivate: [authGuard, profileCompletionGuard, doctorGuard]
  },
  {
    path: 'admin',
    loadComponent: () => import('./features/admin/admin-dashboard.component').then(m => m.AdminDashboardComponent),
    canActivate: [authGuard, adminGuard]
  },
  {
    path: 'consultation/:appointmentId',
    loadComponent: () => import('./features/consultation/video-call/video-call.component').then(m => m.VideoCallComponent),
    canActivate: [authGuard]
  },
  {
    path: '**',
    redirectTo: ''
  }
];

