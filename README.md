# FullHealth Backend — Technical Documentation

Production-ready telemedicine backend built with Node.js + Express + TypeScript. This document covers everything that was built: architecture, all files, all APIs, data models, business rules, and how to run the project.

---

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [What Was Built](#what-was-built)
3. [Architecture — Strategy Pattern](#architecture--strategy-pattern)
4. [Full Project Structure](#full-project-structure)
5. [Database — All 13 Entities](#database--all-13-entities)
6. [Providers](#providers)
7. [Middleware](#middleware)
8. [All 9 Modules & APIs](#all-9-modules--apis)
9. [Real-time Chat (Socket.io)](#real-time-chat-socketio)
10. [AI System Prompt](#ai-system-prompt)
11. [PDF Prescription Generation](#pdf-prescription-generation)
12. [Utility Functions](#utility-functions)
13. [Code Quality Setup](#code-quality-setup)
14. [Environment Variables](#environment-variables)
15. [Setup & Running](#setup--running)
16. [All Available Commands](#all-available-commands)
17. [Key Design Decisions & Constraints](#key-design-decisions--constraints)

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Runtime | Node.js | 20 |
| Language | TypeScript | 6 (strict) |
| Framework | Express | 4 |
| ORM | TypeORM + PostgreSQL | 0.3 |
| Auth | Firebase Admin SDK | 13 |
| AI | Anthropic Claude | claude-sonnet-4-20250514 |
| Video | Agora RTC | agora-access-token 2 |
| Payments | Stripe | 22 |
| Realtime | Socket.io | 4 |
| Validation | Zod | 4 |
| PDF | pdf-lib | 1.17 |
| DI Container | tsyringe | 4 |
| Code Quality | ESLint 10 + Prettier 3 + Husky 9 | — |

---

## What Was Built

84 TypeScript source files across the following categories:

| Category | Files | Description |
|---|---|---|
| Config | 3 | env loader, database, DI container |
| Entities | 14 | 13 domain entities + 1 base |
| Providers | 17 | 5 interfaces, 5 active impls, 7 stubs |
| Middleware | 5 | auth, role, validate, error |
| Modules | 36 | 9 modules × (routes + controller + service + dto) |
| Utils | 5 | pdf, allergy, slots, response, errors |
| Server | 3 | app.ts, server.ts, socket.ts |

---

## Architecture — Strategy Pattern

Every external provider is hidden behind an abstract interface. **Business logic never imports a concrete provider directly.** All providers are registered in `src/config/container.ts` using tsyringe symbols and injected wherever needed.

```
src/providers/
├── auth/
│   ├── auth.provider.interface.ts     ← IAuthProvider
│   ├── firebase.provider.ts           ← ACTIVE (Firebase Admin SDK)
│   ├── twilio.provider.ts             ← stub (TODO)
│   └── msg91.provider.ts              ← stub (TODO)
├── ai/
│   ├── ai.provider.interface.ts       ← IAiProvider
│   ├── claude.provider.ts             ← ACTIVE (Anthropic SDK)
│   ├── gpt4o.provider.ts              ← stub (TODO)
│   └── gemini.provider.ts             ← stub (TODO)
├── payment/
│   ├── payment.provider.interface.ts  ← IPaymentProvider
│   ├── stripe.provider.ts             ← ACTIVE (Stripe SDK)
│   └── razorpay.provider.ts           ← stub (TODO)
├── video/
│   ├── video.provider.interface.ts    ← IVideoProvider
│   ├── agora.provider.ts              ← ACTIVE (Agora token builder)
│   └── hundredms.provider.ts          ← stub (TODO)
└── storage/
    ├── storage.provider.interface.ts  ← IStorageProvider
    ├── s3.provider.ts                 ← ACTIVE (AWS S3)
    └── firebase-storage.provider.ts   ← stub (TODO)
```

**To swap any provider:** change exactly one line in `src/config/container.ts`. No other file changes.

```typescript
// src/config/container.ts
container.register(PAYMENT_PROVIDER, { useClass: StripePaymentProvider });
// → change to:
container.register(PAYMENT_PROVIDER, { useClass: RazorpayPaymentProvider });
```

**DI tokens** (exported as symbols from `src/config/container.ts`):
- `AUTH_PROVIDER`
- `AI_PROVIDER`
- `PAYMENT_PROVIDER`
- `VIDEO_PROVIDER`
- `STORAGE_PROVIDER`

---

## Full Project Structure

```
fullhealth-backend/
├── src/
│   ├── app.ts                          # Express app factory
│   ├── server.ts                       # Entry point: HTTP + TypeORM + Socket.io
│   ├── socket.ts                       # Socket.io server + Firebase auth middleware
│   │
│   ├── config/
│   │   ├── env.ts                      # Zod-validated env loader
│   │   ├── database.ts                 # TypeORM DataSource (all 13 entities)
│   │   └── container.ts               # tsyringe DI registrations + tokens
│   │
│   ├── entities/
│   │   ├── BaseEntity.ts               # Abstract: uuid PK, createdAt, updatedAt
│   │   ├── User.ts                     # role enum: patient|doctor|admin
│   │   ├── PatientProfile.ts           # demographics, allergies[], chronicConditions[]
│   │   ├── DoctorProfile.ts            # approvalStatus enum, fee, rating, qualifications
│   │   ├── DoctorAvailability.ts       # dayOfWeek enum, startTime, endTime, slotDuration
│   │   ├── MedicineCatalogue.ts        # per-doctor medicine catalog
│   │   ├── TestCatalogue.ts            # per-doctor lab test catalog
│   │   ├── Booking.ts                  # status enum, videoRoomId, feeCents
│   │   ├── Prescription.ts             # medicines JSONB, tests JSONB, pdfUrl
│   │   ├── ChatMessage.ts              # type enum: text|prescription|image|file
│   │   ├── Payment.ts                  # gateway enum, status enum, amountCents
│   │   ├── AiSession.ts                # messages JSONB, detectedSymptoms[], severityScore
│   │   ├── PatientHistory.ts           # append-only: ai_chat|consult|prescription
│   │   └── Review.ts                   # 1:1 with Booking, rating + comment
│   │
│   ├── middleware/
│   │   ├── verifyToken.middleware.ts   # Bearer token → Firebase verify → req.user.uid
│   │   ├── attachRole.middleware.ts    # uid → DB lookup → auto-create → req.user.role
│   │   ├── requireRole.middleware.ts   # requireRole('doctor','admin') factory
│   │   ├── validate.middleware.ts      # validate(ZodSchema) factory
│   │   └── error.middleware.ts         # AppError|ZodError|TypeORM|500 handler
│   │
│   ├── modules/
│   │   ├── auth/                       # verify-otp, me, logout, refresh
│   │   ├── patients/                   # profile CRUD, history, prescriptions
│   │   ├── doctors/                    # public listing + private dashboard/CRUD
│   │   ├── bookings/                   # create, cancel, join-room, complete
│   │   ├── payments/                   # Stripe intent, webhook, refund
│   │   ├── chat/                       # HTTP messages + Socket.io gateway
│   │   ├── prescriptions/              # create w/ allergy check, PDF, send
│   │   ├── ai/                         # sessions, Claude chat, structured extraction
│   │   └── admin/                      # doctor approval, user mgmt, analytics
│   │
│   ├── providers/                      # see Architecture section above
│   │
│   └── utils/
│       ├── app-error.ts                # AppError class + static factories
│       ├── api-response.ts             # success(), error(), paginated() helpers
│       ├── allergy-checker.ts          # fuzzy case-insensitive allergy matching
│       ├── slot-generator.ts           # availability → available time slots
│       └── pdf-generator.ts            # pdf-lib A4 prescription builder
│
├── .env.example                        # all required env vars with placeholders
├── .eslintrc.json                      # strict TypeScript ESLint rules
├── .prettierrc                         # formatting config
├── .husky/pre-commit                   # format → lint → typecheck → block on fail
├── tsconfig.json                       # strict TypeScript, ES2022, CommonJS
├── package.json                        # scripts, dependencies
└── README.md                           # this file
```

---

## Database — All 13 Entities

All entities extend `BaseEntity` which provides:
- `id: string` — UUID primary key (`uuid_generate_v4()`)
- `createdAt: Date` — auto set on insert
- `updatedAt: Date` — auto set on update

All column names use `snake_case`. All FK columns and frequently queried fields have `@Index()`.

### User
```
Table: users
- firebaseUid: string (unique, indexed)
- phoneNumber: string?
- email: string?
- fullName: string?
- role: enum (patient | doctor | admin)
- isActive: boolean (default: true)
Relations: → PatientProfile (1:1), → DoctorProfile (1:1)
```

### PatientProfile
```
Table: patient_profiles
- userId: string (FK → users, indexed)
- dateOfBirth: date?
- gender: string?
- bloodGroup: string?
- allergies: text[] (PostgreSQL array)
- chronicConditions: text[] (PostgreSQL array)
- profilePictureUrl: string?
- address, city, state, country: string?
- emergencyContactName: string?
- emergencyContactPhone: string?
```

### DoctorProfile
```
Table: doctor_profiles
- userId: string (FK → users, indexed)
- specialty: string?
- licenseNumber: string?
- yearsOfExperience: number?
- languages: text[]
- approvalStatus: enum (pending | approved | rejected)
- isAvailable: boolean (default: false)
- consultationFee: decimal
- rating: decimal (avg of reviews)
- totalReviews: number
- totalConsultations: number
- bio: string?
- profilePictureUrl: string?
- rejectionReason: string?
- qualifications: text[]
Relations: → DoctorAvailability[], → MedicineCatalogue[], → TestCatalogue[]
```

### DoctorAvailability
```
Table: doctor_availability
- doctorProfileId: string (FK, indexed)
- dayOfWeek: enum (monday–sunday)
- startTime: string (HH:MM)
- endTime: string (HH:MM)
- slotDurationMinutes: number (default: 30)
- isActive: boolean
```

### MedicineCatalogue
```
Table: medicine_catalogue
- doctorProfileId: string (FK, indexed)
- name, genericName, category: string?
- defaultDosage, defaultFrequency, defaultDuration, defaultRoute: string?
- notes: string?
- isActive: boolean
```

### TestCatalogue
```
Table: test_catalogue
- doctorProfileId: string (FK, indexed)
- name, category, description, defaultInstructions: string?
- isActive: boolean
```

### Booking
```
Table: bookings
- patientId: string (FK → users, indexed)
- doctorId: string (FK → users, indexed)
- status: enum (pending | paid | active | completed | cancelled)
- scheduledAt: timestamptz
- durationMinutes: number (default: 30)
- videoRoomId: string (unique)
- consultationFeeCents: int (money in cents, never floats)
- aiSessionId: string? (linked AI session)
- aiSummary: text? (copied from AI session)
- cancelReason: string?
- cancelledBy: string?
- completedAt: timestamptz?
Relations: → Prescription (1:1), → Payment (1:1), → Review (1:1)
```

### Prescription
```
Table: prescriptions
- bookingId: string (FK, indexed)
- doctorId, patientId: string (indexed)
- diagnosis: string?
- notes: text?
- medicines: jsonb (PrescribedMedicine[])
- tests: jsonb (OrderedTest[])
- pdfUrl: string?
- isSent: boolean
- confirmedAllergyOverride: boolean
IMMUTABLE: No UPDATE allowed after creation.

PrescribedMedicine shape:
  { name, genericName?, dosage, frequency, duration, route, notes? }

OrderedTest shape:
  { name, category?, instructions? }
```

### ChatMessage
```
Table: chat_messages
- bookingId: string (FK, indexed)
- senderId: string (FK → users, indexed)
- type: enum (text | prescription | image | file)
- content: text
- fileUrl: string?
- isRead: boolean
- sentAt: timestamptz (default: NOW())
```

### Payment
```
Table: payments
- bookingId: string (FK, indexed, unique)
- gateway: enum (stripe | razorpay)
- status: enum (pending | success | failed | refunded)
- amountCents: int (cents, never floats)
- currency: string (default: usd)
- paymentIntentId: string? (indexed)
- paymentMethodId: string?
- refundId: string?
- refundAmountCents: int?
- gatewayResponse: jsonb?
- paidAt, refundedAt: timestamptz?
```

### AiSession
```
Table: ai_sessions
- userId: string (FK → users, indexed)
- messages: jsonb (AiMessage[])
- detectedSymptoms: text[]
- severityScore: int? (1–10)
- suggestedSpecialty: string?
- referToDoctor: boolean
- isClosed: boolean
- aiSummary: text?
- closedAt: timestamptz?

AiMessage shape: { role: 'user'|'assistant', content, timestamp }
```

### PatientHistory
```
Table: patient_history
- userId: string (FK → users, indexed)
- entryType: enum (ai_chat | consult | prescription)
- summary: text
- referenceId: string? (bookingId or sessionId)
- detectedSymptoms: text[]
- severityScore: int?
- doctorName: string?
- specialty: string?
- metadata: jsonb?
APPEND-ONLY: No UPDATE or DELETE allowed.
```

### Review
```
Table: reviews
- bookingId: string (FK, unique)
- patientId, doctorId: string (indexed)
- rating: int
- comment: text?
```

---

## Providers

### Auth Provider (`IAuthProvider`)

```typescript
interface IAuthProvider {
  verifyToken(idToken: string): Promise<{ uid: string; phone: string }>
}
```

**Active: `FirebaseAuthProvider`**
- Uses `firebase-admin` to call `auth().verifyIdToken()`
- Initializes Firebase app on first instantiation
- Throws `AppError.unauthorized()` on invalid/expired token
- Returns `{ uid, phone }` from the decoded token

**Stubs:** `TwilioAuthProvider`, `Msg91AuthProvider` — throw `NotImplementedError`

---

### AI Provider (`IAiProvider`)

```typescript
interface IAiProvider {
  chat(params: AiChatParams): Promise<AiChatResult>
  extractStructuredData(
    conversation: Message[],
    patientContext: PatientContext
  ): Promise<AiStructuredResult>
}
```

**Active: `ClaudeAiProvider`**
- Uses `@anthropic-ai/sdk`
- Model: `claude-sonnet-4-20250514` (configurable via `AI_MODEL` env)
- **Two-call flow per message:**
  1. First call: sends conversation with system prompt → gets the reply text
  2. Second call: sends a structured extraction prompt → gets JSON with `detectedSymptoms`, `severityScore`, `suggestedSpecialty`, `referToDoctor`, `reasoning`
- Retry logic: max 2 retries with 1s/2s backoff on Anthropic API errors
- Extracts JSON from the second response using regex `/{[\s\S]*}/`

**Stubs:** `Gpt4oAiProvider`, `GeminiAiProvider`

---

### Payment Provider (`IPaymentProvider`)

```typescript
interface IPaymentProvider {
  createPaymentIntent(params): Promise<{ clientSecret, paymentIntentId }>
  verifyWebhook(payload: Buffer, signature: string): WebhookEvent
  createRefund(paymentRef: string, amountCents: number): Promise<RefundResult>
}
```

**Active: `StripePaymentProvider`**
- `createPaymentIntent`: creates Stripe PaymentIntent with `automatic_payment_methods: { enabled: true }`
- `verifyWebhook`: calls `stripe.webhooks.constructEvent()` — throws `AppError.unprocessable` on bad signature
- `createRefund`: creates Stripe refund by payment intent ID

**Stub:** `RazorpayPaymentProvider`

---

### Video Provider (`IVideoProvider`)

```typescript
interface IVideoProvider {
  generateToken(params: {
    channelName: string
    uid: number
    role: 'host' | 'audience'
    expiresIn: number
  }): Promise<{ token, channelName, appId }>
}
```

**Active: `AgoraVideoProvider`**
- Uses `agora-access-token` SDK (`RtcTokenBuilder.buildTokenWithUid`)
- Doctor → `RtcRole.PUBLISHER` (host), Patient → `RtcRole.SUBSCRIBER` (audience)
- Token expiry: `Math.floor(Date.now() / 1000) + expiresIn`

**Stub:** `HundredMsVideoProvider`

---

### Storage Provider (`IStorageProvider`)

```typescript
interface IStorageProvider {
  upload(key: string, buffer: Buffer, mimeType: string): Promise<string>  // returns public URL
  delete(key: string): Promise<void>
  getSignedUrl(key: string, expiresIn: number): Promise<string>
}
```

**Active: `S3StorageProvider`**
- Uses `aws-sdk` S3 client
- `upload`: `s3.upload()` with `ACL: 'public-read'` → returns `result.Location`
- `delete`: `s3.deleteObject()`
- `getSignedUrl`: `s3.getSignedUrlPromise('getObject', ...)`

**Stub:** `FirebaseStorageProvider`

---

## Middleware

### `verifyToken`
- Reads `Authorization: Bearer <token>` header
- Calls `IAuthProvider.verifyToken()`
- Attaches `{ uid, phone }` to `req.user`
- Returns 401 if header missing, malformed, or token invalid

### `attachRole`
- Reads `req.user.uid`
- Looks up `User` in DB by `firebaseUid`
- **Auto-creates** new `User` record with `role: patient` on first login
- Returns 403 if `user.isActive === false`
- Merges `{ id, role, isActive, fullUser }` onto `req.user`

### `requireRole(...roles)`
- Factory: `requireRole('doctor')` or `requireRole('patient', 'admin')`
- Returns 403 if `req.user.role` not in the allowed list

### `validate(schema)`
- Factory: `validate(ZodSchema)`
- Parses `req.body` through the Zod schema
- On failure: passes `ZodError` to the error middleware → 422 with field details

### `errorMiddleware`
- **`AppError`** → `{ success: false, error, code }` with the error's `statusCode`
- **`ZodError`** → 422 `{ success: false, error: 'Validation failed', details: [{ field, message }] }`
- **TypeORM `QueryFailedError` (code 23505)** → 409 `{ success: false, error: 'Resource already exists' }`
- **Any other** → 500 (stack trace hidden in production)

---

## All 9 Modules & APIs

Every module follows the same structure:
```
module/
├── module.dto.ts        ← Zod schemas
├── module.service.ts    ← business logic, TypeORM repositories
├── module.controller.ts ← HTTP only, delegates to service
└── module.routes.ts     ← Express router, applies middleware
```

---

### 1. Auth Module

**Routes: `/api/auth`**

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/verify-otp` | None | Verify Firebase token, upsert user |
| GET | `/me` | verifyToken + attachRole | Get current user + profile |
| POST | `/logout` | verifyToken | Stateless — returns 200 |
| POST | `/refresh` | None | Re-verify Firebase token |

**POST `/verify-otp` body:**
```json
{ "firebaseToken": "string" }
```
**Response:**
```json
{ "success": true, "data": { "user": {...}, "role": "patient", "isNewUser": true } }
```

**`AuthService.verifyAndUpsertUser`:** calls auth provider, then finds or creates a `User` record. Returns `isNewUser: true` if the record was just created.

---

### 2. Patients Module

**Routes: `/api/patients`** — requires `verifyToken + attachRole + requireRole('patient','admin')`

| Method | Path | Description |
|---|---|---|
| POST | `/profile` | Create patient profile |
| GET | `/profile` | Get own profile |
| PATCH | `/profile` | Update profile (partial) |
| GET | `/history` | Paginated `PatientHistory` (desc) |
| GET | `/prescriptions` | Paginated prescriptions |
| GET | `/prescriptions/:id` | Single prescription (ownership check) |

**Create/Update profile body fields:**
`dateOfBirth`, `gender`, `bloodGroup`, `allergies[]`, `chronicConditions[]`, `address`, `city`, `state`, `country`, `emergencyContactName`, `emergencyContactPhone`

---

### 3. Doctors Module

**Public routes: `/api/doctors`** — no auth required

| Method | Path | Description |
|---|---|---|
| GET | `/` | List approved, available doctors |
| GET | `/:id` | Doctor profile + last 20 reviews |
| GET | `/:id/slots` | Available time slots for a date |

**GET `/` query params:**
- `specialty` — partial match (case-insensitive)
- `language` — exact match in languages array
- `minRating` — minimum rating filter
- `maxFee` — maximum consultation fee
- `page`, `limit` — pagination

**GET `/:id/slots` query params:**
- `date` — required, format `YYYY-MM-DD`
- Returns `[{ startTime, endTime, available }]`
- Logic: generates slots from `DoctorAvailability`, subtracts already-booked slots for that date

**Private routes: `/api/doctor`** — requires `requireRole('doctor')`

| Method | Path | Description |
|---|---|---|
| PATCH | `/profile` | Update own doctor profile |
| GET | `/dashboard` | Upcoming bookings, earnings, rating, pending |
| GET/POST | `/medicines` | List / create medicine in catalogue |
| PATCH/DELETE | `/medicines/:id` | Update / soft-delete medicine |
| GET/POST | `/tests` | List / create test in catalogue |
| PATCH/DELETE | `/tests/:id` | Update / soft-delete test |
| GET/POST | `/availability` | List / create availability slot |
| PATCH | `/availability/:id` | Update availability slot |
| GET | `/patients/:patientId/history` | Patient history (only if active booking exists) |

---

### 4. Bookings Module

**Routes: `/api/bookings`** — requires `verifyToken + attachRole`

| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/` | patient | Create booking |
| GET | `/` | any | List bookings (role-aware: own only) |
| GET | `/:id` | any | Booking detail (participants only) |
| PATCH | `/:id/cancel` | any | Cancel booking |
| POST | `/:id/join-room` | patient, doctor | Get Agora video token |
| PATCH | `/:id/complete` | doctor | Mark booking completed |

**POST `/` body:**
```json
{
  "doctorId": "uuid",
  "scheduledAt": "2025-06-01T10:00:00Z",
  "aiSessionId": "uuid (optional)"
}
```

**Business rules:**
- Checks slot conflict before creating (status: paid blocks the slot)
- Fee is copied from doctor's `consultationFee` at time of booking (converted to cents)
- If `aiSessionId` provided, copies `aiSummary` onto the booking
- `videoRoomId` is a unique UUID generated at creation

**Cancel rules:**
- Patient can cancel only if > 2 hours before scheduled time
- Doctor can cancel anytime before start
- Completed/already-cancelled bookings cannot be cancelled

**Join room rules:**
- Booking must have `status: paid`
- Current time must be within 15 minutes of `scheduledAt`
- Doctor → `role: host`, Patient → `role: audience`
- Returns `{ token, channelName, appId }`

**Complete booking:**
- Sets `status: completed`, `completedAt: now()`
- Appends a `PatientHistory` entry with `entryType: consult`

---

### 5. Payments Module

**Routes: `/api/payments`**

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/webhook` | **None (public)** | Stripe webhook handler |
| POST | `/initiate` | verifyToken + attachRole | Create payment intent |
| GET | `/:bookingId` | verifyToken + attachRole | Payment status |
| POST | `/:bookingId/refund` | verifyToken + attachRole | Initiate refund |

**Webhook route is mounted BEFORE `express.json()`** so it receives the raw body, which is required for Stripe signature verification (`stripe.webhooks.constructEvent`).

**POST `/initiate` body:**
```json
{ "bookingId": "uuid", "currency": "usd" }
```

**Response:**
```json
{ "clientSecret": "pi_xxx_secret_xxx", "paymentId": "uuid" }
```

**Webhook events handled:**
- `payment_intent.succeeded` → Payment status: `success`, Booking status: `paid`
- `payment_intent.payment_failed` → Payment status: `failed`

---

### 6. Chat Module

**HTTP Routes: `/api/chat`** — requires `verifyToken + attachRole`

| Method | Path | Description |
|---|---|---|
| GET | `/:bookingId/messages` | Paginated messages (asc by sentAt) |
| POST | `/:bookingId/messages` | Send message |
| PATCH | `/:bookingId/read` | Mark all unread messages as read |

**POST body:**
```json
{
  "type": "text|prescription|image|file",
  "content": "string",
  "fileUrl": "optional url"
}
```

Only doctors can send `type: prescription` messages.

On HTTP send, the message is also emitted via Socket.io to the booking room (`io.to(bookingId).emit('new_message', msg)`).

---

### 7. Prescriptions Module

**Routes: `/api/prescriptions`** — requires `verifyToken + attachRole`

| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/` | doctor | Create prescription |
| GET | `/:id` | any | Get prescription (participants only) |
| POST | `/:id/generate-pdf` | doctor | Regenerate and re-upload PDF |
| POST | `/:id/send` | doctor | Send to patient via chat |

**POST `/` body:**
```json
{
  "bookingId": "uuid",
  "diagnosis": "optional string",
  "notes": "optional string",
  "medicines": [
    {
      "name": "string",
      "genericName": "optional",
      "dosage": "500mg",
      "frequency": "twice daily",
      "duration": "7 days",
      "route": "oral",
      "notes": "optional"
    }
  ],
  "tests": [
    { "name": "CBC", "category": "Hematology", "instructions": "Fasting" }
  ],
  "confirmedAllergyOverride": false
}
```

**Allergy check flow:**
1. Load patient's `PatientProfile.allergies` array
2. Call `checkAllergyConflicts(medicines, allergies)` — fuzzy case-insensitive match on medicine name and generic name
3. If conflicts found → return 422 with conflict list
4. Doctor must re-submit with `confirmedAllergyOverride: true` to proceed

**After creation:**
- PDF is generated with `pdf-lib` and uploaded to S3
- `pdfUrl` is saved on the prescription
- A `PatientHistory` entry is appended (`entryType: prescription`)

**Send prescription:**
- Creates a `ChatMessage` with `type: prescription`, summary text, and `fileUrl: pdfUrl`
- Emits via Socket.io to the booking room

---

### 8. AI Module

**Routes: `/api/ai`** — requires `verifyToken + attachRole + requireRole('patient')`

| Method | Path | Description |
|---|---|---|
| POST | `/session` | Create new AI triage session |
| POST | `/session/:id/message` | Send message, get AI reply |
| GET | `/session/:id` | Session + full message history |
| GET | `/sessions` | Patient's session list (summary only) |
| PATCH | `/session/:id/close` | Close session, generate summary |

**POST `/session/:id/message` body:**
```json
{ "message": "I have a headache for 3 days" }
```

**Response:**
```json
{
  "reply": "AI reply text...",
  "structured": {
    "detectedSymptoms": ["headache"],
    "severityScore": 4,
    "suggestedSpecialty": "Neurology",
    "referToDoctor": false,
    "reasoning": "..."
  },
  "suggestBooking": true,        // only if referToDoctor is true
  "specialty": "Neurology"       // only if referToDoctor is true
}
```

**Per-message flow:**
1. Load `PatientProfile` (allergies, blood group, chronic conditions)
2. Load last 10 `PatientHistory` entries
3. Build patient context object
4. Generate system prompt (injecting patient context)
5. Call `ClaudeAiProvider.chat()` — which internally makes 2 Anthropic API calls
6. Save user message + AI reply to session's `messages` JSONB array
7. Update session: `detectedSymptoms`, `severityScore`, `suggestedSpecialty`, `referToDoctor`

**Close session flow:**
- Generates AI summary from last 6 messages
- Sets `isClosed: true`, `closedAt: now()`
- Appends `PatientHistory` entry with `entryType: ai_chat`

---

### 9. Admin Module

**Routes: `/api/admin`** — requires `verifyToken + attachRole + requireRole('admin')`

| Method | Path | Description |
|---|---|---|
| GET | `/doctors` | Paginated doctors (filter by `status`) |
| GET | `/doctors/:id` | Full doctor detail + availabilities |
| PATCH | `/doctors/:id/approve` | Approve: set `approvalStatus: approved`, `isAvailable: true` |
| PATCH | `/doctors/:id/reject` | Reject: set `approvalStatus: rejected` + reason |
| GET | `/users` | Paginated users (filter by `role`) |
| PATCH | `/users/:id/ban` | Set `isActive: false` |
| GET | `/bookings` | All bookings (filter by `status`) |
| GET | `/prescriptions` | Audit log (all prescriptions) |
| GET | `/payments` | Revenue + payment list |
| GET | `/analytics` | Full platform analytics |
| GET | `/ai-sessions` | All AI sessions |

**GET `/analytics` response:**
```json
{
  "totalRevenue": 0,
  "revenueThisMonth": 0,
  "totalUsers": 0,
  "newUsersThisMonth": 0,
  "totalDoctors": 0,
  "approvedDoctors": 0,
  "pendingDoctors": 0,
  "totalConsults": 0,
  "consultsThisMonth": 0,
  "totalAiSessions": 0,
  "aiReferralRate": 0.0,
  "topDoctorsByRating": [...],
  "revenueByMonth": [
    { "month": "Jun 2024", "amount": 0 },
    ...12 months
  ]
}
```

All revenue amounts are in **cents** (integer).

---

## Real-time Chat (Socket.io)

**Connection:** `io({ auth: { token: '<firebase-id-token>' } })`

Socket.io uses the same Firebase token verification as HTTP. On connect, the token is verified and `socket.data.uid` is set.

**Events you emit (client → server):**

| Event | Payload | Description |
|---|---|---|
| `join_room` | `{ bookingId: string }` | Join a booking's chat room |
| `leave_room` | `{ bookingId: string }` | Leave the room |
| `send_message` | `{ bookingId, type, content, fileUrl? }` | Send a message (saved to DB) |
| `typing` | `{ bookingId: string }` | Broadcast typing indicator |
| `read_receipt` | `{ bookingId: string }` | Mark messages as read |

**Events you receive (server → client):**

| Event | Payload | Description |
|---|---|---|
| `new_message` | `ChatMessage` object | New message in the room |
| `user_joined` | `{ userId, socketId }` | Someone joined the room |
| `user_left` | `{ userId }` | Someone left the room |
| `user_offline` | `{ socketId }` | Someone disconnected |
| `typing` | `{ userId }` | Someone is typing |
| `read_receipt` | `{ userId }` | Someone read the messages |
| `error` | `{ message }` | Validation or save error |

All Socket.io event payloads are validated with Zod before processing.

---

## AI System Prompt

The system prompt (`src/modules/ai/ai.system-prompt.ts`) is built dynamically per-request, injecting the patient's context. It defines the AI's role, hard constraints, and communication style.

**Hard rules the AI must follow:**
- Never name specific prescription medicines (brand or generic)
- Never give a definitive diagnosis
- Never replace a real doctor
- Always flag allergy conflicts from the patient's known allergy list
- Always recommend a real doctor if severity score ≥ 6
- Respond in the patient's detected language
- End every response with a safety disclaimer

**Injected patient context per request:**
- Blood group
- Known allergies (with WARNING if relevant to symptoms)
- Chronic conditions
- Last 10 history entries

---

## PDF Prescription Generation

`src/utils/pdf-generator.ts` — `buildPrescriptionPdf(data): Promise<Buffer>`

Generates a styled A4 PDF using `pdf-lib`. Layout:

```
┌─────────────────────────────────────────┐
│ FullHealth Telemedicine    [date]        │  ← colored header
│ Dr. Name                  Ref: XXXX     │
│ License: XXXX                           │
├─────────────────────────────────────────┤
│ PATIENT INFORMATION                     │
│ Name: ...    Age: ...   Blood: ...      │
├─────────────────────────────────────────┤
│ DIAGNOSIS / CLINICAL NOTES              │
│ [diagnosis text]                        │
├─────────────────────────────────────────┤
│ PRESCRIBED MEDICINES                    │
│ Medicine | Dosage | Freq | Duration | Route │
│ [rows]                                  │
├─────────────────────────────────────────┤
│ TESTS ORDERED                           │
│ • Test name [category]                  │
│   Instructions: ...                     │
├─────────────────────────────────────────┤
│ This prescription is valid for 30 days  │
│ DISCLAIMER: ...                         │
└─────────────────────────────────────────┘
```

The buffer is uploaded to S3 and the URL stored on the `Prescription` record.

---

## Utility Functions

### `checkAllergyConflicts(medicines, allergies): AllergyConflict[]`
- Case-insensitive substring match
- Checks both `medicine.name` and `medicine.genericName` against each allergen string
- Returns `[{ medicine: string, allergen: string }]`

### `generateAvailableSlots(availability, bookings, date): TimeSlot[]`
- Maps JS `Date.getDay()` to `DayOfWeek` enum
- Filters `DoctorAvailability` records for that day
- Generates slots: `startTime + N*duration` until `endTime`
- Marks slot as `available: false` if a non-cancelled booking exists at that time
- Returns `[{ startTime: 'HH:MM', endTime: 'HH:MM', available: boolean }]`

### `success<T>(data, message?): ApiResponse<T>`
### `error(message, code): ApiErrorResponse`
### `paginated<T>(data, total, page, limit): PaginatedResponse<T>`

Standard response shapes used by all controllers.

### `AppError` class
```typescript
new AppError(message, statusCode, code)

// Static factories:
AppError.notFound('Booking')        // 404
AppError.unauthorized()             // 401
AppError.forbidden()                // 403
AppError.conflict('Already exists') // 409
AppError.unprocessable('Bad state') // 422
AppError.badRequest('Missing field')// 400
```

---

## Code Quality Setup

### TypeScript (`tsconfig.json`)
- `target: ES2022`, `module: commonjs`
- `strict: true`, `strictNullChecks: true`, `noImplicitAny: true`
- `noUnusedLocals: true`, `noUnusedParameters: true`
- `experimentalDecorators: true`, `emitDecoratorMetadata: true` (required for tsyringe)
- `exactOptionalPropertyTypes: false` — disabled due to TypeORM `DeepPartial` incompatibility

### ESLint (`.eslintrc.json`)
- Parser: `@typescript-eslint/parser` with `project: tsconfig.json`
- Extends: `eslint:recommended`, `@typescript-eslint/recommended`, `@typescript-eslint/recommended-requiring-type-checking`, `prettier`
- Rules:
  - `@typescript-eslint/no-explicit-any: error`
  - `@typescript-eslint/explicit-function-return-type: error`
  - `@typescript-eslint/no-unused-vars: error`
  - `@typescript-eslint/no-floating-promises: error`
  - `no-console: warn`

### Prettier (`.prettierrc`)
```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 80,
  "tabWidth": 2,
  "arrowParens": "always"
}
```

### Husky Pre-commit Hook (`.husky/pre-commit`)
Runs in sequence on every `git commit`:

```
Step 1: prettier --write src     ← auto-format
Step 2: eslint src --fix         ← lint + auto-fix
Step 3: tsc --noEmit             ← typecheck
         ↓ if fails → BLOCK COMMIT with clear message
Step 4: commit proceeds
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in all values. The app will throw on startup if any required variable is missing or invalid (enforced by Zod schema in `src/config/env.ts`).

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | Full PostgreSQL connection string |
| `DB_HOST` | Yes | — | PostgreSQL host |
| `DB_PORT` | Yes | — | PostgreSQL port |
| `DB_USER` | Yes | — | PostgreSQL user |
| `DB_PASSWORD` | Yes | — | PostgreSQL password |
| `DB_NAME` | Yes | — | PostgreSQL database name |
| `FIREBASE_PROJECT_ID` | Yes | — | Firebase project ID |
| `FIREBASE_CLIENT_EMAIL` | Yes | — | Service account email |
| `FIREBASE_PRIVATE_KEY` | Yes | — | Private key (use `\n` for newlines) |
| `ANTHROPIC_API_KEY` | Yes | — | Anthropic API key |
| `AI_MODEL` | No | `claude-sonnet-4-20250514` | Claude model ID |
| `AI_MAX_TOKENS` | No | `2048` | Max tokens per AI call |
| `AGORA_APP_ID` | Yes | — | Agora App ID |
| `AGORA_APP_CERTIFICATE` | Yes | — | Agora App Certificate |
| `STRIPE_SECRET_KEY` | Yes | — | Stripe secret key (`sk_...`) |
| `STRIPE_WEBHOOK_SECRET` | Yes | — | Stripe webhook secret (`whsec_...`) |
| `AWS_ACCESS_KEY` | Yes | — | AWS access key |
| `AWS_SECRET_KEY` | Yes | — | AWS secret key |
| `AWS_BUCKET` | Yes | — | S3 bucket name |
| `AWS_REGION` | Yes | — | AWS region (e.g. `us-east-1`) |
| `JWT_SECRET` | Yes | — | Min 32 characters |
| `PORT` | No | `3000` | HTTP server port |
| `NODE_ENV` | No | `development` | `development` \| `production` \| `test` |
| `SOCKET_CORS_ORIGIN` | No | `http://localhost:3000` | Socket.io CORS origin |

---

## Setup & Running

### Prerequisites
- Node.js 20+
- PostgreSQL 14+
- An `.env` file with all required variables filled in

### First-time setup

```bash
# 1. Install dependencies
npm install

# 2. Copy and fill environment file
cp .env.example .env
# Open .env and fill in every value

# 3. Create the database
createdb fullhealth

# 4. Run migrations
npm run migrate

# 5. Start the dev server
npm run dev
# Server starts on http://localhost:3000
```

### Production deployment

```bash
# Build TypeScript
npm run build

# Start compiled server
npm start
```

---

## All Available Commands

| Command | Description |
|---|---|
| `npm run dev` | Start dev server with hot reload (`ts-node-dev`) |
| `npm run build` | Compile TypeScript → `dist/` |
| `npm start` | Run compiled `dist/server.js` |
| `npm run lint` | Check ESLint (no fix) |
| `npm run lint:fix` | ESLint with auto-fix |
| `npm run format` | Prettier write all `src/` files |
| `npm run format:check` | Prettier check (no write, for CI) |
| `npm run typecheck` | `tsc --noEmit` — fails on type errors |
| `npm test` | Run Jest test suite |
| `npm run migrate` | Run pending TypeORM migrations |
| `npm run migrate:gen` | Generate migration from entity diff |

---

## Key Design Decisions & Constraints

### Money is always integers (cents)
All monetary amounts are stored as `int` in cents. Never use floats for money.
```
$29.99  →  stored as  2999
$150.00 →  stored as  15000
```

### Prescriptions are immutable
Once created, a `Prescription` record is never updated. Regenerating the PDF creates a new S3 file and updates only `pdfUrl`. The medicines and tests JSONB arrays are a permanent snapshot of what was prescribed — they do not reference catalogue IDs.

### PatientHistory is append-only
No `UPDATE` or `DELETE` is ever issued against the `patient_history` table. Every event (AI chat close, consult complete, prescription created) inserts a new row.

### Stripe webhook raw body
The `/api/payments/webhook` route is mounted **before** `express.json()` in `app.ts`, so it receives the raw `Buffer`. This is required for `stripe.webhooks.constructEvent()` signature verification to work.

### Strategy pattern — zero coupling to providers
Services depend only on provider interfaces (`IAuthProvider`, `IAiProvider`, etc.). Concrete classes are registered in one place (`src/config/container.ts`). Swapping providers at runtime requires changing a single line.

### Auto user creation on first login
The `attachRole` middleware automatically creates a `User` record (role: patient) if one doesn't exist for the Firebase UID. This removes the need for a separate "register" endpoint.

### AI safety system prompt
Claude is configured with a strict system prompt that:
- Prohibits naming specific medicines
- Prohibits giving a definitive diagnosis
- Requires allergy warnings when relevant
- Requires doctor referral recommendation when severity ≥ 6
- Appends a safety disclaimer to every response

### TypeORM synchronize: false
`synchronize: false` is set in the DataSource. Schema changes must always go through migrations (`npm run migrate`). This prevents accidental data loss in production.




  stripe listen --forward-to localhost:3003/api/payments/webhook