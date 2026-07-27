# /// script
# requires-python = ">=3.11"
# dependencies = ["PyYAML>=6.0,<7"]
# ///
"""Compile self-contained Harmonium view YAML into runtime JSON."""

from __future__ import annotations

import argparse
import copy
import json
import re
from pathlib import Path
from typing import Any

import yaml


class ConfigLoader(yaml.SafeLoader):
    """Safe loader with Home Assistant-style local includes."""


# Use YAML 1.2 boolean spelling. PyYAML's YAML 1.1 default would turn the
# perfectly reasonable ids/keys `on` and `off` into True and False.
for first_char, resolvers in tuple(ConfigLoader.yaml_implicit_resolvers.items()):
    ConfigLoader.yaml_implicit_resolvers[first_char] = [
        resolver for resolver in resolvers
        if resolver[0] != "tag:yaml.org,2002:bool"
    ]
ConfigLoader.add_implicit_resolver(
    "tag:yaml.org,2002:bool", re.compile(r"^(?:true|false)$", re.IGNORECASE), list("tTfF")
)


def load_yaml(path: Path) -> Any:
    loader = ConfigLoader(path.read_text(encoding="utf-8"))
    loader.name = str(path)
    try:
        return loader.get_single_data()
    finally:
        loader.dispose()


def include(loader: ConfigLoader, node: yaml.Node) -> Any:
    return load_yaml((Path(loader.name).parent / loader.construct_scalar(node)).resolve())


def include_dir_named(loader: ConfigLoader, node: yaml.Node) -> dict[str, Any]:
    folder = (Path(loader.name).parent / loader.construct_scalar(node)).resolve()
    result: dict[str, Any] = {}
    for path in sorted((*folder.glob("*.yaml"), *folder.glob("*.yml"))):
        if path.stem in result:
            raise ValueError(f"duplicate included filename: {path.stem}")
        result[path.stem] = load_yaml(path)
    return result


ConfigLoader.add_constructor("!include", include)
ConfigLoader.add_constructor("!include_dir_named", include_dir_named)


def clean(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: clean(v) for k, v in value.items() if v is not None}
    if isinstance(value, list):
        return [clean(v) for v in value]
    return value


def collect_activities(views: dict[str, Any]) -> dict[str, Any]:
    activities: dict[str, Any] = {}
    for view_id, view in views.items():
        declared = view.get("activities", {})
        if isinstance(declared, list):
            continue
        for activity_id, activity in declared.items():
            if activity_id in activities:
                raise ValueError(f"activity {activity_id} is declared by more than one view")
            item = copy.deepcopy(activity)
            if "view" in item:
                item["screen"] = item.pop("view")
            item["room_view"] = view_id
            activities[activity_id] = item
    return activities


def collect_sequences(views: dict[str, Any]) -> dict[str, Any]:
    """Building blocks (ACTIONS): sequences declared per-view, room-stamped."""
    sequences: dict[str, Any] = {}
    for view_id, view in views.items():
        for seq_id, seq in (view.get("sequences") or {}).items():
            if seq_id in sequences:
                raise ValueError(f"sequence {seq_id} is declared by more than one view")
            item = copy.deepcopy(seq)
            item["room"] = view_id
            sequences[seq_id] = item
    return sequences


# NAV UNIFICATION (v0.25): group / room / plain-nav tiles are ONE type
# now — `nav` with a style. Hard migration, no engine-side aliases.
NAV_MIGRATE = {"group": "summary", "room": "image", "nav": "plain"}


def compile_tile(tile: dict[str, Any], activities: dict[str, Any]) -> dict[str, Any]:
    result = copy.deepcopy(tile)
    if result.get("type") in NAV_MIGRATE:
        result.setdefault("style", NAV_MIGRATE[result["type"]])
        result["type"] = "nav"
    if "activity" in result and "type" not in result:
        activity_id = result["activity"]
        if activity_id not in activities:
            raise ValueError(f"unknown activity reference: {activity_id}")
        activity = activities[activity_id]
        result = {
            "type": "activity",
            "activity": activity_id,
            "icon": activity.get("icon", "material:play_arrow"),
            "label": activity["name"],
            **result,
        }
    return clean(result)


