<script lang="ts">
  /**
   * The field view. PLAN.md §2.2 — the canvas and the segment list are the same
   * document viewed twice, so dragging here mutates the routine directly and the list
   * re-renders itself. There is no apply step.
   */
  import { store } from '../stores/routine.svelte';
  import { FIELD_HALF_IN } from '../config/field';
  import {
    canvasToField,
    clamp,
    defaultView,
    fieldToCanvas,
    headingTo,
    pxPerInch,
    type View,
  } from '../model/geometry';
  import { draw, handlesFor, type Handle } from '../render/field';
  import { hasTarget } from '../model/types';

  let canvas: HTMLCanvasElement;
  let wrap: HTMLDivElement;
  let view = $state<View>(defaultView(640));
  let dragging = $state<Handle | null>(null);
  let hover = $state<string | null>(null);
  let panning = $state(false);
  let panStart = { x: 0, y: 0, panX: 0, panY: 0 };
  let cursor = $state({ x: 0, y: 0 });
  let snap = $state(false);

  const HIT_PX = 11;

  function render() {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const cssSize = wrap?.clientWidth || 640;
    if (view.size !== cssSize) view = { ...view, size: cssSize };
    canvas.width = Math.round(cssSize * dpr);
    canvas.height = Math.round(cssSize * dpr);
    canvas.style.width = `${cssSize}px`;
    canvas.style.height = `${cssSize}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(ctx, {
      view,
      routine: store.routine,
      trace: store.trace,
      playhead: store.playhead,
      selectedId: store.selectedId,
      showOnion: store.showOnion,
      onionSpacing: store.onionSpacing,
      showElements: store.showElements,
      hoverHandle: hover,
    });
  }

  // Redraw whenever anything the picture depends on changes.
  $effect(() => {
    void store.routine;
    void store.trace;
    void store.playhead;
    void store.selectedId;
    void store.showOnion;
    void store.onionSpacing;
    void store.showElements;
    void view;
    void hover;
    render();
  });

  $effect(() => {
    const ro = new ResizeObserver(() => render());
    if (wrap) ro.observe(wrap);
    return () => ro.disconnect();
  });

  function localPoint(e: PointerEvent | WheelEvent) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function hitTest(px: { x: number; y: number }): Handle | null {
    const handles = handlesFor(store.routine, store.selectedId);
    // Reverse so the most recently drawn (topmost) handle wins.
    for (let i = handles.length - 1; i >= 0; i--) {
      const h = handles[i]!;
      const p = fieldToCanvas(h.at, view);
      if (Math.hypot(p.x - px.x, p.y - px.y) <= HIT_PX) return h;
    }
    return null;
  }

  /**
   * Snap to the half-inch with shift held, otherwise to a hundredth. Storing raw
   * float pixels would put 29.99999793 in the inspector box, which reads as noise even
   * though the emitter rounds it away.
   */
  function applySnap(v: number): number {
    return snap ? Math.round(v * 2) / 2 : Math.round(v * 100) / 100;
  }

  function onPointerDown(e: PointerEvent) {
    canvas.setPointerCapture(e.pointerId);
    const px = localPoint(e);
    const hit = hitTest(px);
    if (hit) {
      dragging = hit;
      if (hit.segmentId) store.selectedId = hit.segmentId;
      else if (hit.kind === 'start' || hit.kind === 'startHeading') store.selectedId = null;
      return;
    }
    panning = true;
    panStart = { x: e.clientX, y: e.clientY, panX: view.pan.x, panY: view.pan.y };
  }

  function onPointerMove(e: PointerEvent) {
    const px = localPoint(e);
    cursor = canvasToField(px, view);

    if (panning) {
      const s = pxPerInch(view);
      view = {
        ...view,
        pan: {
          x: panStart.panX - (e.clientX - panStart.x) / s,
          y: panStart.panY + (e.clientY - panStart.y) / s,
        },
      };
      return;
    }

    if (!dragging) {
      const hit = hitTest(px);
      hover = hit?.id ?? null;
      return;
    }

    const f = canvasToField(px, view);
    const x = clamp(applySnap(f.x), -FIELD_HALF_IN, FIELD_HALF_IN);
    const y = clamp(applySnap(f.y), -FIELD_HALF_IN, FIELD_HALF_IN);
    const h = dragging;

    store.edit((r) => {
      if (h.kind === 'start') {
        r.start.x = x;
        r.start.y = y;
        return;
      }
      if (h.kind === 'startHeading') {
        r.start.theta = Math.round(headingTo(r.start, { x: f.x, y: f.y }));
        return;
      }
      const seg = r.segments.find((s) => s.id === h.segmentId);
      if (!seg) return;
      if (h.kind === 'target' && hasTarget(seg)) {
        seg.target.x = x;
        seg.target.y = y;
      } else if (h.kind === 'heading' && seg.kind === 'moveToPose') {
        seg.target.theta = Math.round(headingTo(seg.target, { x: f.x, y: f.y }));
      } else if (h.kind === 'control' && seg.kind === 'follow' && h.index !== undefined) {
        seg.controlPoints[h.index] = { x, y };
      }
    }, `drag:${h.id}`);
  }

  function onPointerUp(e: PointerEvent) {
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    dragging = null;
    panning = false;
    store.endCoalesce();
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const px = localPoint(e);
    const before = canvasToField(px, view);
    const zoom = clamp(view.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12), 0.6, 6);
    const next = { ...view, zoom };
    const after = canvasToField(px, next);
    // Keep the point under the cursor fixed while zooming.
    view = { ...next, pan: { x: next.pan.x + (before.x - after.x), y: next.pan.y + (before.y - after.y) } };
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Shift') snap = true;
  }
  function onKeyUp(e: KeyboardEvent) {
    if (e.key === 'Shift') snap = false;
  }

  function resetView() {
    view = { ...view, zoom: 1, pan: { x: 0, y: 0 } };
  }
</script>

<svelte:window onkeydown={onKey} onkeyup={onKeyUp} />

<div class="field-panel">
  <div class="field-wrap" bind:this={wrap}>
    <canvas
      bind:this={canvas}
      class:grabbing={panning}
      onpointerdown={onPointerDown}
      onpointermove={onPointerMove}
      onpointerup={onPointerUp}
      onpointercancel={onPointerUp}
      onwheel={onWheel}
    ></canvas>
  </div>

  <div class="field-bar">
    <span>x <strong>{cursor.x.toFixed(1)}</strong></span>
    <span>y <strong>{cursor.y.toFixed(1)}</strong></span>
    <span style="flex:1"></span>
    <span class="hint">{snap ? 'snap 0.5"' : 'shift = snap'}</span>
    <button class="icon-button" onclick={resetView} title="Reset view">⌂</button>
  </div>
</div>

<style>
  .hint { color: #a8a49b; }
</style>
