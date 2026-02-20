/**
 * SALES SPOC DASHBOARD BACKEND - Version 9
 * Integrated Check-In Email Notification System
 * - Sends email alerts to SPOC when attendees check in
 * - Includes attendee summary lists in emails
 * - Tracks email sending status to prevent duplicates
 * - Added Designation & LinkedIn column support
 */

const MASTER_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1gtZuWwqtI-oI3njQy5hKxmgIfcnyDiRM5FSOBiHeUeA/edit?gid=493451901#gid=493451901';

function doGet(e) {
  if (!e.parameter.action && !e.postData) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'online',
      version: 'v9-email-notifications',
      timestamp: new Date().toISOString(),
      hasEmailFunction: typeof sendCheckInNotification !== 'undefined'
    })).setMimeType(ContentService.MimeType.JSON);
  }

  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  try {
    // 1. Parse Parameters immediately
    const params = e.parameter || {};
    const postData = e.postData ? JSON.parse(e.postData.contents) : {};
    
    // Merge params and postData for easier handling
    const data = { ...params, ...postData };
    const action = data.action;

    // 2. SEGREGATION: Identify Action Type
    // READ Actions (No Lock needed - High Concurrency)
    const readActions = ['read', 'get_event', 'get_all_events', 'metadata'];
    
    if (readActions.includes(action)) {
      return handleReadActions(action, data);
    }

    // WRITE Actions (Lock Required - Data Safety)
    // 'update', 'add', 'log_event', 'update_event'
    return handleWriteActions(action, data);

  } catch (error) {
    return jsonResponse({ status: 'error', error: 'Request Failed: ' + error.toString() });
  }
}

function handleReadActions(action, data) {
  // --- MASTER SHEET READS ---
  if (action === 'get_event') return getEventFromMaster(data.eventId);
  if (action === 'get_all_events') return getAllEventsFromMaster();

  // --- EVENT SHEET READS ---
  if (!data.sheetUrl && !data.sheetName) {
     return jsonResponse({ status: 'error', error: 'Missing sheetUrl or sheetName' });
  }

  // Open Spreadsheet
  let ss;
  try {
    ss = data.sheetUrl ? SpreadsheetApp.openByUrl(data.sheetUrl) : SpreadsheetApp.getActiveSpreadsheet();
  } catch (e) {
    return jsonResponse({ status: 'error', error: 'Invalid Sheet URL' });
  }

  if (action === 'metadata') {
    const sheetNames = ss.getSheets().map(s => s.getName());
    return jsonResponse({ status: 'success', sheets: sheetNames });
  }

  if (action === 'read') {
    const sheetName = data.sheetName || ss.getSheets()[0].getName();
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return jsonResponse({ status: 'error', error: `Sheet "${sheetName}" not found` });

    // *** CACHING LAYER ***
    // We cache the "read" response for 15 seconds.
    // This prevents 50 SPOCs from hammering the sheet simultaneously.
    const cache = CacheService.getScriptCache();
    const cacheKey = 'read_' + sheet.getSheetId(); // Unique ID for this specific sheet
    const cachedResponse = cache.get(cacheKey);

    if (cachedResponse) {
      // Serve from RAM (Super Fast)
      return ContentService.createTextOutput(cachedResponse).setMimeType(ContentService.MimeType.JSON);
    }

    // If not in cache, read from Sheet (Slow)
    const resultResponse = readData(sheet);
    
    // Save to Cache for next user (Store for 15 seconds)
    // Note: CacheService has a size limit (100KB). If data is huge, put() might fail, 
    // so we wrap it in try/catch to ensure the app doesn't crash.
    try {
      const responseString = resultResponse.getContent();
      cache.put(cacheKey, responseString, 15); 
    } catch (e) {
      Logger.log('Cache save failed (likely too big): ' + e.toString());
    }

    return resultResponse;
  }

  return jsonResponse({ status: 'error', error: 'Unknown Read Action' });
}

