<script>
  /* One item in a page's list — the ITEM-CARD GRAMMAR (redesign R4):
     identity strip → tabs → Advanced behind glass, same shape as the
     ActivityCard. The first tab is the item's own voice — "The device"
     / "Where it goes" (doorway) / "What it does" (preset) / "What it
     shows" (generators & raw widgets). `type`, `tile id` and the raw
     JSON live in Advanced (vocabulary: they never walk the primary
     path). Styling = column span + how a doorway renders. */
  import { app, selectSlice, beginPageDraft, showUndo, tileDirty } from "../state.svelte.js";
  import Field from "./Field.svelte";
  import Input from "./Input.svelte";
  import Select from "./Select.svelte";
  import Segmented from "./Segmented.svelte";
  import EntityPicker from "./EntityPicker.svelte";
  import CardRow from "./CardRow.svelte";
  import Chips from "./Chips.svelte";
  import JsonArea from "./JsonArea.svelte";

  let { tile, tiles, index, ownerScreen = null } = $props();
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
  const NAV_STYLES = [
    { value: "auto", label: "Auto — image if it has one · summary if the page has devices · plain otherwise" },
    { value: "plain", label: "Plain — icon + label button" },
    { value: "image", label: "Image — full-bleed photo tile" },
    { value: "summary", label: "Summary — live “n entities · k active” from its page" },
  ];
  const navScreenOptions = $derived(Object.entries(app.draft?.screens || {})
    .map(([sid, s]) => ({ value: sid, label: s.name || sid })));

  /* the Type list, grouped so it reads: device + doorway (the two
     archetypes), content generators, then raw widgets for the
     advanced hand — Advanced-tab furniture only */
  const CONTENT_TYPES = ["activity", "activities", "devices", "preset",
    "presets_from", "apps", "sources", "scene", "script"];
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
  const RAW_TYPES = ["light", "switch", "climate", "cover", "fan", "media",
    "volume", "transport", "mediabtns", "dpad", "buttons"];
  const ENTITY_TYPES = new Set(["light", "switch", "climate", "cover", "fan", "media",
    "volume", "transport", "mediabtns", "script", "scene", "presets_from",
    "sources"]);   /* sources (v0.35): ONE tile that opens the input picker */

  /* ---- DEVICE tiles: a device STARTS with a name and an entity;
     type, icon, verbs and page all INFER from the entity ---- */
  const rec = (eid) => app.entities.find((e) => e.entity_id === eid);
  const friendlyOf = (eid) => rec(eid)?.name || "";
  const DOM_ICON = {
    media_player: (r) => (r?.device_class === "tv" ? "material:tv" : "material:speaker"),
    light: () => "material:lightbulb",
    switch: () => "material:toggle_on",
    fan: () => "material:mode_fan",
    climate: () => "material:thermostat",
    remote: () => "material:settings_remote",
    cover: () => "material:blinds",
    camera: () => "material:videocam",
  };
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
  const seqIds = $derived(Object.keys(app.draft?.sequences || {}));
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

  /* ---- PRESET (§6.8): "On tap" wears the paradigm; all three
     choices compile to the ONE action shape the engine already fires
     (service + entity + data — no config-model change) ---- */
  const presetMode = () => {
    const svc = tile.action?.service || "";
    if (svc === "harmonium.run") return "sequence";
    if (svc === "scene.turn_on") return "scene";
    return "service";
  };
  function setPresetMode(m) {
    if (m === presetMode()) return;
    if (m === "sequence") tile.action = { service: "harmonium.run", data: { sequence: "" } };
    else if (m === "scene") tile.action = { service: "scene.turn_on", entity: "" };
    else tile.action = { service: "" };
  }
  const PRESET_MODES = [
    { value: "sequence", label: "Run an action — a sequence from Building blocks" },
    { value: "scene", label: "Activate a scene" },
    { value: "service", label: "Call a service — any HA call, verbatim" },
  ];

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
    copy.id = (copy.id || "tile") + "_copy";
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
  const rowMenu = () => [
    { label: "Move up", action: () => move(-1) },
    { label: "Move down", action: () => move(1) },
    ...hostSections().map(({ s, label }) =>
      ({ label: "Move to " + label, action: () => moveTo(s) })),
    { divider: true },
    { label: "Duplicate", action: duplicate },
    { label: "Remove", danger: true, action: removeTile },
  ];
