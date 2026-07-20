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


def compile_tile(tile: dict[str, Any], activities: dict[str, Any]) -> dict[str, Any]:
    result = copy.deepcopy(tile)
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

    kind = view["kind"]
    class_map = {
        "overview": "room",
        "room": "room",
        "activity": "activity",
        "group": "group",
        "device": "group",
    }
    if kind not in class_map:
        raise ValueError(f"view {view_id} has unknown kind: {kind}")

    screen: dict[str, Any] = {
        "name": view["name"],
        "class": class_map[kind],
        "view_kind": kind,
    }
    for key in ("parent", "context", "buttons", "control_target"):
        if key in view:
            screen[key] = copy.deepcopy(view[key])

    if "header" in view:
        banner = copy.deepcopy(view["header"])
        if "overview_view" in banner:
            banner["rooms_screen"] = banner.pop("overview_view")
        screen["banner"] = banner

    if view.get("presentation") == "drawer":
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


def compile_config(source: dict[str, Any]) -> dict[str, Any]:
    system = source["system"]
    views = source["views"]
    activities = collect_activities(views)
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
        "screens": screens,
    }
    validate(runtime, views)
    return runtime


def validate(config: dict[str, Any], views: dict[str, Any]) -> None:
    screens = config["screens"]
    for target in (config["home_screen"], config["global"]["main_home"]):
        if target not in screens:
            raise ValueError(f"navigation references unknown view: {target}")
    unknown_order = set(config["screen_order"]) - screens.keys()
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
        if "screen" in activity and activity["screen"] not in screens:
            raise ValueError(f"activity {activity_id} references unknown view {activity['screen']}")
    for view_id, screen in screens.items():
        groups = [screen.get("tiles", [])]
        groups += [section.get("tiles", []) for section in screen.get("sections", [])]
        ids = [tile.get("id") for group in groups for tile in group]
        if None in ids or len(ids) != len(set(ids)):
            raise ValueError(f"view {view_id} has missing or duplicate tile ids")


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
