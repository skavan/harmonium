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
