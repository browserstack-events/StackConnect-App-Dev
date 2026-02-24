import { Component, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Attendee } from '../services/data.service';
import { DummyAuthService } from '../services/dummy-auth.service';

@Component({
  selector: 'app-attendee-detail',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="relative z-50" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <!-- Backdrop -->
      <div class="fixed inset-0 bg-gray-900/50 transition-opacity backdrop-blur-sm" (click)="close.emit()"></div>

      <!-- Scrollable Container -->
      <div class="fixed inset-0 z-10 w-screen overflow-y-auto">
        <div class="flex min-h-full items-center justify-center p-4 sm:p-6 text-center">
          
          <!-- Modal Panel -->
          <div class="relative w-full max-w-lg transform overflow-hidden rounded-2xl bg-white p-6 text-left shadow-xl transition-all border-t-4"
               [class.border-green-500]="attendee().attendance"
               [class.border-gray-300]="!attendee().attendance"
               (click)="$event.stopPropagation()">
            
            <!-- Header -->
            <div class="flex items-start justify-between">
              <div class="flex-1">
                <div class="flex items-center gap-2">
                  <h3 class="text-xl font-bold leading-6 text-gray-900">
                    {{ attendee().fullName }}
                  </h3>
                  @if (attendee().linkedin) {
                    <a [href]="attendee().linkedin" target="_blank" class="text-[#0077b5] hover:opacity-80 transition-opacity">
                      <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
                      </svg>
                    </a>
                  }
                </div>
                <div class="mt-1">
                  <span class="text-sm text-gray-500 font-medium">{{ attendee().title ? attendee().company + ' - ' + attendee().title : attendee().company }}</span>
                </div>
              </div>
              <button (click)="close.emit()" class="text-gray-400 hover:text-gray-500 bg-gray-50 rounded-full p-1">
                <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div class="mt-6 space-y-4">
              <!-- Status Banner & Toggle -->
              <div class="flex items-center justify-between gap-3 p-3 rounded-lg transition-colors" 
                   [class.bg-green-50]="attendee().attendance" 
                   [class.bg-gray-50]="!attendee().attendance">
                
                <div class="flex items-center gap-3"
                   [class.text-green-700]="attendee().attendance"
                   [class.text-gray-700]="!attendee().attendance">
                    @if (attendee().attendance) {
                      <div class="flex-shrink-0">
                        <svg class="h-5 w-5 text-green-600" viewBox="0 0 20 20" fill="currentColor">
                          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
                        </svg>
                      </div>
                      <div>
                        <div class="text-sm font-semibold">Checked In</div>
                        @if (attendee().checkInTime) {
                          <div class="text-xs opacity-75">
                            {{ attendee().checkInTime | date:'shortTime' }}
                          </div>
                        }
                      </div>
                    } @else {
                      <div class="flex-shrink-0">
                        <svg class="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                           <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd" />
                        </svg>
                      </div>
                      <div class="text-sm font-semibold">Registered</div>
                    }
                </div>

                @if (!attendee().attendance && isAdmin()) {
                  <button 
                    (click)="updateAttendance.emit()"
                    [disabled]="isEditingNote()"
                    class="px-3 py-1 text-xs font-semibold rounded-full border shadow-sm transition-all active:scale-95 disabled:opacity-50"
                    [class.bg-red-50]="attendee().attendance"
                    [class.text-red-700]="attendee().attendance"
                    [class.border-red-200]="attendee().attendance"
                    [class.hover:bg-red-100]="attendee().attendance"
                    [class.bg-green-50]="!attendee().attendance"
                    [class.text-green-700]="!attendee().attendance"
                    [class.border-green-200]="!attendee().attendance"
                    [class.hover:bg-green-100]="!attendee().attendance">
                    {{ attendee().attendance ? 'Undo Check-in' : 'Check In' }}
                  </button>
                }
              </div>

              <!-- Admin: SPOC Display (Visible to All now per request) -->
              <div class="flex items-center justify-between p-3 rounded-lg border border-blue-100 bg-blue-50">
                 <div class="flex items-center gap-2 text-blue-800">
                   <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                     <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                   </svg>
                   <span class="text-xs font-bold uppercase tracking-wide">SPOC</span>
                 </div>
                 <span class="text-sm font-semibold text-blue-900">{{ attendee().spocName }}</span>
              </div>

              <!-- Key Intel Grid -->
              <div class="grid grid-cols-3 gap-3">
                <div class="bg-gray-50 p-3 rounded-lg">
                  <span class="block text-xs font-medium text-gray-500 uppercase tracking-wider">Lanyard</span>

                  @if (isAdmin()) {
                     <select
                       [ngModel]="attendee().lanyardColor"
                       (ngModelChange)="updateLanyard.emit($event)"
                       [disabled]="isEditingNote()"
                       class="mt-1 block w-full rounded-md border border-gray-300 bg-white py-1.5 px-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 disabled:opacity-50">
                       <option [ngValue]="''">Select Color</option>
                       @for(color of availableColors(); track color) {
                         <option [value]="color">{{color}}</option>
                       }
                     </select>
                  } @else {
                    <span class="inline-flex items-center gap-1 mt-1 px-2 py-1 rounded-full text-xs font-bold"
                          [style.background-color]="getLanyardHex(attendee().lanyardColor) + '22'"
                          [style.color]="getLanyardHex(attendee().lanyardColor)">
                      <span class="w-2 h-2 rounded-full flex-shrink-0"
                            [style.background-color]="getLanyardHex(attendee().lanyardColor)"></span>
                      {{ attendee().lanyardColor || 'N/A' }}
                    </span>
                  }
                </div>

                <div class="bg-gray-50 p-3 rounded-lg">
                  <span class="block text-xs font-medium text-gray-500 uppercase tracking-wider">Name Card</span>
                  <div class="mt-1">
                    @if (attendee().nameCardColor) {
                      <span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold"
                            [style.background-color]="getLanyardHex(attendee().nameCardColor) + '22'"
                            [style.color]="getLanyardHex(attendee().nameCardColor)">
                        <span class="w-2 h-2 rounded-none flex-shrink-0"
                              [style.background-color]="getLanyardHex(attendee().nameCardColor)"></span>
                        {{ attendee().nameCardColor }}
                      </span>
                    } @else {
                      <span class="text-gray-400 italic text-sm">—</span>
                    }
                  </div>
                </div>

                <div class="bg-gray-50 p-3 rounded-lg">
                   <span class="block text-xs font-medium text-gray-500 uppercase tracking-wider">Segment</span>
                   <span class="block mt-1 text-sm font-semibold text-gray-900">{{ attendee().segment || 'General' }}</span>
                </div>
              </div>

              <!-- Contact Info -->
              <div class="border-t border-gray-100 pt-4">
                <h4 class="text-xs font-semibold text-gray-500 uppercase mb-3">Contact Information</h4>
                <div class="space-y-3">
                  <div class="flex items-center gap-3 text-sm text-gray-600">
                    <svg class="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <a [href]="'mailto:' + attendee().email" class="hover:text-blue-600 truncate">{{ attendee().email }}</a>
                  </div>
                  @if (attendee().contact) {
                  <div class="flex items-center gap-3 text-sm text-gray-600 group">
                    <svg class="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    <a [href]="'tel:' + attendee().contact" class="hover:text-blue-600">{{ attendee().contact }}</a>
                    <button (click)="copyToClipboard(attendee().contact)" 
                            class="text-gray-400 hover:text-blue-600 p-1 rounded-md hover:bg-gray-100 transition-colors" 
                            title="Copy number">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                    </button>
                  </div>
                  }
                  
                  @if (attendee().linkedin) {
                    <div class="flex items-center gap-3 text-sm text-gray-600">
                      <svg class="w-4 h-4 text-[#0077b5]" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
                      </svg>
                      <a [href]="attendee().linkedin" target="_blank" class="text-[#0077b5] hover:underline">View LinkedIn Profile</a>
                    </div>
                  }
                  
                  @if (attendee().title) {
                    <div class="flex items-center gap-3 text-sm text-gray-600">
                      <svg class="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                      <span class="font-medium">{{ attendee().title }}</span>
                    </div>
                  }
                </div>
              </div>

              <!-- Intel & Notes (HIDDEN FOR ADMIN) -->
              @if (!isAdmin()) {
                <!-- Talking Points / Intel -->
                <div class="border-t border-gray-100 pt-4">
                  <h4 class="text-xs font-semibold text-gray-500 uppercase mb-2">Talking Points / Intel</h4>
                  <div class="bg-yellow-50 text-yellow-800 text-sm p-3 rounded-md border border-yellow-100">
                    @if (attendee().leadIntel) {
                      <p [innerHTML]="renderMarkdown(attendee().leadIntel)"></p>
                    } @else {
                      <p class="italic text-gray-500">No specific intel available.</p>
                    }
                  </div>
                </div>

                <!-- Notes Section (ONLY if logged in) -->
                @if (dummyAuth.isLoggedIn()()) {
                  <div class="border-t border-gray-100 pt-4">
                    <div class="flex items-center justify-between mb-3">
                      <h4 class="text-xs font-semibold text-gray-500 uppercase">Notes</h4>
                      @if (!isAddingNote() && !isEditingNote()) {
                        <button 
                          (click)="onAddNoteClick()"
                          class="flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border border-blue-200">
                          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                          </svg>
                          Add Note
                        </button>
                      }
                    </div>

                    <!-- Add Note Form -->
                    @if (isAddingNote()) {
                      <div class="bg-gray-50 p-4 rounded-lg border border-gray-200 mb-3">
                        <textarea 
                          [ngModel]="newNoteText()"
                          (ngModelChange)="newNoteText.set($event)"
                          placeholder="Enter your note here..."
                          rows="3"
                          class="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm resize-none"
                          [disabled]="isEditingNote()"></textarea>
                        <div class="flex gap-2 mt-3">
                          <button 
                            (click)="saveNewNote()"
                            [disabled]="!newNoteText().trim() || isEditingNote()"
                            class="flex-1 bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center justify-center gap-2">
                            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                            </svg>
                            Submit
                          </button>
                          <button 
                            (click)="cancelAddNote()"
                            [disabled]="isEditingNote()"
                            class="flex-1 bg-white text-gray-700 border border-gray-300 font-semibold py-2 px-4 rounded-lg hover:bg-gray-50 disabled:opacity-50 text-sm">
                            Cancel
                          </button>
                        </div>
                      </div>
                    }

                    <!-- Notes List -->
                    <div class="space-y-3">
                      @for (note of parseNotes(); track $index) {
                        <div class="bg-blue-50 border border-blue-100 rounded-lg p-3">
                          <div class="flex items-start gap-2 mb-1.5">
                            <div class="flex-shrink-0 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                              {{ note.author.charAt(0).toUpperCase() }}
                            </div>
                            <div class="flex-1 min-w-0">
                              <div class="text-xs font-semibold text-blue-900">{{ note.author }}</div>
                              <p class="text-sm text-blue-800 mt-1 whitespace-pre-line break-words">{{ note.text }}</p>
                            </div>
                          </div>
                        </div>
                      } @empty {
                        <div class="text-center py-6 text-gray-400 italic text-sm">
                          No notes yet. Click "+ Add Note" to get started.
                        </div>
                      }
                    </div>
                  </div>
                }
              }

            </div>

            <!-- Modal Actions (HIDDEN FOR ADMIN) -->
            @if (!isAdmin()) {
              <div class="mt-8 flex gap-3">
                @if (!isEditingNote()) {
                  <button (click)="close.emit()" class="flex-1 bg-white text-gray-700 border border-gray-300 font-semibold py-2 px-4 rounded-lg hover:bg-gray-50">
                    Close
                  </button>
                } @else {
                  <button (click)="cancelNoteEdit()" class="flex-1 bg-white text-gray-700 border border-gray-300 font-semibold py-2 px-4 rounded-lg hover:bg-gray-50">
                    Cancel
                  </button>
                  <button 
                    (click)="saveNote()"
                    class="flex-1 bg-green-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-700 shadow-sm flex items-center justify-center gap-2">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                    </svg>
                    Save Note
                  </button>
                }
              </div>
            }

          </div>
        </div>
      </div>
    </div>
  `
})
export class AttendeeDetailComponent {
  attendee = input.required<Attendee>();
  isAdmin = input<boolean>(false);
  availableColors = input<string[]>([]);
  
  close = output<void>();
  updateLanyard = output<string>();
  updateAttendance = output<void>();
  updateNote = output<string>();

  dummyAuth = inject(DummyAuthService);

  isEditingNote = signal(false);
  noteText = signal('');
  //Notes Management
  isAddingNote = signal(false);
  newNoteText = signal('');

  renderMarkdown(text: string): string {
    if (!text) return '';
    return text
      // Escape HTML entities first to prevent injection
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      // Bold: **text**
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      // Italic: *text* (single asterisk)
      .replace(/\*([^*\n]+?)\*/g, '<em>$1</em>')
      // Line breaks
      .replace(/\n/g, '<br>');
  }

  getLanyardHex(color: string | undefined): string {
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

  // Parse notes string into structured array
  parseNotes(): Array<{ author: string; text: string; timestamp?: string }> {
    const notesStr = this.attendee().notes || '';
    if (!notesStr.trim()) return [];

    const entries = notesStr.split('\n---\n').filter(e => e.trim());
    
    return entries.map(entry => {
      const colonIndex = entry.indexOf(':');
      if (colonIndex === -1) {
        return { author: 'Unknown', text: entry.trim() };
      }
      
      const author = entry.substring(0, colonIndex).trim();
      const text = entry.substring(colonIndex + 1).trim();
      
      return { author, text };
    });
  }

  onAddNoteClick() {
    this.newNoteText.set('');
    this.isAddingNote.set(true);
  }

  cancelAddNote() {
    this.isAddingNote.set(false);
    this.newNoteText.set('');
  }

  saveNewNote() {
    const noteText = this.newNoteText().trim();
    if (!noteText) return;

    const user = this.dummyAuth.getUser()();
    if (!user) {
      alert('You must be logged in to add notes');
      return;
    }

    // Build author prefix
    const authorPrefix = `${user.name} (${user.email})`;
    const newEntry = `${authorPrefix}: ${noteText}`;

    // Prepend to existing notes with \n---\n delimiter
    const existingNotes = this.attendee().notes || '';
    const updatedNotes = existingNotes.trim() 
      ? `${newEntry}\n---\n${existingNotes}` 
      : newEntry;

    this.updateNote.emit(updatedNotes);
    this.isAddingNote.set(false);
    this.newNoteText.set('');
  }


  // onAddNoteClick() {
  //   this.noteText.set(this.attendee().notes || '');
  //   this.isEditingNote.set(true);
  // }

  saveNote() {
    this.updateNote.emit(this.noteText());
    this.isEditingNote.set(false);
  }

  cancelNoteEdit() {
    this.isEditingNote.set(false);
  }

  copyToClipboard(val: string) {
    navigator.clipboard.writeText(val);
  }
}