def compile_view(view_id: str, view: dict[str, Any], activities: dict[str, Any]) -> dict[str, Any]:
    if view.get("id") != view_id:
        raise ValueError(f"views/{view_id}.yaml must declare id: {view_id}")

    # TAXONOMY v2: type hub|controller|library — the compiler derives
    # the engine's class/view_kind. HOSTING IS INFERRED (v0.26): a hub
    # that declares activities IS a place where things run (the sticky
    # `room` marker); explicit `room: true` still accepted (e.g. the
    # rooms hub) but no longer required.
    vtype = view["type"]
    declared = view.get("activities")
    hosts = isinstance(declared, dict) and bool(declared)
    room = bool(view.get("room")) or (vtype == "hub" and hosts)
    if vtype == "hub":
        cls = "room" if room else "group"
        view_kind = "room hub" if room else "hub"
    elif vtype == "controller":
        cls, view_kind = "activity", "controller"
    elif vtype == "library":
        cls, view_kind = "group", "library"
    else:
        raise ValueError(f"view {view_id} has unknown type: {vtype}")

    screen: dict[str, Any] = {
        "name": view["name"],
        "class": cls,
        "view_kind": view_kind,
        "type": vtype,
    }
    if room:
        screen["room"] = True
    for key in ("parent", "context", "buttons", "control_target"):
        if key in view:
            screen[key] = copy.deepcopy(view[key])

    if "header" in view:
        banner = copy.deepcopy(view["header"])
        if "overview_view" in banner:
            banner["rooms_screen"] = banner.pop("overview_view")
        screen["banner"] = banner

    if view.get("presentation") == "drawer" or vtype == "library":
        screen["drawer"] = True

    target = view.get("control_target", {})
    passed = set(target.get("pass_through", []))
    if target.get("navigation") and {"up", "down", "left", "right", "select"} <= passed:
        screen["dpad_passthrough"] = target["navigation"]

    layout = view.get("layout", {})
    if "columns" in layout:
        screen["grid"] = {"columns": layout["columns"]}
    if "tiles" in layout:
        screen["tiles"] = [compile_tile(tile, activities) for tile in layout["tiles"]]
    if "sections" in layout:
        sections = []
        for source in layout["sections"]:
            section = copy.deepcopy(source)
            if "label" in section:
                section["hero_label"] = section.pop("label")
            if "heading" in section:
                section["title"] = section.pop("heading")
            section["tiles"] = [compile_tile(tile, activities) for tile in section.get("tiles", [])]
            sections.append(section)
        screen["sections"] = sections
    return screen


# STOCK DOMAIN CONTROLLERS — the built-in detail surfaces as editable
# library entries. Tiles bind "$device" (the addressed entity); the
# engine substitutes at render. Identical to its hardcoded fallback,
# so shipping them changes nothing until a user edits.
DOMAIN_STOCKS: dict[str, dict[str, Any]] = {
    "climate": {"name": "Climate", "tiles": [
        {"id": "dp", "type": "power", "entity": "$device", "label": "", "span": 2},
        {"id": "ds", "type": "stepper", "kind": "temperature", "entity": "$device", "icon": "material:thermostat", "label": "", "span": 2},
        {"id": "dm", "type": "chips", "kind": "hvac_mode", "entity": "$device", "icon": "material:hvac", "label": "", "span": 2},
        {"id": "df", "type": "chips", "kind": "fan_mode", "entity": "$device", "icon": "material:mode_fan", "label": "", "span": 2},
        {"id": "dpr", "type": "chips", "kind": "preset", "entity": "$device", "icon": "material:tune", "label": "", "span": 2}]},
    "light": {"name": "Light", "tiles": [
        {"id": "dp", "type": "power", "entity": "$device", "label": "", "span": 2},
        {"id": "ds", "type": "stepper", "kind": "brightness", "entity": "$device", "icon": "material:light_mode", "label": "", "span": 2},
        {"id": "de", "type": "chips", "kind": "effect", "entity": "$device", "icon": "material:auto_awesome", "label": "", "span": 2}]},
    "cover": {"name": "Cover", "tiles": [
        {"id": "dc", "type": "coverbtns", "entity": "$device", "label": "", "span": 2},
        {"id": "ds", "type": "stepper", "kind": "position", "entity": "$device", "icon": "material:height", "label": "", "span": 2}]},
    "fan": {"name": "Fan", "tiles": [
        {"id": "dp", "type": "power", "entity": "$device", "label": "", "span": 2},
        {"id": "ds", "type": "stepper", "kind": "percentage", "entity": "$device", "icon": "material:mode_fan", "label": "", "span": 2},
        {"id": "dpr", "type": "chips", "kind": "preset", "entity": "$device", "icon": "material:tune", "label": "", "span": 2}]},
    "switch": {"name": "Switch", "tiles": [
        {"id": "dp", "type": "power", "entity": "$device", "label": "", "span": 2}]},
}


