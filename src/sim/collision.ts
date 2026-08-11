/**
 * Collision checking. PLAN.md §5.4.
 *
 * Separating-axis test of the robot rectangle against the field elements, run once per
 * simulation tick. Cheap enough at 10 ms ticks: a 15-second auton is ~1500 ticks
 * against ~20 shapes.
 *
 * A hit does NOT stop the simulation. You want to see how badly you clipped, not have
 * the preview stop at the moment of contact.
 */

import { FIELD_HALF_IN } from '../config/field';
import { DEG } from '../model/geometry';
import type { FieldShape } from '../config/overrideField';
import type { Pose, Vec2 } from '../model/types';

/** The four corners of the robot footprint at a given pose, in field inches. */
export function robotCorners(pose: Pose, width: number, length: number): Vec2[] {
  // Heading is LemLib (0 = +Y, CW+); the robot's forward axis in the maths frame:
  const fwd = (90 - pose.theta) * DEG;
  const cos = Math.cos(fwd);
  const sin = Math.sin(fwd);
  const hl = length / 2;
  const hw = width / 2;
  const local: Vec2[] = [
    { x: hl, y: hw },
    { x: hl, y: -hw },
    { x: -hl, y: -hw },
    { x: -hl, y: hw },
  ];
  return local.map((p) => ({
    x: pose.x + p.x * cos - p.y * sin,
    y: pose.y + p.x * sin + p.y * cos,
  }));
}

function project(points: Vec2[], axis: Vec2): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const p of points) {
    const v = p.x * axis.x + p.y * axis.y;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return [min, max];
}

function axesOf(points: Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    const edge = { x: b.x - a.x, y: b.y - a.y };
    const len = Math.hypot(edge.x, edge.y) || 1;
    out.push({ x: -edge.y / len, y: edge.x / len });
  }
  return out;
}

function polysOverlap(a: Vec2[], b: Vec2[]): boolean {
  for (const axis of [...axesOf(a), ...axesOf(b)]) {
    const [aMin, aMax] = project(a, axis);
    const [bMin, bMax] = project(b, axis);
    if (aMax < bMin || bMax < aMin) return false;
  }
  return true;
}

function polyCircleOverlap(poly: Vec2[], centre: Vec2, radius: number): boolean {
  // Closest point on the polygon (treated as convex) to the circle centre.
  let inside = true;
  let minDist = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const cross = ex * (centre.y - a.y) - ey * (centre.x - a.x);
    if (cross < 0) inside = false;
    const lenSq = ex * ex + ey * ey || 1;
    let t = ((centre.x - a.x) * ex + (centre.y - a.y) * ey) / lenSq;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(centre.x - (a.x + ex * t), centre.y - (a.y + ey * t));
    if (d < minDist) minDist = d;
  }
  return inside || minDist <= radius;
}

function shapeCorners(s: Extract<FieldShape, { kind: 'rect' }>): Vec2[] {
  return robotCorners({ x: s.at.x, y: s.at.y, theta: s.theta }, s.width, s.length);
}

/** Does the robot at `pose` intersect any element, or leave the field? */
export function collidesAt(
  pose: Pose,
  width: number,
  length: number,
  shapes: FieldShape[],
): boolean {
  const corners = robotCorners(pose, width, length);

  for (const c of corners) {
    if (Math.abs(c.x) > FIELD_HALF_IN || Math.abs(c.y) > FIELD_HALF_IN) return true;
  }
  for (const s of shapes) {
    if (s.kind === 'circle') {
      if (polyCircleOverlap(corners, s.at, s.radius)) return true;
    } else if (polysOverlap(corners, shapeCorners(s))) {
      return true;
    }
  }
  return false;
}
