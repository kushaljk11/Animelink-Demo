This section explains how **location data** will be used inside RabiesTrack Nepal.

### Purpose

The geospatial part of the system will help users and authorized organizations understand **where incidents, stray animals, CNVR activities, veterinary clinics, and shelters are located**.

The goal is not only to store coordinates, but also to use them for useful spatial analysis.

### Main Geospatial Data

The system may store location data for:

- Animal-bite incidents
- Suspected-rabies reports
- Community stray records
- CNVR release locations
- Veterinary clinics
- Rescue organizations / shelters
- Lost-pet last-seen locations

### Map Visualization

The frontend will use **Leaflet / React-Leaflet with OpenStreetMap** to display location-based information on an interactive map.

Users may be able to:

- View reported incidents on the map
- View nearby vets and shelters
- View CNVR activity locations
- View community stray locations
- View lost-pet last-seen locations
- Filter map data by type, date, or area

### Spatial Database

**PostgreSQL with PostGIS** will be used to store and query geographic coordinates.

For example:

`Incident Report → GPS Coordinates → PostGIS → Map Visualization`

### Nearby Search

The system can calculate nearby locations using spatial queries.

Example:

`User Location → Search Radius → PostGIS Query → Nearby Vets / Shelters`

This can help users quickly find relevant services around them.

### Incident Cluster Detection

If multiple bite or suspected-rabies reports occur within the same area, the system can identify them as a possible incident concentration or cluster.

Example:

`Multiple Reports → Distance Comparison → Cluster Detection → Highlighted Area on Map`

This can help ward or municipal users understand where reported incidents are becoming concentrated.

### Risk Area Visualization

The system may categorize areas based on the number and concentration of reported incidents.

For example:

- Low reported activity
- Moderate reported activity
- High reported activity

This should represent **reported incident concentration**, not a medical diagnosis or confirmed rabies risk unless verified data is available.

### Radius-Based Search

PostGIS functions such as:

```
ST_DWithin()
```

can be used to find records located within a specific distance.

For example:

- Bite incidents within 2 km
- Nearby veterinary clinics within 5 km
- CNVR records within a selected radius

### Ward-Level Analysis

Geospatial records can also be grouped by:

- Ward
- Municipality
- Date range
- Incident type
- Status

This can support dashboards and report generation for authorized users.

### Overall Geospatial Flow

`Location Captured → Stored in PostGIS → Spatial Query → Map Display → Cluster / Nearby Analysis → Dashboard / Report`

This is one of the strongest technical parts of your FYP because it goes beyond simply displaying pins on a map.