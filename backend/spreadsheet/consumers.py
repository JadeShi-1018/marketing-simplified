import json
from urllib.parse import parse_qs

from asgiref.sync import sync_to_async
from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from django.contrib.auth.models import AnonymousUser
from django.core.cache import cache

from spreadsheet.services import user_has_sheet_access

PRESENCE_CACHE_TTL_SECONDS = 3600


def _presence_cache_key(sheet_id: int) -> str:
    return f"sheet_presence:{sheet_id}"


def _client_id_from_scope(scope) -> str | None:
    raw = scope.get("query_string") or b""
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8", errors="ignore")
    params = parse_qs(raw)
    values = params.get("client_id") or []
    if not values:
        return None
    cid = (values[0] or "").strip()
    return cid or None


def _optional_int_from_json(value, field_name: str):
    """Accept int or whole-number float from JSON. Reject bool."""
    if value is None:
        return None
    if isinstance(value, bool):
        raise ValueError(f"{field_name} must be an integer")
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        if not value.is_integer():
            raise ValueError(f"{field_name} must be an integer")
        return int(value)
    raise ValueError(f"{field_name} must be an integer")


class SheetConsumer(AsyncWebsocketConsumer):
    """Sheet-room WebSocket: join/leave, presence list, cursor + committed cell broadcasts.

    Cell edits are written over HTTP (CellBatchUpdateView -> CellService.batch_update_cells,
    the single write path incl. formula recalc); the service queues a cells_updated
    group broadcast on commit, which this consumer relays. LWW = DB commit order.
    """

    async def connect(self):
        self.sheet_id = int(self.scope["url_route"]["kwargs"]["sheet_id"])
        self.room_group_name = f"sheet_{self.sheet_id}"
        self.client_id = _client_id_from_scope(self.scope)
        user = self.scope.get("user")

        if not user or isinstance(user, AnonymousUser) or not user.is_authenticated:
            await self.close(code=4001)
            return

        can_access = await self._user_can_access_sheet(user.id, self.sheet_id)
        if not can_access:
            await self.close(code=4003)
            return

        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()

        await self._register_presence(
            {
                "user_id": user.id,
                "username": user.username,
                "client_id": self.client_id,
            }
        )

        snapshot = await self._list_presence()
        await self.send(
            text_data=json.dumps(
                {
                    "type": "presence_snapshot",
                    "sheet_id": self.sheet_id,
                    "users": snapshot,
                }
            )
        )

        await self.channel_layer.group_send(
            self.room_group_name,
            {
                "type": "presence.join",
                "sheet_id": self.sheet_id,
                "user_id": user.id,
                "username": user.username,
                "client_id": self.client_id,
                "channel_name": self.channel_name,
            },
        )

    async def disconnect(self, close_code):
        user = self.scope.get("user")
        if getattr(self, "room_group_name", None):
            same_identity_remains = await self._unregister_presence()
            if user and getattr(user, "is_authenticated", False) and not same_identity_remains:
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        "type": "presence.leave",
                        "sheet_id": self.sheet_id,
                        "user_id": user.id,
                        "username": user.username,
                        "client_id": getattr(self, "client_id", None),
                        "channel_name": self.channel_name,
                    },
                )
            await self.channel_layer.group_discard(self.room_group_name, self.channel_name)

    async def receive(self, text_data):
        try:
            payload = json.loads(text_data)
        except json.JSONDecodeError:
            await self.send(text_data=json.dumps({"type": "error", "message": "Invalid JSON format"}))
            return

        message_type = payload.get("type")
        if message_type == "ping":
            await self.send(text_data=json.dumps({"type": "pong"}))
            return

        if message_type == "cursor_update":
            await self._handle_cursor_update(payload)
            return

        await self.send(text_data=json.dumps({"type": "error", "message": "Unknown message type"}))

    async def _handle_cursor_update(self, payload: dict):
        try:
            row = _optional_int_from_json(payload.get("row"), "row")
            col = _optional_int_from_json(payload.get("col"), "col")
            start_row = _optional_int_from_json(payload.get("start_row"), "start_row")
            end_row = _optional_int_from_json(payload.get("end_row"), "end_row")
            start_col = _optional_int_from_json(payload.get("start_col"), "start_col")
            end_col = _optional_int_from_json(payload.get("end_col"), "end_col")
        except ValueError as exc:
            await self.send(text_data=json.dumps({"type": "error", "message": str(exc)}))
            return

        is_active = bool(payload.get("is_active", True))
        cid = payload.get("client_id")
        if isinstance(cid, str) and cid.strip():
            self.client_id = cid.strip()
            await self._register_presence(
                {
                    "user_id": self.scope["user"].id,
                    "username": self.scope["user"].username,
                    "client_id": self.client_id,
                }
            )

        await self.channel_layer.group_send(
            self.room_group_name,
            {
                "type": "cursor.updated",
                "sheet_id": self.sheet_id,
                "user_id": self.scope["user"].id,
                "username": self.scope["user"].username,
                "client_id": self.client_id,
                "row": row,
                "col": col,
                "start_row": start_row,
                "end_row": end_row,
                "start_col": start_col,
                "end_col": end_col,
                "is_active": is_active,
            },
        )

    async def presence_join(self, event):
        if event.get("channel_name") == self.channel_name:
            return
        await self.send(
            text_data=json.dumps(
                {
                    "type": "presence_join",
                    "sheet_id": event["sheet_id"],
                    "user_id": event["user_id"],
                    "username": event["username"],
                    "client_id": event.get("client_id"),
                }
            )
        )

    async def presence_leave(self, event):
        if event.get("channel_name") == self.channel_name:
            return
        await self.send(
            text_data=json.dumps(
                {
                    "type": "presence_leave",
                    "sheet_id": event["sheet_id"],
                    "user_id": event["user_id"],
                    "username": event["username"],
                    "client_id": event.get("client_id"),
                }
            )
        )

    async def cells_updated(self, event):
        """Relay a committed cell change-set to this client.

        Echo suppression is server-side: the tab that produced the edit already
        applied the authoritative cells from its HTTP response, so its own
        broadcast is dropped here (matched by client_id).
        """
        origin_client_id = event.get("origin_client_id")
        if origin_client_id and origin_client_id == getattr(self, "client_id", None):
            return
        await self.send(
            text_data=json.dumps(
                {
                    "type": "cells_updated",
                    "sheet_id": event["sheet_id"],
                    "origin_client_id": origin_client_id,
                    "origin_user_id": event.get("origin_user_id"),
                    "cells": event.get("cells") or [],
                }
            )
        )

    async def cursor_updated(self, event):
        await self.send(
            text_data=json.dumps(
                {
                    "type": "cursor_updated",
                    "sheet_id": event["sheet_id"],
                    "user_id": event["user_id"],
                    "username": event["username"],
                    "client_id": event.get("client_id"),
                    "row": event.get("row"),
                    "col": event.get("col"),
                    "start_row": event.get("start_row"),
                    "end_row": event.get("end_row"),
                    "start_col": event.get("start_col"),
                    "end_col": event.get("end_col"),
                    "is_active": event.get("is_active", True),
                }
            )
        )

    @database_sync_to_async
    def _user_can_access_sheet(self, user_id: int, sheet_id: int) -> bool:
        return user_has_sheet_access(user_id, sheet_id)

    @sync_to_async
    def _register_presence(self, info: dict) -> None:
        key = _presence_cache_key(self.sheet_id)
        data = cache.get(key) or {}
        data[self.channel_name] = info
        cache.set(key, data, PRESENCE_CACHE_TTL_SECONDS)

    @sync_to_async
    def _unregister_presence(self) -> bool:
        """Remove this channel from the presence cache.

        Returns True if another live channel for the same user+client is still
        registered (e.g. React StrictMode's double-mount reconnect), in which
        case the caller must NOT broadcast presence_leave, or the peer stores
        would drop a user whose replacement socket is already connected.
        """
        key = _presence_cache_key(self.sheet_id)
        data = cache.get(key) or {}
        info = data.pop(self.channel_name, None)
        if info is not None:
            if data:
                cache.set(key, data, PRESENCE_CACHE_TTL_SECONDS)
            else:
                cache.delete(key)
        if info is None:
            return False
        return any(
            entry.get("user_id") == info.get("user_id")
            and entry.get("client_id") == info.get("client_id")
            for entry in data.values()
        )

    @sync_to_async
    def _list_presence(self) -> list:
        key = _presence_cache_key(self.sheet_id)
        data = cache.get(key) or {}
        return list(data.values())