function handleWriteActions(action, data) {
  const lock = LockService.getScriptLock();
  
  // Try to get lock for 10 seconds.
  // If the server is busy processing another WRITE, this waits.
  // READS do not trigger this wait.
  const hasLock = lock.tryLock(10000); 

  if (!hasLock) {
    return jsonResponse({ status: 'error', error: 'Server is busy. Please try again.' });
  }

  try {
    // --- MASTER SHEET WRITES ---
    if (action === 'log_event') return logEventToMaster(data);
    if (action === 'update_event') return updateEventInMaster(data);

    // --- EVENT SHEET WRITES ---
    let ss;
    if (data.sheetUrl) {
      ss = SpreadsheetApp.openByUrl(data.sheetUrl);
    } else {
      ss = SpreadsheetApp.getActiveSpreadsheet();
    }

    const targetSheetName = data.sheetName;
    let sheet;
    if (targetSheetName) {
      sheet = ss.getSheetByName(targetSheetName);
      if (!sheet) return jsonResponse({ status: 'error', error: `Sheet "${targetSheetName}" not found` });
    } else {
      sheet = ss.getSheets()[0];
    }

    if (action === 'add') {
      const result = addWalkIn(sheet, data);
      
      // Clear the cache because we just changed data!
      clearSheetCache(sheet.getSheetId());
      return result;
    }

    if (action === 'update') {
      // Pass the lock so updateAttendee can release it early if it needs to send emails
      const result = updateAttendee(sheet, data, lock);
      
      // Clear the cache because we just changed data!
      clearSheetCache(sheet.getSheetId());
      return result;
    }

    return jsonResponse({ status: 'error', error: 'Unknown Write Action' });

  } catch (error) {
    return jsonResponse({ status: 'error', error: error.toString() });
  } finally {
    // Always release lock if it hasn't been released yet
    try { lock.releaseLock(); } catch (e) {}
  }
}

// Helper to invalidate cache when data changes
function clearSheetCache(sheetId) {
  try {
    const cache = CacheService.getScriptCache();
    cache.remove('read_' + sheetId);
  } catch (e) {
    Logger.log('Failed to clear cache: ' + e);
  }
}

/**
 * ✅ UPDATED: logEventToMaster
 * Preserves 'State' and 'Default SPOC' columns from your current codebase
 */
function logEventToMaster(data) {
  if (!MASTER_SHEET_URL || MASTER_SHEET_URL.includes('YOUR_MASTER_SHEET_ID')) {
    return jsonResponse({ status: 'error', error: 'MASTER_SHEET_URL not configured in Apps Script' });
  }

  try {
    const ss = SpreadsheetApp.openByUrl(MASTER_SHEET_URL);
    let masterSheet = ss.getSheetByName('Master Event Log');

    if (!masterSheet) {
      masterSheet = ss.insertSheet('Master Event Log');
      masterSheet.appendRow([
        'Event ID', 'Event Name', 'Sheet Name', 'Spreadsheet URL', 'Desk Link',
        'Sales SPOC Link', 'Walkin Link', 'Created At', 'Event Date',
        'State', 'Default SPOC Name', 'Default SPOC Email', 'Default SPOC Slack'
      ]);
      masterSheet.getRange(1, 1, 1, 13).setFontWeight('bold');
      masterSheet.setFrozenRows(1);
    }

    masterSheet.appendRow([
      data.eventId,
      data.eventName,
      data.eventName,
      data.sheetUrl,
      data.deskLink,
      data.spocLink,
      data.walkinLink,
      new Date(data.createdAt),
      data.eventDate || '',
      data.state || 'Active',
      data.defaultSpocName || '',
      data.defaultSpocEmail || '',
      data.defaultSpocSlack || ''
    ]);

    SpreadsheetApp.flush();
    return jsonResponse({ status: 'success', message: 'Event logged to master sheet' });
  } catch (error) {
    return jsonResponse({ status: 'error', error: 'Failed to log event: ' + error.toString() });
  }
}

function getAllEventsFromMaster() {
  if (!MASTER_SHEET_URL || MASTER_SHEET_URL.includes('YOUR')) {
    return jsonResponse({ status: 'error', error: 'MASTER_SHEET_URL not configured' });
  }

  try {
    const ss = SpreadsheetApp.openByUrl(MASTER_SHEET_URL);
    const masterSheet = ss.getSheetByName('Master Event Log');

    if (!masterSheet) return jsonResponse({ status: 'success', events: [] });

    const data = masterSheet.getDataRange().getValues();
    const events = [];

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (row[0]) {
        events.push({
          eventId: row[0],
          eventName: row[1],
          sheetUrl: row[3],
          createdAt: row[7],
          eventDate: row[8] || '',
          state: row[9] || 'Active',
          defaultSpocName: row[10] || '',
          defaultSpocEmail: row[11] || '',
          defaultSpocSlack: row[12] || ''
        });
      }
    }
    return jsonResponse({ status: 'success', events: events });
  } catch (error) {
    return jsonResponse({ status: 'error', error: 'Failed to fetch events: ' + error.toString() });
  }
}

