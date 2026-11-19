This section explains how **RabiesTrack Nepal** will be tested to make sure the system works correctly, securely, and reliably.

### 1. Functional Testing

Each major feature will be tested to confirm that it works as expected.

Examples:

- User registration and login
- Role-based access
- Pet registration
- QR generation and scanning
- Vaccination record creation
- Reminder scheduling
- Lost-pet mode
- CNVR tracking
- Bite/rabies reporting
- Map visualization
- Nearby vet/shelter search
- Report export

### 2. API Testing

Backend APIs will be tested using tools such as:

- Postman
- Jest
- Supertest

Testing will check:

- Correct responses
- Validation
- Authentication
- Authorization
- Error handling

### 3. Database Testing

The database will be tested to verify:

- Correct relationships
- Data integrity
- Unique records
- Vaccination history
- Spatial data storage
- PostGIS queries
- Duplicate prevention

### 4. Geospatial Testing

Location-based features will be tested for:

- GPS coordinate storage
- Map marker accuracy
- Nearby search
- Radius-based queries
- Incident filtering
- Cluster/risk-area detection

### 5. Security Testing

Basic security testing will include:

- Unauthorized access attempts
- Role permission checks
- Input validation
- Password protection
- Protected API routes
- File upload validation

### 6. Usability Testing

Selected users can test the prototype to evaluate:

- Ease of navigation
- Clarity of forms
- Ease of registering pets
- Understanding vaccination status
- Map usability
- Overall user experience

Feedback can then be used to improve the interface.

### 7. Responsive Testing

The system will be tested across:

- Desktop
- Tablet
- Mobile

and on common browsers such as Chrome, Edge, Safari, and Firefox.

### 8. AI Feature Evaluation

For the breed finder:

- Prediction accuracy
- Confidence level
- User confirmation rate

For the chatbot:

- Relevance
- Helpfulness
- Response quality
- Safe handling of medical/rabies-related questions

### 9. Performance Testing

Basic performance testing can measure:

- Page load time
- API response time
- Map loading
- Database query performance
- Background job execution

### 10. User Acceptance Testing

Before final submission, a small group of representative users can test the system and provide feedback on whether the main workflows are practical and understandable.

### Evaluation Goal

The project will be evaluated based on:

**Correctness + Usability + Security + Performance + Geospatial Accuracy + Technical Completeness**