import { Routes } from '@angular/router';
import { LoginComponent } from './features/auth/login/login.component';
import { RegisterComponent } from './features/auth/register/register.component';
import { PatientDashboardComponent } from './features/patient/patient-dashboard.component';
import { CompleteProfileComponent } from './features/auth/complete-profile/complete-profile.component';
import { authGuard } from './core/guards/auth.guard';
import { patientGuard } from './core/guards/patient.guard';
import { doctorGuard } from './core/guards/doctor.guard';
import { adminGuard } from './core/guards/admin.guard';
import { profileCompletionGuard } from './core/guards/profile-completion.guard';
import { AdminDashboardComponent } from './features/admin/admin-dashboard.component';

import { LandingComponent } from './features/landing/landing.component';

import { DoctorDashboardComponent } from './features/doctor/doctor-dashboard.component';
import { VideoCallComponent } from './features/consultation/video-call/video-call.component';

export const routes: Routes = [
  {
    path: '',
    component: LandingComponent
  },
  {
    path: 'auth/login',
    component: LoginComponent
  },
  {
    path: 'auth/register',
    component: RegisterComponent
  },
  {
    path: 'auth/complete-profile',
    component: CompleteProfileComponent,
    canActivate: [authGuard]
  },
  {
    path: 'patient',
    component: PatientDashboardComponent,
    canActivate: [authGuard, patientGuard]
  },
  {
    path: 'doctor',
    component: DoctorDashboardComponent,
    canActivate: [authGuard, doctorGuard, profileCompletionGuard]
  },
  {
    path: 'admin',
    component: AdminDashboardComponent,
    canActivate: [authGuard, adminGuard]
  },
  {
    path: 'consultation/:appointmentId',
    component: VideoCallComponent,
    canActivate: [authGuard]
  },
  {
    path: '**',
    redirectTo: ''
  }
];
