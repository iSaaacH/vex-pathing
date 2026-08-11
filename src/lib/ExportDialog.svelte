<script lang="ts">
  /** PLAN.md §8.2. Styled on VEX-Live-Tuning's export-option cards. */
  import { store } from '../stores/routine.svelte';

  let { open = $bindable(false), toast }: { open: boolean; toast: (m: string, ok?: boolean) => void } = $props();
  let dialog: HTMLDialogElement;

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  });

  function download(name: string, text: string) {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(store.generated.code);
      toast('Copied to clipboard');
    } catch {
      toast('Clipboard blocked — use Download instead', false);
    }
    open = false;
  }

  function downloadCpp() {
    download(`${store.routine.name}.cpp`, store.generated.code);
    open = false;
  }

  function downloadPaths() {
    const paths = store.generated.paths;
    const names = Object.keys(paths);
    if (!names.length) {
      toast('No follow() segments in this routine', false);
      return;
    }
    for (const n of names) download(n, paths[n]!);
    toast(`${names.length} path file${names.length > 1 ? 's' : ''} downloaded`);
    open = false;
  }

  function downloadDoc() {
    download(`${store.routine.name}.vexpath`, JSON.stringify(store.routine, null, 2));
    open = false;
  }

  const pathCount = $derived(Object.keys(store.generated.paths).length);
</script>

<dialog class="dialog" bind:this={dialog} onclose={() => (open = false)}>
  <form method="dialog" onsubmit={(e) => e.preventDefault()}>
    <div class="dialog-head">
      <div>
        <h2>Export</h2>
        <p>
          {store.routine.segments.length} segments · est. {store.trace.duration.toFixed(1)} s
          {#if store.trace.collisions > 0}· <strong style="color:var(--red)">{store.trace.collisions} collision(s)</strong>{/if}
        </p>
      </div>
      <button class="dialog-close" type="button" onclick={() => (open = false)} aria-label="Close">×</button>
    </div>

    <div class="export-options">
      <button class="export-option" type="button" onclick={copy}>
        <strong>Copy to clipboard</strong>
        <span>The autonomous() body, ready to paste into your PROS project.</span>
        <code>text</code>
      </button>

      <button class="export-option" type="button" onclick={downloadCpp}>
        <strong>Download .cpp</strong>
        <span>Same code with the header comment block and timing estimates.</span>
        <code>{store.routine.name}.cpp</code>
      </button>

      <button class="export-option" type="button" onclick={downloadPaths} disabled={pathCount === 0}>
        <strong>Download path files</strong>
        <span>
          {pathCount === 0
            ? 'No follow() segments — add one to generate pure-pursuit paths.'
            : `${pathCount} file(s) for static/, in LemLib's x, y, velocity format.`}
        </span>
        <code>static/*.txt</code>
      </button>

      <button class="export-option" type="button" onclick={downloadDoc}>
        <strong>Download .vexpath</strong>
        <span>The document itself. Commit it next to the .cpp so routines are reviewable.</span>
        <code>{store.routine.name}.vexpath</code>
      </button>
    </div>

    <p class="caveat" style="margin-top:16px">
      Predicted with perfect odometry. Verify on the field before you trust the timings.
    </p>
  </form>
</dialog>
