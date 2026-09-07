<script>
  /* THE DEVICE-PAGE DOOR (2026-09-04, Media Device round 3 — Suresh:
     "It's not at all obvious that we should go to Pre-Wired devices
     (and it only shows Customize its page, not select one). The entry
     door should be in an activities device page and a page's device
     page."). ONE affordance, rendered wherever a device lives — the
     Pre-wired Devices card, the activity ⚙, the page tile row — so
     the answer to "make this device's page different" is always in
     reach and always the same:
     · a SELECT of every page this device could use — Auto (its copy
       when one exists, else the stock), the stock pinned explicitly,
       any same-domain variant (two Samsungs sharing one custom page)
       — written to the DEVICE bundle (`page`, beside `dialect`),
       which the engine's detailDef honors first;
     · ✎ Edit its page opens whatever currently answers (the stock
       stays view-only);
     · ⧉ New copy forks the stock for exactly this device.
     Entities no pre-wired device owns still get the copy/edit pair —
     there is just no device bundle to carry an assignment. */
  import { selectSlice, instantiateDeviceController, devicePageInfo, setDevicePage } from "../state.svelte.js";
  import Button from "./Button.svelte";
  import Select from "./Select.svelte";
  let { entity } = $props();
  const info = $derived(devicePageInfo(entity));
  const options = $derived.by(() => {
    if (!info) return [];
    const rows = [];
    /* pinning the stock is only a distinct choice when Auto would
       resolve somewhere else (its copy exists) */
    if (info.ownCopy) rows.push({ value: info.dom, label: "Stock — " + info.stockName });
    for (const v of info.variants)
      rows.push({ value: v.id, label: v.name +
        (v.entity === entity ? " — its own copy"
          : v.entity ? " — made for " + v.entity : " — shared") });
    return rows;
  });
  const blank = $derived(!info ? "" :
    info.ownCopy ? "Auto — its own copy (" + info.ownCopy.name + ")"
      : "Auto — the stock " + info.stockName + " page");
  const editable = $derived(!!info && info.effective !== info.dom);
</script>

{#if info}
  <div class="flex flex-wrap items-center gap-3 rounded-[10px] border border-line bg-tile px-3 py-2">
    <span class="text-xs text-ink"><b>Its page</b> <span class="text-dim">— what opening this device shows</span></span>
    {#if info.dev && (options.length || info.assigned)}
      <div class="w-[280px] min-w-[220px]">
        <Select value={info.assigned ?? ""} allowEmpty blankLabel={blank}
          title="which page this device opens — stored on the device, like its dialect"
          options={options}
          onchange={(e) => setDevicePage(info.devId, e.target.value)} />
      </div>
    {:else}
      <span class="text-[11px] text-dim">{info.ownCopy
        ? "its own custom copy" : "the shared stock " + info.stockName + " page"}</span>
    {/if}
    {#if editable}
      <Button size="sm" title="Open the page this device currently uses"
        onclick={() => selectSlice("controller." + info.effective)}>✎ Edit its page</Button>
    {:else}
      <button class="cursor-pointer border-0 bg-transparent p-0 text-[11px] text-accent hover:underline"
        onclick={() => selectSlice("controller." + info.dom)}>view the stock</button>
    {/if}
    {#if !info.ownCopy}
      <Button size="sm" title={"Fork the " + info.stockName + " page just for this device — the stock stays shared"}
        onclick={() => instantiateDeviceController(info.dom, entity)}>⧉ New copy for this device</Button>
    {/if}
  </div>
{/if}
