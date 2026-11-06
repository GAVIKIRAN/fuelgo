from flask import request

MAX_PER_PAGE = 100


def page_args():
    try:
        page = max(1, int(request.args.get("page", 1)))
    except ValueError:
        page = 1
    try:
        per_page = min(MAX_PER_PAGE, max(1, int(request.args.get("per_page", 20))))
    except ValueError:
        per_page = 20
    return page, per_page


def paginate(query, serializer=lambda o: o.to_dict()):
    """Paginate an SQLAlchemy select/query and return a JSON-ready dict."""
    from ..extensions import db

    page, per_page = page_args()
    result = db.paginate(query, page=page, per_page=per_page, error_out=False)
    return {
        "items": [serializer(o) for o in result.items],
        "pagination": {
            "page": result.page,
            "per_page": result.per_page,
            "total": result.total,
            "pages": result.pages,
        },
    }
