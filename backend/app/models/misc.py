from ..extensions import db
from .base import TimestampMixin, iso, utcnow


class Payment(TimestampMixin, db.Model):
    __tablename__ = "payments"

    id = db.Column(db.Integer, primary_key=True)
    request_id = db.Column(db.Integer, db.ForeignKey("service_requests.id", ondelete="CASCADE"),
                           nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"),
                        nullable=False, index=True)
    amount = db.Column(db.Float, nullable=False)
    method = db.Column(db.String(10), nullable=False)  # UPI | CARD | CASH
    gateway = db.Column(db.String(20), nullable=False, default="mock")
    transaction_id = db.Column(db.String(64), nullable=False, unique=True, index=True)
    gateway_order_id = db.Column(db.String(64), nullable=True)
    gateway_reference = db.Column(db.String(128), nullable=True)
    status = db.Column(db.String(10), nullable=False, default="PENDING", index=True)
    failure_reason = db.Column(db.String(255), nullable=True)
    refund_requested = db.Column(db.Boolean, nullable=False, default=False)
    refund_note = db.Column(db.String(255), nullable=True)
    paid_at = db.Column(db.DateTime, nullable=True)

    request = db.relationship("ServiceRequest", back_populates="payments")
    user = db.relationship("User")

    def to_dict(self):
        return {
            "id": self.id,
            "request_id": self.request_id,
            "user_id": self.user_id,
            "customer_name": self.user.name if self.user else None,
            "amount": round(self.amount, 2),
            "method": self.method,
            "gateway": self.gateway,
            "transaction_id": self.transaction_id,
            "gateway_order_id": self.gateway_order_id,
            "gateway_reference": self.gateway_reference,
            "status": self.status,
            "failure_reason": self.failure_reason,
            "refund_requested": self.refund_requested,
            "refund_note": self.refund_note,
            "paid_at": iso(self.paid_at),
            "created_at": iso(self.created_at),
        }


class Feedback(db.Model):
    __tablename__ = "feedback"

    id = db.Column(db.Integer, primary_key=True)
    request_id = db.Column(db.Integer, db.ForeignKey("service_requests.id", ondelete="CASCADE"),
                           nullable=False, unique=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"),
                        nullable=False, index=True)
    provider_id = db.Column(db.Integer, db.ForeignKey("providers.id", ondelete="CASCADE"),
                            nullable=False, index=True)
    rating = db.Column(db.Integer, nullable=False)
    comment = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False, index=True)

    request = db.relationship("ServiceRequest", back_populates="feedback")
    user = db.relationship("User")
    provider = db.relationship("Provider")

    __table_args__ = (db.CheckConstraint("rating BETWEEN 1 AND 5", name="rating_range"),)

    def to_dict(self):
        return {
            "id": self.id,
            "request_id": self.request_id,
            "user_id": self.user_id,
            "customer_name": self.user.name if self.user else None,
            "provider_id": self.provider_id,
            "provider_name": self.provider.business_name if self.provider else None,
            "rating": self.rating,
            "comment": self.comment,
            "created_at": iso(self.created_at),
        }


class Complaint(TimestampMixin, db.Model):
    __tablename__ = "complaints"

    id = db.Column(db.Integer, primary_key=True)
    request_id = db.Column(db.Integer, db.ForeignKey("service_requests.id", ondelete="CASCADE"),
                           nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"),
                        nullable=False, index=True)
    provider_id = db.Column(db.Integer, db.ForeignKey("providers.id", ondelete="SET NULL"),
                            nullable=True)
    subject = db.Column(db.String(150), nullable=False)
    description = db.Column(db.Text, nullable=False)
    status = db.Column(db.String(10), nullable=False, default="OPEN", index=True)  # OPEN|RESOLVED
    resolution_note = db.Column(db.Text, nullable=True)
    resolved_by = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"),
                            nullable=True)
    resolved_at = db.Column(db.DateTime, nullable=True)

    user = db.relationship("User", foreign_keys=[user_id])
    provider = db.relationship("Provider")

    def to_dict(self):
        return {
            "id": self.id,
            "request_id": self.request_id,
            "user_id": self.user_id,
            "customer_name": self.user.name if self.user else None,
            "provider_id": self.provider_id,
            "provider_name": self.provider.business_name if self.provider else None,
            "subject": self.subject,
            "description": self.description,
            "status": self.status,
            "resolution_note": self.resolution_note,
            "resolved_at": iso(self.resolved_at),
            "created_at": iso(self.created_at),
        }


class Notification(db.Model):
    __tablename__ = "notifications"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"),
                        nullable=False, index=True)
    title = db.Column(db.String(120), nullable=False)
    message = db.Column(db.String(500), nullable=False)
    type = db.Column(db.String(30), nullable=False, default="info")
    request_id = db.Column(db.Integer, db.ForeignKey("service_requests.id", ondelete="CASCADE"),
                           nullable=True)
    is_read = db.Column(db.Boolean, nullable=False, default=False, index=True)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False, index=True)

    user = db.relationship("User", back_populates="notifications")

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "message": self.message,
            "type": self.type,
            "request_id": self.request_id,
            "is_read": self.is_read,
            "created_at": iso(self.created_at),
        }


class FuelPrice(db.Model):
    __tablename__ = "fuel_prices"

    id = db.Column(db.Integer, primary_key=True)
    fuel_type = db.Column(db.String(10), nullable=False, unique=True)
    price_per_litre = db.Column(db.Float, nullable=False)
    updated_by = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"),
                           nullable=True)
    updated_at = db.Column(db.DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    def to_dict(self):
        return {
            "fuel_type": self.fuel_type,
            "price_per_litre": self.price_per_litre,
            "updated_at": iso(self.updated_at),
        }


class PricingConfig(db.Model):
    """Key/value pricing settings: delivery fees, per-km fee, mechanic base charges."""
    __tablename__ = "pricing_config"

    id = db.Column(db.Integer, primary_key=True)
    key = db.Column(db.String(60), nullable=False, unique=True)
    value = db.Column(db.Float, nullable=False)
    description = db.Column(db.String(255), nullable=True)
    updated_at = db.Column(db.DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    def to_dict(self):
        return {"key": self.key, "value": self.value, "description": self.description,
                "updated_at": iso(self.updated_at)}
