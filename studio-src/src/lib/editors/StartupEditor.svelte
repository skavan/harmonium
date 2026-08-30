<script>
  /* STARTUP & HOME (v0.85.7 — Suresh: "if the other one is workspace
     wide - why is it in the page settings and not the workspace, writ
     large at the top?"). No defense existed. These four knobs are the
     WORKSPACE's — they lived in one page's Advanced tab only because
     that's where they grew (the one-room era, when the owner page WAS
     the workspace). Now they sit under System, said once, writ large;
     Page settings keeps only what truly belongs to a page and points
     here for the rest. */
  import { app, schedulePreview } from "../state.svelte.js";
  import Field from "../components/Field.svelte";
  import Select from "../components/Select.svelte";
  import Chips from "../components/Chips.svelte";
  import EntityPicker from "../components/EntityPicker.svelte";

  const d = $derived(app.draft);
  const edit = () => schedulePreview();
  const pageName = (id) => (d?.screens?.[id]?.name || id) + " (" + id + ")";
  const pageOptions = $derived(Object.keys(d?.screens || {})
    .map((id) => ({ value: id, label: pageName(id) })));
</script>

<div class="space-y-3">
  <div>
    <h3 class="m-0 text-[14px] font-semibold text-ink">Startup &amp; Home</h3>
    <p class="m-0 mt-0.5 text-xs text-dim">workspace-wide — where remotes land,
      where Home ends, what the page keys flip through</p>
  </div>

  <div class="space-y-3 rounded-[9px] border border-line bg-glass p-3">
    <div class="grid grid-cols-2 gap-3">
      <Field label="Boot view"
        hint="where a remote lands on startup — and where the Home key begins its walk">
        <Select bind:value={d.home_screen} options={pageOptions} onchange={edit} />
      </Field>
      <Field label="Home — final stop"
        hint="pressing Home walks up each page's parent chain and ends here — your overview page">
        <Select bind:value={d.global.main_home} options={pageOptions} allowEmpty onchange={edit} />
      </Field>
    </div>
    <Field label="View paging order"
      hint="what the CH◀▶ / page keys flip through, left to right — NOT tile or activity order">
      <Chips bind:items={d.screen_order} suggestions={Object.keys(d?.screens || {})} placeholder="add view…" />
    </Field>
    <Field label="Activity state select"
      hint="The routing cache. The integration MINTS select.harmonium_<page>_activity per activity-owning page — point here at the minted one (input_select still accepted for legacy configs).">
      <EntityPicker bind:value={d.global.activity_select} domains={["select", "input_select"]} onchange={edit} />
    </Field>
    <div class="grid grid-cols-2 gap-3">
      <Field label="Remote reload — clear cache"
        hint="the Fully integration's Clear browser cache button for THIS workspace's remote — Save + Reload presses it first (empty = the legacy button.astrion1_… default)">
        <EntityPicker bind:value={d.global.fully_cache_button} domains={["button"]} onchange={edit} />
      </Field>
      <Field label="Remote reload — load Start URL"
        hint="the Fully integration's Load Start URL button — Save + Reload presses it second; wiring these is what frees you from naming the device astrion1">
        <EntityPicker bind:value={d.global.fully_reload_button} domains={["button"]} onchange={edit} />
      </Field>
    </div>
    <Field label="Page-wide buttons" hint="vol/menu logical-key bindings — edit in the Code tab">
      <div class="rounded-[8px] border border-line bg-field p-2 font-mono text-[11px] text-dim">
        {Object.keys(d?.global?.buttons || {}).join(" · ") || "none"}
      </div>
    </Field>
  </div>

  <p class="m-0 text-xs text-dim">
    Per-page navigation lives with the page: its <b>parent</b> (what the Home
    key steps up to) is on the page's Keys tab, and its <b>Room name</b>
    (title-bar prefix) is on its Advanced tab.
  </p>
</div>
