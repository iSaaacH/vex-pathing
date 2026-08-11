/**
 * The plant. PLAN.md §4.2.
 *
 * A differential-drive kinematic model at LemLib's own 10 ms loop rate, with a
 * first-order motor lag and a voltage -> velocity map from rpm/wheelDiameter.
 *
 * The honest boundary, stated in the plan and repeated here so nobody mistakes this
 * for a dynamics model: there is no wheel slip, no centre-of-mass transfer, no battery
 * sag. What it reproduces faithfully is the *shape* a LemLib motion traces, because
 * that shape is produced by the controllers, not by the chassis physics.
 */

import { DEG, sanitizeAngle } from '../model/geometry';
import type { DrivetrainSettings, Pose } from '../model/types';

/** LemLib's control loop period. */
export const DT_MS = 10;
export const DT_S = DT_MS / 1000;

/** How quickly commanded voltage becomes actual wheel speed. Seconds to ~63%. */
const MOTOR_LAG_S = 0.09;

export class Drivetrain {
  /** Max linear wheel speed, inches/sec, at full 127 command. */
  readonly maxVel: number;

  private leftVel = 0; // in/s, actual
  private rightVel = 0;

  pose: Pose;

  constructor(
    private readonly cfg: DrivetrainSettings,
    start: Pose,
  ) {
    this.maxVel = (cfg.rpm / 60) * Math.PI * cfg.wheelDiameter;
    this.pose = { ...start };
  }

  reset(start: Pose): void {
    this.pose = { ...start };
    this.leftVel = 0;
    this.rightVel = 0;
  }

  /** Current forward velocity, inches/sec (signed). */
  get velocity(): number {
    return (this.leftVel + this.rightVel) / 2;
  }

  /**
   * Step one 10 ms tick with left/right motor commands in LemLib's -127..127 units.
   */
  step(leftCmd: number, rightCmd: number): void {
    const targetL = (leftCmd / 127) * this.maxVel;
    const targetR = (rightCmd / 127) * this.maxVel;

    const alpha = 1 - Math.exp(-DT_S / MOTOR_LAG_S);
    this.leftVel += (targetL - this.leftVel) * alpha;
    this.rightVel += (targetR - this.rightVel) * alpha;

    const v = (this.leftVel + this.rightVel) / 2;
    const omega = (this.rightVel - this.leftVel) / this.cfg.trackWidth; // rad/s, CCW+

    // Integrate in the standard maths frame, then convert back. Heading is stored in
    // the LemLib frame (0 = +Y, CW-positive), so a CCW angular rate *decreases* it.
    const stdRad = (90 - this.pose.theta) * DEG;
    this.pose.x += v * Math.cos(stdRad) * DT_S;
    this.pose.y += v * Math.sin(stdRad) * DT_S;
    this.pose.theta = sanitizeAngle(this.pose.theta - (omega * DT_S) / DEG);
  }
}

/**
 * Port of LemLib's speed desaturation: if either side exceeds the cap, scale both so
 * the ratio between them — and therefore the arc being driven — is preserved.
 */
export function desaturate(left: number, right: number, cap: number): [number, number] {
  const peak = Math.max(Math.abs(left), Math.abs(right));
  if (peak <= cap) return [left, right];
  const k = cap / peak;
  return [left * k, right * k];
}

/** Clamp a command to +/-maxSpeed while respecting a non-zero minSpeed floor. */
export function respectSpeeds(v: number, minSpeed: number, maxSpeed: number): number {
  const clamped = Math.max(-maxSpeed, Math.min(maxSpeed, v));
  if (minSpeed <= 0) return clamped;
  if (Math.abs(clamped) < minSpeed) return Math.sign(clamped || 1) * minSpeed;
  return clamped;
}

/**
 * LemLib's "prioritise turning over moving": when the two controllers together ask for
 * more than the motors can give, the *lateral* term yields, not the angular one. This
 * is why a LemLib motion curves tightly into its target rather than sailing past it,
 * and it is a different rule from proportional desaturation.
 */
export function prioritiseTurning(lateral: number, angular: number): number {
  const overturn = Math.abs(angular) + Math.abs(lateral) - 127;
  if (overturn <= 0) return lateral;
  return lateral > 0 ? lateral - overturn : lateral + overturn;
}

/** Slew-rate limit, in command units per tick. 0 disables. */
export function slew(target: number, previous: number, maxChange: number): number {
  if (maxChange === 0) return target;
  const d = target - previous;
  if (Math.abs(d) <= maxChange) return target;
  return previous + Math.sign(d) * maxChange;
}
