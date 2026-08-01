<script>
  /* DEVICE LIBRARY (v0.45 — the Device Round). First-class devices:
     one definition per PHYSICAL device — its role CLAIMS (what it can
     do, role → member entity) plus generation traits. Activities cast
     devices and wire roles to them; the compiled context is what the
     engine reads. A device may span several HA integrations (the
     projector is androidtv_remote + ADB) — the bundle is the only
     place that knowledge lives. */
  import { app, schedulePreview, recompileContext, ROLE_KEYS, seedDeviceFromEntity, platformOf, selectSlice } from "../state.svelte.js";
  import Field from "../components/Field.svelte";
  import IconPicker from "../components/IconPicker.svelte";
  import Input from "../components/Input.svelte";
  import Select from "../components/Select.svelte";
  import Switch from "../components/Switch.svelte";
  import CardRow from "../components/CardRow.svelte";
  import EntityPicker from "../components/EntityPicker.svelte";
  import NumberField from "../components/NumberField.svelte";
  import JsonArea from "../components/JsonArea.svelte";
  import Button from "../components/Button.svelte";

  const devices = $derived(app.draft?.devices);
  const classOptions = $derived(Object.entries(app.draft?.dialects || {})
    .map(([cid, c]) => ({ value: cid, label: c.name || cid })));

  /* v0.45.1 vocabulary (Suresh): control name + mono role key,
     effect lines as tooltips — same table as the activity Roles tab */
  const ROLE_LABELS = {
    media_player: "Now Playing",
    dpad: "Navigation",
    power: "Power button",
    volume: "Volume keys",
    volume_level: "Volume readout",
    source_select: "Source picker",
    commands: "Commands",
  };
  const ROLE_HINTS = {
    media_player: "the media tile, transport, play/pause state",
    dpad: "arrows · select · back · home — physical remote keys pass through here",
    power: "what the power key toggles",
    volume: "volume up/down (hardware + on-screen) send here",
    volume_level: "where the slider reads truth, when it differs from who takes volume keys",
    source_select: "whose input list the Source tile offers",
    commands: "app launches + system keycodes — on ADB platforms this is the androidtv integration's media_player (the only entity adb_command accepts)",
  };

  let openId = $state(null);

  const usedBy = (id) => Object.values(app.draft?.activities || {})
    .filter((a) => (a.cast || []).includes(id) ||
      Object.values(a.wiring || {}).includes(id))
    .map((a) => a.name || "?");

  /* every wiring that targets this device recompiles when it changes */
  function touched(id) {
    for (const a of Object.values(app.draft?.activities || {}))
      if ((a.cast || []).includes(id) || Object.values(a.wiring || {}).includes(id))
        recompileContext(a, devices);
    schedulePreview();
  }

  const claimCount = (d) =>
    Object.values(d.roles || {}).filter(Boolean).length;
  const summary = (d) => {
    const n = claimCount(d);
    return n + (n === 1 ? " claim" : " claims") +
      (d.dialect ? " · " + d.dialect : "") +
      (d.traits?.never_off ? " · never off" : "");
  };

  function setClaim(d, id, role, ent) {
    if (!d.roles) d.roles = {};
    ent = (ent || "").trim();
    if (ent) d.roles[role] = ent;
    else delete d.roles[role];
    touched(id);
  }

  /* SEED FROM AN ENTITY — shared with the activity cast picker
     (state.seedDeviceFromEntity): siblings by stem, claims by the
     registry's PLATFORM FACT (androidtv = ADB commands channel),
     name-regex only when the registry is unavailable. */
  let seedEnt = $state("");
  function addDevice(fromEnt) {
    if (!app.draft.devices) app.draft.devices = {};
    const lib = app.draft.devices;
    let id = "new_device", n = 2;
    let dev = { name: "New Device", icon: "material:tv", roles: {} };
    if (fromEnt && fromEnt.includes(".")) {
      const seeded = seedDeviceFromEntity(fromEnt);
      id = seeded.stem || id;
      dev = seeded.dev;
    }
    while (lib[id]) id = id + "_" + n++;
    lib[id] = dev;
    openId = id;
    seedEnt = "";
    schedulePreview();
  }
  /* CHANNEL VALIDATION (v0.45.2): the device's dialect declares what
     the commands channel must BE (dialects.<id>.channels.commands);
     the registry says what the claimed entity IS. Match → ✓, clash → ⚠ */
  const channelCheck = (d) => {
    const decl = app.draft?.dialects?.[d.dialect]?.channels?.commands;
    const ent = d.roles?.commands;
    if (!decl || !ent) return null;
    const pf = platformOf(ent);
    if (!pf) return null;                      /* no registry — no verdict */
    return pf === decl.integration
      ? { ok: true, label: decl.label || decl.integration }
      : { ok: false, label: decl.label || decl.integration, got: pf };
  };
  /* Back — the same doorway contract as the other model pages */
  const backTo = $derived(
    app.prevKey && app.prevKey !== "devices" ? app.prevKey : null);

  function renameDevice(oldId, newId) {
    newId = (newId || "").trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_");
    if (!newId || newId === oldId || devices[newId]) return;
    const rebuilt = {};
    for (const [k, v] of Object.entries(devices)) rebuilt[k === oldId ? newId : k] = v;
    app.draft.devices = rebuilt;
    for (const a of Object.values(app.draft.activities || {})) {
      if (Array.isArray(a.cast)) a.cast = a.cast.map((c) => (c === oldId ? newId : c));
      for (const [role, t] of Object.entries(a.wiring || {}))
        if (t === oldId) a.wiring[role] = newId;
      if (a.inputs && oldId in a.inputs) {
        a.inputs[newId] = a.inputs[oldId];
        delete a.inputs[oldId];
      }
    }
    if (openId === oldId) openId = newId;
    schedulePreview();
  }

  function delDevice(id) {
    if (usedBy(id).length) return;   /* guarded in the UI */
    delete devices[id];
    schedulePreview();
  }
