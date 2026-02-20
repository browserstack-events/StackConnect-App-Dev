/**
 * SALES SPOC DASHBOARD BACKEND — Version 10
 * Based on the "Optimised Code" architecture:
 *   - READ actions run without a lock (concurrent-safe)
 *   - WRITE actions acquire a script-level lock
 *   - CacheService 15-second TTL on read results
 *   - Cache invalidated on every write
 *
 * Changes from v9:
 *   - Removed duplicate function declarations (getAllEventsFromMaster ×2,
 *     updateEventInMaster ×2, getEventFromMaster ×2)
 *   - Fixed lock double-release via explicit lockReleased flag
 *   - Input validation on all write actions
 *   - HTML escaping in check-in emails
 *   - Rate limiting via CacheService fixed-window counters
 *   - Column name-based references (no more magic column numbers)
 *   - getColumnIndices refactored to alias map (replaces long else-if chain)
 *   - readData sends camelCase keys only (no duplicated raw-header keys)
 *   - autoCheckIn flag fully honoured in addWalkIn (with email notification)
 *   - Off-by-one indexing in sendCheckInNotification documented
 */

const MASTER_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1gtZuWwqtI-oI3njQy5hKxmgIfcnyDiRM5FSOBiHeUeA/edit?gid=493451901#gid=493451901';

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

function doGet(e) {
  if (!e.parameter.action && !e.postData) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'online',
      version: 'v10-optimised',
      timestamp: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

// ---------------------------------------------------------------------------
// Request router — separates reads (no lock) from writes (with lock)
// ---------------------------------------------------------------------------

function handleRequest(e) {
  try {
    const params = e.parameter || {};
    const postData = e.postData ? JSON.parse(e.postData.contents) : {};
    const data = Object.assign({}, params, postData);
    const action = data.action;

    // READ actions — no lock, cacheable
    const readActions = ['read', 'get_event', 'get_all_events', 'metadata'];
    if (readActions.indexOf(action) > -1) {
      return handleReadActions(action, data);
    }

    // WRITE actions — lock required
    return handleWriteActions(action, data);

  } catch (error) {
    return jsonResponse({ status: 'error', error: 'Request failed: ' + error.toString() });
  }
}

// ---------------------------------------------------------------------------
// READ handler — concurrent, cached
// ---------------------------------------------------------------------------

function handleReadActions(action, data) {
  if (action === 'get_event')      return getEventFromMaster(data.eventId);
  if (action === 'get_all_events') return getAllEventsFromMaster();

  // Resolve spreadsheet
  var ss;
  try {
    ss = data.sheetUrl ? SpreadsheetApp.openByUrl(data.sheetUrl) : SpreadsheetApp.getActiveSpreadsheet();
  } catch (e) {
    return jsonResponse({ status: 'error', error: 'Invalid or inaccessible Sheet URL' });
  }

  if (action === 'metadata') {
    return jsonResponse({ status: 'success', sheets: ss.getSheets().map(function(s) { return s.getName(); }) });
  }

  if (action === 'read') {
    var sheetName = data.sheetName || ss.getSheets()[0].getName();
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) return jsonResponse({ status: 'error', error: 'Sheet "' + sheetName + '" not found' });

    // --- CacheService read-through (15-second TTL) ---
    var cache = CacheService.getScriptCache();
    var cacheKey = 'read_' + sheet.getSheetId();
    var cached = cache.get(cacheKey);
    if (cached) {
      return ContentService.createTextOutput(cached).setMimeType(ContentService.MimeType.JSON);
    }

    var result = readData(sheet);
    try {
      cache.put(cacheKey, result.getContent(), 15);
    } catch (e) {
      Logger.log('Cache save failed (data may be too large): ' + e.toString());
    }
    return result;
  }

  return jsonResponse({ status: 'error', error: 'Unknown read action: ' + action });
}

// ---------------------------------------------------------------------------
// WRITE handler — serialised with LockService
// ---------------------------------------------------------------------------

