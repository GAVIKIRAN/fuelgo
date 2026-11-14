# FuelGo: Claude Code Build Prompt

Paste everything below the line into Claude Code, run from an empty project folder.

---

You are a senior full-stack engineer. Build **FuelGo: Integrated Fuel Delivery and Mechanic Service Platform** from scratch, end to end, as a complete, production-quality, runnable project. It is an MCA Semester 3 project (MPRJ382). Work autonomously. Make sensible decisions yourself, don't ask me questions, and only stop when everything below is built, tested and documented.

## 1. Product summary
FuelGo is a roadside assistance platform that puts **emergency fuel delivery** and **mechanic assistance** in one app. A vehicle owner registers, adds vehicles, picks a service, shares GPS location, gets matched with nearby verified providers, books, tracks the provider live, pays digitally, and rates the service. Providers (fuel delivery agents and mechanics) accept or reject jobs and update status. Admins manage everything. A Machine Learning module predicts fuel demand from historical service data.

## 2. Tech stack (fixed)
- **Frontend:** React (Vite) + React Router + Axios, plain CSS or Tailwind, responsive and mobile-first. Maps with **Leaflet + OpenStreetMap** (no API key needed).
- **Backend:** Python **Flask** REST API (blueprints, app factory), Flask-SQLAlchemy, Flask-Migrate, Flask-JWT-Extended, Flask-CORS, Flask-SocketIO (real-time tracking and notifications; fall back to polling if needed), bcrypt password hashing, marshmallow or pydantic validation.
- **Database:** PostgreSQL in production config, with **SQLite as the zero-setup default for local dev** (switch via `DATABASE_URL`).
- **ML:** Python, Pandas, NumPy, scikit-learn.
- **Payments:** a pluggable payment service. Implement a **mock/sandbox gateway** that works offline (simulated UPI/card/cash-on-delivery flow with transaction IDs and statuses). Structure it so Razorpay test mode can be dropped in through an env var.
- **Testing:** pytest for backend, Vitest or React Testing Library for key frontend parts. Include a Postman collection.

## 3. Roles and features

### User (vehicle owner)
- Register, log in, JWT auth, edit profile.
- Vehicle management: add, edit, delete vehicles (make, model, registration number, fuel type).
- **Fuel delivery request:** choose fuel type (petrol, diesel, CNG optional), enter quantity in litres, see an auto-calculated price estimate (fuel price × litres + delivery fee based on distance).
- **Mechanic request:** choose a service category (flat tyre, battery jumpstart, engine trouble, towing, general), describe the problem, optionally attach a photo.
- **GPS location sharing:** use the browser Geolocation API, with a draggable map pin and manual address fallback.
- **Nearby provider matching:** query providers by type, availability and verified status, ranked by distance (Haversine), rating and ETA. The user can pick one or use auto-assign.
- **Booking** with a request lifecycle: `PENDING → ACCEPTED → EN_ROUTE → ARRIVED → IN_PROGRESS → COMPLETED` (plus `REJECTED` and `CANCELLED`).
- **Live tracking:** provider marker moves on the map in real time with an ETA, over Socket.IO. The provider's browser sends location updates, and include a simulator mode so I can demo without two devices.
- **Digital payment** after completion, with payment receipt and transaction status.
- **Ratings and feedback** (1–5 stars + comment), with a complaint option.
- **Service history** with filters and status badges.
- In-app **notifications** (booking confirmation, provider acceptance, arrival updates, completion).

### Provider (fuel delivery agent or mechanic)
- Register with type, service area, documents (upload), and vehicle or tools info. Requires admin verification before going live.
- Toggle availability online/offline.
- Incoming requests list: accept or reject, view customer location on a map and navigate.
- Update service status through the lifecycle, set the final charge, and mark cash payment received.
- Earnings summary and service history, plus ratings received.

### Admin
- Dashboard with KPIs and charts: total users, providers, requests by status, revenue, average rating, requests per day.
- Manage users (view, block/unblock, delete) and providers (verify, reject, suspend).
- Monitor all service requests live, with filters.
- Manage payments (list, status, refund flag).
- View feedback and complaints, and resolve complaints with a note.
- Set fuel prices and delivery fee configuration.
- **ML insights page** (see section 5).

