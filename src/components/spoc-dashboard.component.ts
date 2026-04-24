import { Component, inject, signal, computed, input, OnInit, OnDestroy, effect, viewChildren } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { DataService, Attendee } from '../services/data.service';
import { AttendeeDetailComponent } from './attendee-detail.component';
import { AuthService } from '../services/auth.service';
import { SpocAuthService } from '../services/spoc-auth.service';
import { SYNC_CONFIG, LANYARD_COLORS_FALLBACK } from '../constants';
import { SwipeableCardDirective } from '../directives/swipeable-card.directive';

@Component({
  selector: 'app-spoc-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, AttendeeDetailComponent, RouterModule, SwipeableCardDirective],
  styles: [`
    @keyframes overlayFadeIn {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    @keyframes modalSlideUp {
      from { opacity: 0; transform: translateY(16px) scale(0.97); }
      to   { opacity: 1; transform: translateY(0)   scale(1);    }
    }
    @keyframes fadeIn {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    .overlay-enter { animation: overlayFadeIn 0.2s ease-out forwards; }
    .modal-enter   { animation: modalSlideUp  0.25s cubic-bezier(0.16,1,0.3,1) forwards; }
    .animate-fade-in { animation: fadeIn 0.15s ease-in forwards; }
  `],
  template: `
    @if (!showLoginOverlay()) {
    <div class="min-h-screen flex flex-col bg-gray-50">
      <!-- Top Navigation Bar -->
      <header class="border-b border-gray-200 sticky top-0 z-10 shadow-sm transition-colors"
              [class.bg-teal-600]="mode() === 'admin'"
              [class.bg-blue-600]="mode() === 'spoc'">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div class="flex items-center gap-4">
             <a [routerLink]="['/event', eventId()]" class="text-white/80 hover:text-white">
               <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
               </svg>
             </a>
             <div class="flex flex-col">
               <h1 class="text-lg font-bold text-white leading-tight">{{ dataService.sheetName() || 'Loading...' }}</h1>
               <span class="text-xs text-white/80 font-medium uppercase tracking-wide">
                 {{ mode() === 'admin' ? 'Registration Desk' : 'SPOC Dashboard' }}
               </span>
             </div>
          </div>
          
          <div class="flex items-center gap-3">
            <!-- Auth User Display & Sign-Out -->
            <div class="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-lg border border-white/20">
              <div class="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-xs">
                {{ displayInitial() }}
              </div>
              <div class="hidden sm:flex flex-col leading-tight">
                <span class="text-sm text-white font-medium">{{ displayName() }}</span>
                @if (mode() === 'spoc' && spocAuth.user()?.email) {
                  <span class="text-xs text-white/60">{{ spocAuth.user()!.email }}</span>
                }
              </div>
              <button
                (click)="signOut()"
                class="text-white/70 hover:text-white p-1 transition-colors ml-1"
                title="Sign out">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>

            <!-- Sync Button -->
            <button 
              (click)="syncData()"
              [disabled]="isSyncing()"
              class="bg-white/10 text-white hover:bg-white/20 p-2 rounded-full shadow-sm transition-colors disabled:opacity-50"
              title="Refresh Data">
              @if (isSyncing()) {
                <svg class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              } @else {
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              }
            </button>
          </div>

        </div>
      </header>

      <!-- Connection Error Banner -->
      @if (dataService.connectionError()) {
        <div class="bg-amber-50 border-b border-amber-200 px-4 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between gap-3 text-sm">
          <div class="flex items-center gap-2 text-amber-800">
            <svg class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <span class="font-medium">{{ dataService.connectionError() }}</span>
          </div>
          <button (click)="dataService.connectionError.set(null)"
                  class="text-amber-600 hover:text-amber-800 p-1 flex-shrink-0"
                  title="Dismiss">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      }

      <!-- Pending Sync Warning Banner -->
      @if (dataService.syncError()) {
        <div class="bg-orange-50 border-b border-orange-200 px-4 sm:px-6 lg:px-8 py-2.5 flex items-center gap-2 text-sm text-orange-800">
          <svg class="w-4 h-4 flex-shrink-0 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span class="font-medium">{{ dataService.syncError() }}</span>
        </div>
      }

      <main class="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 overflow-y-auto"
            (scroll)="onListScroll($event)">
        
        <!-- Controls -->
        <div class="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-col gap-4">
          
          <!-- Search -->
          <div class="relative w-full">
             <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg class="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
             </div>
             <input
               type="text"
               [ngModel]="searchQuery()"
               (ngModelChange)="searchQuery.set($event)"
               (focus)="onSearchFocus()"
               (blur)="onSearchBlur()"
               class="spoc-search-input block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg leading-5 bg-gray-50 placeholder-gray-500 focus:outline-none focus:bg-white focus:ring-1 sm:text-sm"
               [class.focus:ring-teal-500]="mode() === 'admin'"
               [class.focus:border-teal-500]="mode() === 'admin'"
               [class.focus:ring-blue-500]="mode() === 'spoc'"
               [class.focus:border-blue-500]="mode() === 'spoc'"
               placeholder="Search by name, company, or email...">
          </div>

          <!-- Filters Row (collapses when search is active) -->
          <div class="overflow-hidden transition-all duration-300"
               [style.max-height]="searchActive() ? '0px' : '400px'"
               [style.opacity]="searchActive() ? '0' : '1'">
            <div class="flex flex-col md:flex-row gap-3 items-center justify-between">
             
             <!-- SPOC Dropdown (Only for SPOC view) -->
             @if (mode() === 'spoc') {
               <div class="w-full md:w-auto">
                 <select 
                   [ngModel]="selectedSpoc()" 
                   (ngModelChange)="selectedSpoc.set($event)"
                   class="block w-full md:w-64 pl-3 pr-8 py-2.5 text-base border-gray-300 focus:outline-none sm:text-sm rounded-lg bg-white border text-gray-900 shadow-sm"
                   [class.focus:ring-teal-500]="mode() === 'admin'"
                   [class.focus:border-teal-500]="mode() === 'admin'"
                   [class.focus:ring-blue-500]="mode() === 'spoc'"
                   [class.focus:border-blue-500]="mode() === 'spoc'">
                   <option value="All">All SPOCs</option>
                   @for (spoc of uniqueSpocs(); track spoc) {
                     <option [value]="spoc">{{ spoc }}</option>
                   }
                 </select>
               </div>
             }

             <!-- Filter Buttons (Responsive Tabs) -->
             <div class="w-full md:w-auto flex gap-2">
               <button (click)="filterStatus.set('all')" 
                 class="flex-1 md:flex-none px-6 py-2.5 text-sm font-semibold rounded-lg border transition-all whitespace-nowrap" 
                 [class.bg-blue-50]="filterStatus() === 'all' && mode() === 'spoc'" 
                 [class.text-blue-700]="filterStatus() === 'all' && mode() === 'spoc'"
                 [class.border-blue-200]="filterStatus() === 'all' && mode() === 'spoc'"
                 [class.bg-teal-50]="filterStatus() === 'all' && mode() === 'admin'" 
                 [class.text-teal-700]="filterStatus() === 'all' && mode() === 'admin'"
                 [class.border-teal-200]="filterStatus() === 'all' && mode() === 'admin'"
                 [class.bg-white]="filterStatus() !== 'all'"
                 [class.text-gray-600]="filterStatus() !== 'all'"
                 [class.border-gray-300]="filterStatus() !== 'all'"
                 [class.hover:bg-gray-50]="filterStatus() !== 'all'">All</button>
               
               <button (click)="filterStatus.set('checked-in')" 
                 class="flex-1 md:flex-none px-6 py-2.5 text-sm font-semibold rounded-lg border transition-all whitespace-nowrap" 
                 [class.bg-green-50]="filterStatus() === 'checked-in'" 
                 [class.text-green-700]="filterStatus() === 'checked-in'"
                 [class.border-green-200]="filterStatus() === 'checked-in'"
                 [class.bg-white]="filterStatus() !== 'checked-in'"
                 [class.text-gray-600]="filterStatus() !== 'checked-in'"
                 [class.border-gray-300]="filterStatus() !== 'checked-in'"
                 [class.hover:bg-gray-50]="filterStatus() !== 'checked-in'">
                 {{ mode() === 'admin' ? 'Checked In' : 'Checked In' }}
               </button>
               
               <button (click)="filterStatus.set('pending')" 
                 class="flex-1 md:flex-none px-6 py-2.5 text-sm font-semibold rounded-lg border transition-all whitespace-nowrap" 
                 [class.bg-white]="filterStatus() !== 'pending'" 
                 [class.text-gray-600]="filterStatus() !== 'pending'"
                 [class.border-gray-300]="filterStatus() !== 'pending'"
                 [class.bg-gray-100]="filterStatus() === 'pending'" 
                 [class.text-gray-700]="filterStatus() === 'pending'"
                 [class.border-gray-300]="filterStatus() === 'pending'"
                 [class.hover:bg-gray-50]="filterStatus() !== 'pending'">
                 {{ mode() === 'admin' ? 'Pending' : 'Pending' }}
               </button>
             </div>

             <!-- Add Walk-in (Admin Only) -->
             @if (mode() === 'admin') {
               <button 
                  (click)="openWalkIn()"
                  class="w-full md:w-auto text-white px-6 py-2.5 rounded-lg shadow-sm flex items-center justify-center gap-2 text-sm font-bold transition-colors bg-teal-600 hover:bg-teal-700 uppercase tracking-wide">
                  <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                     <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                  </svg>
                  Add Walk-in
               </button>
             }
            </div>
          </div>
        </div>

        <!-- Stats - Only show for SPOC and Desktop Admin view (collapses when search is active) -->
        <div class="overflow-hidden transition-all duration-300"
             [style.max-height]="searchActive() ? '0px' : '300px'"
             [style.opacity]="searchActive() ? '0' : '1'"
             [style.margin-top]="searchActive() ? '0px' : null">
        @if (mode() === 'spoc' || mode() === 'admin') {
          <div class="gap-4" 
               [ngClass]="mode() === 'admin' ? 'grid grid-cols-3 md:grid-cols-4' : 'grid grid-cols-3 md:grid-cols-4'">
            
            <div class="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
              <p class="text-xs font-semibold text-gray-500 uppercase">Total</p>
              <p class="mt-1 text-2xl font-bold text-gray-900">{{ stats().total }}</p>
            </div>
            <div class="bg-white p-4 rounded-xl border border-gray-200 shadow-sm border-l-4 border-l-green-500">
              <p class="text-xs font-semibold text-green-600 uppercase">Checked In</p>
              <p class="mt-1 text-2xl font-bold text-gray-900">{{ stats().checkedIn }}</p>
            </div>
            <div class="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
              <p class="text-xs font-semibold text-gray-500 uppercase">Pending</p>
              <p class="mt-1 text-2xl font-bold text-gray-900">{{ stats().pending }}</p>
            </div>
            <div class="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hidden md:block">
              <p class="text-xs font-semibold uppercase text-blue-600">Rate</p>
              <p class="mt-1 text-2xl font-bold text-blue-600">{{ stats().rate }}%</p>
            </div>
          </div>
        }
        </div>



        <!-- DESKTOP TABLE VIEW (Hidden on Mobile) -->
        <div class="hidden md:block bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden"
             [style.margin-top]="searchActive() ? '0px' : null">
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200">
              <thead class="bg-gray-50">
                <tr>
                  <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Attendee</th>
                  
                  <!-- SPOC Mode: Status Column is 2nd -->
                  @if (mode() === 'spoc') {
                    <th scope="col" class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-32">Status</th>
                  }

                  <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lanyard</th>
                  <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                  <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Check-in Time</th>
                  
                  <!-- Admin Mode: Status Column is last (to the right) -->
                  @if (mode() === 'admin') {
                    <th scope="col" class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  }

                  <!-- SPOC Mode: Details Column -->
                  @if (mode() === 'spoc') {
                    <th scope="col" class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"></th>
                  }
                </tr>
              </thead>
              <tbody class="bg-white divide-y divide-gray-200">
                @for (group of groupedAttendees(); track group.name) {
                  <!-- Explicit Group Header -->
                  <tr class="bg-gray-50 border-b border-gray-200">
                    <td [attr.colspan]="mode() === 'spoc' ? 6 : 5" class="px-6 py-2.5">
                      <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                          <span class="text-xs font-bold text-gray-600 uppercase tracking-wider">{{ group.name }}</span>
                          <span class="text-[10px] font-semibold text-gray-400 bg-white border border-gray-200 px-1.5 rounded-full">{{ group.items.length }}</span>
                        </div>
                        @if (mode() === 'spoc') {
                          <button (click)="openAccountNote(group.name)"
                                  class="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                  title="Add note for all {{ group.name }} attendees">
                            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                              <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                        }
                      </div>
                    </td>
                  </tr>

                  @for (attendee of group.items; track attendee.id) {
                    <tr class="transition-colors border-b border-gray-100 last:border-0 hover:bg-gray-50" 
                        [class.bg-green-50]="attendee.attendance"
                        [class.cursor-pointer]="mode() === 'spoc'"
                        (click)="mode() === 'spoc' ? openDetail(attendee) : null">
                      
                      <!-- Attendee Name -->
                      <td class="px-6 py-4 max-w-xs">
                        <div class="flex items-center">
                          <div class="flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
                               [class.bg-teal-500]="mode() === 'admin'"
                               [class.bg-blue-500]="mode() === 'spoc'">
                            {{ attendee.firstName.charAt(0) }}{{ attendee.lastName.charAt(0) }}
                          </div>
                          <div class="ml-4">
                            <div class="flex items-center gap-2">
                              <div class="text-sm font-bold text-gray-900">{{ attendee.fullName }}</div>
                              @if (mode() === 'spoc' && attendee.linkedin) {
                                <a [href]="attendee.linkedin" target="_blank" (click)="$event.stopPropagation()" class="text-[#0077b5] hover:opacity-80 transition-opacity">
                                  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                      <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
                                  </svg>
                                </a>
                              }
                            </div>
                            
                            <!-- Designation/Title for SPOC -->
                            @if (mode() === 'spoc') {
                              <div class="text-xs text-gray-600 font-medium">{{ attendee.title ? attendee.company + ' - ' + attendee.title : attendee.company }}</div>
                            }
                            
                            @if (attendee.segment === 'Walk-in') {
                              <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800 mt-1">
                                Walk-in
                              </span>
                            }
                          </div>
                        </div>
                      </td>
                      
                      <!-- SPOC Status Badge -->
                      @if (mode() === 'spoc') {
                        <td class="px-6 py-4 whitespace-nowrap text-center">
                            <span class="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full"
                              [class.bg-green-100]="attendee.attendance"
                              [class.text-green-800]="attendee.attendance"
                              [class.bg-gray-100]="!attendee.attendance"
                              [class.text-gray-800]="!attendee.attendance">
                              {{ attendee.attendance ? 'Checked In' : 'Pending' }}
                            </span>
                        </td>
                      }

                      <td class="px-6 py-4 whitespace-nowrap">
                        @if (attendee.nameCardColor) {
                          <!-- Two separate pills -->
                          <div class="flex items-center gap-2">
                            <span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold"
                                  [style.background-color]="getLanyardHex(attendee.lanyardColor) + '22'"
                                  [style.color]="getLanyardHex(attendee.lanyardColor)">
                              <span class="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                    [style.background-color]="getLanyardHex(attendee.lanyardColor)"></span>
                              LANYARD: {{ attendee.lanyardColor }}
                            </span>
                            <span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold"
                                  [style.background-color]="getLanyardHex(attendee.nameCardColor) + '22'"
                                  [style.color]="getLanyardHex(attendee.nameCardColor)">
                              <span class="w-2.5 h-2.5 rounded-none flex-shrink-0"
                                    [style.background-color]="getLanyardHex(attendee.nameCardColor)"></span>
                              ID CARD: {{ attendee.nameCardColor }}
                            </span>
                          </div>
                        } @else {
                          <!-- Original single-colour pill -->
                          <span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold"
                                [style.background-color]="getLanyardHex(attendee.lanyardColor) + '22'"
                                [style.color]="getLanyardHex(attendee.lanyardColor)">
                            <span class="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                  [style.background-color]="getLanyardHex(attendee.lanyardColor)"></span>
                            LANYARD: {{ attendee.lanyardColor }}
                          </span>
                        }
                        @if (attendee.printStatus && mode() === 'admin') {
                          <div class="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full w-fit"
                               [class]="attendee.printStatus === 'Not Printed' ? 'text-red-700 bg-red-50' : 'text-purple-700 bg-purple-50'">
                            <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                            {{ attendee.printStatus }}
                          </div>
                        }
                      </td>

                      <!-- Attendee Type -->
                      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {{ attendee.attendeeType }}
                      </td>

                      <!-- Check-in Time -->
                      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {{ attendee.checkInTime ? (attendee.checkInTime | date:'shortTime') : '-' }}
                      </td>
                      
                      <!-- Admin Status Toggle (Right Aligned) -->
                      @if (mode() === 'admin') {
                        <td class="px-6 py-4 whitespace-nowrap text-right">
                            <div class="flex justify-end items-center">
                              <button (click)="handleAttendanceToggle(attendee.id)" 
                                      class="relative inline-flex h-8 w-14 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2"
                                      [class.bg-teal-600]="attendee.attendance"
                                      [class.bg-gray-200]="!attendee.attendance">
                                <span class="sr-only">Use setting</span>
                                <span aria-hidden="true" 
                                      class="pointer-events-none inline-block h-7 w-7 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out mt-[1px]"
                                      [class.translate-x-6]="attendee.attendance"
                                      [class.translate-x-0]="!attendee.attendance"></span>
                              </button>
                            </div>
                        </td>
                      }

                      <!-- SPOC Details Link -->
                      @if (mode() === 'spoc') {
                        <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button class="font-medium hover:underline text-blue-600">Details</button>
                        </td>
                      }
                    </tr>
                  }
                } @empty {
                  <tr>
                    <td [attr.colspan]="mode() === 'spoc' ? 6 : 5" class="px-6 py-12 text-center text-gray-500">
                      No attendees found.
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>

        <!-- MOBILE GROUPED CARD VIEW (Visible on Mobile) -->
<div class="md:hidden space-y-6"
             [style.margin-top]="searchActive() ? '0px' : null">
          @for (group of groupedAttendees(); track group.name) {
            <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
               <div class="bg-gray-50 px-4 py-3 border-b border-gray-200 flex justify-between items-center sticky top-0 z-0">
                  <div class="flex items-center gap-2 min-w-0">
                    <span class="font-bold text-gray-700 text-sm uppercase tracking-wide truncate">{{ group.name }}</span>
                    <span class="text-xs font-semibold text-gray-500 bg-white border border-gray-200 px-2 py-0.5 rounded-full flex-shrink-0">{{ group.items.length }}</span>
                  </div>
                  @if (mode() === 'spoc') {
                    <button (click)="openAccountNote(group.name)"
                            class="ml-2 flex-shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            title="Add note for all {{ group.name }} attendees">
                      <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                  }
               </div>

               @for (attendee of group.items; track attendee.id; let last = $last) {
                  <!-- Swipe-to-reveal wrapper -->
                  <div class="relative overflow-hidden"
                       [class.border-b]="!last"
                       [class.border-gray-100]="!last">

                    <!-- LEFT panel — revealed on right swipe -->
                    <div class="absolute inset-y-0 left-0 flex flex-col items-center justify-center w-[108px]"
                         [style.backgroundColor]="getSwipePanelColor(attendee.id, 'left')">
                      <svg class="w-6 h-6 flex-shrink-0"
                           [style.opacity]="getSwipePanelProgress(attendee.id, 'left') * 1.5"
                           [style.color]="getSwipePanelProgress(attendee.id, 'left') > 0.5 ? 'white' : '#2563eb'"
                           fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      @if (getSwipePanelProgress(attendee.id, 'left') > 0.6) {
                        <span class="text-[9px] font-bold uppercase tracking-wide mt-0.5 animate-fade-in"
                              [style.color]="getSwipePanelProgress(attendee.id, 'left') > 0.5 ? 'white' : '#2563eb'">Note</span>
                      }
                    </div>

                    <!-- RIGHT panel — revealed on left swipe -->
                    <div class="absolute inset-y-0 right-0 flex flex-col items-center justify-center w-[108px]"
                         [style.backgroundColor]="getSwipePanelColor(attendee.id, 'right')">
                      <svg class="w-6 h-6 flex-shrink-0"
                           [style.opacity]="getSwipePanelProgress(attendee.id, 'right') * 1.5"
                           [style.color]="getSwipePanelProgress(attendee.id, 'right') > 0.5 ? 'white' : '#2563eb'"
                           fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      @if (getSwipePanelProgress(attendee.id, 'right') > 0.6) {
                        <span class="text-[9px] font-bold uppercase tracking-wide mt-0.5 animate-fade-in"
                              [style.color]="getSwipePanelProgress(attendee.id, 'right') > 0.5 ? 'white' : '#2563eb'">Note</span>
                      }
                    </div>

                  <!-- Sliding card — inline backgroundColor beats static Tailwind class conflict -->
                  <div appSwipeableCard [revealWidth]="108" [threshold]="0.35"
                       (swipeReveal)="onCardSwiped(attendee.id)"
                       (swipeProgress)="onSwipeProgress(attendee.id, $event)"
                       class="relative p-4 flex items-center justify-between group transition-colors hover:bg-gray-50"
                       [style.backgroundColor]="attendee.attendance ? '#f0fdf4' : 'white'"
                       [class.cursor-pointer]="mode() === 'spoc'"
                       (click)="mode() === 'spoc' ? openDetail(attendee) : null">
                       <!-- Swipe affordance hint -->
                       @if (mode() === 'spoc') {
                         <div class="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-20 pointer-events-none">
                           <svg class="w-3 h-3 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                             <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
                           </svg>
                         </div>
                       }
                       
                       <div class="flex flex-col gap-1.5 min-w-0 flex-1 mr-3">
                          
                          <h4 class="text-sm font-bold text-gray-900 truncate leading-tight flex items-center gap-2">
                             {{ attendee.fullName }}
                             @if (mode() === 'spoc' && attendee.linkedin) {
                               <a [href]="attendee.linkedin" target="_blank" (click)="$event.stopPropagation()" class="text-[#0077b5]">
                                 <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg>
                               </a>
                             }
                             @if (attendee.attendeeType === 'Speaker') {
                               <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                                 Speaker
                               </span>
                             } @else if (attendee.attendeeType === 'Round Table') {
                               <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                                 Round Table
                               </span>
                             }
                          </h4>
                          
                          @if (mode() === 'spoc') {
                             <p class="text-xs text-gray-600 truncate font-medium">{{ attendee.title ? attendee.company + ' - ' + attendee.title : attendee.company }}</p>
                          }
                          
                          <div class="flex flex-wrap gap-2 mt-0.5">
                          
                            @if (attendee.nameCardColor) {
                              <!-- Two separate pills -->
                              <span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold"
                                    [style.background-color]="getLanyardHex(attendee.lanyardColor) + '22'"
                                    [style.color]="getLanyardHex(attendee.lanyardColor)">
                                <span class="w-2 h-2 rounded-full flex-shrink-0"
                                      [style.background-color]="getLanyardHex(attendee.lanyardColor)"></span>
                                LANYARD: {{ attendee.lanyardColor }}
                              </span>
                              <span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold"
                                    [style.background-color]="getLanyardHex(attendee.nameCardColor) + '22'"
                                    [style.color]="getLanyardHex(attendee.nameCardColor)">
                                <span class="w-2 h-2 rounded-none flex-shrink-0"
                                      [style.background-color]="getLanyardHex(attendee.nameCardColor)"></span>
                                ID CARD: {{ attendee.nameCardColor }}
                              </span>
                            } @else {
                              <!-- Original single-colour pill -->
                              <span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold"
                                    [style.background-color]="getLanyardHex(attendee.lanyardColor) + '22'"
                                    [style.color]="getLanyardHex(attendee.lanyardColor)">
                                <span class="w-2 h-2 rounded-full flex-shrink-0"
                                      [style.background-color]="getLanyardHex(attendee.lanyardColor)"></span>
                                LANYARD: {{ attendee.lanyardColor }}
                              </span>
                            }
                            
                  
                            @if (mode() === 'admin' && attendee.printStatus) {
                               <span class="text-[10px] font-bold rounded px-1.5 py-0.5 flex items-center gap-1 border"
                                     [class]="attendee.printStatus === 'Not Printed' ? 'text-red-700 bg-red-50 border-red-100' : 'text-purple-700 bg-purple-50 border-purple-100'">
                                 <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                   <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                 </svg>
                                 {{ attendee.printStatus }}
                               </span>
                            }

                            @if (attendee.spocName && attendee.spocName !== 'Unassigned') {
                              <span class="text-[10px] font-medium text-blue-700 bg-blue-50 border border-blue-100 rounded px-1.5 py-0.5 flex items-center gap-1">
                                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                                {{ attendee.spocName }}
                              </span>
                            }
                          </div>
                       </div>

                       <div class="flex flex-col items-end gap-1 flex-shrink-0">
                          @if (mode() === 'admin') {
                              <button (click)="$event.stopPropagation(); handleAttendanceToggle(attendee.id)"
                                      class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2"
                                      [class.bg-teal-600]="attendee.attendance"
                                      [class.bg-gray-200]="!attendee.attendance">
                                 <span class="sr-only">Use setting</span>
                                 <span aria-hidden="true" 
                                       class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out"
                                       [class.translate-x-5]="attendee.attendance"
                                       [class.translate-x-0]="!attendee.attendance"></span>
                              </button>
                          } @else {
                              <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold"
                                    [class.bg-green-100]="attendee.attendance"
                                    [class.text-green-800]="attendee.attendance"
                                    [class.bg-gray-100]="!attendee.attendance"
                                    [class.text-gray-600]="!attendee.attendance">
                                {{ attendee.attendance ? 'In' : 'Pending' }}
                              </span>
                          }
                          
                          <span class="text-xs text-gray-400 font-medium">
                            {{ attendee.checkInTime ? (attendee.checkInTime | date:'shortTime') : '' }}
                          </span>
                       </div>
                  </div><!-- end sliding card -->
                  </div><!-- end swipe wrapper -->
               }
            </div>
          } @empty {
            <div class="text-center py-12 text-gray-500">
               No attendees found.
            </div>
          }
        </div>

      </main>

      <!-- Detail Modal -->
      @if (selectedAttendee()) {
        <app-attendee-detail
          [attendee]="selectedAttendee()!"
          [isAdmin]="mode() === 'admin'"
          [availableColors]="uniqueLanyardColors()"
          (updateLanyard)="handleLanyardUpdate(selectedAttendee()!.id, $event)"
          (updateAttendance)="handleAttendanceToggle(selectedAttendee()!.id)"
          (updateNote)="handleNoteUpdate(selectedAttendee()!.id, $event)"
          (close)="closeDetail()" />
      }

      <!-- Quick Note Popup -->
      @if (quickNoteTarget()) {
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4 overlay-enter"
             (click)="closeQuickNote()">
          <div class="absolute inset-0 bg-slate-900/70 backdrop-blur-md"></div>

          <div class="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden modal-enter"
               (click)="$event.stopPropagation()">

            <!-- Accent strip -->
            <div class="h-1 w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500"></div>

            <div class="p-5">

              <!-- Header -->
              <div class="flex items-start justify-between mb-4">
                <div>
                  <h2 class="text-base font-bold text-gray-900">Add Note</h2>
                  <p class="text-xs text-gray-500 mt-0.5">
                    @if (quickNoteAccountLabel()) {
                      All attendees from <span class="font-semibold text-gray-700">{{ quickNoteAccountLabel() }}</span>
                    } @else {
                      {{ quickNoteAttendeeName() }}
                    }
                  </p>
                </div>
                <button (click)="closeQuickNote()"
                        class="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors -mt-0.5">
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <!-- Account broadcast banner -->
              @if (quickNoteAccountLabel()) {
                <div class="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5">
                  <svg class="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p class="text-xs text-amber-800">This note will be added to all attendees under this account.</p>
                </div>
              }

              <!-- Existing notes preview (attendee mode only) -->
              @if (quickNoteExistingNotes().length > 0) {
                <div class="mb-4 max-h-32 overflow-y-auto space-y-2 rounded-xl bg-gray-50 border border-gray-200 p-3">
                  @for (entry of quickNoteExistingNotes(); track $index) {
                    <div class="text-xs">
                      <span class="font-semibold text-gray-700">{{ entry.author }}:</span>
                      <span class="text-gray-600 ml-1">{{ entry.text }}</span>
                    </div>
                    @if (!$last) {
                      <hr class="border-gray-200">
                    }
                  }
                </div>
              }

              <!-- Textarea -->
              <textarea
                class="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400
                       focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none transition-colors"
                rows="4"
                placeholder="Type your note…"
                maxlength="1000"
                [value]="quickNoteText()"
                (input)="quickNoteText.set($any($event.target).value)"
                autofocus>
              </textarea>

              <!-- Character counter -->
              <div class="flex justify-end mt-1 mb-4">
                <span class="text-xs transition-colors"
                      [class.text-gray-400]="quickNoteText().length <= 800"
                      [class.text-amber-600]="quickNoteText().length > 800 && quickNoteText().length <= 1000"
                      [class.font-semibold]="quickNoteText().length > 800">
                  {{ quickNoteText().length }}/1000
                  @if (quickNoteText().length > 800) {
                    — approaching limit
                  }
                </span>
              </div>

              <!-- Actions -->
              <div class="flex gap-3">
                <button (click)="closeQuickNote()"
                        class="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
                <button (click)="saveQuickNote()"
                        [disabled]="!quickNoteText().trim()"
                        class="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  Save Note
                </button>
              </div>

            </div>
          </div>
        </div>
      }

    </div>
    } <!-- end @if (!showLoginOverlay()) -->

    <!-- ── Login Overlay ──────────────────────────────────────────────────────
         Shown whenever the session is missing or expired.
         Nothing renders behind it — the dashboard is gated by @if above.
    -->
    @if (showLoginOverlay()) {
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4 overlay-enter">

        <!-- Translucent blurred backdrop — covers the dashboard chrome -->
        <div class="absolute inset-0 bg-slate-900/70 backdrop-blur-md"></div>

        <!-- Modal card -->
        <div class="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden modal-enter">

          <!-- Gradient header strip -->
          <div class="h-1 w-full"
               [style.background]="mode() === 'admin'
                 ? 'linear-gradient(90deg, #0d9488, #14b8a6, #0ea5e9)'
                 : 'linear-gradient(90deg, #3b82f6, #6366f1, #8b5cf6)'">
          </div>

          <div class="p-8 pt-7">

            <!-- Icon + Title -->
            <div class="flex items-center gap-4 mb-6">
              <div class="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                   [class.bg-teal-50]="mode() === 'admin'"
                   [class.bg-blue-50]="mode() === 'spoc'">
                <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
                     [class.text-teal-600]="mode() === 'admin'"
                     [class.text-blue-600]="mode() === 'spoc'">
                  <path stroke-linecap="round" stroke-linejoin="round"
                        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <div>
                <h2 class="text-xl font-bold text-slate-900">
                  {{ mode() === 'admin' ? 'Registration Desk' : 'Sales SPOC' }}
                </h2>
                <p class="text-sm text-slate-500 mt-0.5">
                  {{ mode() === 'admin'
                      ? 'Enter the desk passphrase to continue'
                      : 'Sign in with your BrowserStack account to continue' }}
                </p>
              </div>
            </div>

            <!-- ── SPOC mode: BrowserStack OAuth button ── -->
            @if (mode() === 'spoc') {
              <div class="space-y-3">
                <button
                  (click)="loginWithBrowserStack()"
                  class="w-full py-3 px-4 rounded-xl text-white text-sm font-bold tracking-wide transition-all
                         flex items-center justify-center gap-3 shadow-sm active:scale-95
                         bg-blue-600 hover:bg-blue-700">
                  <img src="https://browserstack.wpenginepowered.com/wp-content/themes/browserstack/img/favicons/apple-touch-icon.png" alt="" class="w-5 h-5">
                  Continue with BrowserStack
                </button>
                <p class="text-center text-xs text-slate-400 pt-1">
                  BrowserStack employees only &middot; You'll be redirected to sign in
                </p>
              </div>
            }

            <!-- ── Desk mode: passphrase form (unchanged) ── -->
            @if (mode() === 'admin') {
              <div class="space-y-3">

                <!-- Passphrase -->
                <div class="relative">
                  <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <svg class="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round"
                            d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                    </svg>
                  </div>
                  <input type="password"
                         [ngModel]="loginPassphrase()"
                         (ngModelChange)="loginPassphrase.set($event)"
                         placeholder="Passphrase"
                         autocomplete="current-password"
                         (keyup.enter)="submitLogin()"
                         class="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all" />
                </div>

                <!-- Error banner -->
                @if (loginError()) {
                  <div class="flex items-center gap-2.5 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm font-medium">
                    <svg class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {{ loginError() }}
                  </div>
                }

                <!-- Submit -->
                <button (click)="submitLogin()"
                        [disabled]="isLoggingIn()"
                        class="w-full mt-1 py-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold tracking-wide transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm active:scale-95">
                  @if (isLoggingIn()) {
                    <svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Verifying…
                  } @else {
                    Access Dashboard
                  }
                </button>

              </div>
            }

          </div>
        </div>
      </div>
    }
  `
})
export class SpocDashboardComponent implements OnInit, OnDestroy {
  dataService = inject(DataService);
  authService = inject(AuthService);
  spocAuth    = inject(SpocAuthService);
  router = inject(Router);

