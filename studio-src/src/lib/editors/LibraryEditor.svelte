<script>
  /* LIBRARY — a simple picker page. Three questions only: WHAT is on
     it (apps from the registry, or preset tiles), what GRID it uses,
     and what BUTTONS pass through while it's open. Pick-and-leave
     drawer behavior is built in. */
  import { app, selectSlice } from "../state.svelte.js";
  import Field from "../components/Field.svelte";
  import Input from "../components/Input.svelte";
  import Select from "../components/Select.svelte";
  import Chips from "../components/Chips.svelte";
  import TileRow from "../components/TileRow.svelte";
  import Button from "../components/Button.svelte";

  let { screenId } = $props();
  const d = $derived(app.draft);
  const scr = $derived(d?.screens?.[screenId]);
  const screenIds = $derived(Object.keys(d?.screens || {}).filter((s) => s !== screenId));
  const KEYS = ["up", "down", "left", "right", "select", "back", "home", "power",
    "menu", "vol_up", "vol_down", "mute", "ch_up", "ch_down"];
  /* content lives in the first tiles list, wherever it is */
  const tiles = $derived(scr?.tiles || scr?.sections?.[0]?.tiles || []);
  const appsTile = $derived(tiles.find((t) => t.type === "apps"));
  function setPass(v) {
    if (!scr.control_target)
      scr.control_target = { label: "$activity.name", navigation: "$context.dpad",
        power: "$context.power", volume: "$context.volume", pass_through: [] };
    scr.control_target.pass_through = v;
  }
  function newPreset() {
    tiles.push({ type: "preset", id: "p_" + Math.random().toString(36).slice(2, 6),
      label: "New preset", icon: "material:star",
      action: { service: "", target: "$context.media_player", data: {} } });
  }
</script>

{#if scr}
  <div class="space-y-5">
    <p class="m-0 text-xs text-dim">
      A <b>library</b> is a simple picker: choose one thing and it acts and
      pops back. Content, grid, buttons — that's the whole page.
    </p>
    <div class="grid grid-cols-3 gap-4">
      <Field label="Name"><Input bind:value={scr.name} /></Field>
      <Field label="Opens from" hint="its parent controller/hub">
        <Select bind:value={scr.parent} options={screenIds} allowEmpty />
      </Field>
      <Field label="Grid columns">
        <Input type="number" min="1" max="4"
          value={scr.grid?.columns ?? 2}
          oninput={(e) => (scr.grid = { columns: Number(e.target.value) || 2 })} />
      </Field>
    </div>

    <!-- CONTENT -->
    {#if appsTile}
      <Field label="Apps offered (in order)"
        hint="a conscious choice from the house registry — blank = everything launchable here">
        <Chips bind:items={() => appsTile.include ?? [], (v) => (appsTile.include = v)}
          suggestions={Object.keys(d.apps || {})} placeholder="add app…" />
      </Field>
      <button class="cursor-pointer border-0 bg-transparent p-0 text-xs text-accent hover:underline"
        onclick={() => selectSlice("apps")}>manage the app registry →</button>
    {:else}
      <div class="space-y-2">
        <span class="text-[11px] font-bold tracking-[.07em] text-dim uppercase">Presets</span>
        {#each tiles as tile, i (i)}
          <TileRow {tile} {tiles} index={i} />
        {/each}
        <Button size="sm" onclick={newPreset}>＋ Add preset</Button>
      </div>
    {/if}

    <!-- BUTTON MAPPING -->
    <Field label="Buttons passed to the device while open"
      hint="everything else drives the picker; drawers usually pass only power">
      <Chips bind:items={() => scr.control_target?.pass_through ?? [], setPass}
        suggestions={KEYS} placeholder="add key…" />
    </Field>
  </div>
{/if}
