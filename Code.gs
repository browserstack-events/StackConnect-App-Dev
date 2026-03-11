/**
 * SALES SPOC DASHBOARD BACKEND - Version 10
 * Integrated Check-In Email Notification System
 *
 * Changes from v9:
 * - 1.1: Removed duplicate getAllEventsFromMaster, updateEventInMaster, getEventFromMaster
 * - 1.2: Fixed lock double-release (updateAttendee returns {response, lockReleased})
 * - 2.2: Added validatePayload() — checked before acquiring lock
 * - 2.3: Added escapeHtml() — applied to all user data in email bodies
 * - 3.2: readData() emits camelCase keys only (removed duplicate raw-header keys)
 * - 3.3: getMasterColumnMap() replaces magic column numbers in master sheet functions
 * - 3.4: getColumnIndices() replaced else-if chain with alias config map + reverse lookup
 */

const MASTER_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1gtZuWwqtI-oI3njQy5hKxmgIfcnyDiRM5FSOBiHeUeA/edit?gid=493451901#gid=493451901';

function doGet(e) {
  if (!e.parameter.action && !e.postData) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'online',
      version: 'v10',
      timestamp: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  try {
    const params = e.parameter || {};
    const postData = e.postData ? JSON.parse(e.postData.contents) : {};
    const data = { ...params, ...postData };
    const action = data.action;

    const readActions = ['read', 'get_event', 'get_all_events', 'metadata', 'login'];
    if (readActions.includes(action)) return handleReadActions(action, data);
    return handleWriteActions(action, data);

  } catch (error) {
    return jsonResponse({ status: 'error', error: 'Request Failed: ' + error.toString() });
  }
}

function handleReadActions(action, data) {
  if (action === 'get_event') return getEventFromMaster(data.eventId);
  if (action === 'get_all_events') return getAllEventsFromMaster();
  if (action === 'login') return handleLogin(data);

  if (!data.sheetUrl && !data.sheetName) {
    return jsonResponse({ status: 'error', error: 'Missing sheetUrl or sheetName' });
  }

  let ss;
  try {
    ss = data.sheetUrl ? SpreadsheetApp.openByUrl(data.sheetUrl) : SpreadsheetApp.getActiveSpreadsheet();
  } catch (e) {
    return jsonResponse({ status: 'error', error: 'Invalid Sheet URL' });
  }

  if (action === 'metadata') {
    return jsonResponse({ status: 'success', sheets: ss.getSheets().map(s => s.getName()) });
  }

  if (action === 'read') {
    const sheetName = data.sheetName || ss.getSheets()[0].getName();
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return jsonResponse({ status: 'error', error: `Sheet "${sheetName}" not found` });

    const cache = CacheService.getScriptCache();
    const cacheKey = 'read_' + sheet.getSheetId();
    const cachedResponse = cache.get(cacheKey);
    if (cachedResponse) {
      return ContentService.createTextOutput(cachedResponse).setMimeType(ContentService.MimeType.JSON);
    }

    const resultResponse = readData(sheet);
    try {
      cache.put(cacheKey, resultResponse.getContent(), 15);
    } catch (e) {
      Logger.log('Cache save failed (likely too big): ' + e.toString());
    }
    return resultResponse;
  }

  return jsonResponse({ status: 'error', error: 'Unknown Read Action' });
}

// ─── AUTHENTICATION ───────────────────────────────────────────────────────────

/**
 * Validates a role passphrase against GAS Script Properties.
 * Set DESK_PASSPHRASE and SPOC_PASSPHRASE in:
 *   GAS Editor → Project Settings → Script Properties
 */
