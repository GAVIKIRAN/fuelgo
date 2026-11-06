from flask_jwt_extended import current_user
from flask_smorest import Blueprint

from ..models import FuelType, ProblemCategory
from ..schemas import ComplaintSchema, FeedbackSchema
from ..services import feedback_service, notification_service, pricing_service
from ..utils.decorators import login_required, role_required
from ..utils.geo import ZONES

blp = Blueprint("general", __name__, url_prefix="/api/v1",
                description="Feedback, complaints, notifications, pricing and metadata")


@blp.route("/health", methods=["GET"])
@blp.doc(security=[])
def health():
    return {"status": "ok", "service": "fuelgo-api", "version": "v1"}


@blp.route("/meta", methods=["GET"])
@blp.doc(security=[])
def meta():
    """Enumerations used by the UI (zones, fuel types, problem categories)."""
    return {"zones": [{"name": z, "lat": c[0], "lng": c[1]} for z, c in ZONES.items()],
            "fuel_types": list(FuelType.ALL), "problem_categories": list(ProblemCategory.ALL)}


@blp.route("/pricing", methods=["GET"])
@blp.doc(security=[])
def pricing():
    return pricing_service.get_pricing()


# ---------- feedback & complaints
@blp.route("/feedback", methods=["POST"])
@role_required("user")
@blp.arguments(FeedbackSchema)
def submit_feedback(data):
    return feedback_service.submit_feedback(current_user, data), 201


@blp.route("/complaints", methods=["POST"])
@role_required("user")
@blp.arguments(ComplaintSchema)
def create_complaint(data):
    return feedback_service.create_complaint(current_user, data), 201


@blp.route("/complaints", methods=["GET"])
@role_required("user")
def my_complaints():
    return feedback_service.user_complaints(current_user)


# ---------- notifications
@blp.route("/notifications", methods=["GET"])
@login_required
def notifications():
    from flask import request
    return notification_service.list_notifications(current_user,
                                                   request.args.get("unread") in ("1", "true"))


@blp.route("/notifications/<int:notification_id>/read", methods=["PATCH"])
@login_required
def read_notification(notification_id):
    return notification_service.mark_read(current_user, notification_id).to_dict()


@blp.route("/notifications/read-all", methods=["POST"])
@login_required
def read_all():
    notification_service.mark_all_read(current_user)
    return {"unread_count": 0}
