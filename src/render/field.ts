/**
 * Canvas rendering. PLAN.md §5.2, §7.2.
 *
 * The field is drawn procedurally rather than blitted from a render of the official
 * CAD — see ISA-112. Procedural has one real advantage worth keeping even after the
 * raster lands: it stays crisp at any zoom, and the tile grid lines up exactly with the
 * coordinate system instead of approximately.
 *
 * Colour semantics: green for lateral motions, orange for angular, red for a segment
 * that collides or times out. Alliance colour tints the field only, never the path, so
 * a red and a blue routine stay legible in one screenshot.
 */

import { FIELD_HALF_IN, TILE_IN } from '../config/field';
import { OVERRIDE_ELEMENTS, type FieldShape } from '../config/overrideField';
import { SEGMENT_FAMILY } from '../config/defaults';
import {
  bezierAt,
  fieldToCanvas,
  headingVector,
  pxPerInch,
  type View,
} from '../model/geometry';
import { robotCorners } from '../sim/collision';
import { hasTarget, type Pose, type Routine, type SimTrace, type Vec2 } from '../model/types';

const COL = {
  tile: '#e9e2d4',
  tileAlt: '#e3dbcb',
  tileLine: '#d5cbb7',
  wall: '#4a4740',
  ink: '#292d29',
  green: '#3f6b5b',
  orange: '#bd6b3d',
  red: '#b85349',
  muted: '#a49f95',
  paper: '#fffdfa',
};

export type RenderOptions = {
  view: View;
  routine: Routine;
  trace: SimTrace;
  playhead: number;
  selectedId: string | null;
  showOnion: boolean;
  onionSpacing: number;
  showElements: boolean;
  hoverHandle: string | null;
};

export function draw(ctx: CanvasRenderingContext2D, o: RenderOptions): void {
  const { view } = o;
  ctx.save();
  ctx.clearRect(0, 0, view.size, view.size);

  drawField(ctx, o);
  if (o.showElements) drawElements(ctx, view, OVERRIDE_ELEMENTS);
  if (o.showOnion) drawOnion(ctx, o);
  drawPaths(ctx, o);
  drawHandles(ctx, o);
  drawRobot(ctx, o);

  ctx.restore();
}

// --- field ---------------------------------------------------------------------------

function drawField(ctx: CanvasRenderingContext2D, o: RenderOptions): void {
  const { view } = o;
  const tl = fieldToCanvas({ x: -FIELD_HALF_IN, y: FIELD_HALF_IN }, view);
  const span = FIELD_HALF_IN * 2 * pxPerInch(view);

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(0, 0, view.size, view.size, 12);
  ctx.clip();

  ctx.fillStyle = COL.tile;
  ctx.fillRect(0, 0, view.size, view.size);

  // Foam tiles, in a subtle checker so the 24 in grid is readable without a hard grid.
  const tiles = Math.round((FIELD_HALF_IN * 2) / TILE_IN);
  const tilePx = span / tiles;
  for (let r = 0; r < tiles; r++) {
    for (let c = 0; c < tiles; c++) {
      if ((r + c) % 2 === 0) continue;
      ctx.fillStyle = COL.tileAlt;
      ctx.fillRect(tl.x + c * tilePx, tl.y + r * tilePx, tilePx, tilePx);
    }
  }

  // Alliance tint, on the field only.
  const tint = o.routine.alliance === 'red' ? 'rgba(184,83,73,0.05)' : 'rgba(91,127,168,0.06)';
  ctx.fillStyle = tint;
  ctx.fillRect(tl.x, tl.y, span, span);

  ctx.strokeStyle = COL.tileLine;
  ctx.lineWidth = 1;
  for (let i = 0; i <= tiles; i++) {
    const p = tl.x + i * tilePx;
    const q = tl.y + i * tilePx;
    ctx.beginPath();
    ctx.moveTo(p, tl.y);
    ctx.lineTo(p, tl.y + span);
    ctx.moveTo(tl.x, q);
    ctx.lineTo(tl.x + span, q);
    ctx.stroke();
  }

  // Origin crosshair — the field centre is (0, 0) in the LemLib frame.
  const c = fieldToCanvas({ x: 0, y: 0 }, view);
  ctx.strokeStyle = 'rgba(41,45,41,0.22)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(c.x - 9, c.y);
  ctx.lineTo(c.x + 9, c.y);
  ctx.moveTo(c.x, c.y - 9);
  ctx.lineTo(c.x, c.y + 9);
  ctx.stroke();

  ctx.strokeStyle = COL.wall;
  ctx.lineWidth = 3;
  ctx.strokeRect(tl.x, tl.y, span, span);
  ctx.restore();
}

