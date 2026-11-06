# FuelGo: Integrated Fuel Delivery and Mechanic Service Platform

MCA Semester 3 Project (MPRJ382)

FuelGo is a roadside-assistance platform that puts **emergency fuel delivery** and **mechanic assistance** in one app. A vehicle owner shares their GPS location, gets matched with nearby verified providers, books, tracks the provider live on a map, pays digitally and rates the service. Providers accept or reject jobs and update their status. Admins verify providers, set prices, resolve complaints and see a **machine-learning fuel-demand forecast**.

| Layer | Technology |
|---|---|
| Frontend | React 19 (Vite), React Router, Axios, Leaflet + OpenStreetMap, Socket.IO client, Recharts, plain CSS (light/dark) |
| Backend | Flask 3 (app factory, blueprints), Flask-SQLAlchemy, Flask-Migrate, Flask-JWT-Extended, Flask-SocketIO, Flask-Limiter, flask-smorest (OpenAPI), marshmallow, bcrypt |
| Database | SQLite by default (zero setup) · PostgreSQL via `DATABASE_URL` |
| ML | pandas, NumPy, scikit-learn (LinearRegression / RandomForest / GradientBoosting), joblib |
| Payments | Pluggable gateway: offline **mock sandbox** (UPI / card / cash) or **Razorpay test mode** |
| Tests | pytest · Vitest + React Testing Library · Postman collection · end-to-end script |

---

## Quick start (no Docker)

Prerequisites: **Python 3.12+** and **Node.js 20+**. Nothing else is needed: SQLite and the mock payment gateway work offline.

### Windows (PowerShell)

```powershell
# 1. Backend
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env          # optional: edit secrets
python seed.py                  # creates tables, demo data and trains the ML model
flask run                       # http://127.0.0.1:5000  (API docs: /api/docs)

# 2. Frontend (new terminal)
cd frontend
npm install
npm run dev                     # http://localhost:5173
```

### Linux / macOS

```bash
# 1. Backend
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # optional: edit secrets
python seed.py
flask run

# 2. Frontend (new terminal)
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**. The Vite dev server proxies `/api` and `/socket.io` to the backend, so no CORS setup is needed. To open the app on your phone, use `http://<your-PC-IP>:5173` on the same Wi-Fi. GPS needs HTTPS on most phones; on plain HTTP, drag the map pin instead.

> If `.env` is absent, development secrets are generated once and kept in `backend/instance/dev_secrets.json` (git-ignored). Production (`APP_ENV=production`) refuses to start without real secrets.

### Demo logins (created by `seed.py`)

| Role | Email | Password |
|---|---|---|
| Admin | `admin@fuelgo.in` | `Admin@123` |
| Vehicle owner | `ravi@fuelgo.in` (also `ananya@`, `irfan@`, `priya@`, `kiran@` …`@fuelgo.in`) | `User@123` |
| Fuel partner | `suresh.fuel@fuelgo.in` (Chamundi Fuel Express) · `lakshmi.fuel@fuelgo.in` (Mysuru Doorstep Diesel) · `arjun.fuel@fuelgo.in` (GreenGas CNG Mobile) | `Provider@123` |
| Mechanic partner | `manju.mech@fuelgo.in` (Manju Auto Works) · `fathima.mech@fuelgo.in` (QuickFix Roadside) · `venky.mech@fuelgo.in` (Venky Towing & Repairs) · `naveen.mech@fuelgo.in` (Devaraja Garage On-Call) | `Provider@123` |
| Provider awaiting verification | `deepak.fuel@fuelgo.in` (Hebbal Fuel Rescue) | `Provider@123` |

The login page has one-tap buttons for these accounts.

**Mock payment test data:** UPI `demo@okaxis` succeeds and `fail@okaxis` is declined. Card `4111 1111 1111 1111` succeeds and `4000 0000 0000 0002` is declined. Both cards need a future expiry such as `12/30`; any CVV works.

### Demo without two devices

Open the user and provider in two browser windows (one normal, one private), or use the **Simulate drive (demo)** button on the tracking screen. It moves the provider marker to the customer over about 30 seconds with live ETA updates, then marks the request *Arrived*.

