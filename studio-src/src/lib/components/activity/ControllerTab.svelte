<script>
  /* CONTROLLER — what the screen shows while this activity runs:
     per-activity band switches on the shared surface, label slots,
     and the activity's presets. Split out of ActivityCard.svelte
     (v0.83.11). */
  import { app, selectSlice, instantiateController, revertToStock, snippetsOf, presetSnippetTile, schedulePreview } from "../../state.svelte.js";
  import Select from "../Select.svelte";
  import Switch from "../Switch.svelte";
  import Button from "../Button.svelte";
  import TileRow from "../TileRow.svelte";

  let { card } = $props();
  const a = $derived(card.a);
  const id = $derived(card.id);
  const groups = $derived(card.groups);
  const navCtrl = $derived(card.navCtrl);
  const { recompile, deviceList } = card;

  /* THE CONTROLLER TAB (v0.83.7 — Suresh: "Should we have a
     controller tab, where we turn knobs and settings for a given
     controller?"). Per-activity band switches on the SHARED surface,
     stored on a.surface (surface.devices pioneered the shape in
     v0.48). Absent = Auto = today's behavior; false = off. The rows
     are derived from what the target controller ACTUALLY renders. */
  const BAND_DEFS = [
    { key: "np", label: "Now Playing", types: ["media"],
      hint: "art, title, play state" },
    { key: "transport", label: "Transport", types: ["transport"],
      hint: "play / pause / skip" },
    { key: "modes", label: "Modes", types: ["mediabtns"],
      hint: "shuffle / repeat / queue" },
    { key: "volume", label: "Volume band", types: ["volume", "volumes"],
      hint: "the cast's volume controls" },
    { key: "speakers", label: "Speakers (grouping)", types: ["speakers"],
      hint: "Auto = appears when this activity has 2+ players" },
    { key: "groups", label: "Cast-group cards", types: ["groups"],
      hint: "the nav cards for groups made with ⊞ Add group in the cast" },
    { key: "sources", label: "Source picker", types: ["sources"],
      hint: "the input list" },
    { key: "presets", label: "Presets band", types: ["presets"],
      hint: "the shortcuts below — hiding the band keeps them saved" },
    { key: "devices", label: "Devices section", types: ["devices"],
      hint: "the cast lists itself at the bottom of the controller" },
  ];
  const ctrlTileTypes = $derived.by(() => {
    const c = navCtrl?.c;
    const tt = new Set();
    if (c) [...(c.tiles || []), ...((c.sections || []).flatMap((x) => x.tiles || []))]
      .forEach((x) => { if (x && x.type) tt.add(x.type); });
    return tt;
  });
  const bandsRaw = $derived(BAND_DEFS.filter((b) => b.types.some((x) => ctrlTileTypes.has(x))));
  /* rows display in the activity's own order (v0.83.7 — "move up
     and move down"); unlisted bands trail in natural order */
  const bands = $derived.by(() => {
    const order = a?.surface?.band_order;
    if (!Array.isArray(order) || !order.length) return bandsRaw;
    return [...bandsRaw].sort((x, y) => {
      const rx = order.indexOf(x.key), ry = order.indexOf(y.key);
      return (rx < 0 ? 900 : rx) - (ry < 0 ? 900 : ry);
    });
  });
  function moveBand(key, dir) {
    const cur = bands.map((b) => b.key);
    const i = cur.indexOf(key), j = i + dir;
    if (j < 0 || j >= cur.length) return;
    [cur[i], cur[j]] = [cur[j], cur[i]];
    a.surface = { ...(a.surface || {}), band_order: cur };
    schedulePreview();
  }
  const bandOn = (k) => a.surface?.[k] !== false;
  function setBand(k, v) {
    if (v) {
      if (a.surface) {
        delete a.surface[k];
        if (!Object.keys(a.surface).length) delete a.surface;
      }
    } else a.surface = { ...(a.surface || {}), [k]: false };
    schedulePreview();
  }
  function setSurfKey(key, v) {
    if (v) a.surface = { ...(a.surface || {}), [key]: v };
    else if (a.surface) {
      delete a.surface[key];
      if (!Object.keys(a.surface).length) delete a.surface;
    }
    schedulePreview();
  }
  /* Speaker Groups (v0.83.7): which players the Speakers band offers,
     and how the card presents — see Model → Speaker Groups */
  const setSpeakersGroup = (v) => setSurfKey("speakers_group", v);
  const setSpeakersMode = (v) => setSurfKey("speakers_mode", v);
  /* BAND LABEL SLOTS (v0.83.7 — "would be cool is a label slot, so we
     can override labels ... No text means no label!"): overrides the
     band's tile label on the remote, for THIS activity. Absent =
     default; "" = no label at all. Only single-tile bands take one —
     per-item bands (the volumes cast, presets, devices) keep their
     own names. */
  const LABELABLE = new Set(["np", "transport", "modes", "volume", "sources", "speakers", "presets", "devices"]);
  /* the placeholder tells the truth (v0.83.7 — "Volume Band. label is
     Blank but actually its ..."): what the band ACTUALLY says today,
     so the empty slot reads as "currently: X", not as "no label" */
  function defaultBandLabel(key) {
    const c = navCtrl?.c;
    const allTiles = c ? [...(c.tiles || []),
      ...((c.sections || []).flatMap((x) => x.tiles || []))] : [];
    const byType = (ty) => allTiles.find((x) => x.type === ty);
    if (key === "np") return byType("media")?.label ?? "Now Playing";
    if (key === "transport") return byType("transport")?.label ?? "(hidden)";
    if (key === "modes") return byType("mediabtns")?.label ?? "(hidden)";
    if (key === "sources") return byType("sources")?.label ?? "Inputs";
    if (key === "volume") {
      const wired = a?.context?.volume;
      const dev = Object.entries(app.draft?.devices || {}).find(
        ([, d]) => Object.values(d.roles || {}).includes(wired) && d.roles?.volume === wired);
      if (dev) return dev[1].name || dev[0];
      /* LOOSE wiring (tidy-ups: 'We show "Volume" ... It's MA
         Basement'): the wired entity's own name is the truth */
      const rec = app.entities.find((x) => x.entity_id === wired);
      if (rec?.name) return rec.name;
      if (typeof wired === "string" && wired.includes("."))
        return wired.split(".").pop().replace(/_/g, " ");
      return byType("volume")?.label ?? "Volume";
    }
    if (key === "speakers") {
      const gid = a?.surface?.speakers_group;
      return gid ? (app.draft?.speaker_groups?.[gid]?.name || gid) : "Speakers";
    }
    if (key === "presets" || key === "devices") {
      const sec = (c?.sections || []).find((x) =>
        (x.tiles || []).some((tt) => tt.type === key));
      return sec?.title ?? (key === "presets" ? "Presets" : "Devices");
    }
    return "";
  }
  const bandLabel = (k) => a.surface?.band_labels?.[k];
  function setBandLabel(k, v) {
    a.surface = { ...(a.surface || {}),
      band_labels: { ...(a.surface?.band_labels || {}), [k]: v } };
    schedulePreview();
  }
  function clearBandLabel(k) {
    if (!a.surface?.band_labels) return;
    delete a.surface.band_labels[k];
    if (!Object.keys(a.surface.band_labels).length) delete a.surface.band_labels;
    if (!Object.keys(a.surface).length) delete a.surface;
    schedulePreview();
  }
  const setNpStyle = (v) => setSurfKey("np_style", v);
  /* THE SILENT-OVERRIDE FIX (v0.86 — beta report: "can't change the
     volume band type any more; stuck on the fat one"). This dropdown
     writes the activity DEFAULT — the LOWEST rung of gen-bands'
     ladder (present.style → device_options.volume_style → the
     default) — so one forgotten ⚙ style or member option pins its
     row and the dropdown reads as dead, with nothing saying why.
     Surface every pin beside the dropdown, each with its own ↺, so
     "why won't it change" answers itself and unsticking is one tap. */
  const volPins = $derived.by(() => {
    const out = [];
    const pres = a?.present || {};
    for (const k in pres)
      if (pres[k] && pres[k].style)
        out.push({ k, via: "present", style: pres[k].style });
    const dops = a?.device_options || {};
    for (const k in dops)
      if (dops[k] && dops[k].volume_style)
        out.push({ k, via: "device_options", style: dops[k].volume_style });
    return out;
  });
  const pinName = (k) => { const i = k.indexOf("."); return i > 0 ? k.slice(i + 1) : k; };
  function clearVolPin(p) {
    if (p.via === "present") {
      delete a.present[p.k].style;
      if (!Object.keys(a.present[p.k]).length) delete a.present[p.k];
      if (!Object.keys(a.present).length) delete a.present;
    } else {
      delete a.device_options[p.k].volume_style;
      if (!Object.keys(a.device_options[p.k]).length) delete a.device_options[p.k];
      if (!Object.keys(a.device_options).length) delete a.device_options;
    }
    schedulePreview();
  }
  function setVolStyle(v) {
    if (v) a.surface = { ...(a.surface || {}), volume_style: v };
    else if (a.surface) {
      delete a.surface.volume_style;
      if (!Object.keys(a.surface).length) delete a.surface;
    }
    schedulePreview();
  }
  function addPreset() {
    if (!a.presets) a.presets = [];
    a.presets.push({ type: "preset", id: "p_" + Math.random().toString(36).slice(2, 6),
      label: "New preset", icon: "material:play_circle", action: {} });
    recompile();
  }
