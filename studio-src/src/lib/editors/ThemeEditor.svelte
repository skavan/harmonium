<script>
  /* THEME — colors + the global LAYOUT & TYPE block (v0.27):
     tile height, grid feel, primary/secondary font face·size·weight.
     Every key is a CSS var on the engine (--<key>); blank = the
     built-in default (applyTheme clears removed vars live). Per-page
     overrides are a later cleverness — this block is the global. */
  import { app, schedulePreview, discoverIconSets } from "../state.svelte.js";
  import Field from "../components/Field.svelte";
  import Chips from "../components/Chips.svelte";

  const d = $derived(app.draft);
  const th = $derived(d?.theme || {});

  /* ICON SETS (2026-09-02, moved here from Startup & Home: "I think
     it should be in theme?"). Declared prefixes are the gate that
     lets the picker's custom-pack bridge run at all. Discovery is
     the ONE place the bridge runs without a declaration — an
     explicit settings click, sandboxed + deadline-bounded — and it
     answers with whatever set prefixes the installed lovelace
     modules registered ("read available iconsets and offer them"). */
  const BUILTIN_SETS = ["material", "phu", "mdi"];
  /* registered but useless for tiles — HACS's frontend registers its
     own internal iconset (its logo glyphs); never worth offering
     (his round-5 question: "what is HACS?"). Typing it still works. */
  const NOISE_SETS = ["hacs"];
  let finding = $state(false);
  let found = $state(null);   /* {live, packs} | null = not asked yet */
  async function findPacks() {
    finding = true;
    try { found = (await discoverIconSets()) || { live: [], packs: [] }; }
    catch { found = { live: [], packs: [] }; }
    finding = false;
  }
  const declaredLc = $derived((d?.global?.icon_sets || [])
    .map((s) => String(s).toLowerCase()));
  /* live sets (the server speaks them already — activated
     custom_icons prefixes) need no declaration; offer only the
     module-registered packs beyond built-ins + declared + live */
  const liveSets = $derived(found?.live || []);
  const offers = $derived((found?.packs || []).filter((k) =>
    !BUILTIN_SETS.includes(k.toLowerCase()) &&
    !NOISE_SETS.includes(k.toLowerCase()) &&
    !declaredLc.includes(k.toLowerCase()) &&
    !liveSets.some((l) => l.toLowerCase() === k.toLowerCase())));
  function addSet(k) {
    if (!d.global) d.global = {};
    d.global.icon_sets = [...(d.global.icon_sets || []), k];
  }
  function set(k, v) {
    if (!d.theme) d.theme = {};
    const val = (v ?? "").trim();
    if (val) d.theme[k] = val;
    else delete d.theme[k];
    schedulePreview();
  }
  const isHex = (v) => /^#[0-9a-fA-F]{3,8}$/.test(v || "");

  const COLORS = [
    ["accent", "Accent", "#ffb300"],
    ["on", "Active glow", "#ffd54f"],
    ["bg", "Background", "#0d0f12"],
    ["tile", "Tile", "#1a1e24"],
    ["tile-hi", "Tile (focused)", "#232932"],
    ["text", "Text", "#e8eaed"],
    ["dim", "Dim text", "#8a919c"],
    ["danger", "Danger", "#e05252"],
    ["wash", "Focus wash", "rgba(255,179,0,.10)"],
  ];
  const WEIGHTS = ["", "100", "300", "400", "500", "700", "900"];
  /* the engine's spelling of "no ring" (config.js applyTheme) */
  const RING_OFF = /^(off|none|false|0|no)$/i;
</script>