function updateEventInMaster(data) {
  if (!MASTER_SHEET_URL || MASTER_SHEET_URL.includes('YOUR')) return jsonResponse({ status: 'error', error: 'MASTER_SHEET_URL not configured' });
  if (!data.eventId) return jsonResponse({ status: 'error', error: 'eventId is required' });

  try {
    const ss = SpreadsheetApp.openByUrl(MASTER_SHEET_URL);
    const masterSheet = ss.getSheetByName('Master Event Log');
    if (!masterSheet) return jsonResponse({ status: 'error', error: 'Master Event Log sheet not found' });

    const values = masterSheet.getDataRange().getValues();
    let targetRow = -1;

    for (let i = 1; i < values.length; i++) {
      if (String(values[i][0]) === String(data.eventId)) {
        targetRow = i + 1;
        break;
      }
    }

    if (targetRow === -1) return jsonResponse({ status: 'error', error: 'Event ID not found: ' + data.eventId });

    // Update fields (State, Date, Defaults)
    if (data.state !== undefined) masterSheet.getRange(targetRow, 10).setValue(data.state);
    if (data.eventDate !== undefined) masterSheet.getRange(targetRow, 9).setValue(data.eventDate);
    if (data.defaultSpocName !== undefined) masterSheet.getRange(targetRow, 11).setValue(data.defaultSpocName);
    if (data.defaultSpocEmail !== undefined) masterSheet.getRange(targetRow, 12).setValue(data.defaultSpocEmail);
    if (data.defaultSpocSlack !== undefined) masterSheet.getRange(targetRow, 13).setValue(data.defaultSpocSlack);

    SpreadsheetApp.flush();
    return jsonResponse({ status: 'success', message: 'Event updated successfully', eventId: data.eventId });
  } catch (error) {
    return jsonResponse({ status: 'error', error: 'Failed to update event: ' + error.toString() });
  }
}

function getEventFromMaster(eventId) {
  if (!MASTER_SHEET_URL || MASTER_SHEET_URL.includes('YOUR')) return jsonResponse({ status: 'error', error: 'MASTER_SHEET_URL not configured' });

  try {
    const ss = SpreadsheetApp.openByUrl(MASTER_SHEET_URL);
    const masterSheet = ss.getSheetByName('Master Event Log');
    if (!masterSheet) return jsonResponse({ status: 'error', error: 'Master Event Log sheet not found' });

    const data = masterSheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(eventId)) {
        const row = data[i];
        return jsonResponse({
          status: 'success', event: {
            id: row[0], name: row[1], sheetName: row[2], sheetUrl: row[3],
            deskLink: row[4], spocLink: row[5], walkinLink: row[6], createdAt: row[7],
            eventDate: row[8] || '', state: row[9] || 'Active',
            defaultSpocName: row[10] || '', defaultSpocEmail: row[11] || '', defaultSpocSlack: row[12] || ''
          }
        });
      }
    }
    return jsonResponse({ status: 'error', error: 'Event ID not found: ' + eventId });
  } catch (error) {
    return jsonResponse({ status: 'error', error: 'Failed to retrieve event: ' + error.toString() });
  }
}

/**
 * UPDATED: getAllEventsFromMaster
 * - Returns 'state' instead of 'archived'
 * - Returns default SPOC fields
 */
function getAllEventsFromMaster() {
  if (!MASTER_SHEET_URL || MASTER_SHEET_URL.includes('YOUR')) {
    return jsonResponse({ status: 'error', error: 'MASTER_SHEET_URL not configured' });
  }

  try {
    const ss = SpreadsheetApp.openByUrl(MASTER_SHEET_URL);
    const masterSheet = ss.getSheetByName('Master Event Log');

    if (!masterSheet) {
      return jsonResponse({ status: 'success', events: [] });
    }

    const data = masterSheet.getDataRange().getValues();
    const events = [];

    // Skip header row
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (row[0]) {
        events.push({
          eventId: row[0],
          eventName: row[1],
          sheetUrl: row[3],
          createdAt: row[7],
          eventDate: row[8] || '',
          state: row[9] || 'Active',           // Column 10
          defaultSpocName: row[10] || '',      // Column 11
          defaultSpocEmail: row[11] || '',     // Column 12
          defaultSpocSlack: row[12] || ''      // Column 13
        });
      }
    }

    return jsonResponse({ status: 'success', events: events });
  } catch (error) {
    return jsonResponse({ status: 'error', error: 'Failed to fetch events: ' + error.toString() });
  }
}