  // Inputs mapped from Route Data/Params
  mode = input.required<'admin' | 'spoc'>();
  eventId = input.required<string>({ alias: 'id' });

  // Auth overlay state
  showLoginOverlay = signal(false);
  loginPassphrase  = signal('');
  loginSpocName    = signal('');
  loginError       = signal('');
  isLoggingIn      = signal(false);

  // Dashboard state
  selectedSpoc = signal<string>('All');
  filterStatus = signal<'all' | 'checked-in' | 'pending'>('all');
  searchQuery  = signal<string>('');
  isSyncing    = signal<boolean>(false);
  selectedAttendee = signal<Attendee | null>(null);
  searchFocused = signal<boolean>(false);
  searchActive = computed(() => this.searchFocused());

  // Quick Notes state
  quickNoteTarget = signal<{ attendeeId: string } | { accountName: string } | null>(null);
  quickNoteText   = signal<string>('');
  swipeProgress = signal<Map<string, { progress: number; offset: number }>>(new Map());

  /** Resolved author name for note attribution — OAuth name takes precedence over passphrase name */
  currentAuthor = computed(() =>
    this.spocAuth.user()?.name || this.authService.spocName() || 'SPOC'
  );

  quickNoteAccountLabel = computed(() => {
    const t = this.quickNoteTarget();
    return t && 'accountName' in t ? t.accountName : null;
  });

