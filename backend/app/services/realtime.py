"""Thin wrappers around Socket.IO emits so services don't depend on socket details."""
import logging

from ..extensions import socketio

log = logging.getLogger(__name__)


def user_room(user_id):
    return f"user_{user_id}"


def request_room(request_id):
    return f"request_{request_id}"


ADMIN_ROOM = "admins"


def _emit(event, data, room):
    try:
        socketio.emit(event, data, to=room)
    except Exception:  # never let a realtime failure break an HTTP request
        log.exception("Socket emit failed: %s -> %s", event, room)


def emit_to_user(user_id, event, data):
    _emit(event, data, user_room(user_id))


def emit_to_request(request_id, event, data):
    _emit(event, data, request_room(request_id))


def emit_to_admins(event, data):
    _emit(event, data, ADMIN_ROOM)


def broadcast_request_update(req):
    """Push a request snapshot to everyone following it (customer, provider, admins)."""
    payload = req.to_dict()
    emit_to_request(req.id, "request:update", payload)
    emit_to_user(req.user_id, "request:update", payload)
    if req.provider is not None:
        emit_to_user(req.provider.user_id, "request:update", payload)
    emit_to_admins("request:update", payload)
