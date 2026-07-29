import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const profileCompletionGuard: CanActivateFn = () => {
  const router = inject(Router);
  const authService = inject(AuthService);

  if (authService.isAuthenticated()) {
    const user = authService.currentUser();
    if (!authService.isProfileComplete(user)) {
      // Profile is incomplete, redirect to completion page
      router.navigate(['/auth/complete-profile']);
      return false;
    }
    return true;
  }

  // Not logged in, redirect to login
  router.navigate(['/auth/login']);
  return false;
};