function handleLogin(data) {
  const role = data.role;
  const passphrase = data.passphrase;

  if (role !== 'desk' && role !== 'spoc') {
    return jsonResponse({ status: 'error', error: 'Invalid role' });
  }
  if (!passphrase) {
    return jsonResponse({ status: 'error', error: 'Passphrase is required' });
  }

  const props = PropertiesService.getScriptProperties();
  const propKey = role === 'desk' ? 'DESK_PASSPHRASE' : 'SPOC_PASSPHRASE';
  const expected = props.getProperty(propKey);

  if (!expected) {
    return jsonResponse({ status: 'error', error: 'Authentication not configured. Contact the administrator.' });
  }
  if (passphrase !== expected) {
    return jsonResponse({ status: 'error', error: 'Incorrect passphrase. Please try again.' });
  }

  return jsonResponse({ status: 'success', role: role });
}

// 2.2: validatePayload is called BEFORE acquiring the lock — fail fast on bad input
function handleWriteActions(action, data) {
  const validationErrors = validatePayload(action, data);
  if (validationErrors.length > 0) {
    return jsonResponse({ status: 'error', error: 'Validation failed: ' + validationErrors.join('; ') });
  }

  const lock = LockService.getScriptLock();
  const hasLock = lock.tryLock(10000);
  if (!hasLock) {
    return jsonResponse({ status: 'error', error: 'Server is busy. Please try again.' });
  }

  // 1.2: Track whether the lock was released early inside updateAttendee
  let lockReleased = false;

  try {
    if (action === 'log_event') return logEventToMaster(data);
    if (action === 'update_event') return updateEventInMaster(data);

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
      clearSheetCache(sheet.getSheetId());
      return result;
    }

    if (action === 'update') {
      // 1.2: updateAttendee returns { response, lockReleased } so the finally
      // block below knows not to release the lock a second time.
      const result = updateAttendee(sheet, data, lock);
      lockReleased = result.lockReleased || false;
      clearSheetCache(sheet.getSheetId());
      return result.response;
    }

    return jsonResponse({ status: 'error', error: 'Unknown Write Action' });

  } catch (error) {
    return jsonResponse({ status: 'error', error: error.toString() });
  } finally {
    // 1.2: Only release if updateAttendee didn't already do so
    if (!lockReleased) {
      try { lock.releaseLock(); } catch (e) {}
    }
  }
}

function clearSheetCache(sheetId) {
  try {
    CacheService.getScriptCache().remove('read_' + sheetId);
  } catch (e) {
    Logger.log('Failed to clear cache: ' + e);
  }
}

// ─── MASTER SHEET HELPERS ────────────────────────────────────────────────────

/**
 * 3.3: Returns a map of { "Column Header" → 1-based column index } for the
 * master sheet. Used in place of hardcoded column numbers throughout.
 */
function getMasterColumnMap(masterSheet) {
  const headers = masterSheet.getRange(1, 1, 1, masterSheet.getLastColumn()).getValues()[0];
  const map = {};
  headers.forEach(function (h, i) {
    if (h) map[h.toString().trim()] = i + 1; // 1-based for getRange
  });
  return map;
}

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

// 1.1: Single authoritative copy (duplicate removed)
function getAllEventsFromMaster() {
  if (!MASTER_SHEET_URL || MASTER_SHEET_URL.includes('YOUR')) {
    return jsonResponse({ status: 'error', error: 'MASTER_SHEET_URL not configured' });
  }

  try {
    const ss = SpreadsheetApp.openByUrl(MASTER_SHEET_URL);
    const masterSheet = ss.getSheetByName('Master Event Log');
    if (!masterSheet) return jsonResponse({ status: 'success', events: [] });

    const data = masterSheet.getDataRange().getValues();
    if (data.length < 2) return jsonResponse({ status: 'success', events: [] });

    // 3.3: Use column map so row order doesn't matter
    const cols = getMasterColumnMap(masterSheet);
    const events = [];

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (row[cols['Event ID'] - 1]) {
        events.push({
          eventId:          row[cols['Event ID'] - 1],
          eventName:        row[cols['Event Name'] - 1],
          sheetUrl:         row[cols['Spreadsheet URL'] - 1],
          createdAt:        row[cols['Created At'] - 1],
          eventDate:        row[cols['Event Date'] - 1] || '',
          state:            row[cols['State'] - 1] || 'Active',
          defaultSpocName:  row[cols['Default SPOC Name'] - 1] || '',
          defaultSpocEmail: row[cols['Default SPOC Email'] - 1] || '',
          defaultSpocSlack: row[cols['Default SPOC Slack'] - 1] || ''
        });
      }
    }

    return jsonResponse({ status: 'success', events: events });
  } catch (error) {
    return jsonResponse({ status: 'error', error: 'Failed to fetch events: ' + error.toString() });
  }
}

