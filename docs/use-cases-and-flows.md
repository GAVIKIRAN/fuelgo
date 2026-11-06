# FuelGo – Use Cases, Lifecycle and Flows

## 1. Use-case diagram

Mermaid has no native use-case diagram, so actors are drawn as nodes and use cases as rounded boxes inside the system boundary.

```mermaid
flowchart LR
  User(["Vehicle owner"])
  Provider(["Provider<br/>(fuel agent / mechanic)"])
  Admin(["Admin"])
  Gateway(["Payment gateway"])

  subgraph FuelGo["FuelGo system"]
    UC1(["Register / log in"])
    UC2(["Manage profile & vehicles"])
    UC3(["Request fuel delivery"])
    UC4(["Request mechanic"])
    UC5(["Share GPS location"])
    UC6(["View & choose nearby provider"])
    UC7(["Track provider live"])
    UC8(["Pay digitally / cash"])
    UC9(["Rate & raise complaint"])
    UC10(["View history & notifications"])
    UC11(["Upload documents"])
    UC12(["Go online / offline"])
    UC13(["Accept / reject request"])
    UC14(["Update job status & share location"])
    UC15(["Confirm cash, view earnings"])
    UC16(["Verify / suspend providers"])
    UC17(["Manage users"])
    UC18(["Monitor requests & payments"])
    UC19(["Resolve complaints"])
    UC20(["Set fuel prices & fees"])
    UC21(["View ML demand forecast / retrain"])
  end

  User --- UC1 & UC2 & UC3 & UC4 & UC5 & UC6 & UC7 & UC8 & UC9 & UC10
  Provider --- UC1 & UC11 & UC12 & UC13 & UC14 & UC15 & UC10
  Admin --- UC1 & UC16 & UC17 & UC18 & UC19 & UC20 & UC21
  UC8 --- Gateway
  UC3 -. includes .-> UC5
  UC4 -. includes .-> UC5
  UC3 -. includes .-> UC6
  UC4 -. includes .-> UC6
```

## 2. Request lifecycle (state diagram)

```mermaid
stateDiagram-v2
  [*] --> PENDING: user books (provider picked or auto-assigned)
  PENDING --> PENDING: provider rejects → auto-reassign to next nearest
  PENDING --> REJECTED: rejected and no providers left
  PENDING --> ACCEPTED: provider accepts
  PENDING --> CANCELLED: user / admin cancels
  ACCEPTED --> EN_ROUTE: provider starts driving
  ACCEPTED --> CANCELLED
  EN_ROUTE --> ARRIVED: provider marks arrived (or simulator arrives)
  EN_ROUTE --> CANCELLED
  ARRIVED --> IN_PROGRESS: service starts
  IN_PROGRESS --> COMPLETED: provider sets final charge
  COMPLETED --> [*]: payment SUCCESS → feedback
  REJECTED --> [*]
  CANCELLED --> [*]
```

Rules enforced in `request_service`:

- Only forward transitions in `PROVIDER_FLOW` are allowed (`409 CONFLICT` with `allowed_next` otherwise).
- A user can hold one active request at a time; a provider can hold one active job and is not offered new requests while busy.
- Cancellation is allowed only in `PENDING`, `ACCEPTED`, `EN_ROUTE`.
- Payment opens only in `COMPLETED`; a request can be paid once.

## 3. Payment state

```mermaid
stateDiagram-v2
  [*] --> PENDING: initiate (UPI / CARD / CASH)
  PENDING --> SUCCESS: gateway confirms / provider confirms cash
  PENDING --> FAILED: declined (402 PAYMENT_FAILED)
  FAILED --> [*]: user retries → new PENDING payment
  SUCCESS --> REFUNDED: admin marks refunded
```

## 4. Main sequence: fuel request to rating

```mermaid
sequenceDiagram
  autonumber
  actor U as User (browser)
  participant API as Flask API
  participant WS as Socket.IO
  actor P as Provider (browser)
  participant DB as Database

  U->>API: POST /requests/estimate {fuel, litres, lat, lng}
  API->>DB: fuel price, fees, nearest provider
  API-->>U: price breakdown + availability
  U->>API: POST /requests/match
  API-->>U: providers ranked by distance, rating, ETA
  U->>API: POST /requests {provider_id | auto_assign}
  API->>DB: insert request (PENDING) + history + notifications
  API--)P: request:new, notification
  P->>API: POST /provider/requests/:id/accept
  API->>DB: ACCEPTED, ETA
  API--)U: request:update, notification "Provider accepted"
  U->>WS: request:join {request_id}
  loop every few seconds
    P->>WS: provider:location {lat, lng}
    WS->>DB: update provider position, ETA
    WS--)U: tracking:update {lat, lng, eta}
  end
  P->>API: PATCH status ARRIVED → IN_PROGRESS → COMPLETED(final_price)
  API--)U: request:update + notifications
  U->>API: POST /payments/initiate {method}
  U->>API: POST /payments/:id/confirm {upi_id | card}
  API-->>U: SUCCESS + receipt (or 402 → retry)
  U->>API: POST /feedback {rating, comment}
  API->>DB: feedback, recompute provider rating
```

## 5. Provider onboarding

```mermaid
sequenceDiagram
  actor P as Provider
  participant API as API
  actor A as Admin
  P->>API: POST /auth/register (role=provider) → PENDING
  API--)A: notification "New provider registration"
  P->>API: POST /provider/documents (licence, RC, permit)
  A->>API: GET /admin/providers?status=PENDING (view documents)
  A->>API: PATCH /admin/providers/:id/verification {VERIFIED}
  API--)P: notification "Account verified"
  P->>API: PATCH /provider/availability {is_available: true, lat, lng}
```
