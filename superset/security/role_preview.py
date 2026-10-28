# Licensed to the Apache Software Foundation (ASF) under one
# or more contributor license agreements.  See the NOTICE file
# distributed with this work for additional information
# regarding copyright ownership.  The ASF licenses this file
# to you under the Apache License, Version 2.0 (the
# "License"); you may not use this file except in compliance
# with the License.  You may obtain a copy of the License at
#
#   http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied.  See the License for the
# specific language governing permissions and limitations
# under the License.
from __future__ import annotations

from typing import TYPE_CHECKING

from flask import current_app, g, has_request_context, jsonify, request, session
from flask_login import current_user

if TYPE_CHECKING:
    from flask import Flask, Response
    from flask_appbuilder.security.sqla.models import Role, User

SESSION_KEY = "superset_role_preview"
CONTROL_ENDPOINT = "SecurityRestApi.role_preview"
# These operations fetch data or write application telemetry, not user objects.
READ_POST_ENDPOINTS = frozenset({"ChartDataRestApi.data", "Superset.log"})
READ_PERMISSIONS = frozenset(
    {
        "menu_access",
        "can_read",
        "can_list",
        "can_show",
        "can_get",
        "can_get_list",
        "can_avatar",
        "can_recent_activity",
        "can_log",
        "can_explore",
        "can_explore_json",
        "can_dashboard",
        "can_slice",
        "can_time_range",
        "can_samples",
        "datasource_access",
        "database_access",
        "schema_access",
        "catalog_access",
        "all_datasource_access",
        "all_database_access",
    }
)


def can_preview_roles(user: User | None = None) -> bool:
    """Authorize preview controls using the authenticated user's actual roles."""
    from superset import is_feature_enabled

    if not has_request_context() or not is_feature_enabled("ENABLE_ROLE_PREVIEW"):
        return False
    user = user if user is not None else current_user
    if not user.is_authenticated or not user.is_active or not getattr(user, "id", None):
        return False
    roles = [
        *user.roles,
        *(role for group in getattr(user, "groups", []) for role in group.roles),
    ]
    return any(role.name == current_app.config["AUTH_ROLE_ADMIN"] for role in roles)


def resolve_preview_role() -> Role | None:
    """Resolve the session selection and reject stale or no-longer-admin sessions."""
    from superset import security_manager

    if not has_request_context():
        return None
    if hasattr(g, "role_preview_selection"):
        return g.role_preview_selection
    selection = session.get(SESSION_KEY)
    role = None
    if (
        isinstance(selection, dict)
        and can_preview_roles()
        and selection.get("user_id") == current_user.id
    ):
        role = security_manager.find_role(selection.get("role_name"))
        if role and role.id != selection.get("role_id"):
            role = None
    if selection and role is None:
        session.pop(SESSION_KEY, None)
    g.role_preview_selection = role
    return role


def get_preview_role() -> Role | None:
    """Return effective preview grants outside the Admin control endpoints."""
    if not has_request_context() or request.endpoint in {
        CONTROL_ENDPOINT,
        "SecurityRestApi.csrf_token",
    }:
        return None
    return resolve_preview_role()


def preview_applies_to(user_id: int | None) -> bool:
    """Limit overrides to the acting principal, not queries about other users."""
    return bool(get_preview_role() and user_id == current_user.id)


def register_role_preview(app: Flask) -> None:
    """Enforce a read-only session while allowing synchronous chart-data reads."""

    @app.before_request
    def enforce_role_preview() -> Response | None:
        """Reject mutations and disable SQL Lab for the preview session."""
        if get_preview_role() is None:
            return None
        if (
            (
                request.method not in {"GET", "HEAD", "OPTIONS"}
                and request.endpoint not in READ_POST_ENDPOINTS
            )
            or request.endpoint
            in {
                "ChartRestApi.add_favorite",
                "ChartRestApi.remove_favorite",
                "DashboardRestApi.add_favorite",
                "DashboardRestApi.remove_favorite",
            }
            or (request.endpoint or "").rsplit(".", 1)[-1]
            in {
                "thumbnail",
                "screenshot",
                "cache_screenshot",
            }
        ):
            response = jsonify(
                message="Role preview is read-only. Exit preview to make changes."
            )
            response.status_code = 403
            return response
        return None
