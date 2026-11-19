This section documents the main technologies that will be used to build **RabiesTrack Nepal**.

### Frontend

- **Next.js**
- **React**
- **JavaScript / JSX**
- **Tailwind CSS**
- **React-Leaflet / Leaflet.js**

Used for building the user interface, dashboards, forms, responsive layouts, maps, and client-side interactions.

### Backend

- **Node.js**
- **Express.js**
- **JavaScript**

Used for API development, authentication, authorization, business logic, data processing, and communication with external services.

### Database

- **PostgreSQL**
- **PostGIS**

PostgreSQL will store structured application data, while PostGIS will manage geographic information and spatial queries.

### Background Processing

- **Redis**
- **BullMQ**

Used for background jobs such as vaccination reminders, overdue alerts, and notification scheduling.

### Mapping

- **Leaflet.js**
- **React-Leaflet**
- **OpenStreetMap**

Used to visualize incidents, CNVR locations, nearby vets, shelters, and other geospatial data.

### Authentication & Security

Possible technologies:

- JWT or secure session-based authentication
- Password hashing with bcrypt
- Role-Based Access Control
- Input validation
- HTTPS
- Secure cookies where applicable

### Media Storage

A cloud storage service can be used for:

- Pet images
- Incident photos
- Shelter images
- Supporting documents
- Generated certificates

Examples can include **Cloudinary or another suitable storage provider**.

### AI Components

- Image-based model or API for pet breed prediction
- AI chatbot integration for general guidance and system assistance

The exact AI model or provider can be selected later based on accuracy, cost, technical feasibility, and FYP requirements.

### Reporting

- PDF generation
- CSV export

Used for vaccination certificates, administrative reports, and filtered system data.

### Development & Testing Tools

Possible tools include:

- Git / GitHub
- Postman
- VS Code
- Jest
- Supertest
- Browser developer tools

### Deployment

Possible deployment options can include:

- **Vercel** for the Next.js frontend
- **Render / Railway / similar service** for backend deployment
- Managed PostgreSQL database
- Redis cloud service

The final deployment platform can be selected later depending on the free-tier limits, reliability, and project requirements.

### Stack Summary

`Next.js + React + JavaScript → Node.js + Express → PostgreSQL + PostGIS → Redis + BullMQ → Leaflet/OpenStreetMap → AI Services`