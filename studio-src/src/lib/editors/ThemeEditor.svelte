<script>
  /* THEME — colors + the global LAYOUT & TYPE block (v0.27):
     tile height, grid feel, primary/secondary font face·size·weight.
     Every key is a CSS var on the engine (--<key>); blank = the
     built-in default (applyTheme clears removed vars live). Per-page
     overrides are a later cleverness — this block is the global. */
  import { app, schedulePreview } from "../state.svelte.js";
  import Field from "../components/Field.svelte";

  const d = $derived(app.draft);
  const th = $derived(d?.theme || {});
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
  </div>
{/if}