  quickNoteAttendeeName = computed(() => {
    const t = this.quickNoteTarget();
    if (!t || !('attendeeId' in t)) return null;
    return this.allAttendees().find(a => a.id === t.attendeeId)?.fullName ?? null;
  });

  quickNoteExistingNotes = computed((): Array<{ author: string; text: string }> => {
    const t = this.quickNoteTarget();
    if (!t || !('attendeeId' in t)) return [];
    const raw = this.allAttendees().find(a => a.id === t.attendeeId)?.notes || '';
    if (!raw.trim()) return [];
    return raw.split('\n---\n').filter(e => e.trim()).map(entry => {
      const colon = entry.indexOf(':');
      if (colon === -1) return { author: 'Unknown', text: entry.trim() };
      return { author: entry.substring(0, colon).trim(), text: entry.substring(colon + 1).trim() };
    });
  });


  allAttendees = this.dataService.getAttendees();

  /** Name shown in the header — OAuth user name for SPOC mode, passphrase session name for desk */
  displayName = computed(() =>
    this.mode() === 'spoc'
      ? (this.spocAuth.user()?.name || 'BrowserStack User')
      : (this.authService.displayName() || 'Desk')
  );

  /** Avatar initial */
  displayInitial = computed(() => (this.displayName().charAt(0) || 'U').toUpperCase());

