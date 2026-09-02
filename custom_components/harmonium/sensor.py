"""Harmonium music library sensors — the integration OWNS the lists.

One sensor per category (sensor.harmonium_music_<category>): the state
is the item count; the `items` attribute carries the list the remote
renders via presets_from. FAVORITES ONLY (doctrine 2026-07-24) —
fetched HA-side from Music Assistant's get_library service and
refreshed hourly. The remote stays a dumb renderer riding its normal
filtered subscription; no browse_media trees, no client-side paging.
"""
from __future__ import annotations

import logging
from datetime import timedelta

from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EVENT_HOMEASSISTANT_STARTED
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import (
    CoordinatorEntity,
    DataUpdateCoordinator,
)

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

# category → Music Assistant media_type. All five publish; the view
# decides which become sections (playlists/artists/albums by default).
CATEGORIES = {
    "playlists": "playlist",
    "artists": "artist",
    "albums": "album",
    "tracks": "track",
    "radio": "radio",
}
LIMIT = 100
SCAN = timedelta(hours=1)
SCAN_EMPTY = timedelta(minutes=5)   # fast heal while the library is empty


def _slim(item: dict) -> dict:
    """Only what the remote renders — attributes stay light."""
    return {
        "name": item.get("name"),
        "uri": item.get("uri"),
        "media_type": item.get("media_type"),
        "image": item.get("image"),
    }


async def _fetch(hass: HomeAssistant, media_type: str) -> list[dict]:
    entries = hass.config_entries.async_entries("music_assistant")
    if not entries:
        return []
    resp = await hass.services.async_call(
        "music_assistant",
        "get_library",
        {
            "config_entry_id": entries[0].entry_id,
            "media_type": media_type,
            "favorite": True,
            "limit": LIMIT,
        },
        blocking=True,
        return_response=True,
    )
    items = (resp or {}).get("items") or []
    return [_slim(x) for x in items if isinstance(x, dict)]


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    async def _update() -> dict[str, list[dict]]:
        """STARTUP-RACE PROOF (v0.35, found live 2026-07-26): after an
        HA restart the first fetch beat Music Assistant's startup, got
        zeroes, and the sensors sat empty for 15 hours. Three guards:
        a failed/empty read keeps the LAST data for that category
        (never blank a good library on a blip), the retry cadence drops
        to 5 minutes while the whole library is empty, and HA's
        fully-started event triggers an immediate re-fetch."""
        prev = coordinator.data or {}
        data: dict[str, list[dict]] = {}
        for cat, mtype in CATEGORIES.items():
            try:
                items = await _fetch(hass, mtype)
            except Exception as err:  # MA absent or still starting
                _LOGGER.debug("music %s fetch failed: %s", cat, err)
                items = []
            # never downgrade content to nothing on a failed/empty read
            data[cat] = items or prev.get(cat) or []
        have_any = any(data.values())
        coordinator.update_interval = SCAN if have_any else SCAN_EMPTY
        return data

    coordinator: DataUpdateCoordinator = DataUpdateCoordinator(
        hass,
        _LOGGER,
        name="harmonium_music",
        update_method=_update,
        update_interval=SCAN,
    )
    # tolerant first load: MA may not be up yet; the retry cadence heals
    await coordinator.async_refresh()

    # belt + braces: once HA is fully started (all integrations up),
    # re-fetch immediately — heals the boot race in seconds
    async def _on_started(_event) -> None:
        await coordinator.async_request_refresh()

    hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STARTED, _on_started)
    # THE COMMAND BUS (docs/design-remote-fleet.md): one sensor whose
    # state is a sequence number and whose attributes are the command
    # payload — remotes hear it on their existing filtered
    # subscription, so reload/identify cost no new channel. push()
    # lands in hass.data for the command view.
    bus = HarmoniumCommandBus()
    hass.data.setdefault(DOMAIN, {}).setdefault(entry.entry_id, {})["bus_push"] = bus.push
    async_add_entities(
        [bus] + [HarmoniumMusicSensor(coordinator, cat) for cat in CATEGORIES]
    )
    _LOGGER.info(
        "Harmonium music sensors up: %s",
        ", ".join(f"{c}={len((coordinator.data or {}).get(c) or [])}" for c in CATEGORIES),
    )


class HarmoniumCommandBus(SensorEntity):
    """The fleet's DOWN channel — state = seq, attributes = payload.

    Not recorded (the payload is ephemeral by design — a remote that
    was offline must NOT learn old commands from history; the engine
    additionally baselines on first sight and checks ts freshness)."""

    _attr_should_poll = False
    _attr_icon = "mdi:remote-tv"
    _attr_name = "Harmonium command bus"
    _attr_unique_id = "harmonium_command_bus"
    _attr_entity_registry_visible_default = False
    _unrecorded_attributes = frozenset({"verb", "target", "workspace", "ts"})

    def __init__(self) -> None:
        self._seq = 0
        self._payload: dict = {}

    @property
    def native_value(self) -> int:
        return self._seq

    @property
    def extra_state_attributes(self) -> dict:
        return dict(self._payload)

    def push(self, payload: dict) -> int:
        self._seq += 1
        self._payload = dict(payload, seq=self._seq)
        if self.hass:
            self.async_write_ha_state()
        return self._seq


class HarmoniumMusicSensor(CoordinatorEntity, SensorEntity):
    """One favorites category — count as state, items as attribute."""

    _attr_should_poll = False
    _attr_icon = "mdi:music-box-multiple"
    _unrecorded_attributes = frozenset({"items"})

    def __init__(self, coordinator: DataUpdateCoordinator, cat: str) -> None:
        super().__init__(coordinator)
        self._cat = cat
        self._attr_unique_id = f"harmonium_music_{cat}"
        self.entity_id = f"sensor.harmonium_music_{cat}"
        self._attr_name = f"Harmonium Music {cat.title()}"

    @property
    def native_value(self) -> int:
        return len((self.coordinator.data or {}).get(self._cat) or [])

    @property
    def extra_state_attributes(self) -> dict:
        return {"items": (self.coordinator.data or {}).get(self._cat) or []}
