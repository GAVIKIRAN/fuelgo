# FuelGo – Testing Report

| Suite | Tool | Command | Result (2026-11-06) |
|---|---|---|---|
| Backend unit + API tests | pytest | `cd backend && pytest` | **70 passed** (~12 s) |
| Frontend unit / component tests | Vitest + Testing Library | `cd frontend && npm test` | **24 passed** |
| End-to-end core journey (live server, HTTP + Socket.IO) | `scripts/e2e_flow.py` | see below | **30/30 checks passed** |
| End-to-end feature suite (live server) | `scripts/e2e_full.py` | see below | **72/72 checks passed** |
| Live UI tests (landing, onboarding, booking, SOS, vehicle form) | Vitest (opt-in, real API) | see below | **7 passed** |
| Live page smoke test (every page × role, real API) | Vitest (opt-in) | see below | **3 passed** (23 pages) |
| Production build | Vite | `npm run build` | passes |

Environment: Windows 11, Python 3.14, Node 24, SQLite. PostgreSQL and Docker were not available on the build machine, so the Postgres/Docker path is configured but was not run there.

## How to run

```bash
# backend unit/API tests (in-memory SQLite, no server needed)
cd backend && pytest -q

# frontend tests
cd frontend && npm test

# end-to-end against a running, freshly seeded server
cd backend && python seed.py --reset && flask run          # terminal 1
pip install "python-socketio[client]" requests
python scripts/e2e_flow.py                                 # terminal 2
python scripts/e2e_full.py                                 # every other feature

# live UI tests + smoke render of every page (backend running)
cd frontend
LIVE_API=http://127.0.0.1:5000 VITE_API_URL=http://127.0.0.1:5000 npx vitest run
```

## Backend test cases (pytest)

