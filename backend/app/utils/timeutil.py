from datetime import datetime, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30))


def now_ist():
    return datetime.now(IST)


def to_ist(naive_utc):
    return naive_utc.replace(tzinfo=timezone.utc).astimezone(IST)