/**
 * UPDATED: updateEventInMaster
 * - Supports updating 'state' (Active/Archived/Deleted)
 * - Supports updating default SPOC fields
 */
function updateEventInMaster(data) {
  if (!MASTER_SHEET_URL || MASTER_SHEET_URL.includes('YOUR')) {
    return jsonResponse({ status: 'error', error: 'MASTER_SHEET_URL not configured' });
  }

  if (!data.eventId) {
    return jsonResponse({ status: 'error', error: 'eventId is required' });
  }

  try {
    const ss = SpreadsheetApp.openByUrl(MASTER_SHEET_URL);
    const masterSheet = ss.getSheetByName('Master Event Log');

    if (!masterSheet) {
      return jsonResponse({ status: 'error', error: 'Master Event Log sheet not found' });
    }

    const dataRange = masterSheet.getDataRange();
    const values = dataRange.getValues();

    // Find the row with matching eventId
    let targetRow = -1;
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][0]) === String(data.eventId)) {
        targetRow = i + 1; // Convert to 1-based index
        break;
      }
    }

    if (targetRow === -1) {
      return jsonResponse({
        status: 'error',
        error: 'Event ID not found: ' + data.eventId
      });
    }

    const updates = [];

    // Update state (column 10)
    if (data.state !== undefined) {
      const validStates = ['Active', 'Archived', 'Deleted'];
      if (validStates.indexOf(data.state) === -1) {
        return jsonResponse({
          status: 'error',
          error: 'Invalid state. Must be: Active, Archived, or Deleted'
        });
      }
      masterSheet.getRange(targetRow, 10).setValue(data.state);
      updates.push('state=' + data.state);
      Logger.log('Updated state to: ' + data.state);
    }

    // Update event date (column 9)
    if (data.eventDate !== undefined) {
      masterSheet.getRange(targetRow, 9).setValue(data.eventDate);
      updates.push('eventDate=' + data.eventDate);
      Logger.log('Updated event date to: ' + data.eventDate);
    }

    // Update default SPOC name (column 11)
    if (data.defaultSpocName !== undefined) {
      masterSheet.getRange(targetRow, 11).setValue(data.defaultSpocName);
      updates.push('defaultSpocName=' + data.defaultSpocName);
      Logger.log('Updated default SPOC name to: ' + data.defaultSpocName);
    }

    // Update default SPOC email (column 12)
    if (data.defaultSpocEmail !== undefined) {
      masterSheet.getRange(targetRow, 12).setValue(data.defaultSpocEmail);
      updates.push('defaultSpocEmail=' + data.defaultSpocEmail);
      Logger.log('Updated default SPOC email to: ' + data.defaultSpocEmail);
    }

    // Update default SPOC slack (column 13)
    if (data.defaultSpocSlack !== undefined) {
      masterSheet.getRange(targetRow, 13).setValue(data.defaultSpocSlack);
      updates.push('defaultSpocSlack=' + data.defaultSpocSlack);
      Logger.log('Updated default SPOC slack to: ' + data.defaultSpocSlack);
    }

    SpreadsheetApp.flush();

    return jsonResponse({
      status: 'success',
      message: 'Event updated: ' + updates.join(', '),
      eventId: data.eventId
    });

  } catch (error) {
    Logger.log('❌ ERROR in updateEventInMaster: ' + error.toString());
    return jsonResponse({
      status: 'error',
      error: 'Failed to update event: ' + error.toString()
    });
  }
}

function getEventFromMaster(eventId) {
  if (!MASTER_SHEET_URL || MASTER_SHEET_URL.includes('YOUR')) {
    return jsonResponse({ status: 'error', error: 'MASTER_SHEET_URL not configured' });
  }

  try {
    const ss = SpreadsheetApp.openByUrl(MASTER_SHEET_URL);
    const masterSheet = ss.getSheetByName('Master Event Log');

    if (!masterSheet) {
      return jsonResponse({ status: 'error', error: 'Master Event Log sheet not found' });
    }

    const data = masterSheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(eventId)) {
        const row = data[i];
        const event = {
          id: row[0],
          name: row[1],
          sheetName: row[2],
          sheetUrl: row[3],
          deskLink: row[4],
          spocLink: row[5],
          walkinLink: row[6],
          createdAt: row[7],
          eventDate: row[8] || '',
          state: row[9] || 'Active',
          defaultSpocName: row[10] || '',
          defaultSpocEmail: row[11] || '',
          defaultSpocSlack: row[12] || ''
        };

        return jsonResponse({ status: 'success', event: event });
      }
    }

    return jsonResponse({ status: 'error', error: 'Event ID not found: ' + eventId });
  } catch (error) {
    return jsonResponse({ status: 'error', error: 'Failed to retrieve event: ' + error.toString() });
  }
}


