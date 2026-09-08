# Design notes

The reasoning behind the bigger pieces of Harmonium, one note per topic. These were written while the work was being decided and built, so they read as working documents — rulings, dead ends, and all. If you want to know *how to use* something, the [cookbook](../../cookbook/README.md) is the place; these explain *why it is the way it is*.

The canvases that some of these notes were distilled from (`Harmonium control language V9.html`, `Harmonium identity palette V3.html`) live one folder up.

| Note | What it covers | Status |
|---|---|---|
| [control-language.md](control-language.md) | The rules every control shape follows — sliders, steppers, chips, hold-to-confirm, the button pair — and the token table behind them | Ruled, built (v0.87.0) |
| [identity-palette.md](identity-palette.md) · [identity-palette-shipped-defaults.md](identity-palette-shipped-defaults.md) | The accent palette and the brand tier: how the colors are derived and which defaults ship | Built (v0.87.0) |
| [entity-controls.md](entity-controls.md) | Adapters, variants and card groups — the design that gave every device type a proper control | Built (v0.87.0) |
| [card-group-focus.md](card-group-focus.md) | The geometry of a card group on the focus walk; the gate spec for entity-controls Phase 3 | Ruled, built (v0.87.0) |
| [device-takeover.md](device-takeover.md) | A device's page speaks the device: casts, groups, the device-page door, the controller preview. The long one — it carries every round | Built (v0.87.0) |
| [upgrade-audit.md](upgrade-audit.md) | The upgrade report: what the Studio heals on load and how it discloses it | Built v1 (v0.87.0); rebase phase parked |
| [icon-sets.md](icon-sets.md) | Icon search across everything Home Assistant has installed, and how referenced icons are banked at deploy | Built (v0.87.0) |
| [remote-fleet.md](remote-fleet.md) | Remotes announcing themselves, the command bus, Save & Deploy reaching every remote | Built (v0.87.0) |
| [layered-catalogs.md](layered-catalogs.md) | The spread model: stock, house and workspace layers, and how a config is assembled from them | Built (v0.86.0) |
| [fast-dpad.md](fast-dpad.md) | D-pad commands as full HA actions, for dialects that need it | Built (v0.86.0) |
| [ownership-buckets.md](ownership-buckets.md) | Who wins for every part of an install — stock, yours, generated. The rules layered-catalogs and the upgrade audit build on | Ruled (v0.85.7) |

Ideas that were written down but not built live in [`archive/design/`](../../../archive/design/) — tablet mode is the most recent.
