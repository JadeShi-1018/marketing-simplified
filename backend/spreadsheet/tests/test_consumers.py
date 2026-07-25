import asyncio
import uuid
from contextlib import suppress

import pytest
from asgiref.sync import sync_to_async
from channels.layers import channel_layers, get_channel_layer
from channels.routing import URLRouter
from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model
from django.core.cache import cache
from rest_framework_simplejwt.tokens import AccessToken

from asset.middleware import JWTAuthMiddleware
from core.models import Organization, Project, ProjectMember
from spreadsheet.models import Sheet, Spreadsheet
from spreadsheet.routing import websocket_urlpatterns

pytestmark = pytest.mark.django_db

User = get_user_model()

TEST_CHANNEL_LAYERS = {
    "default": {"BACKEND": "channels.layers.InMemoryChannelLayer"},
}
TEST_CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "sheet-consumer-tests",
    }
}


async def _disconnect_communicators(*communicators):
    for communicator in communicators:
        if communicator is None:
            continue
        with suppress(Exception):
            await communicator.disconnect(timeout=2)
        with suppress(Exception):
            communicator.stop(exceptions=False)
    await asyncio.sleep(0)


def _reset_channel_layers():
    layer_cache = getattr(channel_layers, "_layers", None)
    if isinstance(layer_cache, dict):
        layer_cache.clear()


@pytest.fixture(autouse=True)
def sheet_ws_settings(settings):
    settings.CHANNEL_LAYERS = TEST_CHANNEL_LAYERS
    settings.CACHES = TEST_CACHES
    _reset_channel_layers()
    cache.clear()
    yield
    cache.clear()
    _reset_channel_layers()


def _uid() -> str:
    return uuid.uuid4().hex[:8]


from channels.db import database_sync_to_async


@database_sync_to_async
def _create_user_sync(username: str, email: str):
    return User.objects.create_user(username=username, email=email, password="testpass123")


@database_sync_to_async
def _create_sheet_fixture(user):
    org = Organization.objects.create(name=f"Org {_uid()}")
    project = Project.objects.create(name=f"Project {_uid()}", organization=org, owner=user)
    ProjectMember.objects.create(user=user, project=project, role="owner", is_active=True)
    spreadsheet = Spreadsheet.objects.create(project=project, name=f"Sheetbook {_uid()}")
    sheet = Sheet.objects.create(spreadsheet=spreadsheet, name="Sheet1", position=0)
    return org, project, spreadsheet, sheet


@database_sync_to_async
def _add_project_member(user, project):
    return ProjectMember.objects.create(user=user, project=project, role="member", is_active=True)


def _app():
    return JWTAuthMiddleware(URLRouter(websocket_urlpatterns))


