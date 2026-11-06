"""Uniform JSON error format:

    {"error": {"status": 404, "code": "NOT_FOUND", "message": "...", "details": {...}}}
"""
import logging

from flask import jsonify
from werkzeug.exceptions import HTTPException

log = logging.getLogger(__name__)

_CODES = {
    400: "BAD_REQUEST", 401: "UNAUTHORIZED", 403: "FORBIDDEN", 404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED", 409: "CONFLICT", 413: "PAYLOAD_TOO_LARGE",
    415: "UNSUPPORTED_MEDIA_TYPE", 422: "VALIDATION_ERROR", 429: "RATE_LIMITED",
    500: "INTERNAL_ERROR", 502: "BAD_GATEWAY", 503: "SERVICE_UNAVAILABLE",
}


class APIError(Exception):
    """Raise from services to produce a structured error response."""

    def __init__(self, message, status=400, code=None, details=None):
        super().__init__(message)
        self.message = message
        self.status = status
        self.code = code or _CODES.get(status, "ERROR")
        self.details = details


class NotFound(APIError):
    def __init__(self, what="Resource"):
        super().__init__(f"{what} not found", 404)


class Forbidden(APIError):
    def __init__(self, message="You do not have permission to perform this action"):
        super().__init__(message, 403)


class Conflict(APIError):
    def __init__(self, message, details=None):
        super().__init__(message, 409, details=details)


def error_body(status, message, code=None, details=None):
    body = {"error": {"status": status, "code": code or _CODES.get(status, "ERROR"),
                      "message": message}}
    if details:
        body["error"]["details"] = details
    return body


def register_error_handlers(app):
    @app.errorhandler(APIError)
    def _api_error(exc):
        return jsonify(error_body(exc.status, exc.message, exc.code, exc.details)), exc.status

    def _http_error(exc: HTTPException):
        status = exc.code or 500
        details = None
        data = getattr(exc, "data", None) or {}
        if "messages" in data:  # webargs / marshmallow validation errors
            msgs = data["messages"]
            # flatten {"json": {...}} -> {...}
            if isinstance(msgs, dict) and len(msgs) == 1:
                msgs = next(iter(msgs.values()))
            details = msgs
        message = exc.description if status != 422 else "Validation failed"
        if status == 429:
            message = "Too many requests, please slow down"
        return jsonify(error_body(status, message, details=details)), status

    app.register_error_handler(HTTPException, _http_error)

    @app.errorhandler(Exception)
    def _unhandled(exc):
        if isinstance(exc, HTTPException):
            return _http_error(exc)
        log.exception("Unhandled error")
        return jsonify(error_body(500, "Something went wrong on our side")), 500
