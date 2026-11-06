import bcrypt
from flask import current_app, has_app_context

from ..extensions import db
from .base import Role, TimestampMixin, iso


def _rounds():
    return current_app.config.get("BCRYPT_ROUNDS", 12) if has_app_context() else 12


class User(TimestampMixin, db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(255), nullable=False, unique=True, index=True)
    phone = db.Column(db.String(20), nullable=True)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), nullable=False, default=Role.USER, index=True)
    is_active = db.Column(db.Boolean, nullable=False, default=True)  # False = blocked
    address = db.Column(db.String(255), nullable=True)

    vehicles = db.relationship("Vehicle", back_populates="owner", cascade="all, delete-orphan",
                               lazy="dynamic")
    provider = db.relationship("Provider", back_populates="user", uselist=False,
                               cascade="all, delete-orphan")
    notifications = db.relationship("Notification", back_populates="user",
                                    cascade="all, delete-orphan", lazy="dynamic")

    __table_args__ = (
        db.CheckConstraint("role IN ('user','provider','admin')", name="role_valid"),
    )

    def set_password(self, raw: str) -> None:
        self.password_hash = bcrypt.hashpw(raw.encode("utf-8"), bcrypt.gensalt(rounds=_rounds())).decode()

    def check_password(self, raw: str) -> bool:
        try:
            return bcrypt.checkpw(raw.encode("utf-8"), self.password_hash.encode("utf-8"))
        except ValueError:
            return False

    def to_dict(self, include_provider=False):
        data = {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "phone": self.phone,
            "role": self.role,
            "is_active": self.is_active,
            "address": self.address,
            "created_at": iso(self.created_at),
        }
        if include_provider and self.provider:
            data["provider"] = self.provider.to_dict()
        return data


class Vehicle(TimestampMixin, db.Model):
    __tablename__ = "vehicles"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"),
                        nullable=False, index=True)
    make = db.Column(db.String(60), nullable=False)
    model = db.Column(db.String(60), nullable=False)
    registration_number = db.Column(db.String(20), nullable=False, unique=True, index=True)
    fuel_type = db.Column(db.String(10), nullable=False)
    vehicle_type = db.Column(db.String(20), nullable=False, default="car")  # car, bike, truck...

    owner = db.relationship("User", back_populates="vehicles")

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "make": self.make,
            "model": self.model,
            "registration_number": self.registration_number,
            "fuel_type": self.fuel_type,
            "vehicle_type": self.vehicle_type,
            "created_at": iso(self.created_at),
        }
