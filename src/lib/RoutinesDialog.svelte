<script lang="ts">
  /**
   * Routine management: new, save, save-as, load, rename, duplicate, delete.
   *
   * The list is loaded when the dialog opens rather than mirrored live — it is I/O, and
   * a stale-by-a-second list is not a problem anyone has.
   */
  import { store } from '../stores/routine.svelte';
  import { blankRoutine, demoRoutine } from '../config/defaults';
  import {
    deleteRoutine,
    listRoutines,
    loadRoutine,
    newRoutineId,
    relativeTime,
    renameRoutine,
    saveRoutine,
    type RoutineSummary,
  } from '../stores/library';

  let { open = $bindable(false), toast }: { open: boolean; toast: (m: string, ok?: boolean) => void } =
    $props();

  let dialog: HTMLDialogElement;
  let items = $state<RoutineSummary[]>([]);
  let saveAsName = $state('');
  let confirmingDelete = $state<string | null>(null);
  let renaming = $state<string | null>(null);
  let renameValue = $state('');

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      refresh();
      saveAsName = store.routine.name;
      confirmingDelete = null;
      renaming = null;
    }
    if (!open && dialog.open) dialog.close();
  });

  async function refresh() {
    items = await listRoutines();
  }

  /** Guard every destructive jump away from the current document. */
  function unsavedWarning(): boolean {
    if (store.dirty && store.routine.segments.length > 0) {
      return !confirm(
        `"${store.routine.name}" has unsaved changes. Discard them?\n\nCancel, then Save, if you want to keep it.`,
      );
    }
    return false;
  }

  function newRoutine() {
    if (unsavedWarning()) return;
    store.replace(blankRoutine(), null);
    toast('New routine');
    open = false;
  }

  function newFromDemo() {
    if (unsavedWarning()) return;
    store.replace(demoRoutine(), null);
    toast('Demo routine loaded');
    open = false;
  }

  async function save() {
    const id = store.currentId ?? newRoutineId();
    await saveRoutine(id, store.routine);
    store.markSaved(id);
    toast(`Saved "${store.routine.name}"`);
    refresh();
  }

  async function saveAs() {
    const name = saveAsName.trim();
    if (!name) {
      toast('Give it a name first', false);
      return;
    }
    const id = newRoutineId();
    store.edit((r) => (r.name = name));
    await saveRoutine(id, store.routine);
    store.markSaved(id);
    toast(`Saved as "${name}"`);
    refresh();
  }

  async function load(item: RoutineSummary) {
    if (unsavedWarning()) return;
    const r = await loadRoutine(item.id);
    if (!r) {
      toast('Could not load that routine', false);
      return;
    }
    store.replace(r, item.id);
    toast(`Opened "${item.name}"`);
    open = false;
  }

  async function duplicate(item: RoutineSummary) {
    const r = await loadRoutine(item.id);
    if (!r) return;
    r.name = `${item.name}-copy`;
    await saveRoutine(newRoutineId(), r);
    toast(`Duplicated "${item.name}"`);
    refresh();
  }

  async function remove(item: RoutineSummary) {
    if (confirmingDelete !== item.id) {
      confirmingDelete = item.id;
      return;
    }
    await deleteRoutine(item.id);
    if (store.currentId === item.id) store.markUnsaved();
    confirmingDelete = null;
    toast(`Deleted "${item.name}"`);
    refresh();
  }

  function startRename(item: RoutineSummary) {
    renaming = item.id;
    renameValue = item.name;
  }

  async function commitRename(item: RoutineSummary) {
    const name = renameValue.trim();
    renaming = null;
    if (!name || name === item.name) return;
    await renameRoutine(item.id, name);
    if (store.currentId === item.id) store.edit((r) => (r.name = name));
    refresh();
  }
</script>

