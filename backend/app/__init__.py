"""FuelGo Flask application factory."""
import logging
import os

from dotenv import load_dotenv
from flask import jsonify

from .config import CONFIGS
from flask_smorest import Api

from .extensions import cors, db, jwt, limiter, migrate, socketio
from .utils.errors import error_body, register_error_handlers

load_dotenv()


def create_app(config_name=None):
    from flask import Flask

    config_name = config_name or os.getenv("APP_ENV", "development")
    config_cls = CONFIGS[config_name]
    config_cls.init()

    app = Flask(__name__, instance_relative_config=True)
    app.config.from_object(config_cls)
    os.makedirs(app.instance_path, exist_ok=True)
    os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    from . import models  # noqa: F401  register models with SQLAlchemy

    db.init_app(app)
    migrate.init_app(app, db, render_as_batch=True)
    jwt.init_app(app)
    cors.init_app(app, resources={r"/api/*": {"origins": app.config["CORS_ORIGINS"]}},
                  supports_credentials=False)
    limiter.init_app(app)
    api = Api(app)
    socketio.init_app(app, cors_allowed_origins=app.config["CORS_ORIGINS"],
                      async_mode="threading", logger=False, engineio_logger=False)

    _register_jwt_handlers()
    _register_blueprints(api)
    register_error_handlers(app)

    from . import sockets  # noqa: F401  register Socket.IO handlers

    @app.get("/")
    def index():
        return jsonify({"name": "FuelGo API", "docs": "/api/docs", "health": "/api/v1/health"})

    @app.teardown_appcontext
    def _cleanup(exc):
        if exc is not None:
            db.session.rollback()

    with app.app_context():
        _ensure_reference_data(app)

    return app


def _register_blueprints(api):
    from .routes import admin, auth, misc, payments, provider, requests, vehicles

    for bp in (auth.blp, vehicles.blp, requests.blp, provider.blp, provider.files_blp,
               payments.blp, misc.blp, admin.blp, admin.ml_blp, admin.ml_alias_blp):
        api.register_blueprint(bp)


def _register_jwt_handlers():
    from .models import User

    @jwt.user_lookup_loader
    def _load_user(_header, data):
        try:
            return db.session.get(User, int(data["sub"]))
        except (TypeError, ValueError):
            return None

    @jwt.user_lookup_error_loader
    def _user_missing(_header, _data):
        return jsonify(error_body(401, "User no longer exists", "UNAUTHORIZED")), 401

    @jwt.expired_token_loader
    def _expired(_header, _data):
        return jsonify(error_body(401, "Session expired, please log in again", "TOKEN_EXPIRED")), 401

    @jwt.invalid_token_loader
    def _invalid(reason):
        return jsonify(error_body(401, f"Invalid token: {reason}", "INVALID_TOKEN")), 401

    @jwt.unauthorized_loader
    def _missing(reason):
        return jsonify(error_body(401, "Authentication required", "UNAUTHORIZED")), 401


def _ensure_reference_data(app):
    """Create default fuel prices / fee config if the tables exist but are empty."""
    from sqlalchemy import inspect

    from .services import pricing_service
    try:
        if inspect(db.engine).has_table("fuel_prices"):
            pricing_service.ensure_defaults()
    except Exception:  # database not reachable yet (e.g. container start-up)
        app.logger.warning("Could not ensure reference data; is the database migrated?")
        db.session.rollback()
