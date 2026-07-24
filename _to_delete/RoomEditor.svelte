<script>
  /* Room settings — accordion sections: Hero card, Activities (owned,
     reorderable), Room functions, Advanced (boot/hub/paging/select).
     The room IS the home view unless overridden in Advanced. */
  import { app, ownedActivities, schedulePreview } from "../state.svelte.js";
  import Field from "../components/Field.svelte";
  import Input from "../components/Input.svelte";
  import Select from "../components/Select.svelte";
  import Switch from "../components/Switch.svelte";
  import Chips from "../components/Chips.svelte";
  import EntityPicker from "../components/EntityPicker.svelte";
  import ActivityCard from "../components/ActivityCard.svelte";
  import SectionFold from "../components/SectionFold.svelte";
  import TileRow from "../components/TileRow.svelte";
  import Button from "../components/Button.svelte";

  let { roomId } = $props();
  const d = $derived(app.draft);
  const scr = $derived(d?.screens?.[roomId]);
  const screenIds = $derived(Object.keys(d?.screens || {}));
  /* "off" is a ROOM FUNCTION (All Off / hold-Power target), not a
     regular activity — it gets its own shelf. */
  const owned = $derived(ownedActivities(roomId).filter((id) => id !== "off"));
  const functions = $derived(ownedActivities(roomId).filter((id) => id === "off"));
  const edit = () => schedulePreview();

  /* the room view's non-activity sections (Presets, Devices, custom
     groups) are edited right here; the Activities section is owned by
     the activity registry above */
  const tileSections = $derived(
    (scr?.sections || [])
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => !(s.tiles || []).some((t) => t.type === "activity")));
  let secOpen = $state({});
  function addSection() {
    if (!scr.sections) return;
    scr.sections.push({ hero_label: "New group", tiles: [] });
    secOpen[scr.sections.length - 1] = true;
  }
  function newTile(tiles) {
    tiles.push({ type: "light", id: "tile_" + Math.random().toString(36).slice(2, 6),
      label: "New tile", icon: "material:lightbulb", entity: "" });
  }

  let heroOpen = $state(false);
  let actsOpen = $state(true);
  let fnOpen = $state(false);
  let advOpen = $state(false);
  let lastAdded = $state(null);

  function addActivity() {
    let id = "new_activity", n = 2;
    while (d.activities[id]) id = "new_activity_" + n++;
    d.activities[id] = {
      name: "New Activity", icon: "material:play_circle", color: "#e89b17",
      start: "", context: {}, screen: "", confirm_end: true,
      room_view: roomId,           // owner room, stamped automatically
    };
    lastAdded = id;
    actsOpen = true;
  }
  /* reorder among this room's activities (object key order = order) */
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

