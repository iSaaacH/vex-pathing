<script lang="ts">
  import { store } from './stores/routine.svelte';
  import type { Routine } from './model/types';
  import RoutinePanel from './lib/RoutinePanel.svelte';
  import FieldCanvas from './lib/FieldCanvas.svelte';
  import CodePanel from './lib/CodePanel.svelte';
  import ExportDialog from './lib/ExportDialog.svelte';
  import RoutinesDialog from './lib/RoutinesDialog.svelte';
  import { newRoutineId, saveRoutine } from './stores/library';
  import SettingsDialog from './lib/SettingsDialog.svelte';

  let exportOpen = $state(false);
  let routinesOpen = $state(false);
  let settingsOpen = $state(false);
  let toasts = $state<{ id: number; msg: string; ok: boolean }[]>([]);
  let toastId = 0;
  let fileInput: HTMLInputElement;

  function toast(msg: string, ok = true) {
    const id = ++toastId;
    toasts = [...toasts, { id, msg, ok }];
    setTimeout(() => (toasts = toasts.filter((t) => t.id !== id)), 3200);
  }

  // --- playback ---------------------------------------------------------------------

  let raf = 0;
  let lastFrame = 0;

  function tick(now: number) {
    if (!store.playing) return;
    const dt = lastFrame ? (now - lastFrame) / 1000 : 0;
    lastFrame = now;
    store.playhead += dt;
    if (store.playhead >= store.trace.duration) {
      store.playhead = store.trace.duration;
      store.playing = false;
    }
    raf = requestAnimationFrame(tick);
  }

  function togglePlay() {
    if (store.playing) {
      store.playing = false;
      cancelAnimationFrame(raf);
      return;
    }
    if (store.playhead >= store.trace.duration) store.playhead = 0;
    store.playing = true;
    lastFrame = 0;
    raf = requestAnimationFrame(tick);
  }

  // --- file -------------------------------------------------------------------------

  function openFile() {
    fileInput.click();
  }

  async function onFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as Routine;
      if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.segments)) {
        throw new Error('not a .vexpath document');
      }
      store.replace(parsed, null);
      toast(`Imported ${parsed.name}`);
    } catch (err) {
      toast(`Could not load: ${(err as Error).message}`, false);
    }
    (e.target as HTMLInputElement).value = '';
  }

  /** Ctrl+S saves in place, or opens the dialog if this routine has no name yet. */
  async function quickSave() {
    if (!store.currentId) {
      routinesOpen = true;
      return;
    }
    await saveRoutine(store.currentId, store.routine);
    store.markSaved(store.currentId);
    toast(`Saved "${store.routine.name}"`);
  }

  function onKeydown(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement)?.tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      quickSave();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) store.redo();
      else store.undo();
      return;
    }
    if (typing) return;
    if (e.key === ' ') {
      e.preventDefault();
      togglePlay();
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && store.selectedId) {
      e.preventDefault();
      store.removeSegment(store.selectedId);
    }
  }

  const est = $derived(store.trace.duration.toFixed(1));
</script>

<svelte:window
  onkeydown={onKeydown}
  onbeforeunload={(e) => {
    // The working document is autosaved to localStorage, so nothing is *lost* — but an
    // unsaved routine won't be in the library, which is what people expect "saved" to
    // mean. Only nag when there is something to lose.
    if (store.dirty && store.routine.segments.length > 0) e.preventDefault();
  }}
/>

<div class="shell">
  <header class="topbar">
    <div class="brand">
      <span class="brand-mark">VP</span>
      <span>
        <strong>VEX Pathing</strong>
        <small>Override 2026–27 · LemLib</small>
      </span>
    </div>

    <div class="summary">
      <input
        class="routine-name"
        value={store.routine.name}
        oninput={(e) => store.edit((r) => (r.name = e.currentTarget.value))}
        aria-label="Routine name"
      />
      <span class="stat">segments <strong>{store.routine.segments.length}</strong></span>
      <span class="stat">est <strong>{est}s</strong></span>
      <span class="stat" class:warn={store.trace.collisions > 0}>
        collisions <strong>{store.trace.collisions}</strong>
      </span>
    </div>

    <div class="top-actions">
      <button class="button ghost" onclick={() => store.undo()} disabled={!store.canUndo} title="Undo (Ctrl+Z)">↶</button>
      <button class="button ghost" onclick={() => store.redo()} disabled={!store.canRedo} title="Redo (Ctrl+Shift+Z)">↷</button>
      <button class="button ghost" onclick={() => (routinesOpen = true)}>
        Routines{store.dirty ? ' •' : ''}
      </button>
      <button class="button ghost" onclick={openFile}>Import</button>
      <button class="button ghost" onclick={() => (settingsOpen = true)}>Robot</button>
      <button class="button dark" onclick={() => (exportOpen = true)}>Export</button>
    </div>
  </header>

  <RoutinePanel />

  <main class="workspace">
    <FieldCanvas />

    <div class="field-panel" style="padding:12px 14px">
      <div class="field-bar" style="padding:0">
        <button class="icon-button" onclick={() => (store.playhead = 0)} title="Restart">⏮</button>
        <button class="icon-button active" onclick={togglePlay} title="Play/pause (space)">
          {store.playing ? '❚❚' : '▶'}
        </button>
        <input
          type="range"
          min="0"
          max={Math.max(store.trace.duration, 0.001)}
          step="0.01"
          value={store.playhead}
          oninput={(e) => {
            store.playing = false;
            store.playhead = +e.currentTarget.value;
          }}
          aria-label="Playback position"
        />
        <span><strong>{store.playhead.toFixed(2)}</strong> / {est}s</span>
      </div>

      <div class="toggles" style="margin-top:12px">
        <button class="chip" class:selected={store.showOnion} onclick={() => (store.showOnion = !store.showOnion)}>
          robot trail
        </button>
        <button class="chip" class:selected={store.showGrid} onclick={() => (store.showGrid = !store.showGrid)}>
          tile grid
        </button>
        <button class="chip" class:selected={store.showElements} onclick={() => (store.showElements = !store.showElements)}>
          collision shapes
        </button>
        <button
          class="chip"
          class:selected={store.routine.alliance === 'red'}
          onclick={() => store.edit((r) => (r.alliance = r.alliance === 'red' ? 'blue' : 'red'))}
        >
          {store.routine.alliance}
        </button>
      </div>
    </div>

    <p class="notice">
      <strong>Field render:</strong> orthographic top-down by
      <a href="https://field-rendering.jerryio.com/" target="_blank" rel="noopener">Jerry Lum</a>
      (CC BY 4.0), cropped to exactly the 144&Prime; Floor so it maps 1:1 onto the coordinate
      system. Goal positions are measured from it and agree with a 24&Prime; grid to ~0.35&Prime;;
      Toggle and Loader footprints are still approximate.
    </p>
  </main>

  <CodePanel />
</div>

<input
  bind:this={fileInput}
  type="file"
  accept=".vexpath,.json"
  onchange={onFile}
  style="display:none"
/>

<RoutinesDialog bind:open={routinesOpen} {toast} />
<ExportDialog bind:open={exportOpen} {toast} />
<SettingsDialog bind:open={settingsOpen} />

<div class="toast-region">
  {#each toasts as t (t.id)}
    <div class="toast" class:success={t.ok} class:error={!t.ok}>{t.msg}</div>
  {/each}
</div>
