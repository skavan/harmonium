"""Harmonium activity selects — the integration OWNS routing state.

One select entity per activity-owning hub PER WORKSPACE. The main
workspace keeps the legacy ids (select.harmonium_<room>_activity —
automations watch those); other workspaces get
select.harmonium_<ws>_<room>_activity. Options = the hub's activity
ids (+ "off"). State restores across restarts.

STICKY HOSTS (v0.26): any screen carrying the `room` marker keeps its
select for the life of the page. New workspaces mint their selects
IMMEDIATELY on create/save (the platform hands its add-entities
callback back to __init__); deleted workspaces retire theirs on the
next integration reload.
"""
from __future__ import annotations

import logging

from homeassistant.components.select import SelectEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.restore_state import RestoreEntity

from .const import DOMAIN
from .workspaces import MAIN, room_hosts, ws_prefix

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    data = hass.data[DOMAIN][entry.entry_id]

    async def add_for(ws: str, config) -> None:
        """Mint any selects this workspace's config calls for that
        don't exist yet. Idempotent — safe on every save."""
        config = config or {}
        screens = config.get("screens") or {}
        prefix = ws_prefix(ws)
        ws_label = "" if ws == MAIN else (ws.replace("_", " ").title() + " ")
        entities = []
        for room, ids in room_hosts(config).items():
            options = ids if "off" in ids else [*ids, "off"]
            existing = data["selects"].get((ws, room))
            if existing is not None:
                existing.update_options(options)
                continue
            room_name = (screens.get(room) or {}).get("name") or room
            ent = HarmoniumActivitySelect(prefix, ws_label, room, room_name, options)
            data["selects"][(ws, room)] = ent
            entities.append(ent)
        if entities:
            async_add_entities(entities)
            _LOGGER.info("Harmonium minted %d activity select(s) for "
                         "workspace '%s'", len(entities), ws)

    data["add_selects"] = add_for

    store_data = await data["hstore"].load()
    for ws, config in store_data["workspaces"].items():
        await add_for(ws, config)


class HarmoniumActivitySelect(SelectEntity, RestoreEntity):
    """The routing cache for one hub's activities — attention, not truth."""

    _attr_should_poll = False
    _attr_icon = "mdi:remote"

    def __init__(self, prefix: str, ws_label: str, room: str,
                 room_name: str, options: list[str]) -> None:
        self._attr_unique_id = f"harmonium_{prefix}{room}_activity"
        self.entity_id = f"select.harmonium_{prefix}{room}_activity"
        self._attr_name = f"Harmonium {ws_label}{room_name} Activity"
        self._attr_options = options
        self._attr_current_option = "off"

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        last = await self.async_get_last_state()
        if last and last.state in self._attr_options:
            self._attr_current_option = last.state

    def update_options(self, options: list[str]) -> None:
        """A saved config grew/shrank a room's activity list — refresh
        the option set without waiting for a reload."""
        if options == self._attr_options:
            return
        self._attr_options = options
        if self._attr_current_option not in options:
            self._attr_current_option = "off"
        if self.hass:
            self.async_write_ha_state()

    async def async_select_option(self, option: str) -> None:
        self._attr_current_option = option
        self.async_write_ha_state()
