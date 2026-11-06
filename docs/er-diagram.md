# FuelGo – ER Diagram

All tables have integer surrogate keys, foreign keys with `ON DELETE` rules, and `created_at` / `updated_at` timestamps where rows change. The schema is created by the Alembic migration in `backend/migrations/versions/`.

```mermaid
erDiagram
  USERS ||--o{ VEHICLES : owns
  USERS ||--o| PROVIDERS : "is (role=provider)"
  USERS ||--o{ SERVICE_REQUESTS : places
  USERS ||--o{ NOTIFICATIONS : receives
  USERS ||--o{ PAYMENTS : makes
  USERS ||--o{ FEEDBACK : writes
  USERS ||--o{ COMPLAINTS : raises
  PROVIDERS ||--o{ PROVIDER_DOCUMENTS : uploads
  PROVIDERS ||--o{ SERVICE_REQUESTS : "is assigned"
  PROVIDERS ||--o{ FEEDBACK : "is rated in"
  PROVIDERS ||--o{ REQUEST_REJECTIONS : declines
  VEHICLES ||--o{ SERVICE_REQUESTS : "is serviced in"
  SERVICE_REQUESTS ||--o{ REQUEST_STATUS_HISTORY : has
  SERVICE_REQUESTS ||--o{ REQUEST_REJECTIONS : has
  SERVICE_REQUESTS ||--o{ PAYMENTS : "paid by"
  SERVICE_REQUESTS ||--o| FEEDBACK : "rated by"
  SERVICE_REQUESTS ||--o{ COMPLAINTS : "subject of"
  SERVICE_REQUESTS ||--o{ NOTIFICATIONS : "referenced by"

  USERS {
    int id PK
    string name
    string email UK
    string phone
    string password_hash
    string role "user | provider | admin"
    bool is_active "false = blocked"
    string address
    datetime created_at
  }
  VEHICLES {
    int id PK
    int user_id FK
    string make
    string model
    string registration_number UK
    string fuel_type
    string vehicle_type
  }
  PROVIDERS {
    int id PK
    int user_id FK,UK
    string provider_type "fuel | mechanic"
    string business_name
    string zone
    float service_radius_km
    string fuel_types "csv"
    string vehicle_info
    string tools_info
    string verification_status
    bool is_verified
    bool is_available
    float lat
    float lng
    float rating_avg
    int rating_count
  }
  PROVIDER_DOCUMENTS {
    int id PK
    int provider_id FK
    string doc_type
    string file_path
    string original_name
    datetime uploaded_at
  }
  SERVICE_REQUESTS {
    int id PK
    int user_id FK
    int vehicle_id FK
    int provider_id FK
    string service_type "fuel | mechanic"
    string fuel_type
    float quantity_litres
    string problem_category
    text description
    string photo_path
    float lat
    float lng
    string address
    string zone
    string status
    float estimated_price
    json price_breakdown
    float final_price
    float distance_km
    int eta_minutes
    string weather
    string traffic_level
    datetime accepted_at
    datetime arrived_at
    datetime completed_at
    datetime cancelled_at
  }
  REQUEST_STATUS_HISTORY {
    int id PK
    int request_id FK
    string status
    string note
    int changed_by FK
    datetime created_at
  }
  REQUEST_REJECTIONS {
    int id PK
    int request_id FK
    int provider_id FK
    string reason
  }
  PAYMENTS {
    int id PK
    int request_id FK
    int user_id FK
    float amount
    string method "UPI | CARD | CASH"
    string gateway
    string transaction_id UK
    string gateway_order_id
    string gateway_reference
    string status "PENDING | SUCCESS | FAILED | REFUNDED"
    string failure_reason
    bool refund_requested
    datetime paid_at
  }
  FEEDBACK {
    int id PK
    int request_id FK,UK
    int user_id FK
    int provider_id FK
    int rating "1-5"
    text comment
  }
  COMPLAINTS {
    int id PK
    int request_id FK
    int user_id FK
    int provider_id FK
    string subject
    text description
    string status "OPEN | RESOLVED"
    text resolution_note
    int resolved_by FK
  }
  NOTIFICATIONS {
    int id PK
    int user_id FK
    string title
    string message
    string type
    int request_id FK
    bool is_read
  }
  FUEL_PRICES {
    int id PK
    string fuel_type UK
    float price_per_litre
    int updated_by FK
  }
  PRICING_CONFIG {
    int id PK
    string key UK
    float value
    string description
  }
```

## Key indexes

| Table | Index | Purpose |
|---|---|---|
| providers | `(provider_type, is_verified, is_available)` | candidate filtering during matching |
| service_requests | `(status, created_at)` | admin monitor, dashboards |
| service_requests | `(user_id, status)` | active-request / double-booking check |
| service_requests | `provider_id`, `zone`, `service_type` | provider queue, ML insights |
| notifications | `user_id`, `is_read`, `created_at` | bell and unread count |
| payments | `transaction_id` (unique), `status` | receipts, admin filters |

Constraints: `users.role IN ('user','provider','admin')`, `feedback.rating BETWEEN 1 AND 5`, one feedback per request, one rejection per (request, provider).
