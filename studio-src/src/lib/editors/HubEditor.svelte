<script>
  /* THE HUB EDITOR — one editor for every hub. The hub IS the page:
     identity/structure, hero, tile sections — and when the hub is a
     room (owner of activities), its activities, room functions, and
     the config-level Advanced knobs appear too. Comfort and Music
     Library are the same editor with those bits absent (and they can
     be turned on). Apps is a hub too — a drawer whose content is the
     generated registry grid. */
  import { app, ownedActivities, roomIds, schedulePreview, renameScreen, deleteScreen, setStatus, subordinateScreens, isControllerScreen, confirmPageDraft, discardPageDraft, stampHost, snippetsOf, presetSnippetTile } from "../state.svelte.js";
  import Field from "../components/Field.svelte";
  import JsonArea from "../components/JsonArea.svelte";
  import NoteStrip from "../components/NoteStrip.svelte";
  import Input from "../components/Input.svelte";
  import Select from "../components/Select.svelte";
  import Switch from "../components/Switch.svelte";
  import Chips from "../components/Chips.svelte";
  import EntityPicker from "../components/EntityPicker.svelte";
  import ActivityCard from "../components/ActivityCard.svelte";
  import SectionFold from "../components/SectionFold.svelte";
  import UploadBtn from "../components/UploadBtn.svelte";
  import SectionHeader from "../components/SectionHeader.svelte";
  import Segmented from "../components/Segmented.svelte";
  import SourceChip from "../components/SourceChip.svelte";
  import NumberField from "../components/NumberField.svelte";
  import TileRow from "../components/TileRow.svelte";
  import PageSettings from "./PageSettings.svelte";
  import Button from "../components/Button.svelte";

  let { screenId } = $props();
  const d = $derived(app.draft);
  const scr = $derived(d?.screens?.[screenId]);
  const screenIds = $derived(Object.keys(d?.screens || {}).filter((s) => s !== screenId));
  /* owner room = it appears in roomIds (the rooms-overview hub is a
     room-scope hub but owns no activities) */
  const isOwnerRoom = $derived(roomIds().includes(screenId));
  const owned = $derived(ownedActivities(screenId));
  const edit = () => schedulePreview();
  const KEYS = ["up", "down", "left", "right", "select", "back", "home", "power",
    "menu", "vol_up", "vol_down", "mute", "ch_up", "ch_down"];

  let heroOpen = $state(false);
  let actsOpen = $state(true);
  /* returning from a ＋-minted action draft — or from the pre-wired
     device library (v0.61) — re-opens the exact card AND scrolls to
     it: on a room with five activities, landing "somewhere on the
     page" is not landing where you left */
  let actEls = $state({});
  $effect(() => {
    if (app.focusActivity && d?.activities?.[app.focusActivity]) {
      const want = app.focusActivity;
      lastAdded = want;
      actsOpen = true;
      app.focusActivity = null;
      requestAnimationFrame(() =>
        actEls[want]?.scrollIntoView({ block: "start", behavior: "smooth" }));
    }
  });
  /* the page id AUTO-FOLLOWS the name (slug) until hand-pinned —
     same rule as activity ids; renameScreen walks every ref */
  const pslug = (s) =>
    (s || "").toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  let pageAutoBefore = false;
  /* auto includes any page still wearing the starter id "home" —
     RETROACTIVE (v0.43.9b): workspaces born before the fix already
     renamed the NAME, so gating on name==="New Room" left them
     stranded; a page whose id is literally "home" follows the name,
     full stop (a hand-typed id is never "home" by accident) */
  const pageIsAuto = () => /^new_view/.test(screenId) || screenId === pslug(scr?.name) ||
    screenId === "home";
  function autoRenamePage() {
    if (!pageAutoBefore) return;
    let nid = pslug(scr.name);
    if (!nid || nid === screenId) return;
    if (d.screens[nid]) {
      let n = 2;
      while (d.screens[nid + "_" + n]) n++;
      nid = nid + "_" + n;
    }
    renameScreen(screenId, nid);
  }
  let ctOpen = $state(false);
  /* clipboard on a LAN Studio (v0.85.7 — Suresh: "Click to copy
     doesn't copy"): navigator.clipboard exists ONLY in secure
     contexts, and the Studio lives on http://<ha-ip>:8123 — so the
     textarea + execCommand path is the PRIMARY one here, not a
     legacy fallback. The clipboard API is the backup for anyone
     serving the Studio over https. Last resort: the status bar
     shows the full URL so it can at least be read off. */
  function copyLink(label, url) {
    let ok = false;
    try {
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      ok = document.execCommand("copy");
      ta.remove();
    } catch (e) { ok = false; }
    if (ok) { setStatus(label + " link copied", "ok"); return; }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(
        () => setStatus(label + " link copied", "ok"),
        () => setStatus(url, "ok"));
      return;
    }
    setStatus(url, "ok");
  }
  /* PAGE SETTINGS PANEL (redesign §6.4): Layout · Keys · Advanced */
  let pgOpen = $state(false);
  const keysCount = () =>
    Object.keys(scr?.buttons || {}).length +
    (scr?.power ? 1 : 0) + (scr?.parent ? 1 : 0) + (scr?.drawer ? 1 : 0);
  let lastAdded = $state(null);
  let secOpen = $state({});

  /* canonical anatomy: every hub has the same folds. Sections carry
     ROLES (activities/presets/devices/custom); older drafts without
     roles are inferred here the same way the compiler does. */
  const roleOf = (s) => {
    if (s.role) return s.role;
    const types = new Set((s.tiles || []).map((t) => t.type));
    if (types.has("activity") || types.has("activities")) return "activities";
    /* "presets" — the v0.64 GENERATOR — was missing here, so a hub
       section built from it fell through to "devices" and appeared
       under the wrong fold with an empty Presets fold above it
       (Suresh, with a screenshot: "isn't this what this section is
       for?"). An explicit `role` always wins; this is the guess for
       sections that carry none. */
    if (types.has("preset") || types.has("presets") ||
        types.has("presets_from")) return "presets";
    if (types.has("apps")) return "custom";
    return types.size ? "devices" : "custom";
  };
  const indexed = $derived((scr?.sections || []).map((s, i) => ({ s, i })));
  const roleSection = (role) => indexed.find(({ s }) => roleOf(s) === role) || null;
  const customSections = $derived(indexed.filter(({ s, i }) => {
    const r = roleOf(s);
    if (r === "activities") return false;
    if (r === "presets" || r === "devices") return roleSection(r)?.i !== i;
    return true;
  }));
  function addRoleSection(role, label) {
    if (!scr.sections) scr.sections = [];
    /* INSERT AT THE LITURGY SLOT (v0.79.1 — Suresh: "On my Main Porch
       Presets are after activities… In my Scratch Porch Page they
       appear under Devices?"): this editor DISPLAYS Hero → Activities
       → Presets → Devices whatever the array order, but the ENGINE
       renders the array as written — and push() dumped a new Presets
       section after Devices, a lie the editor then hid. A role section
       lands before the first section whose liturgy rank is higher;
       custom sections have no rank and are never disturbed. */
    const LITURGY = { activities: 0, presets: 1, devices: 2 };
    const mine = LITURGY[role];
    let at = scr.sections.length;
    if (mine != null)
      for (let i = 0; i < scr.sections.length; i++) {
        const r = LITURGY[roleOf(scr.sections[i])];
        if (r != null && r > mine) { at = i; break; }
      }
    scr.sections.splice(at, 0, { role, hero_label: label, tiles: [] });
  }
  function addSection() {
    if (!scr.sections) scr.sections = [];
    scr.sections.push({ role: "custom", hero_label: "New group", tiles: [] });
    secOpen[scr.sections.length - 1] = true;
  }
  function newTile(tiles) {
    /* a device STARTS with a name and an entity — everything else
       (renderer, icon, verbs, page) infers from the entity.
       span 2 (full width) is the default — most devices want it */
    tiles.push({ type: "device", id: "tile_" + Math.random().toString(36).slice(2, 6),
      label: "New device", icon: "material:devices", entity: "", span: 2 });
  }
  function newNavTile(tiles) {
    /* a DOORWAY: a card that opens another page — the Devices zone
       holds devices and doorways to more devices (paradigm §5) */
    tiles.push({ type: "nav", id: "tile_" + Math.random().toString(36).slice(2, 6),
      label: "New nav", icon: "material:layers" });
  }
  function newPresetTile(tiles) {
    /* a PRESET: one-touch shortcut — pick what it does on its card */
    tiles.push({ type: "preset", id: "tile_" + Math.random().toString(36).slice(2, 6),
      label: "New preset", icon: "material:play_circle", action: {} });
  }

  /* ---- BLESSED SECTIONS (redesign R2): the liturgy Hero →
     Activities → Presets → Devices, each with a switch. Off ≠ empty:
     enabled:false keeps items but stops rendering on the remote. ---- */
  const secEnabled = (s) => !!s && s.enabled !== false;
  function toggleRoleSec(role, label) {
    const rs = roleSection(role);
    if (!rs) {                       // switching ON creates the section
      if (role === "activities") ensureActivitiesGenerator();
      else addRoleSection(role, label);
      return;
    }
    if (rs.s.enabled === false) delete rs.s.enabled;
    else rs.s.enabled = false;
  }
  function toggleHero() {
    if (!scr.banner) {
      scr.banner = { image: "", image_opacity: 0.5, height: "230px",
        min_height: "150px", show_time: true };
      return;
    }
    if (scr.banner.enabled === false) delete scr.banner.enabled;
    else scr.banner.enabled = false;
  }
  const secSummary = (s) =>
    ((s?.columns ?? scr?.grid?.columns ?? 2)) + " cols" +
    (s?.columns ? "" : " · from page");
  let secSet = $state({});            // which settings strips are open
  /* ACCORDION (v0.43.6): editor-only folds per section — never
     written to config; reverting the treatment = SectionHeader's
     note + these wrappers become inert */
  let secFold = $state({});
  /* an in-flight ＋-minted PAGE draft (this page IS the draft) */
  const pageDraft = $derived(app.pending?.kind === "page" && app.pending.sid === screenId
    ? app.pending : null);
  const draftFrom = $derived.by(() => {
    if (!pageDraft) return "";
    if (pageDraft.activityId)
      return d?.activities?.[pageDraft.activityId]?.name || pageDraft.activityId;
    if (pageDraft.ownerScreen)
      return d?.screens?.[pageDraft.ownerScreen]?.name ||
        d?.controllers?.[pageDraft.ownerScreen]?.name || pageDraft.ownerScreen;
    return "";
  });

  function ensureActivitiesGenerator() {
    if (!scr.sections) scr.sections = [];
    let sec = indexed.find(({ s }) => roleOf(s) === "activities")?.s;
    if (!sec) {
      sec = { role: "activities", hero_label: "Activities", tiles: [] };
      scr.sections.unshift(sec);
    }
    const hasGen = (sec.tiles || []).some(
      (t) => t.type === "activities" && (t.room || null) === screenId);
    const hasRefs = (sec.tiles || []).some((t) => t.type === "activity");
    if (!hasGen && !hasRefs)
      sec.tiles.push({ id: "acts", type: "activities", room: screenId });
  }
  /* the page's collective cast (v0.83.7): every owned activity's
     entities, for the preset pickers' preferred list */
  const pageCastEnts = $derived.by(() => {
    const out = [];
    for (const aid of owned) {
      const a = d.activities?.[aid] || {};
      (Array.isArray(a.devices) ? a.devices : []).forEach((e) => {
        if (typeof e === "string" && e.includes(".") && !out.includes(e)) out.push(e);
      });
      Object.values(a.context || {}).forEach((v) => {
        if (typeof v === "string" && v.includes(".") && !out.includes(v)) out.push(v);
      });
    }
    return out;
  });
  function addActivity() {
    /* the first activity makes this page a HOST — sticky (the minted
       select lives as long as the page; no toggle, no ceremony) */
    stampHost(scr);
    ensureActivitiesGenerator();
    let id = "new_activity", n = 2;
    while (d.activities[id]) id = "new_activity_" + n++;
    d.activities[id] = {
      name: "New Activity", icon: "material:play_circle", color: "#e89b17",
      start: "", context: {}, screen: "", confirm_end: true,
      room_view: screenId,
    };
    lastAdded = id;
    actsOpen = true;
  }
  function moveActivity(id, dir) {
    const keys = Object.keys(d.activities);
    const mine = keys.filter((k) => owned.includes(k));
    const mi = mine.indexOf(id);
    const swapWith = mine[mi + dir];
    if (!swapWith) return;
    const i = keys.indexOf(id), j = keys.indexOf(swapWith);
    [keys[i], keys[j]] = [keys[j], keys[i]];
    const rebuilt = {};
    for (const k of keys) rebuilt[k] = d.activities[k];
    d.activities = rebuilt;
  }
