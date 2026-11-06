"""Marshmallow schemas used for request validation (and OpenAPI docs)."""
import re

from marshmallow import Schema, ValidationError, fields, validate, validates, validates_schema

from ..models import (FuelType, PaymentMethod, ProblemCategory, RequestStatus, ServiceType,
                      VerificationStatus)

PHONE_RE = re.compile(r"^\+?[0-9]{10,13}$")
REG_RE = re.compile(r"^[A-Z]{2}[ -]?[0-9]{1,2}[ -]?[A-Z]{0,3}[ -]?[0-9]{1,4}$")


class BaseSchema(Schema):
    pass


def _phone(value):
    if value and not PHONE_RE.match(value):
        raise ValidationError("Enter a valid phone number (10-13 digits).")


def _password(value):
    if len(value) < 8 or not re.search(r"[A-Za-z]", value) or not re.search(r"\d", value):
        raise ValidationError("Password must be at least 8 characters and contain letters and numbers.")


# ---------- auth ----------
class RegisterSchema(BaseSchema):
    name = fields.String(required=True, validate=validate.Length(min=2, max=120))
    email = fields.Email(required=True)
    phone = fields.String(load_default=None, validate=_phone)
    password = fields.String(required=True, load_only=True, validate=_password)
    role = fields.String(load_default="user", validate=validate.OneOf(["user", "provider"]))
    # Provider-only fields
    provider_type = fields.String(validate=validate.OneOf(ServiceType.ALL))
    business_name = fields.String(validate=validate.Length(min=2, max=120))
    zone = fields.String(validate=validate.Length(max=60))
    service_radius_km = fields.Float(validate=validate.Range(min=1, max=50))
    vehicle_info = fields.String(validate=validate.Length(max=255))
    tools_info = fields.String(validate=validate.Length(max=255))
    fuel_types = fields.List(fields.String(validate=validate.OneOf(FuelType.ALL)))
    lat = fields.Float(validate=validate.Range(min=-90, max=90))
    lng = fields.Float(validate=validate.Range(min=-180, max=180))

    @validates_schema
    def provider_fields(self, data, **kwargs):
        if data.get("role") == "provider":
            missing = [f for f in ("provider_type", "business_name") if not data.get(f)]
            if missing:
                raise ValidationError({f: ["Required for providers."] for f in missing})


class LoginSchema(BaseSchema):
    email = fields.Email(required=True)
    password = fields.String(required=True, load_only=True)


class ProfileUpdateSchema(BaseSchema):
    name = fields.String(validate=validate.Length(min=2, max=120))
    phone = fields.String(allow_none=True, validate=_phone)
    address = fields.String(allow_none=True, validate=validate.Length(max=255))
    current_password = fields.String(load_only=True)
    new_password = fields.String(load_only=True, validate=_password)

    @validates_schema
    def password_pair(self, data, **kwargs):
        if data.get("new_password") and not data.get("current_password"):
            raise ValidationError({"current_password": ["Required to change password."]})


# ---------- vehicles ----------
class VehicleSchema(BaseSchema):
    make = fields.String(required=True, validate=validate.Length(min=1, max=60))
    model = fields.String(required=True, validate=validate.Length(min=1, max=60))
    registration_number = fields.String(required=True, validate=validate.Length(min=4, max=20))
    fuel_type = fields.String(required=True, validate=validate.OneOf(FuelType.ALL + ("electric",)))
    vehicle_type = fields.String(load_default="car",
                                 validate=validate.OneOf(["car", "bike", "scooter", "truck",
                                                          "auto", "van"]))

    @validates("registration_number")
    def reg_format(self, value, **kwargs):
        if not REG_RE.match(value.strip().upper()):
            raise ValidationError("Use an Indian registration format, e.g. KA09AB1234.")


class VehicleUpdateSchema(VehicleSchema):
    """Same fields as VehicleSchema; used with partial=True for PATCH."""


# ---------- requests ----------
class LocationSchema(BaseSchema):
    lat = fields.Float(required=True, validate=validate.Range(min=-90, max=90))
    lng = fields.Float(required=True, validate=validate.Range(min=-180, max=180))


class EstimateQuerySchema(LocationSchema):
    service_type = fields.String(required=True, validate=validate.OneOf(ServiceType.ALL))
    fuel_type = fields.String(validate=validate.OneOf(FuelType.ALL))
    quantity_litres = fields.Float(validate=validate.Range(min=1, max=60))
    problem_category = fields.String(validate=validate.OneOf(ProblemCategory.ALL))


class MatchQuerySchema(LocationSchema):
    service_type = fields.String(required=True, validate=validate.OneOf(ServiceType.ALL))
    fuel_type = fields.String(validate=validate.OneOf(FuelType.ALL))


class CreateRequestSchema(LocationSchema):
    service_type = fields.String(required=True, validate=validate.OneOf(ServiceType.ALL))
    vehicle_id = fields.Integer(allow_none=True)
    fuel_type = fields.String(validate=validate.OneOf(FuelType.ALL))
    quantity_litres = fields.Float(validate=validate.Range(min=1, max=60))
    problem_category = fields.String(validate=validate.OneOf(ProblemCategory.ALL))
    description = fields.String(validate=validate.Length(max=1000))
    address = fields.String(validate=validate.Length(max=255))
    provider_id = fields.Integer(allow_none=True)
    auto_assign = fields.Boolean(load_default=False)

    @validates_schema
    def service_fields(self, data, **kwargs):
        if data["service_type"] == ServiceType.FUEL:
            errors = {}
            if not data.get("fuel_type"):
                errors["fuel_type"] = ["Required for fuel delivery."]
            if not data.get("quantity_litres"):
                errors["quantity_litres"] = ["Required for fuel delivery."]
            if errors:
                raise ValidationError(errors)
        else:
            if not data.get("problem_category"):
                raise ValidationError({"problem_category": ["Required for mechanic requests."]})
        if not data.get("auto_assign") and not data.get("provider_id"):
            raise ValidationError({"provider_id": ["Choose a provider or enable auto-assign."]})


