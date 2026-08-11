/**
 * Coordinate conventions and canvas transforms. PLAN.md §3.1.
 *
 * LemLib's frame, which this app uses natively so that no translation layer exists
 * between what you see and what gets emitted:
 *
 *   origin  field centre
 *   units   inches
 *   +X      toward the right wall
 *   +Y      up-field
 *   0 deg   +Y (up)
 *   sign    CLOCKWISE-positive
 *
 * Note this differs from vex-scope, which uses the maths convention (0 deg = +x,
 * CCW-positive). If the two ever share a renderer the conversion is
 * `lemlibFromStandardDeg` below — and it lives here, in one place, deliberately.
 */

import { FIELD_HALF_IN } from '../config/field';
import type { Vec2 } from './types';

export const DEG = Math.PI / 180;

/** Wrap to [0, 360). */
export function sanitizeAngle(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Wrap to (-180, 180]. */
export function angleError(target: number, current: number): number {
  let e = (target - current) % 360;
  if (e > 180) e -= 360;
  if (e <= -180) e += 360;
  return e;
}

/**
 * LemLib heading -> standard maths angle (0 = +x, CCW-positive), radians.
 * This is the single conversion point; nothing else should do the 90-minus dance.
 */
export function toStandardRad(lemlibDeg: number): number {
  return (90 - lemlibDeg) * DEG;
}

/** Standard maths degrees -> LemLib heading degrees. */
export function lemlibFromStandardDeg(standardDeg: number): number {
  return sanitizeAngle(90 - standardDeg);
}

/** Unit vector pointing along a LemLib heading. */
export function headingVector(lemlibDeg: number): Vec2 {
  const r = toStandardRad(lemlibDeg);
  return { x: Math.cos(r), y: Math.sin(r) };
}

/** Heading (LemLib degrees) of the vector from `from` to `to`. */
export function headingTo(from: Vec2, to: Vec2): number {
  return lemlibFromStandardDeg(Math.atan2(to.y - from.y, to.x - from.x) / DEG);
}

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// --- canvas mapping ----------------------------------------------------------------

/**
 * Maps field inches to canvas pixels. The canvas is square and the field fills it,
 * so this is a scale plus a Y flip (canvas Y grows downward, field Y grows up-field).
 */
export type View = {
  /** Canvas edge length in CSS pixels. */
  size: number;
  /** Zoom factor, 1 = whole field visible. */
  zoom: number;
  /** Pan offset in field inches. */
  pan: Vec2;
};

export function defaultView(size = 600): View {
  return { size, zoom: 1, pan: { x: 0, y: 0 } };
}

export function pxPerInch(view: View): number {
  return (view.size / (FIELD_HALF_IN * 2)) * view.zoom;
}

export function fieldToCanvas(p: Vec2, view: View): Vec2 {
  const s = pxPerInch(view);
  return {
    x: view.size / 2 + (p.x - view.pan.x) * s,
    y: view.size / 2 - (p.y - view.pan.y) * s,
  };
}

export function canvasToField(p: Vec2, view: View): Vec2 {
  const s = pxPerInch(view);
  return {
    x: (p.x - view.size / 2) / s + view.pan.x,
    y: -(p.y - view.size / 2) / s + view.pan.y,
  };
}

// --- Bezier (pure-pursuit paths) ---------------------------------------------------

/** Cubic Bezier point at t. */
export function bezierAt(cp: Vec2[], t: number): Vec2 {
  const [p0, p1, p2, p3] = cp;
  if (!p0 || !p1 || !p2 || !p3) return { x: 0, y: 0 };
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

/** First derivative of a cubic Bezier at t. */
export function bezierTangent(cp: Vec2[], t: number): Vec2 {
  const [p0, p1, p2, p3] = cp;
  if (!p0 || !p1 || !p2 || !p3) return { x: 0, y: 1 };
  const u = 1 - t;
  return {
    x: 3 * u * u * (p1.x - p0.x) + 6 * u * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x),
    y: 3 * u * u * (p1.y - p0.y) + 6 * u * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y),
  };
}

/** Unsigned curvature of a cubic Bezier at t. */
export function bezierCurvature(cp: Vec2[], t: number): number {
  const [p0, p1, p2, p3] = cp;
  if (!p0 || !p1 || !p2 || !p3) return 0;
  const d = bezierTangent(cp, t);
  const u = 1 - t;
  const dd = {
    x: 6 * u * (p2.x - 2 * p1.x + p0.x) + 6 * t * (p3.x - 2 * p2.x + p1.x),
    y: 6 * u * (p2.y - 2 * p1.y + p0.y) + 6 * t * (p3.y - 2 * p2.y + p1.y),
  };
  const num = Math.abs(d.x * dd.y - d.y * dd.x);
  const den = Math.pow(d.x * d.x + d.y * d.y, 1.5);
  return den < 1e-9 ? 0 : num / den;
}

/** Resample a cubic Bezier at roughly-even arc-length spacing, in inches. */
export function sampleBezier(cp: Vec2[], spacingIn: number): { p: Vec2; t: number }[] {
  const fine: { p: Vec2; t: number }[] = [];
  const N = 400;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    fine.push({ p: bezierAt(cp, t), t });
  }
  const out: { p: Vec2; t: number }[] = [fine[0]!];
  let acc = 0;
  for (let i = 1; i < fine.length; i++) {
    acc += dist(fine[i - 1]!.p, fine[i]!.p);
    if (acc >= spacingIn) {
      out.push(fine[i]!);
      acc = 0;
    }
  }
  const last = fine[fine.length - 1]!;
  if (dist(out[out.length - 1]!.p, last.p) > 1e-6) out.push(last);
  return out;
}
