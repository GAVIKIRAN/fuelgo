"""Role-based access control."""
from functools import wraps

from flask_jwt_extended import current_user, verify_jwt_in_request

from .errors import APIError, Forbidden


def role_required(*roles):
    """Require a valid access token whose user has one of the given roles.

    Usage::

        @role_required("admin")
        def view(): ...
    """
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            verify_jwt_in_request()
            user = current_user
            if user is None:
                raise APIError("User no longer exists", 401)
            if not user.is_active:
                raise Forbidden("Your account has been blocked. Contact support.")
            if roles and user.role not in roles:
                raise Forbidden()
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def login_required(fn):
    """Any authenticated, active user."""
    return role_required()(fn)