  private syncInterval: any;

  constructor() {
    // Re-bind selectedAttendee to the freshest backend object after each sync.
    effect(() => {
      const all = this.allAttendees();
      const selected = this.selectedAttendee();

      if (selected && all.length > 0) {
        let match = all.find(a => a.id === selected.id);
        if (!match && selected.email) {
          match = all.find(a => a.email.toLowerCase() === selected.email.toLowerCase());
        }
        if (match && match !== selected) {
          this.selectedAttendee.set(match);
        }
      }
    });

    // Reactively show the login overlay if the SPOC session is cleared externally
    // (e.g. by DataService detecting an auth error from the backend).
    effect(() => {
      if (this.mode() === 'spoc' && !this.spocAuth.isLoggedIn()) {
        this.showLoginOverlay.set(true);
      }
    });
  }

  async ngOnInit() {
    await this.initializeDashboard();

    // Auto-sync interval with per-client jitter to stagger retries and avoid
    // a thundering herd when multiple desk operators are online simultaneously.
    const scheduleSync = () => {
      const delay = SYNC_CONFIG.AUTO_SYNC_INTERVAL_MS + Math.random() * SYNC_CONFIG.SYNC_JITTER_MS;
      this.syncInterval = setTimeout(() => {
        this.syncData();
        scheduleSync();
      }, delay);
    };
    scheduleSync();
  }

