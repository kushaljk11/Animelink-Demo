This section defines how **RabiesTrack Nepal** can realistically be developed within the FYP timeframe.

|Weeks|Phase|Main Work|
|---|---|---|
|**1–2**|Planning & Design|Finalize requirements, use cases, workflows, ER diagram, UI planning, project setup, database design, authentication structure|
|**3–4**|Core User & Pet System|User registration/login, role-based access, pet registration, digital pet profile, QR generation|
|**5–6**|Vaccination Module|Vet verification, vaccination records, booster tracking, status calculation, digital vaccination certificate|
|**7**|Notification System|Redis/BullMQ setup, vaccination reminders, overdue alerts, background jobs|
|**8**|Lost Pet & CNVR|Lost-pet mode, QR scan flow, stray registration, CNVR tracking, duplicate detection logic|
|**9**|Bite/Rabies Reporting|Incident reporting, GPS capture, image upload, incident management|
|**10**|Geospatial Features|PostGIS integration, map visualization, nearby vet/shelter search, cluster/risk-area detection|
|**11**|AI & Additional Features|AI breed finder, chatbot, bilingual support, report export|
|**12**|Testing & Finalization|Testing, bug fixing, security checks, performance improvements, documentation, deployment, screenshots, final report preparation|
### Development Priority

The project should follow this priority:

**Core system first → advanced features second → optional enhancements last**

The most important modules to finish first are:

`Authentication → Pet Management → Vaccination → QR → Incident Reporting → Geospatial Mapping`

Features such as AI, advanced duplicate detection, chatbot improvements, or additional analytics can be refined later if time allows.

### Flexibility

The timeline can be adjusted after discussion with the supervisor and after further brainstorming or requirement analysis. If additional useful features are identified, they can be added only if they do not affect completion of the core FYP objectives.