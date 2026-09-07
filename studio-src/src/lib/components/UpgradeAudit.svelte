<script>
  /* THE UPGRADE AUDIT banner + panel (2026-09-06 — Suresh: "I'm a bit
     worried users will get left behind… should they get an audit
     report?"; design-upgrade-audit.md). Laws, enforced here: empty
     renders as NOTHING; quiet by default (one line, never a modal);
     every finding carries its door or states "no action"; style-era
     guesses render as observations, no verb, no urgency. Dismissing
     writes into the draft, so Save & Deploy remembers it on every
     machine. */
  import { app, selectSlice } from "../state.svelte.js";
  import { RELEASE_BEHAVIOR } from "../release-behavior.js";

  const audit = $derived(app.draft?.audit);
  const show = $derived(!!audit && !audit.dismissed &&
    (audit.findings || []).length > 0);
  let open = $state(false);

  const nFindings = $derived((audit?.findings || []).length);
  function dismiss() {
    if (app.draft?.audit) app.draft.audit.dismissed = true;
    open = false;
  }
  /* behavior lines for every release in (from, to] — plain semver walk */
  const cmp = (x, y) => {
    const a = String(x).split(".").map(Number), b = String(y).split(".").map(Number);
    for (let i = 0; i < 3; i++) { const d = (a[i] || 0) - (b[i] || 0); if (d) return d; }
    return 0;
  };
  const behavior = $derived.by(() => {
    if (!audit) return [];
    return Object.entries(RELEASE_BEHAVIOR)
      .filter(([v]) => cmp(v, audit.from) > 0 && cmp(v, audit.to) <= 0)
      .sort(([x], [y]) => cmp(x, y))
      .flatMap(([, lines]) => lines);
  });
  const genWord = (h) => h.from != null && h.from !== h.to
    ? " (v" + h.from + " → v" + h.to + ")" : "";
</script>

{#if show}
  <div class="border-b border-note-line bg-note-bg px-4 py-2 text-[12.5px] text-ink-2">
    <div class="flex items-center gap-2">
      <span class="material-symbols-outlined text-[17px] leading-none text-accent">upgrade</span>
      <span class="min-w-0 flex-1 truncate">
        Upgraded <b>{audit.from}</b> → <b>{audit.to}</b> —
        {nFindings} thing{nFindings === 1 ? "" : "s"} worth a look.
      </span>
      <button class="shrink-0 cursor-pointer border-0 bg-transparent p-0 text-[12px] font-medium text-accent hover:underline"
        onclick={() => (open = !open)}>{open ? "hide" : "show me"}</button>
      <button class="shrink-0 cursor-pointer border-0 bg-transparent p-0 text-[12px] text-dim hover:text-ink"
        title="Dismiss — Save & Deploy remembers this on every machine"
        onclick={dismiss}>dismiss</button>
    </div>
    {#if open}
      <div class="mt-2 space-y-1.5 pb-1">
        {#each audit.findings || [] as f, i (i)}
          {#if f.kind === "stock_healed"}
            <p class="m-0">
              <b>{f.items.length} built-in{f.items.length === 1 ? "" : "s"} updated</b>
              ({f.items.map((h) => (h.name || h.id) + genWord(h)).join(", ")}) —
              updates keep them current, no action needed.
            </p>
          {:else if f.kind === "fork_behind"}
            <p class="m-0">
              <b>{f.name}</b> is your own copy of the
              {f.variant_of} built-in, made from v{f.base_gen} — the built-in
              has since moved to v{f.stock_gen}. It keeps working exactly as
              you shaped it. <i>Recommendation:</i> open it and compare; Reset
              to built-in is there if you'd rather take the new base.
              <button class="cursor-pointer border-0 bg-transparent p-0 text-[12px] font-medium text-accent hover:underline"
                onclick={() => selectSlice("controller." + f.id)}>open it →</button>
            </p>
          {:else if f.kind === "legitimized"}
            <p class="m-0">
              <b>{f.items.length} edited built-in{f.items.length === 1 ? "" : "s"}</b>
              ({f.items.map((h) => h.name || h.id).join(", ")}) became your own
              named cop{f.items.length === 1 ? "y" : "ies"} — your edits are
              preserved; the built-in will update separately from now on.
            </p>
          {:else if f.kind === "pins_kept"}
            <p class="m-0">
              <b>{f.count} legacy dialect pin{f.count === 1 ? "" : "s"}</b> kept
              as-is (ambiguous to move automatically). <i>Recommendation:</i>
              review on the affected activities' Roles tab.
            </p>
          {:else if f.kind === "observation"}
            <p class="m-0 text-dim">{f.text}</p>
          {/if}
        {/each}
        {#if behavior.length}
          <p class="m-0 mt-1 text-[11px] font-bold tracking-[.06em] text-dim uppercase">What changed in behavior</p>
          {#each behavior as line, i (i)}
            <p class="m-0 text-dim">· {line}</p>
          {/each}
        {/if}
      </div>
    {/if}
  </div>
{/if}
