<script>
  /* One item in a page's list — the ITEM-CARD GRAMMAR (redesign R4):
     identity strip → tabs → Advanced behind glass, same shape as the
     ActivityCard. The first tab is the item's own voice — "The device"
     / "Where it goes" (doorway) / "What it does" (preset) / "What it
     shows" (generators & raw widgets). `type`, `tile id` and the raw
     JSON live in Advanced (vocabulary: they never walk the primary
     path). Styling = column span + how a doorway renders. */
  import { app, selectSlice, beginPageDraft, showUndo, tileDirty, saveSnippet, previewGoto, showsForDomain, variantOptions, VARIANT_HINTS } from "../state.svelte.js";
  import PresFields from "./PresFields.svelte";
  import Field from "./Field.svelte";
  import IconPicker from "./IconPicker.svelte";
  import Input from "./Input.svelte";
  import Select from "./Select.svelte";
  import Segmented from "./Segmented.svelte";
  import EntityPicker from "./EntityPicker.svelte";
  import ServicePicker from "./ServicePicker.svelte";
  import CardRow from "./CardRow.svelte";
  import Chips from "./Chips.svelte";
  import JsonArea from "./JsonArea.svelte";
  import PresetFields from "./PresetFields.svelte";
  import { NAV_STYLES, CONTENT_TYPES, SEARCH_CLASSES, RAW_TYPES, ENTITY_TYPES, DOM_ICON } from "./tile-lib.js";

  /* castEnts (v0.83.7 — Suresh: "Target Entity starts with the
     cast, as elsewhere"): the owning activity/page hands down its
     cast entities; the preset pickers list them first. */
  let { tile, tiles, index, ownerScreen = null, castEnts = [] } = $props();
  /* NAV CARDS (v0.25 — one type, four styles): pick an existing page
     or ＋ mint one — a full hub view with activities/presets present
     but OFF ("same anatomy, bits switched off"), entered in DRAFT
     mode: the banner's Keep/Discard owns its fate. */
  function mintNavPage() {
    const d = app.draft;
    const base = (tile.label || "page").toLowerCase()
      .replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "page";
    let sid = base, n = 2;
    while (d.screens[sid] || d.controllers?.[sid]) sid = base + "_" + n++;
    /* nav cards can live on a controller too — parent by reference */
    const parentRef = ownerScreen
      ? (d.screens[ownerScreen] ? ownerScreen : d.controllers?.[ownerScreen] ? "controller:" + ownerScreen : undefined)
      : undefined;
    d.screens[sid] = {
      name: tile.label || sid, class: "group", view_kind: "hub", type: "hub",
      parent: parentRef, sections: [],
    };
    tile.target = sid;
    beginPageDraft(sid, { ownerScreen, tileId: tile.id });
  }
  const navScreenOptions = $derived([
    ...Object.entries(app.draft?.screens || {})
      .map(([sid, s]) => ({ value: sid, label: s.name || sid })),
    /* CROSS-WORKSPACE DOORWAYS (v0.50.2 — Suresh: "a nav tile on main
       porch page that takes me to deck and vice versa"): ws:<id>
       targets leave for that workspace's canonical address */
    ...Object.entries(app.workspaces || {})
      .filter(([wid]) => wid !== app.workspace)
      .map(([wid, w]) => ({ value: "ws:" + wid,
        label: "\u21f1 " + (w.name || wid) + " (workspace)" })),
    /* v0.55: the KEY CAPTURE virtual screen \u2014 a nav tile can point at
       it while learning a new remote (also: hold \u24d8 on the title bar) */
    { value: "keys:", label: "\u2328 Key capture (diagnostic)" },
  ]);

  /* cast GENERATOR (type "devices") → Unlink bakes it into plain
     device tiles (a point-in-time copy you then own) */
  function castOf(aid) {
    const a = app.draft?.activities?.[aid];
    if (!a) return [];
    if (Array.isArray(a.devices) && a.devices.length) return a.devices;
    const seen = [];
    for (const r of ["media_player", "dpad", "power", "volume", "volume_level",
                     "source_select"]) {
      const v = a.context?.[r];
      if (typeof v === "string" && v.includes(".") && !seen.includes(v)) seen.push(v);
    }
    return seen;
  }
  function unlinkCast() {
    const baked = castOf(tile.activity)
      .filter((e) => e.split(".")[0] !== "remote") /* the Remote pad is their tile */
      .map((e, i) => ({
      type: "device",
      id: (tile.id || "cast") + "_u" + i,
      entity: e,
      label: friendlyOf(e) || e.split(".").pop(),
      icon: iconFor(e),
    }));
    tiles.splice(index, 1, ...baked);
  }

  /* ---- DEVICE tiles: a device STARTS with a name and an entity;
     type, icon, verbs and page all INFER from the entity ---- */
  const rec = (eid) => app.entities.find((e) => e.entity_id === eid);
  const friendlyOf = (eid) => rec(eid)?.name || "";
  const iconFor = (eid) => {
    const dom = (eid || "").split(".")[0];
    return DOM_ICON[dom]?.(rec(eid)) || "material:devices";
  };
  /* ONE icon field, two payloads: material:<glyph> stays `icon`; a
     path/URL becomes `icon_image` (fills the icon zone — the branded
     Fire-TV-logo look) */
  function setIcon(v) {
    v = (v || "").trim();
    delete tile.icon; delete tile.icon_image;
    if (!v) return;
    if (v.startsWith("/") || v.startsWith("http")) tile.icon_image = v;
    else tile.icon = v;
  }
  function setDeviceEntity(v) {
    const autoLabel = !tile.label || tile.label === "New tile" ||
      tile.label === "New device" || tile.label === friendlyOf(tile.entity);
    const autoIcon = !tile.icon || tile.icon === "material:devices" ||
      tile.icon === "material:lightbulb" || tile.icon === iconFor(tile.entity);
    tile.entity = v;
    if (autoLabel && friendlyOf(v)) tile.label = friendlyOf(v);
    if (autoIcon) tile.icon = iconFor(v);
  }
  /* ---- PAGE TILES CATCH UP WITH THE ⚙ (v0.79.2 — Suresh: "We did
     this great work with the settings of a device (using cog) in
     Activities. Devices is lagging in its options"): Draws as,
     Volume style and a token-aware Status line, straight onto the
     authored tile — the engine already honoured all three fields
     (type / slider / sub_text); only the Studio never offered them.
     Same intelligent filtering as the ⚙'s presShows. ---- */
  const drawsAsValue = () =>
    tile.type === "stepper"
      ? (tile.kind === "volume" ? "volume" : "other")  /* v0.83.7 —
           ONE volume entry: a volume stepper reads as Volume control
           with style Stepper (a brightness stepper hides the select) */
      /* Wave C's first spelling (a density variant on the Launcher)
         READS as the first-class control; picking any variant or
         draws-as writes the canonical fan/cover type */
      : tile.type === "device" &&
        (tile.variant === "inline" || tile.variant === "compact") &&
        /^(fan|cover)\./.test(tile.entity || "")
        ? (tile.entity || "").split(".")[0]
      : tile.type;
  const drawsAsOptions = () =>
    /* the SHARED filter (Phase 0 #3): same list as the activity ⚙ */
    showsForDomain((tile.entity || "").split(".")[0])
      .map((k) => ({ value: k.value, label: k.label }));
  /* CANONICAL WRITES (Phase 1): the Studio speaks type + variant from
     here on — the legacy working spellings (slider: true, stepper +
     kind: "volume") stay READABLE below but are never written anew;
     the engine's compat reader (core/adapters.js canonTile)
     translates canonical tiles at render. */
  function setDrawsAs(v) {
    delete tile.slider; delete tile.kind; delete tile.variant;
    tile.type = v;
  }
  /* volume shape, canonical `variant` first, then the legacy reads
     (compact = bare volume · slider = the fat one · stepper = − / +) */
  const volStyleValue = () =>
    tile.variant ??
    (tile.type === "stepper" && tile.kind === "volume" ? "stepper"
      : tile.slider ? "slider" : "");
  function setVolStyle(v) {
    delete tile.slider; delete tile.kind;
    tile.type = "volume";
    if (v) tile.variant = v; else delete tile.variant;
  }
  const showsVolStyle = () =>
    tile.type === "volume" || (tile.type === "stepper" && tile.kind === "volume");
  /* Phase 2: which adapter's variant select this row shows — the
     native adapters get theirs (labeled "Variant", blank = Auto);
     volume keeps its "Volume style" wording */
  const variantAdapter = () => {
    const t = drawsAsValue();   /* the healed reading — see above */
    return t === "number" || t === "select" || t === "sources" ||
      t === "fan" || t === "cover"
        ? t
        : showsVolStyle() ? "volume" : null;
  };
  function setVariant(v) {
    const a = variantAdapter();
    /* touching the variant HEALS the Wave C spelling in place */
    if (a === "fan" || a === "cover") tile.type = a;
    if (v) tile.variant = v; else delete tile.variant;
  }
  /* status line: text (with {tokens}) beats the widget's smart line;
     "" — the ∅ button — means NO line; absent means auto */
  const tileAttrs = () => ["state", ...(rec(tile.entity)?.attrs || [])];
  const tapHint = () => {
    const dom = (tile.entity || "").split(".")[0];
    if (dom === "media_player") return "Auto: play/pause while playing · opens its page when off";
    if (["light", "switch", "fan", "input_boolean"].includes(dom)) return "Auto: toggle";
    if (!dom) return "Auto — resolves from the entity";
    return "Auto: opens its page (no obvious verb)";
  };
  /* mirror the engine's inference: the activity claiming this entity
     as primary lends its view */
  const inferredPage = () => {
    for (const a of Object.values(app.draft?.activities || {})) {
      const c = a.context || {};
      const scr = a.screen || a.view;
      if (scr && (c.media_player === tile.entity || c.dpad === tile.entity)) return scr;
    }
    return null;
  };
  const activityIds = $derived(Object.keys(app.draft?.activities || {}));
  const screenIds = $derived(Object.keys(app.draft?.screens || {}));
  /* the spec's "Auto — controller:tv rather than an em dash": the
     inherited value is SHOWN, in the empty option itself */
  const holdOptions = $derived([
    { value: "", label: inferredPage()
        ? "Auto — " + inferredPage() + " (from its activity)"
        : "Auto — nothing (no activity claims it)" },
    ...screenIds.map((s) => ({ value: s, label: s })),
  ]);
  /* read-only cast note (§6.9): which activities cast this device,
     and wearing which roles */
  const castNote = () => {
    const out = [];
    for (const [aid, a] of Object.entries(app.draft?.activities || {})) {
      const roles = Object.entries(a.context || {})
        .filter(([, v]) => v === tile.entity).map(([k]) => k);
      const inCast = (a.devices || []).includes(tile.entity) || roles.length;
      if (inCast) out.push((a.name || aid) + (roles.length ? " (" + roles.join(", ") + ")" : ""));
    }
    return out;
  };

  /* ---- ITEM-CARD GRAMMAR (R4) ---- */
  let tab = $state("main");
  const FIRST_TAB = () =>
    tile.type === "device" ? "The device"
    : tile.type === "nav" ? "Where it goes"
    : tile.type === "preset" ? "What it does"
    : "What it shows";

  function move(dir) {
    const j = index + dir;
    if (j < 0 || j >= tiles.length) return;
    [tiles[index], tiles[j]] = [tiles[j], tiles[index]];
  }
  function duplicate() {
    const copy = JSON.parse(JSON.stringify($state.snapshot(tile)));
    /* UNIQUE, not just "_copy" (v0.85.7 — Suresh: "When we duplicate
       twice, we duplicate the ids too — which creates an error").
       Validation demands unique tile ids per screen; scan the WHOLE
       config (a tile can be moved cross-page later) and bump until
       free: tile_9na4_copy, tile_9na4_copy2, tile_9na4_copy3… */
    const d = app.draft;
    const taken = new Set();
    for (const scr of [...Object.values(d?.screens || {}), ...Object.values(d?.controllers || {})])
      for (const g of [scr.tiles || [], ...(scr.sections || []).map((s) => s.tiles || [])])
        for (const t of g) if (t && t.id) taken.add(t.id);
    const base = (copy.id || "tile") + "_copy";
    let cid = base, n = 2;
    while (taken.has(cid)) cid = base + n++;
    copy.id = cid;
    tiles.splice(index + 1, 0, copy);
  }

  /* ---- REORDER & DELETE (redesign §7.1): three ways in, one
     destructive path — and Remove gets an undo toast. ---- */
  let armed = $state(false);          /* draggable only while ⠿ is held */
  function ondragstart(e) {
    e.dataTransfer.setData("text/hakr-tile", String(index));
    e.dataTransfer.effectAllowed = "move";
  }
  function ondrop(e) {
    e.preventDefault();
    const from = +e.dataTransfer.getData("text/hakr-tile");
    if (Number.isNaN(from) || from === index) return;
    const [t] = tiles.splice(from, 1);
    tiles.splice(index, 0, t);
  }
  /* other sections on the same page this tile could move to */
  const hostSections = () => {
    const scr = app.draft?.screens?.[ownerScreen];
    if (!scr?.sections) return [];
    return scr.sections
      .filter((s) => Array.isArray(s.tiles) && s.tiles !== tiles)
      .map((s, i) => ({
        s,
        label: s.title || s.hero_label ||
          (s.role ? s.role[0].toUpperCase() + s.role.slice(1) : "Section " + (i + 1)),
      }));
  };
  function moveTo(sec) {
    const snap = JSON.parse(JSON.stringify($state.snapshot(tile)));
    tiles.splice(index, 1);
    if (!Array.isArray(sec.tiles)) sec.tiles = [];
    sec.tiles.push(snap);
  }
  function removeTile() {
    const snap = JSON.parse(JSON.stringify($state.snapshot(tile)));
    const at = index;
    tiles.splice(at, 1);
    showUndo("Removed " + (snap.label || snap.id || "tile"),
      () => tiles.splice(Math.min(at, tiles.length), 0, snap));
  }
  /* PRESETS ARE PORTABLE (v0.79.1 — Suresh: "I'd like to be able to
     export (and import) a Preset to snippets"): the whole tile minus
     its id becomes a "preset" snippet — reinserted from the ⤵ select
     beside any ＋ Add preset (page fold or activity tab), any
     workspace. `activity` rides along on purpose: a Discover Weekly
     that warm-starts its activity should keep doing so wherever it
     lands; the engine shrugs when the id doesn't exist there. */
  function snippetize() {
    const d = JSON.parse(JSON.stringify($state.snapshot(tile)));
    delete d.id;
    saveSnippet("preset", tile.label || "preset", d);
  }
  /* WHERE WOULD THIS TILE TAKE ME? (v0.79.2 — Suresh: "no easy way
     for the preview page to move along sensibly"): every row's ⋯
     menu can point the preview at the tile's own destination — a
     nav's target, a preset's landing (explicit navigate, else its
     activity's page), a device's generated page, else the page the
     row lives on. */
  const previewTarget = () => {
    if (tile.type === "nav" && tile.target) return tile.target;
    if (tile.type === "preset")
      return tile.navigate ||
        app.draft?.activities?.[tile.activity]?.screen || ownerScreen;
    if (tile.entity) return "detail:" + tile.entity;
    return ownerScreen;
  };
  const rowMenu = () => [
    ...(previewTarget()
      ? [{ label: "Preview it", action: () => previewGoto(previewTarget()) },
         { divider: true }] : []),
    { label: "Move up", action: () => move(-1) },
    { label: "Move down", action: () => move(1) },
    ...hostSections().map(({ s, label }) =>
      ({ label: "Move to " + label, action: () => moveTo(s) })),
    { divider: true },
    ...(tile.type === "preset"
      ? [{ label: "Export snippet", action: snippetize }] : []),
    { label: "Duplicate", action: duplicate },
    { label: "Remove", danger: true, action: removeTile },
  ];
