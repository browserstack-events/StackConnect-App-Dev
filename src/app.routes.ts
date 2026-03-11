import { Component } from '@angular/core';
import { Routes } from '@angular/router';
import { LandingPageComponent } from './components/landing-page.component';
import { RoleSelectionComponent } from './components/role-selection.component';
import { SpocDashboardComponent } from './components/spoc-dashboard.component';
import { WalkInPageComponent } from './components/walk-in-page.component';
import { walkinGuard } from './guards/role-guard';

/**
 * ✅ SAFE PUBLIC HOME COMPONENT
 * This component is shown at the root URL ('/') to prevent 
 * random users from seeing the list of all events.
 */
@Component({
  selector: 'app-public-home',
  standalone: true,
  template: `
    <div class="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4 text-center font-sans">
      <div class="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 max-w-md w-full">
        <div class="w-16 h-16 bg-teal-50 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg class="w-8 h-8 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h1 class="text-2xl font-bold text-gray-900 mb-3">Restricted Access</h1>
        <p class="text-gray-500 mb-6 leading-relaxed">
          This is a private event management system. Please use the specific event link provided to you by the organizer.
        </p>
        <div class="text-xs text-gray-400 border-t border-gray-100 pt-4">
          Sales SPOC Dashboard System
        </div>
      </div>
    </div>
  `
})
export class PublicHomeComponent {}

export const routes: Routes = [
  // 1. ROOT PATH: Shows safe, generic message
  {
    path: '',
    component: PublicHomeComponent
  },
  
  // 2. SECRET ADMIN PATH: This is now the ONLY way to create/list events
  // You must save this URL: .../#/admin-console
  {
    path: 'admin-console', 
    component: LandingPageComponent
  },

  // 3. EVENT ROUTES (Unchanged)
  {
    path: 'event/:id',
    component: RoleSelectionComponent
  },
  {
    path: 'event/:id/desk',
    component: SpocDashboardComponent,
    data: { mode: 'admin' }
  },
  {
    path: 'event/:id/spoc',
    component: SpocDashboardComponent,
    data: { mode: 'spoc' }
  },
  {
    path: 'register/:id',
    component: WalkInPageComponent,
    canActivate: [walkinGuard]
  },
  {
    path: '**',
    redirectTo: ''
  }
];