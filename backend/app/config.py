"""Application configuration, read from environment variables (.env)."""
import json
import os
import secrets
import warnings
from datetime import timedelta

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def _secret(name: str) -> str:
    value = os.getenv(name)
    if value and value not in ("change-me", "change-me-too"):
        return value
    if os.getenv("APP_ENV") == "production":
        raise RuntimeError(f"{name} must be set in production")
    # Development fallback: a random secret generated once and kept in instance/
    # (git-ignored) so sessions survive auto-reloads. Never used in production.
    path = os.path.join(BASE_DIR, "instance", "dev_secrets.json")
    stored = {}
    if os.path.exists(path):
        with open(path, encoding="utf-8") as fh:
            stored = json.load(fh)
    if name not in stored:
        stored[name] = secrets.token_hex(32)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(stored, fh)
        warnings.warn(f"{name} not set; generated a development secret in instance/.", stacklevel=2)
    return stored[name]


def _database_url() -> str:
    url = os.getenv("DATABASE_URL", "sqlite:///fuelgo.db")
    # Heroku-style URLs
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)
    return url


class Config:
    SECRET_KEY = None  # filled in init
    JWT_SECRET_KEY = None
    SQLALCHEMY_DATABASE_URI = None
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {"pool_pre_ping": True}

    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=12)
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=14)

    CORS_ORIGINS = [o.strip() for o in os.getenv(
        "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if o.strip()]

    UPLOAD_FOLDER = os.path.join(BASE_DIR, "uploads")
    MAX_CONTENT_LENGTH = 8 * 1024 * 1024  # 8 MB uploads
    ALLOWED_UPLOAD_EXTENSIONS = {"png", "jpg", "jpeg", "webp", "pdf"}

    PAYMENT_GATEWAY = os.getenv("PAYMENT_GATEWAY", "mock").lower()
    RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID", "")
    RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET", "")

    SIMULATOR_ENABLED = os.getenv("SIMULATOR_ENABLED", "1") == "1"
    SIMULATOR_STEP_SECONDS = 1.5
    SIMULATOR_STEPS = 20

    BCRYPT_ROUNDS = 12
    AUTH_RATE_LIMIT = os.getenv("AUTH_RATE_LIMIT", "20 per minute")
    RATELIMIT_STORAGE_URI = os.getenv("RATELIMIT_STORAGE_URI", "memory://")
    RATELIMIT_HEADERS_ENABLED = True

    MATCH_MAX_RESULTS = 10
    ML_ARTIFACT_DIR = os.path.join(BASE_DIR, "ml", "artifacts")

    # flask-smorest / OpenAPI
    API_TITLE = "FuelGo API"
    API_VERSION = "v1"
    OPENAPI_VERSION = "3.0.3"
    OPENAPI_URL_PREFIX = "/api"
    OPENAPI_JSON_PATH = "openapi.json"
    OPENAPI_SWAGGER_UI_PATH = "/docs"
    OPENAPI_SWAGGER_UI_URL = "https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/"
    API_SPEC_OPTIONS = {
        "components": {"securitySchemes": {
            "bearerAuth": {"type": "http", "scheme": "bearer", "bearerFormat": "JWT"}}},
        "security": [{"bearerAuth": []}],
    }

    @classmethod
    def init(cls):
        cls.SECRET_KEY = _secret("SECRET_KEY")
        cls.JWT_SECRET_KEY = _secret("JWT_SECRET_KEY")
        cls.SQLALCHEMY_DATABASE_URI = _database_url()


class DevelopmentConfig(Config):
    DEBUG = True


class ProductionConfig(Config):
    DEBUG = False
    SIMULATOR_ENABLED = os.getenv("SIMULATOR_ENABLED", "0") == "1"


class TestingConfig(Config):
    TESTING = True
    SIMULATOR_STEP_SECONDS = 0
    BCRYPT_ROUNDS = 4
    RATELIMIT_ENABLED = False

    @classmethod
    def init(cls):
        cls.SECRET_KEY = "test-secret-key-0123456789abcdef0123456789"
        cls.JWT_SECRET_KEY = "test-jwt-secret-0123456789abcdef0123456789"
        cls.SQLALCHEMY_DATABASE_URI = "sqlite://"
        cls.SQLALCHEMY_ENGINE_OPTIONS = {}


CONFIGS = {
    "development": DevelopmentConfig,
    "production": ProductionConfig,
    "testing": TestingConfig,
}
