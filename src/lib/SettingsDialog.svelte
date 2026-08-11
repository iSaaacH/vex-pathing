<script lang="ts">
  /**
   * Robot settings. PLAN.md §4.2.
   *
   * The paste-importer is the important half: nobody re-types twelve PID constants
   * correctly, and a simulation run on wrong gains looks authoritative while being
   * wrong.
   */
  import { store } from '../stores/routine.svelte';
  import { importChassisSettings } from '../model/importSettings';
  import type { ControllerSettings } from '../model/types';

  let { open = $bindable(false) }: { open: boolean } = $props();
  let dialog: HTMLDialogElement;
  let paste = $state('');
  let result = $state<{ ok: boolean; msg: string } | null>(null);

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  });

  const CTRL_FIELDS: { key: keyof ControllerSettings; label: string }[] = [
    { key: 'kP', label: 'kP' },
    { key: 'kI', label: 'kI' },
    { key: 'kD', label: 'kD' },
    { key: 'windupRange', label: 'windup' },
    { key: 'smallError', label: 'smallErr' },
    { key: 'smallErrorTimeout', label: 'smallT' },
    { key: 'largeError', label: 'largeErr' },
    { key: 'largeErrorTimeout', label: 'largeT' },
    { key: 'slew', label: 'slew' },
  ];

  function doImport() {
    const r = importChassisSettings(paste, store.routine.settings);
    if (r.ok) {
      store.edit((rt) => (rt.settings = r.settings));
      result = { ok: true, msg: `Imported: ${r.found.join(', ')}` };
    } else {
      result = { ok: false, msg: r.error };
    }
  }
</script>

<dialog class="dialog" bind:this={dialog} onclose={() => (open = false)}>
  <form method="dialog" onsubmit={(e) => e.preventDefault()}>
    <div class="dialog-head">
      <div>
        <h2>Robot settings</h2>
        <p>These drive the simulation. Wrong gains give a confident, wrong preview.</p>
      </div>
      <button class="dialog-close" type="button" onclick={() => (open = false)} aria-label="Close">×</button>
    </div>

    <div class="section-heading" style="margin-top:18px">Import from main.cpp</div>
    <textarea
      class="paste-area"
      bind:value={paste}
      placeholder={'Paste your lemlib::Drivetrain and lemlib::ControllerSettings blocks here...'}
    ></textarea>
    <div style="display:flex;gap:8px;align-items:center;margin-top:8px">
      <button class="button small primary" type="button" onclick={doImport}>Parse</button>
      {#if result}
        <span class="import-result" class:error={!result.ok}>{result.msg}</span>
      {/if}
    </div>

    <div class="section-heading" style="margin-top:22px">Drivetrain</div>
    <div class="settings-grid">
      <label><span>trackWidth</span><input type="number" step="0.25" value={store.routine.settings.drivetrain.trackWidth}
        oninput={(e) => store.edit((r) => (r.settings.drivetrain.trackWidth = +e.currentTarget.value))} /></label>
      <label><span>wheelDiameter</span><input type="number" step="0.25" value={store.routine.settings.drivetrain.wheelDiameter}
        oninput={(e) => store.edit((r) => (r.settings.drivetrain.wheelDiameter = +e.currentTarget.value))} /></label>
      <label><span>rpm</span><input type="number" step="10" value={store.routine.settings.drivetrain.rpm}
        oninput={(e) => store.edit((r) => (r.settings.drivetrain.rpm = +e.currentTarget.value))} /></label>
      <label><span>horizontalDrift</span><input type="number" step="0.5" value={store.routine.settings.drivetrain.horizontalDrift}
        oninput={(e) => store.edit((r) => (r.settings.drivetrain.horizontalDrift = +e.currentTarget.value))} /></label>
      <label><span>robot width</span><input type="number" step="0.5" value={store.routine.settings.drivetrain.robotWidth}
        oninput={(e) => store.edit((r) => (r.settings.drivetrain.robotWidth = +e.currentTarget.value))} /></label>
      <label><span>robot length</span><input type="number" step="0.5" value={store.routine.settings.drivetrain.robotLength}
        oninput={(e) => store.edit((r) => (r.settings.drivetrain.robotLength = +e.currentTarget.value))} /></label>
    </div>

    <div class="section-heading" style="margin-top:22px">Lateral controller</div>
    <div class="settings-grid">
      {#each CTRL_FIELDS as f}
        <label>
          <span>{f.label}</span>
          <input type="number" step="0.1" value={store.routine.settings.lateral[f.key]}
            oninput={(e) => store.edit((r) => (r.settings.lateral[f.key] = +e.currentTarget.value))} />
        </label>
      {/each}
    </div>

    <div class="section-heading" style="margin-top:22px">Angular controller</div>
    <div class="settings-grid">
      {#each CTRL_FIELDS as f}
        <label>
          <span>{f.label}</span>
          <input type="number" step="0.1" value={store.routine.settings.angular[f.key]}
            oninput={(e) => store.edit((r) => (r.settings.angular[f.key] = +e.currentTarget.value))} />
        </label>
      {/each}
    </div>
  </form>
</dialog>
