from ..extensions import db
from .base import TimestampMixin, iso, utcnow


class ServiceRequest(TimestampMixin, db.Model):
    __tablename__ = "service_requests"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"),
                        nullable=False, index=True)
    vehicle_id = db.Column(db.Integer, db.ForeignKey("vehicles.id", ondelete="SET NULL"),
                           nullable=True)
    provider_id = db.Column(db.Integer, db.ForeignKey("providers.id", ondelete="SET NULL"),
                            nullable=True, index=True)

    service_type = db.Column(db.String(10), nullable=False, index=True)  # fuel | mechanic
    fuel_type = db.Column(db.String(10), nullable=True)
    quantity_litres = db.Column(db.Float, nullable=True)
    problem_category = db.Column(db.String(30), nullable=True)
    description = db.Column(db.Text, nullable=True)
    photo_path = db.Column(db.String(255), nullable=True)

    lat = db.Column(db.Float, nullable=False)
    lng = db.Column(db.Float, nullable=False)
    address = db.Column(db.String(255), nullable=True)
    zone = db.Column(db.String(60), nullable=True, index=True)

    status = db.Column(db.String(12), nullable=False, default="PENDING", index=True)
    auto_assign = db.Column(db.Boolean, nullable=False, default=False)
    estimated_price = db.Column(db.Float, nullable=True)
    price_breakdown = db.Column(db.JSON, nullable=True)
    final_price = db.Column(db.Float, nullable=True)
    distance_km = db.Column(db.Float, nullable=True)
    eta_minutes = db.Column(db.Integer, nullable=True)
    cancel_reason = db.Column(db.String(255), nullable=True)

    # Context captured for ML (weather / traffic at request time)
    weather = db.Column(db.String(12), nullable=True)
    traffic_level = db.Column(db.String(10), nullable=True)

    accepted_at = db.Column(db.DateTime, nullable=True)
    arrived_at = db.Column(db.DateTime, nullable=True)
    completed_at = db.Column(db.DateTime, nullable=True)
    cancelled_at = db.Column(db.DateTime, nullable=True)

    user = db.relationship("User", foreign_keys=[user_id])
    vehicle = db.relationship("Vehicle")
    provider = db.relationship("Provider")
    history = db.relationship("RequestStatusHistory", back_populates="request",
                              cascade="all, delete-orphan",
                              order_by="RequestStatusHistory.created_at")
    payments = db.relationship("Payment", back_populates="request", cascade="all, delete-orphan",
                               order_by="Payment.created_at")
    feedback = db.relationship("Feedback", back_populates="request", uselist=False,
                               cascade="all, delete-orphan")

    __table_args__ = (
        db.Index("ix_requests_status_created", "status", "created_at"),
        db.Index("ix_requests_user_status", "user_id", "status"),
    )

    @property
    def payment_status(self):
        if not self.payments:
            return None
        statuses = [p.status for p in self.payments]
        for s in ("SUCCESS", "REFUNDED", "PENDING", "FAILED"):
            if s in statuses:
                return s
        return statuses[-1]

    def to_dict(self, include_history=False):
        data = {
            "id": self.id,
            "user_id": self.user_id,
            "customer_name": self.user.name if self.user else None,
            "customer_phone": self.user.phone if self.user else None,
            "vehicle": self.vehicle.to_dict() if self.vehicle else None,
            "provider_id": self.provider_id,
            "provider": self.provider.to_dict() if self.provider else None,
            "service_type": self.service_type,
            "fuel_type": self.fuel_type,
            "quantity_litres": self.quantity_litres,
            "problem_category": self.problem_category,
            "description": self.description,
            "photo_url": f"/api/v1/uploads/{self.photo_path}" if self.photo_path else None,
            "lat": self.lat,
            "lng": self.lng,
            "address": self.address,
            "zone": self.zone,
            "status": self.status,
            "auto_assign": self.auto_assign,
            "estimated_price": self.estimated_price,
            "price_breakdown": self.price_breakdown,
            "final_price": self.final_price,
            "distance_km": self.distance_km,
            "eta_minutes": self.eta_minutes,
            "cancel_reason": self.cancel_reason,
            "payment_status": self.payment_status,
            "has_feedback": self.feedback is not None,
            "created_at": iso(self.created_at),
            "updated_at": iso(self.updated_at),
            "accepted_at": iso(self.accepted_at),
            "arrived_at": iso(self.arrived_at),
            "completed_at": iso(self.completed_at),
            "cancelled_at": iso(self.cancelled_at),
        }
        if include_history:
            data["history"] = [h.to_dict() for h in self.history]
            data["feedback"] = self.feedback.to_dict() if self.feedback else None
            data["payments"] = [p.to_dict() for p in self.payments]
        return data


class RequestStatusHistory(db.Model):
    __tablename__ = "request_status_history"

    id = db.Column(db.Integer, primary_key=True)
    request_id = db.Column(db.Integer, db.ForeignKey("service_requests.id", ondelete="CASCADE"),
                           nullable=False, index=True)
    status = db.Column(db.String(12), nullable=False)
    note = db.Column(db.String(255), nullable=True)
    changed_by = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"),
                           nullable=True)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    request = db.relationship("ServiceRequest", back_populates="history")

    def to_dict(self):
        return {
            "id": self.id,
            "status": self.status,
            "note": self.note,
            "changed_by": self.changed_by,
            "created_at": iso(self.created_at),
        }


class RequestRejection(db.Model):
    """Providers who declined a request (excluded when auto-reassigning)."""
    __tablename__ = "request_rejections"

    id = db.Column(db.Integer, primary_key=True)
    request_id = db.Column(db.Integer, db.ForeignKey("service_requests.id", ondelete="CASCADE"),
                           nullable=False, index=True)
    provider_id = db.Column(db.Integer, db.ForeignKey("providers.id", ondelete="CASCADE"),
                            nullable=False)
    reason = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    __table_args__ = (db.UniqueConstraint("request_id", "provider_id", name="uq_rejection"),)
