import re

from sqlalchemy import select

from ..extensions import db
from ..models import Vehicle
from ..utils.errors import Conflict, NotFound


def _normalise_reg(value):
    return re.sub(r"[\s-]", "", value).upper()


def list_vehicles(user):
    return [v.to_dict() for v in db.session.scalars(
        select(Vehicle).where(Vehicle.user_id == user.id).order_by(Vehicle.created_at))]


def get_owned(user, vehicle_id):
    v = db.session.get(Vehicle, vehicle_id)
    if v is None or v.user_id != user.id:
        raise NotFound("Vehicle")
    return v


def _check_unique(reg, exclude_id=None):
    q = select(Vehicle).where(Vehicle.registration_number == reg)
    if exclude_id:
        q = q.where(Vehicle.id != exclude_id)
    if db.session.scalar(q):
        raise Conflict("A vehicle with this registration number already exists")


def create_vehicle(user, data):
    reg = _normalise_reg(data["registration_number"])
    _check_unique(reg)
    v = Vehicle(user_id=user.id, make=data["make"].strip(), model=data["model"].strip(),
                registration_number=reg, fuel_type=data["fuel_type"],
                vehicle_type=data.get("vehicle_type", "car"))
    db.session.add(v)
    db.session.commit()
    return v.to_dict()


def update_vehicle(user, vehicle_id, data):
    v = get_owned(user, vehicle_id)
    if "registration_number" in data:
        reg = _normalise_reg(data["registration_number"])
        _check_unique(reg, exclude_id=v.id)
        v.registration_number = reg
    for field in ("make", "model", "fuel_type", "vehicle_type"):
        if field in data:
            setattr(v, field, data[field])
    db.session.commit()
    return v.to_dict()


def delete_vehicle(user, vehicle_id):
    v = get_owned(user, vehicle_id)
    db.session.delete(v)
    db.session.commit()
