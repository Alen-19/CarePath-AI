import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const doctorGuard: CanActivateFn = () => {
  const router = inject(Router);
  const authService = inject(AuthService);

  if (authService.isAuthenticated() && authService.userRole() === 'doctor') {
    const user = authService.currentUser();
    
    // If doctor profile is incomplete (missing license number or specialization), redirect to complete-profile
    if (!authService.isProfileComplete(user)) {
      router.navigate(['/auth/complete-profile']);
      return false;
    }

    if (user?.doctorProfile && user.doctorProfile.isVerified === false) {
      authService.logout();
      router.navigate(['/auth/login'], { queryParams: { role: 'doctor' } });
      return false;
    }
    return true;
  }

  // Not doctor, redirect to default landing (login)
  router.navigate(['/auth/login']);
  return false;
};
