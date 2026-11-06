# FuelGo – API Reference (v1)

- Base URL: `http://127.0.0.1:5000/api/v1`
- Interactive docs (Swagger UI): `http://127.0.0.1:5000/api/docs` · OpenAPI JSON: `/api/openapi.json`
- Postman: `postman/FuelGo.postman_collection.json` (run *Login* first; the token is saved automatically)
- Auth: `Authorization: Bearer <access_token>`. Refresh with `POST /auth/refresh` using the refresh token.
- Lists are paginated: `?page=1&per_page=20` → `{"items": [...], "pagination": {"page", "per_page", "total", "pages"}}`

### Error format

```json
{"error": {"status": 422, "code": "VALIDATION_ERROR", "message": "Validation failed",
           "details": {"email": ["Not a valid email address."]}}}
```

| Status | Code | When |
|---|---|---|
| 400 | BAD_REQUEST | malformed request |
| 401 | UNAUTHORIZED / INVALID_CREDENTIALS / TOKEN_EXPIRED / INVALID_TOKEN | missing or bad credentials |
| 402 | PAYMENT_FAILED | card/UPI declined (`details.payment` has the failed payment) |
| 403 | FORBIDDEN / ACCOUNT_BLOCKED | wrong role, blocked account, unverified provider |
| 404 | NOT_FOUND / NO_PROVIDERS | missing resource, or nobody available nearby |
| 409 | CONFLICT | double booking, invalid status transition, already paid/rated |
| 413 / 415 | PAYLOAD_TOO_LARGE / UNSUPPORTED_MEDIA_TYPE | upload too big / wrong type |
| 422 | VALIDATION_ERROR | field validation (`details` per field) |
| 429 | RATE_LIMITED | too many auth attempts |

## Endpoints

Role column: **P** = public, **A** = any logged-in user, **U** = vehicle owner, **Pr** = provider, **Ad** = admin.

### Auth
| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/auth/register` | P | Register (`role`: `user` or `provider`; providers add `provider_type`, `business_name`, `zone`, …) |
| POST | `/auth/login` | P | Returns `access_token`, `refresh_token`, `user` |
| POST | `/auth/refresh` | refresh token | New access token |
| GET | `/auth/me` | A | Current profile (with provider profile) |
| PATCH | `/auth/me` | A | Update name/phone/address; change password with `current_password` + `new_password` |

### Vehicles
| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/vehicles` | U | List own vehicles |
| POST | `/vehicles` | U | Add (`make`, `model`, `registration_number`, `fuel_type`, `vehicle_type`) |
| PATCH | `/vehicles/{id}` | U | Edit |
| DELETE | `/vehicles/{id}` | U | Delete |

### Service requests
| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/requests/estimate` | U | Price breakdown + whether providers are available |
| POST | `/requests/match` | U | Nearby providers ranked by distance, rating, ETA (with price) |
| POST | `/requests` | U | Book (`service_type`, `lat`, `lng`, fuel or mechanic fields, `provider_id` or `auto_assign`) |
| GET | `/requests` | U | History (`status`, `service_type`, `date_from`, `date_to`, pagination) |
| GET | `/requests/active` | U | Current active request or `null` |
| GET | `/requests/{id}` | A* | Detail with history, payments, feedback (*owner, assigned provider or admin) |
| POST | `/requests/{id}/cancel` | U | Cancel (PENDING / ACCEPTED / EN_ROUTE) |
| POST | `/requests/{id}/photo` | U | Multipart `photo` |
| GET | `/requests/{id}/tracking` | A* | Provider position, ETA, distance (polling fallback) |
| POST | `/requests/{id}/simulate` | U/Pr/Ad | Demo: drive the provider to the customer and mark ARRIVED |

### Provider
| Method | Path | Role | Description |
|---|---|---|---|
| GET / PATCH | `/provider/profile` | Pr | Profile incl. documents |
| PATCH | `/provider/availability` | Pr | `{is_available, lat?, lng?}`; verified providers only |
| POST | `/provider/location` | Pr | Live location (REST fallback for `provider:location`) |
| GET | `/provider/requests/incoming` | Pr | Pending offers |
| GET | `/provider/requests/active` | Pr | Current job |
| GET | `/provider/requests/history` | Pr | All jobs (filters + pagination) |
| POST | `/provider/requests/{id}/accept` | Pr | Accept |
| POST | `/provider/requests/{id}/reject` | Pr | Decline → auto-reassign (`{reassigned: bool}`) |
| PATCH | `/provider/requests/{id}/status` | Pr | `EN_ROUTE`, `ARRIVED`, `IN_PROGRESS`, `COMPLETED` (+ `final_price`) |
| POST | `/provider/requests/{id}/cash-received` | Pr | Mark cash payment received |
| GET | `/provider/earnings` | Pr | Totals (net of commission), last 7 days |
| GET | `/provider/ratings` | Pr | Ratings received |
| POST | `/provider/documents` | Pr | Multipart `file`, `doc_type` |
| DELETE | `/provider/documents/{id}` | Pr | Remove a document |
| GET | `/documents/{id}/file` | Pr (owner) / Ad | Download a document |

### Payments
| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/payments/config` | A | Active gateway, sandbox test hints |
| POST | `/payments/initiate` | U | `{request_id, method: UPI\|CARD\|CASH}` → payment + checkout params |
| POST | `/payments/{id}/confirm` | U | UPI `{upi_id}` · card `{card_number, card_expiry, card_cvv}` · Razorpay `{gateway_payment_id, gateway_signature}` |
| GET | `/payments` | U | Own payments |
| GET | `/payments/{id}/receipt` | U/Pr/Ad | Receipt |

