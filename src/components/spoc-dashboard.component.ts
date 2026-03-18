import { Component, inject, signal, computed, input, OnInit, OnDestroy, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { DataService, Attendee } from '../services/data.service';
import { AttendeeDetailComponent } from './attendee-detail.component';
import { AuthService } from '../services/auth.service';
import { SYNC_CONFIG, LANYARD_COLORS_FALLBACK } from '../constants';

@Component({
  selector: 'app-spoc-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, AttendeeDetailComponent, RouterModule],
  styles: [`
    @keyframes overlayFadeIn {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    @keyframes modalSlideUp {
      from { opacity: 0; transform: translateY(16px) scale(0.97); }
      to   { opacity: 1; transform: translateY(0)   scale(1);    }
    }
    .overlay-enter { animation: overlayFadeIn 0.2s ease-out forwards; }
    .modal-enter   { animation: modalSlideUp  0.25s cubic-bezier(0.16,1,0.3,1) forwards; }
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
                {{ (authService.displayName() || 'U').charAt(0).toUpperCase() }}
              </div>
              <span class="text-sm text-white font-medium hidden sm:block">{{ authService.displayName() }}</span>
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

      <main class="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        
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
               class="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg leading-5 bg-gray-50 placeholder-gray-500 focus:outline-none focus:bg-white focus:ring-1 sm:text-sm" 
               [class.focus:ring-teal-500]="mode() === 'admin'"
               [class.focus:border-teal-500]="mode() === 'admin'"
               [class.focus:ring-blue-500]="mode() === 'spoc'"
               [class.focus:border-blue-500]="mode() === 'spoc'"
               placeholder="Search by name, company, or email...">
          </div>

          <!-- Filters Row -->
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

        <!-- Stats - Only show for SPOC and Desktop Admin view -->
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



        <!-- DESKTOP TABLE VIEW (Hidden on Mobile) -->
        <div class="hidden md:block bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
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
                      <div class="flex items-center gap-2">
                         <span class="text-xs font-bold text-gray-600 uppercase tracking-wider">{{ group.name }}</span>
                         <span class="text-[10px] font-semibold text-gray-400 bg-white border border-gray-200 px-1.5 rounded-full">{{ group.items.length }}</span>
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
<div class="md:hidden space-y-6">
          @for (group of groupedAttendees(); track group.name) {
            <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
               <div class="bg-gray-50 px-4 py-3 border-b border-gray-200 flex justify-between items-center sticky top-0 z-0">
                  <span class="font-bold text-gray-700 text-sm uppercase tracking-wide">{{ group.name }}</span>
                  <span class="text-xs font-semibold text-gray-500 bg-white border border-gray-200 px-2 py-0.5 rounded-full">{{ group.items.length }}</span>
               </div>

               @for (attendee of group.items; track attendee.id; let last = $last) {
                  <div class="relative p-4 flex items-center justify-between group transition-colors hover:bg-gray-50"
                       [class.border-b]="!last"
                       [class.border-gray-100]="!last"
                       [class.cursor-pointer]="mode() === 'spoc'"
                       (click)="mode() === 'spoc' ? openDetail(attendee) : null">
                       
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
                  </div>
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
                      : 'Enter your name and passphrase to continue' }}
                </p>
              </div>
            </div>

            <!-- Form fields -->
            <div class="space-y-3">

              <!-- SPOC name (SPOC variant only) -->
              @if (mode() === 'spoc') {
                <div class="relative">
                  <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <svg class="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round"
                            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <input type="text"
                         [ngModel]="loginSpocName()"
                         (ngModelChange)="loginSpocName.set($event)"
                         placeholder="Your Name"
                         autocomplete="name"
                         class="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" />
                </div>
              }

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
                       class="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 transition-all focus:border-transparent"
                       [class.focus:ring-teal-500]="mode() === 'admin'"
                       [class.focus:ring-blue-500]="mode() === 'spoc'" />
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
                      class="w-full mt-1 py-3 rounded-xl text-white text-sm font-bold tracking-wide transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm active:scale-95"
                      [class.bg-teal-600]="mode() === 'admin'"
                      [class.hover:bg-teal-700]="mode() === 'admin' && !isLoggingIn()"
                      [class.bg-blue-600]="mode() === 'spoc'"
                      [class.hover:bg-blue-700]="mode() === 'spoc' && !isLoggingIn()">
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
          </div>
        </div>
      </div>
    }
  `
})
export class SpocDashboardComponent implements OnInit, OnDestroy {
  dataService = inject(DataService);
  authService = inject(AuthService);
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


  allAttendees = this.dataService.getAttendees();

  private syncInterval: any;

  constructor() {
    // If we have an open modal (selectedAttendee), and the data refreshes from the backend (allAttendees),
    // we need to re-bind the selectedAttendee to the new object in the array to ensure
    // that any actions (like edits or status toggles) use the freshest object reference.
    // This also handles the case where IDs might be regenerated by the backend parser.
    effect(() => {
      const all = this.allAttendees();
      const selected = this.selectedAttendee();

      if (selected && all.length > 0) {
        // Try to find the same attendee in the new list
        // First by ID (if stable)
        let match = all.find(a => a.id === selected.id);

        // Fallback to email if ID changed (e.g. parser regeneration)
        if (!match && selected.email) {
          match = all.find(a => a.email.toLowerCase() === selected.email.toLowerCase());
        }

        if (match && match !== selected) {
          // Update the reference silently so the modal stays open with fresh data
          this.selectedAttendee.set(match);
        }
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
    const requiredRole = this.mode() === 'admin' ? 'desk' : 'spoc';

    // Show login overlay if no valid session — data fetch is deferred until after login
    if (!this.authService.hasValidSession(requiredRole)) {
      this.showLoginOverlay.set(true);
      return;
    }

    await this.loadDashboardData();
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
    this.selectedAttendee.set(attendee);
  }

  closeDetail() {
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
