<script>
  /* ROLES — which device fills each role; claims can be minted and
     promoted from here (the library learns). Split out of
     ActivityCard.svelte (v0.83.11). */
  import { app, platformOf, setStatus, ROLE_KEYS } from "../../state.svelte.js";
  import { ROLES, SLOT_DOMAINS, ROLE_CONTROLS, ROLE_EFFECTS } from "./lib.js";
  import Select from "../Select.svelte";
  import EntityPicker from "../EntityPicker.svelte";

  let { card } = $props();
  const a = $derived(card.a);
  const cast = $derived(card.cast);
  const wiring = $derived(card.wiring);
  const devLib = $derived(card.devLib);
  const consumedRoles = $derived(card.consumedRoles);
  const { recompile, regenDevices, deviceList, setRole } = card;

  /* ROLES: candidates = cast devices that already CLAIM this role; a
     raw entity stays possible (the escape hatch is part of the
     grammar) */
  const roleCandidates = (role) => cast.filter((c) => devLib[c]?.roles?.[role]);
  /* LOOSE ENTITIES ARE CANDIDATES TOO (v0.78 review: "shouldn't this
     drop down show the cast, followed by 'another entity'?"). Domain-
     filtered per role; entities a cast device already claims for this
     role are left to the device's own option. */
  const looseCandidates = (role) => {
    const claimed = cast.map((c) => devLib[c]?.roles?.[role]).filter(Boolean);
    return [...new Set([...(a.extra_devices || []), ...deviceList()])]
      .filter((ent) => typeof ent === "string" && ent.includes(".") &&
        (SLOT_DOMAINS[role] || []).includes(ent.split(".")[0]) &&
        !claimed.includes(ent));
  };
  /* ...but a cast device that hasn't claimed the role was simply
     INVISIBLE here (v0.62 — Suresh: "In the drop down for Power Button,
     only get nobody or 'an entity directly' … Volume Readout doesn't
     list Bar Sonos"). The doctrine is right — a device declares what it
     can do — but the dropdown enforced it by HIDING the answer instead
     of offering to write it down. So the rest of the cast appears too,
     each shown with the entity it WOULD use: its own bundle, first
     entity whose domain this role accepts. Picking one mints the claim
     on the device (permanent — every future cast of it fills this role
     by itself) and wires it, in one gesture. */
  function claimableEntity(devId, role) {
    const d = devLib[devId];
    if (!d || d.roles?.[role]) return null;
    const doms = SLOT_DOMAINS[role] || [];
    for (const k of ROLE_KEYS) {
      const e = d.roles?.[k];
      if (e && doms.includes(String(e).split(".")[0])) return e;
    }
    return null;
  }
  const roleClaimable = (role) => cast
    .filter((c) => !devLib[c]?.roles?.[role])
    .map((c) => ({ id: c, ent: claimableEntity(c, role) }))
    .filter((x) => x.ent);
  function claimAndWire(role, devId) {
    const ent = claimableEntity(devId, role);
    const d = devLib[devId];
    if (!ent || !d) return;
    if (!d.roles) d.roles = {};
    d.roles[role] = ent;
    setRole(role, devId);
    setStatus("↥ " + (d.name || devId) + " now claims " + role + " → " + ent +
      " — saved to the device, so every future cast fills it by itself", "ok");
  }
  /* an entity wired in from OUTSIDE joins the cast as a loose row —
     hidden from the controller by default (v0.78 review: "should it
     be added to the cast (with default NOT on controller?)"). */
  function adoptOutside(ent) {
    if (!ent.includes(".")) return;                     /* device ids pass */
    const covered = cast.some((c) =>
      Object.values(devLib[c]?.roles || {}).includes(ent));
    if (covered || (a.extra_devices || []).includes(ent)) return;
    if (!a.extra_devices) a.extra_devices = [];
    a.extra_devices.push(ent);
    if (!a.device_options) a.device_options = {};
    a.device_options[ent] = { ...(a.device_options[ent] || {}), tile: false };
    regenDevices();
  }
  let customRole = $state(null);   /* role currently picking a raw entity */
  /* PROMOTE A CLAIM (v0.48.1 — Suresh: "I figured out the adb device
     carried the volume level... Should I have the option of updating
     the Pre-Wired Device?"): when a role is wired to a RAW entity that
     belongs to a cast device's bundle, offer to save the wiring into
     the device's claims — the library learns, every future cast of it
     fills this role by itself. */
  const claimTargets = (role, ent) =>
    typeof ent === "string" && ent.includes(".")
      ? (a.cast || []).filter((k) => {
          const d = devLib[k];
          return d && !(d.roles || {})[role] &&
            Object.values(d.roles || {}).includes(ent);
        })
      : [];
  function promoteClaim(role, ent, devId) {
    const d = devLib[devId];
    if (!d) return;
    d.roles = { ...(d.roles || {}), [role]: ent };
    setRole(role, devId);          /* wiring now rides the device claim */
    setStatus("claim saved — " + (d.name || devId) + " now pre-wires " + role);
  }
