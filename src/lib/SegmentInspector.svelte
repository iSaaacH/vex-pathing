<script lang="ts">
  /**
   * Per-kind inspector. PLAN.md §2.1 — an expanded segment shows the fields for *that
   * kind and nothing else*. A turnToHeading never shows an x/y box, because LemLib
   * expresses heading through the choice of motion, not through an interpolation mode.
   */
  import { store } from '../stores/routine.svelte';
  import { newId } from '../config/defaults';
  import type { Segment } from '../model/types';

  let { segment }: { segment: Segment } = $props();

  function set(fn: (s: any) => void) {
    store.edit((r) => {
      const s = r.segments.find((x) => x.id === segment.id);
      if (s) fn(s);
    });
  }

  const isMotion = $derived(segment.kind !== 'wait' && segment.kind !== 'action');
  const params = $derived('params' in segment ? (segment.params as Record<string, any>) : null);
  const chained = $derived('chain' in segment && segment.chain.mode === 'chained');

  function toggleChain(on: boolean) {
    set((s) => {
      s.chain = on ? { mode: 'chained', minSpeed: 40, earlyExitRange: 4 } : { mode: 'blocking' };
    });
  }

  function addMarker() {
    set((s) => s.markers.push({ id: newId(), atInches: 6, code: 'intake.move(127);' }));
  }
  function removeMarker(id: string) {
    set((s) => (s.markers = s.markers.filter((m: any) => m.id !== id)));
  }
</script>

