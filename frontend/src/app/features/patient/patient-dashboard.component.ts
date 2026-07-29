import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-patient-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './patient-dashboard.component.html',
  styleUrls: ['./patient-dashboard.component.css']
})
export class PatientDashboardComponent {
  patientName = '';
  today = new Date();

  // Mock data for initial loading of UI before connecting endpoints
  appointments = [
    { doctorName: 'Dr. Sarah Jenkins', specialty: 'Cardiologist', time: '10:30 AM', status: 'Confirmed' }
  ];

  activeCarePlan = {
    planName: 'Hypertension Management Protocol',
    prescribedBy: 'Dr. Sarah Jenkins',
    startDate: 'July 10, 2026',
    dailyGoals: [
      { text: 'Limit sodium intake to under 1500mg', completed: true },
      { text: 'Drink 2.5 Liters of Water', completed: false },
      { text: '30-minute brisk walk prescribed', completed: false }
    ]
  };

  nutritionSummary = {
    caloriesConsumed: 1450,
    calorieGoal: 2000,
    carbsGrams: 180,
    proteinGrams: 75,
    fatGrams: 45
  };

  exercises = [
    { name: 'Brisk Walking', duration: '30 mins', videoUrl: 'https://youtube.com/demo', isCompleted: false },
    { name: 'Light Stretching', duration: '10 mins', videoUrl: 'https://youtube.com/demo', isCompleted: true }
  ];

  recentReports = [
    { name: 'Lipid Panel Report.pdf', date: 'July 14, 2026', aiSummary: 'Cholesterol levels are slightly elevated. Increase omega-3 intake.' }
  ];

  notifications = [
    { text: 'Dr. Jenkins approved your appointment request for tomorrow.', time: '2 hours ago' },
    { text: 'Daily water intake log is pending confirmation.', time: '5 hours ago' }
  ];

  constructor(
    private authService: AuthService,
    private router: Router
  ) {
    const user = this.authService.currentUser();
    if (user && user.patientProfile) {
      this.patientName = `${user.patientProfile.firstName} ${user.patientProfile.lastName}`;
    } else {
      this.patientName = 'Patient';
    }
  }

  toggleGoal(index: number) {
    this.activeCarePlan.dailyGoals[index].completed = !this.activeCarePlan.dailyGoals[index].completed;
  }

  toggleExercise(index: number) {
    this.exercises[index].isCompleted = !this.exercises[index].isCompleted;
  }

  onLogout() {
    this.authService.logout();
    this.router.navigate(['/auth/login']);
  }
}