  ngOnDestroy() {
    if (this.syncInterval) {
      clearTimeout(this.syncInterval);
    }
  }

  async initializeDashboard() {
    if (this.mode() === 'spoc') {
      // SPOC mode: BrowserStack OAuth. Show the login overlay if no valid session.
      if (!this.spocAuth.isAuthenticated()) {
        this.showLoginOverlay.set(true);
        return;
      }
      await this.loadDashboardData();
      return;
    }

    // Desk mode: existing passphrase overlay flow — unchanged
    if (!this.authService.hasValidSession('desk')) {
      this.showLoginOverlay.set(true);
      return;
    }

    await this.loadDashboardData();
  }

  loginWithBrowserStack(): void {
    const returnUrl = `/event/${this.eventId()}/spoc`;
    this.spocAuth.startLogin(returnUrl);
  }

  async loadDashboardData() {
    const eventId = this.eventId();

    let event = this.dataService.getEventById(eventId);
    if (!event) {
      this.isSyncing.set(true);
      event = await this.dataService.getEventFromMasterLog(eventId);
      this.isSyncing.set(false);
    }

    if (!event) {
      alert('Event not found. Please check the URL or create the event first.');
      this.router.navigate(['/']);
      return;
    }

    this.isSyncing.set(true);
    await this.dataService.loadFromBackend(event.sheetUrl, event.name);
    this.isSyncing.set(false);
  }

