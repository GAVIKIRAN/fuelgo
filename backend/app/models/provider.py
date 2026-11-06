from ..extensions import db
from .base import TimestampMixin, VerificationStatus, iso, utcnow


class Provider(TimestampMixin, db.Model):
    __tablename__ = "providers"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"),
                        nullable=False, unique=True)
    provider_type = db.Column(db.String(10), nullable=False, index=True)  # fuel | mechanic
    business_name = db.Column(db.String(120), nullable=False)
    zone = db.Column(db.String(60), nullable=True, index=True)  # service area
    service_radius_km = db.Column(db.Float, nullable=False, default=10.0)
    vehicle_info = db.Column(db.String(255), nullable=True)
    tools_info = db.Column(db.String(255), nullable=True)
    fuel_types = db.Column(db.String(60), nullable=True)  # csv, for fuel agents

    verification_status = db.Column(db.String(12), nullable=False,
                                    default=VerificationStatus.PENDING, index=True)
    is_verified = db.Column(db.Boolean, nullable=False, default=False, index=True)
    verification_note = db.Column(db.String(255), nullable=True)
    is_available = db.Column(db.Boolean, nullable=False, default=False, index=True)

    lat = db.Column(db.Float, nullable=True)
    lng = db.Column(db.Float, nullable=True)
    last_location_at = db.Column(db.DateTime, nullable=True)

    rating_avg = db.Column(db.Float, nullable=False, default=0.0)
    rating_count = db.Column(db.Integer, nullable=False, default=0)

    user = db.relationship("User", back_populates="provider")
    documents = db.relationship("ProviderDocument", back_populates="provider",
                                cascade="all, delete-orphan")

    __table_args__ = (
        db.Index("ix_providers_matching", "provider_type", "is_verified", "is_available"),
    )

    @property
    def fuel_type_list(self):
        return [f for f in (self.fuel_types or "").split(",") if f]

    def update_location(self, lat, lng):
        self.lat, self.lng = lat, lng
        self.last_location_at = utcnow()

    def to_dict(self, include_documents=False):
        data = {
            "id": self.id,
            "user_id": self.user_id,
            "name": self.user.name if self.user else None,
            "phone": self.user.phone if self.user else None,
            "provider_type": self.provider_type,
            "business_name": self.business_name,
            "zone": self.zone,
            "service_radius_km": self.service_radius_km,
            "vehicle_info": self.vehicle_info,
            "tools_info": self.tools_info,
            "fuel_types": self.fuel_type_list,
            "verification_status": self.verification_status,
            "is_verified": self.is_verified,
            "verification_note": self.verification_note,
            "is_available": self.is_available,
            "lat": self.lat,
            "lng": self.lng,
            "last_location_at": iso(self.last_location_at),
            "rating_avg": round(self.rating_avg or 0, 2),
            "rating_count": self.rating_count,
            "created_at": iso(self.created_at),
        }
        if include_documents:
            data["documents"] = [d.to_dict() for d in self.documents]
        return data


class ProviderDocument(db.Model):
    __tablename__ = "provider_documents"

    id = db.Column(db.Integer, primary_key=True)
    provider_id = db.Column(db.Integer, db.ForeignKey("providers.id", ondelete="CASCADE"),
                            nullable=False, index=True)
    doc_type = db.Column(db.String(40), nullable=False)  # license, id_proof, rc, permit...
    file_path = db.Column(db.String(255), nullable=False)
    original_name = db.Column(db.String(255), nullable=False)
    uploaded_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    provider = db.relationship("Provider", back_populates="documents")

    def to_dict(self):
        return {
            "id": self.id,
            "doc_type": self.doc_type,
            "original_name": self.original_name,
            "url": f"/api/v1/documents/{self.id}/file",
            "uploaded_at": iso(self.uploaded_at),
        }