| ID | Area | Test case | Expected | Result |
|---|---|---|---|---|
| G1–G9 | Geo utils | Haversine zero / Mysuru→Bengaluru ≈126 km / symmetry / 1° lat ≈111 km / invalid coords; ETA grows with distance & traffic, exact value, minimum 1 min; nearest zone; interpolation clamps; traffic by hour | correct values, `ValueError` on bad input | Pass |
| A1 | Auth | Register user, then `GET /auth/me` | 201, profile returned | Pass |
| A2 | Auth | Duplicate email | 409 CONFLICT | Pass |
| A3 | Auth | Invalid email / weak password / short name | 422 with per-field details | Pass |
| A4 | Auth | Provider registration without required fields; then valid | 422, then 201 with PENDING verification, offline, default location | Pass |
| A5 | Auth | Self-register as admin | 422 | Pass |
| A6 | Auth | Wrong password | 401 INVALID_CREDENTIALS | Pass |
| A7 | Auth | Blocked user: existing token and new login | 403 | Pass |
| A8 | Auth | Refresh token works; access token rejected as refresh | 200 / 401 | Pass |
| A9 | RBAC | User → admin/provider endpoints; provider → vehicle endpoints | 403 | Pass |
| A10 | Profile | Update profile; wrong current password; change password and log in | 200 / 422 / 200 | Pass |
| A11 | Errors | Unknown route | 404 JSON error format | Pass |
| V1–V4 | Vehicles | CRUD with registration normalisation; duplicate reg; invalid format; other user's vehicle | 201/200/204; 409; 422; 404 | Pass |
| R1 | Pricing | Estimate = fuel price × litres + delivery fee | exact amounts | Pass |
| R2 | Matching | Nearest provider first, unverified excluded, ETA present | ranked list | Pass |
| R3 | Matching | Fuel type not carried by anyone (CNG) | empty list | Pass |
| R4 | Lifecycle | Book → accept → EN_ROUTE → ARRIVED → IN_PROGRESS → COMPLETED with final price; history order; notifications | all transitions recorded | Pass |
| R5 | Lifecycle | Skip a step (ACCEPTED → COMPLETED) | 409 with `allowed_next` | Pass |
| R6 | Double booking | Second active request by same user | 409 with active id | Pass |
| R7 | Double booking | Busy provider not offered to another customer | second customer gets next provider | Pass |
| R8 | Double booking | Provider accepting a second job | 409 | Pass |
| R9 | Booking | Pick a specific provider; pick unavailable provider without auto-assign; neither chosen | 201; 409; 422 | Pass |
| R10 | Reassign | First provider rejects → reassigned; last provider rejects → REJECTED | `reassigned: true`, then status REJECTED | Pass |
| R11 | Edge | No providers in range | 404 NO_PROVIDERS | Pass |
| R12 | Validation | Vehicle fuel type mismatch | 422 | Pass |
| R13 | Cancel | Cancel pending; accept after cancel; cancel after arrival | 200; 409; 409 | Pass |
| R14 | Access | Other user / unrelated provider see request | 404; admin 200 | Pass |
| R15 | Mechanic | Missing category; valid mechanic request | 422; 201 assigned to mechanic | Pass |
| R16 | Upload | Photo upload served publicly; `.exe` rejected | 201 + 200; 415 | Pass |
| R17 | Tracking | Provider location update reduces distance, updates tracking | distance decreases | Pass |
| R18 | Simulator | Before acceptance; after acceptance drives to ARRIVED | 409; ARRIVED, provider at customer | Pass |
| R19 | Availability | Provider goes offline with a pending offer | offer moves to next provider | Pass |
| P1 | Payments | Luhn check | valid/invalid detected | Pass |
| P2 | Payments | Pay before completion | 409 | Pass |
| P3 | Payments | UPI success, receipt, provider can view, other user can't, pay twice | 200, receipt, 200, 404, 409 | Pass |
| P4 | Payments | Declined card → 402, retry with new payment succeeds | 402 PAYMENT_FAILED, then SUCCESS | Pass |
| P5 | Payments | Invalid UPI format; declined UPI | 422; 402 | Pass |
| P6 | Payments | Expired card | 402 "expired" | Pass |
| P7 | Payments | Cash: user can't self-confirm, provider confirms, double confirm; earnings net of 10% | 409, 200, 409, ₹585 of ₹650 | Pass |
| P8 | Payments | Admin refund flag + mark refunded; filter | REFUNDED, listed | Pass |
| F1–F3 | Feedback | Rating updates provider average; duplicate; rating 6; other user | 201, 409, 422, 404 | Pass |
| F4 | Complaints | Create, admin lists open, resolve, resolve again, user sees note | 201, 1, 200, 409, note | Pass |
| AD1 | Admin | Dashboard totals and 14-day series | correct counts | Pass |
| AD2 | Admin | Provider onboarding: offline blocked, document upload & access control, verify, go online, suspend | 403 → 200 → online → offline | Pass |
| AD3 | Admin | Block/unblock/delete user; cannot delete self | 403 on blocked login, 204, 409 | Pass |
| AD4 | Admin | Pricing update changes estimates; unknown key | new amounts; 422 | Pass |
| AD5 | Admin | Request monitor filters | correct totals | Pass |
| M1 | ML | Synthetic dataset shape, non-negative target, evening > night demand | as expected | Pass |
| M2 | ML | Training compares models and selects the lowest RMSE | best has min RMSE | Pass |
| M3 | ML | History shifts learned patterns (zone weight, avg order) | reflected | Pass |
| M4 | ML | predict-demand (24 h), alias path, unknown zone, insights, non-admin | 200, 200, 422, 7-day forecast, 403 | Pass |

## Frontend test cases (Vitest)

| Test | Result |
|---|---|
| Currency, distance, hour formatting; service titles; status labels; provider next-step map; directions link | Pass |
| StatusBadge label + class; StarRating click/aria; read-only label | Pass |
| PriceBreakdown lines/total/final amount; Pagination hide/disable/next | Pass |
| StatusTimeline done/current steps; cancelled request ending | Pass |
| EmptyState content | Pass |
| Login / register / vehicle validators | Pass |
| Login page shows field errors on empty submit; lists demo accounts | Pass |
| ProtectedRoute redirects anonymous users to /login | Pass |

## End-to-end flow (scripts/e2e_flow.py)

