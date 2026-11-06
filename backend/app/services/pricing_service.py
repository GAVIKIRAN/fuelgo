"""Fuel prices, fee configuration and price estimation."""
from sqlalchemy import select

from ..extensions import db
from ..models import FuelPrice, FuelType, PricingConfig, ServiceType, utcnow
from ..utils.errors import APIError

# Mysuru retail prices (INR / litre) used as defaults.
DEFAULT_FUEL_PRICES = {FuelType.PETROL: 102.85, FuelType.DIESEL: 88.95, FuelType.CNG: 86.50}

DEFAULT_CONFIG = {
    "fuel_base_delivery_fee": (49.0, "Flat delivery fee for fuel orders (INR)"),
    "fuel_per_km_fee": (8.0, "Per-km delivery charge beyond the free distance (INR)"),
    "free_distance_km": (2.0, "Distance included in the base fee (km)"),
    "mechanic_per_km_fee": (10.0, "Per-km travel charge for mechanics beyond the free distance"),
    "night_surcharge_pct": (15.0, "Surcharge between 22:00 and 06:00 (%)"),
    "provider_commission_pct": (10.0, "Platform commission deducted from provider earnings (%)"),
    "mechanic_base_flat_tyre": (199.0, "Base charge: flat tyre"),
    "mechanic_base_battery_jumpstart": (249.0, "Base charge: battery jumpstart"),
    "mechanic_base_engine_trouble": (449.0, "Base charge: engine trouble diagnosis"),
    "mechanic_base_towing": (999.0, "Base charge: towing"),
    "mechanic_base_general": (299.0, "Base charge: general service"),
    "max_fuel_litres": (60.0, "Maximum litres per delivery"),
}


def ensure_defaults():
    """Insert default prices/config rows that are missing (idempotent)."""
    existing = {p.fuel_type for p in db.session.scalars(select(FuelPrice))}
    for ft, price in DEFAULT_FUEL_PRICES.items():
        if ft not in existing:
            db.session.add(FuelPrice(fuel_type=ft, price_per_litre=price))
    keys = {c.key for c in db.session.scalars(select(PricingConfig))}
    for key, (value, desc) in DEFAULT_CONFIG.items():
        if key not in keys:
            db.session.add(PricingConfig(key=key, value=value, description=desc))
    db.session.commit()


def get_config():
    rows = {c.key: c.value for c in db.session.scalars(select(PricingConfig))}
    return {k: rows.get(k, v[0]) for k, v in DEFAULT_CONFIG.items()} | rows


def get_fuel_prices():
    rows = {p.fuel_type: p.price_per_litre for p in db.session.scalars(select(FuelPrice))}
    return {ft: rows.get(ft, DEFAULT_FUEL_PRICES[ft]) for ft in FuelType.ALL}


def get_pricing():
    return {
        "fuel_prices": [p.to_dict() for p in db.session.scalars(select(FuelPrice)
                                                               .order_by(FuelPrice.fuel_type))],
        "config": [c.to_dict() for c in db.session.scalars(select(PricingConfig)
                                                          .order_by(PricingConfig.key))],
    }


def update_pricing(admin, data):
    for item in data.get("fuel_prices") or []:
        fp = db.session.scalar(select(FuelPrice).where(FuelPrice.fuel_type == item["fuel_type"]))
        if fp is None:
            fp = FuelPrice(fuel_type=item["fuel_type"], price_per_litre=item["price_per_litre"])
            db.session.add(fp)
        fp.price_per_litre = round(item["price_per_litre"], 2)
        fp.updated_by = admin.id
        fp.updated_at = utcnow()
    for key, value in (data.get("config") or {}).items():
        if key not in DEFAULT_CONFIG:
            raise APIError(f"Unknown pricing setting '{key}'", 422)
        row = db.session.scalar(select(PricingConfig).where(PricingConfig.key == key))
        if row is None:
            row = PricingConfig(key=key, value=value, description=DEFAULT_CONFIG[key][1])
            db.session.add(row)
        row.value = float(value)
    db.session.commit()
    return get_pricing()


def estimate(service_type, distance_km, fuel_type=None, quantity_litres=None,
             problem_category=None, hour=None):
    """Return a price breakdown dict. All amounts in INR, rounded to 2 decimals."""
    cfg = get_config()
    free_km = cfg["free_distance_km"]
    billable_km = max(0.0, (distance_km or 0.0) - free_km)
    lines = []

    if service_type == ServiceType.FUEL:
        if not fuel_type or not quantity_litres:
            raise APIError("fuel_type and quantity_litres are required for a fuel estimate", 422)
        if quantity_litres > cfg["max_fuel_litres"]:
            raise APIError(f"Maximum {cfg['max_fuel_litres']:.0f} litres per delivery", 422)
        price = get_fuel_prices()[fuel_type]
        fuel_cost = price * quantity_litres
        lines.append({"label": f"{fuel_type.title()} {quantity_litres:g} L × ₹{price:.2f}",
                      "amount": round(fuel_cost, 2)})
        lines.append({"label": "Delivery fee", "amount": cfg["fuel_base_delivery_fee"]})
        distance_fee = billable_km * cfg["fuel_per_km_fee"]
    else:
        category = problem_category or "general"
        base = cfg.get(f"mechanic_base_{category}", cfg["mechanic_base_general"])
        lines.append({"label": f"Base charge ({category.replace('_', ' ')})", "amount": base})
        distance_fee = billable_km * cfg["mechanic_per_km_fee"]

    if distance_fee > 0:
        lines.append({"label": f"Distance charge ({billable_km:.1f} km)",
                      "amount": round(distance_fee, 2)})

    service_lines_total = sum(l["amount"] for l in lines)
    if hour is not None and (hour >= 22 or hour < 6):
        # surcharge applies to fees only, never to the fuel itself
        fees = service_lines_total - (lines[0]["amount"] if service_type == ServiceType.FUEL else 0)
        surcharge = fees * cfg["night_surcharge_pct"] / 100
        lines.append({"label": f"Night surcharge ({cfg['night_surcharge_pct']:g}%)",
                      "amount": round(surcharge, 2)})

    total = round(sum(l["amount"] for l in lines), 2)
    return {"lines": lines, "total": total, "distance_km": round(distance_km or 0, 2),
            "currency": "INR"}
