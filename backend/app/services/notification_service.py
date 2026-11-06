from sqlalchemy import select, update

from ..extensions import db
from ..models import Notification
from ..utils.errors import NotFound
from ..utils.pagination import paginate
from .realtime import emit_to_user


def notify(user_id, title, message, type_="info", request_id=None, commit=True):
    """Persist an in-app notification and push it over Socket.IO."""
    n = Notification(user_id=user_id, title=title, message=message, type=type_,
                     request_id=request_id)
    db.session.add(n)
    if commit:
        db.session.commit()
    else:
        db.session.flush()
    emit_to_user(user_id, "notification", n.to_dict())
    return n


def list_notifications(user, unread_only=False):
    q = select(Notification).where(Notification.user_id == user.id)
    if unread_only:
        q = q.where(Notification.is_read.is_(False))
    data = paginate(q.order_by(Notification.created_at.desc(), Notification.id.desc()))
    data["unread_count"] = unread_count(user)
    return data


def unread_count(user):
    return db.session.scalar(
        select(db.func.count(Notification.id)).where(Notification.user_id == user.id,
                                                     Notification.is_read.is_(False)))


def mark_read(user, notification_id):
    n = db.session.get(Notification, notification_id)
    if n is None or n.user_id != user.id:
        raise NotFound("Notification")
    n.is_read = True
    db.session.commit()
    return n


def mark_all_read(user):
    db.session.execute(update(Notification).where(Notification.user_id == user.id,
                                                  Notification.is_read.is_(False))
                       .values(is_read=True))
    db.session.commit()
