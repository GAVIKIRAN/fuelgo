# FuelGo – Build Plan

## Architecture
- **backend/** – Flask app factory (`app/__init__.py`), extensions (SQLAlchemy, Migrate, JWT, CORS, SocketIO, Limiter, flask-smorest).
  Layering: `routes/` (HTTP + validation via marshmallow schemas) → `services/` (business logic) → `models/` (SQLAlchemy).
  `utils/geo.py` (Haversine + ETA), `utils/decorators.py` (`@role_required`), `utils/errors.py` (uniform JSON errors).
  `sockets.py` – Socket.IO auth, rooms (`user_<id>`, `request_<id>`), live provider location.
  `services/payments/` – gateway interface with `MockGateway` (offline) and `RazorpayGateway` (env switch).
  `ml/` – synthetic dataset generator, training (LinearRegression / RandomForest / GradientBoosting), joblib artifacts.
- **frontend/** – React + Vite, React Router, Axios, Leaflet, Socket.IO client, Recharts, plain CSS design system with dark mode.
- **docs/** – Mermaid diagrams, API list, testing report.

## Task list
1. Backend foundation: config, extensions, error format, auth (register/login/refresh/me), RBAC, rate limiting.
2. Models + migrations + seed (1 admin, 5 users, 8 providers around Mysuru, ~600 historical requests).
3. Core flow: estimates, matching (distance/rating/ETA), booking, lifecycle, reject → auto-reassign, cancel, double-booking guard, live tracking + simulator.
4. Payments (mock gateway, UPI/card/cash, failure + retry, receipts) and notifications (DB + socket push).
5. Admin: KPIs, users, providers verification, requests monitor, payments/refund flag, feedback/complaints, pricing.
6. ML: dataset, training/comparison, prediction + insights endpoints, retrain.
7. Frontend: all role-based pages.
8. Docs, Postman collection, tests (pytest + Vitest), end-to-end verification.
