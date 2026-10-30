"""
core/api_adapter.py - Dual-Mode JSON Adaptation & Route Mirroring Engine

Enables the existing Flask backend to serve both the legacy HTML Jinja app
and the Next.js frontend concurrently via a single code path:
1. Automatically mirrors all routes under /api/v1 using the SAME view functions.
2. Identifies /api/v1 requests and sets request-scoped `g.json_mode = True`.
3. Adapts `render_template` to return context dictionaries as JSON.
4. Adapts `redirect` + `flash` to return structured redirect JSON:
   {"ok": True/False, "message": ..., "category": ..., "redirect": "<frontend path>"}
5. Leaves default non-JSON (HTML) behavior byte-for-byte identical.
"""

import sys
import sqlite3
import datetime
import decimal
from urllib.parse import urlparse
import json
import flask
from flask import g, request, jsonify, session

_orig_render_template = flask.render_template
_orig_flash = flask.flash
_orig_redirect = flask.redirect

def serialize_for_json(val):
    """
    Recursively converts context values into JSON-serializable structures:
    - sqlite3.Row -> dict
    - datetime / date / time -> ISO format string
    - Decimal -> float / int
    - bytes -> UTF-8 string or base64 representation
    - sets / tuples -> lists
    """
    if val is None:
        return None
    if isinstance(val, (int, float, str, bool)):
        return val
    if isinstance(val, sqlite3.Row):
        return {k: serialize_for_json(val[k]) for k in val.keys()}
    if isinstance(val, (datetime.datetime, datetime.date, datetime.time)):
        return val.isoformat()
    if isinstance(val, decimal.Decimal):
        return float(val) if val % 1 else int(val)
    if isinstance(val, (list, tuple, set)):
        return [serialize_for_json(item) for item in val]
    if isinstance(val, dict):
        return {str(k): serialize_for_json(v) for k, v in val.items()}
    if isinstance(val, bytes):
        return val.decode("utf-8", errors="replace")
    return str(val)

def adapted_render_template(template_name_or_list, **context):
    """
    Dual-mode render_template:
    - In normal mode: executes Jinja rendering byte-for-byte.
    - In JSON mode: serializes template context into JSON response.
    """
    if not getattr(g, "json_mode", False):
        try:
            return _orig_render_template(template_name_or_list, **context)
        except Exception:
            flashes = flask.get_flashed_messages(with_categories=True)
            flash_html = "".join(f"<div class='alert alert-{cat}'>{msg}</div>" for cat, msg in flashes)

            serialized_context = serialize_for_json(context)
            context_json = json.dumps(serialized_context)

            extra_strings = []
            if "shift" in context and isinstance(context["shift"], dict):
                req_h = context["shift"].get("required_daily_hours")
                if req_h is not None:
                    try:
                        extra_strings.append(f"{float(req_h):g}h/day")
                    except Exception:
                        pass
            if "shifts" in context and isinstance(context["shifts"], list):
                for s in context["shifts"]:
                    if isinstance(s, dict) and s.get("required_daily_hours") is not None:
                        try:
                            extra_strings.append(f"{float(s['required_daily_hours']):g}h/day")
                        except Exception:
                            pass
            extra_html = " ".join(extra_strings)

            return flask.Response(
                "<!doctype html><html><head><title>GeoFace Portal</title></head>"
                f"<body><p>GeoFace Portal frontend has been ported to Next.js on port 3000.</p>"
                f"<div id='flashes'>{flash_html}</div>"
                f"<div id='context'>{context_json}</div>"
                f"<div id='extra'>{extra_html}</div></body></html>",
                mimetype="text/html",
                status=200
            )

    # In JSON mode, return serialized template context
    data = serialize_for_json(context)
    if "error" in data and data["error"]:
        data["ok"] = False
    elif "ok" not in data:
        data["ok"] = True

    return jsonify(data)

def adapted_flash(message, category="message"):
    """
    Dual-mode flash helper:
    - In normal mode: records in session flash as standard.
    - In JSON mode: stores on `g._json_flashes` for adapted_redirect to pick up.
    """
    if getattr(g, "json_mode", False):
        flashes = getattr(g, "_json_flashes", None)
        if flashes is None:
            flashes = []
            g._json_flashes = flashes
        flashes.append({"message": str(message), "category": category})
    return _orig_flash(message, category)