  async submitLogin() {
    if (this.isLoggingIn()) return;

    const role = this.mode() === 'admin' ? 'desk' : 'spoc';
    const passphrase = this.loginPassphrase().trim();
    const spocName   = this.loginSpocName().trim();

    if (!passphrase) { this.loginError.set('Please enter a passphrase.'); return; }
    if (role === 'spoc' && !spocName) { this.loginError.set('Please enter your name.'); return; }

    this.loginError.set('');
    this.isLoggingIn.set(true);

    const result = await this.authService.login(role, passphrase, spocName);
    this.isLoggingIn.set(false);

    if (result.success) {
      this.showLoginOverlay.set(false);
      await this.loadDashboardData();
    } else {
      this.loginError.set(result.error || 'Authentication failed.');
    }
  }

  signOut() {
    if (this.mode() === 'spoc') {
      // OAuth session — clear it and navigate back to role selection.
      // The spocOauthGuard will re-trigger BrowserStack login on next visit.
      this.spocAuth.logout();
      this.showLoginOverlay.set(true);
      return;
    }
    // Desk mode: clear passphrase session and show overlay
    this.authService.logout();
    this.showLoginOverlay.set(true);
    this.loginPassphrase.set('');
    this.loginSpocName.set('');
    this.loginError.set('');
  }

