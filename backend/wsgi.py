"""Entry point.

    flask run                 # development (Werkzeug + Socket.IO threading mode)
    python wsgi.py            # same, via socketio.run
"""
import os

from app import create_app
from app.extensions import socketio

app = create_app()

if __name__ == "__main__":
    socketio.run(app, host=os.getenv("HOST", "127.0.0.1"), port=int(os.getenv("PORT", 5000)),
                 debug=app.config.get("DEBUG", False), allow_unsafe_werkzeug=True)
