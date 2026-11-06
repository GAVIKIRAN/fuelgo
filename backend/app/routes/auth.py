from flask import current_app
from flask_jwt_extended import current_user, jwt_required
from flask_smorest import Blueprint

from ..extensions import limiter
from ..schemas import LoginSchema, ProfileUpdateSchema, RegisterSchema
from ..services import auth_service
from ..utils.decorators import login_required

blp = Blueprint("auth", __name__, url_prefix="/api/v1/auth",
                description="Registration, login, tokens and profile")


def _auth_limit():
    return current_app.config["AUTH_RATE_LIMIT"]


@blp.route("/register", methods=["POST"])
@limiter.limit(_auth_limit)
@blp.arguments(RegisterSchema)
@blp.doc(security=[])
def register(data):
    """Register a vehicle owner or a service provider."""
    return auth_service.register(data), 201


@blp.route("/login", methods=["POST"])
@limiter.limit(_auth_limit)
@blp.arguments(LoginSchema)
@blp.doc(security=[])
def login(data):
    """Log in and receive access + refresh tokens."""
    return auth_service.login(data["email"], data["password"])


@blp.route("/refresh", methods=["POST"])
@limiter.limit(_auth_limit)
@jwt_required(refresh=True)
def refresh():
    """Exchange a refresh token (Authorization: Bearer <refresh>) for a new access token."""
    return auth_service.refresh(current_user)


@blp.route("/me", methods=["GET"])
@login_required
def me():
    """Current user profile."""
    return current_user.to_dict(include_provider=True)


@blp.route("/me", methods=["PATCH"])
@login_required
@blp.arguments(ProfileUpdateSchema)
def update_me(data):
    """Edit profile / change password."""
    return auth_service.update_profile(current_user, data)