function handleWriteActions(action, data) {
  // Input validation before acquiring the lock
  var validationErrors = validatePayload(action, data);
  if (validationErrors.length > 0) {
    return jsonResponse({ status: 'error', error: 'Validation failed: ' + validationErrors.join('; ') });
  }

  // Rate limiting (CacheService fixed-window, no lock needed here)
  if (!checkRateLimit(action)) {
    return jsonResponse({ status: 'error', error: 'Rate limit exceeded. Please wait and try again.' });
  }

  var lock = LockService.getScriptLock();
  var hasLock = lock.tryLock(10000);
  if (!hasLock) {
    return jsonResponse({ status: 'error', error: 'Server is busy. Please try again in a moment.' });
  }

  // Track whether the lock was released early (e.g. by updateAttendee before sending email)
  var lockReleased = false;

  try {
    if (action === 'log_event')    return logEventToMaster(data);
    if (action === 'update_event') return updateEventInMaster(data);

    // Resolve spreadsheet for event-sheet actions
    var ss;
    if (data.sheetUrl) {
      try {
        ss = SpreadsheetApp.openByUrl(data.sheetUrl);
      } catch (e) {
        return jsonResponse({ status: 'error', error: 'Invalid or inaccessible Sheet URL' });
      }
    } else {
      ss = SpreadsheetApp.getActiveSpreadsheet();
    }

    var targetSheetName = data.sheetName;
    var sheet;
    if (targetSheetName) {
      sheet = ss.getSheetByName(targetSheetName);
      if (!sheet) return jsonResponse({ status: 'error', error: 'Sheet "' + targetSheetName + '" not found' });
    } else {
      sheet = ss.getSheets()[0];
    }

    if (action === 'add') {
      var addResult = addWalkIn(sheet, data);
      clearSheetCache(sheet.getSheetId());
      return addResult;
    }

    if (action === 'update') {
      // updateAttendee may release the lock early (before sending email).
      // It signals this via the lockReleased property on its return object.
      var updateResult = updateAttendee(sheet, data, lock);
      lockReleased = updateResult.lockReleased === true;
      clearSheetCache(sheet.getSheetId());
      return updateResult.response;
    }

    return jsonResponse({ status: 'error', error: 'Unknown write action: ' + action });

  } catch (error) {
    return jsonResponse({ status: 'error', error: error.toString() });
  } finally {
    // Only release the lock if updateAttendee hasn't already done so
    if (!lockReleased) {
      try { lock.releaseLock(); } catch (e) {}
    }
  }
}

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

function clearSheetCache(sheetId) {
  try {
    CacheService.getScriptCache().remove('read_' + sheetId);
  } catch (e) {
    Logger.log('Failed to clear cache: ' + e.toString());
  }
}

// ---------------------------------------------------------------------------
// Rate limiting — CacheService fixed-window counter
// ---------------------------------------------------------------------------

/**
 * Checks whether the given action is within its per-minute rate limit.
 * Limits are intentionally generous for legitimate event-day usage:
 *   add:          20 walk-in registrations / min
 *   update:       60 updates / min  (check-ins, notes, lanyard)
 *   log_event:    10 / min  (admin operations)
 *   update_event: 10 / min
 * Returns false if the limit is exceeded.
 */
function checkRateLimit(action) {
  var LIMITS = { add: 20, update: 60, log_event: 10, update_event: 10 };
  var maxRequests = LIMITS[action] || 30;
  var windowSeconds = 60;

  var cache = CacheService.getScriptCache();
  var bucket = Math.floor(Date.now() / 1000 / windowSeconds);
  var key = 'rl:' + action + ':' + bucket;

  var count = parseInt(cache.get(key) || '0', 10);
  if (count >= maxRequests) return false;

  // Increment — not perfectly atomic at extreme concurrency,
  // but accurate enough for this scale (max ~60 req/min)
  cache.put(key, String(count + 1), windowSeconds + 10);
  return true;
}

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

