**Pet Owner, Veterinary Clinic, Rescue Organization / Shelter, Ward or Municipal Officer, and Public / Guest User.**

### Main Use Cases by Actor

**Pet Owner**

- Register / Login
- Manage profile
- Register pet
- Update pet details
- View digital pet profile
- Use AI breed finder
- View QR code
- View vaccination history
- Receive vaccination reminders
- Generate vaccination certificate
- Mark pet as lost/found
- Receive QR scan alerts
- Report bite or suspected-rabies incident
- Find nearby vets and shelters
- Use AI chatbot

**Veterinary Clinic**

- Register / Login
- Manage clinic profile
- Search/access permitted pet records
- Add vaccination record
- Verify vaccination record
- Update booster date
- View vaccination history
- Generate/validate vaccination certificate

**Rescue Organization / Shelter**

- Register / Login
- Manage organization profile
- Register stray/community animals
- Record CNVR activity
- Record vaccination and sterilization details
- Check duplicate stray records
- Store release location
- View stray/CNVR map data

**Ward / Municipal Officer**

- Login
- View bite and suspected-rabies reports
- View incident map
- View risk/cluster areas
- Monitor CNVR activities
- Filter records by ward/date/status
- View dashboard statistics
- Update incident status
- Export PDF/CSV reports

**Public / Guest User**

- Scan pet QR code
- View selected public pet information
- Contact owner of a lost pet
- Share optional found location
- Find nearby registered vets/shelters
- Submit limited public incident reports where allowed

### Simple Diagram Structure

When you eventually draw the UML use case diagram, place:

**RabiesTrack Nepal** in the center as the system boundary.

Then place the actors outside:

`Pet Owner → [RabiesTrack Nepal] ← Veterinary Clinic`

`Rescue Organization → [RabiesTrack Nepal] ← Ward Officer`

`Public / Guest → [RabiesTrack Nepal]`

Inside the system boundary, include the major use cases rather than every tiny action. For example:

**Manage Pet Profile**  
**Manage Vaccination Records**  
**Generate QR Identification**  
**Manage Lost Pet**  
**Manage CNVR Records**  
**Report Bite/Rabies Incident**  
**View Geospatial Map**  
**Detect Incident Clusters**  
**Find Nearby Vet/Shelter**  
**Generate Reports**  
**Use AI Services**

For the actual final report, I would avoid putting all 30+ individual actions into one diagram because it will become cluttered. We can later create **one main use case diagram** and, if needed, separate detailed diagrams for Pet Management, CNVR, and Rabies Surveillance.