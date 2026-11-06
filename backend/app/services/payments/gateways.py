"""Pluggable payment gateways.

``MockGateway`` simulates UPI / card payments offline:
  * UPI IDs containing ``fail`` are declined (e.g. ``fail@okaxis``).
  * Cards must pass the Luhn check and not be expired; cards ending in ``0002``
    are declined for insufficient funds (e.g. ``4000 0000 0000 0002``).
  * Everything else succeeds, e.g. ``demo@okaxis`` or ``4111 1111 1111 1111``.

``RazorpayGateway`` uses Razorpay test mode (``PAYMENT_GATEWAY=razorpay`` plus keys);
the frontend opens Razorpay Checkout and the backend verifies the signature.
"""
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import date

from flask import current_app

from ...utils.errors import APIError


@dataclass
class ChargeResult:
    success: bool
    reference: str | None = None
    failure_reason: str | None = None


class PaymentGateway(ABC):
    name = "base"

    @abstractmethod
    def create_order(self, amount, receipt):
        """Return a dict with at least ``order_id`` and any client-side checkout params."""

    @abstractmethod
    def charge(self, payment, details) -> ChargeResult:
        """Complete the payment using user-supplied details."""

    def refund(self, payment):
        return ChargeResult(True, reference=f"rfnd_{uuid.uuid4().hex[:14]}")


def luhn_valid(number: str) -> bool:
    digits = [int(d) for d in number if d.isdigit()]
    if len(digits) < 12:
        return False
    checksum = 0
    for i, d in enumerate(reversed(digits)):
        if i % 2 == 1:
            d *= 2
            if d > 9:
                d -= 9
        checksum += d
    return checksum % 10 == 0


class MockGateway(PaymentGateway):
    name = "mock"

    def create_order(self, amount, receipt):
        return {"order_id": f"order_mock_{uuid.uuid4().hex[:14]}", "amount": amount,
                "currency": "INR", "gateway": self.name}

    def charge(self, payment, details):
        ref = f"pay_mock_{uuid.uuid4().hex[:14]}"
        if payment.method == "UPI":
            upi = (details.get("upi_id") or "").strip()
            if not upi:
                raise APIError("UPI ID is required", 422, details={"upi_id": ["Required."]})
            if "fail" in upi.lower():
                return ChargeResult(False, failure_reason="UPI transaction declined by the bank")
            return ChargeResult(True, reference=ref)
        if payment.method == "CARD":
            number = (details.get("card_number") or "").replace(" ", "")
            expiry, cvv = details.get("card_expiry"), details.get("card_cvv")
            if not (number and expiry and cvv):
                raise APIError("Card number, expiry and CVV are required", 422)
            if not luhn_valid(number):
                return ChargeResult(False, failure_reason="Invalid card number")
            mm, yy = expiry.split("/")
            exp_year, exp_month = 2000 + int(yy), int(mm)
            today = date.today()
            if (exp_year, exp_month) < (today.year, today.month):
                return ChargeResult(False, failure_reason="Card has expired")
            if number.endswith("0002"):
                return ChargeResult(False, failure_reason="Card declined: insufficient funds")
            return ChargeResult(True, reference=ref)
        raise APIError("Unsupported payment method for online payment", 422)


class RazorpayGateway(PaymentGateway):
    name = "razorpay"

    def __init__(self, key_id, key_secret):
        try:
            import razorpay  # optional dependency
        except ImportError as exc:  # pragma: no cover - depends on environment
            raise APIError("Razorpay SDK not installed. Run `pip install razorpay`.", 503) from exc
        if not key_id or not key_secret:
            raise APIError("Razorpay keys are not configured", 503)
        self.key_id = key_id
        self.client = razorpay.Client(auth=(key_id, key_secret))

    def create_order(self, amount, receipt):
        order = self.client.order.create({"amount": int(round(amount * 100)), "currency": "INR",
                                          "receipt": receipt, "payment_capture": 1})
        return {"order_id": order["id"], "amount": amount, "currency": "INR",
                "gateway": self.name, "key_id": self.key_id}

    def charge(self, payment, details):
        pid, sig = details.get("gateway_payment_id"), details.get("gateway_signature")
        if not pid or not sig:
            raise APIError("gateway_payment_id and gateway_signature are required", 422)
        try:
            self.client.utility.verify_payment_signature({
                "razorpay_order_id": payment.gateway_order_id,
                "razorpay_payment_id": pid,
                "razorpay_signature": sig,
            })
        except Exception:
            return ChargeResult(False, failure_reason="Payment signature verification failed")
        return ChargeResult(True, reference=pid)

    def refund(self, payment):
        r = self.client.payment.refund(payment.gateway_reference,
                                       {"amount": int(round(payment.amount * 100))})
        return ChargeResult(True, reference=r.get("id"))


def get_gateway():
    cfg = current_app.config
    if cfg.get("PAYMENT_GATEWAY") == "razorpay":
        return RazorpayGateway(cfg.get("RAZORPAY_KEY_ID"), cfg.get("RAZORPAY_KEY_SECRET"))
    return MockGateway()
