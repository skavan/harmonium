# Archive

History, not live material. Nothing in here is read by any build,
test, script, or doc that ships — it is kept because it explains how
Harmonium got its shape. If you are new to the project, you want
[`README.md`](../README.md) and [`docs/`](../docs/) instead.

| What | Why it's here |
|---|---|
| `yaml/` | The pre-Studio authoring model (one YAML per view, compiled by `build_config.py` / `build.mjs` into a runtime config). Retired when the Studio became the editor and configs moved into each house's HA storage. `workspace/` holds one-off config extracts from migration days. |
| `config-v1/` | The frozen v1 runtime config — the last config that predates the v2 schema. |
| `design/` | Design history: the Studio-redesign brief and mockups (`studio-redesign/`), the external design handoff (`claude-handoff/`), the library/search design docs whose phases are long since built (`design-library-ui.md`, `design-search-sources.md`), Google-TV command research (`google-tv/`), and pasted-image scratch. |
| `docs/` | Retired docs: the pre-Studio cookbook (`cookbook-v1.md`), the authoring-UI and wizard proposals the Studio superseded, the v0.56 pairing field-test notes, an old status review, and the v1 HA-side activities reference. |
| `sessions/` | Raw development-session transcripts and dumps. Big, occasionally useful for archaeology. |
| `images/` | Source art: device-photo originals and upscales, early screenshots. The shipped skin lives at `skins/astrion.png`; docs media lives at `docs/media/`. |
| `docs/project-history.md` | The older half of `docs/PROJECT.md`'s changelog (pre-v0.80). The living document keeps the recent era. |

Rule of the house: nothing is ever deleted from a working tree —
retired material moves here with its context intact.