function readData(sheet) {
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const rows = data.slice(1);

  Logger.log('Sheet columns: ' + headers.join(', '));

  const attendees = rows.map(row => {
    let obj = {};
    headers.forEach((h, i) => {
      const key = camelize(h.toString());
      obj[key] = row[i];
      obj[h] = row[i];
    });
    return obj;
  });

  if (attendees.length > 0) {
    const sample = attendees[0];
    Logger.log('Sample attendee data - Title: ' + (sample.title || sample.Designation) + ', LinkedIn: ' + (sample.linkedin || sample.LinkedIn));
  }

  return jsonResponse({
    status: 'success',
    sheetName: sheet.getName(),
    attendees: attendees,
    columns: headers
  });
}

function addWalkIn(sheet, data) {
  try {
    const headers = sheet.getDataRange().getValues()[0];
    const lastRowIndex = sheet.getLastRow();
    const newRow = [];

    // autoCheckIn=true  → walk-in page (mark present + send notification immediately)
    // autoCheckIn=false → admin manual add (leave unchecked, no notification)
    const autoCheckIn = data.autoCheckIn === true || data.autoCheckIn === 'true';

    // Copy formulas only for specific columns
    const columnsToCopy = ['print status'];

    headers.forEach(function (header, i) {
      const h = header.toString().toLowerCase().trim();
      let val = '';

      if (columnsToCopy.indexOf(h) !== -1 && lastRowIndex > 1) {
        const cellAbove = sheet.getRange(lastRowIndex, i + 1);
        val = cellAbove.getFormulaR1C1() || cellAbove.getValue() || '';
      }
      // Populate SPOC from defaults in data
      else if (h === 'spoc of the day' || h === 'spoc name') val = data.defaultSpocName || '';
      else if (h === 'spoc email' || h === 'spoc_email') val = data.defaultSpocEmail || '';
      else if (h === 'spoc slack' || h === 'spoc_slack') val = data.defaultSpocSlack || '';
      // Personal & Event Info
      else if (h === 'first name') val = data.firstName || '';
      else if (h === 'last name') val = data.lastName || '';
      else if (h === 'full name') val = data.fullName || '';
      else if (h === 'email') val = data.email || '';
      else if (h === 'contact' || h === 'phone') val = data.contact || '';
      else if (h === 'company') val = data.company || '';
      else if (h === 'designation' || h === 'title') val = data.title || '';
      else if (h === 'linkedin') val = data.linkedin || '';
      else if (h === 'colour of the lanyard' || h === 'lanyard color') val = data.lanyardColor || 'Yellow';
      else if (h === 'segment') val = 'Walk-in';
      else if (h === 'attendance') val = autoCheckIn ? true : false;
      else if (h === 'check-in time') val = autoCheckIn ? new Date() : '';
      else if (h === 'notes') val = 'Walk-in attendee';
      else if (h === 'attendee type' || h === 'type' || h === 'category') val = data.attendeeType || 'Attendee';

      newRow.push(val);
    });

    // targetRow is the 1-based sheet row where the new walk-in was written
    const targetRow = lastRowIndex + 1;
    sheet.getRange(targetRow, 1, 1, newRow.length).setValues([newRow]);
    SpreadsheetApp.flush();

    // If autoCheckIn, fire email + Slack notification now.
    // Read all values after flush so the summary list is current.
    // allValues[targetRow - 1] is the row we just wrote (Sheet row targetRow, 0-based index targetRow-1).
    if (autoCheckIn) {
      try {
        const allValues = sheet.getDataRange().getValues();
        sendCheckInNotification(sheet, targetRow - 1, headers, allValues);
      } catch (e) {
        Logger.log('Walk-in notification failed: ' + e.toString());
      }
    }

    // Read back to confirm SPOC fields
    const writtenRow = sheet.getRange(targetRow, 1, 1, headers.length).getValues()[0];
    const updatedFields = {};
    headers.forEach(function (header, i) {
      const h = header.toString().toLowerCase().trim();
      if (h === 'spoc of the day') updatedFields.spocName = writtenRow[i];
      if (h === 'spoc email') updatedFields.spocEmail = writtenRow[i];
    });

    return jsonResponse({ status: 'success', message: 'Walk-in registered', updatedFields: updatedFields });
  } catch (error) {
    return jsonResponse({ status: 'error', error: error.message });
  }
}

