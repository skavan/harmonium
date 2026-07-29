<script>
  /* WORKSPACE MAP v2 (mock 3a at full fidelity, §7.3 corrections
     applied) — the landing slice: pages in two columns, tabbed
     contents, parent stated, keys as a badge; controllers are a
     THIRD column whose story is sharing. Read-only; every card has
     a soft Edit (Suresh: no arrow) into the real editor.
     Row detail matters: an activity row says what it casts and where
     it lands, a preset row says what it runs, a device row shows its
     entity — counts are the summary, the rows are the detail. */
  import { app, selectSlice, roomIds, isControllerScreen } from "../state.svelte.js";

  const d = $derived(app.draft);
  const rooms = $derived(roomIds());

  /* PAGES = what the remote lands on. Library drawers that hang off a
     controller (Apps, Music Library) are that controller's furniture —
     they appear as → chips on its card, never as page cards.
     ORDER = the tree, top down: the true root first, then its
     children, then grandchildren (Suresh's correction). ROOT PAGE is
     a HIERARCHY fact (the parentless top / main_home) — NOT
     home_screen, which is merely where a remote boots and wears its
     own badge. */
  const depthOf = (sid) => {
    let n = 0, cur = d?.screens?.[sid];
    const seen = new Set([sid]);
    while (cur?.parent && !cur.parent.startsWith?.("controller:") &&
      d?.screens?.[cur.parent] && !seen.has(cur.parent)) {
      seen.add(cur.parent);
      cur = d.screens[cur.parent];
      n++;
    }
    return n;
  };
  const rootPage = $derived.by(() => {
    const mh = d?.global?.main_home;
    if (mh && d?.screens?.[mh]) return mh;
    return Object.keys(d?.screens || {}).find((sid) =>
      !d.screens[sid].parent && !isControllerScreen(d.screens[sid]) &&
      !d.screens[sid].drawer) || null;
  });
  const pages = $derived(Object.entries(d?.screens || {})
    .filter(([, s]) => !isControllerScreen(s) &&
      !s.parent?.startsWith?.("controller:"))
    .sort(([a], [b]) =>
      (depthOf(a) - depthOf(b)) ||
      ((a === rootPage) ? -1 : 0) - ((b === rootPage) ? -1 : 0)));
  const editKey = (sid) => (rooms.includes(sid) ? "view." + sid : "screens." + sid);
  const nameOf = (sid) => d?.screens?.[sid]?.name || sid;
  /* a parent can be a page OR a controller ref */
  const parentName = (ref) => ref?.startsWith?.("controller:")
    ? (d?.controllers?.[ref.slice(11)]?.name || ref.slice(11))
    : nameOf(ref);
  const ctrlName = (ref) => {
    if (!ref) return null;
    if (ref.startsWith("controller:")) {
      const cid = ref.slice(11);
      return d?.controllers?.[cid]?.name || cid;
    }
    return nameOf(ref);
  };

  /* ---- page-card content ---- */
  const castCount = (a) => {
    if (Array.isArray(a.devices) && a.devices.length) return a.devices.length;
    const seen = new Set();
    for (const v of Object.values(a.context || {}))
      if (typeof v === "string" && v.includes(".")) seen.add(v);
    return seen.size;
  };
  const acts = (sid) => Object.entries(d?.activities || {})
    .filter(([, a]) => a.room_view === sid)
    .map(([id, a]) => ({
      name: a.name || id,
      color: a.color || "#999",
      detail: castCount(a) + " device" + (castCount(a) === 1 ? "" : "s") +
        (ctrlName(a.screen) ? " · opens " + ctrlName(a.screen) : ""),
    }));
  const secTiles = (scr, role) =>
    (scr.sections || []).filter((s) => (s.role || "") === role)
      .flatMap((s) => s.tiles || []);
  const presetDetail = (t) => {
    const svc = t.action?.service || "";
    if (svc === "harmonium.run") return "runs action · " + (t.action?.data?.sequence || "—");
    if (svc === "scene.turn_on") return "scene · " + (t.action?.entity || "—");
    if (svc) return svc;
    return t.activity ? "preset · " + (d?.activities?.[t.activity]?.name || t.activity) : "preset";
  };
  const presets = (scr) => secTiles(scr, "presets").map((t) => ({
    name: t.label || t.id, detail: presetDetail(t), mono: !!t.action?.service && t.action.service !== "harmonium.run",
  }));
  const devTiles = (scr) => {
    const role = secTiles(scr, "devices");
    const custom = (scr.sections || [])
      .filter((s) => !["activities", "presets", "devices"].includes(s.role || ""))
      .flatMap((s) => s.tiles || []);
    return [...role, ...custom, ...(scr.tiles || [])];
  };
  const DOM_CODE = { media_player: "ME", light: "LT", switch: "SW", climate: "CL",
    fan: "FN", cover: "CV", remote: "RM", camera: "CA", scene: "SC", script: "SP" };
  /* generator tiles get WORDS, not their config ids (m_pl reads like
     debris; "Preset list" reads like furniture) */
  const GEN_NAME = { apps: "App grid", sources: "Sources", activities: "Activities",
    presets_from: "Preset list", devices: "Device cast" };
  const devices = (scr) => devTiles(scr).map((t) => {
    if (t.type === "nav") return {
      name: t.label || t.id, code: "→", detail: "opens " + (t.target ? nameOf(t.target) : "—"), mono: false };
    if (GEN_NAME[t.type]) return {
      name: t.label && t.label !== t.id ? t.label : GEN_NAME[t.type] +
        (t.type === "devices" && t.activity ? " · " + (d?.activities?.[t.activity]?.name || t.activity) : ""),
      code: "≣", detail: t.entity || t.type, mono: !!t.entity };
    const dom = (t.entity || "").split(".")[0];
    return { name: t.label || t.id, code: DOM_CODE[dom] || (t.type || "?").slice(0, 2).toUpperCase(),
      detail: t.entity || t.type, mono: !!t.entity };
  });
  const doorways = (scr) => devTiles(scr).filter((t) => t.type === "nav").length;
  const subpages = (sid) => Object.entries(d?.screens || {})
    .filter(([, s]) => s.parent === sid)
    .map(([cid, s]) => (s.name || cid) + (s.drawer ? " · drawer" : ""));
  const keysBound = (scr) =>
    Object.keys(scr.buttons || {}).length + (scr.power ? 1 : 0);
  const isEmptyPage = (sid, scr) =>
    !acts(sid).length && !presets(scr).length && !devices(scr).length;

  /* per-card active tab */
  let cardTab = $state({});
  const tabOf = (sid, scr) => cardTab[sid] ??
    (acts(sid).length ? "a" : presets(scr).length ? "p" : "d");
  const rowsOf = (sid, scr) => {
    const t = tabOf(sid, scr);
    return t === "a" ? acts(sid) : t === "p" ? presets(scr) : devices(scr);
  };
  const emptyLine = (sid, scr) => {
    const t = tabOf(sid, scr);
    if (t === "a") return sid === rootPage
      ? "No activities on this page today — it's the hub. Any page can own them; ＋ Add activity in its editor starts one."
      : "No activities here — this page can still own them.";
    if (t === "p") return "No presets — a preset is a one-touch shortcut.";
    return "No devices — a device card controls one thing; a doorway opens a page with more.";
  };

  /* ---- controllers column (mock 3a): only the ones with a story —
     used by an activity or edited; untouched stock collapses into one
     teach card instead of a wall of identical rows ---- */
  const controllers = $derived(Object.entries(d?.controllers || {}));
  const sharers = (cid) => Object.entries(d?.activities || {})
    .filter(([, a]) => a.screen === "controller:" + cid)
    .map(([id, a]) => a.name || id);
  /* what the controller offers, as chips: its section labels + its
     nested library drawers ("→ Apps" — clickable, mock 3a) */
  const ctrlDrawers = (cid) => Object.entries(d?.screens || {})
    .filter(([, s]) => s.parent === "controller:" + cid && s.drawer)
    .map(([sid, s]) => ({ sid, name: s.name || sid }));
  const ctrlSections = (cid) => (d?.controllers?.[cid]?.sections || [])
    .map((s) => s.hero_label || s.title).filter(Boolean).slice(0, 4);
  /* a controller card earns its place with a story: used by an
     activity, edited, or carrying a library drawer */
  const storyControllers = $derived(controllers
    .filter(([cid, c]) => sharers(cid).length || c.variant_of ||
      ctrlDrawers(cid).length));
  const quietStock = $derived(controllers
    .filter(([cid, c]) => !sharers(cid).length && !c.variant_of &&
      !ctrlDrawers(cid).length)
    .map(([cid, c]) => c.name || cid));

  const summary = $derived.by(() => {
    if (!d) return "";
    const custom = controllers.filter(([, c]) => !!c.variant_of).length;
    return pages.length + " pages · " +
      Object.keys(d.activities || {}).length + " activities · " +
      (custom || controllers.length) + (custom ? " custom" : "") + " controllers";
  });
  const address = $derived("/local/harmonium/" +
    (app.workspace === "main" || app.workspace === "scratch" ? "" : app.workspace + "/"));
