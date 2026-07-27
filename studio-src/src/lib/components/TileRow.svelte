<script>
  /* One tile in a view's tile list — common fields as a form, the whole
     tile as raw JSON behind "All fields" for full fidelity. */
  import { app, selectSlice, beginPageDraft } from "../state.svelte.js";
  import Field from "./Field.svelte";
  import Input from "./Input.svelte";
  import Select from "./Select.svelte";
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

  /* the Type list, grouped so it reads: device + nav card (the two
     archetypes), content generators, then raw widgets for the
     advanced hand */
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
  const holdHint = () =>
    inferredPage() ? "blank = auto: " + inferredPage() + " (from its activity)"
      : "blank + no activity claims it = hold does nothing";

  const activityIds = $derived(Object.keys(app.draft?.activities || {}));
  const screenIds = $derived(Object.keys(app.draft?.screens || {}));
  let showRaw = $state(false);

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
</script>

<CardRow
  title={tile.label || tile.id || "(untitled)"}
  subtitle={tile.type + (tile.entity ? " · " + tile.entity : tile.activity ? " · " + tile.activity : "")}
  onup={() => move(-1)}
  ondown={() => move(1)}
  onduplicate={duplicate}
  ondelete={() => tiles.splice(index, 1)}
>
  {#snippet typeSelect()}
    <Field label="Type" hint={tile.type === "device" ? "" : "device = the smart tile: everything infers from its entity"}>
      <select
        value={tile.type}
        onchange={(e) => (tile.type = e.target.value)}
        class="w-full cursor-pointer rounded-[8px] border border-line bg-tile-hi px-2.5 py-1.5 font-[inherit] text-sm text-ink outline-none focus:border-accent/60"
      >
        <option value="device">device — auto from its entity</option>
        <option value="nav">nav card — opens another page</option>
        <optgroup label="Content generators">
          {#each CONTENT_TYPES as ty (ty)}<option value={ty}>{ty}</option>{/each}
        </optgroup>
        <optgroup label="Raw widgets (advanced)">
          {#each RAW_TYPES as ty (ty)}<option value={ty}>{ty}</option>{/each}
        </optgroup>
      </select>
    </Field>
  {/snippet}
  {#if tile.type === "device"}
    <!-- DEVICE flow: name + entity lead; everything else infers -->
    <div class="grid grid-cols-2 gap-3">
      <Field label="Name"><Input bind:value={tile.label} /></Field>
      <Field label="Entity" hint="renderer, icon, verbs and page all follow it">
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
      <Field label="Hold action — opens" hint={holdHint()}>
        <Select value={tile.target ?? ""} allowEmpty
          onchange={(e) => { if (e.target.value) tile.target = e.target.value; else delete tile.target; }}
          options={screenIds} />
      </Field>
      <Field label="Icon" hint="auto from the entity · or an image path (/local/…) to fill the icon zone">
        <Input value={tile.icon_image || tile.icon || ""} placeholder="material:devices"
          class="font-mono text-[12.5px]" onchange={(e) => setIcon(e.target.value)} />
      </Field>
      <Field label="Show attribute (advanced)" hint="blank = smart summary (state · title · brightness…)">
        <Input value={tile.attr ?? ""} placeholder="e.g. media_title" class="font-mono text-[12.5px]"
          onchange={(e) => { if (e.target.value.trim()) tile.attr = e.target.value.trim(); else delete tile.attr; }} />
      </Field>
      <Field label="Tile id"><Input bind:value={tile.id} class="font-mono text-[12.5px]" /></Field>
      <Field label="Span" hint="grid columns">
        <Input type="number" min="1" max="4" bind:value={tile.span} />
      </Field>
      {@render typeSelect()}
    </div>
  {:else}
  <div class="grid grid-cols-2 gap-3">
    {@render typeSelect()}
    <Field label="Tile id"><Input bind:value={tile.id} class="font-mono text-[12.5px]" /></Field>
    <Field label="Label" hint={tile.type === "nav" && tile.target ? "its page's name follows" : ""}>
      <Input value={tile.label}
        oninput={(e) => { tile.label = e.target.value;
          if (tile.type === "nav" && tile.target && app.draft.screens[tile.target])
            app.draft.screens[tile.target].name = e.target.value; }} />
    </Field>
    <Field label="Icon" hint="material:<glyph> · or an image path (/local/…)">
      <Input value={tile.icon_image || tile.icon || ""} placeholder="material:lightbulb"
        class="font-mono text-[12.5px]" onchange={(e) => setIcon(e.target.value)} /></Field>
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
    {:else if tile.type === "nav"}
      <div class="flex items-end gap-2">
        <div class="min-w-0 flex-1">
          <Field label="Opens" hint="＋ mints a fresh view (same anatomy, bits off) and jumps in as a draft">
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
      <Field label="Style" hint="how the card renders — the page behind it is the same either way">
        <Select value={tile.style ?? "auto"}
          onchange={(e) => { if (e.target.value === "auto") delete tile.style; else tile.style = e.target.value; }}
          options={NAV_STYLES} />
      </Field>
      {#if (tile.style ?? "auto") === "image" || (tile.style ?? "auto") === "auto"}
        <Field label="Image" hint="path under /local/ (HA www/) — auto style shows it when set">
          <Input bind:value={tile.image} placeholder="/local/images/Porch_Render.jpg" class="font-mono text-[12.5px]" />
        </Field>
      {/if}
    {:else if ENTITY_TYPES.has(tile.type)}
      <Field label="Entity"><EntityPicker bind:value={tile.entity} /></Field>
    {/if}
    <Field label="Span" hint="grid columns">
      <Input type="number" min="1" max="4" bind:value={tile.span} />
    </Field>
  </div>
  {/if}
  <button
    class="mt-3 cursor-pointer border-0 bg-transparent p-0 text-xs text-accent hover:underline"
    onclick={() => (showRaw = !showRaw)}
  >{showRaw ? "Hide" : "All"} fields (JSON)</button>
  {#if showRaw}
    <div class="mt-2">
      <JsonArea value={$state.snapshot(tile)} onchange={(v) => (tiles[index] = v)} rows={8} />
    </div>
  {/if}
</CardRow>