function updateAttendee(sheet, data, lock) {
  Logger.log('🔔 updateAttendee() CALLED for ' + data.email);

  const values = sheet.getDataRange().getValues();
  const headers = values[0];

  // 1. Email Column Finding
  let emailIndex = -1;
  headers.forEach((h, i) => { if (['email', 'e-mail'].includes(h.toString().toLowerCase().trim())) emailIndex = i; });
  if (emailIndex === -1) return jsonResponse({ status: 'error', error: 'Email column not found' });

  // 2. Get Column Indices
  const indices = getColumnIndices(headers);

  // 3. Find the Correct Row (using the smart lookup from the previous fix)
  let rowIndex = -1;
  const targetEmail = String(data.email).toLowerCase().trim();
  const isCheckInAction = (data.attendance === true || String(data.attendance).toLowerCase() === 'true');

  for (let i = 1; i < values.length; i++) {
    const rowEmail = String(values[i][emailIndex]).toLowerCase().trim();
    if (rowEmail === targetEmail) {
      const rowIsCheckedIn = indices.attendance > -1 
        ? (String(values[i][indices.attendance]).toUpperCase() === 'TRUE')
        : false;
      
      if (isCheckInAction) {
        if (!rowIsCheckedIn) { rowIndex = i + 1; break; } 
        else if (rowIndex === -1) { rowIndex = i + 1; }
      } else {
        rowIndex = i + 1; break;
      }
    }
  }

  if (rowIndex === -1) return jsonResponse({ status: 'error', error: 'Attendee email not found' });

  // 4. Update Logic
  const now = new Date();
  let emailTriggerNeeded = false; // Flag to track if we need to send email

  Object.keys(data).forEach(function (key) {
    if (key.startsWith('_')) return;

    let colIndex = -1;
    if (key === 'attendance') colIndex = indices.attendance;
    else if (key === 'lanyardColor') colIndex = indices.lanyardColor;
    else if (key === 'notes') colIndex = indices.notes;
    else if (key === 'leadIntel') colIndex = indices.leadIntel;
    else if (key === 'attendeeType') colIndex = indices.attendeeType;

    if (colIndex > -1) {
      const val = data[key];

      if (key === 'attendance' && val === true) {
        // Update Timestamp
        if (indices.timestamp > -1) {
          sheet.getRange(rowIndex, indices.timestamp + 1).setValue(now);
          values[rowIndex - 1][indices.timestamp] = now;
        }
        
        // Update in-memory value
        values[rowIndex - 1][colIndex] = true;
        
        // Mark flag to send email LATER
        emailTriggerNeeded = true; 
      }

      // Update the actual sheet cell
      sheet.getRange(rowIndex, colIndex + 1).setValue(val);
    }
  });

  // 5. CRITICAL PERFORMANCE FIX: 
  // Write changes to disk and release the lock IMMEDIATELY.
  SpreadsheetApp.flush(); 
  
  if (lock) {
    lock.releaseLock(); 
    Logger.log('🔓 Lock released early - allowing next user while email sends...');
  }

  // 6. Send Email (Now running outside the lock)
  if (emailTriggerNeeded) {
    Logger.log('🚨 ATTENDANCE TRUE - Preparing email...');
    try {
      // We pass the 'values' array which we updated in memory above
      sendCheckInNotification(sheet, rowIndex - 1, headers, values);
    } catch (e) {
      Logger.log('❌ Email Notification Failed: ' + e.toString());
    }
  }

  return jsonResponse({
    status: 'success',
    message: 'Updated',
    serverLastModified: now.getTime()
  });
}

