This section defines the main data entities and how they relate to each other.

### Main Entities

**1. Users**  
Stores all system users.

Typical fields:

- user_id
- full_name
- email
- phone
- password_hash
- role
- ward_number
- municipality
- created_at

Roles may include:  
`PET_OWNER`, `VET_CLINIC`, `RESCUE_ORG`, `WARD_OFFICER`

---

**2. Pets**  
Stores pet information registered by owners.

Typical fields:

- pet_id
- owner_id
- name
- species
- breed
- gender
- date_of_birth
- color
- photo_url
- medical_notes
- qr_token
- lost_status
- created_at

Relationship:

`User (Pet Owner) 1 → Many Pets`

---

**3. Vaccination Records**  
Stores verified vaccination history.

Typical fields:

- vaccination_id
- pet_id
- vet_id
- vaccine_name
- batch_number
- administered_date
- booster_due_date
- status
- notes
- verified_at

Relationship:

`Pet 1 → Many Vaccination Records`

`Vet Clinic 1 → Many Vaccination Records`

---

**4. Veterinary Clinics**  
Stores registered clinic information.

Typical fields:

- clinic_id
- user_id
- clinic_name
- registration_number
- phone
- address
- latitude
- longitude
- verification_status

---

**5. Rescue Organizations / Shelters**  
Stores rescue and shelter information.

Typical fields:

- organization_id
- user_id
- organization_name
- phone
- address
- latitude
- longitude
- verification_status

---

**6. Community Strays**  
Stores registered community or stray animals.

Typical fields:

- stray_id
- registered_by
- tag_or_ear_mark
- gender
- estimated_age
- color
- breed
- physical_description
- photo_url
- location
- created_at

---

**7. CNVR Records**  
Stores vaccination, sterilization, and release information for community animals.

Typical fields:

- cnvr_id
- stray_id
- organization_id
- vaccination_date
- sterilization_date
- release_location
- notes
- created_at

Relationship:

`Community Stray 1 → Many CNVR Records`

---

**8. Bite / Suspected Rabies Incidents**  
Stores reported incidents.

Typical fields:

- incident_id
- reported_by
- animal_type
- severity
- description
- incident_date
- suspected_rabies
- photo_url
- location
- ward_number
- status
- created_at

PostGIS can store the location as:

`GEOMETRY(Point, 4326)`

---

**9. Lost Pet Reports**  
Stores lost-pet activity.

Typical fields:

- lost_report_id
- pet_id
- last_seen_location
- last_seen_date
- description
- status
- created_at
- resolved_at

---

**10. QR Scan Events**  
Stores useful lost-pet QR scan activity.

Typical fields:

- scan_id
- pet_id
- scanned_at
- shared_location
- location_permission
- device_or_session_info

Only necessary data should be stored for privacy.

---

**11. Notifications**  
Stores reminder and alert information.

Typical fields:

- notification_id
- user_id
- type
- title
- message
- scheduled_at
- sent_at
- status

Examples:

`VACCINATION_REMINDER`  
`BOOSTER_OVERDUE`  
`LOST_PET_SCAN`

---

**12. AI Breed Predictions**  
If you want to record AI usage:

- prediction_id
- pet_id
- image_url
- predicted_breed
- confidence_score
- owner_confirmed
- created_at

This can also help you evaluate the AI feature later.

---

### Simplified ER Relationship

```
USER
 ├──< PET
 │     ├──< VACCINATION_RECORD
 │     ├──< LOST_PET_REPORT
 │     ├──< QR_SCAN_EVENT
 │     └──< AI_BREED_PREDICTION
 │
 ├── VETERINARY_CLINIC
 │        └──< VACCINATION_RECORD
 │
 ├── RESCUE_ORGANIZATION
 │        └──< CNVR_RECORD
 │
 ├──< BITE_INCIDENT
 │
 └──< NOTIFICATION


COMMUNITY_STRAY
      └──< CNVR_RECORD
```

### Geospatial Tables

PostGIS should mainly be used for:

`bite_incidents.location`

`community_strays.location`

`cnvr_records.release_location`

`veterinary_clinics.location`

`rescue_organizations.location`

This allows queries such as:

`Find incidents within X km`

`Find nearby vets`

`Find nearby shelters`

`Find CNVR records around an area`

`Detect concentrations of reported incidents`

At this stage, you do **not** need to finalize every database column. The goal is to define the entities, relationships, and the important spatial data first.