def compile_config(source: dict[str, Any]) -> dict[str, Any]:
    system = source["system"]
    views = source["views"]
    activities = collect_activities(views)
    sequences = collect_sequences(views)
    screens = {view_id: compile_view(view_id, view, activities) for view_id, view in views.items()}

    remotes: dict[str, Any] = {}
    for remote_id, remote in system["remotes"].items():
        item = copy.deepcopy(remote)
        keymap_name = item["keymap"]
        if keymap_name not in system["keymaps"]:
            raise ValueError(f"remote {remote_id} references unknown keymap {keymap_name}")
        item["keymap"] = system["keymaps"][keymap_name]
        remotes[remote_id] = item

    nav = system["navigation"]
    input_config = system["input"]
    start_view = views[nav["start_view"]]
    runtime = {
        "version": source["version"],
        "entity_options": system.get("entity_options", {}),
        "theme": system["theme"],
        "devices": remotes,
        "keymap": system["keymaps"]["default"],
        "home_screen": nav["start_view"],
        "screen_order": nav["view_order"],
        "global": {
            "debug": input_config.get("debug", False),
            "activity_select": start_view.get("activity_state"),
            "buttons": input_config.get("global_buttons", {}),
            "room": start_view["name"],
            "main_home": nav["overview_view"],
            "confirm_switch": input_config.get("confirm_activity_switch", True),
        },
        "input": input_config,
        "activities": activities,
        "sequences": sequences,
        "apps": source.get("apps") or {},
        "app_classes": source.get("app_classes") or {},
        "screens": screens,
    }
    # LIBRARY CONTROLLERS (phase 2 of the polish doc): a view marked
    # `library: true` compiles into config.controllers — a shared,
    # $context-bound control surface addressed as "controller:<id>".
    # All refs to a library id (activity screens, screen_order,
    # parents) are rewritten to the controller: form.
    # in views order (a SET here made controllers' key order follow the
    # process hash seed — semantically fine, but it broke byte-identical
    # builds and every hash-verification ceremony)
    lib_ids = [vid for vid, v in views.items() if v.get("library")]
    if lib_ids:
        runtime["controllers"] = {vid: runtime["screens"].pop(vid) for vid in lib_ids}
        runtime["screen_order"] = [
            "controller:" + x if x in lib_ids else x for x in runtime["screen_order"]]
        for act in runtime["activities"].values():
            if act.get("screen") in lib_ids:
                act["screen"] = "controller:" + act["screen"]
        for scr in list(runtime["screens"].values()) + list(runtime["controllers"].values()):
            if scr.get("parent") in lib_ids:
                scr["parent"] = "controller:" + scr["parent"]
    # ALL OFF DISSOLVES (v0.28): a declared "off" activity is legacy —
    # it becomes its owner view's hold-Power binding (just an Action);
    # the select's "off" option is minted regardless.
    legacy_off = runtime["activities"].pop("off", None)
    if legacy_off:
        owner = runtime["screens"].get(legacy_off.get("room_view"))
        start = legacy_off.get("start") or ""
        if owner is not None and start.startswith("sequence:"):
            owner.setdefault("buttons", {}).setdefault(
                "power_hold", {"sequence": start[len("sequence:"):]})
    # ship the stock domain controllers (unless yaml overrode one)
    runtime.setdefault("controllers", {})
    for dom, stock in DOMAIN_STOCKS.items():
        if dom not in runtime["controllers"]:
            entry = copy.deepcopy(stock)
            entry.update({"domain": dom, "class": "activity",
                          "view_kind": "controller", "type": "controller"})
            runtime["controllers"][dom] = entry
    # canonicalize hub content: every hub speaks SECTIONS with ROLES
    # (activities/presets/devices/custom); flat tile lists become a
    # role-less devices section so every hub has the same anatomy.
    for sid, screen in runtime["screens"].items():
        if screen.get("type") != "hub":
            continue
        if "sections" in screen:
            for section in screen["sections"]:
                if "role" not in section:
                    types = {t.get("type") for t in section.get("tiles", [])}
                    if types & {"activity", "activities"}:
                        section["role"] = "activities"
                    elif types & {"preset", "presets_from"}:
                        section["role"] = "presets"
                    elif types & {"apps"}:
                        section["role"] = "custom"
                    elif types and types <= {"device", "devices", "light", "switch",
                                             "climate", "cover", "fan", "media",
                                             "nav", "script", "scene", "volume",
                                             "sources"}:
                        section["role"] = "devices"
                    else:
                        section["role"] = "custom"
            for section in screen["sections"]:
                for tile in section.get("tiles", []):
                    if tile.get("type") == "activities" and "room" not in tile:
                        tile["room"] = sid
        elif "tiles" in screen:
            types = {t.get("type") for t in screen["tiles"]}
            role = "custom" if types & {"apps"} else "devices"
            screen["sections"] = [{"role": role, "tiles": screen.pop("tiles")}]
    validate(runtime, views)
    return runtime