function validatePayload(action, data) {
  var errors = [];

  // String length guard (all write payloads)
  var stringFields = ['email', 'firstName', 'lastName', 'fullName', 'company',
                      'contact', 'title', 'linkedin', 'notes', 'leadIntel',
                      'eventName', 'eventId'];
  stringFields.forEach(function(f) {
    if (data[f] && String(data[f]).length > 500) {
      errors.push(f + ' exceeds 500-character limit');
    }
  });

  if (action === 'add') {
    if (!data.email || !data.fullName) errors.push('email and fullName are required');
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))
      errors.push('Invalid email format');
    if (data.contact && !/^\+?[0-9\s\-().]{7,20}$/.test(data.contact))
      errors.push('Invalid phone format');
    if (data.autoCheckIn !== undefined && typeof data.autoCheckIn !== 'boolean')
      errors.push('autoCheckIn must be a boolean');
  }

  if (action === 'update') {
    if (!data.email) errors.push('email is required for update');
    if (data.attendance !== undefined && typeof data.attendance !== 'boolean')
      errors.push('attendance must be a boolean');
    if (data.lanyardColor && String(data.lanyardColor).length > 50)
      errors.push('lanyardColor value is too long');
  }

  if (action === 'update_event') {
    if (!data.eventId) errors.push('eventId is required');
    if (data.state && ['Active', 'Archived', 'Deleted'].indexOf(data.state) === -1)
      errors.push('state must be Active, Archived, or Deleted');
  }

  if (action === 'log_event') {
    if (!data.eventId || !data.eventName || !data.sheetUrl)
      errors.push('eventId, eventName, and sheetUrl are required');
  }

  return errors;
}

// ---------------------------------------------------------------------------
// HTML escaping (used in email notifications)
// ---------------------------------------------------------------------------

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#039;');
}

// ---------------------------------------------------------------------------
// Master sheet — column map helper (name-based, not number-based)
// ---------------------------------------------------------------------------

/**
 * Reads the first row of the master sheet and returns a map of
 * { "Column Name" → 1-based column index } for use with getRange().
 * This makes column references resilient to column reordering.
 */
function getMasterColumnMap(masterSheet) {
  var lastCol = masterSheet.getLastColumn();
  var headers = masterSheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var map = {};
  headers.forEach(function(h, i) {
    if (h) map[h.toString().trim()] = i + 1;
  });
  return map;
}

// ---------------------------------------------------------------------------
// Master sheet — CRUD
// ---------------------------------------------------------------------------

function logEventToMaster(data) {
  if (!MASTER_SHEET_URL || MASTER_SHEET_URL.indexOf('YOUR') > -1) {
    return jsonResponse({ status: 'error', error: 'MASTER_SHEET_URL not configured' });
  }

  try {
    var ss = SpreadsheetApp.openByUrl(MASTER_SHEET_URL);
    var masterSheet = ss.getSheetByName('Master Event Log');

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
      data.eventName,       // Sheet Name = Event Name
      data.sheetUrl,
      data.deskLink   || '',
      data.spocLink   || '',
      data.walkinLink || '',
      new Date(data.createdAt),
      data.eventDate       || '',
      data.state           || 'Active',
      data.defaultSpocName  || '',
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
  if (!MASTER_SHEET_URL || MASTER_SHEET_URL.indexOf('YOUR') > -1) {
    return jsonResponse({ status: 'error', error: 'MASTER_SHEET_URL not configured' });
  }

  try {
    var ss = SpreadsheetApp.openByUrl(MASTER_SHEET_URL);
    var masterSheet = ss.getSheetByName('Master Event Log');
    if (!masterSheet) return jsonResponse({ status: 'success', events: [] });

    var data = masterSheet.getDataRange().getValues();
    var cols = getMasterColumnMap(masterSheet);

    // Convert column names to 0-based indices for array access
    var idx = {
      eventId:          (cols['Event ID']           || 1) - 1,
      eventName:        (cols['Event Name']          || 2) - 1,
      sheetUrl:         (cols['Spreadsheet URL']     || 4) - 1,
      createdAt:        (cols['Created At']          || 8) - 1,
      eventDate:        (cols['Event Date']          || 9) - 1,
      state:            (cols['State']               || 10) - 1,
      defaultSpocName:  (cols['Default SPOC Name']   || 11) - 1,
      defaultSpocEmail: (cols['Default SPOC Email']  || 12) - 1,
      defaultSpocSlack: (cols['Default SPOC Slack']  || 13) - 1
    };

    var events = [];
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      if (row[idx.eventId]) {
        events.push({
          eventId:          row[idx.eventId],
          eventName:        row[idx.eventName],
          sheetUrl:         row[idx.sheetUrl],
          createdAt:        row[idx.createdAt],
          eventDate:        row[idx.eventDate]        || '',
          state:            row[idx.state]            || 'Active',
          defaultSpocName:  row[idx.defaultSpocName]  || '',
          defaultSpocEmail: row[idx.defaultSpocEmail] || '',
          defaultSpocSlack: row[idx.defaultSpocSlack] || ''
        });
      }
    }

    return jsonResponse({ status: 'success', events: events });
  } catch (error) {
    return jsonResponse({ status: 'error', error: 'Failed to fetch events: ' + error.toString() });
  }
}