function sendCheckInNotification(sheet, rowIndex, headers, values) {
  try {
    const row = values[rowIndex];
    const colIndices = getColumnIndices(headers);

    // Check attendance status
    const attendanceValue = row[colIndices.attendance];
    const isCheckedIn = String(attendanceValue).toUpperCase() === 'TRUE';

    if (!isCheckedIn) return;

    // Check duplicates
    if (colIndices.emailSent !== undefined && row[colIndices.emailSent]) {
      Logger.log('[CHECK-IN EMAIL] ⚠️ Email already sent. Skipping.');
      return;
    }

    // Extract Data
    const firstName = row[colIndices.firstName] || '';
    const lastName = row[colIndices.lastName] || '';
    const fullName = (firstName + ' ' + lastName).trim();
    const spocEmail = row[colIndices.spocEmail] || '';
    const contact = row[colIndices.contact] || 'No Contact';
    const company = row[colIndices.company] || 'Unknown Company';
    const spocSlack = (colIndices.spocSlack !== undefined) ? (row[colIndices.spocSlack] || '') : '';

    if (!spocEmail || !spocEmail.includes('@')) {
      Logger.log('[CHECK-IN EMAIL] ❌ Invalid SPOC email. Aborting.');
      return;
    }

    // Combine Recipients (Email + Slack)
    let recipients = spocEmail;
    if (spocSlack && spocSlack.includes('@')) recipients += ',' + spocSlack;

    // Format Time
    let timestamp = row[colIndices.timestamp] || new Date();
    const formattedTime = Utilities.formatDate(new Date(timestamp), Session.getScriptTimeZone(), 'MMM dd, yyyy HH:mm');

    // Generate Summary List
    const checkInList = values.slice(1).filter(r => {
      const rCheckedIn = String(r[colIndices.attendance]).toUpperCase() === 'TRUE';
      return rCheckedIn && r[colIndices.spocEmail] === spocEmail;
    }).map(r => {
      const f = r[colIndices.firstName] || '';
      const l = r[colIndices.lastName] || '';
      const c = r[colIndices.company] || '';
      const p = r[colIndices.contact] || '';
      return `<li style="margin-bottom:6px;"><strong>${f} ${l}</strong> (${c}) — <a href="tel:${p}" style="color:#0066cc;">${p}</a></li>`;
    });

    const listHtml = checkInList.length > 0
      ? `<ul style="padding-left:20px; margin-top:10px;">${checkInList.join('')}</ul>`
      : '<p style="margin-top:10px;"><em>None yet</em></p>';

    // Send Email
    const htmlBody = `
      <html><body style="font-family:Arial,sans-serif; font-size:14px; color:#333; line-height:1.6;">
      <div style="background:#fff3cd; border-left:4px solid #ffc107; padding:12px; margin-bottom:20px;">
        <strong style="color:#856404; font-size:16px;">Attendee Check-in Alert</strong>
      </div>
      <p><strong>${fullName}</strong> from <strong>${company}</strong> checked in at <strong>${sheet.getName()}</strong>.</p>
      <table style="margin-bottom:20px;">
        <tr><td style="font-weight:bold; width:120px;">Contact:</td><td><a href="tel:${contact}">${contact}</a></td></tr>
        <tr><td style="font-weight:bold;">Time:</td><td>${formattedTime}</td></tr>
      </table>
      <hr style="border:0; border-top:1px solid #ddd; margin:24px 0;">
      <p style="font-weight:bold;">Your Total Check-ins (${checkInList.length}):</p>
      ${listHtml}
      </body></html>`;

    GmailApp.sendEmail(recipients, `Check-in Alert: ${fullName} [${sheet.getName()}]`, '', { htmlBody: htmlBody, name: 'Event Check-in System' });

    // Mark as Sent
    if (colIndices.emailSent !== undefined) {
      sheet.getRange(rowIndex + 1, colIndices.emailSent + 1).setValue(new Date());
    }
    Logger.log('[CHECK-IN EMAIL] ✅ Email sent to ' + recipients);

  } catch (error) {
    Logger.log('[CHECK-IN EMAIL] ❌ FATAL ERROR: ' + error.toString());
    throw error;
  }
}

function getColumnIndices(headers) {
  const indices = {};
  headers.forEach(function (header, i) {
    if (!header) return;
    const h = header.toString().toLowerCase().trim();

    if (['first name', 'firstname'].indexOf(h) > -1) indices.firstName = i;
    else if (['last name', 'lastname'].indexOf(h) > -1) indices.lastName = i;
    else if (['full name', 'fullname'].indexOf(h) > -1) indices.fullName = i;
    else if (['email', 'e-mail'].indexOf(h) > -1) indices.email = i;
    else if (['contact', 'phone', 'mobile'].indexOf(h) > -1) indices.contact = i;
    else if (['company', 'organization'].indexOf(h) > -1) indices.company = i;
    else if (['attendance', 'status'].indexOf(h) > -1) indices.attendance = i;
    else if (['check-in time', 'timestamp'].indexOf(h) > -1) indices.timestamp = i;
    else if (['colour of the lanyard', 'lanyard color'].indexOf(h) > -1) indices.lanyardColor = i;
    else if (['spoc of the day', 'spoc name'].indexOf(h) > -1) indices.spocName = i;
    else if (['spoc email', 'spoc_email'].indexOf(h) > -1) indices.spocEmail = i;
    else if (['spoc slack', 'spoc_slack'].indexOf(h) > -1) indices.spocSlack = i;
    else if (['notes', 'note'].indexOf(h) > -1) indices.notes = i;
    else if (['lead intel', 'intel'].indexOf(h) > -1) indices.leadIntel = i;
    else if (['attendee type', 'type', 'category'].indexOf(h) > -1) indices.attendeeType = i;
    else if (['email sent', 'notification sent'].indexOf(h) > -1) indices.emailSent = i;
  });
  return indices;
}

