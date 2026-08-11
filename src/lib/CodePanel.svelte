<script lang="ts">
  /**
   * Continuously-regenerated C++. PLAN.md §2.2 — code is generated as you drag, not on
   * demand, so you learn the API by watching it change.
   */
  import { store } from '../stores/routine.svelte';
  import { indexAtTime } from '../render/field';

  const KEYWORDS = /\b(void|true|false|AngularDirection|DriveSide|ASSET|pros)\b/g;

  function highlight(line: string): string {
    const esc = line
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    if (esc.trimStart().startsWith('//')) return `<span class="cmt">${esc}</span>`;
    return esc
      .replace(/\b(chassis\.\w+)/g, '<span class="fn">$1</span>')
      .replace(KEYWORDS, '<span class="kw">$1</span>')
      .replace(/(-?\b\d+(?:\.\d+)?\b)/g, '<span class="num">$1</span>');
  }

  const lines = $derived(store.generated.code.split('\n'));

  const current = $derived.by(() => {
    const t = store.trace;
    if (!t.points.length) return null;
    const p = t.points[indexAtTime(t, store.playhead)]!;
    return p;
  });
</script>

<section class="codepanel">
  <div class="section-heading">
    Generated · LemLib v0.5.6
    <span>{lines.length} lines</span>
  </div>

  <pre class="code">{#each lines as line}<span>{@html highlight(line)}</span>
{/each}</pre>

  <div class="pose-readout">
    <div>x<strong>{current ? current.x.toFixed(1) : store.routine.start.x.toFixed(1)}</strong></div>
    <div>y<strong>{current ? current.y.toFixed(1) : store.routine.start.y.toFixed(1)}</strong></div>
    <div>θ<strong>{current ? current.theta.toFixed(1) : store.routine.start.theta.toFixed(1)}°</strong></div>
    <div>v<strong>{current ? current.v.toFixed(0) : '0'} ips</strong></div>
  </div>

  <p class="caveat">
    Predicted with perfect odometry. Verify on the field before you trust the timings.
  </p>
</section>