## 4. Database design
Design a normalised schema with proper foreign keys, indexes and timestamps. At minimum:
`users` (role: user/provider/admin), `vehicles`, `providers` (type, is_verified, is_available, lat, lng, rating_avg, service_radius_km), `service_requests` (type fuel/mechanic, fuel_type, quantity, problem_category, description, lat, lng, address, status, estimated_price, final_price, eta_minutes, timestamps), `request_status_history`, `payments` (method, amount, transaction_id, status), `feedback` (rating, comment), `complaints`, `notifications`, `fuel_prices`, `provider_documents`.
Provide Flask-Migrate migrations and a **seed script** that creates: 1 admin, 5 users with vehicles, 8 providers (mix of fuel and mechanic, around Mysuru, Karnataka, India, with realistic coordinates), and about 600 historical completed requests for ML training.

## 5. Machine Learning module (fuel demand prediction)
- Generate a realistic synthetic dataset from the seed history (features: hour, day of week, month, area/zone, fuel type, weather condition, traffic level, quantity).
- Train and compare at least two scikit-learn models (e.g. RandomForestRegressor and GradientBoosting or LinearRegression), choose the best by MAE/RMSE/R², and save with joblib.
- Expose `GET /api/admin/ml/predict-demand` (inputs: date, zone, fuel type, optional weather/traffic) and `GET /api/admin/ml/insights` (peak hours, top zones, 7-day forecast).
- Admin UI page: forecast chart, peak-hour heatmap or bar chart, model metrics, and a "retrain model" button.
- Include a notebook or script `ml/train.py` with evaluation output.

## 6. API and architecture requirements
- Versioned REST API under `/api/v1`, consistent JSON error format, proper HTTP status codes, pagination on lists.
- Role-based access control decorators (`@role_required`).
- Input validation, rate limiting on auth routes, CORS config, secure password hashing, no secrets in code (`.env` and `.env.example`).
- Clean layered structure: routes → services → models. No business logic in route handlers.
- Haversine distance and ETA estimation in a dedicated utility with unit tests.
- Swagger/OpenAPI docs (flask-smorest, flasgger or similar) at `/api/docs`.

## 7. Frontend requirements
- Pages: Landing, Login/Register (role-aware), User dashboard, New Fuel Request, New Mechanic Request, Provider Selection, Live Tracking, Payment, Service History, Rating/Feedback, Profile and Vehicles; Provider dashboard, Incoming Requests, Active Job, Earnings; Admin dashboard, Users, Providers, Requests, Payments, Feedback and Complaints, Pricing, ML Insights.
- Protected routes by role, global auth context, toast notifications, loading and empty states, form validation, and a notification bell with unread count.
- Design: modern, clean, trustworthy and emergency-friendly. Use a fuel-orange/amber and deep navy palette, big tap targets, a prominent **SOS / Request Help** button on the user home, and dark-mode support. Fully responsive for phones.
- Charts with Recharts or Chart.js.

## 8. Project structure
Monorepo:
```
fuelgo/
  backend/   (app/, models, routes, services, utils, ml/, migrations/, tests/, seed.py, requirements.txt, .env.example)
  frontend/  (src/, components, pages, context, api, hooks, styles)
  docs/      (architecture, ER diagram, API list, use-case and flow diagrams in Mermaid)
  postman/   FuelGo.postman_collection.json
  README.md
  docker-compose.yml  (postgres + backend + frontend)
```

## 9. Documentation and academic deliverables
- A thorough **README** with setup for Windows and Linux (with and without Docker), env vars, seed and run commands, default demo logins for each role, and screenshots placeholders.
- `docs/` with Mermaid diagrams: system architecture, ER diagram, use-case diagram, request lifecycle state diagram, and data flow diagram. These should match the project synopsis modules.
- A short `docs/TESTING.md` listing test cases and results.

## 10. Build process
1. First write a short plan (architecture and task list), then implement in this order: backend foundation and auth → models and seed → core request, matching and tracking flow → payments and notifications → admin → ML → frontend → docs and tests.
2. After each major stage, **run it**: start the server, hit the endpoints, run pytest, and build the frontend. Fix everything that fails.
3. Do a final end-to-end verification of the full flow: register user → add vehicle → request fuel → provider accepts → live tracking → complete → pay → rate. Also run admin verification of a new provider, and the ML prediction endpoint.
4. Commit in logical steps with clear messages.
5. Finish with a summary: how to run it, demo credentials, what's implemented, and any known limitations.

## 11. Quality bar
No placeholder code, no TODOs left in core flows, no hardcoded secrets. Handle edge cases: location permission denied, no providers nearby, provider rejects (auto-reassign to the next nearest), double-booking, cancelled requests, and failed payments. The app should work out of the box with `pip install -r requirements.txt`, `python seed.py`, `flask run`, and `npm install && npm run dev`.

Start now.
