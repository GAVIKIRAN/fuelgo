# FuelGo – System Architecture

FuelGo is a three-tier web application: a React single-page app, a Flask REST + Socket.IO API, and a relational database (PostgreSQL in production, SQLite for local development). A scikit-learn module trains on the service history to forecast fuel demand.

## 1. System architecture

```mermaid
flowchart LR
  subgraph Client["Browser / phone (React + Vite SPA)"]
    UI["Pages: User · Provider · Admin"]
    MAP["Leaflet + OpenStreetMap"]
    GEO["Geolocation API"]
    SIO_C["Socket.IO client"]
    AX["Axios (JWT, auto-refresh)"]
  end

  subgraph API["Flask application (app factory)"]
    R["Routes / blueprints<br/>/api/v1/* (flask-smorest, marshmallow)"]
    RBAC["@role_required · JWT · rate limiter · CORS"]
    S["Services layer<br/>auth · matching · requests · tracking ·<br/>payments · notifications · admin · ML"]
    WS["Socket.IO server<br/>rooms: user_&lt;id&gt;, request_&lt;id&gt;, admins"]
    PG["Payment gateway interface<br/>MockGateway | RazorpayGateway"]
    ML["ML service<br/>predict · insights · retrain"]
    M["SQLAlchemy models"]
  end

  DB[("PostgreSQL / SQLite")]
  FS[("Uploads folder<br/>photos & documents")]
  ART[("ml/artifacts<br/>demand_model.joblib")]
  OSM["OSM tile servers<br/>Nominatim (reverse geocode)"]
  RZP["Razorpay (test mode, optional)"]

  UI --> AX --> R
  SIO_C <--> WS
  MAP --> OSM
  GEO --> UI
  R --> RBAC --> S
  WS --> S
  S --> M --> DB
  S --> FS
  S --> PG --> RZP
  S --> ML --> ART
  ML --> M
```

**Layering rule:** routes only parse/validate input (marshmallow schemas) and call a service; services hold the business rules and talk to models; models own persistence and serialisation. Realtime pushes go through `services/realtime.py`, so services never touch Socket.IO directly.

## 2. Module map (matches the project synopsis)

| Synopsis module | Implementation |
|---|---|
| User registration & authentication | `services/auth_service.py`, `routes/auth.py`, JWT (access + refresh), bcrypt, rate-limited |
| Vehicle management | `services/vehicle_service.py`, `routes/vehicles.py` |
| Fuel delivery request | `request_service.create_request`, `pricing_service.estimate` |
| Mechanic assistance request | same lifecycle, category-based pricing, photo upload |
| GPS location & provider matching | `utils/geo.py` (Haversine, ETA, zones), `matching_service.find_candidates` |
| Booking & lifecycle | `request_service` (accept / reject → auto-reassign / status / cancel) |
| Live tracking | `tracking_service`, `sockets.py`, demo simulator |
| Digital payment | `payment_service`, `services/payments/gateways.py` |
| Ratings, feedback & complaints | `feedback_service` |
| Notifications | `notification_service` (DB + Socket.IO push) |
| Admin management | `admin_service`, `routes/admin.py` |
| Fuel demand prediction (ML) | `ml/dataset.py`, `ml/train.py`, `services/ml_service.py` |

## 3. Data flow diagram

### Level 0 (context)

```mermaid
flowchart LR
  U([Vehicle owner]) -- "service request, location, payment, rating" --> F((FuelGo))
  F -- "matches, ETA, live position, receipts, notifications" --> U
  P([Provider]) -- "availability, accept/reject, live location, status" --> F
  F -- "job offers, customer location, earnings" --> P
  A([Admin]) -- "verification, pricing, complaint resolution" --> F
  F -- "KPIs, reports, demand forecasts" --> A
  F -- "order / verify" --> G([Payment gateway])
```

### Level 1

```mermaid
flowchart TB
  U([User]) --> P1["1.0 Authenticate"]
  P([Provider]) --> P1
  A([Admin]) --> P1
  P1 <--> D1[("users")]

  U --> P2["2.0 Create request<br/>estimate + match"]
  P2 <--> D2[("service_requests")]
  P2 --> D3[("fuel_prices / pricing_config")]
  P2 --> D4[("providers")]

  P --> P3["3.0 Dispatch & lifecycle<br/>accept / reject / status"]
  P3 <--> D2
  P3 --> D5[("request_status_history")]

  P --> P4["4.0 Live tracking"]
  P4 --> D4
  P4 -- "tracking:update" --> U

  U --> P5["5.0 Payment"]
  P5 <--> D6[("payments")]
  P5 <--> G([Gateway])

  U --> P6["6.0 Feedback & complaints"]
  P6 --> D7[("feedback / complaints")]
  P6 --> D4

  P2 & P3 & P5 & P6 --> P7["7.0 Notify"]
  P7 --> D8[("notifications")]

  D2 --> P8["8.0 Demand prediction (ML)"]
  P8 --> A
  A --> P9["9.0 Administration"]
  P9 <--> D1 & D4 & D3 & D7
```

## 4. Matching & ETA

1. Filter providers: matching `provider_type`, `is_verified`, `is_available`, account active, has a location, supports the requested fuel, **not already holding an active request**, within `min(service_radius_km, 25 km)`.
2. Distance = Haversine great-circle distance; ETA = distance × 1.3 road factor ÷ traffic speed (35/25/15 km/h for low/medium/high, by hour of day) + 3 min dispatch.
3. Score (lower is better) = 0.55·distance/25 + 0.30·(1 − rating/5) + 0.15·min(ETA, 90)/90. New providers get a neutral 4.0 rating prior.
4. If a provider rejects (or goes offline / gets suspended) the request is re-offered to the best remaining candidate, excluding everyone who declined; if none remain it becomes `REJECTED`.

## 5. Realtime

| Event (server → client) | Room | Payload |
|---|---|---|
| `notification` | `user_<id>` | notification row |
| `request:new` | provider's `user_<id>` | request |
| `request:update` | `request_<id>`, customer, provider, `admins` (deduplicated) | request |
| `tracking:update` | `request_<id>` | provider position, ETA, distance |

Clients send `request:join` / `request:leave` and providers send `provider:location`. When the socket is down the UI polls `GET /requests/<id>/tracking` every 5 s.

## 6. Security

- bcrypt (12 rounds) password hashing; JWT access (12 h) + refresh (14 d); blocked users are rejected on every request.
- `@role_required(...)` decorator on every protected endpoint; object-level checks in services (a user sees only their requests, a provider only assigned ones).
- Rate limiting on `/auth/*` (default `20 per minute`, configurable).
- Uploads: extension allow-list, 8 MB limit, random file names. Provider documents are served only to the owner and admins.
- Secrets only from environment (`.env`, never committed); production refuses to start without them.
