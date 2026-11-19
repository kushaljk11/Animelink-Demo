This section explains **how the major technologies and services in RabiesTrack Nepal connect with each other**.

### High-Level Architecture

`User / Browser`  
↓  
`Next.js + React Frontend`  
↓  
`Node.js + Express.js Backend API`  
↓  
`PostgreSQL + PostGIS Database`

Supporting services:

`Redis + BullMQ` → background jobs and reminders  
`Cloud Storage` → pet images, incident images, certificates  
`Map Service` → Leaflet / OpenStreetMap  
`AI Services` → breed prediction and chatbot  
`Notification Service` → email/SMS/other reminder delivery### 1. Frontend Layer

The frontend will be developed using:

- **Next.js**
- **React**
- **JavaScript / JSX**
- **Tailwind CSS**
- **React-Leaflet / Leaflet.js**

The frontend will handle:

- User interfaces
- Dashboards
- Pet profiles
- Forms
- Maps
- QR display
- Reports
- Language switching
- Communication with the backend API

### 2. Backend Layer

The backend will use:

- **Node.js**
- **Express.js**
- **JavaScript**

The backend will be responsible for:

- Authentication
- Role-based authorization
- Business logic
- Pet management
- Vaccination records
- CNVR records
- Bite/rabies reports
- Geospatial queries
- Notifications
- Report generation
- AI service integration

### 3. Database Layer

The primary database will be:

**PostgreSQL + PostGIS**

PostgreSQL will store normal relational data such as:

- Users
- Pets
- Clinics
- Vaccinations
- Stray records
- Incidents
- Notifications
- Organizations

PostGIS will handle geographic data such as:

- Bite locations
- Suspected-rabies locations
- CNVR release locations
- Vet/shelter locations
- Nearby searches
- Incident cluster analysis

### 4. Background Processing

**Redis + BullMQ** can be used for background processes such as:

`Vaccination Recorded → Booster Date Stored → Background Job Scheduled → Reminder Triggered → Notification Sent`

This prevents reminder processing from slowing down the main application.

### 5. Media Storage

Images and generated files can be stored using a cloud storage service.

Examples include:

- Pet photos
- Incident evidence images
- Clinic documents
- Generated certificates

The database stores the file URL rather than storing large images directly.

### 6. Geospatial Layer

Leaflet will display the maps on the frontend, while PostGIS will perform the actual spatial calculations on the backend.

For example:

`GPS Coordinates → PostGIS → Spatial Query → API Response → Leaflet Map`

This can support:

- Nearby vet search
- Nearby shelter search
- Incident radius search
- Stray/CNVR visualization
- Cluster detection

### 7. AI Layer

The AI component can contain two separate services:

**Pet Breed Recognition**

`Pet Image → Image Model/API → Predicted Breed → User Confirmation → Pet Profile`

**AI Chatbot**

`User Question → Chatbot Service → General Guidance / Navigation Support`

The chatbot should remain informational and should not diagnose rabies or replace medical or veterinary professionals.

### 8. Notification Layer

The system can use a notification service for:

- Upcoming vaccination reminders
- Overdue booster alerts
- Lost-pet QR scan alerts
- Important account notifications

                       ┌─────────────────────┐
                       │      Users          │
                       │ Owner / Vet / NGO   │
                       │ Ward Officer/Public │
                       └──────────┬──────────┘
                                  │
                                  ▼
                    ┌─────────────────────────┐
                    │ Next.js + React Frontend│
                    │ JavaScript + Tailwind   │
                    │ Leaflet Maps            │
                    └───────────┬─────────────┘
                                │
                             REST API
                                │
                                ▼
                     ┌──────────────────────┐
                     │ Node.js + Express.js │
                     │ Authentication/RBAC  │
                     │ Business Logic       │
                     └─────┬───────┬────────┘
                           │       │
              ┌────────────┘       └─────────────┐
              ▼                                  ▼
    ┌────────────────────┐              ┌─────────────────┐
    │ PostgreSQL/PostGIS │              │ Redis + BullMQ  │
    │ Records + Spatial  │              │ Background Jobs │
    └────────────────────┘              └─────────────────┘
              │
        ┌─────┴───────────────┐
        ▼                     ▼
 ┌───────────────┐     ┌───────────────┐
 │ Cloud Storage │     │ AI / External │
 │ Images / PDFs │     │ Services      │
 └───────────────┘     └───────────────┘