<script>
  /* All activities — a read-mostly INDEX grouped by owner room.
     Editing happens in the owning room; orphans surface here so
     nothing can float invisibly. */
  import { app, roomIds, ownerHubs, ownedActivities, unassignedActivities, selectSlice } from "../state.svelte.js";
  import Select from "../components/Select.svelte";

  const d = $derived(app.draft);
  const rooms = $derived(ownerHubs());
  const hubKey = (r) => (roomIds().includes(r) ? "view." + r : "screens." + r);
  const stateKind = (a) => !a.state ? "select-based"
    : a.state.on?.any_state ? "any_state" : a.state.on?.any ? "rules (any)" : "rules (all)";
</script>

{#if d}
  <div class="space-y-6">
    <p class="m-0 text-xs text-dim">
      Activities are stored in one flat registry (the engine routes by id)
      but each belongs to an <b>owner room</b> — edit them there. True
      reuse across rooms is a template concern (coming); surfacing an
      activity in another room is just a tile that references its id.
    </p>

    {#each rooms as r (r)}
      <div>
        <div class="mb-2 flex items-center gap-3">
          <span class="text-[11px] font-bold tracking-[.07em] text-dim uppercase">{d.screens[r]?.name || r}</span>
          <button class="cursor-pointer border-0 bg-transparent p-0 text-xs text-accent hover:underline"
            onclick={() => selectSlice(hubKey(r))}>edit in room →</button>
        </div>
        <div class="overflow-hidden rounded-[12px] border border-line">
          {#each ownedActivities(r) as id, i (id)}
            {@const a = d.activities[id]}
            <button
              class={"flex w-full cursor-pointer items-center gap-3 border-0 bg-tile px-3 py-2.5 text-left font-[inherit] text-ink hover:bg-hover " +
                (i ? "border-t border-line " : "")}
              onclick={() => selectSlice(hubKey(r))}
            >
              <span class="h-2.5 w-2.5 shrink-0 rounded-full" style="background:{a.color || '#666'}"></span>
              <span class="font-semibold">{a.name || id}</span>
              <span class="font-mono text-[11.5px] text-dim">{id}</span>
              <span class="flex-1"></span>
              <span class="text-xs text-dim">{stateKind(a)}</span>
              {#if a.stop}<span class="rounded-full bg-tile-hi px-2 py-0.5 text-[10px] text-dim">own stop</span>{/if}
            </button>
          {:else}
            <div class="bg-tile px-3 py-2.5 text-xs text-dim">No activities yet — add them in the room.</div>
          {/each}
        </div>
      </div>
    {/each}

    {#if unassignedActivities().length}
      <div>
        <div class="mb-2 text-[11px] font-bold tracking-[.07em] text-danger uppercase">Unassigned — no owner room</div>
        <div class="overflow-hidden rounded-[12px] border border-danger/40">
          {#each unassignedActivities() as id, i (id)}
            {@const a = d.activities[id]}
            <div class={"flex items-center gap-3 bg-tile px-3 py-2.5 " + (i ? "border-t border-line " : "")}>
              <span class="h-2.5 w-2.5 shrink-0 rounded-full" style="background:{a.color || '#666'}"></span>
              <span class="font-semibold">{a.name || id}</span>
              <span class="font-mono text-[11.5px] text-dim">{id}</span>
              <span class="flex-1"></span>
              <span class="text-xs text-dim">assign:</span>
              <Select value={a.room_view || ""} options={rooms} allowEmpty class="w-40"
                onchange={(e) => (a.room_view = e.target.value || undefined)} />
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>
{/if}