def validate(config: dict[str, Any], views: dict[str, Any]) -> None:
    screens = config["screens"]
    controllers = config.get("controllers", {})
    # a ref is navigable if it names a screen OR a library controller
    navigable = set(screens) | {"controller:" + c for c in controllers}
    for target in (config["home_screen"], config["global"]["main_home"]):
        if target not in screens:
            raise ValueError(f"navigation references unknown view: {target}")
    unknown_order = set(config["screen_order"]) - navigable
    if unknown_order:
        raise ValueError(f"view_order contains unknown views: {sorted(unknown_order)}")
    for view_id, view in views.items():
        parent = view.get("parent")
        if parent and parent not in views:
            raise ValueError(f"view {view_id} has unknown parent {parent}")
        refs = view.get("activities", [])
        if isinstance(refs, list):
            unknown = set(refs) - config["activities"].keys()
            if unknown:
                raise ValueError(f"view {view_id} references unknown activities: {sorted(unknown)}")
    for activity_id, activity in config["activities"].items():
        if "screen" in activity and activity["screen"] not in navigable:
            raise ValueError(f"activity {activity_id} references unknown view {activity['screen']}")
        for slot in ("start", "stop"):
            ref = activity.get(slot)
            if isinstance(ref, str) and ref.startswith("sequence:"):
                if ref[9:] not in config["sequences"]:
                    raise ValueError(
                        f"activity {activity_id} {slot} references unknown sequence {ref[9:]}")
    for seq_id, seq in config["sequences"].items():
        if not isinstance(seq.get("actions"), list) or not seq["actions"]:
            raise ValueError(f"sequence {seq_id} must have a non-empty actions list")
    for view_id, screen in {**screens, **controllers}.items():
        groups = [screen.get("tiles", [])]
        groups += [section.get("tiles", []) for section in screen.get("sections", [])]
        ids = [tile.get("id") for group in groups for tile in group]
        if None in ids or len(ids) != len(set(ids)):
            raise ValueError(f"view {view_id} has missing or duplicate tile ids")
        for tile in (t for group in groups for t in group):
            if tile.get("type") == "nav" and tile.get("target") and tile["target"] not in navigable:
                raise ValueError(
                    f"view {view_id} nav tile {tile.get('id')} targets unknown view {tile['target']}")
            if tile.get("type") == "apps" and tile.get("class") \
                    and not str(tile["class"]).startswith("$context") \
                    and tile["class"] not in config.get("app_classes", {}):
                raise ValueError(
                    f"view {view_id} apps tile {tile.get('id')} names unknown class {tile['class']}")
    # APP CLASSES (v0.30): every class entry must name a master-list app
    for cid, cls in config.get("app_classes", {}).items():
        unknown = set((cls or {}).get("apps") or {}) - set(config.get("apps") or {})
        if unknown:
            raise ValueError(f"app class {cid} references unknown apps: {sorted(unknown)}")


def main() -> None:
    here = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=here / "config.yaml")
    parser.add_argument("--output", type=Path, default=here / "config.v2.json")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    compiled = compile_config(load_yaml(args.source.resolve()))
    summary = f"{len(compiled['screens'])} views, {len(compiled['activities'])} activities"
    if args.check:
        print(f"valid: {summary}")
    else:
        args.output.write_text(json.dumps(compiled, indent=2) + "\n", encoding="utf-8")
        print(f"wrote {args.output}: {summary}")


if __name__ == "__main__":
    main()
