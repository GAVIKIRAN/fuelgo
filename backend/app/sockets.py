"""Socket.IO events.

Client connects with ``auth: {token: <access JWT>}`` and is joined to ``user_<id>``
(and ``admins`` for admins). Events:

* ``request:join`` {request_id}  – follow a request's live tracking (room ``request_<id>``)
* ``request:leave`` {request_id}
* ``provider:location`` {lat, lng} – provider live position (updates ETA, emits ``tracking:update``)

Server → client: ``notification``, ``request:new``, ``request:update``, ``tracking:update``.
"""
import logging

from flask import request
from flask_jwt_extended import decode_token
from flask_socketio import ConnectionRefusedError, join_room, leave_room

from .extensions import db, socketio
from .models import Role, User
from .services import request_service, tracking_service
from .services.realtime import ADMIN_ROOM, request_room, user_room
from .utils.errors import APIError

log = logging.getLogger(__name__)
_sessions = {}  # sid -> user_id


def _user():
    uid = _sessions.get(request.sid)
    return db.session.get(User, uid) if uid else None


@socketio.on("connect")
def on_connect(auth=None):
    token = (auth or {}).get("token") or request.args.get("token")
    if not token:
        raise ConnectionRefusedError("authentication required")
    try:
        claims = decode_token(token)
    except Exception:
        raise ConnectionRefusedError("invalid token")
    user = db.session.get(User, int(claims["sub"]))
    if user is None or not user.is_active:
        raise ConnectionRefusedError("account unavailable")
    _sessions[request.sid] = user.id
    join_room(user_room(user.id))
    if user.role == Role.ADMIN:
        join_room(ADMIN_ROOM)
    return True


@socketio.on("disconnect")
def on_disconnect(*_args):
    _sessions.pop(request.sid, None)


@socketio.on("request:join")
def on_join(data):
    user = _user()
    if user is None:
        return {"ok": False, "error": "unauthenticated"}
    try:
        req = request_service.get_request(user, int((data or {}).get("request_id", 0)))
    except (APIError, ValueError, TypeError):
        return {"ok": False, "error": "not found"}
    join_room(request_room(req.id))
    payload = tracking_service.tracking_payload(req)
    db.session.remove()
    return {"ok": True, "tracking": payload}


@socketio.on("request:leave")
def on_leave(data):
    try:
        leave_room(request_room(int((data or {}).get("request_id", 0))))
    except (ValueError, TypeError):
        pass
    return {"ok": True}


@socketio.on("provider:location")
def on_location(data):
    user = _user()
    if user is None or user.role != Role.PROVIDER:
        return {"ok": False, "error": "only providers can share location"}
    try:
        lat, lng = float(data["lat"]), float(data["lng"])
        if not (-90 <= lat <= 90 and -180 <= lng <= 180):
            raise ValueError
    except (KeyError, TypeError, ValueError):
        return {"ok": False, "error": "invalid coordinates"}
    result = tracking_service.update_location_for_user(user, lat, lng)
    db.session.remove()
    return {"ok": True, **result}