// 1.1: Single authoritative copy (duplicate removed)
// 3.3: Uses getMasterColumnMap — no magic column numbers
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
    if (!masterSheet) return jsonResponse({ status: 'error', error: 'Master Event Log sheet not found' });

    const values = masterSheet.getDataRange().getValues();
    const cols = getMasterColumnMap(masterSheet);

    let targetRow = -1;
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][cols['Event ID'] - 1]) === String(data.eventId)) {
        targetRow = i + 1; // convert to 1-based sheet row
        break;
      }
    }

    if (targetRow === -1) {
      return jsonResponse({ status: 'error', error: 'Event ID not found: ' + data.eventId });
    }

    const updates = [];

    if (data.state !== undefined) {
      const validStates = ['Active', 'Archived', 'Deleted'];
      if (validStates.indexOf(data.state) === -1) {
        return jsonResponse({ status: 'error', error: 'Invalid state. Must be: Active, Archived, or Deleted' });
      }
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

// 1.1: Single authoritative copy (duplicate removed)
// 3.3: Uses getMasterColumnMap — no magic column numbers
function getEventFromMaster(eventId) {
  if (!MASTER_SHEET_URL || MASTER_SHEET_URL.includes('YOUR')) {
    return jsonResponse({ status: 'error', error: 'MASTER_SHEET_URL not configured' });
  }

  try {
    const ss = SpreadsheetApp.openByUrl(MASTER_SHEET_URL);
    const masterSheet = ss.getSheetByName('Master Event Log');
    if (!masterSheet) return jsonResponse({ status: 'error', error: 'Master Event Log sheet not found' });

    const data = masterSheet.getDataRange().getValues();
    const cols = getMasterColumnMap(masterSheet);

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][cols['Event ID'] - 1]) === String(eventId)) {
        const row = data[i];
        return jsonResponse({
          status: 'success',
          event: {
            id:               row[cols['Event ID'] - 1],
            name:             row[cols['Event Name'] - 1],
            sheetName:        row[cols['Sheet Name'] - 1],
            sheetUrl:         row[cols['Spreadsheet URL'] - 1],
            deskLink:         row[cols['Desk Link'] - 1],
            spocLink:         row[cols['Sales SPOC Link'] - 1],
            walkinLink:       row[cols['Walkin Link'] - 1],
            createdAt:        row[cols['Created At'] - 1],
            eventDate:        row[cols['Event Date'] - 1] || '',
            state:            row[cols['State'] - 1] || 'Active',
            defaultSpocName:  row[cols['Default SPOC Name'] - 1] || '',
            defaultSpocEmail: row[cols['Default SPOC Email'] - 1] || '',
            defaultSpocSlack: row[cols['Default SPOC Slack'] - 1] || ''
          }
        });
      }
    }

    return jsonResponse({ status: 'error', error: 'Event ID not found: ' + eventId });
  } catch (error) {
    return jsonResponse({ status: 'error', error: 'Failed to retrieve event: ' + error.toString() });
  }
}

// ─── EVENT SHEET FUNCTIONS ───────────────────────────────────────────────────

