<script>
  /* Apps (v0.30) — two layers:
     MASTER LIST: identity only (name + icon/image). Could be 100 items;
       nothing here launches anything.
     DIALECTS: a platform's launch dialect — its entry per app IS
       the curation (listed = offered). Entry forms: source (select_source
       on $context.media_player) · HA action · run a named Action.
     A surface picks its dialect via the ACTIVITY's context (dialect) —
     one shared Apps drawer, many dialects. */
  import { app, schedulePreview, setStatus } from "../state.svelte.js";
  import { STOCK_DIALECTS, STOCK_APP_IDENTITIES } from "../stocklib.js";
  import { unitFp } from "../ownership.js";
  import Field from "../components/Field.svelte";
  import IconPicker from "../components/IconPicker.svelte";
  import IdentityPicker from "../components/IdentityPicker.svelte";
  import Input from "../components/Input.svelte";
  import Select from "../components/Select.svelte";
  import CardRow from "../components/CardRow.svelte";
  import SectionFold from "../components/SectionFold.svelte";
  import JsonArea from "../components/JsonArea.svelte";
  import Button from "../components/Button.svelte";

  const apps = $derived(app.draft?.apps);
  /* the buttons the engine can send, and the names it sends by default
     (mirrors DPAD_DEFAULT in src/widgets/helpers.js — keep in sync;
     tests/probe-dpad-dialect.mjs guards the pair) */
  const DPAD_KEYS = ["up", "down", "left", "right", "select",
    "back", "home", "menu", "info", "ch_up", "ch_down"];
  const DPAD_FALLBACK = {
    up: "UP", down: "DOWN", left: "LEFT", right: "RIGHT", select: "ENTER",
    back: "BACK", home: "HOME", menu: "MENU", info: "INFO",
    ch_up: "CHANNEL_UP", ch_down: "CHANNEL_DOWN",
  };
  let cmdOpen = $state({});
  const classes = $derived(app.draft?.dialects);
  const seqOptions = $derived(Object.entries(app.draft?.sequences || {})
    .map(([sid, s]) => ({ value: sid, label: s.name || sid })));
  const edit = () => schedulePreview();
  let lastAdded = $state(null);
  let masterOpen = $state(false);
  let clsOpen = $state({});
  /* v0.85.7 dialect ownership: a stock dialect matching the shipped
     shape tracks updates; one edit and it is the user's — shown here,
     with View stock (copy-paste) and Reset to stock as the doors. */
  let stockView = $state({});
  const isStockId = (cid) => !!STOCK_DIALECTS[cid];
  /* DERIVED CLASSES (v0.86 — Suresh: "clone the FireTV, edit the dpad
     stuff, call it FireTV-SE"): a non-stock class carrying
     derived_from=<stock id> stores only DELTAS server-side and keeps
     tracking the shipped parent underneath (additions flow, your
     edits win, your removals hold — the same spread, one level out).
     stockIdOf() is the one question every provenance helper asks:
     which stock entry does this class answer to? */
  const stockIdOf = (cid, c) =>
    isStockId(cid) ? cid
    : c && STOCK_DIALECTS[c.derived_from] ? c.derived_from : null;
  const dialectEdited = (cid, c) =>
    isStockId(cid) && unitFp(c) !== unitFp(STOCK_DIALECTS[cid]);
  function deriveClass(cid) {
    let nid = cid + "_custom", n = 2;
    while (classes[nid]) nid = cid + "_custom" + n++;
    const cp = JSON.parse(JSON.stringify(classes[cid]));
    cp.derived_from = cid;
    cp.name = (classes[cid].name || cid) + " — derived";
    app.draft.dialects[nid] = cp;
    clsOpen[nid] = true;
    setStatus("derived class '" + nid + "' created — stock " + cid +
      " keeps flowing underneath; only your changes stick", "ok");
    edit();
  }
  function adoptActivities(cid, parent) {
    let n = 0;
    for (const a of Object.values(app.draft.activities || {}))
      if (a.context?.dialect === parent) { a.context.dialect = cid; n++; }
    setStatus(n ? n + " activit" + (n === 1 ? "y" : "ies") +
      " repointed to " + cid
      : "no activities were speaking " + parent, n ? "ok" : "err");
    edit();
  }
  function resetDerived(cid, parent) {
    const cp = JSON.parse(JSON.stringify(STOCK_DIALECTS[parent]));
    cp.derived_from = parent;
    cp.name = classes[cid].name || cp.name;
    app.draft.dialects[cid] = cp;
    setStatus("derived class reset — it matches stock " + parent +
      " exactly again (your name kept)", "ok");
    edit();
  }
  /* stock vs yours, separated visually (v0.86 — Suresh) */
  const classGroups = $derived.by(() => {
    const stock = [], yours = [];
    for (const pair of Object.entries(classes || {}))
      (isStockId(pair[0]) ? stock : yours).push(pair);
    return [
      { key: "stock", label: "Built-in platforms",
        hint: "ship with Harmonium — untouched entries keep updating",
        items: stock },
      { key: "yours", label: "Your platforms",
        hint: "derived + your own — updates never touch your changes",
        items: yours },
    ];
  });
  let appsOpen = $state({});
  /* ACTION-VALUED D-PAD COMMANDS (v0.86 — the fast-dpad payload; a
     beta unit showed "[object Object]" here and one keystroke would
     have DESTROYED the action). An object value renders as a chip +
     JSON editor, never as a coercible string. */
  const isActionCmd = (v) => v !== null && typeof v === "object";
  const dpadSummary = (v) =>
    (v?.service || v?.action || "action") +
    (v?.data?.command ? " · " + String(v.data.command).slice(0, 44) : "");
  let dpadJson = $state({});
  function makeDpadAction(c, cid, k) {
    if (!c.dpad_commands) c.dpad_commands = {};
    c.dpad_commands[k] = { service: "androidtv.adb_command",
      entity: "$context.media_player", data: { command: "" } };
    dpadJson[cid + "|" + k] = true;
    edit();
  }
  function resetDialect(cid) {
    app.draft.dialects[cid] = JSON.parse(JSON.stringify(STOCK_DIALECTS[cid]));
    stockView[cid] = false;
    setStatus("dialect reset to stock — updates keep it current again", "ok");
    edit();
  }
  /* v0.86.0 LAYERED CATALOGS — per-ENTRY provenance. The store now
     holds only the user's deltas; this editor sees the EFFECTIVE
     config, so provenance is computed against the stocklib twin:
     equal fingerprint = stock (updates flow), different = edited
     (yours now, reset offered), no stock id = yours. A stock entry
     absent from the config is HIDDEN (a tombstone server-side) and
     restorable from the list below the entries. */
  /* sref = the stock id this class answers to (itself, or its
     derived_from parent) — so per-entry chips, resets and hidden
     built-ins work identically on stock, edited AND derived classes */
  const stockEntry = (sref, aid) =>
    ((STOCK_DIALECTS[sref] || {}).apps || {})[aid];
  const asEntry = (e) => (typeof e === "string" ? { source: e } : e);
  const entryProv = (sref, aid, e) => {
    const s = stockEntry(sref, aid);
    if (!s) return "yours";
    return unitFp(asEntry(e)) === unitFp(s) ? "stock" : "edited";
  };
  function resetEntry(cid, sref, aid) {
    classes[cid].apps[aid] = JSON.parse(JSON.stringify(stockEntry(sref, aid)));
    setStatus("entry reset to built-in — stock updates keep it current", "ok");
    edit();
  }
  const hiddenEntries = (sref, c) =>
    Object.keys((STOCK_DIALECTS[sref] || {}).apps || {})
      .filter((aid) => (c.apps || {})[aid] === undefined);
  function restoreEntry(cid, sref, aid) {
    if (!classes[cid].apps) classes[cid].apps = {};
    classes[cid].apps[aid] = JSON.parse(JSON.stringify(stockEntry(sref, aid)));
    setStatus("built-in entry restored", "ok");
    edit();
  }
  const idProv = (id, a) => {
    const s = STOCK_APP_IDENTITIES[id];
    if (!s) return "yours";
    return unitFp(a) === unitFp(s) ? "stock" : "edited";
  };
  function resetIdentity(id) {
    app.draft.apps[id] = JSON.parse(JSON.stringify(STOCK_APP_IDENTITIES[id]));
    edit();
  }
  const hiddenIdentities = () =>
    Object.keys(STOCK_APP_IDENTITIES).filter((id) => !(apps || {})[id]);
  function restoreIdentity(id) {
    app.draft.apps[id] = JSON.parse(JSON.stringify(STOCK_APP_IDENTITIES[id]));
    edit();
  }

  /* which classes carry this app — shown on the master row */
  const carriedBy = (aid) =>
    Object.entries(classes || {}).filter(([, c]) => (c.apps || {})[aid] != null)
      .map(([cid, c]) => c.name || cid);
  /* which activities speak this class */
  const spokenBy = (cid) =>
    Object.values(app.draft?.activities || {})
      .filter((a) => a.context?.dialect === cid).map((a) => a.name);

  function setAppIcon(a, v) {
    v = (v || "").trim();
    delete a.icon; delete a.image;
    if (!v) return;
    if (v.startsWith("/") || v.startsWith("http")) a.image = v;
    else a.icon = v;
  }
  function renameApp(oldId, newId) {
    newId = (newId || "").trim();
    if (!newId || newId === oldId || apps[newId]) return;
    const rebuilt = {};
    for (const [k, v] of Object.entries(apps)) rebuilt[k === oldId ? newId : k] = v;
    app.draft.apps = rebuilt;
    /* class entries + include lists follow the id */
    for (const c of Object.values(classes || {}))
      if (c.apps && oldId in c.apps) {
        const r = {};
        for (const [k, v] of Object.entries(c.apps)) r[k === oldId ? newId : k] = v;
        c.apps = r;
      }
    for (const scr of Object.values(app.draft.screens || {}))
      for (const g of [scr.tiles || [], ...(scr.sections || []).map((s) => s.tiles || [])])
        for (const t of g)
          if (Array.isArray(t.include))
            t.include = t.include.map((x) => (x === oldId ? newId : x));
    edit();
  }
  function addApp() {
    if (!app.draft.apps) app.draft.apps = {};
    let id = "new_app", n = 2;
    while (app.draft.apps[id]) id = "new_app_" + n++;
    app.draft.apps[id] = { name: "New App", icon: "material:apps" };
    lastAdded = id;
    masterOpen = true;
  }
  function delApp(id) {
    const holders = carriedBy(id);
    if (holders.length) return; /* guarded in the UI */
    delete apps[id];
    edit();
  }

  /* ---- class ops ---- */
  const entryKind = (e) =>
    typeof e === "string" ? "source"
    : e?.sequence != null ? "sequence"
    : e?.source != null ? "source" : "action";
  const entrySummary = (e) => {
    if (typeof e === "string") return e;
    if (e?.source) return e.source;
    if (e?.sequence) return "action: " + e.sequence;
    return (e?.action || e?.service || "?") + (e?.data?.command ? " · " + e.data.command : "");
  };
  function setEntryKind(c, aid, kind) {
    if (kind === "source") c.apps[aid] = { source: "" };
    else if (kind === "sequence") c.apps[aid] = { sequence: seqOptions[0]?.value || "" };
    else c.apps[aid] = { action: "", data: {} };
    edit();
  }
  function addClass() {
    if (!app.draft.dialects) app.draft.dialects = {};
    let id = "new_class", n = 2;
    while (app.draft.dialects[id]) id = "new_class_" + n++;
    app.draft.dialects[id] = { name: "New Dialect", apps: {} };
    clsOpen[id] = true;
  }
  function renameClass(oldId, newId) {
    newId = (newId || "").trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_");
    if (!newId || newId === oldId || classes[newId]) return;
    const rebuilt = {};
    for (const [k, v] of Object.entries(classes)) rebuilt[k === oldId ? newId : k] = v;
    app.draft.dialects = rebuilt;
    /* activity contexts + hard-wired tiles follow */
    for (const a of Object.values(app.draft.activities || {}))
      if (a.context?.dialect === oldId) a.context.dialect = newId;
    for (const surf of [...Object.values(app.draft.screens || {}), ...Object.values(app.draft.controllers || {})])
      for (const g of [surf.tiles || [], ...(surf.sections || []).map((s) => s.tiles || [])])
        for (const t of g) if (t.class === oldId) t.class = newId; else if (t.dialect === oldId) t.dialect = newId;
    edit();
  }
  function delClass(cid) {
    if (spokenBy(cid).length) return;
    delete classes[cid];
    edit();
  }
