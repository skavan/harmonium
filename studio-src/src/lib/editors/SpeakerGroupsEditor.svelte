<script>
  /* SPEAKER GROUPS (v0.83.7 — Suresh: "I can create a Group like
     Outdoor Music Players and put all my ma_players in that").
     Named, workspace-level speaker collections — deliberately NOT
     part of any activity's cast, because cast answers "what does
     this activity use" and this answers "what is joinable": the
     receiver is a media_player whose only job is to be an amplifier,
     while half the joinable players live outside the cast entirely.
     An activity points its Speakers band at a group on the
     Controller tab (or a tile says group: "<id>" by hand), and the
     remote offers THOSE players — as a slim launcher ("5 available ·
     2 linked" → the group's own page with per-player trim sliders)
     or as the full card inline. */
  import { app, schedulePreview, selectSlice } from "../state.svelte.js";
  import CardRow from "../components/CardRow.svelte";
  import Field from "../components/Field.svelte";
  import Input from "../components/Input.svelte";
  import Button from "../components/Button.svelte";
  import EntityPicker from "../components/EntityPicker.svelte";
  import NoteStrip from "../components/NoteStrip.svelte";

  const groups = $derived(app.draft?.speaker_groups || {});
  /* THE RETURN TRIP (v0.83.8 follow-up — Suresh: "When I create a
     speaker group from the controllers tab, I don't get the return
     to Activity option"): the ＋ Create group… door arrives here
     from a room page's activity card; the same back chip the
     Actions door earned takes you home. */
  const backKey = $derived(
    app.prevKey && app.prevKey !== "spkgroups" &&
    (app.prevKey.startsWith("view.") || app.prevKey.startsWith("screens.")) ? app.prevKey : null);
  const backLabel = $derived.by(() => {
    if (!backKey) return "";
    const sid = backKey.startsWith("view.") ? backKey.slice(5) : backKey.slice(8);
    return app.draft?.screens?.[sid]?.name || sid;
  });
  let openId = $state(null);
  let adding = $state("");   /* entity being typed per open group */

  const slug = (s) =>
    (s || "").toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

  function addGroup() {
    if (!app.draft) return;
    if (!app.draft.speaker_groups) app.draft.speaker_groups = {};
    let id = "group", n = 2;
    while (app.draft.speaker_groups[id]) id = "group_" + n++;
    app.draft.speaker_groups[id] = { name: "New speaker group", entities: [] };
    openId = id;
    schedulePreview();
  }
  function renameId(oldId) {
    /* keep the id in step with the name, but only while nothing
       references it — a referenced id stays put (activities'
       surface.speakers_group + hand-authored tiles point at it) */
    const g = app.draft.speaker_groups[oldId];
    const want = slug(g.name);
    if (!want || want === oldId || app.draft.speaker_groups[want]) return;
    const referenced = Object.values(app.draft.activities || {}).some(
      (a) => a?.surface?.speakers_group === oldId);
    if (referenced) return;
    const next = {};
    for (const [k, v] of Object.entries(app.draft.speaker_groups))
      next[k === oldId ? want : k] = v;
    app.draft.speaker_groups = next;
    if (openId === oldId) openId = want;
    schedulePreview();
  }
  function removeGroup(id) {
    delete app.draft.speaker_groups[id];
    /* sweep dangling references so the band falls back to the cast */
    for (const a of Object.values(app.draft.activities || {}))
      if (a?.surface?.speakers_group === id) {
        delete a.surface.speakers_group;
        delete a.surface.speakers_mode;
      }
    if (openId === id) openId = null;
    schedulePreview();
  }
  function addEnt(id) {
    const en = (adding || "").trim();
    if (!en || !en.includes(".")) return;
    const g = app.draft.speaker_groups[id];
    if (!Array.isArray(g.entities)) g.entities = [];
    if (!g.entities.includes(en)) g.entities.push(en);
    adding = "";
    schedulePreview();
  }
  function dropEnt(id, en) {
    const g = app.draft.speaker_groups[id];
    g.entities = (g.entities || []).filter((x) => x !== en);
    schedulePreview();
  }
  const usedBy = (id) =>
    Object.entries(app.draft?.activities || {})
      .filter(([, a]) => a?.surface?.speakers_group === id)
      .map(([, a]) => a.name)
      .filter(Boolean);
</script>

<div class="space-y-3">
  {#if backKey}
    <button class="cursor-pointer border-0 bg-transparent p-0 text-xs text-accent hover:underline"
      onclick={() => selectSlice(backKey)}>← back to {backLabel}</button>
  {/if}
  <NoteStrip>
    A speaker group is a <b>named set of joinable players</b> — "Outdoor
    Music Players" — independent of any activity's cast. Point an
    activity's Speakers band at one on its <b>Controller tab</b> and the
    remote offers these players instead of the cast: as a slim launcher
    tile ("5 available · 2 linked" — tap opens the group's page, with a
    volume slider per player so levels get set <i>before</i> linking) or
    as the full card inline. Players join whatever that activity is
    playing; the receiver that's only an amplifier simply doesn't belong
    here.
  </NoteStrip>

  {#each Object.entries(groups) as [gid, g] (gid)}
    <CardRow title={g.name || gid}
      subtitle={(g.entities || []).length + " players" +
        (usedBy(gid).length ? " · used by " + usedBy(gid).join(", ") : "")}
      bind:open={() => openId === gid, (v) => (openId = v ? gid : null)}
      ondelete={() => removeGroup(gid)}>
      <div class="space-y-2.5 p-2.5">
        <Field label="Name">
          <Input bind:value={g.name} onchange={() => { renameId(gid); schedulePreview(); }} />
        </Field>
        <div class="text-[11px] uppercase tracking-wide text-dim">Players</div>
        {#each g.entities || [] as en (en)}
          <div class="flex items-center gap-2">
            <span class="min-w-0 flex-1 truncate text-[12.5px]">{en}</span>
            <button class="cursor-pointer border-0 bg-transparent p-0 text-xs text-dim hover:text-red-500"
              title="Remove from group" onclick={() => dropEnt(gid, en)}>✕</button>
          </div>
        {/each}
        <div class="flex items-center gap-2">
          <div class="min-w-0 flex-1">
            <EntityPicker bind:value={adding} domains={["media_player"]}
              placeholder="media_player.* — type to search"
              onchange={() => addEnt(gid)} />
          </div>
          <Button onclick={() => addEnt(gid)}>＋ Add player</Button>
        </div>
        {#if (g.entities || []).length === 1}
          <p class="text-xs text-dim">One player is not a group yet — the card
            appears once there are two.</p>
        {/if}
        <p class="text-xs text-dim">id: <code>{gid}</code></p>
      </div>
    </CardRow>
  {/each}

  <Button onclick={addGroup}>＋ Add speaker group</Button>
  {#if !Object.keys(groups).length}
    <p class="text-xs text-dim">None yet. A good first one: every Music
      Assistant player you'd ever bond to a running stream.</p>
  {/if}
</div>
