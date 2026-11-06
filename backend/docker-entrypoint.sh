#!/bin/sh
set -e
# Apply migrations and seed demo data on first start (seed.py skips if data exists).
python seed.py
# One worker + many threads: required by Flask-SocketIO (threading mode, simple-websocket).
exec gunicorn --worker-class gthread -w 1 --threads 100 -b 0.0.0.0:5000 wsgi:app