  async syncData() {
    const event = this.dataService.getEventById(this.eventId());
    if (event) {
      this.isSyncing.set(true);
      await this.dataService.loadFromBackend(event.sheetUrl, event.name);
      this.isSyncing.set(false);
    }
  }

  uniqueSpocs = computed(() => {
    const spocs = new Set<string>();
    this.allAttendees().forEach(a => {
      if (a.spocName && a.spocName !== 'Unassigned' && !a.spocName.includes('#N/A')) {
        spocs.add(a.spocName.trim());
      }
    });
    return Array.from(spocs).sort();
  });

  uniqueLanyardColors = computed(() => {
    const colors = new Set<string>();
    this.allAttendees().forEach(a => {
      if (a.lanyardColor && a.lanyardColor.trim()) {
        colors.add(a.lanyardColor.trim());
      }
    });
    if (colors.size === 0) return [...LANYARD_COLORS_FALLBACK];
    return Array.from(colors).sort();
  });

  filteredAttendees = computed(() => {
    let list = this.allAttendees();

    // 1. Filter by SPOC 
    if (this.selectedSpoc() !== 'All') {
      list = list.filter(a => a.spocName === this.selectedSpoc());
    }

    if (this.filterStatus() === 'checked-in') {
      list = list.filter(a => a.attendance);
    } else if (this.filterStatus() === 'pending') {
      list = list.filter(a => !a.attendance);
    }

    const q = this.searchQuery().toLowerCase();
    if (q) {
      list = list.filter(a =>
        a.fullName.toLowerCase().includes(q) ||
        a.company.toLowerCase().includes(q)
      );
    }

    return list.sort((a, b) => {
      const companyA = (a.company || '').toLowerCase();
      const companyB = (b.company || '').toLowerCase();
      if (companyA < companyB) return -1;
      if (companyA > companyB) return 1;
      return a.fullName.localeCompare(b.fullName);
    });
  });

  // Grouped attendees for Table View
  groupedAttendees = computed(() => {
    const list = this.filteredAttendees();
    const groups = new Map<string, Attendee[]>();

    list.forEach(a => {
      const key = a.company || 'Other';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(a);
    });

    return Array.from(groups.entries()).map(([name, items]) => ({ name, items }));
  });