Register user → add vehicle → estimate → match (3 providers ranked) → book with auto-assign → assigned provider sees it → double booking blocked → provider accepts → Socket.IO join → simulator streams **20 `tracking:update` events, ETA 8 → 0 min** → `ARRIVED` pushed → IN_PROGRESS → COMPLETED → UPI `fail@okaxis` declined (402) → retry `demo@okaxis` succeeds → receipt → 5-star rating → notifications delivered → new mechanic registers → can't go online unverified → admin verifies → goes online → ML predict-demand and insights → admin dashboard. **30/30 checks passed.**

Also verified manually against the running server: Swagger UI at `/api/docs` (66 paths), the auth rate limit returns 429 after 20 attempts per minute, Socket.IO over both WebSocket and polling through the Vite proxy, and connections with an invalid token are refused.

## Feature suite (scripts/e2e_full.py) – 72 checks

| Area | What is verified |
|---|---|
| Landing data | public stats without login (no emails leaked), public pricing, zones, health, Swagger page |
| Mechanic flow | category-based estimate, booking, photo upload + serving, assigned mechanic sees it, **decline → auto-reassigned to a different mechanic**, customer notified, REST location fallback updates tracking, can't go offline mid-job, final price adjustment |
| Payments | cash (customer can't self-confirm, provider confirms), earnings, card decline (402) → retry success, already-paid guard, payment history, admin refund + notification |
| Feedback | rating, duplicate blocked, provider sees rating, complaint → admin resolves → customer sees resolution |
| Requests | cancel pending, provider can't accept cancelled, can't pay cancelled, history filter, other users get 404, fuel/vehicle mismatch, no providers far away |
| Vehicles | add, edit, delete |
| Partner onboarding | admins notified, document upload, admin/customer access control, bad file type 415, pending filter, reject with note, re-upload → pending, verify → online, suspend → forced offline, suspended can't go online |
| Admin | block user (token + login rejected) / unblock, pricing change reflected in estimates (and reverted), non-admin blocked, request/feedback/payment filters, dashboard KPIs |
| ML | retrain, insights (forecast, heatmap, zones), `/api/admin/ml` alias, users forbidden |
| Auth | refresh token, validation error format |

## Live UI tests (Vitest against the running API)

| Test | Result |
|---|---|
| Landing page shows live stats, today's fuel prices, both services, reviews, FAQ, correct sign-up and partner links | Pass |
| New vehicle owner registers → lands on **/app/welcome** → adds vehicle, allows location, saves phone, acknowledges SOS → 4 of 4 → home | Pass |
| New partner registers → lands on **/provider/welcome** → profile step done, verification PENDING, "Go online" disabled | Pass |
| Book fuel from provider selection → tracking page | Pass |
| Book fuel with auto-assign from the fuel form | Pass |
| SOS → "I ran out of fuel" → nearest provider → tracking; SOS then links to the active request | Pass |
| Add a vehicle by typing into the modal form | Pass |

## Bugs found by these tests and fixed

| Bug | Fix |
|---|---|
| Vehicle form lost focus after every keystroke | Modal now focuses only when opened |
| Booking from provider selection created the request but redirected to home | Draft read once; best match preselected |
| SOS disabled silently while a request was active / while loading | SOS shows "Help is on the way" and opens the request |
| Logging in as a provider in another tab broke the owner's tab (403s) | Per-tab sessions |
| After sign-up, new users skipped the welcome page | Post-signup redirect targets onboarding |
| Requests went to one partner but the demo login was a different one | Tracking screen names the partner and its demo login |

## ML evaluation (seeded data, `python -m ml.train`)

| Model | MAE (L) | RMSE (L) | R² |
|---|---|---|---|
| LinearRegression | 10.16 | 13.90 | 0.467 |
| RandomForest | 9.01 | 12.86 | 0.543 |
| **GradientBoosting (selected)** | **8.81** | **12.59** | **0.563** |

The target is litres demanded per (hour, zone, fuel type). The data has Poisson order counts and Gamma order sizes, so a large part of the variance is irreducible noise. An R² around 0.56 is realistic for this setup; the tree models clearly beat the linear baseline.
