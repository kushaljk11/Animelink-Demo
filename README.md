# Rabies Track Nepal

**A web-based pet immunization and geospatial rabies surveillance system for Nepal.**

Rabies Track Nepal connects pet owners, veterinary clinics, rescue organisations and ward/municipal officers in one local-first platform. It covers digital pet identity with QR tags, vet-verified vaccination records with automatic booster reminders, community-stray CNVR tracking with duplicate detection, and mapped animal-bite and suspected-rabies reporting with cluster detection. It was built as a Final Year Project prototype for the Kathmandu Valley (Kathmandu, Lalitpur and Bhaktapur).

> **Status:** feature-complete prototype · decoupled **Express API** (`backend/`, :5000) + **Next.js client** (`frontend/`, :3000) · 28 pages · 161 automated API tests passing · runs fully offline except for map background tiles.

---

## Contents

1. [Executive overview](#1-executive-overview)
2. [Features vs. specification](#2-features-vs-specification)
3. [Architecture & tech stack](#3-architecture--tech-stack)
4. [Quick start](#4-quick-start)
5. [Default test accounts](#5-default-test-accounts)
6. [npm scripts](#6-npm-scripts)
7. [Testing & evaluation](#7-testing--evaluation)
8. [API reference](#8-api-reference)
9. [Security & privacy](#9-security--privacy)
10. [Viva defence cheat-sheet](#10-viva-defence-cheat-sheet)
11. [Limitations & future work](#11-limitations--future-work)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Executive overview

### The problem (Specs D–F)

Animal-health information in Nepal is fragmented across pet owners, clinics, rescue groups and local authorities:

- Pet vaccination records live on paper cards that get lost, and booster dates are missed.
- No one can easily verify whether a pet's vaccination history is genuine.
- Stray vaccination and sterilisation (CNVR) work is not centrally tracked, so the same dog may be caught twice while another is never treated.
- Animal-bite and suspected-rabies incidents are handled one at a time, with no shared geographic record that could reveal **where incidents are concentrating**.

> *"Animal-health and rabies-related information is scattered and difficult to track, verify, and analyse. Rabies Track Nepal brings it into one connected digital system."* (Spec F)

### Who benefits (Spec C, Section K)

| Beneficiary | What they get |
|---|---|
| **Pet owners** | Digital pet profile, QR collar tag, booster reminders, a downloadable PDF certificate, lost-pet mode with finder alerts |
| **Veterinary clinics** | Search registered pets, record and verify vaccinations, a verification queue for owners' paper cards |
| **Rescue organisations / shelters** | Stray registry, CNVR records, duplicate detection before re-treating an animal, stray map |
| **Ward / municipal officers** | Incident review workflow, cluster and risk-area maps, ward statistics, PDF/CSV exports |
| **Public / guests** | Report a bite without an account, track the report, scan a pet's QR tag, find nearby vets and shelters |

### Value proposition (Spec D "Why it is different")

**Digital pet identity + verified vaccination records + automated reminders + CNVR tracking + bite-incident mapping + geospatial analytics, in one system.** Each part strengthens the others. For example, a mapped cluster of bites can be compared with nearby CNVR coverage, and a lost pet's QR scan carries its verified rabies status.

### Scope (Spec J)

**In scope:** everything in Section J. **Out of scope by design:** diagnosing rabies, replacing veterinary or medical advice, replacing government surveillance systems, and acting as an emergency service. The UI and the chatbot repeat these limits wherever they are relevant.

---

## 2. Features vs. specification

| # | Spec H feature | Status | Where |
|---|---|---|---|
| 1 | Registration & role-based access | ✅ 3-step self sign-up (owner / clinic / rescue org, clinics start PENDING), 5 roles, server-side sessions, row-level scoping | `/register`, `/app/settings`, `backend/src/services/rbac.ts` |
| 2 | Digital pet profile | ✅ register, edit (incl. photo), vet patient lookup by name / owner phone / QR | `/app/pets`, `/app/pets/[id]` |
| 3 | AI photo breed finder | ✅ offline heuristic (coat-colour profile), confidence capped, owner confirms | `backend/src/services/ai/breed.ts` |
| 4 | QR identification | ✅ 128-bit token, PNG/SVG tag, public emergency profile | `/p/[token]` |
| 5 | Vet-verified vaccination records | ✅ owner submits → named clinic verifies / revokes | `/app/vaccinations` |
| 6 | Status tracking & reminders | ✅ Up to Date / Due Soon / Overdue derived live; idempotent reminder sweep | `backend/src/services/vaccination.ts`, `reminders.ts` |
| 7 | Digital vaccination certificate | ✅ PDF with QR and verified records only | `GET /api/pets/:id/certificate` |
| 8 | Lost-pet mode & QR scan alert | ✅ phone shown only while lost; finder can share location | `/p/[token]` |
| 9 | Community stray & CNVR tracking | ✅ | `/app/strays`, `/app/cnvr` |
| 10 | Duplicate stray detection | ✅ tag + distance + photo dHash + description scoring, human-reviewed | `backend/src/services/duplicates.ts` |
| 11 | Bite / suspected-rabies reporting | ✅ 4-step public wizard, GPS or map pin, photo | `/submit` |
| 12 | Geospatial incident mapping | ✅ Leaflet, clustered markers, layer toggles | `/app/map` |
| 13 | Risk-area & cluster detection | ✅ DBSCAN clusters + ~1 km activity grid + automatic cluster alerts | `backend/src/services/geo.ts` |
| 14 | Nearby vet & shelter finder | ✅ radius search, haversine distances | `/nearby` |
| 15 | AI chatbot | ✅ offline, bilingual, safety rules run first | `backend/src/services/ai/chatbot.ts` |
| 16 | Nepali & English | ✅ EN/ने toggle (cookie + profile), Noto Sans Devanagari self-hosted; marketing site, tracker, dashboard navigation and header translated. Data-entry forms are still English | `src/lib/i18n` |
| N1 | Bikram Sambat calendar | ✅ every API date gets a sibling `<key>BS` ("2083-07-23"); tables, inspectors and the dashboard show `Nov 9, 2026 | २०८३ कार्तिक २३` (Kathmandu day) | `backend/src/services/date.service.ts`, `src/lib/dates.ts` |
| N2 | Citizen tracking codes | ✅ `NP-XXXX-XXXX` per report, SMS on submit and on every status change; `GET /api/public/track?query=` by code or 10-digit mobile (phone lookups hide officer notes) | `backend/src/services/public.service.ts` |
| N3 | SMS / Viber / WhatsApp adapter | ✅ console in dev, Sparrow or Aakash SMS and an HMAC-signed chat webhook in production | `backend/src/services/notification.service.ts` |
| N4 | Marketing site | ✅ landing (hero, glass KPI card, 3-step workflow, resolved-cases map, trust section), About, Contact with SMS-verified inquiry form, helplines and FAQ | `src/app/(marketing)` |
| 17 | Owner ↔ vet chat | ✅ inbox + thread, unread badge, notification deep links, “Message a vet” from a pet or clinic | `/app/chat` |
| 18 | Stray re-identification | ✅ part of #10 (photo similarity) | `POST /api/strays/duplicates` |
| L.24 | PDF/CSV export | ✅ with an audit-log entry | `/app/reports` |
| U | Audit logging | ✅ verifications, status changes, CNVR, exports | `/app/audit` |

---

## 3. Architecture & tech stack

Two decoupled services in one repository:

```
 Browser ──────────────────────────────────────────────────────────────────────
   frontend/  Next.js 15 (App Router) — http://localhost:3000
     Public portal  /, /submit, /track, /nearby, /lost, /p/:token
     Staff app      /app/*  (Zenith shell, ⌘K, TanStack tables, Recharts,
                             Leaflet via next/dynamic { ssr:false })
     src/lib/api.ts  typed fetch client → NEXT_PUBLIC_API_URL, credentials:"include"
        │  JSON over HTTP + httpOnly session cookie (CORS: origin :3000, credentials)
        ▼
   backend/   Express 5 + TypeScript — http://localhost:5000/api
     routes/       auth · pets · health-records · domain · geo · stats · platform
     middleware/   authenticate (cookie→JWT→session row) · requireAuth/requireRole
                   · centralised error handler · multer uploads
     controllers/  HTTP in/out only: parse → call service → status code + JSON
     services/     business logic, state machines, RBAC scopes, haversine/DBSCAN,
                   reminders, PDF/QR/CSV, offline AI
     validators/   Zod schemas for every body/query (Section L)
        │ Prisma 6
        ▼
   PostgreSQL (local) — 18 tables, 24 FKs        backend/uploads — sanitised WebP
```

| Layer | Technology | Notes |
|---|---|---|
| Frontend | **Next.js 15** (App Router), React 19, TypeScript | No server-side DB access: Server Components call the API with the visitor's cookie (`src/lib/server-api.ts`) |
| UI | Tailwind CSS v4, Radix (shadcn-style), Lucide, cmdk, Sonner, next-themes | Zenith/Apex achromatic tokens, dark + light |
| Data grid / charts / maps | TanStack Table v8, Recharts, Leaflet + react-leaflet + supercluster | Map loaded client-only |
| Backend | **Express 5** + TypeScript (run with tsx) | Matches the spec's Node/Express backend (Section P) |
| Database | **PostgreSQL** + Prisma 6 | lat/lng with composite indexes |
| Auth | jose (HS256 JWT) in an httpOnly cookie + server-side `Session` rows + bcrypt | CORS restricted to the frontend origin with credentials |
| Validation | Zod on the API; React Hook Form + Zod in forms | |
| Files | multer → sharp (re-encode to WebP, strip EXIF/GPS), pdf-lib, qrcode | Images served by the API at `/uploads/*`; the frontend proxies `/uploads/*` so stored paths work in `<img>` |
| Orchestration | npm `--prefix` scripts + **concurrently** | `npm run dev` starts API and web together |
| Tests | Vitest | unit + HTTP integration against the in-process Express app and a `_test` database |

### Request flow (example: verifying a vaccination)

`frontend` `api("/vaccinations/:id/verify", { method: "POST" })` → `routes/health-records.routes.ts` (`requireRole(["VET_CLINIC"])`) → `controllers/vaccination.controller.ts` (`parseBody(vaccinationDecisionSchema)`) → `services/vaccination-record.service.ts` (named-clinic check, PENDING→VERIFIED transition, owner notification) → `audit()` → `200 JSON`.

### Spec → local substitutions

| Spec (Sections P/Q) | This build | Why |
|---|---|---|
| Node + Express backend | ✅ Express 5 in `backend/` | as specified |
| PostGIS `ST_DWithin` / clustering | lat/lng + bounding-box SQL pre-filter + haversine; DBSCAN in TypeScript | no extension to install; exact at city scale (see §10) |
| Redis + BullMQ | in-process scheduler + idempotent sweep (dedupe keys) | no extra service |
| Cloudinary | `backend/uploads` behind an access-controlled route | offline; incident photos stay private |
| Paid AI APIs | local breed heuristic + rule-based bilingual chatbot | zero cost / network, deterministic for evaluation |
| SMS / email | in-app notification centre | no paid gateway needed |

### Project layout

```
package.json            root orchestration (concurrently) · scripts/setup.mjs · run-local.{sh,ps1,bat}
backend/
  prisma/               schema.prisma (18 models) · migrations/ · seed.ts (deterministic)
  src/server.ts         listen :5000 + reminder scheduler     src/app.ts  createApp() (also used by tests)
  src/config/           env (loads backend/.env) · db (Prisma client)
  src/routes/           auth · pets · health-records · domain · geo · stats · platform · index
  src/controllers/      auth · user · pet · vaccination · directory · community · incident
                        · geo · stats · messaging · platform
  src/services/         *.service.ts domain logic + geo · vaccination · reminders · duplicates
                        · rbac · audit · notify · pdf · qr · csv · uploads · ai/
  src/middleware/       auth (authenticate, requireAuth, requireRole) · error · upload
  src/validators/       Zod schemas            src/utils/http.ts  ApiError, list contract, rate limit
  tests/unit/  tests/integration/
frontend/
  src/app/(portal)/     public pages           src/app/(app)/app/   staff dashboard
  src/components/       ui · dashboard · tables · maps · entities · portal
  src/lib/api.ts        typed API client       src/lib/server-api.ts  cookie-forwarding SSR fetch
  next.config.ts        /uploads/* proxy to the API
```

---

## 4. Quick start

For Neon, `neon deploy` pulls `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` (direct) into the root `.env`. Copy both values into `backend/.env`, which the Express server and Prisma CLI load. Repeat this after refreshing Neon credentials. Prisma uses the direct URL for migrations; for local PostgreSQL both variables can use the same URL. Apply the existing schema with `npm run db:deploy --prefix backend`. This does not seed demo accounts; `npm run db:seed` is a separate, optional operation.

### Prerequisites

- **Node.js 20.12+** (22 LTS recommended)
- **PostgreSQL 14+** running locally. If you don't have it:
  ```bash
  docker run -d --name rtn-pg -e POSTGRES_USER=rtn -e POSTGRES_PASSWORD=rtn -p 5432:5432 postgres:16
  ```

### Run it

```bash
# 1. Point the API at an EMPTY database name (it is created automatically)
cp backend/.env.example backend/.env
#    edit DATABASE_URL, e.g. postgresql://rtn:rtn@localhost:5432/rabies_track
#    (skip this step and setup copies the template for you)

# 2. One command: install all → env files → migrate → seed → API :5000 + web :3000
./run-local.sh            # macOS / Linux / Git Bash
.\run-local.ps1           # Windows PowerShell
run-local.bat             # Windows cmd
# (equivalent: npm run setup)

# 3. Open http://localhost:3000 and sign in with a demo account (§5)
#    API health: http://localhost:5000/api/health
```

`scripts/setup.mjs`:

1. Checks the Node version.
2. Installs root, backend and frontend dependencies if they are missing.
3. Creates `backend/.env` (with a freshly generated `JWT_SECRET`) and `frontend/.env.local`, if missing.
4. Creates `backend/uploads`.
5. Checks that PostgreSQL is reachable.
6. Runs `prisma generate` and `prisma migrate deploy`, which creates the database if it doesn't exist.
7. Seeds the data, then starts both servers.

It **never drops existing data**: if `DATABASE_URL` points at a database with another application's tables, it stops and tells you why.

| Flag | Effect |
|---|---|
| `--keep-data` | Skip reseeding when users already exist |
| `--no-dev` | Prepare everything without starting the servers |
| `--skip-install` | Never run `npm install` |

> **Note:** the seed **wipes and rebuilds** the app's tables each time it runs (unless you pass `--keep-data`).

### Configuration

| File | Key | Default | Purpose |
|---|---|---|---|
| `backend/.env` | `DATABASE_URL` | — | PostgreSQL connection |
| | `JWT_SECRET` | generated | Session token signing |
| | `PORT` | `5000` | API port |
| | `NOTIFY_MODE` | `console` (dev) / `live` (production) | `console` prints SMS to the API terminal; `live` sends them |
| | `SMS_PROVIDER` | `sparrow` | `sparrow` or `aakash` |
| | `SPARROW_SMS_TOKEN` / `SPARROW_SMS_FROM` | — | Sparrow SMS credentials (live mode) |
| | `AAKASH_SMS_TOKEN` | — | Aakash SMS token (live mode) |
| | `CHAT_WEBHOOK_URL` / `CHAT_WEBHOOK_SECRET` | — | Viber/WhatsApp bridge; body is signed with HMAC-SHA256 in `x-rtn-signature` |
| | `GEOCODER` | on | `off` disables OpenStreetMap lookups (municipality then comes from nearby records only) |
| | `GEOCODER_URL` | `https://nominatim.openstreetmap.org` | Point at a self-hosted Nominatim for fully offline use |
| | `CORS_ORIGIN` / `FRONTEND_URL` | `http://localhost:3000` | Allowed browser origin (with credentials); also the base of QR and certificate links |
| `frontend/.env.local` | `NEXT_PUBLIC_API_URL` | `http://localhost:5000/api` | Where the browser calls the API |
| | `API_INTERNAL_URL` | = public URL | API URL for Server Components if it differs (e.g. Docker) |

### What gets seeded

A deterministic Kathmandu-Valley dataset, identical on every machine, with timestamps spread over the last 30 days so every chart is populated:

| Users | Pets | Vaccinations | Clinics | Rescue orgs | Strays | CNVR | Incidents | Lost reports | QR scans | Notifications | AI predictions | Audit logs | Chat msgs | Chatbot logs |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 74 | 45 | 89 | 22 | 21 | 33 | 31 | 64 | 21 | 32 | 49 | 26 | 183 | 63 | 26 |

The seed also plants incident hotspots at Kalanki, Koteshwor and Patan for cluster detection, and a near-duplicate stray pair for the duplicate checker.

---

## 5. Default test accounts

| Role | Email | Password | Can do |
|---|---|---|---|
| **Admin** | `admin@local.dev` | `Admin@1234` | Everything. Verifies clinics and rescue orgs, manages users, full audit log, runs the reminder sweep |
| **Operator (Ward Officer)** | `operator@local.dev` | `Operator@1234` | Kathmandu incidents only: review → verify → resolve, cluster and risk maps, ward stats, CSV/PDF export, incident audit trail |
| **User (Pet Owner)** | `user@local.dev` | `User@1234` | Own pets, QR tags, certificates, lost mode, submit paper vaccination cards, report incidents, chatbot |
| Veterinary clinic | `vet@local.dev` | `Vet@1234` | Search pets, record and verify vaccinations at their (verified) clinic, edit medical notes |
| Rescue organisation | `rescue@local.dev` | `Rescue@1234` | Register strays (with duplicate check), CNVR records, stray map, redacted incident view |
| Every other seeded user | see `/app/users` as admin | `Password@123` | Includes pending, rejected and suspended clinics and orgs for testing verification |

### Main user flows

| Who | Start here | Typical task |
|---|---|---|
| New pet owner | Landing → **Register your pet** → `/register` | Create account → lands on *My pets* with the *Register a pet* dialog open → QR tag & certificate |
| Pet owner | Dashboard → booster banner / *My pets* | Edit pet, submit paper card, **Message a vet**, mark lost/found |
| New clinic / rescue org | `/register` → choose account type | Sign up with organisation details → *Settings* shows verification status → admin verifies → notification links back to *Settings* |
| Vet | Dashboard → **Find a patient** | Search by pet name, owner phone or scanned QR → record / verify vaccination; reply in *Owner messages* |
| Ward officer / rescue org | *Incidents* → filter **Unassigned** | Open a report → **Take this case** (first come, first served; a second team gets a clear "already taken by …" message) → Review → Verify → Resolve. The handler sees the reporter’s phone, can **Release** the case, and every step notifies the reporter |
| Admin (incidents) | *Incidents* → **Unassigned** | Sees who handles every case. Assigns or reassigns a ward officer covering that municipality, or a verified rescue org (nearest first, with distance and caseload). Admin status changes are audited under the admin but never make the admin the handler |
| Admin | Sidebar badge on *Clinics* | Open pending clinic → Verify / Reject / Suspend with a note |
| Everyone | Avatar menu or sidebar footer → **Settings** | Update profile, ward, language, password |

In development, the **role switcher** in the header and the **demo buttons** on `/login` switch between these accounts in one click. Both are disabled in production builds unless `ENABLE_ROLE_SWITCHER=true`.

---

## 6. npm scripts

**Root** (run from the repository root):

| Script | What it does |
|---|---|
| `npm run setup` | One command: install all → env files → migrate → seed → `npm run dev` |
| `npm run dev` | **concurrently** runs `API` (backend `tsx watch`, :5000) and `WEB` (frontend `next dev`, :3000); Ctrl+C stops both |
| `npm run install:all` | `npm install` in `backend/` and `frontend/` |
| `npm run db:setup` | Backend `prisma generate && prisma migrate deploy && prisma db seed` |
| `npm run dev:backend` / `dev:frontend` | Start one service only |
| `npm test` | Backend test suite (unit + integration, 161 tests) |
| `npm run typecheck` | Strict `tsc` for both packages |
| `npm run build` / `start` | Compile the backend to `backend/dist` and build the frontend; start both production servers |

**Backend** (`npm run <script> --prefix backend`): `dev` (tsx watch), `build` (tsc → `dist/`), `start` (`node dist/server.js`), `db:migrate` (`prisma migrate dev` for schema changes), `db:deploy`, `db:push`, `db:seed`, `db:studio`, `test:unit`, `test:integration`.

**Frontend** (`--prefix frontend`): `dev`, `build`, `start`, `typecheck`.

---

## 7. Testing & evaluation

```bash
npm test                  # from the root (runs backend/ tests)
#  ✓ unit         geo · validators · domain · uploads                     89 tests
#  ✓ integration  auth-rbac · workflows · api-validation                  72 tests
#  Test Files 7 passed · Tests 161 passed
```

**Integration isolation.** `backend/tests/integration/global-setup.ts` derives `<name>_test` from `DATABASE_URL`, runs `migrate deploy` + the seed against **that test database only**, then mounts the real `createApp()` on an ephemeral port in-process — the same middleware, routes and controllers as `npm run dev`, no browser or frontend needed. Set `TEST_BASE_URL` to target an already-running API instead.

| Spec Y area | Covered by |
|---|---|
| Y.1 Functional | `workflows.test.ts`: incident lifecycle, vaccination verify/revoke, lost pet ↔ QR scan ↔ notification, stray duplicates, reminders, PDF certificate |
| Y.2 API (responses, validation, auth, errors) | `api-validation.test.ts`, `auth-rbac.test.ts`: 400 / 401 / 403 / 404 / 409 / 423 shapes |
| Y.3 Database (relations, integrity, duplicates) | Seed runs with all 24 foreign keys enforced; duplicate registration → 409; unique QR tokens |
| Y.4 Geospatial | `geo.test.ts`: haversine against fixed values (1° = 111.195 km, antipodes = πR) and cross-checked with the spherical law of cosines; bbox completeness; DBSCAN; risk grid. Integration: nearby distances sorted and within radius; the Kalanki hotspot is detected |
| Y.5 Security | Anonymous 401s for 18 protected routes; 15 role-gate 403s; account lockout; tampered JWT; logout revocation; upload MIME spoofing, size limits, EXIF stripping, path traversal |
| Y.8 AI evaluation | Chatbot safety rules (bite → escalate, diagnosis → refuse, Nepali detection, PII scrubbing); `/api/ai/metrics` reports confirmation rate, calibration, escalation rate and helpfulness |

**HTTP status conventions:**

| Status | Meaning |
|---|---|
| `400` | Malformed request: Zod validation failure (`code: "VALIDATION_ERROR"` + `details.fieldErrors`), bad JSON, unknown sort field or filter value |
| `423` | Account locked after repeated failed sign-ins |
| `429` | Rate limited |

---

## 8. API reference

Base URL **`http://localhost:5000/api`** (frontend: `NEXT_PUBLIC_API_URL`). All endpoints return JSON. Errors use `{ "error": { "code", "message", "details?" } }`. Authentication is the httpOnly `rtn_session` cookie set by `POST /api/auth/login`; browser clients must send credentials (`fetch(…, { credentials: "include" })`) from an allowed CORS origin. Uploaded images are served at `http://localhost:5000/uploads/*`.

**List contract (every table endpoint):** `?page=1&limit=20` (max 100) · `query=` text search · `sort=<field>&order=asc|desc` (whitelisted fields only) · `status=A,B` (CSV, enum-checked) · `from=&to=` (ISO dates). The response is `{ data: [...], meta: { page, limit, total, pageCount } }`.

**Auth column:** 🌐 public · 🔑 any signed-in user · role names = required role (ADMIN always passes).

### Auth & users

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/auth/register` | 🌐 | `{fullName,email,password,role?:PET_OWNER\|VET_CLINIC\|RESCUE_ORG, clinic?, organization?}`. Clinics and orgs start PENDING |
| POST | `/api/auth/login` · `/api/auth/logout` | 🌐 / 🔑 | Lockout after 5 failures (15 min) |
| GET, PATCH | `/api/auth/me` | 🔑 | Profile, unread count; update name, phone, ward, locale |
| POST | `/api/auth/password` | 🔑 | Signs out all other sessions |
| GET, POST | `/api/auth/switch-role` | dev only | `{role}` → signs in as that role's demo account |
| GET, POST | `/api/users` | ADMIN | Filters `role`, `isActive`, `municipality`, `wardNumber`. POST creates officers and admins |
| GET, PUT, DELETE | `/api/users/:id` | ADMIN | DELETE = deactivate (soft) and revoke sessions |

### Pets, QR & lost pets

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET, POST | `/api/pets` | 🔑 (POST: PET_OWNER) | Owners see their own; vets search all. Filters `species`, `lost`, `ownerId`. Rows include a derived `vaccination.status` |
| GET, PUT, DELETE | `/api/pets/:id` | owner / vet (medical notes only) | |
| POST | `/api/pets/:id/lost` · `/found` | owner | `{lastSeenDate, lastSeenLatitude?, lastSeenLongitude?, description?}` |
| GET | `/api/pets/:id/qr` | owner / vet | `?format=png\|svg&size=128..1024&download=1` |
| GET | `/api/pets/:id/certificate` | owner / vet | PDF of verified records only |
| GET | `/api/public/pets/:token` | 🌐 | Emergency profile; phone only while the pet is lost |
| POST | `/api/public/pets/:token/scan` | 🌐 | `{shareLocation, latitude?, longitude?, message?, contact?}` → notifies the owner |
| GET | `/api/lost-reports` · `/:id` (GET, PUT) | 🌐 list (coarse location) / owner | `?mine=true` |
| GET | `/api/qr-scans` | PET_OWNER | Scan history for the owner's pets |

### Vaccinations & directory

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET, POST | `/api/vaccinations` | 🔑 / VET_CLINIC, PET_OWNER | Filters `status`, `boosterStatus=UP_TO_DATE,DUE_SOON,OVERDUE,NO_BOOSTER`, `petId`, `clinicId`, `mine`. Owners must pass `clinicId` (stays pending) |
| GET, PUT, DELETE | `/api/vaccinations/:id` | scoped | Only pending records can be deleted |
| POST | `/api/vaccinations/:id/verify` | VET_CLINIC (named clinic) | `{decision: VERIFY\|REVOKE, notes?}` |
| GET, POST | `/api/clinics` · `/api/organizations` | 🌐 (verified only) / ADMIN, officers (all) | Filters `status`, `municipality`, `wardNumber`, `hasShelter` |
| GET, PUT, DELETE | `/api/clinics/:id` · `/api/organizations/:id` | owner account / ADMIN | Changing the registration number resets the clinic to PENDING |
| POST | `/api/clinics/:id/verification` · `/api/organizations/:id/verification` | ADMIN | `{status: VERIFIED\|REJECTED\|SUSPENDED, note?}` |

### Strays & CNVR

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET, POST | `/api/strays` | RESCUE_ORG, officers, vets / RESCUE_ORG | Filters `sterilized`, `vaccinated`, `gender`, `municipality`. A likely duplicate → **409 `POSSIBLE_DUPLICATE`** with candidates unless `acknowledgeDuplicates:true` |
| GET, PUT, DELETE | `/api/strays/:id` | same | Can't delete once CNVR history exists |
| POST | `/api/strays/duplicates` | same | Scored candidates with reasons |
| GET, POST | `/api/cnvr` | same / verified RESCUE_ORG | Filters `sterilized`, `vaccinated`, `released`, `strayId`, `mine` |
| GET, PUT, DELETE | `/api/cnvr/:id` | the owning organisation | |

### Incidents

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/incidents` | 🌐 (guests must give a phone) | `{animalType, severity, description, incidentDate, suspectedRabies, latitude, longitude, locationAccuracyM?, address?, municipality?, wardNumber?, photoUrl?}` → returns a tracking code; raises officer and cluster alerts |
| GET | `/api/incidents` | 🔑 (scoped) | Filters `status`, `severity`, `animalType`, `suspectedRabies`, `municipality`, `wardNumber`, `mine` |
| GET, PUT, DELETE | `/api/incidents/:id` | scoped | The reporter can edit until review starts. GET includes the audit history for officers |
| PATCH | `/api/incidents/:id/status` | WARD_OFFICER | `{status, note?}`. Allowed moves: REPORTED→UNDER_REVIEW/VERIFIED/DISMISSED · UNDER_REVIEW→VERIFIED/DISMISSED/RESOLVED · VERIFIED→RESOLVED/UNDER_REVIEW · RESOLVED/DISMISSED→UNDER_REVIEW. Anything else → 409 |
| GET | `/api/public/incidents/:code` | 🌐 | Progress timeline only, no personal data |

### Geospatial

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/geo/nearby` | 🌐 | `lat, lng, radiusKm (0.1–50, default 5), types=clinic,shelter, limit` → sorted by distance |
| GET | `/api/geo/within` | per layer | `layer=incidents\|strays\|cnvr\|clinics\|shelters\|lost, lat, lng, radiusKm, from, to` |
| GET | `/api/geo/clusters` | WARD_OFFICER, RESCUE_ORG | DBSCAN: `epsKm` (0.6), `minPts` (3), `from`, `to`, `suspectedOnly`, `municipality`, `wardNumber` |
| GET | `/api/geo/risk-areas` | 🌐 (aggregated) | `cellKm` (1), `from`, `to`. Cells with a single report are hidden from anonymous users |
| GET | `/api/geo/map` | 🌐 / per layer | GeoJSON FeatureCollections for `layers=…`, plus date, area and viewport filters. Layers you can't access are listed in `hidden` |

### Analytics, reports, AI, misc

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/stats/overview` | 🔑 | Role-aware KPIs with period-over-period deltas and sparklines, zero-filled daily series, breakdowns. `?days=7..365` |
| GET | `/api/stats/wards` | WARD_OFFICER | Counts per ward (no coverage %, because populations are unknown) |
| GET | `/api/reports/export` | role-gated per dataset | `entity=incidents\|vaccinations\|cnvr\|strays\|pets\|clinics\|organizations, format=csv\|pdf`, filters. Every export is audited |
| GET | `/api/audit` | WARD_OFFICER (incident/CNVR), ADMIN (all) | Filters `entityType`, `entityId`, `actorId`, `action` |
| GET | `/api/search?q=` | 🔑 | Role-aware fuzzy search for the ⌘K palette |
| POST / PATCH | `/api/ai/breed` · `/api/ai/breed/:id` | 🔑 | multipart `file` or `{imageUrl}` → suggestion; PATCH `{confirmed, finalBreed?, petId?}` |
| POST / PATCH | `/api/ai/chat` · `/api/ai/chat/:id` | 🌐 | `{message, locale?}` → answer, `safetyEscalated`, links; PATCH `{helpful, sessionKey}` |
| GET | `/api/ai/metrics` | WARD_OFFICER | Section T.5 evaluation metrics |
| GET, PATCH, DELETE / POST | `/api/notifications`, `/:id`, `/read-all` | 🔑 | `?unread=true&type=…` |
| POST | `/api/notifications/reminders` | ADMIN | Run the booster sweep now (also runs hourly) |
| GET, POST | `/api/conversations`, `/:id/messages` | PET_OWNER ↔ VET_CLINIC | Owner–vet chat |
| POST | `/api/uploads` | 🔑 (guests: incident photos only) | multipart `file`, `kind=pets\|incidents\|strays\|breed` |
| GET | `/api/nav-counts` · `/api/health` | 🔑 / 🌐 | Sidebar badges / liveness |

---

## 9. Security & privacy

Section U principle: *collect only what is needed, show only what is necessary, allow only authorised users.*

**Authentication**
- Passwords are hashed with bcrypt (12 rounds) and must meet a strength policy.
- Unknown emails go through the same bcrypt timing, so response time doesn't reveal which emails are registered.
- After 5 failed attempts the account is locked for 15 minutes.

**Sessions**
- The HS256 JWT sits in an httpOnly, SameSite=Lax cookie (Secure in production).
- Each JWT is bound to a row in the `Session` table, so logout, password changes and deactivation revoke it server-side.

**Authorisation, in three layers**
1. Middleware gates `/app/*` pages.
2. Every handler calls `requireAuth` or `requireRole`.
3. Every query is narrowed by a row-level scope from `rbac.ts`.

Records outside your scope return **404**, so their existence isn't leaked.

**Location privacy**
- The owner's phone appears only while a pet is in lost mode; the owner's address is never shown.
- Public lost-pet and map locations are rounded to about 110 m.
- The public risk grid hides cells containing a single report.
- Uploaded photos are re-encoded with **EXIF/GPS metadata removed**.

**Uploads**
- Images are checked against a MIME allow-list and their actual file bytes, limited to 5 MB and to a 40-megapixel decode size, and given random file names.
- Path traversal is blocked.
- Incident photos are served only to officers, rescue orgs and the person who reported them.

**Input handling**
- Every request body and query is validated with Zod.
- Sort fields are whitelisted.
- Prisma parameterises all SQL.
- CSV exports neutralise spreadsheet formula injection.

**Accountability and abuse limits**
- Vaccination verification, status changes, CNVR changes, exports and admin actions are written to the `AuditLog`, with a salted hash of the IP address.
- Public endpoints have per-IP rate limits.

**AI privacy:** everything runs locally, nothing leaves the machine, and chatbot logs have phone numbers and emails removed before they are stored.

---

## 10. Viva defence cheat-sheet

**Why local-first?**
The spec names paid or cloud services (Cloudinary, Redis cloud, AI APIs, SMS). A prototype that depends on credentials and credit is fragile to demonstrate and hard to reproduce. Here, every service has a local equivalent behind an interface: `BreedPredictor`, the `notify()` delivery function, and the upload store. The system runs from one command, and each piece can be swapped for its cloud version later without touching the callers.

**Why PostgreSQL without PostGIS, and is it correct?**
Radius search works in two stages:
1. A **bounding-box pre-filter** in SQL, using composite `(latitude, longitude)` B-tree indexes.
2. An exact **haversine** check in TypeScript.

The box is mathematically guaranteed to contain the whole circle, so stage 1 never drops a valid point; this is unit-tested. At valley scale (a few km) the spherical-Earth error compared with the WGS-84 ellipsoid is under 0.5%. This is what PostGIS `ST_DWithin` does internally (index-accelerated box → exact distance). Moving to PostGIS later means replacing `bboxWhere` + `withinRadius` with one SQL call.

**How are clusters found?**
- **DBSCAN** (density-based clustering, the same algorithm as PostGIS `ST_ClusterDBSCAN`) with a uniform grid index, so each neighbour lookup checks only 9 cells. Defaults: ε = 600 m, minPts = 3, last 30 days.
- A separate **~1 km risk grid** scores each cell as reports + suspected cases + 0.5 × high-severity cases.

Both are labelled as *reported activity*, never as confirmed rabies risk (Section S).

**ERD and normalisation decisions**
- **The 12 Section R entities map 1:1.** Six additions are each required elsewhere in the spec: Account and Session (U), AuditLog (U), Conversation and ChatMessage (H.17), ChatbotLog (T.5).
- **Booster status is not stored.** Up to Date / Due Soon / Overdue is *derived* from `boosterDueDate` when a record is read, so it can never go stale. Storing it would duplicate data that depends on another field, which normalisation rules out.
- **Two separate status concepts on vaccinations:** a record's lifecycle (`PENDING_VERIFICATION / VERIFIED / REVOKED`) is a different thing from booster status.
- **Verification belongs to the clinic, not the vet user.** `vet_id` references the clinic, as in Section R.
- **Guest reports are first-class.** `reported_by` is nullable, with minimal guest contact fields.
- **Foreign-key behaviour:** CASCADE where a child has no meaning without its parent (a pet's records); RESTRICT where history matters (a clinic with vaccinations can't be deleted, only suspended); SET NULL for authorship.

**Why 409 rather than 400 for illegal transitions?**
400 means the request itself is malformed (Zod validation, bad JSON). Moving `REPORTED → RESOLVED` is a well-formed request that conflicts with the record's *current state*, which is what 409 Conflict means. An unknown status value is malformed input and returns 400.

**Offline resilience**
No runtime network calls except OpenStreetMap tiles. AI, PDFs, QR codes and reminders all run locally. The reminder sweep is **idempotent**: each reminder has a unique dedupe key, so it is safe to run on boot, hourly or manually. It also takes later doses into account, so a pet that has already had its booster isn't reminded again.

**AI ethics (Section T)**
- The breed finder is honest about what it is: a colour-profile heuristic with confidence capped at 75%, always confirmed by the owner, and evaluated through its confirmation rate and calibration.
- The chatbot runs its safety rules *before* any intent matching. A bite message always gets first aid plus "go to hospital today"; a diagnosis request is always refused.

**Why server-side sessions on top of JWTs?**
A JWT on its own can't be revoked. Linking each token to a `Session` row means logout, password changes and deactivation take effect immediately, which the integration tests verify.

**Deviations from the brief, and why**
- **Uploads live in `backend/uploads`, served by the API, not `frontend/public/uploads`.** Everything in `public/` is world-readable, which would expose incident photos; the API checks access before serving them.
- **Backend config is in `backend/.env`, frontend config in `frontend/.env.local`.** The Prisma CLI reads only `.env`, and Next.js conventionally uses `.env.local`.
- **`db:setup` uses `prisma migrate deploy`, not `prisma db push`.** The project keeps versioned migrations; `db push` would change the database without recording history. `npm run db:push --prefix backend` is still available for prototyping.
- **Why split frontend and backend?** The API can be reused by a future mobile app (Spec W), scaled or deployed independently, and tested without a browser. The trade-off is CORS plus a cross-origin cookie, which works because `localhost:3000` and `localhost:5000` are the same *site*, so a `SameSite=Lax` cookie is still sent.

---

## 11. Limitations & future work

**Limitations (see also Spec V):**
- UI translation into Nepali is not done; only the chatbot is bilingual.
- There is no chat screen; the chat API exists.
- Password reset and email/phone verification are not implemented.
- Notifications are in-app only (no SMS or email).
- Map background tiles need internet.
- The breed finder is a heuristic, not a trained model.
- Cluster detection is less meaningful with little data.
- Vaccination coverage percentages are deliberately not shown, because ward animal populations are unknown.

**Future work (Spec W):**
- Install PostGIS and switch to `ST_DWithin` and `ST_ClusterDBSCAN`.
- Add an ONNX breed model behind the existing `BreedPredictor` interface.
- Add an SMS gateway behind `notify()`.
- Add i18n message catalogues.
- Build the chat UI.
- Add offline tile caching or a PWA.
- Support multiple municipalities as separate tenants.
- Export anonymised research datasets.

---

## 12. Troubleshooting

| Symptom | Fix |
|---|---|
| `Database "x" already contains tables from another application` (P3005) | Set `DATABASE_URL` to a new database name such as `…/rabies_track`. It is created automatically and existing data is never dropped |
| `Cannot reach PostgreSQL` | Start PostgreSQL (or the Docker one-liner in §4) and check the host and port in `DATABASE_URL` |
| `P1000` authentication failed | Make the user and password in `DATABASE_URL` match your PostgreSQL user |
| `EPERM … query_engine-windows.dll.node` | A running API is holding the Prisma engine file. Stop it, or ignore the warning: the setup keeps the existing client |
| Frontend shows "Cannot reach the API at …" | Start the backend (`npm run dev`, or `npm run dev:backend`) and check `NEXT_PUBLIC_API_URL` in `frontend/.env.local` |
| Login works but the dashboard redirects back to /login | The API must allow the frontend origin: set `CORS_ORIGIN` in `backend/.env` to the exact origin you browse (e.g. `http://localhost:3000`, not `127.0.0.1:3000`) |
| Map shows markers but no background | No internet for OpenStreetMap tiles. Data and markers still work |
| Port 3000 / 5000 in use | Web: `npm run dev --prefix frontend -- -p 3001` (then add that origin to `CORS_ORIGIN`). API: set `PORT` in `backend/.env` and update `NEXT_PUBLIC_API_URL` |
| Integration tests can't start | They need PostgreSQL and `DATABASE_URL` in `backend/.env`. They create and use `<name>_test`, never your dev database |
