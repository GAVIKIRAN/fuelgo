from flask import request
from flask_jwt_extended import current_user
from flask_smorest import Blueprint

from ..schemas import (CancelSchema, PredictDemandQuerySchema, PricingUpdateSchema, ProviderVerifySchema,
                       RefundFlagSchema, RequestListQuerySchema, ResolveComplaintSchema,
                       UserStatusSchema)
from ..services import (admin_service, feedback_service, ml_service, payment_service,
                        pricing_service, request_service)
from ..utils.decorators import role_required

blp = Blueprint("admin", __name__, url_prefix="/api/v1/admin", description="Administration")
ml_blp = Blueprint("ml", __name__, url_prefix="/api/v1/admin/ml",
                   description="Fuel demand prediction (admin)")
# Un-versioned alias required by the project brief: /api/admin/ml/*
ml_alias_blp = Blueprint("ml_alias", __name__, url_prefix="/api/admin/ml",
                         description="Alias of /api/v1/admin/ml")


@blp.route("/dashboard", methods=["GET"])
@role_required("admin")
def dashboard():
    return admin_service.dashboard()


# ---------- users
@blp.route("/users", methods=["GET"])
@role_required("admin")
def users():
    return admin_service.list_users(request.args)


@blp.route("/users/<int:user_id>/status", methods=["PATCH"])
@role_required("admin")
@blp.arguments(UserStatusSchema)
def user_status(data, user_id):
    """Block / unblock a user."""
    return admin_service.set_user_active(current_user, user_id, data["is_active"])


@blp.route("/users/<int:user_id>", methods=["DELETE"])
@role_required("admin")
def delete_user(user_id):
    admin_service.delete_user(current_user, user_id)
    return "", 204


# ---------- providers
@blp.route("/providers", methods=["GET"])
@role_required("admin")
def providers():
    return admin_service.list_providers(request.args)


@blp.route("/providers/<int:provider_id>/verification", methods=["PATCH"])
@role_required("admin")
@blp.arguments(ProviderVerifySchema)
def verify_provider(data, provider_id):
    """Verify, reject or suspend a provider."""
    return admin_service.verify_provider(current_user, provider_id, data["status"], data.get("note"))


# ---------- requests
@blp.route("/requests", methods=["GET"])
@role_required("admin")
@blp.arguments(RequestListQuerySchema(unknown="include"), location="query")
def requests_(filters):
    return admin_service.list_requests(filters)


@blp.route("/requests/<int:request_id>/cancel", methods=["POST"])
@role_required("admin")
@blp.arguments(CancelSchema)
def cancel_request(data, request_id):
    return request_service.cancel_request(current_user, request_id, data["reason"]).to_dict()


# ---------- payments
@blp.route("/payments", methods=["GET"])
@role_required("admin")
def payments():
    return payment_service.list_all(request.args)


@blp.route("/payments/<int:payment_id>/refund", methods=["PATCH"])
@role_required("admin")
@blp.arguments(RefundFlagSchema)
def refund(data, payment_id):
    return payment_service.set_refund(payment_id, data)


# ---------- feedback & complaints
@blp.route("/feedback", methods=["GET"])
@role_required("admin")
def feedback():
    return feedback_service.list_feedback(request.args)


@blp.route("/complaints", methods=["GET"])
@role_required("admin")
def complaints():
    return feedback_service.list_complaints(request.args)


@blp.route("/complaints/<int:complaint_id>/resolve", methods=["PATCH"])
@role_required("admin")
@blp.arguments(ResolveComplaintSchema)
def resolve(data, complaint_id):
    return feedback_service.resolve_complaint(current_user, complaint_id, data["resolution_note"])


# ---------- pricing
@blp.route("/pricing", methods=["GET"])
@role_required("admin")
def get_pricing():
    return pricing_service.get_pricing()


@blp.route("/pricing", methods=["PUT"])
@role_required("admin")
@blp.arguments(PricingUpdateSchema)
def update_pricing(data):
    return pricing_service.update_pricing(current_user, data)


# ---------- ML
def _register_ml(bp):
    @bp.route("/predict-demand", methods=["GET"])
    @role_required("admin")
    @bp.arguments(PredictDemandQuerySchema, location="query")
    def predict_demand(args):
        """Hourly fuel demand forecast for a date, zone and fuel type."""
        return ml_service.predict_demand(args["date"], args["zone"], args["fuel_type"],
                                         args.get("weather"), args.get("traffic"))

    @bp.route("/insights", methods=["GET"])
    @role_required("admin")
    def insights():
        """Peak hours, top zones and a 7-day forecast."""
        return ml_service.insights()

    @bp.route("/metrics", methods=["GET"])
    @role_required("admin")
    def metrics():
        return ml_service.metrics()

    @bp.route("/retrain", methods=["POST"])
    @role_required("admin")
    def retrain():
        """Retrain all candidate models on the latest data and keep the best."""
        return ml_service.retrain()


_register_ml(ml_blp)
_register_ml(ml_alias_blp)
