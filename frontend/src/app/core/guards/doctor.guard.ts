import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const doctorGuard: CanActivateFn = () => {
  const router = inject(Router);
  const authService = inject(AuthService);

  if (authService.isAuthenticated() && authService.userRole() === 'doctor') {
    return true;
  }

  // Not doctor, redirect to default landing (login)
  router.navigate(['/auth/login']);
  return false;
};