function getEventFromMaster(eventId) {
  if (!MASTER_SHEET_URL || MASTER_SHEET_URL.indexOf('YOUR') > -1) {
    return jsonResponse({ status: 'error', error: 'MASTER_SHEET_URL not configured' });
  }

  try {
    var ss = SpreadsheetApp.openByUrl(MASTER_SHEET_URL);
    var masterSheet = ss.getSheetByName('Master Event Log');
    if (!masterSheet) return jsonResponse({ status: 'error', error: 'Master Event Log not found' });

    var data = masterSheet.getDataRange().getValues();
    var cols = getMasterColumnMap(masterSheet);

    var idx = {
      eventId:          (cols['Event ID']           || 1)  - 1,
      eventName:        (cols['Event Name']          || 2)  - 1,
      sheetName:        (cols['Sheet Name']          || 3)  - 1,
      sheetUrl:         (cols['Spreadsheet URL']     || 4)  - 1,
      deskLink:         (cols['Desk Link']           || 5)  - 1,
      spocLink:         (cols['Sales SPOC Link']     || 6)  - 1,
      walkinLink:       (cols['Walkin Link']         || 7)  - 1,
      createdAt:        (cols['Created At']          || 8)  - 1,
      eventDate:        (cols['Event Date']          || 9)  - 1,
      state:            (cols['State']               || 10) - 1,
      defaultSpocName:  (cols['Default SPOC Name']   || 11) - 1,
      defaultSpocEmail: (cols['Default SPOC Email']  || 12) - 1,
      defaultSpocSlack: (cols['Default SPOC Slack']  || 13) - 1
    };

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][idx.eventId]) === String(eventId)) {
        var row = data[i];
        return jsonResponse({
          status: 'success',
          event: {
            id:               row[idx.eventId],
            name:             row[idx.eventName],
            sheetName:        row[idx.sheetName],
            sheetUrl:         row[idx.sheetUrl],
            deskLink:         row[idx.deskLink],
            spocLink:         row[idx.spocLink],
            walkinLink:       row[idx.walkinLink],
            createdAt:        row[idx.createdAt],
            eventDate:        row[idx.eventDate]        || '',
            state:            row[idx.state]            || 'Active',
            defaultSpocName:  row[idx.defaultSpocName]  || '',
            defaultSpocEmail: row[idx.defaultSpocEmail] || '',
            defaultSpocSlack: row[idx.defaultSpocSlack] || ''
          }
        });
      }
    }

    return jsonResponse({ status: 'error', error: 'Event not found: ' + eventId });
  } catch (error) {
    return jsonResponse({ status: 'error', error: 'Failed to retrieve event: ' + error.toString() });
  }
}

