<script>
  /* ONE PANEL SHAPE for every member (v0.76): name · status line ·
     icon · draws-as · tap (+ volume style, + where for ungrouped).
     Opened by a row's ⚙; the OWNER (SetupTab) keeps the open/close
     state machine — editPres backfills the two bind fields before
     this renders, closePres sweeps empties after. Peeled out of
     SetupTab (v0.83.11 round 2). */
  import { app, SHOWS_KINDS, showsForDomain, showsForRoles, variantOptions, VARIANT_HINTS } from "../../state.svelte.js";
  import Field from "../Field.svelte";
  import Input from "../Input.svelte";
  import IconPicker from "../IconPicker.svelte";
  import PresFields from "../PresFields.svelte";
  import Select from "../Select.svelte";

  let { card, key, isEnt, inGroup, open, onclose } = $props();
  const a = $derived(card.a);
  const devLib = $derived(card.devLib);
  const { recompile } = card;

  /* the INTELLIGENT list: only render modes this member can honour —
     a claimed role for devices, the entity's own domain for loose
     entities. Launcher is always offered. The filters themselves are
     the SHARED pair in stocklib (Phase 0 #3 — TileRow uses the same
     showsForDomain, so activity ⚙ and page tiles can never drift). */
  function presShows(key, isEnt) {
    if (!isEnt) return showsForRoles(devLib[key]?.roles);
    return showsForDomain(key.split(".")[0]);
  }
  /* the Volume style select shows only where a volume control can
     exist: a device claiming roles.volume, or a media_player entity.
     The option list itself comes from the registry (variantOptions),
     same as TileRow's — the parity contract. */
  /* which adapter's variant select this member shows — ONLY when
     applicable (Suresh, 2026-08-31): the chosen Draws-as has shapes
     (Number / Select / Volume), or the member owns a volume-BAND row
     that the style governs regardless of how it draws in the Devices
     section — a cast device claiming the volume role, or the loose
     entity wired as the activity's volume. A loose media_player
     drawn as, say, Power no longer offers a style that would do
     nothing. */
  const variantFor = (key, isEnt) => {
    const t = a.present[key]?.type;
    if (t === "number" || t === "select" || t === "sources") return t;
    const band = isEnt
      ? a.context?.volume === key
      : !!devLib[key]?.roles?.volume;
    return t === "volume" || band ? "volume" : null;
  };
  /* the STATUS LINE's raw material (v0.79 review: "A text box with a
     drop down of available attributes"): the member's live attribute
     names, offered as {token} inserts — the engine substitutes them
     per state diff (render.js subTextOf). */
  function presEntity(key, isEnt) {
    if (isEnt) return key;
    return Object.values(devLib[key]?.roles || {})[0] || null;
  }
  function presAttrs(key, isEnt) {
    const ent = presEntity(key, isEnt);
    const e = ent && app.entities.find((x) => x.entity_id === ent);
    /* e.attrs — attribute NAMES captured by loadEntities (v0.79.1:
       the old read of e.attributes found a field that never existed,
       so the picker offered nothing but "state") */
    return ["state", ...(e?.attrs || [])];
  }
  const TAP_OPTS = [
    { value: "", label: "Smart default" },
    { value: "open", label: "Its controller page" },
    { value: "none", label: "Nothing — a pure readout" },
  ];
</script>