// 3.2: Emits camelCase keys only — removes the duplicate raw-header key that
// doubled every payload.
function readData(sheet) {
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const rows = data.slice(1);

  // Skip rows with no email — they are blank/template rows and would appear as
  // "Unknown Attendee" on the frontend. Filtering here keeps the payload small.
  const emailColIdx = headers.findIndex(function (h) {
    return ['email', 'e-mail'].indexOf(h.toString().toLowerCase().trim()) !== -1;
  });

  const attendees = rows
    .filter(function (row) {
      if (emailColIdx === -1) return true; // no email column → include all
      return String(row[emailColIdx] || '').trim() !== '';
    })
    .map(function (row) {
      const obj = {};
      headers.forEach((h, i) => {
        obj[camelize(h.toString())] = row[i]; // camelCase key only
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

function addWalkIn(sheet, data) {
  try {
    const headers = sheet.getDataRange().getValues()[0];
    const lastRowIndex = sheet.getLastRow();
    const newRow = [];

    // autoCheckIn=true  → walk-in page (mark present + send notification immediately)
    // autoCheckIn=false → admin manual add (leave unchecked, no notification)
    const autoCheckIn = data.autoCheckIn === true || data.autoCheckIn === 'true';

    const columnsToCopy = ['print status'];

    headers.forEach(function (header, i) {
      const h = header.toString().toLowerCase().trim();
      let val = '';

      if (columnsToCopy.indexOf(h) !== -1 && lastRowIndex > 1) {
        const cellAbove = sheet.getRange(lastRowIndex, i + 1);
        val = cellAbove.getFormulaR1C1() || cellAbove.getValue() || '';
      }
      else if (h === 'spoc of the day' || h === 'spoc name') val = data.defaultSpocName || '';
      else if (h === 'spoc email' || h === 'spoc_email') val = data.defaultSpocEmail || '';
      else if (h === 'spoc slack' || h === 'spoc_slack') val = data.defaultSpocSlack || '';
      else if (h === 'first name') val = data.firstName || '';
      else if (h === 'last name') val = data.lastName || '';
      else if (h === 'full name') val = data.fullName || '';
      else if (h === 'email') val = data.email || '';
      else if (h === 'contact' || h === 'phone') val = data.contact || '';
      else if (h === 'company') val = data.company || '';
      else if (h === 'designation' || h === 'title') val = data.title || '';
      else if (h === 'linkedin') val = data.linkedin || '';
      else if (h === 'colour of the lanyard' || h === 'lanyard color') val = data.lanyardColor || 'Yellow';
      else if (h === 'colour of name card' || h === 'name card color' || h === 'namecard color') val = data.nameCardColor || '';
      else if (h === 'segment') val = 'Walk-in';
      else if (h === 'attendance') val = autoCheckIn ? true : false;
      else if (h === 'check-in time') val = autoCheckIn ? new Date() : '';
      else if (h === 'notes') val = 'Walk-in attendee';
      else if (h === 'attendee type' || h === 'type' || h === 'category') val = data.attendeeType || 'Attendee';

      newRow.push(val);
    });

    // INDEX EXPLANATION:
    // Google Sheets is 1-based: Row 1 = headers, Row 2 = first data row.
    // targetRow = lastRowIndex + 1 (1-based row where we just wrote the new walk-in).
    // allValues[targetRow - 1] = the row we just wrote (Sheet row targetRow).
    // sendCheckInNotification expects a 0-based index into allValues, so we pass targetRow - 1.
    const targetRow = lastRowIndex + 1;
    sheet.getRange(targetRow, 1, 1, newRow.length).setValues([newRow]);

    // ── SPOC LOOKUP FORMULA ──────────────────────────────────────────────────
    // If there are existing data rows, replace the literal default SPOC values
    // with INDEX/MATCH formulas that look up the walk-in's company in all rows
    // above the new row. If the company already exists, its SPOC is used;
    // otherwise the formula falls back to the hardcoded default SPOC.
    //
    // Range intentionally excludes the new row itself (rows 2 → lastRowIndex)
    // to avoid a circular reference and to ensure we only match existing attendees.
    if (lastRowIndex > 1) {
      const companyColIdx  = headers.findIndex(function (h) { const hn = h.toString().toLowerCase().trim(); return hn === 'company' || hn === 'organization'; });
      const spocNameColIdx = headers.findIndex(function (h) { const hn = h.toString().toLowerCase().trim(); return hn === 'spoc of the day' || hn === 'spoc name'; });
      const spocEmailColIdx= headers.findIndex(function (h) { const hn = h.toString().toLowerCase().trim(); return hn === 'spoc email' || hn === 'spoc_email'; });
      const spocSlackColIdx= headers.findIndex(function (h) { const hn = h.toString().toLowerCase().trim(); return hn === 'spoc slack' || hn === 'spoc_slack'; });

      if (companyColIdx > -1) {
        const companyCol  = colToLetter(companyColIdx + 1);
        const searchRange = companyCol + '$2:' + companyCol + lastRowIndex; // existing rows only

        function spocFormula(valueColIdx, defaultVal) {
          if (valueColIdx === -1) return null;
          const valueCol = colToLetter(valueColIdx + 1);
          const lookupRange = valueCol + '$2:' + valueCol + lastRowIndex;
          const safe = (defaultVal || '').replace(/"/g, '""'); // escape embedded quotes
          return '=IFERROR(INDEX(' + lookupRange + ',MATCH(' + companyCol + targetRow + ',' + searchRange + ',0)),"' + safe + '")';
        }

        const nameFormula  = spocFormula(spocNameColIdx,  data.defaultSpocName);
        const emailFormula = spocFormula(spocEmailColIdx, data.defaultSpocEmail);
        const slackFormula = spocFormula(spocSlackColIdx, data.defaultSpocSlack);

        if (nameFormula  && spocNameColIdx  > -1) sheet.getRange(targetRow, spocNameColIdx  + 1).setFormula(nameFormula);
        if (emailFormula && spocEmailColIdx > -1) sheet.getRange(targetRow, spocEmailColIdx + 1).setFormula(emailFormula);
        if (slackFormula && spocSlackColIdx > -1) sheet.getRange(targetRow, spocSlackColIdx + 1).setFormula(slackFormula);
      }
    }

    SpreadsheetApp.flush();

    if (autoCheckIn) {
      try {
        const allValues = sheet.getDataRange().getValues();
        sendCheckInNotification(sheet, targetRow - 1, headers, allValues);
      } catch (e) {
        Logger.log('Walk-in notification failed: ' + e.toString());
      }
    }

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

// 1.2: Returns { response, lockReleased } so handleWriteActions knows whether
// to release the lock in its finally block.
function updateAttendee(sheet, data, lock) {
  Logger.log('🔔 updateAttendee() CALLED for ' + data.email);

  const values = sheet.getDataRange().getValues();
  const headers = values[0];

  let emailIndex = -1;
  headers.forEach((h, i) => { if (['email', 'e-mail'].includes(h.toString().toLowerCase().trim())) emailIndex = i; });
  if (emailIndex === -1) return { response: jsonResponse({ status: 'error', error: 'Email column not found' }), lockReleased: false };

  const indices = getColumnIndices(headers);

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

  if (rowIndex === -1) return { response: jsonResponse({ status: 'error', error: 'Attendee email not found' }), lockReleased: false };

  const now = new Date();
  let emailTriggerNeeded = false;

  Object.keys(data).forEach(function (key) {
    if (key.startsWith('_')) return;

    let colIndex = -1;
    if (key === 'attendance') colIndex = indices.attendance;
    else if (key === 'lanyardColor')  colIndex = indices.lanyardColor;
    else if (key === 'nameCardColor') colIndex = indices.nameCardColor;
    else if (key === 'notes') colIndex = indices.notes;
    else if (key === 'leadIntel') colIndex = indices.leadIntel;
    else if (key === 'attendeeType') colIndex = indices.attendeeType;

    if (colIndex > -1) {
      const val = data[key];

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

  SpreadsheetApp.flush();

  // 1.2: Release the lock early so the next writer isn't blocked while email sends.
  // We signal this back to handleWriteActions via lockReleased.
  let lockReleased = false;
  if (lock) {
    lock.releaseLock();
    lockReleased = true;
    Logger.log('🔓 Lock released early — allowing next user while email sends...');
  }

  if (emailTriggerNeeded) {
    Logger.log('🚨 ATTENDANCE TRUE — Preparing email...');
    try {
      // Re-read emailSent fresh from the sheet (not from the stale snapshot).
      // Prevents duplicate emails when a retried payload arrives after the first
      // attempt already wrote attendance + sent the notification.
      // If emailSent is not set (e.g. first email attempt failed), we still send.
      const alreadySent = indices.emailSent !== undefined &&
        !!sheet.getRange(rowIndex, indices.emailSent + 1).getValue();

      if (!alreadySent) {
        sendCheckInNotification(sheet, rowIndex - 1, headers, values);
      } else {
        Logger.log('📧 Email already sent for this attendee — skipping retry.');
      }
    } catch (e) {
      Logger.log('❌ Email Notification Failed: ' + e.toString());
    }
  }

  return {
    response: jsonResponse({ status: 'success', message: 'Updated', serverLastModified: now.getTime() }),
    lockReleased: lockReleased
  };
}

// 2.3: All user-supplied values are wrapped in escapeHtml() before being
// injected into the HTML email body.
function sendCheckInNotification(sheet, rowIndex, headers, values) {
  try {
    const row = values[rowIndex];
    const colIndices = getColumnIndices(headers);

    const attendanceValue = row[colIndices.attendance];
    const isCheckedIn = String(attendanceValue).toUpperCase() === 'TRUE';
    if (!isCheckedIn) return;

    if (colIndices.emailSent !== undefined && row[colIndices.emailSent]) {
      Logger.log('[CHECK-IN EMAIL] ⚠️ Email already sent. Skipping.');
      return;
    }

    const firstName  = row[colIndices.firstName] || '';
    const lastName   = row[colIndices.lastName] || '';
    const fullName   = (firstName + ' ' + lastName).trim();
    const spocEmail  = row[colIndices.spocEmail] || '';
    const contact    = row[colIndices.contact] || 'No Contact';
    const company    = row[colIndices.company] || 'Unknown Company';
    const spocSlack  = (colIndices.spocSlack !== undefined) ? (row[colIndices.spocSlack] || '') : '';

    if (!spocEmail || !spocEmail.includes('@')) {
      Logger.log('[CHECK-IN EMAIL] ❌ Invalid SPOC email. Aborting.');
      return;
    }

    // 2.3: Escape all user-supplied data before injecting into HTML
    const safeName    = escapeHtml(fullName);
    const safeCompany = escapeHtml(company);
    const safeContact = escapeHtml(contact);
    const safeSheet   = escapeHtml(sheet.getName());

    let recipients = spocEmail;
    if (spocSlack && spocSlack.includes('@')) recipients += ',' + spocSlack;

    let timestamp = row[colIndices.timestamp] || new Date();
    const formattedTime = Utilities.formatDate(new Date(timestamp), Session.getScriptTimeZone(), 'MMM dd, yyyy HH:mm');

    const checkInList = values.slice(1).filter(r => {
      return String(r[colIndices.attendance]).toUpperCase() === 'TRUE'
        && r[colIndices.spocEmail] === spocEmail;
    }).map(r => {
      const f = escapeHtml(r[colIndices.firstName] || '');
      const l = escapeHtml(r[colIndices.lastName] || '');
      const c = escapeHtml(r[colIndices.company] || '');
      const p = escapeHtml(r[colIndices.contact] || '');
      return `<li style="margin-bottom:6px;"><strong>${f} ${l}</strong> (${c}) — <a href="tel:${p}" style="color:#0066cc;">${p}</a></li>`;
    });

    const listHtml = checkInList.length > 0
      ? `<ul style="padding-left:20px; margin-top:10px;">${checkInList.join('')}</ul>`
      : '<p style="margin-top:10px;"><em>None yet</em></p>';

    const htmlBody = `
      <html><body style="font-family:Arial,sans-serif; font-size:14px; color:#333; line-height:1.6;">
      <div style="background:#fff3cd; border-left:4px solid #ffc107; padding:12px; margin-bottom:20px;">
        <strong style="color:#856404; font-size:16px;">Attendee Check-in Alert</strong>
      </div>
      <p><strong>${safeName}</strong> from <strong>${safeCompany}</strong> checked in at <strong>${safeSheet}</strong>.</p>
      <table style="margin-bottom:20px;">
        <tr><td style="font-weight:bold; width:120px;">Contact:</td><td><a href="tel:${safeContact}">${safeContact}</a></td></tr>
        <tr><td style="font-weight:bold;">Time:</td><td>${formattedTime}</td></tr>
      </table>
      <hr style="border:0; border-top:1px solid #ddd; margin:24px 0;">
      <p style="font-weight:bold;">Your Total Check-ins (${checkInList.length}):</p>
      ${listHtml}
      </body></html>`;

    GmailApp.sendEmail(recipients, `Check-in Alert: ${safeName} [${safeSheet}]`, '', { htmlBody: htmlBody, name: 'Event Check-in System' });

    if (colIndices.emailSent !== undefined) {
      sheet.getRange(rowIndex + 1, colIndices.emailSent + 1).setValue(new Date());
    }
    Logger.log('[CHECK-IN EMAIL] ✅ Email sent to ' + recipients);

  } catch (error) {
    Logger.log('[CHECK-IN EMAIL] ❌ FATAL ERROR: ' + error.toString());
    throw error;
  }
}

// ─── COLUMN UTILITIES ────────────────────────────────────────────────────────

// 3.4: COLUMN_ALIASES config map + reverse lookup replaces the brittle else-if
// chain. Adding a new alias is a one-line change in COLUMN_ALIASES.
// First-match-wins prevents duplicate columns from overwriting earlier ones.
const COLUMN_ALIASES = {
  firstName:    ['first name', 'firstname'],
  lastName:     ['last name', 'lastname'],
  fullName:     ['full name', 'fullname'],
  email:        ['email', 'e-mail'],
  contact:      ['contact', 'phone', 'mobile'],
  company:      ['company', 'organization'],
  attendance:   ['attendance', 'status'],
  timestamp:    ['check-in time', 'timestamp'],
  lanyardColor:   ['colour of the lanyard', 'lanyard color'],
  nameCardColor:  ['colour of name card', 'name card color', 'namecard color'],
  spocName:     ['spoc of the day', 'spoc name'],
  spocEmail:    ['spoc email', 'spoc_email'],
  spocSlack:    ['spoc slack', 'spoc_slack'],
  notes:        ['notes', 'note'],
  leadIntel:    ['lead intel', 'intel'],
  attendeeType: ['attendee type', 'type', 'category'],
  emailSent:    ['email sent', 'notification sent']
};

// Build reverse lookup once at script load: lowercase alias → canonical name
const _aliasReverseLookup = (function () {
  const lookup = {};
  Object.keys(COLUMN_ALIASES).forEach(function (canonical) {
    COLUMN_ALIASES[canonical].forEach(function (alias) {
      lookup[alias] = canonical;
    });
  });
  return lookup;
})();

function getColumnIndices(headers) {
  const indices = {};
  headers.forEach(function (header, i) {
    if (!header) return;
    const h = header.toString().toLowerCase().trim();
    const canonical = _aliasReverseLookup[h];
    if (canonical && indices[canonical] === undefined) {
      indices[canonical] = i; // first match wins
    }
  });
  return indices;
}

// ─── VALIDATION & SECURITY ───────────────────────────────────────────────────

// 2.2: Called at the top of handleWriteActions before the lock is acquired.
function validatePayload(action, data) {
  const errors = [];

  const stringFields = ['email', 'firstName', 'lastName', 'fullName', 'company', 'contact', 'title', 'linkedin', 'notes', 'leadIntel'];
  stringFields.forEach(function (f) {
    if (data[f] && String(data[f]).length > 500) errors.push(f + ' exceeds 500 character limit');
  });

  if (action === 'add') {
    if (!data.email || !data.fullName) errors.push('email and fullName are required');
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) errors.push('Invalid email format');
    if (data.contact && !/^\+?[0-9\s\-().]{7,20}$/.test(data.contact)) errors.push('Invalid phone format');
  }

  if (action === 'update') {
    if (!data.email) errors.push('email is required for update');
    if (data.lanyardColor && String(data.lanyardColor).length > 50) errors.push('lanyardColor too long');
  }

  if (action === 'update_event') {
    if (!data.eventId) errors.push('eventId is required');
    if (data.state && ['Active', 'Archived', 'Deleted'].indexOf(data.state) === -1) {
      errors.push('Invalid state. Must be: Active, Archived, or Deleted');
    }
  }

  if (action === 'log_event') {
    if (!data.eventId || !data.eventName || !data.sheetUrl) {
      errors.push('eventId, eventName, and sheetUrl are required');
    }
  }

  return errors;
}

// 2.3: Prevents HTML injection in email bodies.
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ─── UTILITIES ───────────────────────────────────────────────────────────────

/**
 * Converts a 1-based column number to an A1-notation column letter.
 * e.g. 1→A, 26→Z, 27→AA
 */
function colToLetter(col) {
  let letter = '';
  while (col > 0) {
    col--;
    letter = String.fromCharCode(65 + (col % 26)) + letter;
    col = Math.floor(col / 26);
  }
  return letter;
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function camelize(str) {
  return str.replace(/(?:^\w|[A-Z]|\b\w)/g, function (word, index) {
    return index === 0 ? word.toLowerCase() : word.toUpperCase();
  }).replace(/\s+/g, '');
}

/**
 * TEST FUNCTION: Manually test email sending from the GAS editor.
 * Update TEST_SHEET_URL and the sheet name before running.
 */
function testEmailNotification() {
  Logger.log('\n========== [TEST] EMAIL NOTIFICATION TEST ==========\n');
  const TEST_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1gtZuWwqtI-oI3njQy5hKxmgIfcnyDiRM5FSOBiHeUeA/edit';

  try {
    let ss;
    try {
      ss = SpreadsheetApp.openByUrl(TEST_SHEET_URL);
    } catch (e) {
      Logger.log('❌ Error: Could not open spreadsheet. Update TEST_SHEET_URL.');
      return;
    }

    const sheet = ss.getSheetByName('San Jose Dec25'); // ← change to your event name

    if (!sheet) {
      Logger.log('❌ Sheet not found. Available sheets:');
      ss.getSheets().forEach(function (s) { Logger.log('  - ' + s.getName()); });
      return;
    }

    const values = sheet.getDataRange().getValues();
    const headers = values[0];
    const colIndices = getColumnIndices(headers);

    Logger.log('Using sheet: ' + sheet.getName());
    Logger.log('Total rows: ' + values.length);
    Logger.log('Headers: ' + headers.join(' | '));

    let foundRow = -1;
    for (let i = 1; i < values.length; i++) {
      const attendanceValue = values[i][colIndices.attendance];
      if (attendanceValue === true || String(attendanceValue).toUpperCase() === 'TRUE') {
        foundRow = i;
        Logger.log('✅ Found checked-in attendee at row ' + (i + 1));
        break;
      }
    }

    if (foundRow === -1) {
      Logger.log('❌ No checked-in attendees found. Set at least one Attendance cell to TRUE and retry.');
      return;
    }

    Logger.log('\n📧 Sending test email...');
    sendCheckInNotification(sheet, foundRow, headers, values);
    Logger.log('\n========== [TEST] COMPLETED SUCCESSFULLY ==========\n');

  } catch (error) {
    Logger.log('❌ TEST ERROR: ' + error.toString());
    Logger.log('Stack: ' + error.stack);
  }
}
