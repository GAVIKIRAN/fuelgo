from flask import request
from flask_jwt_extended import current_user
from flask_smorest import Blueprint

from ..extensions import db
from ..models import RequestStatus
from ..schemas import (CancelSchema, CreateRequestSchema, EstimateQuerySchema, MatchQuerySchema,
                       RequestListQuerySchema)
from ..services import request_service, tracking_service
from ..utils.decorators import login_required, role_required
from ..utils.errors import Conflict, Forbidden
from ..utils.files import save_upload

blp = Blueprint("requests", __name__, url_prefix="/api/v1/requests",
                description="Fuel delivery and mechanic service requests")


@blp.route("/estimate", methods=["POST"])
@role_required("user")
@blp.arguments(EstimateQuerySchema)
def estimate(data):
    """Price estimate: fuel price × litres + distance-based delivery fee."""
    return request_service.estimate(data)


@blp.route("/match", methods=["POST"])
@role_required("user")
@blp.arguments(MatchQuerySchema(unknown="include"))
def match(data):
    """Nearby verified, available providers ranked by distance, rating and ETA."""
    items = request_service.match(data)
    return {"items": items, "count": len(items)}


@blp.route("", methods=["POST"])
@role_required("user")
@blp.arguments(CreateRequestSchema)
def create(data):
    """Book a service (pick a provider or auto-assign)."""
    return request_service.create_request(current_user, data).to_dict(include_history=True), 201


@blp.route("", methods=["GET"])
@role_required("user")
@blp.arguments(RequestListQuerySchema, location="query")
def history(filters):
    """Service history of the current user with filters and pagination."""
    return request_service.list_user_requests(current_user, filters)


@blp.route("/active", methods=["GET"])
@role_required("user")
def active():
    req = request_service.active_request_for_user(current_user)
    return {"request": req.to_dict(include_history=True) if req else None}


@blp.route("/<int:request_id>", methods=["GET"])
@login_required
def detail(request_id):
    return request_service.get_request(current_user, request_id).to_dict(include_history=True)


@blp.route("/<int:request_id>/cancel", methods=["POST"])
@role_required("user")
@blp.arguments(CancelSchema)
def cancel(data, request_id):
    return request_service.cancel_request(current_user, request_id, data["reason"]).to_dict()


@blp.route("/<int:request_id>/photo", methods=["POST"])
@role_required("user")
def upload_photo(request_id):
    """Attach a photo of the problem (multipart field `photo`)."""
    req = request_service.get_request(current_user, request_id)
    if req.user_id != current_user.id:
        raise Forbidden()
    if req.status in RequestStatus.TERMINAL:
        raise Conflict("Cannot attach a photo to a closed request")
    req.photo_path = save_upload(request.files.get("photo"), "requests")
    db.session.commit()
    return req.to_dict(), 201


@blp.route("/<int:request_id>/tracking", methods=["GET"])
@login_required
def tracking(request_id):
    """Current provider position and ETA (polling fallback for Socket.IO)."""
    return tracking_service.get_tracking(current_user, request_id)


@blp.route("/<int:request_id>/simulate", methods=["POST"])
@role_required("user", "provider", "admin")
def simulate(request_id):
    """Demo: drive the provider to the customer automatically."""
    return tracking_service.start_simulation(current_user, request_id), 202
