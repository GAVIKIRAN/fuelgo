import os

from flask import current_app, request, send_from_directory
from flask_jwt_extended import current_user
from flask_smorest import Blueprint

from ..extensions import db
from ..models import ProviderDocument, Role
from ..schemas import (AvailabilitySchema, ProviderLocationSchema, ProviderProfileSchema,
                       RejectSchema, RequestListQuerySchema, StatusUpdateSchema)
from ..services import (feedback_service, payment_service, provider_service, request_service,
                        tracking_service)
from ..utils.decorators import login_required, role_required
from ..utils.errors import NotFound

blp = Blueprint("provider", __name__, url_prefix="/api/v1/provider",
                description="Provider workspace: availability, jobs, earnings")
files_blp = Blueprint("files", __name__, url_prefix="/api/v1", description="Uploaded files")


@blp.route("/profile", methods=["GET"])
@role_required("provider")
def profile():
    return provider_service.get_profile(current_user).to_dict(include_documents=True)


@blp.route("/profile", methods=["PATCH"])
@role_required("provider")
@blp.arguments(ProviderProfileSchema)
def update_profile(data):
    return provider_service.update_profile(current_user, data)


@blp.route("/availability", methods=["PATCH"])
@role_required("provider")
@blp.arguments(AvailabilitySchema)
def availability(data):
    """Go online / offline (optionally with current GPS position)."""
    return provider_service.set_availability(current_user, data["is_available"],
                                             data.get("lat"), data.get("lng"))


@blp.route("/location", methods=["POST"])
@role_required("provider")
@blp.arguments(ProviderLocationSchema)
def location(data):
    """REST fallback for live location updates (Socket.IO event `provider:location`)."""
    return tracking_service.update_location_for_user(current_user, data["lat"], data["lng"])


@blp.route("/requests/incoming", methods=["GET"])
@role_required("provider")
def incoming():
    return {"items": request_service.provider_incoming(current_user)}


@blp.route("/requests/active", methods=["GET"])
@role_required("provider")
def active_job():
    job = request_service.provider_active_job(current_user)
    return {"request": job.to_dict(include_history=True) if job else None}


@blp.route("/requests/history", methods=["GET"])
@role_required("provider")
@blp.arguments(RequestListQuerySchema, location="query")
def history(filters):
    return request_service.provider_history(current_user, filters)


@blp.route("/requests/<int:request_id>/accept", methods=["POST"])
@role_required("provider")
def accept(request_id):
    return request_service.accept_request(current_user, request_id).to_dict(include_history=True)


@blp.route("/requests/<int:request_id>/reject", methods=["POST"])
@role_required("provider")
@blp.arguments(RejectSchema)
def reject(data, request_id):
    """Decline a request; it is auto-reassigned to the next nearest provider."""
    req, reassigned = request_service.reject_request(current_user, request_id, data["reason"])
    return {"request_id": req.id, "reassigned": reassigned, "status": req.status}


@blp.route("/requests/<int:request_id>/status", methods=["PATCH"])
@role_required("provider")
@blp.arguments(StatusUpdateSchema)
def update_status(data, request_id):
    """Advance the lifecycle; set `final_price` when completing."""
    req = request_service.update_status(current_user, request_id, data["status"],
                                        data.get("final_price"), data.get("note"))
    return req.to_dict(include_history=True)


@blp.route("/requests/<int:request_id>/cash-received", methods=["POST"])
@role_required("provider")
def cash_received(request_id):
    return payment_service.mark_cash_received(current_user, request_id)


@blp.route("/earnings", methods=["GET"])
@role_required("provider")
def earnings():
    return provider_service.earnings(current_user)


@blp.route("/ratings", methods=["GET"])
@role_required("provider")
def ratings():
    return feedback_service.provider_ratings(current_user)


@blp.route("/documents", methods=["POST"])
@role_required("provider")
def upload_document():
    """Upload a verification document (multipart: `file`, `doc_type`)."""
    return provider_service.upload_document(current_user, request.form.get("doc_type", "other"),
                                            request.files.get("file")), 201


@blp.route("/documents/<int:doc_id>", methods=["DELETE"])
@role_required("provider")
def delete_document(doc_id):
    provider_service.delete_document(current_user, doc_id)
    return "", 204


# ------------------------------------------------------------------ files
@files_blp.route("/documents/<int:doc_id>/file", methods=["GET"])
@login_required
def document_file(doc_id):
    """Download a provider document (owner or admin only)."""
    doc = db.session.get(ProviderDocument, doc_id)
    owner = current_user.provider and doc and doc.provider_id == current_user.provider.id
    if doc is None or not (current_user.role == Role.ADMIN or owner):
        raise NotFound("Document")
    return send_from_directory(current_app.config["UPLOAD_FOLDER"], doc.file_path)


@files_blp.route("/uploads/requests/<path:filename>", methods=["GET"])
@files_blp.doc(security=[])
def request_photo(filename):
    """Public (unguessable) URL for request photos so they can be shown in <img> tags."""
    folder = os.path.join(current_app.config["UPLOAD_FOLDER"], "requests")
    return send_from_directory(folder, filename)