</script>

{#if app.draft}
  <div class="space-y-4">
    {#if backTo}
      <button class="cursor-pointer border-0 bg-transparent p-0 text-xs text-accent hover:underline"
        onclick={() => selectSlice(backTo)}>← back</button>
    {/if}
    <p class="m-0 text-xs text-dim">
      A <b>pre-wired device</b> is one physical device — even when HA
      shows it as two or three across integrations — with its wiring
      knowledge attached: which entity does which job (claims), plus
      how it wakes and what must never happen to it (traits). Cast one
      in an activity and the roles fill themselves. Devices usually
      arrive here <i>by themselves</i> (casting adds them); visit this
      page to tune traits or correct a claim the seeding guessed wrong.
    </p>

    {#each Object.entries(devices || {}) as [id, d] (id)}
      {@const users = usedBy(id)}
      <CardRow title={d.name || id} subtitle={summary(d)}
        bind:open={() => openId === id, (v) => (openId = v ? id : null)}
        ondelete={users.length ? null : () => delDevice(id)}>
        <div class="space-y-4">
          <!-- identity strip -->
          <div class="flex flex-wrap items-end gap-3">
            <div class="min-w-[200px] flex-[2]">
              <Field label="Name">
                <Input bind:value={d.name} onchange={() => touched(id)} />
              </Field>
            </div>
            <div class="w-[190px] min-w-[140px] flex-1">
              <Field label="Icon">
                <IconPicker bind:value={d.icon} onchange={() => touched(id)} />
              </Field>
            </div>
            <div class="w-[170px] min-w-[130px] flex-1">
              <Field label="Device id" hint={users.length ? "in the cast of " + users.join(", ") : ""}>
                <Input value={id} onchange={(e) => renameDevice(id, e.target.value)} />
              </Field>
            </div>
          </div>

          <!-- role claims: what this device CAN do -->
          <div>
            <p class="mt-0 mb-1 text-[11px] font-bold tracking-[.07em] text-dim uppercase">Can do</p>
            <div class="space-y-1.5">
              {#each ROLE_KEYS as role (role)}
                <div class="flex items-center gap-2.5" title={ROLE_HINTS[role]}>
                  <span class="flex w-[170px] shrink-0 items-baseline gap-1.5">
                    <span class="text-[12.5px] text-ink-2">{ROLE_LABELS[role]}</span>
                    <span class="font-mono text-[9.5px] text-faint">{role}</span>
                  </span>
                  <div class="min-w-0 flex-1">
                    <EntityPicker value={d.roles?.[role] || ""}
                      placeholder="— no claim —"
                      onchange={(e) => setClaim(d, id, role, e?.target?.value ?? "")} />
                  </div>
                  {#if role === "commands"}
                    {@const chk = channelCheck(d)}
                    {#if chk?.ok}
                      <span class="shrink-0 text-[10.5px] text-ok" title="Verified: this entity's integration matches the dialect's channel declaration">{chk.label} ✓</span>
                    {:else if chk}
                      <span class="shrink-0 text-[10.5px] text-danger"
                        title={"The " + (d.dialect || "") + " dialect needs the " + chk.label + " (integration: " + (app.draft?.dialects?.[d.dialect]?.channels?.commands?.integration) + ") — this entity is from '" + chk.got + "' and can't take its commands"}>⚠ wrong channel</span>
                    {/if}
                  {/if}
                </div>

              {/each}
            </div>
          </div>

          <div class="flex flex-wrap items-end gap-3">
            <div class="w-[190px]">
              <Field label="Dialect" hint="the platform vocabulary this device speaks — keys, launches, channels">
                <Select value={d.dialect} allowEmpty options={classOptions}
                  onchange={(e) => { if (e.target.value) d.dialect = e.target.value;
                    else delete d.dialect; touched(id); }} />
              </Field>
            </div>
            <div class="pb-2">
              <Switch checked={!!d.traits?.never_off} label="Never turn this off"
                onCheckedChange={(v) => { if (!d.traits) d.traits = {};
                  if (v) d.traits.never_off = true; else delete d.traits.never_off;
                  touched(id); }} />
            </div>
          </div>

          <!-- wake / cold start: what a generated Start Action uses -->
          <div class="rounded-[10px] border border-line bg-sunk/40 p-3">
            <p class="mt-0 mb-2 text-[11px] font-bold tracking-[.07em] text-dim uppercase">
              Waking up <span class="font-normal normal-case italic">— feeds generated Start Actions</span>
            </p>
            <div class="space-y-3">
              <div class="flex flex-wrap items-end gap-3">
                <div class="min-w-[220px] flex-1">
                  <Field label="Wake entity" hint="best-effort turn_on; blank = never woken">
                    <EntityPicker value={d.traits?.wake || ""}
                      placeholder="— not woken —"
                      onchange={(e) => { if (!d.traits) d.traits = {};
                        const v = (e?.target?.value ?? e ?? "").trim();
                        if (v) d.traits.wake = v; else delete d.traits.wake;
                        touched(id); }} />
                  </Field>
                </div>
                <div class="w-[150px]">
                  <Field label="Wait until on">
                    <NumberField value={d.traits?.wait_timeout_s ?? null} min={0} max={60}
                      suffix="s" placeholder="0"
                      onchange={(v) => { if (!d.traits) d.traits = {};
                        if (v) d.traits.wait_timeout_s = v; else delete d.traits.wait_timeout_s;
                        touched(id); }} />
                  </Field>
                </div>
                <div class="w-[150px]">
                  <Field label="Settle delay">
                    <NumberField value={d.traits?.settle_s ?? null} min={0} max={30}
                      suffix="s" placeholder="0"
                      onchange={(v) => { if (!d.traits) d.traits = {};
                        if (v) d.traits.settle_s = v; else delete d.traits.settle_s;
                        touched(id); }} />
                  </Field>
                </div>
              </div>
              <Field label="Cold-start steps"
                hint="extra HA actions run ONLY when the wake entity reads off (WOL etc.) — raw HA action list">
                <JsonArea value={d.traits?.cold_start ?? null} rows={4}
                  onchange={(v) => { if (!d.traits) d.traits = {};
                    if (v) d.traits.cold_start = v; else delete d.traits.cold_start;
                    touched(id); }} />
              </Field>
            </div>
          </div>

          {#if app.advanced}
            <Field label="Raw device JSON" hint="the whole bundle — escape hatch">
              <JsonArea value={$state.snapshot(d)} rows={10}
                onchange={(v) => { devices[id] = v; touched(id); }} />
            </Field>
          {/if}
        </div>
      </CardRow>
    {/each}

    <div class="flex flex-wrap items-center gap-3">
      <Button onclick={() => addDevice()}>＋ Add device</Button>
      <span class="text-xs text-dim">or seed from an entity —</span>
      <div class="w-[300px]">
        <EntityPicker bind:value={seedEnt} placeholder="pick any of its entities…"
          onchange={() => { if (seedEnt?.includes(".")) addDevice(seedEnt); }} />
      </div>
      <span class="text-[11px] text-dim italic">siblings are found by id stem and their jobs prefilled</span>
    </div>
  </div>
{/if}