Suggested walkthrough: log in as **Ravi** → *Fuel* → 5 L petrol → *Choose a provider* → book. In a private window, log in as the assigned provider (its business name is on Ravi's tracking screen; match it in the table above) → *Requests* → *Accept*. Back as Ravi → *Simulate drive*. As the provider → *Start service* → *Complete job*. As Ravi → *Pay now* → UPI `demo@okaxis` → *Rate service*. As **admin**, check the Dashboard, Requests and ML insights.

---

## Docker (PostgreSQL + API + frontend)

```bash
cp .env.example .env     # set POSTGRES_PASSWORD, SECRET_KEY, JWT_SECRET_KEY
docker compose up --build
```

- App: http://localhost:8080 (nginx serves the built React app and proxies `/api` and `/socket.io`)
- API + Swagger: http://localhost:5000/api/docs
- The backend container runs migrations, seeds demo data on first start, trains the model, then starts gunicorn (`gthread`, 1 worker, 100 threads, as Flask-SocketIO requires).

Using your own PostgreSQL without Docker: create a database, set `DATABASE_URL=postgresql://user:pass@localhost:5432/fuelgo` in `backend/.env`, then run `python seed.py`.

---

## Environment variables

`backend/.env` (see `backend/.env.example`):

| Variable | Default | Purpose |
|---|---|---|
| `APP_ENV` | `development` | `development`, `production` or `testing` |
| `SECRET_KEY`, `JWT_SECRET_KEY` | generated (dev only) | Flask / JWT signing secrets |
| `DATABASE_URL` | `sqlite:///fuelgo.db` (in `backend/instance/`) | SQLAlchemy URL; use `postgresql://…` for Postgres |
| `CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Allowed browser origins |
| `PAYMENT_GATEWAY` | `mock` | `mock` or `razorpay` |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | empty | Razorpay **test** keys (also `pip install razorpay`) |
| `SIMULATOR_ENABLED` | `1` (dev) / `0` (prod) | Enables `POST /requests/{id}/simulate` |
| `AUTH_RATE_LIMIT` | `20 per minute` | Limit for `/auth/*` |
| `RATELIMIT_STORAGE_URI` | `memory://` | e.g. `redis://…` when running several processes |

`frontend/.env` (optional, see `frontend/.env.example`): `VITE_API_URL` (empty means use the dev proxy) and `VITE_PROXY_TARGET`.

### Razorpay test mode

Set `PAYMENT_GATEWAY=razorpay`, `RAZORPAY_KEY_ID=rzp_test_…` and `RAZORPAY_KEY_SECRET=…`, then run `pip install razorpay`. The payment page then opens Razorpay Checkout, and the backend verifies the payment signature. Everything else stays the same.

---

## Useful commands

```bash
# backend (inside backend/, venv active)
python seed.py --reset         # wipe and reseed (add --no-train to skip ML training)
python -m ml.train             # retrain and print model comparison (MAE / RMSE / R²)
flask db migrate -m "msg"      # after model changes
flask db upgrade
pytest -q                      # 69 tests
python scripts/e2e_flow.py     # full flow against a running, freshly seeded server
python scripts/make_postman.py # regenerate the Postman collection from OpenAPI

# frontend (inside frontend/)
npm test                       # Vitest
npm run build                  # production build in dist/
```

---

## Features

**Vehicle owner:** register/login (JWT), profile and password, vehicles CRUD. Fuel requests (petrol/diesel/CNG, 1–60 L) with a live price estimate (fuel price × litres + distance-based delivery fee, night surcharge). Mechanic requests (flat tyre, battery jumpstart, engine trouble, towing, general) with description and photo. GPS location with a draggable pin, tap-to-move, reverse-geocoded address and a manual fallback. Nearby providers ranked by distance, rating and ETA, with auto-assign. **SOS / Request Help** button. Live tracking map with ETA and status timeline. UPI/card/cash payment with failure + retry and a printable receipt. Ratings and complaints. Filterable history. Notification bell with unread count. Dark mode.

**Provider:** registration with type, service area, fuels, vehicle and tools. Document upload; admin verification is required before going online. Online/offline toggle. Real-time incoming requests with a map, accept/decline (declined requests are auto-reassigned), navigation link. Lifecycle buttons, final charge, cash received. Live GPS sharing (Socket.IO with REST fallback) and the drive simulator. Earnings net of commission, a 7-day chart, history and ratings.

**Admin:** KPI dashboard (users, providers, requests by status, revenue, average rating, requests per day) with live refresh. Users (search, block/unblock, delete). Providers (filter, view documents, verify/reject/suspend with note). Live request monitor with filters and cancel. Payments with refund flag/refund. Feedback and complaints with resolution notes. Fuel prices and fee configuration. **ML insights:** 7-day forecast by fuel, peak-hour chart, weekday × hour heatmap, top zones, model comparison, interactive prediction and a *Retrain model* button.

**Edge cases handled:** location permission denied (pin + address fallback), no providers nearby (`NO_PROVIDERS` with a retry UI), provider rejects (auto-reassign to the next nearest; `REJECTED` when none are left), provider goes offline or is suspended with pending offers (reassigned), double booking (one active request per user, one job per provider, busy providers hidden), cancellation rules, failed/expired/invalid payments with retry, already-paid/already-rated guards, invalid status transitions, blocked users (tokens rejected immediately), socket disconnects (5-second polling fallback), upload type and size limits.

---

## Project structure

```
fuelgo/
  backend/
    app/
      __init__.py          app factory
      config.py            env-driven config
      extensions.py        db, migrate, jwt, cors, limiter, socketio
      models/              SQLAlchemy models (users, providers, requests, payments, …)
      schemas/             marshmallow validation schemas
      routes/              blueprints (auth, vehicles, requests, provider, payments, misc, admin + ML)
      services/            business logic (matching, request lifecycle, tracking, payments/, ML, …)
      utils/               geo (Haversine/ETA), RBAC decorator, errors, pagination, uploads
      sockets.py           Socket.IO events
    ml/                    dataset.py, train.py, artifacts/ (model + metrics.json)
    migrations/            Alembic migrations
    scripts/               e2e_flow.py, make_postman.py
    tests/                 pytest suite
    seed.py  wsgi.py  requirements.txt  .env.example  Dockerfile
  frontend/
    src/
      api/                 axios client + endpoint functions
      context/             auth, socket (notifications), theme
      hooks/               async loader, geolocation, live request, location sharing
      components/          layout, maps, UI kit, timeline, receipt, notification bell
      pages/               public, user/, provider/, admin/
      styles/              design system (CSS variables, dark mode)
      test/                Vitest tests
    vite.config.js  Dockerfile  nginx.conf
  docs/                    architecture, ER diagram, use cases & flows, API reference, testing report
  postman/                 FuelGo.postman_collection.json
  docker-compose.yml
```

## Documentation

- [Architecture & data-flow diagrams](docs/architecture.md)
- [ER diagram](docs/er-diagram.md)
- [Use cases, lifecycle state diagram & sequence diagrams](docs/use-cases-and-flows.md)
- [API reference](docs/api.md) (also Swagger UI at `/api/docs`)
- [Testing report](docs/TESTING.md)

## Screenshots

> Add screenshots here for the project report.

| Screen | File |
|---|---|
| Landing page | `docs/screenshots/landing.png` |
| User home with SOS | `docs/screenshots/user-home.png` |
| Fuel request + estimate | `docs/screenshots/fuel-request.png` |
| Provider selection | `docs/screenshots/provider-selection.png` |
| Live tracking | `docs/screenshots/tracking.png` |
| Payment + receipt | `docs/screenshots/payment.png` |
| Provider incoming requests | `docs/screenshots/provider-requests.png` |
| Admin dashboard | `docs/screenshots/admin-dashboard.png` |
| ML insights | `docs/screenshots/ml-insights.png` |

## Known limitations

- Road distance and ETA are estimated (Haversine × 1.3 road factor at traffic-dependent speeds), not from a routing engine. The live map draws a straight line between the provider and the customer.
- Weather for ML features is synthetic (seeded by season); new requests record `weather="clear"` because no weather API is integrated.
- The ML training set is synthetic, generated from patterns in the ~600 seeded orders, because real demand data was not available.
- A pending request has no automatic timeout: if a provider never responds, the user can cancel and rebook (or the provider going offline hands the offer on).
- Flask-SocketIO runs in threading mode with a single process. Scaling out would need a message queue (Redis) and a shared rate-limit store.
- Address lookup uses the public Nominatim service (best effort; the manual address field always works).
- The Docker/PostgreSQL path is configured but was not run on the development machine (no Docker available there); all automated runs used SQLite.