</script>

{#if app.draft}
  <div class="space-y-4">
    <p class="m-0 text-xs text-dim">
      The <b>master list</b> is identity only — name + icon. A <b>dialect</b> is a platform's launch dialect: which apps it offers and
      how each one launches (its entry IS the curation). An activity
      picks its dialect in Setup (<b>App class</b>), so the shared Apps
      drawer speaks Fire TV for one activity and Tizen for another.
    </p>

    <!-- DIALECTS — the working layer, so they lead; stock and yours
         are separated visually (v0.86; headers made REAL after Suresh:
         "too tiny and squished... I don't understand why the derived
         one isn't in the YOUR PLATFORMS fold" — same complaint, one
         cause: the header didn't read as a container) -->
    {#each classGroups as grp (grp.key)}
    <div class={"space-y-3 " + (grp.key === "yours" ? "mt-8" : "mt-4")}>
    <div class="flex items-baseline gap-2.5 border-b-2 border-line-strong pb-1.5">
      <span class="text-[13.5px] font-bold text-ink">{grp.label}</span>
      <span class="text-[11px] text-faint">{grp.hint}</span>
    </div>
    {#if grp.key === "yours" && !grp.items.length}
      <p class="m-0 text-xs text-dim">None yet — <b>⑂ Derive a class</b> on a
        built-in keeps stock flowing underneath while your changes win;
        <b>＋ Add device class</b> starts one from scratch.</p>
    {/if}
    {#each grp.items as [cid, c] (cid)}
      <SectionFold label={(c.name || cid) + " — device class"}
        badge={Object.keys(c.apps || {}).length + " apps" +
          (spokenBy(cid).length ? " · spoken by " + spokenBy(cid).join(", ") : " · unused")}
        bind:open={() => clsOpen[cid] ?? false, (v) => (clsOpen[cid] = v)}>
        {@const sref = stockIdOf(cid, c)}
        {#if isStockId(cid)}
          <div class="mb-3 flex flex-wrap items-center gap-3 rounded-[10px] border border-line bg-tile px-3 py-2">
            {#if dialectEdited(cid, c)}
              <span class="text-xs text-ink">✎ <b>Yours</b> — this dialect differs from the
                shipped one, so updates won't touch it. Peek at stock to copy what you
                need, or reset to track updates again.</span>
              <Button size="sm" onclick={() => (stockView[cid] = !stockView[cid])}>
                {stockView[cid] ? "Hide stock" : "View stock"}</Button>
              <Button size="sm" onclick={() => resetDialect(cid)}
                title="Replace this dialect with the shipped one — updates keep it current again">↺ Reset to stock</Button>
            {:else}
              <span class="text-xs text-dim">● <b>Stock</b> — untouched, so updates keep it
                current (new apps and command fixes arrive on their own). Edit anything and
                it becomes yours.</span>
            {/if}
            <Button size="sm" onclick={() => deriveClass(cid)}
              title={"Create a class of your own SEEDED from this one (e.g. " + cid + "-SE with sendevent d-pad). It keeps tracking stock underneath: new built-in apps still arrive; only your changes stick; your removals hold."}>⑂ Derive a class</Button>
          </div>
        {:else if sref}
          <div class="mb-3 flex flex-wrap items-center gap-3 rounded-[10px] border border-line bg-tile px-3 py-2">
            <span class="text-xs text-ink">⑂ <b>Derived from {STOCK_DIALECTS[sref].name || sref}</b> —
              stock flows underneath (new built-in apps arrive on their own);
              your changes win; apps you remove stay removed.</span>
            <Button size="sm" onclick={() => (stockView[cid] = !stockView[cid])}>
              {stockView[cid] ? "Hide parent" : "View parent"}</Button>
            <Button size="sm" onclick={() => resetDerived(cid, sref)}
              title="Drop every local change — back to an exact copy of the shipped parent (your name kept)">↺ Reset to parent</Button>
            {#if spokenBy(sref).length}
              <Button size="sm" onclick={() => adoptActivities(cid, sref)}
                title={"Point the activities still speaking '" + sref + "' (" + spokenBy(sref).join(", ") + ") at this class instead"}>→ adopt {sref}'s activities</Button>
            {/if}
          </div>
        {/if}
        {#if stockView[cid] && sref}
          <div class="mb-3">
            <Field label={"Shipped " + (STOCK_DIALECTS[sref].name || sref) + " dialect (read-only — copy what you need)"}>
              <textarea readonly rows="14" spellcheck="false"
                class="w-full rounded-[8px] border border-line bg-field px-2.5 py-1.5 font-mono text-[11.5px] text-ink outline-none"
                >{JSON.stringify(STOCK_DIALECTS[sref], null, 2)}</textarea>
            </Field>
          </div>
        {/if}
        <div class="grid grid-cols-3 gap-3">
          <Field label="Class name"><Input bind:value={c.name} onchange={edit} /></Field>
          <Field label="Dialect id" hint="what activities and devices reference (context dialect)">
            <input value={cid} spellcheck="false"
              onchange={(e) => renameClass(cid, e.target.value)}
              class="w-full rounded-[8px] border border-line bg-field px-2.5 py-1.5 font-mono text-[12.5px] text-ink outline-none focus:border-accent/60" />
          </Field>
          <div class="flex items-end pb-1">
            {#if !spokenBy(cid).length}
              <button class="cursor-pointer border-0 bg-transparent p-0 text-xs text-danger hover:underline"
                onclick={() => delClass(cid)}>delete class</button>
            {/if}
          </div>
        </div>
        <!-- WAKE (v0.83.9 — Suresh: a FireTV app launch while the box
             dozes leaves "screen remains blank or screen saver. I find
             the back button works"): fired before ANY app launch when
             the player reports off/idle/standby. "key:<id>" borrows
             this dialect's own key catalog; JSON = any HA action. -->
        <div class="grid grid-cols-3 gap-3">
          <Field label="Wake before launch"
            hint={'fires when the player is asleep — "key:back" uses this dialect\'s keys, {…} = JSON action, blank = off'}>
            <Input value={typeof c.wake === "string" ? c.wake : c.wake ? JSON.stringify(c.wake) : ""}
              placeholder="key:back" class="font-mono text-[12px]"
              onchange={(e2) => { const v = e2.target.value.trim();
                if (!v) delete c.wake;
                else if (v.startsWith("{")) { try { c.wake = JSON.parse(v); } catch { return; } }
                else c.wake = v;
                edit(); }} />
          </Field>
          <Field label="Wake → launch gap (ms)" hint="how long the screen gets to light up — blank = 600">
            <Input type="number" min="100" step="100"
              value={c.wake_delay ?? ""} placeholder="600"
              onchange={(e2) => { const n = parseInt(e2.target.value);
                if (n > 0) c.wake_delay = n; else delete c.wake_delay;
                edit(); }} />
          </Field>
        </div>
        <SectionFold label="Apps — launch entries"
          badge={Object.keys(c.apps || {}).length + " of the master list offered here"}
          bind:open={() => appsOpen[cid] ?? false, (v) => (appsOpen[cid] = v)}>
        <div class="space-y-2">
          {#each Object.entries(c.apps || {}) as [aid, e] (aid)}
            <div class="rounded-[8px] bg-inset p-2">
              <div class="flex items-center gap-2">
                <span class="w-32 shrink-0 truncate text-xs font-bold text-ink" title={aid}>
                  {apps?.[aid]?.name || aid}</span>
                {#if sref}
                  {@const prov = entryProv(sref, aid, e)}
                  {#if prov === "stock"}
                    <span class="shrink-0 rounded-[4px] bg-sunk px-1.5 py-0.5 text-[10px] text-dim"
                      title="Matches the built-in entry — stock updates keep it current">stock</span>
                  {:else if prov === "edited"}
                    <span class="shrink-0 rounded-[4px] border border-accent/40 bg-sunk px-1.5 py-0.5 text-[10px] text-accent-text"
                      title="Differs from the built-in — yours now; stock updates won't touch it">edited</span>
                    <button class="shrink-0 cursor-pointer border-0 bg-transparent p-0.5 text-[12px] text-dim hover:text-ink"
                      title="Reset to the built-in entry" onclick={() => resetEntry(cid, sref, aid)}>↺</button>
                  {/if}
                {/if}
                <Select value={entryKind(e)} class="w-32"
                  onchange={(ev) => setEntryKind(c, aid, ev.target.value)}
                  options={[
                    { value: "source", label: "Source / pkg" },
                    { value: "action", label: "HA action" },
                    { value: "sequence", label: "Run action" },
                  ]} />
                <div class="min-w-0 flex-1">
                  {#if entryKind(e) === "source"}
                    <Input value={typeof e === "string" ? e : e.source}
                      placeholder="source name or package (com.netflix.ninja)"
                      class="font-mono text-[12px]"
                      onchange={(ev) => { c.apps[aid] = { source: ev.target.value }; edit(); }} />
                  {:else if entryKind(e) === "sequence"}
                    <Select value={e.sequence} options={seqOptions}
                      onchange={(ev) => { c.apps[aid] = { sequence: ev.target.value }; edit(); }} />
                  {:else}
                    <span class="block truncate font-mono text-[11px] text-dim" title={JSON.stringify(e)}>
                      {entrySummary(e)}</span>
                  {/if}
                </div>
                <button class="shrink-0 cursor-pointer border-0 bg-transparent p-1 text-dim hover:text-danger"
                  title="Remove from this class (the app stays in the master list)"
                  onclick={() => { delete c.apps[aid]; edit(); }}>✕</button>
              </div>
              {#if entryKind(e) === "action"}
                <div class="mt-1.5">
                  <JsonArea value={e} rows={4} onchange={(v) => { c.apps[aid] = v; edit(); }} />
                </div>
              {/if}
            </div>
          {/each}
          <div class="flex items-center gap-2">
            <Select value="" allowEmpty class="w-56"
              options={Object.keys(apps || {}).filter((x) => !(c.apps || {})[x])
                .map((x) => ({ value: x, label: apps[x]?.name || x }))}
              onchange={(ev) => { if (!ev.target.value) return;
                if (!c.apps) c.apps = {};
                c.apps[ev.target.value] = { source: "" };
                ev.target.value = ""; edit(); }} />
            <span class="text-xs text-dim">← add an app from the master list</span>
          </div>
          {#if sref && hiddenEntries(sref, c).length}
            <p class="m-0 text-[11px] text-dim">Hidden built-ins —
              {#each hiddenEntries(sref, c) as aid (aid)}
                <button class="ml-1 cursor-pointer rounded-[4px] border border-line bg-transparent px-1.5 py-0.5 text-[11px] text-dim hover:text-ink"
                  title="Restore the built-in launch entry"
                  onclick={() => restoreEntry(cid, sref, aid)}>⊕ {apps?.[aid]?.name || aid}</button>
              {/each}
            </p>
          {/if}
        </div>
        </SectionFold>
        <!-- D-PAD COMMANDS (v0.84.7 — forum report: an Apple TV
             answered "command not recognized" to every press, and the
             reporter went looking for command mapping exactly here and
             found only app launching). The engine sends Android/Fire TV
             names by default (UP/ENTER/BACK); a platform that speaks
             its own vocabulary declares it ONCE here and every device
             on this dialect is fixed. Blank = the default name. -->
        <SectionFold label="D-pad commands"
          badge={Object.keys(c.dpad_commands || {}).length
            ? Object.keys(c.dpad_commands).length + " remapped"
            : "defaults (Android / Fire TV names)"}
          bind:open={() => cmdOpen[cid] ?? false, (v) => (cmdOpen[cid] = v)}>
          <p class="m-0 mb-2 text-[11px] text-dim">
            What this platform's <b>remote.send_command</b> actually accepts.
            Leave blank to send the default name. Apple TV, for instance,
            only understands lowercase pyatv names and calls
            <code class="font-mono">UP</code> unrecognised.
          </p>
          <div class="grid grid-cols-3 gap-2">
            {#each DPAD_KEYS as k (k)}
              <Field label={k}>
                {#if isActionCmd((c.dpad_commands || {})[k])}
                  <!-- action-valued (fast d-pad): a chip + JSON editor,
                       never a string field a keystroke could destroy -->
                  <div class="flex items-center gap-1">
                    <button class="min-w-0 flex-1 cursor-pointer truncate rounded-[8px] border border-accent/40 bg-sunk px-2 py-1.5 text-left font-mono text-[11px] text-accent-text"
                      title={"Action-valued command — runs a full HA action instead of remote.send_command (the fast d-pad; docs/design-fast-dpad.md). Click to edit the JSON.\n" + JSON.stringify(c.dpad_commands[k], null, 1)}
                      onclick={() => (dpadJson[cid + "|" + k] = !dpadJson[cid + "|" + k])}>⚡ {dpadSummary(c.dpad_commands[k])}</button>
                    <button class="shrink-0 cursor-pointer border-0 bg-transparent p-0.5 text-xs text-dim hover:text-danger"
                      title="Remove the action — the key falls back to the default name"
                      onclick={() => { delete c.dpad_commands[k];
                        if (!Object.keys(c.dpad_commands).length) delete c.dpad_commands;
                        edit(); }}>✕</button>
                  </div>
                  {#if dpadJson[cid + "|" + k]}
                    <div class="mt-1">
                      <JsonArea value={c.dpad_commands[k]} rows={5}
                        onchange={(v) => { c.dpad_commands[k] = v; edit(); }} />
                    </div>
                  {/if}
                {:else}
                  <div class="flex items-center gap-1">
                    <Input value={(c.dpad_commands || {})[k] ?? ""}
                      placeholder={DPAD_FALLBACK[k]} class="min-w-0 flex-1 font-mono text-[12px]"
                      onchange={(ev) => {
                        const v = ev.target.value.trim();
                        if (!c.dpad_commands) c.dpad_commands = {};
                        if (v) c.dpad_commands[k] = v; else delete c.dpad_commands[k];
                        if (!Object.keys(c.dpad_commands).length) delete c.dpad_commands;
                        edit();
                      }} />
                    <button class="shrink-0 cursor-pointer border-0 bg-transparent p-0.5 text-xs text-dim hover:text-accent-text"
                      title="Turn this key into a full HA action — e.g. androidtv.adb_command → sendevent, the fast d-pad (docs/design-fast-dpad.md)"
                      onclick={() => makeDpadAction(c, cid, k)}>⚡</button>
                  </div>
                {/if}
              </Field>
            {/each}
          </div>
        </SectionFold>
      </SectionFold>
    {/each}
    {#if grp.key === "yours"}
      <Button size="sm" onclick={addClass}>＋ Add device class</Button>
    {/if}
    </div>
    {/each}

    <!-- MASTER LIST — collapsed by default; it's a phone book -->
    <SectionFold label="Master list" badge={Object.keys(apps || {}).length + " apps — identity only"}
      bind:open={masterOpen}>
      <div class="space-y-2">
        {#each Object.entries(apps || {}) as [id, a] (id)}
          <CardRow title={a.name || id}
            subtitle={id + (carriedBy(id).length ? " · in " + carriedBy(id).join(", ") : " · in no class yet")}
            open={id === lastAdded}
            ondelete={carriedBy(id).length
              ? () => {} : () => delApp(id)}>
            <div class="grid grid-cols-4 gap-3">
              <Field label="Name"><Input bind:value={a.name} onchange={edit} /></Field>
              <Field label="App id" hint="renames refs in classes & drawers">
                <input value={id} spellcheck="false"
                  onchange={(e) => renameApp(id, e.target.value)}
                  class="w-full rounded-[8px] border border-line bg-field px-2.5 py-1.5 font-mono text-[12.5px] text-ink outline-none focus:border-accent/60" />
              </Field>
              <!-- v0.85.8: apps ship a stock logo card by key
                   (/local/harmonium/apps/<id>.webp); a path entered
                   here becomes the user's OWN logo card and wins.
                   The icon is the fallback when no logo exists. -->
              <Field label="Icon" hint="fallback icon when no logo exists · an image path (/local/…) replaces the stock logo card">
                <IconPicker value={a.image || a.icon || ""}
                  onchange={(e) => { setAppIcon(a, e.target.value); edit(); }} />
              </Field>
              <!-- V2 brand tier: the app's slot tints its glyph on
                   every launcher it appears in — no wash (apps are
                   icon-basic by design: §7, sixteen brand washes
                   cluster into one blue and one red) -->
              <Field label="Accent" hint="tints the glyph wherever this app appears">
                <IdentityPicker bind:accent={a.accent} bind:color={a.color} onchange={edit} />
              </Field>
            </div>
            {#if STOCK_APP_IDENTITIES[id] && idProv(id, a) === "edited"}
              <p class="mt-2 mb-0 text-[11px] text-dim">Differs from the built-in identity — yours now.
                <button class="ml-1 cursor-pointer border-0 bg-transparent p-0 text-[11px] text-accent-text hover:underline"
                  onclick={() => resetIdentity(id)}>↺ Reset to built-in</button></p>
            {/if}
            {#if carriedBy(id).length}
              <p class="mt-2 mb-0 text-[11px] text-dim">Delete is guarded — remove it from
                {carriedBy(id).join(", ")} first.</p>
            {/if}
          </CardRow>
        {/each}
        {#if hiddenIdentities().length}
          <p class="m-0 text-[11px] text-dim">Hidden built-ins —
            {#each hiddenIdentities() as id (id)}
              <button class="ml-1 cursor-pointer rounded-[4px] border border-line bg-transparent px-1.5 py-0.5 text-[11px] text-dim hover:text-ink"
                title="Restore the built-in app identity"
                onclick={() => restoreIdentity(id)}>⊕ {STOCK_APP_IDENTITIES[id].name}</button>
            {/each}
          </p>
        {/if}
        <Button size="sm" onclick={addApp}>＋ Add app</Button>
      </div>
    </SectionFold>
  </div>
{/if}