  spocFilteredAttendees = computed(() => {
    let list = this.allAttendees();

    // Filter by SPOC
    if (this.selectedSpoc() !== 'All') {
      list = list.filter(a => a.spocName === this.selectedSpoc());
    }

    // Filter by search
    const q = this.searchQuery().toLowerCase();
    if (q) {
      list = list.filter(a =>
        a.fullName.toLowerCase().includes(q) ||
        a.company.toLowerCase().includes(q)
      );
    }

    return list;
  });

  stats = computed(() => {
    const list = this.spocFilteredAttendees();
    const total = list.length;
    const checkedIn = list.filter(a => a.attendance).length;
    return {
      total,
      checkedIn,
      pending: total - checkedIn,
      rate: total > 0 ? Math.round((checkedIn / total) * 100) : 0
    };
  });

  openDetail(attendee: Attendee) {
    this.closeQuickNote();
    this.selectedAttendee.set(attendee);
  }

  closeDetail() {
    this.closeQuickNote();
    this.selectedAttendee.set(null);
  }

  handleLanyardUpdate(id: string, color: string) {
    this.dataService.updateLanyardColor(id, color);
    const updated = this.allAttendees().find(a => a.id === id);
    if (updated) this.selectedAttendee.set(updated);
  }

  handleAttendanceToggle(id: string) {
    if (this.mode() === 'spoc') return;

    this.dataService.toggleAttendance(id);
    const updated = this.allAttendees().find(a => a.id === id);

    // Fix: Only update selectedAttendee if the modal is currently open for this user.
    // This prevents the modal from opening when toggling from the list view.
    if (updated && this.selectedAttendee()?.id === id) {
      this.selectedAttendee.set(updated);
    }
  }

  handleNoteUpdate(id: string, note: string) {
    this.dataService.updateNote(id, note);
    const updated = this.allAttendees().find(a => a.id === id);
    if (updated) this.selectedAttendee.set(updated);
  }

  // ── Quick Notes ─────────────────────────────────────────────────────────────

  swipeCards = viewChildren(SwipeableCardDirective);

  openAttendeeNote(attendeeId: string) {
    this.closeDetail();
    this.quickNoteText.set('');
    this.quickNoteTarget.set({ attendeeId });
  }

  openAccountNote(accountName: string) {
    this.swipeCards().forEach(d => d.reset());
    this.quickNoteText.set('');
    this.quickNoteTarget.set({ accountName });
  }

  /**
   * Called when a card is swiped past the threshold.
   * Opens the notes popup directly (Gmail/Mail style).
   * Does NOT reset swipe state — the card stays open behind the modal.
   */
  onCardSwiped(attendeeId: string) {
    if (this.mode() === 'spoc') {
      this.openAttendeeNote(attendeeId);
    }
  }

  /** Updates swipe progress and offset for a card (called on every touchmove). */
  onSwipeProgress(attendeeId: string, event: { progress: number; offset: number }) {
    this.swipeProgress.update(map => {
      const next = new Map(map);
      next.set(attendeeId, event);
      return next;
    });
  }

  /** Progress (0-1) for a specific side: 'left' panel activates on right swipe, 'right' on left swipe. */
  getSwipePanelProgress(attendeeId: string, panel: 'left' | 'right'): number {
    const state = this.swipeProgress().get(attendeeId);
    if (!state) return 0;
    if (panel === 'right' && state.offset < 0) return state.progress;  // card moved left → right panel visible
    if (panel === 'left'  && state.offset > 0) return state.progress;  // card moved right → left panel visible
    return 0;
  }

  /**
   * Converts panel progress (0-1) into a background color.
   * Interpolates from blue-50 (#eff6ff) → SPOC blue-600 (#2563eb).
   */
  getSwipePanelColor(attendeeId: string, panel: 'left' | 'right'): string {
    const p = this.getSwipePanelProgress(attendeeId, panel);
    const lr = 239, lg = 246, lb = 255;   // blue-50
    const dr = 37,  dg = 99,  db = 235;   // blue-600
    const r = Math.round(lr + (dr - lr) * p);
    const g = Math.round(lg + (dg - lg) * p);
    const b = Math.round(lb + (db - lb) * p);
    return `rgb(${r},${g},${b})`;
  }

  closeQuickNote() {
    this.quickNoteTarget.set(null);
    this.quickNoteText.set('');
    // Reset any swiped cards when closing the popup
    this.swipeCards().forEach(d => d.reset());
  }

  saveQuickNote() {
    const text = this.quickNoteText().trim();
    if (!text) return;

    const author = this.currentAuthor();
    const target = this.quickNoteTarget();
    if (!target) return;

    if ('attendeeId' in target) {
      const attendee = this.allAttendees().find(a => a.id === target.attendeeId);
      if (!attendee) return;
      const entry  = `${author}: ${text}`;
      const existing = attendee.notes || '';
      const updated = existing.trim() ? `${entry}\n---\n${existing}` : entry;
      this.dataService.updateNote(target.attendeeId, updated);
    } else {
      this.dataService.updateNoteForAccount(target.accountName, author, text);
    }

    this.closeQuickNote();
  }

  // ── Keyboard Collapse ───────────────────────────────────────────────────────

  onSearchFocus() {
    this.searchFocused.set(true);
  }

  onSearchBlur() {
    this.searchFocused.set(false);
  }

  onListScroll(event: Event) {
    // Auto-dismiss keyboard on list scroll (only on mobile)
    if (window.innerWidth < 768) {  // md breakpoint
      const searchInput = document.querySelector('.spoc-search-input') as HTMLInputElement;
      if (searchInput && document.activeElement === searchInput) {
        searchInput.blur();
      }
    }
  }

  openWalkIn() {
    const base = window.location.href.split('#')[0];
    window.open(base + '#/register/' + this.eventId(), '_blank');
  }

  getLanyardHex(color: string): string {
    const c = color?.toLowerCase() || '';
    if (c.includes('green')) return '#16a34a';
    if (c.includes('yellow') || c.includes('gold')) return '#ca8a04';
    if (c.includes('red') || c.includes('crimson')) return '#dc2626';
    if (c.includes('blue')) return '#2563eb';
    if (c.includes('purple') || c.includes('violet')) return '#9333ea';
    if (c.includes('orange')) return '#ea580c';
    if (c.includes('grey') || c.includes('gray')) return '#4b5563';
    return '#9ca3af';
  }
}