@pytest.mark.asyncio
@pytest.mark.django_db(transaction=True)
class TestSheetConsumer:
    async def test_connect_authenticated_receives_presence_snapshot(self):
        user = await _create_user_sync(f"u_{_uid()}", f"u_{_uid()}@example.com")
        _, _, _, sheet = await _create_sheet_fixture(user)
        token = str(AccessToken.for_user(user))
        communicator = WebsocketCommunicator(
            _app(),
            f"/ws/spreadsheets/sheets/{sheet.id}/?token={token}&client_id=c1",
        )
        try:
            connected, _ = await communicator.connect()
            assert connected
            snapshot = await communicator.receive_json_from(timeout=5)
            assert snapshot["type"] == "presence_snapshot"
            assert snapshot["sheet_id"] == sheet.id
            assert any(
                u["user_id"] == user.id and u.get("client_id") == "c1"
                for u in snapshot["users"]
            )
        finally:
            await _disconnect_communicators(communicator)

    async def test_connect_unauthenticated_rejected(self):
        user = await _create_user_sync(f"u_{_uid()}", f"u_{_uid()}@example.com")
        _, _, _, sheet = await _create_sheet_fixture(user)
        communicator = WebsocketCommunicator(
            _app(),
            f"/ws/spreadsheets/sheets/{sheet.id}/",
        )
        try:
            connected, _ = await communicator.connect()
            assert not connected
        finally:
            await _disconnect_communicators(communicator)

    async def test_connect_non_member_rejected(self):
        owner = await _create_user_sync(f"owner_{_uid()}", f"owner_{_uid()}@example.com")
        outsider = await _create_user_sync(f"out_{_uid()}", f"out_{_uid()}@example.com")
        _, _, _, sheet = await _create_sheet_fixture(owner)
        token = str(AccessToken.for_user(outsider))
        communicator = WebsocketCommunicator(
            _app(),
            f"/ws/spreadsheets/sheets/{sheet.id}/?token={token}",
        )
        try:
            connected, close_code = await communicator.connect()
            assert not connected
            # JWTAuthMiddleware / consumer closes unauthorized peers with 4003.
            assert close_code in (4003, None)
        finally:
            await _disconnect_communicators(communicator)

    async def test_presence_join_visible_to_peer(self):
        user_a = await _create_user_sync(f"a_{_uid()}", f"a_{_uid()}@example.com")
        user_b = await _create_user_sync(f"b_{_uid()}", f"b_{_uid()}@example.com")
        _, project, _, sheet = await _create_sheet_fixture(user_a)
        await _add_project_member(user_b, project)

        token_a = str(AccessToken.for_user(user_a))
        token_b = str(AccessToken.for_user(user_b))
        comm_a = WebsocketCommunicator(
            _app(),
            f"/ws/spreadsheets/sheets/{sheet.id}/?token={token_a}&client_id=ca",
        )
        comm_b = WebsocketCommunicator(
            _app(),
            f"/ws/spreadsheets/sheets/{sheet.id}/?token={token_b}&client_id=cb",
        )
        try:
            connected_a, _ = await comm_a.connect()
            assert connected_a
            snap_a = await comm_a.receive_json_from(timeout=5)
            assert snap_a["type"] == "presence_snapshot"

            connected_b, _ = await comm_b.connect()
            assert connected_b
            snap_b = await comm_b.receive_json_from(timeout=5)
            assert snap_b["type"] == "presence_snapshot"
            assert any(u.get("client_id") == "ca" for u in snap_b["users"])

            join_msg = await comm_a.receive_json_from(timeout=5)
            assert join_msg["type"] == "presence_join"
            assert join_msg["user_id"] == user_b.id
            assert join_msg["client_id"] == "cb"
        finally:
            await _disconnect_communicators(comm_a, comm_b)

    async def test_presence_snapshot_prunes_abandoned_channels(self):
        user = await _create_user_sync(f"u_{_uid()}", f"u_{_uid()}@example.com")
        _, _, _, sheet = await _create_sheet_fixture(user)
        await sync_to_async(cache.set)(
            f"sheet_presence:{sheet.id}",
            {
                "stale-channel": {
                    "user_id": 999,
                    "username": "stale@example.com",
                    "client_id": "stale-client",
                    "_last_seen": 0,
                },
                "legacy-channel": {
                    "user_id": 998,
                    "username": "legacy@example.com",
                    "client_id": "legacy-client",
                },
            },
        )
        layer = get_channel_layer()
        await layer.group_add(f"sheet_{sheet.id}", "stale-channel")

        communicator = WebsocketCommunicator(
            _app(),
            f"/ws/spreadsheets/sheets/{sheet.id}/?token={AccessToken.for_user(user)}&client_id=live",
        )
        try:
            connected, _ = await communicator.connect()
            assert connected
            snapshot = await communicator.receive_json_from(timeout=5)
            assert snapshot["type"] == "presence_snapshot"
            assert [(entry["user_id"], entry["client_id"]) for entry in snapshot["users"]] == [
                (user.id, "live")
            ]
            assert all("_last_seen" not in entry for entry in snapshot["users"])
            assert "stale-channel" not in layer.groups.get(f"sheet_{sheet.id}", {})

            await communicator.send_json_to({"type": "ping"})
            pong = await communicator.receive_json_from(timeout=5)
            assert pong["type"] == "pong"
        finally:
            await _disconnect_communicators(communicator)

    async def test_stale_prune_broadcasts_authoritative_snapshot_to_peers(self):
        user_a = await _create_user_sync(f"a_{_uid()}", f"a_{_uid()}@example.com")
        user_b = await _create_user_sync(f"b_{_uid()}", f"b_{_uid()}@example.com")
        _, project, _, sheet = await _create_sheet_fixture(user_a)
        await _add_project_member(user_b, project)

        comm_a = WebsocketCommunicator(
            _app(),
            (
                f"/ws/spreadsheets/sheets/{sheet.id}/"
                f"?token={AccessToken.for_user(user_a)}&client_id=ca"
            ),
        )
        comm_b = WebsocketCommunicator(
            _app(),
            (
                f"/ws/spreadsheets/sheets/{sheet.id}/"
                f"?token={AccessToken.for_user(user_b)}&client_id=cb"
            ),
        )
        try:
            assert (await comm_a.connect(timeout=5))[0]
            await comm_a.receive_json_from(timeout=5)
            assert (await comm_b.connect(timeout=5))[0]
            await comm_b.receive_json_from(timeout=5)
            await comm_a.receive_json_from(timeout=5)  # b joins

            key = f"sheet_presence:{sheet.id}"
            data = await sync_to_async(cache.get)(key)
            data["stale-channel"] = {
                "user_id": 999,
                "username": "stale@example.com",
                "client_id": "stale-client",
                "_last_seen": 0,
            }
            await sync_to_async(cache.set)(key, data)
            await get_channel_layer().group_add(
                f"sheet_{sheet.id}",
                "stale-channel",
            )

            await comm_a.send_json_to({"type": "ping"})
            pong = await comm_a.receive_json_from(timeout=5)
            assert pong["type"] == "pong"

            snapshot = await comm_b.receive_json_from(timeout=5)
            assert snapshot["type"] == "presence_snapshot"
            assert {entry["client_id"] for entry in snapshot["users"]} == {"ca", "cb"}
            assert "stale-channel" not in get_channel_layer().groups.get(
                f"sheet_{sheet.id}",
                {},
            )
        finally:
            await _disconnect_communicators(comm_a, comm_b)

    async def test_duplicate_client_disconnect_suppresses_leave(self):
        """Closing one of two sockets sharing a user+client_id (StrictMode
        remount) must not broadcast presence_leave; closing the last one must."""
        user_a = await _create_user_sync(f"a_{_uid()}", f"a_{_uid()}@example.com")
        user_b = await _create_user_sync(f"b_{_uid()}", f"b_{_uid()}@example.com")
        _, project, _, sheet = await _create_sheet_fixture(user_a)
        await _add_project_member(user_b, project)

        token_a = str(AccessToken.for_user(user_a))
        token_b = str(AccessToken.for_user(user_b))
        url_a = f"/ws/spreadsheets/sheets/{sheet.id}/?token={token_a}&client_id=ca"
        comm_a1 = WebsocketCommunicator(_app(), url_a)
        comm_a2 = WebsocketCommunicator(_app(), url_a)
        comm_b = WebsocketCommunicator(
            _app(),
            f"/ws/spreadsheets/sheets/{sheet.id}/?token={token_b}&client_id=cb",
        )
        try:
            connected_b, _ = await comm_b.connect(timeout=5)
            assert connected_b
            await comm_b.receive_json_from(timeout=5)  # snapshot

            connected_a1, _ = await comm_a1.connect(timeout=5)
            assert connected_a1
            await comm_a1.receive_json_from(timeout=5)  # snapshot
            join1 = await comm_b.receive_json_from(timeout=5)
            assert join1["type"] == "presence_join"

            connected_a2, _ = await comm_a2.connect(timeout=5)
            assert connected_a2
            await comm_a2.receive_json_from(timeout=5)  # snapshot
            join2 = await comm_b.receive_json_from(timeout=5)
            assert join2["type"] == "presence_join"
            await comm_a1.receive_json_from(timeout=5)  # a1 sees a2's join

            # First socket closes while its twin is still connected: no leave.
            await comm_a1.disconnect(timeout=2)
            assert await comm_b.receive_nothing(timeout=0.5)

            # Last socket for that user+client closes: leave is broadcast.
            await comm_a2.disconnect(timeout=2)
            leave = await comm_b.receive_json_from(timeout=5)
            assert leave["type"] == "presence_leave"
            assert leave["user_id"] == user_a.id
            assert leave["client_id"] == "ca"
        finally:
            await _disconnect_communicators(comm_a1, comm_a2, comm_b)

    async def test_cursor_update_broadcast(self):
        user_a = await _create_user_sync(f"a_{_uid()}", f"a_{_uid()}@example.com")
        user_b = await _create_user_sync(f"b_{_uid()}", f"b_{_uid()}@example.com")
        _, project, _, sheet = await _create_sheet_fixture(user_a)
        await _add_project_member(user_b, project)

        token_a = str(AccessToken.for_user(user_a))
        token_b = str(AccessToken.for_user(user_b))
        comm_a = WebsocketCommunicator(
            _app(),
            f"/ws/spreadsheets/sheets/{sheet.id}/?token={token_a}",
        )
        comm_b = WebsocketCommunicator(
            _app(),
            f"/ws/spreadsheets/sheets/{sheet.id}/?token={token_b}",
        )
        try:
            await comm_a.connect()
            await comm_a.receive_json_from(timeout=5)
            await comm_b.connect()
            await comm_b.receive_json_from(timeout=5)
            # Drain presence_join on A
            join_msg = await comm_a.receive_json_from(timeout=5)
            assert join_msg["type"] == "presence_join"

            await comm_a.send_json_to(
                {
                    "type": "cursor_update",
                    "client_id": "client-a",
                    "row": 1,
                    "col": 2,
                    "start_row": 1,
                    "end_row": 1,
                    "start_col": 2,
                    "end_col": 2,
                    "is_active": True,
                }
            )

            # Both peers receive cursor_updated (group broadcast includes sender)
            msg_a = await comm_a.receive_json_from(timeout=5)
            msg_b = await comm_b.receive_json_from(timeout=5)
            for msg in (msg_a, msg_b):
                assert msg["type"] == "cursor_updated"
                assert msg["user_id"] == user_a.id
                assert msg["row"] == 1
                assert msg["col"] == 2
                assert msg["client_id"] == "client-a"
        finally:
            await _disconnect_communicators(comm_a, comm_b)