{#if d}
  <div class="space-y-4">
    <div class="rounded-[12px] border border-line bg-tile p-3">
      <div class="mb-2 text-[11px] font-bold tracking-[.07em] text-dim uppercase">Colors</div>
      <div class="grid grid-cols-3 gap-3">
        {#each COLORS as [k, label, def] (k)}
          <Field {label} hint={"blank = " + def}>
            <div class="flex items-center gap-1.5">
              {#if isHex(th[k] ?? def)}
                <input type="color" value={isHex(th[k]) ? th[k] : def}
                  onchange={(e) => set(k, e.target.value)}
                  class="h-8 w-9 shrink-0 cursor-pointer rounded border border-line bg-transparent p-0.5" />
              {/if}
              <input value={th[k] ?? ""} placeholder={def} spellcheck="false"
                onchange={(e) => set(k, e.target.value)}
                class="w-full min-w-0 rounded-[8px] border border-line bg-field px-2 py-1.5 font-mono text-[11.5px] text-ink outline-none focus:border-accent/60" />
            </div>
          </Field>
        {/each}
        <!-- FOCUS RING (v0.87.0 — a tester on an old iPhone asked for
             "a setting to turn off the orange highlight ring,
             everywhere"): the d-pad cursor. Off paints it transparent
             (the cursor still exists — a d-pad remote keeps working);
             a colour re-tints it. Per remote too: the same key in a
             remote profile's style map (Remotes & keymaps). -->
        <Field label="Focus ring" hint="the accent ring on the focused tile — the d-pad cursor. Off for touch-only remotes (a phone), where the cursor is just a ring stuck on the last tap. A color works too (Code tab: focus-ring). Per-remote: the same key in the remote's style.">
          <select value={RING_OFF.test(th["focus-ring"] ?? "") ? "off" : ""}
            onchange={(e) => set("focus-ring", e.target.value)}
            class="w-full cursor-pointer rounded-[8px] border border-line bg-tile-hi px-2 py-1.5 font-[inherit] text-xs text-ink outline-none focus:border-accent/60">
            <option value="">{th["focus-ring"] && !RING_OFF.test(th["focus-ring"]) ? "custom color · " + th["focus-ring"] : "On · accent (default)"}</option>
            <option value="off">Off · no ring</option>
          </select>
        </Field>
        <Field label="Corner radius" hint="blank = 12px">
          <input value={th["radius"] ?? ""} placeholder="12px" spellcheck="false"
            onchange={(e) => set("radius", e.target.value)}
            class="w-full rounded-[8px] border border-line bg-field px-2 py-1.5 font-mono text-[11.5px] text-ink outline-none focus:border-accent/60" />
        </Field>
      </div>
    </div>

    <div class="rounded-[12px] border border-line bg-tile p-3">
      <div class="mb-2 text-[11px] font-bold tracking-[.07em] text-dim uppercase">Layout &amp; type — global</div>
      <p class="mt-0 mb-3 text-[11px] text-dim">
        Columns stay per-page (each page's grid). These set the house
        style everywhere; blank = the built-in default.
      </p>
      {#snippet knob(key, label, ph, hint)}
        <div class="flex items-center gap-3">
          <span class="w-24 shrink-0 text-xs font-bold text-dim">{label}</span>
          <input value={th[key] ?? ""} placeholder={ph} spellcheck="false"
            onchange={(e) => set(key, e.target.value)}
            class="w-28 rounded-[8px] border border-line bg-field px-2 py-1.5 font-mono text-[11.5px] text-ink outline-none focus:border-accent/60" />
          <span class="text-[11px] text-dim">{hint}</span>
        </div>
      {/snippet}
      <div class="space-y-2">
        {@render knob("tile-h", "Tile height", "84px", "min height of every tile — one-column list rows ride along · blank = 84px")}
        {@render knob("icon-zone", "Icon zone", "52px", "the row-tile icon disc — glyphs scale with it, images fill it")}
        {@render knob("icon-radius", "Icon shape", "50%", "50% = circle · 14px = squircle (the Fire TV look) · 0 = square")}
        {@render knob("tile-gap", "Icon–text gap", "14px", "space between the icon zone and the text block")}
        <!-- ARTWORK (v0.83.2 — Suresh: "have the library artwork
             (including tiles) set in the theme (for both music and
             tv)"): one knob per artwork role, engine tokens
             --br-art / --art-big / --app-art -->
        {@render knob("br-art", "Library art", "58px", "cover art on library cards (grid/tile views) — music AND tv browse; list rows use the icon zone above")}
        {@render knob("art-big", "Playlist art", "84px", "the art-forward cards where the cover IS the pick (Bar playlists) · wide screens add 16px")}
        {@render knob("app-art", "App stamp", "42px", "app logos on presets and the apps drawer")}
        {@render knob("tile-pad-x", "Padding ↔", "16px", "inside the tile, left/right — shifts icon + text toward or away from the edges")}
        {@render knob("tile-pad-y", "Padding ↕", "12px", "inside the tile, top/bottom")}
      </div>
      <div class="mt-4 grid grid-cols-[96px_1fr_88px_120px] items-center gap-x-3 gap-y-2">
        <span></span>
        <span class="text-[10px] font-bold tracking-[.08em] text-dim/80 uppercase">Font face</span>
        <span class="text-[10px] font-bold tracking-[.08em] text-dim/80 uppercase">Size</span>
        <span class="text-[10px] font-bold tracking-[.08em] text-dim/80 uppercase">Weight</span>
        <span class="text-xs font-bold text-dim">Primary</span>
        <input value={th["font-1"] ?? ""} placeholder="system-ui, Roboto, sans-serif" spellcheck="false"
          onchange={(e) => set("font-1", e.target.value)}
          class="w-full min-w-0 rounded-[8px] border border-line bg-field px-2 py-1.5 font-mono text-[11.5px] text-ink outline-none focus:border-accent/60" />
        <input value={th["fs-1"] ?? ""} placeholder="15px" spellcheck="false"
          onchange={(e) => set("fs-1", e.target.value)}
          class="w-full rounded-[8px] border border-line bg-field px-2 py-1.5 font-mono text-[11.5px] text-ink outline-none focus:border-accent/60" />
        <select value={th["fw-1"] ?? ""} onchange={(e) => set("fw-1", e.target.value)}
          class="w-full cursor-pointer rounded-[8px] border border-line bg-tile-hi px-2 py-1.5 font-[inherit] text-xs text-ink outline-none focus:border-accent/60">
          {#each WEIGHTS as w (w)}<option value={w}>{w ? w : "600 · default"}</option>{/each}
        </select>
        <span class="text-xs font-bold text-dim">Secondary</span>
        <input value={th["font-2"] ?? ""} placeholder="(follows primary)" spellcheck="false"
          onchange={(e) => set("font-2", e.target.value)}
          class="w-full min-w-0 rounded-[8px] border border-line bg-field px-2 py-1.5 font-mono text-[11.5px] text-ink outline-none focus:border-accent/60" />
        <input value={th["fs-2"] ?? ""} placeholder="13px" spellcheck="false"
          onchange={(e) => set("fs-2", e.target.value)}
          class="w-full rounded-[8px] border border-line bg-field px-2 py-1.5 font-mono text-[11.5px] text-ink outline-none focus:border-accent/60" />
        <select value={th["fw-2"] ?? ""} onchange={(e) => set("fw-2", e.target.value)}
          class="w-full cursor-pointer rounded-[8px] border border-line bg-tile-hi px-2 py-1.5 font-[inherit] text-xs text-ink outline-none focus:border-accent/60">
          {#each WEIGHTS as w (w)}<option value={w}>{w ? w : "400 · default"}</option>{/each}
        </select>
        <!-- v0.52.1/v0.53: the MUSIC PLAYER (controller · library ·
             queue) carries its own full face·size·weight rows
             (Suresh: "you have the fields right there — why not open
             them up"); blank = follows the pair above -->
        <span class="text-xs font-bold text-dim">Music 1º</span>
        <input value={th["font-m1"] ?? ""} placeholder="(follows primary)" spellcheck="false"
          onchange={(e) => set("font-m1", e.target.value)}
          class="w-full min-w-0 rounded-[8px] border border-line bg-field px-2 py-1.5 font-mono text-[11.5px] text-ink outline-none focus:border-accent/60" />
        <input value={th["fs-m1"] ?? ""} placeholder="(primary)" spellcheck="false"
          onchange={(e) => set("fs-m1", e.target.value)}
          class="w-full rounded-[8px] border border-line bg-field px-2 py-1.5 font-mono text-[11.5px] text-ink outline-none focus:border-accent/60" />
        <select value={th["fw-m1"] ?? ""} onchange={(e) => set("fw-m1", e.target.value)}
          class="w-full cursor-pointer rounded-[8px] border border-line bg-tile-hi px-2 py-1.5 font-[inherit] text-xs text-ink outline-none focus:border-accent/60">
          {#each WEIGHTS as w (w)}<option value={w}>{w ? w : "follows primary"}</option>{/each}
        </select>
        <span class="text-xs font-bold text-dim">Music 2º</span>
        <input value={th["font-m2"] ?? ""} placeholder="(follows secondary)" spellcheck="false"
          onchange={(e) => set("font-m2", e.target.value)}
          class="w-full min-w-0 rounded-[8px] border border-line bg-field px-2 py-1.5 font-mono text-[11.5px] text-ink outline-none focus:border-accent/60" />
        <input value={th["fs-m2"] ?? ""} placeholder="(secondary)" spellcheck="false"
          onchange={(e) => set("fs-m2", e.target.value)}
          class="w-full rounded-[8px] border border-line bg-field px-2 py-1.5 font-mono text-[11.5px] text-ink outline-none focus:border-accent/60" />
        <select value={th["fw-m2"] ?? ""} onchange={(e) => set("fw-m2", e.target.value)}
          class="w-full cursor-pointer rounded-[8px] border border-line bg-tile-hi px-2 py-1.5 font-[inherit] text-xs text-ink outline-none focus:border-accent/60">
          {#each WEIGHTS as w (w)}<option value={w}>{w ? w : "follows secondary"}</option>{/each}
        </select>
      </div>
      <p class="mt-3 mb-0 text-[11px] text-dim">
        Primary = labels &amp; titles · Secondary = subs &amp; hints (face
        blank = follows primary). Music 1º/2º restyle just the music
        player — its controller, library and queue. Faces must be
        available on the remote (system fonts, or a family the kiosk
        browser ships); anything exotic lives in the Code tab as raw
        theme keys.
      </p>
    </div>

    <div class="rounded-[12px] border border-line bg-tile p-3">
      <div class="mb-2 text-[11px] font-bold tracking-[.07em] text-dim uppercase">Icons</div>
      <Field label="Icon sets"
        hint="custom icon packs the picker may ask BEYOND the built-ins (material, phu:, mdi:) — the set prefix, e.g. fa6-solid or hue. Empty = the custom-pack bridge stays off entirely (nothing imported, nothing to hang); icons already banked as files keep working either way.">
        <div class="space-y-2">
          <!-- function binding: the key stays ABSENT until a chip is
               added (a bare bind to undefined throws
               props_invalid_value, and minting [] on view would
               dirty every config) -->
          <Chips bind:items={() => d.global?.icon_sets || [],
            (v) => { if (!d.global) d.global = {}; d.global.icon_sets = v; }}
            placeholder="add a set prefix…" />
          <div class="flex flex-wrap items-center gap-1.5">
            <button onclick={findPacks} disabled={finding}
              class="cursor-pointer rounded-[8px] border border-line bg-tile-hi px-2.5 py-1 text-xs text-ink hover:border-accent/60 disabled:cursor-default disabled:opacity-60">
              {finding ? "asking the installed packs…" : "⌕ Find installed packs"}</button>
            {#each offers as k (k)}
              <button onclick={() => addSet(k)} title="add {k} to the icon sets"
                class="cursor-pointer rounded-full border border-line bg-sunk px-2.5 py-1 text-xs text-ink hover:border-accent/60">＋ {k}</button>
            {/each}
            {#if found !== null && !finding && !offers.length}
              <span class="text-[11px] text-dim">
                {(found.packs || []).length || liveSets.length
                  ? "nothing new to add"
                  : "no packs registered — install one (e.g. via HACS) first"}</span>
            {/if}
          </div>
          <div class="text-[11px] text-dim">
            always on (built in): <span class="font-mono">material · phu · mdi</span>
            {#if liveSets.length}
              <br />already live via HA's icon services (no listing needed):
              <span class="font-mono">{liveSets.join(" · ")}</span>
            {/if}
          </div>
        </div>
      </Field>
    </div>
  </div>
{/if}