</script>

<svelte:boundary>


<div role="listitem" draggable={armed}
  {ondragstart}
  ondragover={(e) => e.preventDefault()}
  {ondrop}
  ondragend={() => (armed = false)}>
<CardRow
  title={tile.label || tile.id || "(untitled)"}
  subtitle={tile.type + (tile.entity ? " · " + tile.entity : tile.activity ? " · " + tile.activity : "")}
  edited={tileDirty(tile)}
  onarm={() => (armed = true)}
  menu={rowMenu()}
  onup={() => move(-1)}
  ondown={() => move(1)}
  onduplicate={duplicate}
  ondelete={removeTile}
>
  <div class="space-y-3">
    <!-- IDENTITY STRIP (grammar): present on every tab -->
    <div class="flex flex-wrap items-end gap-3 rounded-[8px] bg-surface/60 p-1">
      <div class="min-w-[200px] flex-[2]"><Field label="Display name" hint="">
        {#if tile.type === "nav"}
          <!-- THE RENAME-COUPLING BUG (v0.85.7 — Suresh: "I duplicated
               Porch nav tile and started typing the new Display Name —
               it renamed the Porch PAGE to what I typed and re-pointed
               OPENS"). The old handler wrote the TARGET page's name on
               every keystroke, for every nav card. That follow-along
               is only right in ONE moment: while the page-draft this
               very tile just ＋-minted is still open (the page was
               born FROM this label seconds ago). Outside the draft, a
               card's display name is the card's alone — many doors
               can open one page, each wearing its own sign. -->
          <Input value={tile.label}
            title={app.pending?.kind === "page" && app.pending.tileId === tile.id &&
                app.pending.sid === tile.target
              ? "Its new page's name follows along while drafting" : ""}
            oninput={(e) => { tile.label = e.target.value;
              const p = app.pending;
              if (p?.kind === "page" && p.tileId === tile.id && p.sid === tile.target &&
                  app.draft.screens[tile.target])
                app.draft.screens[tile.target].name = e.target.value; }} />
        {:else}
          <Input bind:value={tile.label} />
        {/if}
      </Field></div>
      <div class="w-[230px] min-w-[180px] flex-1"><Field label="Icon" hint="">
        <IconPicker value={tile.icon_image || tile.icon || ""}
          placeholder="search icons — or an image path (/local/…)"
          onchange={(e) => setIcon(e.target.value)} />
      </Field></div>
      <div class="w-[150px] min-w-[120px] flex-1"><Field label="Id" hint="">
        <div class="flex h-[38px] items-center truncate rounded-[4px] bg-sunk px-[11px] font-mono text-[12px] text-dim"
          title="The tile's config key — editable under Advanced">{tile.id || "—"}</div>
      </Field></div>
    </div>

    <!-- TAB BAR (grammar): Advanced last, right-aligned, glass -->
    <div class="flex items-end gap-1 border-b border-line px-1">
      {#each [
        { k: "main", label: FIRST_TAB() },
        { k: "styling", label: "Styling" },
      ] as t (t.k)}
        <button class={"cursor-pointer border-0 bg-transparent px-2.5 py-[9px] text-xs transition-colors " +
            (tab === t.k
              ? "font-semibold text-accent-text [box-shadow:inset_0_-2px_0_var(--color-accent)]"
              : "font-medium text-dim hover:text-ink")}
          onclick={() => (tab = t.k)}>{t.label}</button>
      {/each}
      <span class="flex-1"></span>
      <button class={"cursor-pointer rounded-t-[6px] border border-b-0 border-line bg-glass px-2.5 py-[8px] text-xs " +
          (tab === "advanced" ? "font-semibold text-accent-text" : "font-medium text-dim hover:text-ink")}
        onclick={() => (tab = tab === "advanced" ? "main" : "advanced")}>
        <span class={"mr-1 inline-block h-[9px] w-[9px] rounded-[2px] border border-current align-[-1px]" + (tab === "advanced" ? " bg-current" : "")}></span>Advanced</button>
    </div>

    {#snippet presFields()}
      <!-- the ⚙-parity block (v0.79.2), shared by the device tab and
           every raw-widget row so Draws-as round-trips freely; the
           Draws-as select only shows where the type IS a draws-as
           choice (a light row's "light" is not) — Status line is for
           everyone -->
      <PresFields
        drawsAs={["device", "volume", "stepper", "power", "media", "transport", "sources", "number", "select", "fan", "cover", "switch", "lock", "press"].includes(drawsAsValue())
          ? { value: drawsAsValue(), options: drawsAsOptions(),
              set: (v) => setDrawsAs(v) }
          : null}
        variantLabel={variantAdapter() === "volume" ? "Volume style" : "Variant"}
        variant={variantAdapter() === "volume"
          ? { value: volStyleValue(),
              hint: VARIANT_HINTS[volStyleValue()] || "",
              options: variantOptions("volume", "Theme default"),
              set: (v) => setVolStyle(v) }
          : variantAdapter()
            ? { value: tile.variant ?? "",
                hint: VARIANT_HINTS[tile.variant] || "",
                options: variantOptions(variantAdapter(),
                  /^(fan|cover)$/.test(variantAdapter())
                    ? "Inline — full control" : "Auto"),
                set: (v) => setVariant(v) }
            : null}
        cardGroup={["device", "volume", "stepper", "power", "media", "transport", "sources", "number", "select", "fan", "cover", "switch", "lock", "press"].includes(drawsAsValue())
          ? { value: tile.card_group ?? "",
              warn: tile.type === "media" && tile.card_group
                ? "Now Playing has no row form — this tile renders standalone." : null,
              set: (v) => { if (v) tile.card_group = v;
                else delete tile.card_group; } }
          : null}
        sub={{
          value: typeof tile.sub_text === "string" ? tile.sub_text : "",
          placeholder: tile.sub_text === "" ? "hidden" : "auto",
          attrs: tileAttrs(),
          set: (v) => { if (v) tile.sub_text = v;
            else if (tile.sub_text !== "") delete tile.sub_text; },
          insert: (at) => (tile.sub_text =
            (typeof tile.sub_text === "string" ? tile.sub_text : "") + "{" + at + "}"),
          clear: {
            active: tile.sub_text === "",
            toggle: () => { if (tile.sub_text === "") delete tile.sub_text;
              else tile.sub_text = ""; },
          },
        }} />
    {/snippet}
    {#if tab === "main"}
      {#if tile.type === "device"}
        <!-- THE DEVICE (§6.9): entity leads; verbs follow it -->
        <div class="grid grid-cols-2 gap-3">
          <Field label="Entity" hint="icon, verbs and the page it opens all follow the entity">
            <EntityPicker value={tile.entity} onchange={(e) => setDeviceEntity(e.target.value)} />
          </Field>
          <Field label="Tap action" hint={tapHint()}>
            <Select value={tile.tap ?? ""}
              onchange={(e) => { if (e.target.value) tile.tap = e.target.value; else delete tile.tap; }}
              options={[
                { value: "", label: "Auto" },
                { value: "play_pause", label: "Play / Pause" },
                { value: "toggle", label: "Toggle power" },
                { value: "open", label: "Open its page" },
                { value: "none", label: "Nothing (readout only)" },
              ]} />
          </Field>
          <Field label="Hold action — opens" hint="hold opens a page of everything this device can do">
            <Select value={tile.target ?? ""}
              onchange={(e) => { if (e.target.value) tile.target = e.target.value; else delete tile.target; }}
              options={holdOptions} />
          </Field>
          {@render presFields()}
        </div>
        {#if tile.entity}
          <p class="m-0 text-[11px] text-dim">
            {#if castNote().length}
              Cast by {castNote().join(" · ")} — wiring lives on the activity's card.
            {:else}
              No activity casts this device — it plays solo on this page.
            {/if}
          </p>
        {/if}
      {:else if tile.type === "nav"}
        <!-- WHERE IT GOES (§6.10): the doorway's destination -->
        <div class="grid grid-cols-2 gap-3">
          <div class="flex items-end gap-2">
            <div class="min-w-0 flex-1">
              <Field label="Opens" hint={tile.target ? "" : "＋ mints a fresh page (same anatomy, bits off) and jumps in as a draft"}>
                <Select bind:value={tile.target} options={navScreenOptions} allowEmpty />
              </Field>
            </div>
            {#if tile.target && !tile.target.startsWith("ws:")}
              <button class="mb-6 shrink-0 cursor-pointer border-0 bg-transparent p-0 text-xs text-accent hover:underline"
                onclick={() => selectSlice("screens." + tile.target)}>edit page →</button>
            {:else if tile.target}
              <span class="mb-6 shrink-0 text-xs text-dim italic">opens that workspace's remote</span>
            {:else}
              <button class="mb-6 shrink-0 cursor-pointer rounded-[8px] border border-dashed border-line bg-transparent px-2 py-1 text-sm leading-[1.2] text-dim hover:border-accent/60 hover:text-accent"
                title={"Create the page “" + (tile.label || "page") + "” — a full view with activities/presets switched off"}
                onclick={mintNavPage}>＋</button>
            {/if}
          </div>
        </div>
      {:else if tile.type === "preset"}
      <PresetFields {tile} {castEnts} />
      {:else}
        <!-- WHAT IT SHOWS: generators and raw widgets keep their voice -->
        <div class="grid grid-cols-2 gap-3">
          {#if tile.type === "apps"}
            <Field label="Dialect" hint="blank = the activity's dialect ($context.dialect)">
              <Select value={tile.dialect ?? tile.class ?? ""} allowEmpty
                options={Object.entries(app.draft?.dialects || {})
                  .map(([cid, c]) => ({ value: cid, label: c.name || cid }))}
                onchange={(e) => { delete tile.class;
                  if (e.target.value) tile.dialect = e.target.value; else delete tile.dialect; }} />
            </Field>
            <div class="col-span-2">
              <Field label="Apps offered (in order)" hint="filters the dialect's list — blank = everything it offers">
                <Chips bind:items={() => tile.include ?? [], (v) => (tile.include = v)}
                  suggestions={Object.keys(app.draft?.apps || {})} placeholder="add app…" />
              </Field>
            </div>
          {:else if tile.type === "activity"}
            <Field label="Activity"><Select bind:value={tile.activity} options={activityIds} allowEmpty /></Field>
          {:else if tile.type === "devices"}
            <Field label="Cast of activity" hint="generates one device tile per cast member — always in sync with Setup">
              <Select bind:value={tile.activity} options={activityIds} allowEmpty />
            </Field>
            <div class="flex items-end pb-1.5">
              <button
                class="cursor-pointer rounded-[8px] border border-dashed border-line bg-transparent px-2.5 py-1.5 text-xs text-dim hover:border-accent/60 hover:text-accent"
                title="Replace the generator with plain device tiles (a snapshot you then own — it no longer follows the cast)"
                onclick={unlinkCast}>⛓ Unlink → baked tiles</button>
            </div>
          {:else if tile.type === "browse"}
            <!-- THE MEDIA LIBRARY (v0.66). One setting here is a
                 DECLARATION, not a control: which engine answers a
                 search. There is one option today and it still shows,
                 because otherwise the next person finds search working
                 and no idea what is behind it. -->
            <Field label="Search engine"
              hint={tile.search?.engine
                ? "the only engine today — Sonos itself cannot search streaming services"
                : "no engine = no magnifier; the library still browses"}>
              <Select value={tile.search?.engine ?? ""} allowEmpty
                options={[{ value: "music_assistant", label: "Music Assistant" }]}
                onchange={(e) => {
                  const v = e.target.value;
                  if (!v) { delete tile.search; return; }
                  tile.search = Object.assign({ classes: SEARCH_CLASSES.slice() },
                    tile.search || {}, { engine: v });
                }} />
            </Field>
            {#if tile.search?.engine}
              <Field label="Search player"
                hint="the player that SEARCHES — results still play on this activity's own player wherever the id converts">
                <EntityPicker domains={["media_player"]}
                  value={tile.search.entity ?? ""}
                  onchange={(e) => (tile.search.entity = e.target.value)} />
              </Field>
              <div class="col-span-2">
                <Field label="Result kinds" hint="what the engine is ASKED for — leaving generated playlists, audiobooks and podcasts unasked is the point">
                  <Chips bind:value={tile.search.classes}
                    suggestions={SEARCH_CLASSES} placeholder="add kind…" />
                </Field>
              </div>
              <!-- DEPTH (v0.67.3 — Suresh: "we get 18 result tiles…
                   now tap Tracks and I get 5"). HA's generic search
                   caps at five per kind and offers no dial. Music
                   Assistant's own service has one, but it is addressed
                   by CONFIG ENTRY rather than by player — so naming it
                   here is exactly what buys the deeper well. -->
              <Field label="Music Assistant entry"
                hint="Settings → Devices & Services → Music Assistant → the id in the URL. Empty = the shallow standard search, 5 per kind.">
                <input class="w-full rounded-[8px] border border-line bg-panel px-2 py-1.5 font-mono text-xs text-ink"
                  placeholder="01ABC…"
                  value={tile.search.config_entry ?? ""}
                  oninput={(e) => {
                    const v = e.target.value.trim();
                    if (v) tile.search.config_entry = v;
                    else delete tile.search.config_entry;
                  }} />
              </Field>
              <Field label="Results per kind"
                hint="needs the entry above — how deep to dig (default 25)">
                <input type="number" min="5" max="100" placeholder="25"
                  class="w-full rounded-[8px] border border-line bg-panel px-2 py-1.5 text-xs text-ink"
                  value={tile.search.limit ?? ""}
                  oninput={(e) => {
                    const v = +e.target.value;
                    if (v > 0) tile.search.limit = v;
                    else delete tile.search.limit;
                  }} />
              </Field>
            {/if}
          {:else if ENTITY_TYPES.has(tile.type)}
            <Field label="Entity"><EntityPicker bind:value={tile.entity} /></Field>
            {@render presFields()}
          {:else}
            <p class="col-span-2 m-0 text-xs text-dim">
              A {tile.type} widget — it draws itself from the page's context.
              Its knobs live under Advanced.
            </p>
          {/if}
        </div>
      {/if}
    {/if}

    {#if tab === "styling"}
      <div class="grid grid-cols-2 gap-3">
        <Field label="Card height"
          hint={'this card only — px (420) or a css length (40vh). Blank = the page\'s tile height'}>
          <Input value={tile.h ?? ""} placeholder="auto"
            class="font-mono text-[12px]"
            onchange={(e) => { const v = String(e.target.value).trim();
              if (v) tile.h = /^\d+$/.test(v) ? +v : v; else delete tile.h; }} />
        </Field>
        <Field label="Column span" hint="how many grid columns this item spans">
          <Segmented value={+(tile.span ?? 1)} options={[1, 2, 3, 4]}
            onchange={(v) => (tile.span = v)} />
        </Field>
        {#if tile.type === "nav"}
          <Field label="Style" hint="how the nav card renders — the page behind it is the same either way">
            <Select value={tile.style ?? "auto"}
              onchange={(e) => { if (e.target.value === "auto") delete tile.style; else tile.style = e.target.value; }}
              options={NAV_STYLES} />
          </Field>
          {#if (tile.style ?? "auto") === "image" || (tile.style ?? "auto") === "auto"}
            <Field label="Image" hint="path under /local/ (HA www/) — auto style shows it when set">
              <Input bind:value={tile.image} placeholder="/local/images/Porch_Render.jpg" class="font-mono text-[12.5px]" />
            </Field>
            <Field label="Image opacity"
              hint="how much photo shows over the dark card — the hero banner's knob (blank = 0.85)">
              <Input type="number" min="0" max="1" step="0.05" placeholder="0.85"
                value={tile.image_opacity ?? ""}
                onchange={(e) => { const v = e.target.value;
                  if (v === "" || v == null) delete tile.image_opacity;
                  else tile.image_opacity = Math.max(0, Math.min(1, +v)); }} />
            </Field>
            <!-- INHERIT IS THE DEFAULT (v0.85.7 — Suresh: "one option
                 (and the default) should be inherit"; also his ghost
                 position: a duplicate with no label_pos key showed
                 "bottom-left" here as if set — the select displayed
                 the engine fallback as a value. Inherit says what is
                 true: nothing set → section default → bottom-left.
                 Applies only when the card actually shows a photo. -->
            <Field label="Label position"
              hint="where the name sits on the photo — inherit = the section default, else bottom-left">
              <Select value={tile.label_pos ?? "inherit"}
                onchange={(e) => { if (e.target.value === "inherit") delete tile.label_pos; else tile.label_pos = e.target.value; }}
                options={["inherit", "top-left", "top-center", "top-right",
                  "center-left", "center", "center-right",
                  "bottom-left", "bottom-center", "bottom-right"]} />
            </Field>
          {/if}
        {:else if tile.type === "preset"}
          <!-- PHOTO PRESETS (v0.85.8 — presets as first-class
               citizens: "artwork, opacity, font stuff, just like
               devices"). An Image turns the icon square into the
               same full-bleed photo card a nav/room tile wears;
               opacity and label position are the same knobs. Blank
               image = the icon square you had. -->
          <Field label="Image" hint="path under /local/ (HA www/) — turns the tile into a full photo card; blank = icon square">
            <Input value={tile.image ?? ""} placeholder="/local/images/egofm.jpg" class="font-mono text-[12.5px]"
              onchange={(e) => { const v = e.target.value.trim();
                if (v) tile.image = v; else delete tile.image; }} />
          </Field>
          {#if tile.image}
            <Field label="Image opacity"
              hint="how much photo shows over the dark card — the hero banner's knob (blank = 0.85)">
              <Input type="number" min="0" max="1" step="0.05" placeholder="0.85"
                value={tile.image_opacity ?? ""}
                onchange={(e) => { const v = e.target.value;
                  if (v === "" || v == null) delete tile.image_opacity;
                  else tile.image_opacity = Math.max(0, Math.min(1, +v)); }} />
            </Field>
            <Field label="Label position"
              hint="where the name sits on the photo — inherit = the section default, else bottom-left">
              <Select value={tile.label_pos ?? "inherit"}
                onchange={(e) => { if (e.target.value === "inherit") delete tile.label_pos; else tile.label_pos = e.target.value; }}
                options={["inherit", "top-left", "top-center", "top-right",
                  "center-left", "center", "center-right",
                  "bottom-left", "bottom-center", "bottom-right"]} />
            </Field>
          {/if}
        {/if}
      </div>
    {/if}

    {#if tab === "advanced"}
      <div class="space-y-2 rounded-[9px] border border-line bg-glass p-3">
        <div class="grid grid-cols-2 gap-3">
          <Field label="Type" hint={tile.type === "device" ? "" : "device = the smart tile: everything infers from its entity"}>
            <select
              value={tile.type}
              onchange={(e) => (tile.type = e.target.value)}
              class="h-[38px] w-full cursor-pointer rounded-[4px] border border-line-strong bg-field px-[11px] font-[inherit] text-[13px] text-ink outline-none focus:border-accent"
            >
              <option value="device">device — auto from its entity</option>
              <option value="nav">nav card — opens another page</option>
              <optgroup label="Content generators">
                {#each CONTENT_TYPES as ty (ty)}<option value={ty}>{ty}</option>{/each}
              </optgroup>
              {#if app.advanced || RAW_TYPES.includes(tile.type)}
                <optgroup label="Raw widgets (advanced)">
                  {#each RAW_TYPES as ty (ty)}<option value={ty}>{ty}</option>{/each}
                </optgroup>
              {/if}
            </select>
          </Field>
          <Field label="Tile id"><Input bind:value={tile.id} class="font-mono text-[12.5px]" /></Field>
          {#if tile.type === "device"}
            <Field label="Show attribute" hint="blank = smart summary (state · title · brightness…)">
              <Input value={tile.attr ?? ""} placeholder="e.g. media_title" class="font-mono text-[12.5px]"
                onchange={(e) => { if (e.target.value.trim()) tile.attr = e.target.value.trim(); else delete tile.attr; }} />
            </Field>
          {/if}
        </div>
        <p class="m-0 text-[11px] text-dim">
          All fields — this tile exactly as it lives in the config. Edits apply verbatim.
        </p>
        <JsonArea value={$state.snapshot(tile)} onchange={(v) => (tiles[index] = v)} rows={8} />
      </div>
    {/if}
  </div>
</CardRow>
</div>

  {#snippet failed(error, reset)}
    <div class="my-1 flex items-center gap-2 rounded-[8px] border border-danger/60 bg-danger/10 px-3 py-2 text-xs text-danger">
      <span class="material-symbols-outlined text-[18px]">error</span>
      <span class="min-w-0 truncate">This tile row hit an error — the rest of the tab is fine. {String(error?.message || error)}</span>
      <button class="shrink-0 cursor-pointer rounded border border-danger/50 bg-transparent px-2 py-1 font-[inherit] text-danger" onclick={reset}>Retry</button>
    </div>
  {/snippet}
</svelte:boundary>