{#if d}
  <div class="space-y-4">
    <div class="grid grid-cols-2 gap-4">
      <Field label="Room name">
        <Input bind:value={d.global.room} oninput={edit} placeholder="Porch" />
      </Field>
      <div class="flex items-end gap-6 pb-1.5">
        <Switch bind:checked={d.global.confirm_switch} label="Confirm activity switch" onCheckedChange={edit} />
        <Switch bind:checked={d.global.debug} label="Key debug" onCheckedChange={edit} />
      </div>
    </div>

    <!-- HERO CARD -->
    <SectionFold label="Hero card" badge="the room view's header" bind:open={heroOpen}>
      {#if scr?.banner}
        <div class="flex flex-wrap items-center gap-6">
          <Switch
            checked={scr.banner.enabled !== false}
            label="Hero enabled"
            onCheckedChange={(v) => { if (v) delete scr.banner.enabled; else scr.banner.enabled = false; }}
          />
          <Switch
            checked={scr.banner.tabs !== false}
            label="Section tabs"
            onCheckedChange={(v) => { if (v) delete scr.banner.tabs; else scr.banner.tabs = false; }}
          />
          <Switch bind:checked={scr.banner.show_time} label="Show clock" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <Field label="Title override" hint="blank = the view's name">
            <Input bind:value={scr.banner.title} placeholder={scr.name || roomId} />
          </Field>
          <Field label="Image" hint="path under /local/ (HA www/)">
            <Input bind:value={scr.banner.image} placeholder="/local/images/Porch_Render.jpg" class="font-mono text-[12.5px]" />
          </Field>
          <Field label="Image opacity">
            <Input type="number" min="0" max="1" step="0.05" bind:value={scr.banner.image_opacity} />
          </Field>
          <Field label="Height"><Input bind:value={scr.banner.height} placeholder="230px" /></Field>
          <Field label="Min height (scrolled)"><Input bind:value={scr.banner.min_height} placeholder="150px" /></Field>
          <Field label="Rooms chip goes to">
            <Select bind:value={scr.banner.rooms_screen} options={screenIds} allowEmpty />
          </Field>
        </div>
      {:else}
        <div class="flex items-center gap-3">
          <p class="m-0 text-xs text-dim">No hero — the room view renders a plain title bar.</p>
          <Button size="sm" onclick={() => (scr.banner = { image: "", image_opacity: 0.5, height: "230px", min_height: "150px", show_time: true })}>Add hero</Button>
        </div>
      {/if}
    </SectionFold>

    <!-- THE ROOM'S ACTIVITIES -->
    <SectionFold label="Activities — owned by this room" badge={owned.length + " defined"} bind:open={actsOpen}>
      {#each owned as id, i (id)}
        <ActivityCard {id} open={id === lastAdded}
          onup={i > 0 ? () => moveActivity(id, -1) : null}
          ondown={i < owned.length - 1 ? () => moveActivity(id, 1) : null} />
      {:else}
        <p class="m-0 text-xs text-dim">No activities yet.</p>
      {/each}
      <Button onclick={addActivity}>＋ Add activity</Button>
    </SectionFold>

    <!-- THE ROOM VIEW'S TILE SECTIONS: Presets, Devices, custom groups -->
    {#each tileSections as { s, i } (i)}
      <SectionFold label={s.hero_label || "Section " + (i + 1)}
        badge={(s.tiles?.length ?? 0) + " tiles"}
        bind:open={() => secOpen[i] ?? false, (v) => (secOpen[i] = v)}>
        <div class="flex items-center gap-2">
          <span class="text-[11px] text-dim">Group label</span>
          <input bind:value={s.hero_label} placeholder="(no header)"
            class="w-44 rounded-[8px] border border-line bg-field px-2 py-1 text-xs text-ink outline-none focus:border-accent/60" />
          {#if !(s.tiles || []).length}
            <button class="cursor-pointer border-0 bg-transparent p-0 text-xs text-danger hover:underline"
              onclick={() => scr.sections.splice(i, 1)}>delete empty group</button>
          {/if}
        </div>
        {#each s.tiles as tile, ti (ti)}
          <TileRow {tile} tiles={s.tiles} index={ti} />
        {/each}
        <Button size="sm" onclick={() => newTile(s.tiles)}>＋ Add tile</Button>
      </SectionFold>
    {/each}
    {#if scr?.sections}
      <Button size="sm" onclick={addSection}>＋ Add group (section)</Button>
    {/if}

    <!-- ROOM FUNCTIONS -->
    {#if functions.length}
      <SectionFold label="Room functions" badge="special — hold-Power / All Off target" bind:open={fnOpen}>
        {#each functions as id (id)}
          <ActivityCard {id} />
        {/each}
      </SectionFold>
    {/if}

    <!-- ADVANCED -->
    <SectionFold label="Advanced" badge="boot · hub · paging · routing" bind:open={advOpen}>
      <div class="grid grid-cols-2 gap-3">
        <Field label="Boot view" hint="where a remote lands on startup and Home — normally the room itself">
          <Select bind:value={d.home_screen} options={screenIds} onchange={edit} />
        </Field>
        <Field label="Rooms hub" hint="top of the Home ladder (the all-rooms overview)">
          <Select bind:value={d.global.main_home} options={screenIds} allowEmpty onchange={edit} />
        </Field>
      </div>
      <Field label="View paging order" hint="what the CH◀▶ / page keys flip through, left to right — NOT tile or activity order">
        <Chips bind:items={d.screen_order} suggestions={screenIds} placeholder="add view…" />
      </Field>
      <Field label="Activity state select"
        hint="Legacy routing cache: an input_select HA owns, kept honest by the sync automation and tile self-heal. A coming phase makes the integration own this entity — then this field disappears.">
        <EntityPicker bind:value={d.global.activity_select} domains={["input_select"]} onchange={edit} />
      </Field>
      <Field label="Room-wide buttons" hint="vol/menu logical-key bindings — edit in the Code tab">
        <div class="rounded-[8px] border border-line bg-field p-2 font-mono text-[11px] text-dim">
          {Object.keys(d.global.buttons || {}).join(" · ") || "none"}
        </div>
      </Field>
    </SectionFold>
  </div>
{/if}
