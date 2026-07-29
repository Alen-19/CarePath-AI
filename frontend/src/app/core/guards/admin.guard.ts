import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const adminGuard: CanActivateFn = () => {
  const router = inject(Router);
  const authService = inject(AuthService);

  if (authService.isAuthenticated() && authService.userRole() === 'admin') {
    return true;
  }

  // Not admin, redirect to login
  router.navigate(['/auth/login']);
  return false;
};
