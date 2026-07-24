"""Harmonium activity selects — the integration OWNS routing state.

One select entity per activity-owning hub (select.harmonium_<room>_activity),
options = the hub's activity ids (+ "off"). This retires the hand-made
input_select helpers: the routing cache is minted from the Harmonium
config itself. State restores across restarts.

New activity-owning hubs get their select after an integration reload
(the entity list is built from the store at setup).
"""
from __future__ import annotations

import logging

from homeassistant.components.select import SelectEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.restore_state import RestoreEntity

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    data = hass.data[DOMAIN][entry.entry_id]
    config = await data["store"].async_load() or {}
    activities = config.get("activities") or {}
    screens = config.get("screens") or {}
    main_home = (config.get("global") or {}).get("main_home")

    rooms: dict[str, list[str]] = {}
    # STICKY HOSTS (v0.26): any screen carrying the `room` marker keeps
    # its select for the life of the page — stripping activities out
    # mid-rebuild must never kill the entity (automations watch it).
    # The rooms hub (main_home) is a collection, not a host.
    for sid, scr in screens.items():
        if sid != main_home and (scr or {}).get("room"):
            rooms.setdefault(sid, [])
    for aid, act in activities.items():
        room = (act or {}).get("room_view")
        if room:
            rooms.setdefault(room, []).append(aid)

    entities = []
    for room, ids in rooms.items():
        options = ids if "off" in ids else [*ids, "off"]
        room_name = (screens.get(room) or {}).get("name") or room
        ent = HarmoniumActivitySelect(room, room_name, options)
        data["selects"][room] = ent
        entities.append(ent)
    async_add_entities(entities)
    _LOGGER.info("Harmonium minted %d activity select(s): %s",
                 len(entities), ", ".join(rooms))


class HarmoniumActivitySelect(SelectEntity, RestoreEntity):
    """The routing cache for one hub's activities — attention, not truth."""

    _attr_should_poll = False
    _attr_icon = "mdi:remote"

    def __init__(self, room: str, room_name: str, options: list[str]) -> None:
        self._attr_unique_id = f"harmonium_{room}_activity"
        self.entity_id = f"select.harmonium_{room}_activity"
        self._attr_name = f"Harmonium {room_name} Activity"
        self._attr_options = options
        self._attr_current_option = "off"

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        last = await self.async_get_last_state()
        if last and last.state in self._attr_options:
            self._attr_current_option = last.state

    async def async_select_option(self, option: str) -> None:
        self._attr_current_option = option
        self.async_write_ha_state()