function updateEventInMaster(data) {
  if (!MASTER_SHEET_URL || MASTER_SHEET_URL.indexOf('YOUR') > -1) {
    return jsonResponse({ status: 'error', error: 'MASTER_SHEET_URL not configured' });
  }

  try {
    var ss = SpreadsheetApp.openByUrl(MASTER_SHEET_URL);
    var masterSheet = ss.getSheetByName('Master Event Log');
    if (!masterSheet) return jsonResponse({ status: 'error', error: 'Master Event Log not found' });

    var cols = getMasterColumnMap(masterSheet);
    var values = masterSheet.getDataRange().getValues();

    // Find the row with matching eventId (column name-based)
    var eventIdCol = (cols['Event ID'] || 1) - 1; // 0-based for array access
    var targetRow = -1;
    for (var i = 1; i < values.length; i++) {
      if (String(values[i][eventIdCol]) === String(data.eventId)) {
        targetRow = i + 1; // 1-based for getRange
        break;
      }
    }

    if (targetRow === -1) {
      return jsonResponse({ status: 'error', error: 'Event not found: ' + data.eventId });
    }

    var updates = [];

    // Update each field using column-name-based indices
    if (data.state !== undefined) {
      masterSheet.getRange(targetRow, cols['State']).setValue(data.state);
      updates.push('state=' + data.state);
    }
    if (data.eventDate !== undefined) {
      masterSheet.getRange(targetRow, cols['Event Date']).setValue(data.eventDate);
      updates.push('eventDate=' + data.eventDate);
    }
    if (data.defaultSpocName !== undefined) {
      masterSheet.getRange(targetRow, cols['Default SPOC Name']).setValue(data.defaultSpocName);
      updates.push('defaultSpocName=' + data.defaultSpocName);
    }
    if (data.defaultSpocEmail !== undefined) {
      masterSheet.getRange(targetRow, cols['Default SPOC Email']).setValue(data.defaultSpocEmail);
      updates.push('defaultSpocEmail=' + data.defaultSpocEmail);
    }
    if (data.defaultSpocSlack !== undefined) {
      masterSheet.getRange(targetRow, cols['Default SPOC Slack']).setValue(data.defaultSpocSlack);
      updates.push('defaultSpocSlack=' + data.defaultSpocSlack);
    }

    SpreadsheetApp.flush();
    return jsonResponse({ status: 'success', message: 'Event updated: ' + updates.join(', '), eventId: data.eventId });
  } catch (error) {
    return jsonResponse({ status: 'error', error: 'Failed to update event: ' + error.toString() });
  }
}

// ---------------------------------------------------------------------------
// Event sheet — read
// ---------------------------------------------------------------------------

function readData(sheet) {
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var rows = data.slice(1);

  // Send camelCase keys only — halves payload size vs. the old dual-key approach
  var attendees = rows.map(function(row) {
    var obj = {};
    headers.forEach(function(h, i) {
      obj[camelize(h.toString())] = row[i];
    });
    return obj;
  });

  return jsonResponse({
    status: 'success',
    sheetName: sheet.getName(),
    attendees: attendees,
    columns: headers
  });
}

// ---------------------------------------------------------------------------
// Event sheet — add walk-in
// ---------------------------------------------------------------------------

