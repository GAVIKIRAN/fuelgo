from flask import current_app
from flask_jwt_extended import current_user
from flask_smorest import Blueprint

from ..schemas import ConfirmPaymentSchema, InitiatePaymentSchema
from ..services import payment_service
from ..utils.decorators import login_required, role_required

blp = Blueprint("payments", __name__, url_prefix="/api/v1/payments",
                description="Digital payments (mock sandbox or Razorpay test mode)")


@blp.route("/config", methods=["GET"])
@login_required
def config():
    cfg = current_app.config
    return {"gateway": cfg["PAYMENT_GATEWAY"],
            "key_id": cfg["RAZORPAY_KEY_ID"] if cfg["PAYMENT_GATEWAY"] == "razorpay" else None,
            "methods": ["UPI", "CARD", "CASH"],
            "test_hints": {
                "upi_success": "demo@okaxis", "upi_failure": "fail@okaxis",
                "card_success": "4111 1111 1111 1111", "card_failure": "4000 0000 0000 0002",
            } if cfg["PAYMENT_GATEWAY"] == "mock" else None}


@blp.route("/initiate", methods=["POST"])
@role_required("user")
@blp.arguments(InitiatePaymentSchema)
def initiate(data):
    """Create (or reuse) a pending payment for a completed request."""
    return payment_service.initiate(current_user, data["request_id"], data["method"]), 201


@blp.route("/<int:payment_id>/confirm", methods=["POST"])
@role_required("user")
@blp.arguments(ConfirmPaymentSchema)
def confirm(data, payment_id):
    """Complete a UPI/card payment. Returns 402 PAYMENT_FAILED when declined."""
    return payment_service.confirm(current_user, payment_id, data)


@blp.route("", methods=["GET"])
@role_required("user")
def my_payments():
    return payment_service.list_for_user(current_user)


@blp.route("/<int:payment_id>/receipt", methods=["GET"])
@login_required
def receipt(payment_id):
    return payment_service.receipt(current_user, payment_id)