</script>

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
          <Input value={tile.label} title={tile.target ? "Its page's name follows along" : ""}
            oninput={(e) => { tile.label = e.target.value;
              if (tile.target && app.draft.screens[tile.target])
                app.draft.screens[tile.target].name = e.target.value; }} />
        {:else}
          <Input bind:value={tile.label} />
        {/if}
      </Field></div>
      <div class="w-[190px] min-w-[140px] flex-1"><Field label="Icon" hint="">
        <Input value={tile.icon_image || tile.icon || ""} placeholder="material:devices"
          title="material:<glyph> · or an image path (/local/…) to fill the icon zone"
          class="font-mono text-[12.5px]" onchange={(e) => setIcon(e.target.value)} />
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
        onclick={() => (tab = "advanced")}>
        <span class="mr-1 inline-block h-[9px] w-[9px] rounded-[2px] border border-current align-[-1px]"></span>Advanced</button>
    </div>

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
          <Field label="Hold action — opens" hint="hold is the doorway verb: a page of everything this device can do">
            <Select value={tile.target ?? ""}
              onchange={(e) => { if (e.target.value) tile.target = e.target.value; else delete tile.target; }}
              options={holdOptions} />
          </Field>
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
            {#if tile.target}
              <button class="mb-6 shrink-0 cursor-pointer border-0 bg-transparent p-0 text-xs text-accent hover:underline"
                onclick={() => selectSlice("screens." + tile.target)}>edit page →</button>
            {:else}
              <button class="mb-6 shrink-0 cursor-pointer rounded-[8px] border border-dashed border-line bg-transparent px-2 py-1 text-sm leading-[1.2] text-dim hover:border-accent/60 hover:text-accent"
                title={"Create the page “" + (tile.label || "page") + "” — a full view with activities/presets switched off"}
                onclick={mintNavPage}>＋</button>
            {/if}
          </div>
        </div>
      {:else if tile.type === "preset"}
        <!-- WHAT IT DOES (§6.8): one shape, three doors in -->
        <div class="grid grid-cols-2 gap-3">
          <Field label="On tap" hint="">
            <Select value={presetMode()} onchange={(e) => setPresetMode(e.target.value)}
              options={PRESET_MODES} />
          </Field>
          {#if presetMode() === "sequence"}
            <div class="flex items-end gap-2">
              <div class="min-w-0 flex-1">
                <Field label="Action" hint="">
                  <Select value={tile.action?.data?.sequence ?? ""} allowEmpty
                    onchange={(e) => { tile.action = { service: "harmonium.run", data: { sequence: e.target.value } }; }}
                    options={seqIds} />
                </Field>
              </div>
              <button class="mb-6 shrink-0 cursor-pointer border-0 bg-transparent p-0 text-xs text-accent hover:underline"
                onclick={() => selectSlice("sequences")}>edit →</button>
            </div>
          {:else if presetMode() === "scene"}
            <Field label="Scene" hint="">
              <EntityPicker domains={["scene"]} value={tile.action?.entity ?? ""}
                onchange={(e) => { tile.action = { service: "scene.turn_on", entity: e.target.value }; }} />
            </Field>
          {:else}
            <Field label="Service" hint="domain.service">
              <Input value={tile.action?.service ?? ""} placeholder="media_player.play_media"
                class="font-mono text-[12.5px]"
                onchange={(e) => { tile.action = { ...(tile.action || {}), service: e.target.value.trim() }; }} />
            </Field>
            <Field label="Target entity" hint="who receives the call — $context.* works here">
              <!-- the engine fires action.target || action.entity — honor
                   whichever key the tile already speaks -->
              <EntityPicker value={tile.action?.target ?? tile.action?.entity ?? ""}
                onchange={(e) => {
                  const k = tile.action && "target" in tile.action ? "target" : "entity";
                  tile.action = { ...(tile.action || {}), [k]: e.target.value };
                }} /></Field>
            <div class="col-span-2">
              <Field label="Service data (JSON)" hint="">
                <JsonArea value={$state.snapshot(tile.action?.data ?? {})} rows={3}
                  onchange={(v) => { tile.action = { ...(tile.action || {}), data: v }; }} />
              </Field>
            </div>
          {/if}
          <Field label="Belongs to activity" hint="warm-start: the preset makes sure this activity is running first">
            <Select value={tile.activity ?? ""} allowEmpty options={activityIds}
              onchange={(e) => { if (e.target.value) tile.activity = e.target.value; else delete tile.activity; }} />
          </Field>
        </div>
        {#if tile.activity}
          <p class="m-0 text-[11px] text-dim">
            This preset belongs to {app.draft?.activities?.[tile.activity]?.name || tile.activity} —
            tapping it starts that activity if it isn't already running, then fires.
          </p>
        {/if}
      {:else}
        <!-- WHAT IT SHOWS: generators and raw widgets keep their voice -->
        <div class="grid grid-cols-2 gap-3">
          {#if tile.type === "apps"}
            <Field label="Device class" hint="blank = the activity's dialect ($context.app_class)">
              <Select value={tile.class ?? ""} allowEmpty
                options={Object.entries(app.draft?.app_classes || {})
                  .map(([cid, c]) => ({ value: cid, label: c.name || cid }))}
                onchange={(e) => { if (e.target.value) tile.class = e.target.value; else delete tile.class; }} />
            </Field>
            <div class="col-span-2">
              <Field label="Apps offered (in order)" hint="filters the class's list — blank = everything the class offers">
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
          {:else if ENTITY_TYPES.has(tile.type)}
            <Field label="Entity"><EntityPicker bind:value={tile.entity} /></Field>
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
        <Field label="Column span" hint="how many grid columns this item spans">
          <Segmented value={+(tile.span ?? 1)} options={[1, 2, 3, 4]}
            onchange={(v) => (tile.span = v)} />
        </Field>
        {#if tile.type === "nav"}
          <Field label="Style" hint="how the doorway renders — the page behind it is the same either way">
            <Select value={tile.style ?? "auto"}
              onchange={(e) => { if (e.target.value === "auto") delete tile.style; else tile.style = e.target.value; }}
              options={NAV_STYLES} />
          </Field>
          {#if (tile.style ?? "auto") === "image" || (tile.style ?? "auto") === "auto"}
            <Field label="Image" hint="path under /local/ (HA www/) — auto style shows it when set">
              <Input bind:value={tile.image} placeholder="/local/images/Porch_Render.jpg" class="font-mono text-[12.5px]" />
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