</script>

      <!-- ROLES — where each control on the remote routes (v0.45.1:
           control name + mono role key + effect tooltip; singular by
           nature — a button press has ONE destination. Plural lives
           where it belongs: Inputs (per-device) and Actions. -->
      <div class="rounded-[10px] border border-line bg-tile p-3">
        <span class="text-[11px] font-bold tracking-[.07em] text-dim uppercase">Roles — which device fills each role in this activity</span>
        <span class="pl-2 text-[10.5px] text-dim italic">one device per role</span>
        {#if a.screen && consumedRoles.length}
          <div class="mt-2 flex flex-wrap items-center gap-1.5">
            <span class="text-[10px] font-semibold tracking-[.08em] text-dim uppercase">This controller consumes</span>
            {#each consumedRoles as r (r)}
              <span class={"rounded-full px-2 py-0.5 text-[10px] font-medium " +
                  (a.context?.[r] ? "bg-ok/15 text-ok" : "border border-line-strong text-dim")}
                title={a.context?.[r] ? r + " → " + a.context[r] : r + " is unwired — its tiles hide on the remote"}>
                {a.context?.[r] ? "●" : "○"} {r}</span>
            {/each}
          </div>
          <p class="mt-1 mb-1 text-[11px] text-dim italic">hollow = unwired — those tiles simply won't exist on the remote (sometimes that's the point)</p>
        {/if}
        <div class="mt-2 space-y-1.5">
          {#each ROLES as role (role)}
            {@const cands = roleCandidates(role)}
            {@const cur = wiring[role]}
            {@const isEnt = typeof cur === "string" && cur.includes(".")}
            {@const offStage = a.screen && consumedRoles.length && !consumedRoles.includes(role)}
            <div class={"flex flex-wrap items-center gap-2.5" + (offStage ? " opacity-55" : "")}
              title={ROLE_EFFECTS[role] + (offStage ? " — not used by this controller (kept: it applies if you switch controllers)" : "")}>
              <span class="flex w-[210px] shrink-0 items-baseline gap-1.5">
                <span class="text-[12.5px] text-ink-2">{ROLE_CONTROLS[role]}</span>
                <span class="font-mono text-[10px] text-faint">{role}</span>
              </span>
              <select value={customRole === role ? "__custom" : (cur ?? "")}
                onchange={(e) => { const v = e.target.value;
                  if (v === "__custom") customRole = role;
                  else if (v.startsWith("__claim:")) { customRole = null; claimAndWire(role, v.slice(8)); }
                  else { customRole = null; setRole(role, v || null); } }}
                class="h-[32px] w-[320px] cursor-pointer rounded-[6px] border border-line-strong bg-field px-2 text-[12px] text-ink outline-none focus:border-accent">
                <option value="">— nobody (unwired) —</option>
                {#each cands as c (c)}
                  <option value={c}>{devLib[c]?.name || c} · {devLib[c].roles[role]}{role === "commands" &&
                    app.draft?.dialects?.[devLib[c]?.dialect]?.channels?.commands &&
                    platformOf(devLib[c].roles[role]) === app.draft.dialects[devLib[c].dialect].channels.commands.integration
                      ? " — " + (app.draft.dialects[devLib[c].dialect].channels.commands.label || "channel") + " ✓" : ""}</option>
                {/each}
                {#each looseCandidates(role) as ent (ent)}
                  <option value={ent}>{ent} · cast entity</option>
                {/each}
                {#if isEnt && !cands.includes(cur) && !looseCandidates(role).includes(cur)}
                  <option value={cur}>{cur}</option>
                {/if}
                <!-- the rest of the cast: able, just not yet declared -->
                {#each roleClaimable(role) as x (x.id)}
                  <option value={"__claim:" + x.id}>＋ {devLib[x.id]?.name || x.id} · {x.ent} — add the claim</option>
                {/each}
                <option value="__custom">an entity directly…</option>
              </select>
              {#if customRole === role}
                <div class="min-w-[220px] flex-1">
                  <EntityPicker value="" domains={SLOT_DOMAINS[role]}
                    placeholder="entity for this role…"
                    onchange={(e) => { const v = (e?.target?.value || "").trim();
                      if (v) { setRole(role, v); adoptOutside(v); }
                      customRole = null; }} />
                </div>
              {:else if consumedRoles.includes(role) && !a.context?.[role]}
                <span class="text-[10.5px] text-dim italic">consumed — unwired hides its tiles</span>
              {/if}
              {#each claimTargets(role, cur) as devId (devId)}
                <button class="cursor-pointer rounded-[6px] border border-dashed border-line-strong bg-transparent px-2 py-0.5 text-[10.5px] text-dim hover:border-accent/60 hover:text-accent"
                  title={"This entity is in " + (devLib[devId]?.name || devId) + "'s bundle — save the wiring as a claim so every future cast fills this role by itself"}
                  onclick={() => promoteClaim(role, cur, devId)}>↥ save claim to {devLib[devId]?.name || devId}</button>
              {/each}
            </div>
          {/each}
          <div class="flex items-center gap-2.5 pt-1.5">
            <span class="flex w-[210px] shrink-0 items-baseline gap-1.5"
              title="the platform's vocabulary — keys, launches, channels; usually inherited from the media_player device's bundle">
              <span class="text-[12.5px] text-ink-2">Dialect</span>
              <span class="font-mono text-[10px] text-faint">dialect</span>
            </span>
            <Select value={a.overrides?.dialect ?? ""} allowEmpty class="max-w-64"
              options={Object.entries(app.draft?.dialects || {})
                .map(([cid, c]) => ({ value: cid, label: c.name || cid }))}
              onchange={(e) => {
                if (e.target.value) a.overrides = { ...(a.overrides || {}), dialect: e.target.value };
                else if (a.overrides) { delete a.overrides.dialect;
                  if (!Object.keys(a.overrides).length) delete a.overrides; }
                if (a.wiring || a.cast) recompile();
                else { a.context = a.context || {};
                  if (e.target.value) a.context.dialect = e.target.value;
                  else delete a.context.dialect; } }} />
            <span class="text-[11px] text-dim">
              {a.overrides?.dialect ? "pinned"
                : a.context?.dialect
                  ? "from " + (devLib[wiring.media_player]?.name || "the device") + " — " + a.context.dialect
                  : "blank = the surface default"}
            </span>
          </div>
        </div>
      </div>
