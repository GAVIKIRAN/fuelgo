import secrets

from sqlalchemy import select

from ..extensions import db
from ..models import (Payment, PaymentMethod, PaymentStatus, RequestStatus, Role, ServiceRequest,
                      utcnow)
from ..utils.errors import APIError, Conflict, Forbidden, NotFound
from ..utils.pagination import paginate
from ..utils.timeutil import now_ist
from . import request_service
from .notification_service import notify
from .payments import get_gateway
from .realtime import broadcast_request_update


def new_transaction_id():
    return f"FG{now_ist():%Y%m%d}{secrets.token_hex(5).upper()}"


def _successful(req):
    return next((p for p in req.payments if p.status in (PaymentStatus.SUCCESS,
                                                          PaymentStatus.REFUNDED)), None)


def initiate(user, request_id, method):
    req = request_service.get_request(user, request_id)
    if req.user_id != user.id:
        raise Forbidden("Only the customer can pay for this request")
    if req.status != RequestStatus.COMPLETED:
        raise Conflict("Payment is available once the service is completed")
    if _successful(req):
        raise Conflict("This request has already been paid")

    pending = next((p for p in req.payments if p.status == PaymentStatus.PENDING), None)
    gateway = get_gateway() if method != PaymentMethod.CASH else None
    if pending is not None:
        payment = pending
        payment.method = method
    else:
        payment = Payment(request_id=req.id, user_id=user.id, amount=req.final_price or 0,
                          method=method, transaction_id=new_transaction_id(),
                          status=PaymentStatus.PENDING)
        db.session.add(payment)
    payment.gateway = gateway.name if gateway else "cash"
    checkout = {}
    if gateway:
        checkout = gateway.create_order(payment.amount, payment.transaction_id)
        payment.gateway_order_id = checkout["order_id"]
    else:
        payment.gateway_order_id = None
        if req.provider:
            notify(req.provider.user_id, "Collect cash",
                   f"Customer chose cash for request #{req.id}. Collect ₹{payment.amount:.2f} "
                   f"and mark it received.", "payment_cash", req.id, commit=False)
    db.session.commit()
    return {"payment": payment.to_dict(), "checkout": checkout}


def confirm(user, payment_id, details):
    payment = db.session.get(Payment, payment_id)
    if payment is None or payment.user_id != user.id:
        raise NotFound("Payment")
    if payment.status != PaymentStatus.PENDING:
        raise Conflict(f"Payment is already {payment.status.lower()}")
    if payment.method == PaymentMethod.CASH:
        raise Conflict("Cash payments are confirmed by the provider")

    result = get_gateway().charge(payment, details)
    req = payment.request
    if result.success:
        payment.status = PaymentStatus.SUCCESS
        payment.gateway_reference = result.reference
        payment.paid_at = utcnow()
        payment.failure_reason = None
        notify(user.id, "Payment successful",
               f"₹{payment.amount:.2f} paid for request #{req.id}. Txn {payment.transaction_id}.",
               "payment_success", req.id, commit=False)
        if req.provider:
            notify(req.provider.user_id, "Payment received",
                   f"Customer paid ₹{payment.amount:.2f} for request #{req.id}.",
                   "payment_success", req.id, commit=False)
        db.session.commit()
        broadcast_request_update(req)
        return payment.to_dict()

    payment.status = PaymentStatus.FAILED
    payment.failure_reason = result.failure_reason
    notify(user.id, "Payment failed",
           f"Payment for request #{req.id} failed: {result.failure_reason}. You can retry.",
           "payment_failed", req.id, commit=False)
    db.session.commit()
    raise APIError(result.failure_reason or "Payment failed", 402, code="PAYMENT_FAILED",
                   details={"payment": payment.to_dict()})


def mark_cash_received(user, request_id):
    """Provider confirms the customer paid cash."""
    req = request_service.get_request(user, request_id)
    if user.role != Role.PROVIDER or req.provider_id != user.provider.id:
        raise Forbidden("Only the assigned provider can confirm cash")
    if req.status != RequestStatus.COMPLETED:
        raise Conflict("Cash can be marked received after completing the job")
    if _successful(req):
        raise Conflict("This request has already been paid")
    payment = next((p for p in req.payments if p.status == PaymentStatus.PENDING), None)
    if payment is None:
        payment = Payment(request_id=req.id, user_id=req.user_id, amount=req.final_price or 0,
                          transaction_id=new_transaction_id())
        db.session.add(payment)
    payment.method = PaymentMethod.CASH
    payment.gateway = "cash"
    payment.status = PaymentStatus.SUCCESS
    payment.gateway_reference = f"CASH-{user.provider.id}-{req.id}"
    payment.paid_at = utcnow()
    notify(req.user_id, "Cash payment recorded",
           f"{user.provider.business_name} confirmed ₹{payment.amount:.2f} cash for request #{req.id}.",
           "payment_success", req.id, commit=False)
    db.session.commit()
    broadcast_request_update(req)
    return payment.to_dict()


def receipt(user, payment_id):
    payment = db.session.get(Payment, payment_id)
    if payment is None:
        raise NotFound("Payment")
    req = payment.request
    allowed = (user.role == Role.ADMIN or payment.user_id == user.id or
               (user.role == Role.PROVIDER and user.provider and req.provider_id == user.provider.id))
    if not allowed:
        raise NotFound("Payment")
    return {
        "receipt_number": f"RCPT-{payment.transaction_id}",
        "payment": payment.to_dict(),
        "request": {
            "id": req.id, "service_type": req.service_type, "fuel_type": req.fuel_type,
            "quantity_litres": req.quantity_litres, "problem_category": req.problem_category,
            "address": req.address, "completed_at": req.to_dict()["completed_at"],
            "price_breakdown": req.price_breakdown, "final_price": req.final_price,
        },
        "customer": {"name": req.user.name, "email": req.user.email, "phone": req.user.phone},
        "provider": {"name": req.provider.business_name if req.provider else None,
                     "phone": req.provider.user.phone if req.provider else None},
        "issued_by": "FuelGo Roadside Services, Mysuru",
    }


def list_for_user(user):
    q = select(Payment).where(Payment.user_id == user.id).order_by(Payment.created_at.desc())
    return paginate(q)


def list_all(filters):
    q = select(Payment)
    if filters.get("status"):
        q = q.where(Payment.status == filters["status"])
    if filters.get("method"):
        q = q.where(Payment.method == filters["method"])
    if filters.get("refund_requested") in ("1", "true", "True"):
        q = q.where(Payment.refund_requested.is_(True))
    return paginate(q.order_by(Payment.created_at.desc()))


def set_refund(payment_id, data):
    payment = db.session.get(Payment, payment_id)
    if payment is None:
        raise NotFound("Payment")
    payment.refund_requested = data["refund_requested"]
    if "refund_note" in data:
        payment.refund_note = data["refund_note"]
    if data.get("mark_refunded"):
        if payment.status != PaymentStatus.SUCCESS:
            raise Conflict("Only successful payments can be refunded")
        if payment.method != PaymentMethod.CASH:
            gateway_cls = get_gateway()
            result = gateway_cls.refund(payment) if payment.gateway == gateway_cls.name else None
            if result is not None and not result.success:
                raise APIError("Refund failed at the gateway", 502)
        payment.status = PaymentStatus.REFUNDED
        notify(payment.user_id, "Refund processed",
               f"₹{payment.amount:.2f} for request #{payment.request_id} has been refunded.",
               "payment_refund", payment.request_id, commit=False)
    db.session.commit()
    return payment.to_dict()