<dialog class="dialog" bind:this={dialog} onclose={() => (open = false)}>
  <form method="dialog" onsubmit={(e) => e.preventDefault()}>
    <div class="dialog-head">
      <div>
        <h2>Routines</h2>
        <p>
          Saved in this browser. Use Export &rarr; <code>.vexpath</code> to move one between
          machines or commit it next to your robot code.
        </p>
      </div>
      <button class="dialog-close" type="button" onclick={() => (open = false)} aria-label="Close">×</button>
    </div>

    <div class="section-heading" style="margin-top:16px">Current — {store.routine.name}</div>
    <div class="current-row">
      <button class="button primary small" type="button" onclick={save}>
        {store.currentId ? 'Save' : 'Save to library'}
      </button>
      <input
        type="text"
        bind:value={saveAsName}
        placeholder="name for a copy"
        aria-label="Save as name"
        onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), saveAs())}
      />
      <button class="button small" type="button" onclick={saveAs}>Save as</button>
      <span class="dirty" class:on={store.dirty}>{store.dirty ? 'unsaved changes' : 'up to date'}</span>
    </div>

    <div class="section-heading" style="margin-top:20px">Start something new</div>
    <div class="new-row">
      <button class="button small" type="button" onclick={newRoutine}>+ New empty routine</button>
      <button class="button small ghost" type="button" onclick={newFromDemo}>Load the demo</button>
    </div>

    <div class="section-heading" style="margin-top:22px">
      Saved
      <span>{items.length}</span>
    </div>

    {#if items.length === 0}
      <p class="empty-state">
        Nothing saved yet. Build a routine, then <strong>Save to library</strong> above.
      </p>
    {/if}

    {#each items as item (item.id)}
      <div class="routine-row" class:active={store.currentId === item.id}>
        <div class="routine-meta">
          {#if renaming === item.id}
            <!-- svelte-ignore a11y_autofocus -->
            <input
              class="rename"
              type="text"
              bind:value={renameValue}
              autofocus
              onblur={() => commitRename(item)}
              onkeydown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitRename(item); }
                if (e.key === 'Escape') renaming = null;
              }}
            />
          {:else}
            <strong>{item.name}</strong>
          {/if}
          <span>{item.segments} segment{item.segments === 1 ? '' : 's'} · {relativeTime(item.updatedAt)}</span>
        </div>
        <button class="button small" type="button" onclick={() => load(item)}>Open</button>
        <button class="icon-button" type="button" title="Rename" onclick={() => startRename(item)}>✎</button>
        <button class="icon-button" type="button" title="Duplicate" onclick={() => duplicate(item)}>⧉</button>
        <button
          class="icon-button danger"
          class:confirming={confirmingDelete === item.id}
          type="button"
          title={confirmingDelete === item.id ? 'Click again to delete' : 'Delete'}
          onclick={() => remove(item)}
        >
          {confirmingDelete === item.id ? '!' : '×'}
        </button>
      </div>
    {/each}
  </form>
</dialog>

<style>
  .current-row {
    display: grid;
    grid-template-columns: auto 1fr auto auto;
    gap: 8px;
    align-items: center;
  }
  .current-row input {
    border: 1px solid #ded7cb;
    border-radius: 8px;
    padding: 7px 9px;
    background: var(--paper);
    font: 500 11px var(--mono);
    color: var(--ink);
    min-width: 0;
  }
  .dirty { color: #9a958c; font-size: 9px; white-space: nowrap; }
  .dirty.on { color: var(--orange); font-weight: 700; }

  .new-row { display: flex; gap: 8px; flex-wrap: wrap; }

  .routine-row {
    display: grid;
    grid-template-columns: 1fr auto auto auto auto;
    gap: 6px;
    align-items: center;
    padding: 9px 2px;
    border-top: 1px solid var(--line);
  }
  .routine-row.active { background: var(--green-soft); border-radius: 8px; padding-left: 8px; padding-right: 8px; }
  .routine-meta { min-width: 0; }
  .routine-meta strong { display: block; font-size: 12px; }
  .routine-meta span { display: block; margin-top: 2px; color: #918c83; font-size: 9px; }
  .rename {
    width: 100%;
    border: 1px solid var(--green);
    border-radius: 6px;
    padding: 3px 6px;
    background: var(--paper);
    font: 700 12px inherit;
    color: var(--ink);
  }
  .icon-button.confirming { color: #fff; background: var(--red); border-color: var(--red); }
</style>