{#if open && a.present?.[key]}
            <!-- ONE GRID, ONE BASELINE (v0.76.3 — Suresh: "the config
                 layout is a bit messed up"): every control is 38px on
                 the same row, labels above, explanations in tooltips —
                 the stacked hints were what pushed fields off-line. -->
            <!-- wrap-friendly (v0.76.4): uniform 38px blocks that FLOW
                 at narrow widths instead of a fixed grid that clips —
                 alignment holds because the hints live in tooltips -->
            <div class="mt-2 flex flex-wrap items-start gap-3 rounded-[8px] border border-line bg-bg px-2.5 py-2">
              <div class="min-w-[150px] flex-[1.2]">
                <Field label="Display name">
                  <Input bind:value={a.present[key].name}
                    title="blank = its own name · clearing a SAVED name shows no label at all"
                    placeholder={isEnt ? key.split(".").pop() : (devLib[key]?.name || key)} />
                </Field>
              </div>
              <!-- BRACES IN TOOLTIPS ARE CODE (v0.79.1 — Suresh:
                   "Settings cog has stopped working"): a bare {curly}
                   inside a quoted attribute is a Svelte INTERPOLATION —
                   "curly is not defined" threw on ⚙ click and ate the
                   whole panel. Compile passed (unknown ids are globals);
                   only the runtime probe caught it. Tooltip text that
                   mentions tokens must be a string EXPRESSION: title={"…"}. -->
              <!-- Status line via the SHARED fields component (Phase
                   1 — the ⚙ and TileRow draw from one source) -->
              <PresFields only="sub" wrap="min-w-[200px] flex-[1.4]"
                sub={{
                  value: a.present[key].sub ?? "",
                  placeholder: "auto",
                  attrs: presAttrs(key, isEnt),
                  set: (v) => (a.present[key].sub = v),
                  insert: (at) => (a.present[key].sub = (a.present[key].sub || "") + "{" + at + "}"),
                }} />
              <div class="min-w-[200px] flex-[1.3]">
                <Field label="Display icon">
                  <IconPicker bind:value={a.present[key].icon} onchange={recompile} />
                </Field>
              </div>
              <!-- FIELD ORDER (Suresh, 2026-08-31): Tap rides the
                   first row; Draws-as and Variant sit TOGETHER —
                   the choice and its shape are one thought. -->
              <div class="min-w-[150px] flex-1">
                <Field label="Tap">
                  <Select value={a.present[key].tap ?? ""}
                    title="what pressing the tile does"
                    options={TAP_OPTS}
                    onchange={(e) => { const v = e.target.value;
                      if (v) a.present[key].tap = v;
                      else delete a.present[key].tap; }} />
                </Field>
              </div>
              <!-- canonical spelling: the adapter token is `type`
                   (legacy `shows` healed on load by normalizeVariants
                   and never written anew — Phase 1) -->
              <PresFields only="drawsAs" wrap="min-w-[150px] flex-1"
                drawsAs={{
                  value: a.present[key].type ?? "device",
                  hint: SHOWS_KINDS.find((k) => k.value === (a.present[key].type || "device"))?.hint || "",
                  options: presShows(key, isEnt).map((k) => ({ value: k.value, label: k.label })),
                  set: (v) => {
                    if (v === "device") delete a.present[key].type;
                    else a.present[key].type = v;
                  },
                }} />
              {#if variantFor(key, isEnt)}
                <!-- VARIANT lights up only when APPLICABLE (Suresh):
                     the chosen Draws-as has shapes, or the member owns
                     a volume-band row the style governs. Rung 1 of the
                     ladder — canonical `variant`, legacy healed. -->
                <PresFields only="variant" wrap="min-w-[150px] flex-1"
                  variantLabel={variantFor(key, isEnt) === "volume" ? "Volume style" : "Variant"}
                  variant={{
                    value: a.present[key].variant ?? "",
                    hint: VARIANT_HINTS[a.present[key].variant] || "",
                    options: variantOptions(variantFor(key, isEnt),
                      variantFor(key, isEnt) === "volume" ? "Theme default" : "Auto"),
                    set: (v) => {
                      if (v) a.present[key].variant = v;
                      else delete a.present[key].variant;
                      delete a.present[key].style;
                    },
                  }} />
              {/if}
              <!-- CARD GROUP (Phase 3): members sharing a name merge
                   into one card on the rendered surface -->
              <PresFields only="cardGroup" wrap="min-w-[150px] flex-1"
                cardGroup={{
                  value: a.present[key].card_group ?? "",
                  warn: a.present[key].type === "media" && a.present[key].card_group
                    ? "Now Playing has no row form — this member renders standalone." : null,
                  set: (v) => {
                    if (v) a.present[key].card_group = v;
                    else delete a.present[key].card_group;
                  },
                }} />
              {#if !inGroup}
                <!-- WHERE IT LIVES (v0.77 — Suresh: "be consistent or
                     give optionality!"): Devices section is the
                     members' home; "controls" promotes the tile up
                     beside the group cards. A grouped member has no
                     say — its group decides where it's drawn. -->
                <div class="min-w-[150px] flex-1">
                  <Field label="Where">
                    <Select value={a.present[key].where ?? ""}
                      title="which band of the controller draws this tile"
                      options={[{ value: "", label: "Devices section" },
                        { value: "controls", label: "With the controls" }]}
                      onchange={(e) => { const v = e.target.value;
                        if (v) a.present[key].where = v;
                        else delete a.present[key].where; }} />
                  </Field>
                </div>
              {/if}
              <div class="pt-[27px]">
                <button class="h-[38px] cursor-pointer border-0 bg-transparent p-0 px-1 text-[11px] font-semibold text-accent hover:underline"
                  onclick={() => onclose(key)}>done</button>
              </div>
            </div>
{/if}
