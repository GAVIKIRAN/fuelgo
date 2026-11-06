import os
import uuid

from flask import current_app
from werkzeug.utils import secure_filename

from .errors import APIError


def save_upload(file_storage, subdir):
    """Validate and store an uploaded file; returns the path relative to UPLOAD_FOLDER."""
    if file_storage is None or not file_storage.filename:
        raise APIError("No file provided", 400)
    name = secure_filename(file_storage.filename)
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    allowed = current_app.config["ALLOWED_UPLOAD_EXTENSIONS"]
    if ext not in allowed:
        raise APIError(f"File type not allowed. Allowed: {', '.join(sorted(allowed))}", 415)
    folder = os.path.join(current_app.config["UPLOAD_FOLDER"], subdir)
    os.makedirs(folder, exist_ok=True)
    stored = f"{uuid.uuid4().hex}.{ext}"
    file_storage.save(os.path.join(folder, stored))
    return f"{subdir}/{stored}"
