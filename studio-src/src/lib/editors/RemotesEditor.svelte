<script>
  /* REMOTES & KEYMAPS — the visual face (2026-08-20 — Suresh, on the
     battery alerts living in HA's automation editor: "That's highly
     unintuitive. It should live in studio. … At a minimum, we should
     have a System → Remotes -> Battery Alerts with a link to the
     automation so we can see it and turn it on/off").

     Two halves:
     1. PROFILES — what this workspace ships per remote model:
        capabilities, keymap size, skin, style. Summary cards for
        now; the keymap itself stays Code-tab / keys:-capture work.
     2. BATTERY ALERTS — the HA-side automations built on the
        harmonium battery blueprint, discovered LIVE from HA: the
        current level, tier profile, an on/off switch that flips the
        automation right here, and the door into HA's form for the
        numbers. The MACHINERY stays HA-side on purpose — it has to
        run while the device sleeps (the whole reason the engine-side
        beeper was parked) — this panel is the Studio's face on it.
        ROADMAP (0.84.2): create + edit the tiers right here, and
        grow this slice into the full per-remote hub (battery, skin,
        keymap, provisioning) — his "at a maximum". */
  import { app, token } from "../state.svelte.js";
  import Switch from "../components/Switch.svelte";
  import Field from "../components/Field.svelte";
  import EntityPicker from "../components/EntityPicker.svelte";

  /* BATTERY ON THE ⓘ PAGE (v0.84.8). Editable HERE rather than only on
     the Code tab — the forum round's lesson: a capability with no UI
     is, to a user, a capability that does not exist. Both entities come
     from the Fully Kiosk HA integration, the same source the
     battery-alerts blueprint uses. */
  function setSensor(r, key, v) {
    if (v) r[key] = v; else delete r[key];
  }

  const remotes = $derived(app.draft?.remotes || {});

  /* ---- THE FLEET (design-remote-fleet, 2026-09-02 — Suresh: "I now
     have 4 remotes registered with Harmonium... Surely I should see
     the remotes? And be able to manage them") — the units ledger the
     integration keeps from engine hellos. Profiles are outfits;
     these rows are the physical remotes wearing them. ---- */
  let units = $state([]);
  let fullyDevs = $state([]);
  let blueprint = $state(null);
  let fleetState = $state("loading"); /* loading | ready | none | error */
  let fleetNote = $state({});
  let openUnit = $state(null);        /* which row's detail panel is open */
  async function loadFleet() {
    if (fleetState !== "ready") fleetState = "loading";
    try {
      const r = await fetch("/api/harmonium/fleet",
        { headers: { Authorization: "Bearer " + token() } });
      if (!r.ok) throw new Error("fleet " + r.status);
      const body = await r.json();
      units = body.units || [];
      fullyDevs = body.fully || [];
      blueprint = body.blueprint || null;
      fleetState = units.length ? "ready" : "none";
    } catch {
      fleetState = "error";
    }
  }
  loadFleet();
  /* what a row is CALLED, in priority: your name → Fully's → the profile */
  const unitLabel = (u) => u.friendly || u.fully_name || u.name || u.unit;
  /* fleet v2 — the Fully link: server-owned fields, empty clears */
  async function linkUnit(u, patch) {
    try {
      const r = await fetch("/api/harmonium/fleet/" + encodeURIComponent(u.unit), {
        method: "POST",
        headers: { Authorization: "Bearer " + token(), "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!r.ok) throw new Error();
      await loadFleet();
    } catch {
      fleetNote[u.unit + "link"] = "link failed";
      setTimeout(() => (fleetNote[u.unit + "link"] = null), 4000);
    }
  }
  /* an alert already watches this unit's battery sensor? */
  const alertFor = (u) =>
    u.fully?.battery_sensor && bats.find((b) => b.sensor === u.fully.battery_sensor);
  /* CREATE (his pick: create + link out — one click makes the
     automation pre-wired to the linked device with the blueprint's
     standard tiers; the numbers are tuned in HA via Edit levels) */
  async function createAlert(u) {
    if (!blueprint || !u.fully?.battery_sensor) return;
    fleetNote[u.unit + "alert"] = "creating…";
    const input = { battery_sensor: u.fully.battery_sensor };
    if (u.fully.plugged_sensor) input.plugged_sensor = u.fully.plugged_sensor;
    if (u.fully.tts_notify) input.tts_notify = u.fully.tts_notify;
    if (u.fully.overlay_notify) input.overlay_notify = u.fully.overlay_notify;
    try {
      const r = await fetch("/api/config/automation/config/" + Date.now(), {
        method: "POST",
        headers: { Authorization: "Bearer " + token(), "Content-Type": "application/json" },
        body: JSON.stringify({
          alias: "Harmonium: " + unitLabel(u) + " battery alerts",
          description: "Tiered low-battery nags for " + unitLabel(u) +
            " — created from the Studio's Remotes page (Harmonium battery-alerts blueprint).",
          use_blueprint: { path: blueprint, input },
        }),
      });
      if (!r.ok) throw new Error("HTTP " + r.status);
      fleetNote[u.unit + "alert"] = "created — tune the levels below";
      await loadBattery();
    } catch (e) {
      fleetNote[u.unit + "alert"] = "create failed: " + e.message;
    }
    setTimeout(() => (fleetNote[u.unit + "alert"] = null), 6000);
  }
  const agoText = (u) =>
    u.age < 90 ? "just now"
    : u.age < 3600 ? Math.round(u.age / 60) + " min ago"
    : u.age < 172800 ? Math.round(u.age / 3600) + " h ago"
    : Math.round(u.age / 86400) + " d ago";
  async function fleetCmd(verb, target) {
    const key = (target || "all") + verb;
    fleetNote[key] = "…";
    try {
      const body = { verb, workspace: app.workspace };
      if (target) body.target = target;
      if (verb === "identify" && target) {
        const u = units.find((x) => x.unit === target);
        if (u) body.label = unitLabel(u);
      }
      const r = await fetch("/api/harmonium/command", {
        method: "POST",
        headers: { Authorization: "Bearer " + token(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error();
      const b = await r.json();
      fleetNote[key] = verb === "reload"
        ? (b.online ? "reloading " + b.online : "none online")
        : (b.online ? "look for the flashing remote" : "not online");
    } catch {
      fleetNote[key] = "failed";
    }
    setTimeout(() => (fleetNote[key] = null), 5000);
  }
  async function removeUnit(u) {
    try {
      const r = await fetch("/api/harmonium/fleet/" + encodeURIComponent(u.unit), {
        method: "DELETE",
        headers: { Authorization: "Bearer " + token() },
      });
      if (r.ok) units = units.filter((x) => x.unit !== u.unit);
    } catch { /* leave the row */ }
  }

  /* ---- battery-alert automations, discovered live ---- */
  let bats = $state([]);
  let batState = $state("loading"); /* loading | ready | none | error */
  async function loadBattery() {
    batState = "loading";
    try {
      const hdr = { Authorization: "Bearer " + token() };
      const r = await fetch("/api/states", { headers: hdr });
      if (!r.ok) throw new Error("states " + r.status);
      const states = await r.json();
      const byId = {};
      for (const s of states) byId[s.entity_id] = s;
      const rows = [];
      for (const a of states) {
        if (!a.entity_id.startsWith("automation.") || !a.attributes?.id) continue;
        /* cheap pre-filter, then the config API tells the truth */
        if (!/batter/i.test(a.attributes.friendly_name || a.entity_id)) continue;
        try {
          const c = await fetch("/api/config/automation/config/" + a.attributes.id,
            { headers: hdr });
          if (!c.ok) continue;
          const cfg = await c.json();
          const bp = cfg.use_blueprint;
          if (!bp || !/battery_alerts\.yaml$/.test(bp.path || "")) continue;
          const inp = bp.input || {};
          const sensor = inp.battery_sensor || "";
          const sensorState = byId[sensor];
          rows.push({
            id: a.attributes.id,
            entity_id: a.entity_id,
            alias: cfg.alias || a.attributes.friendly_name || a.entity_id,
            enabled: a.state !== "off",
            sensor,
            level: sensorState ? sensorState.state : null,
            plugged: inp.plugged_sensor && byId[inp.plugged_sensor]
              ? byId[inp.plugged_sensor].state === "on" : null,
            tiers: `${inp.warn_level ?? 20}% → ${inp.warn_every ?? 60}m · ` +
              `${inp.low_level ?? 10}% → ${inp.low_every ?? 15}m · ` +
              `${inp.crit_level ?? 5}% → ${inp.crit_every ?? 5}m`,
            window: `${String(inp.window_start ?? "09:00").slice(0, 5)}–` +
              `${String(inp.window_end ?? "23:00").slice(0, 5)}`,
            channels: [inp.beep_url ? "beep" : null,
              inp.tts_notify ? "voice" : null,
              inp.overlay_notify ? "banner" : null].filter(Boolean).join(" · ") || "no channels!",
            overlayEntity: inp.overlay_notify || "",
          });
        } catch { /* one bad automation must not sink the list */ }
      }
      bats = rows;
      batState = rows.length ? "ready" : "none";
    } catch {
      batState = "error";
    }
  }
  loadBattery();

  async function toggleBat(b, v) {
    const prev = b.enabled;
    b.enabled = v;
    try {
      const r = await fetch("/api/services/automation/" + (v ? "turn_on" : "turn_off"), {
        method: "POST",
        headers: { Authorization: "Bearer " + token(), "Content-Type": "application/json" },
        body: JSON.stringify({ entity_id: b.entity_id }),
      });
      if (!r.ok) throw new Error();
    } catch {
      b.enabled = prev;   /* the switch tells the truth on failure */
    }
  }

  /* TEST (his field ask: "Need a way to test the beep") — fires the
     automation with conditions skipped, so every configured channel
     sounds off at the CURRENT level. Fully overlay banners persist,
     so the test cleans its own banner up after a few seconds (the
     blueprint's recovery trigger only fires on a real crossing). */
  let testing = $state({});
  async function testBat(b) {
    const hdr = { Authorization: "Bearer " + token(), "Content-Type": "application/json" };
    testing[b.entity_id] = "testing…";
    try {
      const r = await fetch("/api/services/automation/trigger", {
        method: "POST", headers: hdr,
        body: JSON.stringify({ entity_id: b.entity_id, skip_condition: true }),
      });
      if (!r.ok) throw new Error();
      testing[b.entity_id] = b.overlayEntity ? "fired — banner clears itself" : "fired";
      setTimeout(async () => {
        if (b.overlayEntity) {
          try {
            await fetch("/api/services/notify/send_message", {
              method: "POST", headers: hdr,
              body: JSON.stringify({ entity_id: b.overlayEntity, message: "" }),
            });
          } catch { /* the recovery trigger will get it eventually */ }
        }
        testing[b.entity_id] = null;
      }, 6000);
    } catch {
      testing[b.entity_id] = "test failed";
      setTimeout(() => (testing[b.entity_id] = null), 3000);
    }
  }
</script>

<div class="space-y-5">
  <!-- ---- the fleet: the physical remotes (design-remote-fleet) ---- -->
  <div>
    <div class="mb-2 flex items-center gap-3">
      <span class="text-[11px] font-semibold tracking-wide text-dim uppercase">Your remotes</span>
      <span class="flex-1"></span>
      {#if fleetNote["allreload"]}<span class="text-[11px] text-dim">{fleetNote["allreload"]}</span>{/if}
      <button class="cursor-pointer rounded-[6px] border border-line bg-glass px-2.5 py-1 text-xs text-ink hover:border-accent/60"
        onclick={() => fleetCmd("reload")}>⟳ Reload all</button>
      <button class="cursor-pointer border-0 bg-transparent p-0 text-xs text-dim hover:text-ink"
        onclick={loadFleet} title="refresh the list">refresh</button>
    </div>
    {#if fleetState === "loading"}
      <p class="text-sm text-dim">Looking for your remotes…</p>
    {:else if fleetState === "error"}
      <p class="text-sm text-dim">Couldn't read the fleet — is the integration up to date? (Remotes announce themselves once they run the new engine.)</p>
    {:else if fleetState === "none"}
      <p class="text-sm text-dim">No remotes have announced themselves yet. Each remote appears here the first time it connects running the new engine — nothing to set up.</p>
    {:else}
      <div class="space-y-1.5">
        {#each units as u (u.unit)}
          <div class="rounded-[9px] border border-line bg-glass">
          <div class="flex items-center gap-3 px-3 py-2">
            <button class="cursor-pointer border-0 bg-transparent p-0 text-xs text-dim hover:text-ink"
              title="link to Fully, name it, battery alert"
              onclick={() => (openUnit = openUnit === u.unit ? null : u.unit)}>{openUnit === u.unit ? "▾" : "▸"}</button>
            <span class={"h-[9px] w-[9px] shrink-0 rounded-full " +
              (u.liveness === "online" ? "bg-ok" : u.liveness === "asleep" ? "bg-dim/60" : "bg-danger/70")}
              title={u.liveness}></span>
            <span class="min-w-0 truncate text-sm font-semibold text-ink">{unitLabel(u)}</span>
            <span class="font-mono text-[11px] text-dim">{u.unit}</span>
            <span class="text-[11px] text-dim">wears <b class="text-ink-2">{u.profile || "default"}</b>{u.workspace && u.workspace !== "main" ? " · " + u.workspace : ""}</span>
            {#if u.version}<span class="text-[11px] text-dim">v{u.version}</span>{/if}
            {#if u.battery != null}<span class={"text-[11px] " + (u.battery <= 20 ? "text-danger" : "text-dim")}
              title={u.fully_device ? "from its Fully device — fresh even while the remote sleeps" : "the remote's own last report"}>🔋{u.battery}%{u.charging ? "⚡" : ""}</span>{/if}
            <span class="flex-1"></span>
            <span class="text-[11px] text-dim">{u.liveness === "online" ? "online" : "seen " + agoText(u)}</span>
            {#if fleetNote[u.unit + "identify"]}<span class="text-[11px] text-dim">{fleetNote[u.unit + "identify"]}</span>{/if}
            {#if fleetNote[u.unit + "reload"]}<span class="text-[11px] text-dim">{fleetNote[u.unit + "reload"]}</span>{/if}
            <button class="cursor-pointer rounded-[6px] border border-line bg-transparent px-2 py-1 text-[11px] text-dim hover:border-accent/60 hover:text-ink"
              title="flash this unit's name on its screen" onclick={() => fleetCmd("identify", u.unit)}>Identify</button>
            <button class="cursor-pointer rounded-[6px] border border-line bg-transparent px-2 py-1 text-[11px] text-dim hover:border-accent/60 hover:text-ink"
              title="reload this remote now" onclick={() => fleetCmd("reload", u.unit)}>Reload</button>
            {#if u.liveness === "stale"}
              <button class="cursor-pointer border-0 bg-transparent p-0 text-sm text-dim hover:text-danger"
                title="remove this row — a wiped or retired unit stays gone" onclick={() => removeUnit(u)}>✕</button>
            {/if}
          </div>
          {#if openUnit === u.unit}
            <!-- fleet v2 (Suresh: "link it to a Fully Kiosk profile,
                 which will pull in a default name, a start url, a
                 battery level… refresh that… add my own friendly
                 name… This is also where I would Create a battery
                 alert") -->
            <div class="flex flex-wrap items-end gap-3 border-t border-line px-3 py-2.5">
              <div class="w-[240px]"><Field label="Fully Kiosk device" hint="">
                <select value={u.fully_device ?? ""}
                  onchange={(e) => linkUnit(u, { fully_device: e.target.value })}
                  class="h-[34px] w-full cursor-pointer rounded-[4px] border border-line-strong bg-field px-2 text-[12px] text-ink outline-none focus:border-accent">
                  <option value="">— not linked —</option>
                  {#each fullyDevs as d (d.id)}
                    <option value={d.id}>{d.name}{d.id === u.fully_suggest ? " (suggested — same address)" : ""}</option>
                  {/each}
                </select>
              </Field></div>
              <div class="w-[220px]"><Field label="Friendly name" hint="">
                <input value={u.friendly ?? ""} placeholder={u.fully_name || u.name || ""}
                  onchange={(e) => linkUnit(u, { friendly: e.target.value })}
                  class="h-[34px] w-full rounded-[4px] border border-line-strong bg-field px-2 text-[12px] text-ink outline-none placeholder:text-faint focus:border-accent" />
              </Field></div>
              <button class="mb-[3px] cursor-pointer rounded-[6px] border border-line bg-transparent px-2 py-1 text-[11px] text-dim hover:border-accent/60 hover:text-ink"
                title="re-pull the name, battery and URL from Fully" onclick={loadFleet}>⟳ Refresh</button>
              {#if u.fully_device}
                {#if alertFor(u)}
                  <span class="mb-[6px] text-[11px] text-dim">Battery alert ✓ — tune it below</span>
                {:else if blueprint && u.fully?.battery_sensor}
                  <button class="mb-[3px] cursor-pointer rounded-[6px] border border-line bg-glass px-2.5 py-1 text-[11px] text-ink hover:border-accent/60"
                    title="creates the blueprint automation pre-wired to this device (standard tiers — Edit levels below to tune)"
                    onclick={() => createAlert(u)}>＋ Create battery alert</button>
                {:else if !blueprint}
                  <span class="mb-[6px] text-[11px] text-dim">battery-alerts blueprint not installed — import it first (README)</span>
                {/if}
              {/if}
              {#if fleetNote[u.unit + "alert"]}<span class="mb-[6px] text-[11px] text-dim">{fleetNote[u.unit + "alert"]}</span>{/if}
              {#if fleetNote[u.unit + "link"]}<span class="mb-[6px] text-[11px] text-danger">{fleetNote[u.unit + "link"]}</span>{/if}
              {#if u.fully_missing}
                <span class="mb-[6px] text-[11px] text-danger">the linked Fully device is gone from HA — pick again</span>
              {/if}
              {#if u.url}
                <div class="w-full truncate font-mono text-[11px] text-dim" title="the page Fully reports right now">
                  showing: {u.url}
                </div>
              {/if}
            </div>
          {/if}
          </div>
        {/each}
      </div>
      <p class="mt-1.5 mb-0 text-[11px] text-dim">
        A row is one physical remote (its token is named in your HA profile — revoking it there un-registers the unit instantly). Save &amp; Deploy reloads every online unit in this workspace automatically.
      </p>
    {/if}
  </div>

  <!-- ---- profiles ---- -->
  <div>
    <div class="mb-2 text-[11px] font-semibold tracking-wide text-dim uppercase">Remote profiles</div>
    {#if Object.keys(remotes).length === 0}
      <p class="text-sm text-dim">No remote profiles in this workspace yet.</p>
    {:else}
      <div class="space-y-2">
        {#each Object.entries(remotes) as [rid, r] (rid)}
          <div class="rounded-[10px] border border-line bg-surface px-3 py-2">
            <div class="flex flex-wrap items-baseline gap-2">
              <span class="font-semibold">{rid}</span>
              <span class="text-xs text-dim">{(r.capabilities || []).join(" · ") || "no capabilities"}</span>
            </div>
            <div class="mt-1 text-xs text-dim">
              {Object.keys(r.keymap || {}).length} keys mapped
              {#if r.skin}&nbsp;· device photo ✓{/if}
              {#if r.viewport || r.skin?.viewport}&nbsp;· viewport {(r.viewport || r.skin?.viewport)?.w}×{(r.viewport || r.skin?.viewport)?.h}{/if}
              {#if r.style}&nbsp;· {Object.keys(r.style).length} style overrides{/if}
              {#if r.battery_sensor}&nbsp;· battery ✓{/if}
            </div>
            <!-- BATTERY (v0.84.8): shows on the remote's ⓘ page. The
                 Fully Kiosk integration publishes both for a kiosk
                 device; blank = no battery row for this remote. -->
            <div class="mt-2 grid grid-cols-2 gap-3">
              <Field label="Battery level sensor"
                hint="Fully Kiosk integration — shows on this remote's ⓘ page. Blank = no battery row.">
                <EntityPicker value={r.battery_sensor || ""} domains={["sensor"]}
                  placeholder="sensor.<device>_battery"
                  onchange={(e) => setSensor(r, "battery_sensor", (e.target.value || "").trim())} />
              </Field>
              <Field label="Charging sensor"
                hint="optional — the Fully 'Plugged in' binary sensor; adds “· charging”">
                <EntityPicker value={r.charging_sensor || ""} domains={["binary_sensor"]}
                  placeholder="binary_sensor.<device>_plugged_in"
                  onchange={(e) => setSensor(r, "charging_sensor", (e.target.value || "").trim())} />
              </Field>
            </div>
          </div>
        {/each}
      </div>
      <p class="mt-2 text-[11px] text-dim">
        Keymaps are edited on the <b>Code</b> tab, or assigned from the
        remote itself (hold ⓘ → Key capture).
      </p>
    {/if}
  </div>

  <!-- ---- battery alerts ---- -->
  <div>
    <div class="mb-2 text-[11px] font-semibold tracking-wide text-dim uppercase">Battery alerts</div>
    {#if batState === "loading"}
      <p class="text-sm text-dim">Looking for battery-alert automations…</p>
    {:else if batState === "error"}
      <p class="text-sm text-dim">
        Couldn't reach Home Assistant's automation list from here —
        battery alerts still run; manage them under
        <i>Settings → Automations</i>.
      </p>
    {:else if batState === "none"}
      <div class="rounded-[10px] border border-line bg-surface px-3 py-2 text-sm text-dim">
        No battery-alert automations yet. The remote can nag you
        before it dies — tiered, windowed, charging-aware, and it
        works while the device sleeps.
        <a class="text-accent hover:underline" target="_blank" rel="noreferrer"
          href="https://github.com/skavan/harmonium/blob/main/docs/cookbook/battery-alerts.md">
          Set it up (one-click blueprint) →</a>
      </div>
    {:else}
      <div class="space-y-2">
        {#each bats as b (b.entity_id)}
          <div class="rounded-[10px] border border-line bg-surface px-3 py-2">
            <div class="flex flex-wrap items-center gap-3">
              <Switch checked={b.enabled}
                onCheckedChange={(v) => toggleBat(b, v)} />
              <span class="font-semibold">{b.alias}</span>
              {#if b.level != null}
                <span class="text-xs {(+b.level) <= 20 ? 'text-danger' : 'text-dim'}">
                  {b.level}%{#if b.plugged}&nbsp;· charging{/if}
                </span>
              {/if}
              <span class="flex-1"></span>
              {#if testing[b.entity_id]}
                <span class="text-xs text-dim">{testing[b.entity_id]}</span>
              {:else}
                <button class="cursor-pointer rounded-[6px] border border-line-strong bg-surface px-2 py-[3px] text-xs text-ink-2 hover:bg-sunk"
                  onclick={() => testBat(b)}
                  title="Fire every configured channel now, at the current level — the overlay banner cleans itself up">
                  Test</button>
              {/if}
              <a class="text-xs text-accent hover:underline" target="_blank" rel="noreferrer"
                href={"/config/automation/edit/" + b.id}
                title="The tiers, window and channels are edited on HA's blueprint form (in-Studio editing is on the roadmap)">
                Edit levels & channels ↗</a>
            </div>
            <div class="mt-1 text-xs text-dim">
              {b.tiers} · window {b.window} · {b.channels}
            </div>
          </div>
        {/each}
      </div>
      <p class="mt-2 text-[11px] text-dim">
        The alert itself runs in Home Assistant (so it works while the
        remote sleeps). The switch here enables/disables it; the
        numbers live behind <i>Edit levels & channels</i> for now.
      </p>
    {/if}
  </div>
</div>
