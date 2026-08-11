<script lang="ts">
  /** The routine as an ordered accordion. PLAN.md §7.1. */
  import { store } from '../stores/routine.svelte';
  import { SEGMENT_FAMILY, SEGMENT_LABELS } from '../config/defaults';
  import type { Segment, SegmentKind } from '../model/types';
  import SegmentInspector from './SegmentInspector.svelte';

  const ADDABLE: SegmentKind[] = [
    'moveToPoint',
    'moveToPose',
    'turnToHeading',
    'turnToPoint',
    'swingToHeading',
    'swingToPoint',
    'follow',
    'wait',
    'action',
  ];

  function subtitle(s: Segment): string {
    switch (s.kind) {
      case 'moveToPoint':
      case 'turnToPoint':
      case 'swingToPoint':
        return `(${s.target.x.toFixed(1)}, ${s.target.y.toFixed(1)})`;
      case 'moveToPose':
        return `(${s.target.x.toFixed(1)}, ${s.target.y.toFixed(1)}) @ ${s.target.theta.toFixed(0)}°`;
      case 'turnToHeading':
      case 'swingToHeading':
        return `${s.theta.toFixed(0)}°`;
      case 'follow':
        return `${s.name}.txt · lookahead ${s.lookahead}`;
      case 'wait':
        return `${s.ms} ms`;
      case 'action':
        return s.code.split('\n')[0] ?? '';
    }
  }

  function timing(index: number): string {
    const r = store.trace.segments.find((x) => x.index === index);
    if (!r) return '';
    return `${(r.endT - r.startT).toFixed(2)}s`;
  }

  function collided(index: number): boolean {
    return !!store.trace.segments.find((x) => x.index === index)?.collided;
  }

  function timedOut(index: number): boolean {
    return store.trace.segments.find((x) => x.index === index)?.exit === 'timeout';
  }

  function toggle(id: string) {
    store.selectedId = store.selectedId === id ? null : id;
  }
</script>

<aside class="sidebar">
  <div class="section-heading">Start pose</div>
  <div class="start-pose">
    <div class="seg-body" style="border-top:0">
      <div class="field-row">
        <label for="start-x"><span>x</span></label>
        <input id="start-x" type="number" step="0.5" value={store.routine.start.x}
          oninput={(e) => store.edit((r) => (r.start.x = +e.currentTarget.value))} />
      </div>
      <div class="field-row">
        <label for="start-y"><span>y</span></label>
        <input id="start-y" type="number" step="0.5" value={store.routine.start.y}
          oninput={(e) => store.edit((r) => (r.start.y = +e.currentTarget.value))} />
      </div>
      <div class="field-row">
        <label for="start-t"><span>θ</span><small>0° = up, clockwise-positive</small></label>
        <input id="start-t" type="number" step="1" value={store.routine.start.theta}
          oninput={(e) => store.edit((r) => (r.start.theta = +e.currentTarget.value))} />
      </div>
    </div>
  </div>

  <div class="section-heading">
    Segments
    <span>{store.routine.segments.length}</span>
  </div>

  {#if store.routine.segments.length === 0}
    <p class="empty-state">No segments yet. Add one below, then drag its handle on the field.</p>
  {/if}

  {#each store.routine.segments as seg, i (seg.id)}
    <div class="segment" class:selected={store.selectedId === seg.id} class:collided={collided(i)}>
      <div
        class="segment-head"
        role="button"
        tabindex="0"
        onclick={() => toggle(seg.id)}
        onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggle(seg.id))}
      >
        <span class="seg-index {SEGMENT_FAMILY[seg.kind]}">{i + 1}</span>
        <span class="seg-title">
          <strong>{SEGMENT_LABELS[seg.kind]}</strong>
          <small>{subtitle(seg)} · {timing(i)}{timedOut(i) ? ' TIMEOUT' : ''}{collided(i) ? ' HIT' : ''}</small>
        </span>
        <span class="seg-actions">
          <button class="icon-button" title="Move up" onclick={(e) => (e.stopPropagation(), store.moveSegment(seg.id, -1))}>↑</button>
          <button class="icon-button" title="Move down" onclick={(e) => (e.stopPropagation(), store.moveSegment(seg.id, 1))}>↓</button>
          <button class="icon-button" title="Duplicate" onclick={(e) => (e.stopPropagation(), store.duplicateSegment(seg.id))}>⧉</button>
          <button class="icon-button danger" title="Delete" onclick={(e) => (e.stopPropagation(), store.removeSegment(seg.id))}>×</button>
        </span>
      </div>
      {#if store.selectedId === seg.id}
        <SegmentInspector segment={seg} />
      {/if}
    </div>
  {/each}

  <div class="section-heading">Add segment</div>
  <div class="add-menu">
    {#each ADDABLE as kind}
      <button onclick={() => store.addSegment(kind)}>{SEGMENT_LABELS[kind]}</button>
    {/each}
  </div>
</aside>