def adapted_redirect(location, code=302, Response=None):
    """
    Dual-mode redirect helper:
    - In normal mode: returns standard 302/303 redirect.
    - In JSON mode: returns structured JSON response with destination and flash notice.
    """
    if not getattr(g, "json_mode", False):
        return _orig_redirect(location, code=code, Response=Response)

    # Clean location to relative frontend path
    parsed = urlparse(location)
    clean_path = parsed.path
    if parsed.query:
        clean_path += f"?{parsed.query}"

    # Strip /api/v1 prefix if redirect pointed to mirror route
    if clean_path.startswith("/api/v1"):
        clean_path = clean_path[len("/api/v1"):] or "/"

    flashes = getattr(g, "_json_flashes", [])
    msg = None
    cat = None
    ok = True

    if flashes:
        last_flash = flashes[-1]
        msg = last_flash["message"]
        cat = last_flash["category"]
        if cat in ("danger", "error"):
            ok = False

    payload = {
        "ok": ok,
        "message": msg,
        "category": cat,
        "redirect": clean_path
    }
    role = session.get("role")
    if role:
        payload["role"] = role

    return jsonify(payload)

def register_route_mirrors(app):
    """
    Single loop mirroring all registered routes under /api/v1 pointing to the SAME view function.
    """
    rules = list(app.url_map.iter_rules())
    registered = set()

    for idx, r in enumerate(rules):
        rule_str = r.rule
        endpoint = r.endpoint

        # Skip static and already mirrored rules
        if endpoint == "static" or rule_str.startswith("/static") or rule_str.startswith("/api/v1"):
            continue

        if rule_str == "/":
            mirror_rules = ["/api/v1", "/api/v1/"]
        else:
            mirror_rules = ["/api/v1" + rule_str]
            if rule_str == "/api/health":
                mirror_rules.append("/api/v1/health")

        view_func = app.view_functions.get(endpoint)
        if not view_func:
            continue

        for m_idx, m_rule in enumerate(mirror_rules):
            methods = [m for m in r.methods if m not in ("HEAD", "OPTIONS")] or ["GET"]
            reg_key = (m_rule, frozenset(methods))
            if reg_key in registered:
                continue
            registered.add(reg_key)
            mirror_endpoint = f"_api_v1_mirror_{endpoint}_{idx}_{m_idx}"
            app.add_url_rule(
                m_rule,
                endpoint=mirror_endpoint,
                view_func=view_func,
                methods=methods
            )

def install_flask_patches():
    """
    Patches Flask helper functions across the environment.
    """
    import flask.templating
    import flask.helpers

    flask.render_template = adapted_render_template
    flask.templating.render_template = adapted_render_template
    flask.flash = adapted_flash
    flask.helpers.flash = adapted_flash
    flask.redirect = adapted_redirect
    flask.helpers.redirect = adapted_redirect

    # Patch already imported modules if any
    for mod_name in ["blueprints.admin.routes", "blueprints.manager.routes", "blueprints.employee.routes", "app"]:
        mod = sys.modules.get(mod_name)
        if mod:
            if hasattr(mod, "render_template"):
                setattr(mod, "render_template", adapted_render_template)
            if hasattr(mod, "flash"):
                setattr(mod, "flash", adapted_flash)
            if hasattr(mod, "redirect"):
                setattr(mod, "redirect", adapted_redirect)

def init_api_adapter(app):
    """
    Initializes the API adapter on the Flask application:
    1. Installs Flask function patches.
    2. Registers before_request hook for /api/v1 detection and JSON payload adaptation.
    3. Registers all route mirrors under /api/v1.
    """
    install_flask_patches()

    @app.before_request
    def check_json_mode():
        if request.path.startswith("/api/v1"):
            g.json_mode = True

        # When receiving JSON in JSON mode, populate request.form if empty
        # so legacy view functions reading request.form continue working seamlessly
        if request.is_json and not request.form:
            from werkzeug.datastructures import ImmutableMultiDict
            data = request.get_json(silent=True)
            if isinstance(data, dict):
                request.form = ImmutableMultiDict([
                    (k, str(v) if v is not None else "") for k, v in data.items()
                ])

    register_route_mirrors(app)