</script>
{#if scr}
  <div class="space-y-4">
    <NoteStrip dismissKey="hub">
      <b>A page is one screen on the remote.</b> It holds activities
      (what you're doing), presets and devices; keys pressed here follow
      the key bindings below.
    </NoteStrip>
    {#if pageDraft}
      <div class="flex flex-wrap items-center gap-3 rounded-[10px] border border-accent/50 bg-accent/10 px-3 py-2">
        <span class="text-sm text-ink">
          Drafting the page <b>{scr.name || screenId}</b>{#if draftFrom}
            &nbsp;for <b>{draftFrom}</b>{/if} — it's already live in the
          preview; <i>Discard removes it and unlinks</i>.
        </span>
        <Button size="sm" onclick={confirmPageDraft}>✓ Keep this page</Button>
        <Button size="sm" variant="danger" onclick={discardPageDraft}>✕ Discard</Button>
      </div>
    {/if}
    <div class="grid grid-cols-2 gap-4">
      <Field label="Name">
        <Input value={scr.name}
          onfocus={() => (pageAutoBefore = pageIsAuto())}
          oninput={(e) => { scr.name = e.target.value;
            if (isOwnerRoom || screenId === d.home_screen) d.global.room = e.target.value;
            edit(); }}
          onchange={autoRenamePage} />
      </Field>
      <Field label="Page id">
        <input value={screenId} spellcheck="false"
          onchange={(e) => { if (!renameScreen(screenId, e.target.value)) e.target.value = screenId; }}
          class="w-full rounded-[8px] border border-line bg-field px-2.5 py-1.5 font-mono text-[12.5px] text-ink outline-none focus:border-accent/60" />
      </Field>
      <!-- DIRECT LINKS (v0.85.7, round 5 — Suresh: "why don't [we]
           let the path take the full width of the panel?"): the two
           copy lines span BOTH columns under the Name/Page-id row,
           so a kiosk URL almost never wraps. The plain browser link,
           and — when the preview is Showing a specific remote — the
           same link with &device=<profile>, which pins that profile
           on whatever opens it (a kiosk's complete configured URL).
           Both use the <ws>/ STUB path, main included:
           version-busted, and the stub forwards the hash. -->
      {#if scr}
        {@const linkBase = location.origin + "/local/harmonium/" +
          (app.workspace || "main") + "/index.html#page=" + screenId}
        {@const devLink = app.device && app.device !== "default"
          ? linkBase + "&device=" + encodeURIComponent(app.device) : null}
        <div class="col-span-2 -mt-2">
          {#snippet copyLine(label, url, what)}
            <button type="button"
              class="mt-1 flex w-full cursor-pointer items-baseline gap-1.5 rounded-[6px] border-0 bg-transparent p-0 text-left font-mono text-[11px] text-dim hover:text-accent"
              title={what + " — click to copy"}
              onclick={() => copyLink(label, url)}
            ><span class="shrink-0 text-faint">{label}:</span><span class="min-w-0 break-all">🔗 {url}</span></button>
          {/snippet}
          {@render copyLine("browser", linkBase, "Direct link to this page")}
          {#if devLink}
            {@render copyLine(app.device, devLink,
              "Same link, pinned to the " + app.device + " profile (the preview's Showing device) — a kiosk's complete configured URL")}
          {/if}
        </div>
      {/if}
      {#if isOwnerRoom}
        <div class="flex items-end gap-6 pb-1.5">
          <Switch bind:checked={d.global.confirm_switch} label="Confirm activity switch" onCheckedChange={edit} />
          <Switch bind:checked={d.global.debug} label="Key debug" onCheckedChange={edit} />
        </div>
      {/if}
    </div>

    <!-- PAGE SETTINGS PANEL (redesign §6.4): sizing, keys and the
         config-level knobs behind ONE button — the liturgy sections
         below stay the page's whole story -->
    <div class="flex items-center gap-2">
      <button class={"cursor-pointer rounded-[6px] border px-2.5 py-[7px] text-[11px] font-medium transition-colors " +
          (pgOpen ? "border-accent/60 bg-accent-wash text-accent-text"
            : "border-line-strong bg-surface text-ink-2 hover:bg-sunk")}
        onclick={() => (pgOpen = !pgOpen)}>Page settings</button>
      {#if !pgOpen}
        <span class="text-[11px] text-dim">
          {(scr.grid?.columns ?? 2) + " cols"} · {keysCount()} keys bound
        </span>
      {/if}
    </div>
    {#if pgOpen}
      <PageSettings {screenId} {keysCount} />
    {/if}

    <!-- HERO — any hub can have one; its settings ARE its body, so
         the chevron and the Section settings button share one state -->
    <SectionHeader title="Hero" count={scr.banner && scr.banner.enabled !== false ? 1 : 0}
      enabled={!!scr.banner && scr.banner.enabled !== false} onToggle={toggleHero}
      bind:settingsOpen={() => secSet.hero ?? false, (v) => (secSet.hero = v)}
      bind:collapsed={() => !(secSet.hero ?? false), (v) => (secSet.hero = !v)}>
      {#if scr.banner}
      <div class={"space-y-3 rounded-[9px] border border-line bg-surface p-3 " + (scr.banner.enabled === false ? "opacity-50" : "")}>
        <div class="flex flex-wrap items-center gap-6">
          <Switch checked={scr.banner.tabs !== false} label="Section tabs"
            onCheckedChange={(v) => { if (v) delete scr.banner.tabs; else scr.banner.tabs = false; }} />
          <Switch bind:checked={scr.banner.show_time} label="Show clock" />
          <Switch checked={scr.banner.fit !== false} label="Self-fitting height"
            onCheckedChange={(v) => { if (v) delete scr.banner.fit; else scr.banner.fit = false; edit(); }} />
        </div>
        <p class="m-0 text-[11px] text-dim">
          Self-fitting: the hero treats Height as a ceiling and shrinks
          (never below the floor) so a whole number of tiles fits above
          the fold — that's why height edits seem to move in tile-sized
          steps, and why each device lands slightly differently. Switch
          it off for the exact height, always (a tile may then be cut at
          the fold until you scroll).
        </p>
        <div class="grid grid-cols-2 gap-3">
          <Field label="Title override" hint="blank = the hub's name">
            <Input bind:value={scr.banner.title} placeholder={scr.name || screenId} />
          </Field>
          <Field label="Image" hint="path under /local/ (HA www/) — or upload one">
            <div class="flex items-center gap-1.5">
              <Input bind:value={scr.banner.image} placeholder="/local/images/Porch_Render.jpg" class="font-mono text-[12.5px]" />
              <!-- v0.83.8 (beta-gaps P1 #7): pick or drop a picture;
                   it uploads to www/harmonium/images/ and the path
                   lands here — no Samba, no file editor -->
              <UploadBtn onDone={(p) => { scr.banner.image = p; edit(); }} />
            </div>
          </Field>
          <Field label="Image opacity">
            <Input type="number" min="0" max="1" step="0.05" bind:value={scr.banner.image_opacity} />
          </Field>
          <Field label="Height" hint={scr.banner.fit === false ? "exact" : "ceiling — self-fit may shrink it"}>
            <Input bind:value={scr.banner.height} placeholder="230px" /></Field>
          <Field label="Height floor" hint={scr.banner.fit === false ? "unused while self-fit is off" : "self-fit never shrinks below this"}>
            <Input bind:value={scr.banner.min_height} placeholder="150px" /></Field>
          <Field label="Home chip goes to" hint={screenIds.length ? "blank = up the Home ladder" : ""}>
            {#if screenIds.length}
              <Select bind:value={scr.banner.rooms_screen} options={screenIds} allowEmpty />
            {:else}
              <p class="m-0 pt-2 text-xs text-dim">this is the only page — the chip has nowhere to go yet</p>
            {/if}
          </Field>
        </div>
      </div>
      {:else}
        <p class="m-0 text-xs text-dim">No hero — this page renders a plain title bar. Switch Hero on to add one.</p>
      {/if}
    </SectionHeader>

    {#snippet secSettings(sec)}
      {#if sec}
        <div class="grid grid-cols-3 items-start gap-3 rounded-[9px] border border-line bg-surface p-3">
          <Field label="Heading" hint="shown on the page above this section; blank = none">
            <Input value={sec.title ?? ""} onchange={(e) => { if (e.target.value.trim()) sec.title = e.target.value.trim(); else delete sec.title; }} />
          </Field>
          <Field label="Jump label" hint="this section's shortcut name — it becomes a tappable chip in the page's hero AND a stop the CH ▲▼ keys jump to; blank = no chip, and CH jumping skips this section">
            <Input value={sec.hero_label ?? ""} onchange={(e) => { if (e.target.value.trim()) sec.hero_label = e.target.value.trim(); else delete sec.hero_label; }} />
          </Field>
          <Field label="Grid columns" hint="inherit uses the page's grid">
            <Segmented value={sec.columns ?? 0}
              options={[{ value: 0, label: "inherit" }, 1, 2, 3, 4]}
              onchange={(v) => { if (v) sec.columns = v; else delete sec.columns; }} />
          </Field>
          <!-- SECTION STYLE DEFAULTS (v0.85.7 — "so it applies to all
               devices unless overridden"): every card in this section
               inherits these unless it states its own on its Styling
               tab / Advanced JSON. -->
          <Field label="Card height (all cards here)"
            hint="px (210) or a css length — a card's own Styling height overrides">
            <Input value={sec.h ?? ""} placeholder="page default"
              class="font-mono text-[12px]"
              onchange={(e) => { const v = String(e.target.value).trim();
                if (v) sec.h = /^\d+$/.test(v) ? +v : v; else delete sec.h; edit(); }} />
          </Field>
          <Field label="Label position (all cards here)"
            hint="photo cards only — a card's own setting overrides">
            <Select value={sec.label_pos ?? ""}
              onchange={(e) => { if (e.target.value) sec.label_pos = e.target.value; else delete sec.label_pos; edit(); }}
              options={[{ value: "", label: "default (bottom-left)" },
                "top-left", "top-center", "top-right",
                "center-left", "center", "center-right",
                "bottom-center", "bottom-right"]} />
          </Field>
          <Field label="Image opacity (all cards here)"
            hint="photo cards — how much photo shows over the dark card; a card's own setting overrides (blank = 0.85)">
            <Input type="number" min="0" max="1" step="0.05" placeholder="0.85"
              value={sec.image_opacity ?? ""}
              onchange={(e) => { const v = e.target.value;
                if (v === "" || v == null) delete sec.image_opacity;
                else sec.image_opacity = Math.max(0, Math.min(1, +v));
                edit(); }} />
          </Field>
          <!-- FULL ROW (v0.85.7 — Suresh's annotated screenshot: the
               example hint wrapped cramped under the one-column box
               while two empty columns sat beside it — "we can have
               expanded text to the right of the box, loads of white
               space"). The field spans the row: box on the left, the
               example breathing to its right. -->
          <!-- his layout (two annotated screenshots): full example →
               key legend → scope sentence bottom, everything level
               with the box so nothing spills below it. The example
               is VALID JSON on purpose — made to be copy-pasted
               straight in. This snippet renders identically for
               activities, presets, devices and custom sections, and
               is the template for every future css_vars surface. -->
          <div class="col-span-3">
            <Field label="CSS variables (all cards here)">
              <div class="flex items-start gap-4">
                <div class="w-1/3 shrink-0">
                  <JsonArea value={sec.css_vars ?? {}} rows={4}
                    onchange={(v) => { if (v && Object.keys(v).length) sec.css_vars = v; else delete sec.css_vars; edit(); }} />
                </div>
                <div class="min-w-0 flex-1 pt-0.5 text-[11px] leading-relaxed text-dim">
                  <pre class="m-0 overflow-x-auto whitespace-pre rounded-[6px] bg-sunk px-2.5 py-1.5 font-mono text-[11px] text-ink-2">{
`{ "--fs-1": "17px", "--fw-1": "700", "--fs-2": "12px",
  "--lbl-shadow": "0 1px 3px rgba(0,0,0,.8)", "--tile-shadow": "0 4px 12px rgba(0,0,0,.4)" }`}</pre>
                  <p class="mb-0 mt-1">
                    label size · weight · second-line size · text shadow · card shadow
                    <span class="italic">— applies to every card in this section; a card's own css_vars win key-by-key</span>
                  </p>
                </div>
              </div>
            </Field>
          </div>
        </div>
      {/if}
    {/snippet}

    <!-- ACTIVITIES — every hub can own them; off until it does -->
    <SectionHeader title="Activities" count={owned.length}
      enabled={roleSection("activities") ? secEnabled(roleSection("activities").s) : owned.length > 0}
      onToggle={() => toggleRoleSec("activities", "Activities")}
      gridSummary={roleSection("activities") ? secSummary(roleSection("activities").s) : ""}
      bind:settingsOpen={() => secSet.acts ?? false, (v) => (secSet.acts = v)}
      addLabel="＋ Add activity" onAdd={addActivity}
      bind:collapsed={() => secFold.acts ?? false, (v) => (secFold.acts = v)}>
      {#if secSet.acts}{@render secSettings(roleSection("activities")?.s)}{/if}
      <div class={"space-y-3 " + (roleSection("activities") && !secEnabled(roleSection("activities").s) ? "opacity-50" : "")}>
        {#each owned as id, i (id)}
          <div bind:this={actEls[id]}>
            <ActivityCard {id} open={id === lastAdded}
              onrename={(nid) => (lastAdded = nid)}
              onup={i > 0 ? () => moveActivity(id, -1) : null}
              ondown={i < owned.length - 1 ? () => moveActivity(id, 1) : null} />
          </div>
        {:else}
          <p class="m-0 text-xs text-dim">No activities yet — an activity is something you do here (Watch TV, Listen to Music). ＋ Add activity starts one.</p>
        {/each}
      </div>
    </SectionHeader>

    <!-- PRESETS — blessed section -->
    <SectionHeader title="Presets" count={roleSection("presets")?.s.tiles?.length ?? 0}
      enabled={roleSection("presets") ? secEnabled(roleSection("presets").s) : false}
      onToggle={() => toggleRoleSec("presets", "Presets")}
      gridSummary={roleSection("presets") ? secSummary(roleSection("presets").s) : ""}
      bind:settingsOpen={() => secSet.presets ?? false, (v) => (secSet.presets = v)}
      addLabel="＋ Add preset"
      onAdd={() => { if (!roleSection("presets")) addRoleSection("presets", "Presets"); newPresetTile(roleSection("presets").s.tiles); }}
      actions={presetActions}
      bind:collapsed={() => secFold.presets ?? false, (v) => (secFold.presets = v)}>
      {#if secSet.presets}{@render secSettings(roleSection("presets")?.s)}{/if}
      <!-- ⤵ IMPORT A PRESET SNIPPET (v0.79.1; wording unified v0.79.2
           — the standard grammar): shown only when there is something
           to import. Export lives on any preset row's ⋮ → Export
           snippet; the twin import door is an activity's Presets tab. -->
      {#snippet presetActions()}
        {#if snippetsOf("preset").length}
          <div class="relative flex h-[26px] shrink-0 items-center gap-1.5 rounded-[6px] border border-line-strong bg-surface px-2 text-[11px] font-medium text-ink-2 hover:bg-sunk">
            <svg class="pointer-events-none h-3.5 w-3.5" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 4v11m0 0-4-4m4 4 4-4" /><path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2" />
            </svg> Import snippet…
            <select value="" title="Import a saved preset snippet"
              onchange={(e) => { const t = presetSnippetTile(e.target.value);
                if (t) { if (!roleSection("presets")) addRoleSection("presets", "Presets");
                  const s = roleSection("presets").s;
                  if (!Array.isArray(s.tiles)) s.tiles = [];
                  s.tiles.push(t); schedulePreview(); }
                e.target.value = ""; }}
              class="absolute inset-0 w-full cursor-pointer opacity-0 outline-none">
              <option value=""></option>
              {#each snippetsOf("preset") as [sid, sn] (sid)}<option value={sid}>{sn.name}</option>{/each}
            </select>
          </div>
        {/if}
      {/snippet}
      {#if roleSection("presets")}
        {@const rs = roleSection("presets")}
        <div class={"space-y-2 " + (secEnabled(rs.s) ? "" : "opacity-50")}>
          {#each rs.s.tiles as tile, ti (ti)}
            <TileRow {tile} ownerScreen={screenId} tiles={rs.s.tiles} index={ti} castEnts={pageCastEnts} />
          {:else}
            <p class="m-0 text-xs text-dim">No presets yet — a preset is a one-touch shortcut (Netflix, a playlist, lights at 30%).</p>
          {/each}
        </div>
      {:else}
        <p class="m-0 text-xs text-dim">No presets yet — a preset is a one-touch shortcut (Netflix, a playlist, lights at 30%). ＋ Add preset starts the list.</p>
      {/if}
    </SectionHeader>

    <!-- DEVICES — blessed section (devices + doorways to more devices) -->
    <SectionHeader title="Devices" count={roleSection("devices")?.s.tiles?.length ?? 0}
      enabled={roleSection("devices") ? secEnabled(roleSection("devices").s) : false}
      onToggle={() => toggleRoleSec("devices", "Devices")}
      gridSummary={roleSection("devices") ? secSummary(roleSection("devices").s) : ""}
      bind:settingsOpen={() => secSet.devices ?? false, (v) => (secSet.devices = v)}
      addLabel="＋ Add device"
      onAdd={() => { if (!roleSection("devices")) addRoleSection("devices", "Devices"); newTile(roleSection("devices").s.tiles); }}
      add2Label="＋ Add nav"
      onAdd2={() => { if (!roleSection("devices")) addRoleSection("devices", "Devices"); newNavTile(roleSection("devices").s.tiles); }}
      bind:collapsed={() => secFold.devices ?? false, (v) => (secFold.devices = v)}>
      {#if secSet.devices}{@render secSettings(roleSection("devices")?.s)}{/if}
      {#if roleSection("devices")}
        {@const ds = roleSection("devices")}
        <div class={"space-y-2 " + (secEnabled(ds.s) ? "" : "opacity-50")}>
          {#each ds.s.tiles as tile, ti (ti)}
            <TileRow {tile} ownerScreen={screenId} tiles={ds.s.tiles} index={ti} castEnts={pageCastEnts} />
          {:else}
            <p class="m-0 text-xs text-dim">No devices yet — a device card controls one thing you own; a nav card opens another page (or another workspace).</p>
          {/each}
        </div>
      {:else}
        <p class="m-0 text-xs text-dim">No devices yet — a device card controls one thing you own; a nav card opens another page (or another workspace).</p>
      {/if}
    </SectionHeader>

    <!-- CUSTOM SECTIONS — the generalized machinery, kept visible when
         they exist; CREATING one lives behind Advanced mode -->
    {#each customSections as { s, i } (i)}
      <SectionHeader title={s.hero_label || s.title || "Section " + (i + 1)}
        count={s.tiles?.length ?? 0}
        enabled={secEnabled(s)}
        onToggle={() => { if (s.enabled === false) delete s.enabled; else s.enabled = false; }}
        gridSummary={secSummary(s)}
        bind:settingsOpen={() => secSet["c" + i] ?? false, (v) => (secSet["c" + i] = v)}
        addLabel="＋ Add device" onAdd={() => newTile(s.tiles)}
        add2Label="＋ Add nav" onAdd2={() => newNavTile(s.tiles)}
        bind:collapsed={() => secFold["c" + i] ?? false, (v) => (secFold["c" + i] = v)}>
        {#if secSet["c" + i]}
          {@render secSettings(s)}
          {#if !(s.tiles || []).length}
            <button class="cursor-pointer border-0 bg-transparent p-0 text-xs text-danger hover:underline"
              onclick={() => scr.sections.splice(i, 1)}>Delete this empty section</button>
          {/if}
        {/if}
        <div class={"space-y-2 " + (secEnabled(s) ? "" : "opacity-50")}>
          {#each s.tiles as tile, ti (ti)}
            <TileRow {tile} ownerScreen={screenId} tiles={s.tiles} index={ti} castEnts={pageCastEnts} />
          {/each}
        </div>
      </SectionHeader>
    {/each}
    {#if scr.tiles}
      <SectionHeader title="Ungrouped" count={scr.tiles.length}
        bind:settingsOpen={() => secSet.flat ?? false, (v) => (secSet.flat = v)}
        addLabel="＋ Add device" onAdd={() => newTile(scr.tiles)}
        add2Label="＋ Add nav" onAdd2={() => newNavTile(scr.tiles)}
        bind:collapsed={() => secFold.flat ?? false, (v) => (secFold.flat = v)}>
        <div class="space-y-2">
          {#each scr.tiles as tile, ti (ti)}
            <TileRow {tile} ownerScreen={screenId} tiles={scr.tiles} index={ti} castEnts={pageCastEnts} />
          {/each}
        </div>
      </SectionHeader>
    {/if}
    {#if app.advanced}
      <Button size="sm" onclick={addSection}>＋ Add custom section</Button>
    {/if}

    <!-- CONTROL TARGET (drawers pass keys through, e.g. Apps' power) -->
    <SectionFold label="Control target" badge={scr.control_target ? "keys pass to a device here" : "off — keys drive the app"} bind:open={ctOpen}>
      {#if scr.control_target}
        <div class="grid grid-cols-2 gap-3">
          <Field label="Label"><Input bind:value={scr.control_target.label} class="font-mono text-[12.5px]" /></Field>
          <Field label="Navigation (D-pad)"><Input bind:value={scr.control_target.navigation} placeholder="$context.dpad" class="font-mono text-[12.5px]" /></Field>
          <Field label="Power"><Input bind:value={scr.control_target.power} placeholder="$context.power" class="font-mono text-[12.5px]" /></Field>
          <Field label="Volume"><Input bind:value={scr.control_target.volume} placeholder="$context.volume" class="font-mono text-[12.5px]" /></Field>
        </div>
        <Field label="Keys passed to the device" hint="everything else stays with the app">
          <Chips suggestions={KEYS} placeholder="add key…"
            bind:items={() => scr.control_target.pass_through ?? [],
              (v) => (scr.control_target.pass_through = v)} />
        </Field>
        <Button size="sm" variant="danger" onclick={() => delete scr.control_target}>Remove control target</Button>
      {:else}
        <Button size="sm" onclick={() => (scr.control_target = { label: "$activity.name", navigation: "$context.dpad", power: "$context.power", volume: "$context.volume", pass_through: [] })}>Add control target</Button>
      {/if}
    </SectionFold>

    <div class="border-t border-line pt-3">
      <Button size="sm" variant="danger"
        onclick={() => { const r = deleteScreen(screenId);
          if (r !== true) setStatus("can't delete: " + r.join(" · "), "err"); }}>
        Delete this page</Button>
      <span class="ml-2 text-[11px] text-dim">refuses while anything still points here</span>
    </div>
  </div>
{/if}