</script>

      <div class="space-y-3">
        <!-- THE CONTROLLER TAB (v0.83.7). The Harmony question the
             card never asked: WHAT DOES THE SCREEN SHOW while this
             runs? The strip (moved from Setup), one switch per band
             the surface renders, and the activity's presets — the
             surface stays shared; the preferences travel with the
             activity. -->
        {#if navCtrl}
          <div class="rounded-[10px] border border-line bg-tile px-3 py-2.5">
            {#if navCtrl.isStock}
              <div class="flex flex-wrap items-center gap-4">
                <span class="text-[11px] font-bold tracking-[.07em] text-dim uppercase">Controller · stock</span>
                <span class="text-xs text-ink">{navCtrl.c.name}</span>
                <button
                  class="cursor-pointer rounded-[8px] border border-dashed border-line bg-transparent px-2.5 py-1 text-xs text-dim hover:border-accent/60 hover:text-accent"
                  title="Copy the stock surface as this activity's own editable controller — for STRUCTURAL changes; the switches below don't need one"
                  onclick={() => { const iid = instantiateController(navCtrl.cid, id); if (iid) selectSlice("controller." + iid); }}
                >⧉ Create custom copy</button>
              </div>
              <p class="mt-1 mb-0 text-[11px] text-dim">
                A shared stock surface — editing the controller itself changes
                every activity that uses it. The switches below are <b>this
                activity's alone</b>: they hide or show bands without touching
                the surface. Absent switch = Auto = the band's own rules.
              </p>
            {:else}
              <div class="flex flex-wrap items-center gap-4">
                <span class="text-[11px] font-bold tracking-[.07em] text-dim uppercase">Controller · custom copy</span>
                <span class="text-xs text-ink">{navCtrl.c.name}</span>
                <button class="cursor-pointer border-0 bg-transparent p-0 text-xs text-accent hover:underline"
                  onclick={() => selectSlice("controller." + navCtrl.cid)}>edit →</button>
                <button class="cursor-pointer border-0 bg-transparent p-0 text-xs text-dim hover:text-danger hover:underline"
                  title="Point this activity back at the stock controller (removes the copy if nothing else uses it)"
                  onclick={() => revertToStock(id)}>↺ use stock</button>
              </div>
            {/if}
          </div>
          <div class="rounded-[10px] border border-line bg-tile p-3">
            <span class="text-[11px] font-bold tracking-[.07em] text-dim uppercase">What this screen shows — for this activity</span>
            <div class="mt-2 space-y-1.5">
              {#each bands as bd (bd.key)}
                <div class="flex flex-wrap items-center gap-2.5" title={bd.hint}>
                  <span class="flex w-[24px] shrink-0 flex-col leading-none">
                    <button class="cursor-pointer border-0 bg-transparent p-0 text-[11px] text-faint hover:text-ink"
                      aria-label={"Move " + bd.label + " up"} onclick={() => moveBand(bd.key, -1)}>↑</button>
                    <button class="cursor-pointer border-0 bg-transparent p-0 text-[11px] text-faint hover:text-ink"
                      aria-label={"Move " + bd.label + " down"} onclick={() => moveBand(bd.key, 1)}>↓</button>
                  </span>
                  <span class="w-[186px] shrink-0 text-[12.5px] text-ink-2">{bd.label}</span>
                  <!-- COLUMN DISCIPLINE (v0.83.7 — "Lets have all the
                       labels align and the other stuff follow"): the
                       switch and the label slot live in fixed-width
                       columns, so every row's controls line up -->
                  <span class="flex w-[88px] shrink-0 items-center">
                    <Switch checked={bandOn(bd.key)}
                      label={bandOn(bd.key) ? "Auto" : "Off"}
                      onCheckedChange={(v) => setBand(bd.key, v)} />
                  </span>
                  {#if LABELABLE.has(bd.key)}
                    <span class="flex w-[158px] shrink-0 items-center gap-1">
                      <input class="h-[28px] w-[136px] rounded-[8px] border border-line bg-sunk px-2 text-[12px] text-ink placeholder:text-faint"
                        placeholder={defaultBandLabel(bd.key)}
                        title={"overrides this band's label on the remote, for this activity — empty text = NO label · ↺ restores the default"}
                        value={bandLabel(bd.key) ?? ""}
                        oninput={(e) => setBandLabel(bd.key, e.target.value)} />
                      {#if bandLabel(bd.key) !== undefined}
                        <button class="cursor-pointer border-0 bg-transparent p-0 text-xs text-dim hover:text-ink"
                          title="Restore the default label"
                          onclick={() => clearBandLabel(bd.key)}>↺</button>
                      {/if}
                    </span>
                  {:else}
                    <span class="w-[158px] shrink-0"></span>
                  {/if}
                  {#if bd.key === "volume" && bandOn("volume")}
                    <Select value={a.surface?.volume_style ?? ""} class="max-w-44"
                      title="this activity's default volume treatment — per-tile and per-member settings still win"
                      options={[
                        { value: "", label: "Theme default" },
                        { value: "compact", label: "Compact" },
                        { value: "slider", label: "Slider — the fat one" },
                        { value: "stepper", label: "Stepper − / +" },
                      ]}
                      onchange={(e) => setVolStyle(e.target.value)} />
                    {#if volPins.length}
                      <span class="text-[11px] text-dim italic"
                        title="These rows carry their own style (the tile's ⚙, or a member's volume option), which WINS over the dropdown's default — ↺ clears one so it follows the default again.">
                        ⚙ pinned:
                        {#each volPins as pin (pin.via + pin.k)}
                          <span class="whitespace-nowrap">
                            {pinName(pin.k)} = {pin.style}
                            <button class="cursor-pointer border-0 bg-transparent p-0 text-xs text-dim hover:text-ink"
                              title={"Clear this row's own style so the dropdown's default applies"}
                              onclick={() => clearVolPin(pin)}>↺</button>
                          </span>
                        {/each}
                      </span>
                    {/if}
                  {/if}
                  {#if bd.key === "groups"}
                    <span class="text-[11px] text-dim italic">
                      {groups.length
                        ? groups.map((g) => g.name || g.group).join(" · ")
                        : "none yet — ⊞ Add group in the cast"}
                    </span>
                  {/if}
                  {#if bd.key === "speakers" && bandOn("speakers")}
                    <Select value={a.surface?.speakers_group ?? ""} class="max-w-44"
                      title="which players the card offers — the cast's, or a named Speaker Group (Model → Speaker Groups)"
                      options={[
                        { value: "", label: "This activity's cast" },
                        ...Object.entries(app.draft?.speaker_groups || {}).map(
                          ([gid, g]) => ({ value: gid, label: g.name || gid })),
                        { value: "__new", label: "＋ Create group…" },
                      ]}
                      onchange={(e) => {
                        /* the door to Model → Speaker Groups (v0.83.7 —
                           "add an create group option that takes us to
                           groups...like we do with actions and stuff") */
                        if (e.target.value === "__new") {
                          e.target.value = a.surface?.speakers_group ?? "";
                          selectSlice("spkgroups");
                          return;
                        }
                        setSpeakersGroup(e.target.value);
                      }} />
                    <Select value={a.surface?.speakers_mode ?? ""} class="max-w-36"
                      title="launcher = a slim count tile opening the group's page (per-player sliders); inline = the full card right on the controller"
                      options={[
                        { value: "", label: a.surface?.speakers_group ? "Launcher (auto)" : "Inline (auto)" },
                        { value: "launcher", label: "Launcher tile" },
                        { value: "inline", label: "Inline card" },
                      ]}
                      onchange={(e) => setSpeakersMode(e.target.value)} />
                  {/if}
                  {#if bd.key === "np" && bandOn("np")}
                    <!-- "wash" is retired from the menu (v0.83.8 —
                         Suresh: "I think we can hide the Art Wash
                         option") but the engine still honors it, so a
                         config that already says wash keeps showing
                         its truth here instead of silently lying -->
                    <Select value={a.surface?.np_style ?? ""} class="max-w-36"
                      title="how Now Playing draws for this activity — Basic card, Slim row, or the Art Hero family (Compact · Art Hero · Large). Every hero holds a fixed height, so nothing below it moves."
                      options={[
                        /* RENAMED (v0.85 — Suresh: "this will likely be
                           the #1 difference between users"). The stored
                           VALUES are unchanged so every existing config
                           keeps working; only the labels moved, into one
                           family that reads as a size ladder. */
                        { value: "", label: "Auto" },
                        { value: "plain", label: "Basic" },
                        { value: "slim", label: "Slim row" },
                        { value: "art", label: "Art Hero — Compact" },
                        { value: "hero", label: "Art Hero" },
                        { value: "poster", label: "Art Hero — Large" },
                        ...(a.surface?.np_style === "wash"
                          ? [{ value: "wash", label: "Art wash — full-bleed (legacy)" }]
                          : []),
                      ]}
                      onchange={(e) => setNpStyle(e.target.value)} />
                  {/if}

                </div>
              {/each}
            </div>
            <p class="mt-2 mb-0 text-[10.5px] text-dim italic">
              Auto = the band's own rules (a band with nothing to show hides
              itself anyway). Off = never, for this activity. Other activities
              on the same surface keep their own answers.
            </p>
          </div>
        {:else}
          <p class="m-0 text-xs text-dim">
            No controller yet — pick a <b>Navigate to</b> on the Setup tab, or
            ＋ mint a control page there. The switches for its bands appear
            here once it exists.
          </p>
        {/if}
        <!-- PRESETS — one-touch shortcuts that belong to THIS activity
           (v0.64). The controller carries a `presets` generator and
           names none of them, so a shared surface stays shared while
           every room's shortcuts are its own. -->
      <div class="rounded-[10px] border border-line bg-tile p-3">
        <div class="mb-1 flex items-center gap-1.5">
          <span class="min-w-0 flex-1 truncate text-[11px] font-bold tracking-[.07em] text-dim uppercase">Presets — one-touch shortcuts for this activity</span>
          <!-- ⤵ IMPORT A PRESET SNIPPET (v0.79.1; wording unified
               v0.79.2): the standard grammar — export lives on any
               preset row's ⋮ → Export snippet; the twin import door
               is the page's Presets fold. -->
          {#snippet downloadIcon3()}
            <svg class="pointer-events-none h-3.5 w-3.5" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 4v11m0 0-4-4m4 4 4-4" /><path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2" />
            </svg>
          {/snippet}
          <div class={"relative flex h-[26px] shrink-0 items-center gap-1.5 rounded-[6px] border border-line-strong px-2 text-[11px] font-medium " +
              (snippetsOf("preset").length ? "bg-surface text-ink-2 hover:bg-sunk" : "bg-raised text-faint")}>
            {@render downloadIcon3()} Import snippet…
            <select value="" disabled={!snippetsOf("preset").length}
              title={snippetsOf("preset").length
                ? "Import a saved preset snippet"
                : "No preset snippets yet — Export snippet on a preset row's ⋮ menu captures one"}
              onchange={(e) => { const t = presetSnippetTile(e.target.value);
                if (t) { if (!a.presets) a.presets = []; a.presets.push(t); recompile(); }
                e.target.value = ""; }}
              class="absolute inset-0 w-full cursor-pointer opacity-0 outline-none disabled:cursor-default">
              <option value=""></option>
              {#each snippetsOf("preset") as [sid, sn] (sid)}<option value={sid}>{sn.name}</option>{/each}
            </select>
          </div>
          <Button size="sm" onclick={addPreset}>＋ Add preset</Button>
        </div>
        <p class="mt-0 mb-2 text-[11px] text-dim">
          A preset does one thing in one tap — play a favourite, bond a
          speaker, set a scene. They render wherever this activity's
          controller carries a <span class="font-mono">presets</span> tile,
          and nowhere else: the surface is shared, the shortcuts are yours.
          An action can be a service call or one of your
          <button class="cursor-pointer border-0 bg-transparent p-0 text-[11px] text-accent hover:underline"
            onclick={() => selectSlice("sequences")}>Actions →</button>
        </p>
        <div class="space-y-2">
          {#each a.presets || [] as tile, ti (ti)}
            <TileRow {tile} tiles={a.presets} index={ti} castEnts={deviceList()} />
          {:else}
            <p class="m-0 text-xs text-dim">
              No presets yet. Here they'd be things like “Coffee House”
              (play a Sonos favourite) or “Add the Pool” (run one of your
              Actions).
            </p>
          {/each}
        </div>
      </div>
      
      </div>
