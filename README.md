# Sales SPOC Dashboard: Setup, Architecture, and Functionality

This documentation provides a comprehensive guide to the Sales SPOC Dashboard, covering both the technical setup and the underlying architecture. It is designed for a developer with an amateur background to understand, maintain, and extend the system.

Part 1: How to Work With the System (Developer Guide)
This section explains how to set up the project locally, configure the backend, and deploy changes.

1. Local Development Setup
The project is built with Angular (v21) and Tailwind CSS.

Prerequisites: Ensure you have Node.js installed on your machine.

Install Dependencies: Open your terminal in the project folder and run:



npm install
Run Locally: Start the development server:



npm run dev
The app will typically be available at http://localhost:3000.

2. Setting Up the Backend (Google Apps Script)
The backend is a Google Apps Script that connects the app to Google Sheets.

Create a Script: Go to script.google.com and create a new project.

Paste Backend Code: Copy the backend code provided (Version 9) into the script editor.

Configure Master Sheet: Update the MASTER_SHEET_URL variable in the script with the URL of your "Master Event Log" spreadsheet.

Deploy as Web App:

Click Deploy > New Deployment.

Select Web App.

Set Execute as: Me.

Set Who has access: Anyone.

Copy the Web App URL.

Connect Frontend: Open src/services/data.service.ts in the frontend code and paste the copied URL into the HARDCODED_SCRIPT_URL variable.

3. Deploying the App
The project includes a GitHub Actions workflow for automatic deployment to GitHub Pages.

Push your code to the main branch of a GitHub repository.

The workflow in .github/workflows/deploy.yml will automatically build and deploy the app to https://<your-username>.github.io/Sales-SPOC-Dashboard/.

Part 2: How the System Works (Architecture)
The system uses a Serverless Architecture where the frontend communicates directly with Google Apps Script, which acts as both the API and the database manager.

1. Data Flow Overview
Database: Google Sheets stores all attendee data. Each event is a separate sheet (tab) or a different spreadsheet.

API: Google Apps Script handles GET (reading data) and POST (updating/adding attendees) requests via doGet and doPost functions.

Frontend State: The Angular app uses Signals (signal, computed) for reactive data management, ensuring the UI updates instantly when data changes.

2. Frontend Components
Landing Page: The entry point where users create new events or select existing ones. It fetches all events from the master log on load.

Role Selection: A gateway where users choose their role (Admin, SPOC, or Walk-in) for a specific event. It sets a session-based access key to authorize further navigation.

SPOC Dashboard: The primary interface. It has two modes controlled via route data:

Admin Mode: Full access to toggle attendance and update lanyard colors.

SPOC Mode: Read-only access to attendee status with the ability to add/edit personal notes.

Walk-in Page: A simplified standalone form for new attendees to register themselves on-site.

3. Key Services and Logic
Data Persistence: The DataService saves the list of active events to the browser's localStorage so they persist even after a page refresh.

Security (Guards): The roleGuard prevents unauthorized access to the dashboard. It checks for an access_{eventId} key in sessionStorage.

Automatic Syncing: The dashboard automatically refreshes data from the Google Sheet every 5 minutes to keep SPOCs updated on new arrivals.

4. Backend Logic & Email System
The backend script processes several actions:

read: Converts Google Sheet rows into JSON objects for the frontend.

update: Updates a specific attendee's record. If attendance is changed to true, it automatically triggers the Email Notification System.

Email System (sendCheckInNotification):

Identifies the assigned SPOC email for the attendee.

Generates a summary of all currently checked-in attendees for that SPOC.

Sends a formatted HTML email via GmailApp.

add: Handles walk-in registrations by appending a new row to the sheet and copying necessary formulas (like SPOC assignments) from the row above.

5. Attendee Data Model
Every attendee object contains:

Identity: Full Name, Email, Company, Title/Designation.

Event Details: Lanyard Color, Segment (e.g., Industry), Attendance Status.

Tracking: Check-in Time, Print Status.

Intelligence: Lead Intel (talking points) and SPOC-specific Notes.

 