/**
 * ✅ TEST FUNCTION: Manually test email sending
 * IMPORTANT: Update TEST_SHEET_URL with your actual event sheet URL
 */
function testEmailNotification() {
  Logger.log('\n========== [TEST] EMAIL NOTIFICATION TEST ==========\n');

  // ✅ CONFIGURE THIS: Replace with your actual event sheet URL
  const TEST_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1gtZuWwqtI-oI3njQy5hKxmgIfcnyDiRM5FSOBiHeUeA/edit';

  try {
    // Open by URL instead of getActiveSpreadsheet()
    let ss;
    try {
      ss = SpreadsheetApp.openByUrl(TEST_SHEET_URL);
    } catch (e) {
      Logger.log('❌ Error: Could not open spreadsheet.');
      Logger.log('   Please update TEST_SHEET_URL in the testEmailNotification() function.');
      Logger.log('   Current URL: ' + TEST_SHEET_URL);
      return;
    }

    // Get the event sheet by name (not Master Event Log)
    const sheet = ss.getSheetByName('San Jose Dec25'); // ✅ Change to your event name

    if (!sheet) {
      Logger.log('❌ Sheet not found. Available sheets:');
      ss.getSheets().forEach(function (s) {
        Logger.log('  - ' + s.getName());
      });
      Logger.log('\n📝 Update the sheet name in testEmailNotification() function');
      return;
    }

    const values = sheet.getDataRange().getValues();
    const headers = values[0];

    Logger.log('Using sheet: ' + sheet.getName());
    Logger.log('Total rows: ' + values.length);
    Logger.log('Headers: ' + headers.join(' | '));

    // Get column indices
    let colIndices;
    try {
      colIndices = getColumnIndices(headers);
    } catch (indexError) {
      Logger.log('❌ Column Error: ' + indexError.message);
      Logger.log('\n📋 Available columns:');
      headers.forEach(function (h, i) {
        Logger.log('  ' + (i + 1) + '. ' + h);
      });
      return;
    }

    Logger.log('\nSearching for checked-in attendees...');

    // Find first row where attendance = true
    let foundRow = -1;
    for (let i = 1; i < values.length; i++) {
      const attendanceValue = values[i][colIndices.attendance];
      const isCheckedIn = attendanceValue === true || String(attendanceValue).toUpperCase() === 'TRUE';

      if (isCheckedIn) {
        foundRow = i;
        const name = values[i][colIndices.firstName] + ' ' + values[i][colIndices.lastName];
        Logger.log('✅ Found checked-in attendee at row ' + (i + 1) + ': ' + name);
        break;
      }
    }

    if (foundRow === -1) {
      Logger.log('❌ No checked-in attendees found.');
      Logger.log('\n📝 Action Required:');
      Logger.log('   1. Open your spreadsheet: ' + TEST_SHEET_URL);
      Logger.log('   2. Go to sheet: ' + sheet.getName());
      Logger.log('   3. Find the Attendance column');
      Logger.log('   4. Set at least one row to TRUE');
      Logger.log('   5. Run this test again');
      return;
    }

    // Send test email
    Logger.log('\n📧 Sending test email notification...');
    sendCheckInNotification(sheet, foundRow, headers, values);

    Logger.log('\n========== [TEST] COMPLETED SUCCESSFULLY ==========\n');

  } catch (error) {
    Logger.log('❌ TEST ERROR: ' + error.toString());
    Logger.log('Stack: ' + error.stack);
  }
}


function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function camelize(str) {
  return str.replace(/(?:^\w|[A-Z]|\b\w)/g, function (word, index) {
    return index === 0 ? word.toLowerCase() : word.toUpperCase();
  }).replace(/\s+/g, '');
}