</script>

{#if d}
  <div class="space-y-5" data-map>
    <!-- title block (mock 3a): name, the numbers, the address -->
    <div>
      <h2 class="m-0 text-[20px] font-semibold tracking-[-0.01em] text-ink">
        {app.workspaces[app.workspace]?.name || (app.workspace === "scratch" ? "Scratch" : app.workspace)} workspace
      </h2>
      <p class="m-0 pt-1 text-[13px] text-dim">
        {summary} · live at <span class="font-mono text-[12px]">{address}</span>
      </p>
      <p class="m-0 pt-3 text-[11px] text-dim">
        <span class="font-semibold tracking-[.08em] uppercase">Pages</span>
        <span class="pl-2">screens on the remote · every card is read-only — Edit opens the real editor</span>
      </p>
    </div>

    <div class="flex items-start gap-4">
      <!-- pages, two columns -->
      <div class="grid min-w-0 flex-1 grid-cols-2 items-start gap-4">
        {#each pages as [sid, scr] (sid)}
          <div class={"rounded-[12px] border bg-tile " +
            (isEmptyPage(sid, scr) ? "border-dashed border-line-strong" : "border-line")}>
            <!-- header: WASHED title bar with a bottom border (the
                 item-card treatment, Suresh's call — controllers keep
                 their plain cards); the NAME wins the space fight -->
            <div class="flex items-center gap-2.5 rounded-t-[12px] border-b border-line bg-raised px-5 py-3">
              <span class="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[5px] bg-sunk text-[11px] font-bold text-dim">P</span>
              <span class="max-w-[60%] shrink-0 truncate text-[16px] font-semibold tracking-[-0.01em] text-ink">{nameOf(sid)}</span>
              <span class="min-w-0 truncate pt-[2px] font-mono text-[11.5px] text-faint">view.{sid}</span>
              <span class="flex-1"></span>
              <button class="shrink-0 cursor-pointer border-0 bg-transparent p-0 text-[12.5px] font-medium text-dim transition-colors hover:text-accent-text hover:underline"
                onclick={() => selectSlice(editKey(sid))}>Edit</button>
            </div>
            <!-- badges: parent stated, keys as a badge -->
            <div class="flex flex-wrap items-center gap-1.5 px-5 pt-3">
              {#if sid === rootPage}
                <span class="rounded-[4px] bg-ok/12 px-[7px] py-[3px] text-[9.5px] font-semibold tracking-[.06em] text-ok uppercase">Root page</span>
              {/if}
              {#if sid === d.home_screen && d.home_screen !== rootPage}
                <span class="rounded-[4px] bg-accent-wash px-[7px] py-[3px] text-[9.5px] font-semibold tracking-[.06em] text-accent-text uppercase"
                  title="Boot view — where a remote lands on startup and Home">Boots here</span>
              {/if}
              {#if scr.parent}
                <span class="text-[12px] text-dim">in <b class="font-semibold text-ink">{parentName(scr.parent)}</b></span>
              {/if}
              {#if keysBound(scr)}
                <span class="rounded-[4px] bg-accent-wash px-[7px] py-[3px] text-[9.5px] font-semibold tracking-[.06em] text-accent-text uppercase">{keysBound(scr)} keys bound</span>
              {/if}
              {#if scr.drawer}
                <span class="rounded-[4px] border border-line px-[7px] py-[3px] text-[9.5px] font-semibold tracking-[.06em] text-dim uppercase">Drawer · pops back</span>
              {/if}
              {#if scr.banner && scr.banner.enabled !== false}
                <span class="rounded-[4px] border border-line px-[7px] py-[3px] text-[9.5px] font-semibold tracking-[.06em] text-dim uppercase">Hero card on</span>
              {/if}
            </div>
            <!-- tab strip (§7.3: Activities · Presets · Devices, doorways
                 INSIDE Devices — the doorway note shows on the active tab
                 so the strip never wraps at card width) -->
            <div class="flex items-end border-b border-line px-4 pt-2">
              {#each [
                { k: "a", label: "Activities", n: acts(sid).length },
                { k: "p", label: "Presets", n: presets(scr).length },
                { k: "d", label: "Devices", n: devices(scr).length,
                  extra: doorways(scr) ? doorways(scr) + " doorway" + (doorways(scr) > 1 ? "s" : "") : "" },
              ] as t (t.k)}
                <button class={"cursor-pointer border-0 bg-transparent px-2 py-[9px] text-[12.5px] whitespace-nowrap transition-colors " +
                    (tabOf(sid, scr) === t.k
                      ? "font-semibold text-accent-text [box-shadow:inset_0_-2px_0_var(--color-accent)]"
                      : "font-medium text-dim hover:text-ink")}
                  onclick={() => (cardTab[sid] = t.k)}>
                  {t.label} <span class="text-[11px] font-normal text-faint">{t.n}</span>
                </button>
              {/each}
            </div>
            <!-- rows: bordered, name + detail (counts summarize, rows
                 tell); min-height keeps sibling cards level (mock: tabs
                 keep the card ONE height whatever the page holds) -->
            <div class="min-h-[158px] space-y-1.5 px-4 py-3">
              {#each rowsOf(sid, scr).slice(0, 3) as row, ri (ri)}
                <div class="flex items-center gap-2.5 rounded-[8px] border border-line px-3 py-[9px]">
                  {#if row.color}
                    <span class="h-2 w-2 shrink-0 rounded-full" style="background:{row.color}"></span>
                  {:else if row.code}
                    <span class="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[4px] bg-sunk text-[8.5px] font-bold text-dim">{row.code}</span>
                  {/if}
                  <span class="min-w-[35%] truncate text-[13px] font-semibold text-ink">{row.name}</span>
                  <span class="min-w-2 flex-1"></span>
                  {#if row.detail}
                    <span class={"min-w-0 max-w-[60%] truncate text-right " +
                      (row.mono ? "font-mono text-[11px] text-faint" : "text-[12px] text-dim")}>{row.detail}</span>
                  {/if}
                </div>
              {:else}
                <p class="m-0 px-1 py-1 text-[12.5px] leading-relaxed text-dim">{emptyLine(sid, scr)}</p>
              {/each}
              {#if rowsOf(sid, scr).length > 3 || (tabOf(sid, scr) === "d" && doorways(scr))}
                <div class="flex items-baseline px-1 pt-0.5">
                  {#if rowsOf(sid, scr).length > 3}
                    <span class="text-[12px] font-medium text-accent-text">+ {rowsOf(sid, scr).length - 3} more</span>
                  {/if}
                  <span class="flex-1"></span>
                  {#if tabOf(sid, scr) === "d" && doorways(scr)}
                    <span class="text-[11px] text-faint">{doorways(scr)} doorway{doorways(scr) > 1 ? "s" : ""} among them</span>
                  {/if}
                </div>
              {/if}
            </div>
            {#if subpages(sid).length}
              <div class="flex items-baseline gap-3 border-t border-line px-5 py-2.5">
                <span class="text-[9.5px] font-semibold tracking-[.08em] text-faint uppercase">Subpages</span>
                <span class="text-[12.5px] text-ink-2">{subpages(sid).join(" · ")}</span>
              </div>
            {/if}
          </div>
        {/each}
      </div>

      <!-- controllers, the third column: what a row opens -->
      {#if controllers.length}
        <div class="w-[292px] shrink-0 space-y-3">
          <p class="m-0 text-[11px] text-dim">
            <span class="font-semibold tracking-[.08em] uppercase">Controllers</span>
            <span class="pl-2">what an activity lands on</span>
          </p>
          {#each storyControllers as [cid, c] (cid)}
            <div class="rounded-[12px] border border-line bg-tile px-4 py-3.5">
              <div class="flex items-center gap-2">
                <span class="flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-[5px] bg-sunk text-[10px] font-bold text-dim">C</span>
                <span class="truncate text-[13.5px] font-semibold text-ink">{c.name || cid}</span>
                <span class="flex-1"></span>
                {#if c.variant_of}
                  <span class="rounded-[4px] bg-accent-wash px-[6px] py-[2px] text-[9px] font-semibold tracking-[.06em] text-accent-text uppercase">Edited</span>
                {:else}
                  <span class="rounded-[4px] border border-line px-[6px] py-[2px] text-[9px] font-semibold tracking-[.06em] text-dim uppercase">Stock</span>
                {/if}
                <button class="shrink-0 cursor-pointer border-0 bg-transparent p-0 text-[12px] font-medium text-dim transition-colors hover:text-accent-text hover:underline"
                  onclick={() => selectSlice("controller." + cid)}>Edit</button>
              </div>
              <div class="pt-1 font-mono text-[11px] text-faint">controller.{cid}</div>
              {#if ctrlSections(cid).length || ctrlDrawers(cid).length}
                <div class="flex flex-wrap gap-1.5 pt-2.5">
                  {#each ctrlSections(cid) as sec (sec)}
                    <span class="rounded-full border border-line-strong bg-surface px-[9px] py-[3px] text-[11px] font-medium text-ink-2">{sec}</span>
                  {/each}
                  {#each ctrlDrawers(cid) as dr (dr.sid)}
                    <button class="cursor-pointer rounded-full border border-line-strong bg-surface px-[9px] py-[3px] text-[11px] font-medium text-ink-2 transition-colors hover:border-accent/60 hover:text-accent-text"
                      title={"A library drawer this controller opens — edit " + dr.name}
                      onclick={() => selectSlice("screens." + dr.sid)}>→ {dr.name}</button>
                  {/each}
                </div>
              {/if}
              {#if sharers(cid).length > 1}
                <p class="m-0 pt-2 text-[12px] leading-relaxed text-dim">
                  Shared by <b class="font-semibold text-ink">{sharers(cid).slice(0, -1).join(", ")}</b>
                  and <b class="font-semibold text-ink">{sharers(cid).at(-1)}</b> —
                  an edit here reaches both.
                </p>
              {:else if sharers(cid).length === 1}
                <p class="m-0 pt-2 text-[12px] leading-relaxed text-dim">
                  Used by <b class="font-semibold text-ink">{sharers(cid)[0]}</b>.
                  Duplicate it to make a variant without touching this one.
                </p>
              {/if}
            </div>
          {/each}
          {#if quietStock.length}
            <div class="rounded-[12px] border border-line bg-glass px-4 py-3.5">
              <p class="m-0 text-[12.5px] font-semibold text-ink">Stock device pages</p>
              <p class="m-0 pt-1.5 text-[12px] leading-relaxed text-dim">
                {quietStock.join(" · ")}. Device rows open these — nothing
                to do until you want one to look different.
              </p>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
{/if}