function drawElements(ctx: CanvasRenderingContext2D, view: View, shapes: FieldShape[]): void {
  const s = pxPerInch(view);
  for (const el of shapes) {
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = el.fill;
    ctx.strokeStyle = 'rgba(41,45,41,0.25)';
    ctx.lineWidth = 1;
    if (el.kind === 'circle') {
      const p = fieldToCanvas(el.at, view);
      ctx.beginPath();
      ctx.arc(p.x, p.y, el.radius * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      const corners = robotCorners({ x: el.at.x, y: el.at.y, theta: el.theta }, el.width, el.length)
        .map((c) => fieldToCanvas(c, view));
      ctx.beginPath();
      corners.forEach((c, i) => (i === 0 ? ctx.moveTo(c.x, c.y) : ctx.lineTo(c.x, c.y)));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
}

// --- paths ---------------------------------------------------------------------------

function drawPaths(ctx: CanvasRenderingContext2D, o: RenderOptions): void {
  const { trace, view } = o;
  if (trace.points.length < 2) return;

  // One stroke per segment so each carries its own colour, and a collision or timeout
  // is visible on the field rather than only in the list.
  let i = 1;
  while (i < trace.points.length) {
    const segIdx = trace.points[i]!.segmentIndex;
    const start = i - 1;
    while (i < trace.points.length && trace.points[i]!.segmentIndex === segIdx) i++;

    const seg = o.routine.segments[segIdx];
    const result = trace.segments.find((r) => r.index === segIdx);
    const bad = result && (result.exit === 'timeout' || result.collided);
    const family = seg ? SEGMENT_FAMILY[seg.kind] : 'other';
    const colour = bad ? COL.red : family === 'angular' ? COL.orange : family === 'lateral' ? COL.green : COL.muted;
    const selected = seg && seg.id === o.selectedId;

    ctx.save();
    ctx.strokeStyle = colour;
    ctx.lineWidth = selected ? 4 : 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (!selected) ctx.globalAlpha = 0.82;
    ctx.beginPath();
    for (let k = start; k < i; k++) {
      const p = fieldToCanvas(trace.points[k]!, view);
      if (k === start) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  // Bezier guides for pure-pursuit segments.
  for (const seg of o.routine.segments) {
    if (seg.kind !== 'follow') continue;
    ctx.save();
    ctx.strokeStyle = 'rgba(63,107,91,0.5)';
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let t = 0; t <= 1.0001; t += 0.02) {
      const p = fieldToCanvas(bezierAt(seg.controlPoints, Math.min(t, 1)), view);
      if (t === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.restore();
  }
}

function drawOnion(ctx: CanvasRenderingContext2D, o: RenderOptions): void {
  const { trace, routine, view } = o;
  const { robotWidth, robotLength } = routine.settings.drivetrain;
  let last: Vec2 | null = null;

  ctx.save();
  ctx.strokeStyle = 'rgba(41,45,41,0.14)';
  ctx.lineWidth = 1;
  for (const p of trace.points) {
    if (last && Math.hypot(p.x - last.x, p.y - last.y) < o.onionSpacing) continue;
    last = { x: p.x, y: p.y };
    const corners = robotCorners(p, robotWidth, robotLength).map((c) => fieldToCanvas(c, view));
    ctx.beginPath();
    corners.forEach((c, i) => (i === 0 ? ctx.moveTo(c.x, c.y) : ctx.lineTo(c.x, c.y)));
    ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();
}

// --- handles -------------------------------------------------------------------------

export type Handle = {
  id: string;
  kind: 'start' | 'target' | 'heading' | 'control' | 'startHeading';
  segmentId: string | null;
  at: Vec2;
  /** Index into controlPoints, for follow segments. */
  index?: number;
};

/** Every draggable handle in field coordinates. Shared by the renderer and hit-testing. */
export function handlesFor(routine: Routine, selectedId: string | null): Handle[] {
  const out: Handle[] = [];
  out.push({ id: 'start', kind: 'start', segmentId: null, at: routine.start });
  const sv = headingVector(routine.start.theta);
  out.push({
    id: 'start-h',
    kind: 'startHeading',
    segmentId: null,
    at: { x: routine.start.x + sv.x * 12, y: routine.start.y + sv.y * 12 },
  });

  for (const seg of routine.segments) {
    if (hasTarget(seg)) {
      out.push({ id: `t-${seg.id}`, kind: 'target', segmentId: seg.id, at: seg.target });
      if (seg.kind === 'moveToPose' && seg.id === selectedId) {
        const v = headingVector(seg.target.theta);
        out.push({
          id: `h-${seg.id}`,
          kind: 'heading',
          segmentId: seg.id,
          at: { x: seg.target.x + v.x * 12, y: seg.target.y + v.y * 12 },
        });
      }
    } else if (seg.kind === 'follow' && seg.id === selectedId) {
      seg.controlPoints.forEach((cp, i) => {
        out.push({ id: `c-${seg.id}-${i}`, kind: 'control', segmentId: seg.id, at: cp, index: i });
      });
    }
  }
  return out;
}

function drawHandles(ctx: CanvasRenderingContext2D, o: RenderOptions): void {
  const handles = handlesFor(o.routine, o.selectedId);

  for (const h of handles) {
    const p = fieldToCanvas(h.at, o.view);
    const seg = h.segmentId ? o.routine.segments.find((s) => s.id === h.segmentId) : null;
    const selected = h.segmentId === o.selectedId || (h.segmentId === null && o.selectedId === null);
    const hovered = o.hoverHandle === h.id;

    if (h.kind === 'heading' || h.kind === 'startHeading') {
      const anchor =
        h.kind === 'startHeading'
          ? o.routine.start
          : (seg && 'target' in seg ? seg.target : o.routine.start);
      const a = fieldToCanvas(anchor, o.view);
      ctx.save();
      ctx.strokeStyle = COL.orange;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.fillStyle = COL.orange;
      ctx.beginPath();
      ctx.arc(p.x, p.y, hovered ? 6 : 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      continue;
    }

    const family = seg ? SEGMENT_FAMILY[seg.kind] : 'lateral';
    const colour = h.kind === 'start' ? COL.ink : family === 'angular' ? COL.orange : COL.green;
    const r = h.kind === 'control' ? 4 : selected ? 7 : 5.5;

    ctx.save();
    ctx.beginPath();
    ctx.arc(p.x, p.y, hovered ? r + 2 : r, 0, Math.PI * 2);
    ctx.fillStyle = COL.paper;
    ctx.fill();
    ctx.lineWidth = h.kind === 'control' ? 1.5 : 2.5;
    ctx.strokeStyle = colour;
    ctx.stroke();
    if (selected && h.kind === 'target') {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = colour;
      ctx.fill();
    }
    ctx.restore();
  }
}

// --- robot ---------------------------------------------------------------------------

function drawRobot(ctx: CanvasRenderingContext2D, o: RenderOptions): void {
  const { trace, routine, view } = o;
  const { robotWidth, robotLength } = routine.settings.drivetrain;

  let pose: Pose = routine.start;
  let collided = false;
  if (trace.points.length) {
    const idx = indexAtTime(trace, o.playhead);
    const p = trace.points[idx]!;
    pose = { x: p.x, y: p.y, theta: p.theta };
    const res = trace.segments.find((r) => r.index === p.segmentIndex);
    collided = !!res?.collided;
  }

  const corners = robotCorners(pose, robotWidth, robotLength).map((c) => fieldToCanvas(c, view));
  ctx.save();
  ctx.beginPath();
  corners.forEach((c, i) => (i === 0 ? ctx.moveTo(c.x, c.y) : ctx.lineTo(c.x, c.y)));
  ctx.closePath();
  ctx.fillStyle = collided ? 'rgba(184,83,73,0.25)' : 'rgba(41,45,41,0.12)';
  ctx.fill();
  ctx.strokeStyle = collided ? COL.red : COL.ink;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Nose marker, so the robot's facing is unambiguous at a glance.
  const v = headingVector(pose.theta);
  const centre = fieldToCanvas(pose, view);
  const nose = fieldToCanvas({ x: pose.x + v.x * (robotLength / 2), y: pose.y + v.y * (robotLength / 2) }, view);
  ctx.beginPath();
  ctx.moveTo(centre.x, centre.y);
  ctx.lineTo(nose.x, nose.y);
  ctx.strokeStyle = collided ? COL.red : COL.ink;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.restore();
}

export function indexAtTime(trace: SimTrace, t: number): number {
  if (!trace.points.length) return 0;
  let lo = 0;
  let hi = trace.points.length - 1;
  if (t <= trace.points[0]!.t) return 0;
  if (t >= trace.points[hi]!.t) return hi;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (trace.points[mid]!.t <= t) lo = mid;
    else hi = mid;
  }
  return lo;
}
