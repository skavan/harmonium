"""Pairing HTTP views — the HA-facing shell around pairbook.PairBook.

Three doors (beta-gaps §1, v0.81):
  POST /api/harmonium/pair                unauth  remote opens an offer
  GET  /api/harmonium/pair/{session}      unauth  remote polls its offer
  DELETE /api/harmonium/pair/{session}    unauth  remote backs out
  GET  /api/harmonium/pair_admin          AUTH    Studio lists pending
  POST /api/harmonium/pair_admin          AUTH    Studio approves (with a
                                                  token IT minted) or denies

The integration never mints tokens itself: the Studio calls
`auth/long_lived_access_token` on its own authenticated websocket —
the documented path — and hands the result through here. Every
paired remote is therefore a NAMED token in the approving user's HA
profile, individually revocable there (instant de-authorization).
A persistent notification announces each offer so the user knows to
open the Studio even if it isn't already open.
"""
from __future__ import annotations

import logging

from aiohttp import web

from homeassistant.components import persistent_notification
from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant

from .pairbook import PairBook

_LOGGER = logging.getLogger(__name__)


def _client_ip(request: web.Request) -> str:
    try:
        return request.remote or "?"
    except Exception:  # noqa: BLE001 — rate limiting must never 500
        return "?"


class HarmoniumPairView(HomeAssistantView):
    """POST /api/harmonium/pair — an unprovisioned remote opens an offer."""

    url = "/api/harmonium/pair"
    name = "api:harmonium:pair"
    requires_auth = False

    def __init__(self, hass: HomeAssistant, book: PairBook) -> None:
        self.hass = hass
        self.book = book

    async def post(self, request: web.Request) -> web.Response:
        try:
            body = await request.json()
        except ValueError:
            body = {}
        name = str(body.get("name") or "")
        made = self.book.create(_client_ip(request), name)
        if made is None:
            return web.json_response(
                {"error": "busy — try again in a minute"}, status=429)
        persistent_notification.async_create(
            self.hass,
            (f"A Harmonium remote{' (' + name + ')' if name else ''} asks "
             f"to pair — code **{made['code']}**.\n\nOpen the Harmonium "
             "Studio, compare the code with the remote's screen, and "
             "approve or deny. The offer expires in 5 minutes."),
            title="Harmonium pairing request",
            notification_id=f"harmonium_pair_{made['session'][:8]}",
        )
        _LOGGER.info("Harmonium pairing offer %s from %s",
                     made["code"], _client_ip(request))
        return web.json_response(made,
                                 headers={"Cache-Control": "no-store"})


class HarmoniumPairPollView(HomeAssistantView):
    """GET/DELETE /api/harmonium/pair/{session} — the remote's own offer."""

    url = "/api/harmonium/pair/{session}"
    name = "api:harmonium:pair:poll"
    requires_auth = False

    def __init__(self, hass: HomeAssistant, book: PairBook) -> None:
        self.hass = hass
        self.book = book

    async def get(self, request: web.Request, session: str) -> web.Response:
        out = self.book.poll(session)
        if out["status"] in ("approved", "denied", "gone"):
            persistent_notification.async_dismiss(
                self.hass, f"harmonium_pair_{session[:8]}")
        return web.json_response(out, headers={"Cache-Control": "no-store"})

    async def delete(self, request: web.Request, session: str) -> web.Response:
        self.book.cancel(session)
        persistent_notification.async_dismiss(
            self.hass, f"harmonium_pair_{session[:8]}")
        return web.json_response({"ok": True})


class HarmoniumPairAdminView(HomeAssistantView):
    """GET/POST /api/harmonium/pair_admin — the Studio's side. AUTH."""

    url = "/api/harmonium/pair_admin"
    name = "api:harmonium:pair:admin"
    requires_auth = True

    def __init__(self, hass: HomeAssistant, book: PairBook) -> None:
        self.hass = hass
        self.book = book

    async def get(self, request: web.Request) -> web.Response:
        return web.json_response({"pending": self.book.pending()},
                                 headers={"Cache-Control": "no-store"})

    async def post(self, request: web.Request) -> web.Response:
        try:
            body = await request.json()
        except ValueError:
            return self.json_message("body is not valid JSON", status_code=400)
        sid = str(body.get("session") or "")
        if body.get("deny"):
            ok = self.book.deny(sid)
        else:
            ok = self.book.approve(sid, str(body.get("token") or ""))
        if ok:
            persistent_notification.async_dismiss(
                self.hass, f"harmonium_pair_{sid[:8]}")
            _LOGGER.info("Harmonium pairing %s %s",
                         sid[:8], "denied" if body.get("deny") else "approved")
        return web.json_response({"ok": ok},
                                 status=200 if ok else 404)


def register_pairing(hass: HomeAssistant) -> None:
    """One book, three views — called from async_setup_entry."""
    book = PairBook()
    hass.http.register_view(HarmoniumPairView(hass, book))
    hass.http.register_view(HarmoniumPairPollView(hass, book))
    hass.http.register_view(HarmoniumPairAdminView(hass, book))