function addWalkIn(sheet, data) {
  try {
    var headers = sheet.getDataRange().getValues()[0];
    var lastRowIndex = sheet.getLastRow();
    var newRow = [];

    // Respect the autoCheckIn flag sent by the frontend:
    //   true  → walk-in registered via the public URL (auto check-in + email)
    //   false → admin manually added via the desk modal (toggle controls check-in)
    var autoCheckIn = data.autoCheckIn === true;

    // These columns copy their formula/value from the row above
    var columnsToCopy = ['print status'];

    headers.forEach(function(header, i) {
      var h = header.toString().toLowerCase().trim();
      var val = '';

      if (columnsToCopy.indexOf(h) !== -1 && lastRowIndex > 1) {
        var cellAbove = sheet.getRange(lastRowIndex, i + 1);
        val = cellAbove.getFormulaR1C1() || cellAbove.getValue() || '';
      }
      // SPOC defaults
      else if (h === 'spoc of the day' || h === 'spoc name') val = data.defaultSpocName  || '';
      else if (h === 'spoc email'      || h === 'spoc_email') val = data.defaultSpocEmail || '';
      else if (h === 'spoc slack'      || h === 'spoc_slack') val = data.defaultSpocSlack || '';
      // Personal & event info
      else if (h === 'first name')                                        val = data.firstName || '';
      else if (h === 'last name')                                         val = data.lastName  || '';
      else if (h === 'full name')                                         val = data.fullName  || '';
      else if (h === 'email')                                             val = data.email     || '';
      else if (h === 'contact' || h === 'phone')                          val = data.contact   || '';
      else if (h === 'company')                                           val = data.company   || '';
      else if (h === 'designation' || h === 'title')                      val = data.title     || '';
      else if (h === 'linkedin')                                          val = data.linkedin  || '';
      else if (h === 'colour of the lanyard' || h === 'lanyard color')    val = data.lanyardColor || 'Yellow';
      else if (h === 'segment')                                           val = 'Walk-in';
      else if (h === 'attendee type' || h === 'type' || h === 'category') val = data.attendeeType || 'Attendee';
      else if (h === 'notes')                                             val = 'Walk-in attendee';
      // Honour the autoCheckIn flag — do NOT always set to false
      else if (h === 'attendance')   val = autoCheckIn ? true : false;
      // Stamp a check-in time only when actually checking in
      else if (h === 'check-in time') val = autoCheckIn ? new Date() : '';

      newRow.push(val);
    });

    var targetRow = lastRowIndex + 1;
    sheet.getRange(targetRow, 1, 1, newRow.length).setValues([newRow]);
    SpreadsheetApp.flush();

    // Read back to confirm SPOC values for the frontend
    var writtenRow = sheet.getRange(targetRow, 1, 1, headers.length).getValues()[0];
    var updatedFields = {};
    headers.forEach(function(header, i) {
      var h = header.toString().toLowerCase().trim();
      if (h === 'spoc of the day' || h === 'spoc name') updatedFields.spocName  = writtenRow[i];
      if (h === 'spoc email'      || h === 'spoc_email') updatedFields.spocEmail = writtenRow[i];
    });

    // INDEX EXPLANATION for sendCheckInNotification call below:
    // Google Sheets is 1-based: Row 1 = headers, Row 2 = first data row.
    // sheet.getLastRow() returns the last occupied 1-based row number.
    // targetRow = lastRowIndex + 1 (1-based row where we just wrote the new walk-in).
    //
    // allValues = sheet.getDataRange().getValues() is a 0-based JS array:
    //   allValues[0] = header row
    //   allValues[1] = first data row  (Sheet row 2)
    //   ...
    //   allValues[targetRow - 1] = the row we just wrote (Sheet row targetRow)
    //
    // sendCheckInNotification expects a 0-based index into allValues,
    // so we pass targetRow - 1.
    if (autoCheckIn) {
      try {
        var allValues = sheet.getDataRange().getValues();
        sendCheckInNotification(sheet, targetRow - 1, headers, allValues);
        Logger.log('Walk-in auto check-in email sent for: ' + data.fullName);
      } catch (emailError) {
        // Email failure must not roll back the registration
        Logger.log('Walk-in email notification failed: ' + emailError.toString());
      }
    }

    return jsonResponse({ status: 'success', message: 'Walk-in registered', updatedFields: updatedFields });
  } catch (error) {
    return jsonResponse({ status: 'error', error: error.message });
  }
}

// ---------------------------------------------------------------------------
// Event sheet — update attendee
// Returns { response: JsonOutput, lockReleased: boolean }
// so handleWriteActions knows whether to release the lock in its finally block.
// ---------------------------------------------------------------------------

