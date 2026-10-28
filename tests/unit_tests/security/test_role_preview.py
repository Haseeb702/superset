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
from secrets import token_hex
from types import SimpleNamespace
from unittest.mock import Mock, patch

import pytest
from flask import Flask, g, session

from superset.security.role_preview import (
    can_preview_roles,
    get_preview_role,
    register_role_preview,
    SESSION_KEY,
)


def make_user(admin: bool = True) -> SimpleNamespace:
    """Build an authenticated principal with explicit role assignments."""
    return SimpleNamespace(
        id=11,
        is_authenticated=True,
        is_active=True,
        roles=[SimpleNamespace(name="Admin" if admin else "Gamma")],
        groups=[],
    )


def make_app() -> Flask:
    """Create a minimal request context without touching stored user roles."""
    app = Flask(__name__)
    app.secret_key = token_hex(32)
    app.config["AUTH_ROLE_ADMIN"] = "Admin"
    return app


def seed_request(user: SimpleNamespace) -> None:
    """Provide Flask-Login's request principal and a signed preview selection."""
    g._login_user = user
    g.user = user
    session[SESSION_KEY] = {"user_id": user.id, "role_id": 7, "role_name": "Sales"}


def test_preview_replaces_admin_and_group_roles() -> None:
    """Effective roles contain only the selected role and never mutate assignments."""
    from superset import security_manager

    user = make_user()
    role = SimpleNamespace(id=7, name="Sales")
    with (
        make_app().test_request_context("/api/v1/dataset/"),
        patch("superset.is_feature_enabled", return_value=True),
        patch.object(security_manager, "find_role", return_value=role),
    ):
        seed_request(user)
        assert security_manager.get_user_roles(user) == [role]
        assert not security_manager.is_admin()
        assert not security_manager._has_view_access(user, "can_write", "Dataset")
        assert user.roles[0].name == "Admin"


def test_preview_subjects_exclude_actual_user_and_group_grants() -> None:
    """Object filters resolve only the selected role's subject."""
    from superset import security_manager
    from superset.subjects.utils import get_user_subject_ids_subquery

    with (
        make_app().test_request_context("/api/v1/dataset/"),
        patch("superset.is_feature_enabled", return_value=True),
        patch.object(
            security_manager,
            "find_role",
            return_value=SimpleNamespace(id=7, name="Sales"),
        ),
    ):
        seed_request(make_user())
        query = str(get_user_subject_ids_subquery(11))
        assert "role_id" in query
        assert "ab_user_role" not in query
        assert "ab_user_group" not in query
        # An explicit query about another user retains its actual memberships.
        assert "ab_user_role" in str(get_user_subject_ids_subquery(99))


def test_preview_cannot_survive_admin_revocation() -> None:
    """An ordinary user cannot reuse a previously authorized preview session."""
    with (
        make_app().test_request_context("/api/v1/dataset/"),
        patch("superset.is_feature_enabled", return_value=True),
    ):
        seed_request(make_user(admin=False))
        assert not can_preview_roles()
        assert get_preview_role() is None
        assert SESSION_KEY not in session


def test_preview_blocks_object_writes_and_allows_chart_reads_and_exit() -> None:
    """POST chart data is a read; mutation routes remain blocked."""
    from superset import security_manager

    app = make_app()

    @app.before_request
    def authenticate() -> None:
        """Set the authenticated test principal before preview enforcement."""
        seed_request(make_user())

    app.add_url_rule(
        "/datasets", "DatasetRestApi.post", lambda: "write", methods=["POST"]
    )
    app.add_url_rule("/data", "ChartDataRestApi.data", lambda: "data", methods=["POST"])
    app.add_url_rule(
        "/preview", "SecurityRestApi.role_preview", lambda: "exit", methods=["DELETE"]
    )
    register_role_preview(app)
    with (
        patch("superset.is_feature_enabled", return_value=True),
        patch.object(
            security_manager,
            "find_role",
            return_value=SimpleNamespace(id=7, name="Sales"),
        ),
    ):
        client = app.test_client()
        assert client.post("/datasets").status_code == 403
        assert client.post("/data").status_code == 200
        assert client.delete("/preview").status_code == 200


def test_preview_chart_cache_is_scoped_to_role() -> None:
    """Data from a preview cannot reuse an ordinary Admin cache entry."""
    from superset.common.query_context_processor import QueryContextProcessor

    processor = Mock()
    processor._qc_datasource.get_extra_cache_keys.return_value = []
    query = Mock(annotation_layers=[])
    with (
        patch(
            "superset.security.role_preview.get_preview_role",
            return_value=SimpleNamespace(id=7),
        ),
        patch(
            "superset.common.query_context_processor.security_manager.get_rls_cache_key",
            return_value=[],
        ),
    ):
        QueryContextProcessor.query_cache_key(processor, query)
    assert query.cache_key.call_args.kwargs["role_preview"] == 7


@pytest.mark.parametrize(
    ("permission", "view"),
    [
        ("can_get_list", "ExtensionsRestApi"),
        ("can_recent_activity", "Log"),
        ("can_avatar", "UserRestApi"),
        ("can_log", "Superset"),
    ],
)
def test_preview_supporting_reads_still_require_role_grants(
    permission: str, view: str
) -> None:
    """Supporting UI requests use role grants instead of unconditional denial."""
    from superset import security_manager
    from superset.security.manager import SupersetSecurityManager

    manager = security_manager
    user = make_user()
    with (
        patch("superset.security.role_preview.preview_applies_to", return_value=True),
        patch.object(
            SupersetSecurityManager.__bases__[0], "_has_view_access"
        ) as check_grants,
    ):
        for granted in (True, False):
            check_grants.return_value = granted
            assert manager._has_view_access(user, permission, view) is granted


def test_preview_recent_activity_does_not_query_admin_history() -> None:
    """An empty role history must not expose the authenticated Admin's activity."""
    from superset.daos.log import LogDAO

    with (
        patch("superset.security.role_preview.get_preview_role", return_value=Mock()),
        patch("superset.daos.log.get_user_id") as get_user_id,
    ):
        assert LogDAO.get_recent_activity([], False, 0, 24) == []
        get_user_id.assert_not_called()
