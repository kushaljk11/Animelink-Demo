This section explains how the main processes in **Rabies Track Nepal** move from one step to another.

### 1. Pet Registration & Vaccination Flow

`User Registration → Pet Registration → Pet Profile Creation → AI Breed Suggestion → QR Code Generation → Vet Verification → Vaccination Record Added → Vaccination Status Updated → Reminder Scheduled → Digital Certificate Generated`

### 2. Lost Pet Flow

`Owner Marks Pet as Lost → Lost Status Activated → QR Code Scanned by Finder → Public Emergency Profile Displayed → Finder Contacts Owner → Optional Found Location Shared → Owner Marks Pet as Found`

### 3. Community Stray / CNVR Flow

`Stray Identified → Stray Registration → Duplicate Record Check → Vaccination/Sterilization Details Added → CNVR Record Created → Release Location Saved → Record Available for Future Tracking`

### 4. Animal Bite / Suspected Rabies Flow

`User Reports Incident → Incident Details Entered → GPS Location Captured → Report Submitted → Incident Plotted on Map → Spatial Analysis Performed → Risk/Cluster Detection → Relevant Authorities Can Monitor`

### 5. Nearby Vet / Shelter Flow

`User Opens Map → Current/Selected Location Used → Nearby Registered Vets & Shelters Retrieved → Distance-Based Results Displayed → User Views Details`

### 6. Vaccination Reminder Flow

`Vaccination Record Added → Booster Date Stored → System Checks Upcoming Dates → Status Changes to Due Soon → Reminder Sent → If Missed, Status Changes to Overdue`

### 7. Ward / Municipal Monitoring Flow

`Incident & CNVR Data Collected → Location Data Stored in PostGIS → Dashboard Aggregates Records → Map & Statistics Displayed → Officer Filters by Ward/Date/Status → Report Exported`

### Overall System Flow

`Register → Identify → Verify → Track → Remind → Report → Map → Analyze → Respond`

This overall workflow shows that the system is not just storing data; it is continuously turning records into useful tracking, alerts, and location-based analysis.