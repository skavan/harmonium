<script>
  /* ONE PANEL SHAPE for every member (v0.76): name · status line ·
     icon · draws-as · tap (+ volume style, + where for ungrouped).
     Opened by a row's ⚙; the OWNER (SetupTab) keeps the open/close
     state machine — editPres backfills the two bind fields before
     this renders, closePres sweeps empties after. Peeled out of
     SetupTab (v0.83.11 round 2). */
  import { app, SHOWS_KINDS } from "../../state.svelte.js";
  import Field from "../Field.svelte";
  import Input from "../Input.svelte";
  import Select from "../Select.svelte";
  import IconPicker from "../IconPicker.svelte";

  let { card, key, isEnt, inGroup, open, onclose } = $props();
  const a = $derived(card.a);
  const devLib = $derived(card.devLib);
  const { recompile } = card;

  /* the INTELLIGENT list: only render modes this member can honour —
     a claimed role for devices, the entity's own domain for loose
     entities. Launcher is always offered. */
  function presShows(key, isEnt) {
    if (!isEnt) {
      const roles = devLib[key]?.roles || {};
      return SHOWS_KINDS.filter((k) => !k.role || roles[k.role]);
    }
    const dom = key.split(".")[0];
    return SHOWS_KINDS.filter((k) => !k.role || dom === "media_player" ||
      (k.value === "power" &&
        ["switch", "light", "fan", "input_boolean"].includes(dom)));
  }
  /* the Volume style select shows only where a volume control can
     exist: a device claiming roles.volume, or a media_player entity */
  const canVolume = (key, isEnt) =>
    isEnt ? key.startsWith("media_player.") : !!devLib[key]?.roles?.volume;
  const STYLE_OPTS = [
    { value: "", label: "Theme default" },
    { value: "compact", label: "Compact" },
    { value: "slider", label: "Slider — the fat one" },
    { value: "stepper", label: "Stepper − / +" },
  ];
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
              <div class="min-w-[200px] flex-[1.4]">
                <Field label="Status line">
                  <div class="flex gap-1">
                    <Input bind:value={a.present[key].sub}
                      title={"the tile's second line — blank = the widget's smart summary · clearing a SAVED line shows none · {curly} tokens read the entity live"}
                      placeholder="auto" />
                    <!-- a quiet ＋ button, not a visible select (v0.79.2
                         — Suresh: "the + dropdown looks wonky. Do we
                         need the down chevron?"): appearance-none kills
                         the native chevron; the ＋ centres alone -->
                    <select value="" title={"insert a live attribute — {token}s follow the entity"}
                      onchange={(e) => { const v = e.target.value;
                        if (v) a.present[key].sub = (a.present[key].sub || "") + "{" + v + "}";
                        e.target.value = ""; }}
                      class="h-[38px] w-[30px] shrink-0 cursor-pointer appearance-none rounded-[4px] border border-line-strong bg-field text-center text-[15px] text-dim outline-none hover:text-ink">
                      <option value="">＋</option>
                      {#each presAttrs(key, isEnt) as at (at)}
                        <option value={at}>{at}</option>
                      {/each}
                    </select>
                  </div>
                </Field>
              </div>
              <div class="min-w-[200px] flex-[1.3]">
                <Field label="Display icon">
                  <IconPicker bind:value={a.present[key].icon} onchange={recompile} />
                </Field>
              </div>
              <div class="min-w-[150px] flex-1">
                <Field label="Draws as">
                  <Select value={a.present[key].shows ?? "device"}
                    title={SHOWS_KINDS.find((k) => k.value === (a.present[key].shows || "device"))?.hint || ""}
                    options={presShows(key, isEnt).map((k) => ({ value: k.value, label: k.label }))}
                    onchange={(e) => { const v = e.target.value;
                      if (v === "device") delete a.present[key].shows;
                      else a.present[key].shows = v; }} />
                </Field>
              </div>
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
              {#if canVolume(key, isEnt)}
                <!-- HOW ITS VOLUME DRAWS (v0.77.1): rides the ladder
                     present.style → device_options.volume_style →
                     global.style.volume — the volume band, group pages
                     and inline volume controls all read it -->
                <div class="min-w-[150px] flex-1">
                  <Field label="Volume style">
                    <Select value={a.present[key].style ?? ""}
                      title="how this member's volume control draws — band, group page and inline alike"
                      options={STYLE_OPTS}
                      onchange={(e) => { const v = e.target.value;
                        if (v) a.present[key].style = v;
                        else delete a.present[key].style; }} />
                  </Field>
                </div>
              {/if}
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
