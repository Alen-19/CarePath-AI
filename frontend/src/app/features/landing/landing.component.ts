import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './landing.component.html',
  styleUrls: ['./landing.component.css']
})
export class LandingComponent {

  constructor(
    private authService: AuthService,
    private router: Router
  ) {
    if (this.authService.isAuthenticated()) {
      const role = this.authService.userRole();
      if (role === 'patient') {
        this.router.navigate(['/patient']);
      } else if (role === 'doctor') {
        this.router.navigate(['/doctor']);
      }
    }
  }

  navigateWithRole(type: 'login' | 'register', role: 'patient' | 'doctor') {
    const targetRoute = type === 'login' ? '/auth/login' : '/auth/register';
    this.router.navigate([targetRoute], {
      queryParams: { role }
    });
  }
}