function updateAttendee(sheet, data, lock) {
  Logger.log('updateAttendee() called for ' + data.email);

  var values = sheet.getDataRange().getValues();
  var headers = values[0];

  // Find email column
  var emailIndex = -1;
  headers.forEach(function(h, i) {
    if (['email', 'e-mail'].indexOf(h.toString().toLowerCase().trim()) > -1) emailIndex = i;
  });
  if (emailIndex === -1) {
    return { response: jsonResponse({ status: 'error', error: 'Email column not found' }), lockReleased: false };
  }

  var indices = getColumnIndices(headers);
  var targetEmail = String(data.email).toLowerCase().trim();
  var isCheckInAction = (data.attendance === true || String(data.attendance).toLowerCase() === 'true');
  var rowIndex = -1;

  // Smart row lookup: for check-ins, prefer the first unchecked-in row
  for (var i = 1; i < values.length; i++) {
    var rowEmail = String(values[i][emailIndex]).toLowerCase().trim();
    if (rowEmail === targetEmail) {
      var rowIsCheckedIn = indices.attendance > -1
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

  if (rowIndex === -1) {
    return { response: jsonResponse({ status: 'error', error: 'Attendee not found: ' + data.email }), lockReleased: false };
  }

  var now = new Date();
  var emailTriggerNeeded = false;

  Object.keys(data).forEach(function(key) {
    if (key.charAt(0) === '_') return; // skip private fields

    var colIndex = -1;
    if (key === 'attendance')   colIndex = indices.attendance;
    else if (key === 'lanyardColor')  colIndex = indices.lanyardColor;
    else if (key === 'notes')         colIndex = indices.notes;
    else if (key === 'leadIntel')     colIndex = indices.leadIntel;
    else if (key === 'attendeeType')  colIndex = indices.attendeeType;

    if (colIndex > -1) {
      var val = data[key];

      if (key === 'attendance' && val === true) {
        if (indices.timestamp > -1) {
          sheet.getRange(rowIndex, indices.timestamp + 1).setValue(now);
          values[rowIndex - 1][indices.timestamp] = now;
        }
        values[rowIndex - 1][colIndex] = true;
        emailTriggerNeeded = true;
      }

      sheet.getRange(rowIndex, colIndex + 1).setValue(val);
    }
  });

  // Flush writes and release the lock early so other requests aren't blocked
  // while we send the email (which can take several seconds)
  SpreadsheetApp.flush();
  var lockReleased = false;
  if (lock) {
    try { lock.releaseLock(); } catch (e) {}
    lockReleased = true;
    Logger.log('Lock released early — email sending outside the lock');
  }

  // Send check-in email outside the lock
  if (emailTriggerNeeded) {
    try {
      sendCheckInNotification(sheet, rowIndex - 1, headers, values);
    } catch (e) {
      Logger.log('Email notification failed: ' + e.toString());
    }
  }

  return {
    response: jsonResponse({ status: 'success', message: 'Updated', serverLastModified: now.getTime() }),
    lockReleased: lockReleased
  };
}

// ---------------------------------------------------------------------------
// Check-in email notification
// ---------------------------------------------------------------------------

function sendCheckInNotification(sheet, rowIndex, headers, values) {
  try {
    var row = values[rowIndex];
    var colIndices = getColumnIndices(headers);

    // Guard: must actually be checked in
    if (String(row[colIndices.attendance]).toUpperCase() !== 'TRUE') return;

    // Deduplication: skip if email already sent for this attendee
    if (colIndices.emailSent !== undefined && row[colIndices.emailSent]) {
      Logger.log('[EMAIL] Already sent for this attendee, skipping.');
      return;
    }

    // Escape all user-supplied values before embedding in HTML
    var firstName  = escapeHtml(row[colIndices.firstName] || '');
    var lastName   = escapeHtml(row[colIndices.lastName]  || '');
    var fullName   = (firstName + ' ' + lastName).trim();
    var spocEmail  = row[colIndices.spocEmail] || '';
    var contact    = escapeHtml(row[colIndices.contact]   || 'No Contact');
    var company    = escapeHtml(row[colIndices.company]   || 'Unknown Company');
    var spocSlack  = (colIndices.spocSlack !== undefined) ? (row[colIndices.spocSlack] || '') : '';

    if (!spocEmail || spocEmail.indexOf('@') === -1) {
      Logger.log('[EMAIL] Invalid SPOC email, aborting.');
      return;
    }

    var recipients = spocEmail;
    if (spocSlack && spocSlack.indexOf('@') > -1) recipients += ',' + spocSlack;

    var timestamp = row[colIndices.timestamp] || new Date();
    var formattedTime = Utilities.formatDate(new Date(timestamp), Session.getScriptTimeZone(), 'MMM dd, yyyy HH:mm');

    // Build the check-in list for this SPOC
    var checkInList = values.slice(1).filter(function(r) {
      return String(r[colIndices.attendance]).toUpperCase() === 'TRUE'
          && r[colIndices.spocEmail] === spocEmail;
    }).map(function(r) {
      var f = escapeHtml(r[colIndices.firstName] || '');
      var l = escapeHtml(r[colIndices.lastName]  || '');
      var c = escapeHtml(r[colIndices.company]   || '');
      var p = escapeHtml(r[colIndices.contact]   || '');
      return '<li style="margin-bottom:6px;"><strong>' + f + ' ' + l + '</strong> (' + c + ') — '
           + '<a href="tel:' + p + '" style="color:#0066cc;">' + p + '</a></li>';
    });

    var listHtml = checkInList.length > 0
      ? '<ul style="padding-left:20px;margin-top:10px;">' + checkInList.join('') + '</ul>'
      : '<p style="margin-top:10px;"><em>None yet</em></p>';

    var htmlBody = '<html><body style="font-family:Arial,sans-serif;font-size:14px;color:#333;line-height:1.6;">'
      + '<div style="background:#fff3cd;border-left:4px solid #ffc107;padding:12px;margin-bottom:20px;">'
      + '<strong style="color:#856404;font-size:16px;">Attendee Check-in Alert</strong></div>'
      + '<p><strong>' + fullName + '</strong> from <strong>' + company + '</strong> '
      + 'checked in at <strong>' + escapeHtml(sheet.getName()) + '</strong>.</p>'
      + '<table style="margin-bottom:20px;">'
      + '<tr><td style="font-weight:bold;width:120px;">Contact:</td>'
      + '<td><a href="tel:' + contact + '">' + contact + '</a></td></tr>'
      + '<tr><td style="font-weight:bold;">Time:</td><td>' + formattedTime + '</td></tr>'
      + '</table>'
      + '<hr style="border:0;border-top:1px solid #ddd;margin:24px 0;">'
      + '<p style="font-weight:bold;">Your Total Check-ins (' + checkInList.length + '):</p>'
      + listHtml
      + '</body></html>';

    GmailApp.sendEmail(
      recipients,
      'Check-in Alert: ' + fullName + ' [' + sheet.getName() + ']',
      '',
      { htmlBody: htmlBody, name: 'Event Check-in System' }
    );

    // Mark as sent
    if (colIndices.emailSent !== undefined) {
      sheet.getRange(rowIndex + 1, colIndices.emailSent + 1).setValue(new Date());
    }
    Logger.log('[EMAIL] Sent to ' + recipients);

  } catch (error) {
    Logger.log('[EMAIL] Fatal error: ' + error.toString());
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Column index builder — alias map replaces long else-if chain
// ---------------------------------------------------------------------------

/**
 * Maps canonical field names to their lists of possible header aliases.
 * All aliases are lowercase for case-insensitive matching.
 * First-match-wins: if two columns match the same canonical name, the
 * leftmost column wins (indices[canonical] is set only when undefined).
 */
var COLUMN_ALIASES = {
  firstName:    ['first name',   'firstname'],
  lastName:     ['last name',    'lastname'],
  fullName:     ['full name',    'fullname'],
  email:        ['email',        'e-mail'],
  contact:      ['contact',      'phone',       'mobile'],
  company:      ['company',      'organization'],
  attendance:   ['attendance',   'status'],
  timestamp:    ['check-in time','timestamp'],
  lanyardColor: ['colour of the lanyard', 'lanyard color'],
  spocName:     ['spoc of the day', 'spoc name'],
  spocEmail:    ['spoc email',   'spoc_email'],
  spocSlack:    ['spoc slack',   'spoc_slack'],
  notes:        ['notes',        'note'],
  leadIntel:    ['lead intel',   'intel'],
  attendeeType: ['attendee type','type',         'category'],
  emailSent:    ['email sent',   'notification sent']
};

// Build reverse lookup once at script load: lowercase alias → canonical name
var _aliasReverseLookup = (function() {
  var lookup = {};
  Object.keys(COLUMN_ALIASES).forEach(function(canonical) {
    COLUMN_ALIASES[canonical].forEach(function(alias) {
      lookup[alias] = canonical;
    });
  });
  return lookup;
})();

function getColumnIndices(headers) {
  var indices = {};
  headers.forEach(function(header, i) {
    if (!header) return;
    var h = header.toString().toLowerCase().trim();
    var canonical = _aliasReverseLookup[h];
    // First match wins — leftmost column for each canonical name
    if (canonical && indices[canonical] === undefined) {
      indices[canonical] = i;
    }
  });
  return indices;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function camelize(str) {
  return str.replace(/(?:^\w|[A-Z]|\b\w)/g, function(word, index) {
    return index === 0 ? word.toLowerCase() : word.toUpperCase();
  }).replace(/\s+/g, '');
}