class CancelSchema(BaseSchema):
    reason = fields.String(load_default="Cancelled by user", validate=validate.Length(max=255))


class RejectSchema(BaseSchema):
    reason = fields.String(load_default="Provider unavailable", validate=validate.Length(max=255))


class StatusUpdateSchema(BaseSchema):
    status = fields.String(required=True, validate=validate.OneOf(
        [RequestStatus.EN_ROUTE, RequestStatus.ARRIVED, RequestStatus.IN_PROGRESS,
         RequestStatus.COMPLETED]))
    final_price = fields.Float(validate=validate.Range(min=0, max=100000))
    note = fields.String(validate=validate.Length(max=255))


class RequestListQuerySchema(BaseSchema):
    status = fields.String(validate=validate.OneOf(RequestStatus.ALL))
    service_type = fields.String(validate=validate.OneOf(ServiceType.ALL))
    date_from = fields.Date()
    date_to = fields.Date()
    page = fields.Integer()
    per_page = fields.Integer()
    q = fields.String()


# ---------- providers ----------
class ProviderProfileSchema(BaseSchema):
    business_name = fields.String(validate=validate.Length(min=2, max=120))
    zone = fields.String(validate=validate.Length(max=60))
    service_radius_km = fields.Float(validate=validate.Range(min=1, max=50))
    vehicle_info = fields.String(validate=validate.Length(max=255))
    tools_info = fields.String(validate=validate.Length(max=255))
    fuel_types = fields.List(fields.String(validate=validate.OneOf(FuelType.ALL)))


class AvailabilitySchema(BaseSchema):
    is_available = fields.Boolean(required=True)
    lat = fields.Float(validate=validate.Range(min=-90, max=90))
    lng = fields.Float(validate=validate.Range(min=-180, max=180))


class ProviderLocationSchema(LocationSchema):
    request_id = fields.Integer()


# ---------- payments ----------
class InitiatePaymentSchema(BaseSchema):
    request_id = fields.Integer(required=True)
    method = fields.String(required=True, validate=validate.OneOf(PaymentMethod.ALL))


class ConfirmPaymentSchema(BaseSchema):
    upi_id = fields.String(validate=validate.Regexp(r"^[\w.\-]{2,64}@[A-Za-z]{2,32}$",
                                                    error="Enter a valid UPI ID, e.g. name@okaxis"))
    card_number = fields.String(validate=validate.Regexp(r"^\d{12,19}$",
                                                         error="Card number must be 12-19 digits"))
    card_expiry = fields.String(validate=validate.Regexp(r"^(0[1-9]|1[0-2])/\d{2}$",
                                                         error="Use MM/YY"))
    card_cvv = fields.String(load_only=True, validate=validate.Regexp(r"^\d{3,4}$",
                                                                      error="CVV must be 3-4 digits"))
    gateway_payment_id = fields.String()
    gateway_signature = fields.String()


class RefundFlagSchema(BaseSchema):
    refund_requested = fields.Boolean(required=True)
    refund_note = fields.String(validate=validate.Length(max=255))
    mark_refunded = fields.Boolean(load_default=False)


# ---------- feedback ----------
class FeedbackSchema(BaseSchema):
    request_id = fields.Integer(required=True)
    rating = fields.Integer(required=True, validate=validate.Range(min=1, max=5))
    comment = fields.String(validate=validate.Length(max=1000))


class ComplaintSchema(BaseSchema):
    request_id = fields.Integer(required=True)
    subject = fields.String(required=True, validate=validate.Length(min=3, max=150))
    description = fields.String(required=True, validate=validate.Length(min=5, max=2000))


class ResolveComplaintSchema(BaseSchema):
    resolution_note = fields.String(required=True, validate=validate.Length(min=3, max=2000))


# ---------- admin ----------
class UserStatusSchema(BaseSchema):
    is_active = fields.Boolean(required=True)


class ProviderVerifySchema(BaseSchema):
    status = fields.String(required=True, validate=validate.OneOf(
        [VerificationStatus.VERIFIED, VerificationStatus.REJECTED, VerificationStatus.SUSPENDED]))
    note = fields.String(validate=validate.Length(max=255))


class FuelPriceItemSchema(BaseSchema):
    fuel_type = fields.String(required=True, validate=validate.OneOf(FuelType.ALL))
    price_per_litre = fields.Float(required=True, validate=validate.Range(min=1, max=1000))


class PricingUpdateSchema(BaseSchema):
    fuel_prices = fields.List(fields.Nested(FuelPriceItemSchema))
    config = fields.Dict(keys=fields.String(), values=fields.Float(validate=validate.Range(min=0, max=100000)))


class PredictDemandQuerySchema(BaseSchema):
    date = fields.Date(required=True)
    zone = fields.String(required=True)
    fuel_type = fields.String(required=True, validate=validate.OneOf(FuelType.ALL))
    weather = fields.String(validate=validate.OneOf(["clear", "cloudy", "rain", "storm"]))
    traffic = fields.String(validate=validate.OneOf(["low", "medium", "high"]))
