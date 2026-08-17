# HA-side helpers

Small Home Assistant scripts/automation fragments that configs
reference by name — kept in the repo so they travel with the project
and can be pasted into any house's HA.

| File | What it is |
|---|---|
| `firetv-on.json` | Cold-start wake for the porch Samsung: if the TV reports `off`, press the wired-WOL button entity, wait, then continue. Used by the Watch Fire TV activity's start sequence. |

The v1-era reference of HA-side objects (input_select routing,
per-activity scripts) predates the integration's minted
`select.harmonium_*` entities and lives at
`archive/docs/ha-activities-v1.yaml`.