<div class="seg-body">
  {#if segment.kind === 'wait'}
    <div class="field-row">
      <label for="wait-{segment.id}"><span>Duration</span><small>pros::delay(ms)</small></label>
      <input
        id="wait-{segment.id}"
        type="number"
        value={segment.ms}
        oninput={(e) => set((s) => (s.ms = +e.currentTarget.value))}
      />
    </div>
  {:else if segment.kind === 'action'}
    <div class="field-row wide">
      <label for="act-{segment.id}"><span>C++</span><small>Emitted verbatim. The escape hatch for intakes, clamps, pistons.</small></label>
      <textarea
        id="act-{segment.id}"
        value={segment.code}
        oninput={(e) => set((s) => (s.code = e.currentTarget.value))}
      ></textarea>
    </div>
  {:else}
    {#if 'target' in segment}
      <div class="field-row">
        <label for="x-{segment.id}"><span>x</span></label>
        <input id="x-{segment.id}" type="number" step="0.5" value={segment.target.x}
          oninput={(e) => set((s) => (s.target.x = +e.currentTarget.value))} />
      </div>
      <div class="field-row">
        <label for="y-{segment.id}"><span>y</span></label>
        <input id="y-{segment.id}" type="number" step="0.5" value={segment.target.y}
          oninput={(e) => set((s) => (s.target.y = +e.currentTarget.value))} />
      </div>
    {/if}

    {#if segment.kind === 'moveToPose'}
      <div class="field-row">
        <label for="th-{segment.id}"><span>θ</span><small>arrival heading, 0° = up, CW+</small></label>
        <input id="th-{segment.id}" type="number" step="1" value={segment.target.theta}
          oninput={(e) => set((s) => (s.target.theta = +e.currentTarget.value))} />
      </div>
    {/if}

    {#if segment.kind === 'turnToHeading' || segment.kind === 'swingToHeading'}
      <div class="field-row">
        <label for="th-{segment.id}"><span>θ</span><small>absolute, 0° = up, CW+</small></label>
        <input id="th-{segment.id}" type="number" step="1" value={segment.theta}
          oninput={(e) => set((s) => (s.theta = +e.currentTarget.value))} />
      </div>
    {/if}

    {#if segment.kind === 'swingToHeading' || segment.kind === 'swingToPoint'}
      <div class="field-row">
        <label for="side-{segment.id}"><span>Locked side</span><small>the side held still</small></label>
        <select id="side-{segment.id}" value={segment.side}
          onchange={(e) => set((s) => (s.side = e.currentTarget.value))}>
          <option value="LEFT">LEFT</option>
          <option value="RIGHT">RIGHT</option>
        </select>
      </div>
    {/if}

    {#if segment.kind === 'follow'}
      <div class="field-row">
        <label for="pn-{segment.id}"><span>Path name</span><small>becomes {segment.name}.txt in static/</small></label>
        <input id="pn-{segment.id}" type="text" value={segment.name}
          oninput={(e) => set((s) => (s.name = e.currentTarget.value))} />
      </div>
      <div class="field-row">
        <label for="la-{segment.id}"><span>Lookahead</span><small>inches</small></label>
        <input id="la-{segment.id}" type="number" step="0.5" value={segment.lookahead}
          oninput={(e) => set((s) => (s.lookahead = +e.currentTarget.value))} />
      </div>
      <div class="field-row">
        <label for="fw-{segment.id}"><span>Forwards</span></label>
        <span class="switch">
          <input id="fw-{segment.id}" type="checkbox" checked={segment.forwards}
            onchange={(e) => set((s) => (s.forwards = e.currentTarget.checked))} />
          <span></span>
        </span>
      </div>
    {/if}

    <div class="field-row">
      <label for="to-{segment.id}"><span>Timeout</span><small>ms, hard limit</small></label>
      <input id="to-{segment.id}" type="number" step="100" value={segment.timeout}
        oninput={(e) => set((s) => (s.timeout = +e.currentTarget.value))} />
    </div>

    {#if params}
      <details class="subgroup">
        <summary class="section-heading" style="cursor:pointer">Params</summary>

        {#if 'forwards' in params}
          <div class="field-row">
            <label for="p-fw-{segment.id}"><span>forwards</span></label>
            <span class="switch">
              <input id="p-fw-{segment.id}" type="checkbox" checked={params.forwards}
                onchange={(e) => set((s) => (s.params.forwards = e.currentTarget.checked))} />
              <span></span>
            </span>
          </div>
        {/if}

        {#if 'direction' in params}
          <div class="field-row">
            <label for="p-dir-{segment.id}"><span>direction</span><small>AUTO takes the short way</small></label>
            <select id="p-dir-{segment.id}" value={params.direction}
              onchange={(e) => set((s) => (s.params.direction = e.currentTarget.value))}>
              <option value="AUTO">AUTO</option>
              <option value="CW_CLOCKWISE">CW</option>
              <option value="CCW_COUNTERCLOCKWISE">CCW</option>
            </select>
          </div>
        {/if}

        {#if 'lead' in params}
          <div class="field-row">
            <label for="p-lead-{segment.id}"><span>lead</span><small>carrot multiplier, 0–1. Higher = curvier</small></label>
            <input id="p-lead-{segment.id}" type="number" step="0.05" min="0" max="1" value={params.lead}
              oninput={(e) => set((s) => (s.params.lead = +e.currentTarget.value))} />
          </div>
          <div class="field-row">
            <label for="p-hd-{segment.id}"><span>horizontalDrift</span><small>0 = use the drivetrain value</small></label>
            <input id="p-hd-{segment.id}" type="number" step="0.5" value={params.horizontalDrift}
              oninput={(e) => set((s) => (s.params.horizontalDrift = +e.currentTarget.value))} />
          </div>
        {/if}

        <div class="field-row">
          <label for="p-max-{segment.id}"><span>maxSpeed</span></label>
          <input id="p-max-{segment.id}" type="number" step="1" min="0" max="127" value={params.maxSpeed}
            oninput={(e) => set((s) => (s.params.maxSpeed = +e.currentTarget.value))} />
        </div>
      </details>

      <div class="subgroup">
        <div class="section-heading">
          Chain into next
          <span class="switch">
            <input type="checkbox" checked={chained} onchange={(e) => toggleChain(e.currentTarget.checked)} />
            <span></span>
          </span>
        </div>
        {#if 'chain' in segment && segment.chain.mode === 'chained'}
          <div class="field-row">
            <label for="c-ms-{segment.id}"><span>minSpeed</span><small>exits at speed instead of stopping</small></label>
            <input id="c-ms-{segment.id}" type="number" step="5" value={segment.chain.minSpeed}
              oninput={(e) => set((s) => (s.chain.minSpeed = +e.currentTarget.value))} />
          </div>
          <div class="field-row">
            <label for="c-ee-{segment.id}"><span>earlyExitRange</span><small>inches (degrees for turns)</small></label>
            <input id="c-ee-{segment.id}" type="number" step="0.5" value={segment.chain.earlyExitRange}
              oninput={(e) => set((s) => (s.chain.earlyExitRange = +e.currentTarget.value))} />
          </div>
        {:else}
          <p class="hintline">Emits <code>waitUntilDone()</code>. Correct, and slower.</p>
        {/if}
      </div>
    {/if}

    {#if isMotion && 'markers' in segment}
      <div class="subgroup">
        <div class="section-heading">
          Markers
          <button class="text-button" onclick={addMarker}>+ ADD</button>
        </div>
        {#if segment.markers.length === 0}
          <p class="hintline">Fires code partway through, via <code>waitUntil(d)</code>.</p>
        {/if}
        {#each segment.markers as m (m.id)}
          <div class="marker-row">
            <input type="number" step="1" value={m.atInches} title="inches into the motion"
              oninput={(e) => set((s) => {
                const t = s.markers.find((x: any) => x.id === m.id);
                if (t) t.atInches = +e.currentTarget.value;
              })} />
            <input type="text" value={m.code}
              oninput={(e) => set((s) => {
                const t = s.markers.find((x: any) => x.id === m.id);
                if (t) t.code = e.currentTarget.value;
              })} />
            <button class="icon-button danger" onclick={() => removeMarker(m.id)} title="Remove">×</button>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .hintline { margin: 2px 2px 4px; color: #99958e; font-size: 9px; line-height: 1.5; }
  .hintline code { font-family: var(--mono); color: #7c7870; }
  details.subgroup > summary { list-style: none; }
  details.subgroup > summary::-webkit-details-marker { display: none; }
  details.subgroup > summary::before { content: '›'; margin-right: 6px; display: inline-block; transition: .15s; }
  details.subgroup[open] > summary::before { transform: rotate(90deg); }
</style>