Mock gateway test data: UPI `demo@okaxis` succeeds and `fail@okaxis` is declined. Card `4111 1111 1111 1111` succeeds and `4000 0000 0000 0002` is declined. Both cards need a future expiry; any CVV works.

### Feedback, complaints, notifications, metadata
| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/feedback` | U | `{request_id, rating 1-5, comment}` (completed requests, once) |
| POST | `/complaints` | U | `{request_id, subject, description}` |
| GET | `/complaints` | U | Own complaints |
| GET | `/notifications` | A | List + `unread_count` (`?unread=1`) |
| PATCH | `/notifications/{id}/read` | A | Mark read |
| POST | `/notifications/read-all` | A | Mark all read |
| GET | `/pricing` | P | Fuel prices + fee config |
| GET | `/meta` | P | Zones, fuel types, problem categories |
| GET | `/stats/public` | P | Anonymous aggregate stats for the landing page (completed rescues, partners, rating, average arrival, recent reviews by first name) |
| GET | `/health` | P | Liveness |

### Admin
| Method | Path | Description |
|---|---|---|
| GET | `/admin/dashboard` | KPIs, requests by status/type, requests & revenue per day |
| GET | `/admin/users` | `role`, `q`, `is_active` filters |
| PATCH | `/admin/users/{id}/status` | Block / unblock `{is_active}` |
| DELETE | `/admin/users/{id}` | Delete (not admins, not with active requests) |
| GET | `/admin/providers` | `status`, `type`, `q` filters; includes documents |
| PATCH | `/admin/providers/{id}/verification` | `{status: VERIFIED\|REJECTED\|SUSPENDED, note}` |
| GET | `/admin/requests` | `status`, `service_type`, `active`, `date_from`, `date_to`, `q`, `provider_id` |
| POST | `/admin/requests/{id}/cancel` | Cancel on behalf of support |
| GET | `/admin/payments` | `status`, `method`, `refund_requested` |
| PATCH | `/admin/payments/{id}/refund` | `{refund_requested, refund_note, mark_refunded}` |
| GET | `/admin/feedback` | `rating` filter |
| GET | `/admin/complaints` | `status` filter |
| PATCH | `/admin/complaints/{id}/resolve` | `{resolution_note}` |
| GET / PUT | `/admin/pricing` | `{fuel_prices: [{fuel_type, price_per_litre}], config: {key: value}}` |

### Machine learning (admin)
Available at `/api/v1/admin/ml/*` and at the un-versioned alias `/api/admin/ml/*`.

| Method | Path | Description |
|---|---|---|
| GET | `/admin/ml/predict-demand?date=YYYY-MM-DD&zone=…&fuel_type=…&weather=…&traffic=…` | 24 hourly predictions, total litres, expected orders, peak hour |
| GET | `/admin/ml/insights` | Peak hours, weekday×hour heatmap, top zones, 7-day forecast, model metrics |
| GET | `/admin/ml/metrics` | Training summary |
| POST | `/admin/ml/retrain` | Retrain all models on current data and keep the best |

## Socket.IO

Connect to the API origin with `auth: {token: <access_token>}`.

| Direction | Event | Payload |
|---|---|---|
| client → server | `request:join` / `request:leave` | `{request_id}` → ack `{ok, tracking}` |
| client → server | `provider:location` | `{lat, lng}` (providers) → ack `{ok, active_request_id, eta_minutes}` |
| server → client | `notification` | notification object |
| server → client | `request:new` | request offered to this provider |
| server → client | `request:update` | request snapshot after any change |
| server → client | `tracking:update` | `{request_id, status, provider{lat,lng}, eta_minutes, distance_km, simulating}` |
