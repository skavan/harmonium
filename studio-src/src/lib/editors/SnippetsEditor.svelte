<script>
  /* SNIPPETS — reusable blocks, grouped by type (Suresh's spec).
     Saved from a block's ⤴ on activity cards; inserted back with ⤵.
     localStorage-backed: global across workspaces, reseed-proof. */
  import { snips, SNIPPET_TYPES, renameSnippet, deleteSnippet, snippetsOf } from "../state.svelte.js";
  import CardRow from "../components/CardRow.svelte";
  import Field from "../components/Field.svelte";
  import Input from "../components/Input.svelte";
  import JsonArea from "../components/JsonArea.svelte";
</script>

<div class="space-y-4">
  <p class="m-0 text-xs text-dim">
    Snippets are saved with the <b>upload</b> icon on an activity's
    Setup or State block, and inserted with the <b>download</b> icon on
    any compatible block. They live in this browser — global across
    every workspace, and reseeds never touch them.
  </p>
  {#each Object.entries(SNIPPET_TYPES) as [type, label] (type)}
    <div>
      <div class="mb-2 text-[11px] font-bold tracking-[.07em] text-dim uppercase">{label}</div>
      <div class="space-y-2">
        {#each snippetsOf(type) as [id, sn] (id)}
          <CardRow title={sn.name || id} subtitle={id + (sn.saved ? " · saved " + sn.saved : "")}
            ondelete={() => deleteSnippet(id)}>
            <Field label="Name">
              <Input value={sn.name} onchange={(e) => renameSnippet(id, e.target.value)} />
            </Field>
            <div class="mt-2">
              <JsonArea value={sn.data} rows={8} onchange={(v) => { sn.data = v; renameSnippet(id, sn.name); }} />
            </div>
          </CardRow>
        {:else}
          <p class="m-0 text-xs text-dim">None yet — hit the upload icon on a block to capture one.</p>
        {/each}
      </div>
    </div>
  {/each}
</div>
