<script>
  import { app, bindPreview, pushPreview, sendKey } from "./state.svelte.js";
  let iframe = $state(null);
  $effect(() => { if (iframe) bindPreview(iframe.contentWindow); });
  const devices = $derived(Object.keys(app.draft?.devices || { default: 1 }));
  /* Suresh's layout: taps row · holds row · the 9-block
     (vol/dpad/channel) · gap · ancillary */
  const SOFT_GROUPS = [
    [ /* system taps */
      { k: "[", g: "↩", l: "BACK" }, { k: "F1", g: "⌂", l: "HOME" }, { k: "F2", g: "⏻", l: "POWER" },
    ],
    [ /* system holds */
      { k: "{", g: "↩✚", l: "BACK HOLD" }, { k: "}", g: "⌂✚", l: "HOME HOLD" }, { k: "o", g: "⏻✚", l: "PWR HOLD" },
    ],
    [ /* the 9-block: volume · d-pad · channel */
      { k: "+", g: "＋", l: "VOL" },  { k: "ArrowUp", g: "▲", l: "UP" },     { k: "PageUp", g: "CH＋", l: "CH" },
      { k: "ArrowLeft", g: "◀", l: "LEFT" }, { k: "Enter", g: "OK", l: "ENTER" }, { k: "ArrowRight", g: "▶", l: "RIGHT" },
      { k: "-", g: "－", l: "VOL" }, { k: "ArrowDown", g: "▼", l: "DOWN" }, { k: "PageDown", g: "CH－", l: "CH" },
    ],
    [ /* ancillary */
      { k: "#", g: "≡", l: "MENU" }, { k: "@", g: "▦", l: "MENU HOLD" }, { k: "`", g: "🔇", l: "MUTE" },
    ],
  ];
</script>

<div class="flex w-[372px] shrink-0 flex-col items-center overflow-y-auto border-l border-line py-3.5">
  <div class="mb-2.5 flex items-center gap-2">
    {#key app.pvPulse}
      <span class="pv-blip text-[10px] text-ok" title="preview updated">●</span>
    {/key}
    <span class="text-xs text-dim">Preview as</span>
    <select id="devSel" bind:value={app.device} onchange={pushPreview}
      class="cursor-pointer rounded-[8px] border-0 bg-tile-hi px-2.5 py-1.5 font-[inherit] text-sm text-ink outline-none">
      {#each devices as d (d)}<option value={d}>{d}</option>{/each}
    </select>
  </div>

  <div class="shrink-0 rounded-[22px] bg-black p-1 shadow-[0_0_0_2px_#2c333d,0_12px_40px_rgba(0,0,0,.5)]">
    <iframe id="pv" bind:this={iframe} title="Live preview"
      src="/local/harmonium/index.html#preview=1"
      class="h-[537px] w-[320px] rounded-[18px] border-0 bg-bg"></iframe>
  </div>

  <div id="soft" class="mt-3 flex flex-col items-center">
    {#each SOFT_GROUPS as grp, gi (gi)}
      <div class={"grid grid-cols-[repeat(3,64px)] justify-center gap-2 " +
        (gi === 3 ? "mt-4" : gi > 0 ? "mt-2" : "")}>
        {#each grp as b (b.k)}
          <button data-k={b.k} onclick={() => sendKey(b.k)}
            class="flex h-11 cursor-pointer flex-col items-center justify-center rounded-[12px] border-0 bg-tile-hi p-0 font-[inherit] text-[13px] text-ink select-none active:bg-accent active:text-accent-ink">
            {b.g}<small class="text-[9px] tracking-[.05em] text-dim">{b.l}</small>
          </button>
        {/each}
      </div>
    {/each}
  </div>
  <div class="mt-2 px-3.5 text-center text-[11px] text-dim">
    Soft remote injects the Astrion's real keys — feel the tap/hold policy
    before touching the device. Live states flow once the remote has been
    opened (and authed) in this browser.
  </div>
</div>
