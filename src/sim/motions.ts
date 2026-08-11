/**
 * TypeScript ports of LemLib's motions. PLAN.md §4.1, §4.2.
 *
 * The point of porting rather than animating: `moveToPoint` does NOT drive straight to
 * its target. It runs a lateral and an angular PID simultaneously, so it turns *while*
 * translating and the resulting curve depends entirely on the ratio of those gains.
 * A spline animation shows a path LemLib will never drive.
 *
 * Each motion is a controller object exposing `step(pose, nowMs)`; the runner in
 * `run.ts` owns the clock and the plant.
 */

import {
  DEG,
  angleError,
  bezierCurvature,
  dist,
  headingTo,
  headingVector,
  sampleBezier,
  sanitizeAngle,
} from '../model/geometry';
import type {
  AngularDirection,
  ControllerSettings,
  DriveSide,
  MoveToPointParams,
  MoveToPoseParams,
  Pose,
  RobotSettings,
  SwingToHeadingParams,
  TurnToHeadingParams,
  Vec2,
} from '../model/types';
import { ExitPair } from './exit';
import { PID } from './pid';
import { desaturate, prioritiseTurning, respectSpeeds, slew } from './drivetrain';

export type MotionOutput = {
  left: number;
  right: number;
  done: boolean;
  /** Progress along the motion — inches for lateral, degrees for angular. */
  travelled: number;
  exit: 'settled' | 'earlyExit' | null;
};

export interface Motion {
  step(pose: Pose, nowMs: number): MotionOutput;
}

/** Distance below which LemLib stops steering and just drives to the point. */
const CLOSE_IN = 7.5;

/**
 * Resolve an angular error under a forced turn direction.
 * AUTO takes the shortest way round; CW/CCW force the long way when needed, which is
 * exactly the "turn from 350 to 10 the wrong way" trap the simulator exists to show.
 */
function directedError(target: number, current: number, direction: AngularDirection): number {
  const e = angleError(target, current);
  if (direction === 'CW_CLOCKWISE') return e < 0 ? e + 360 : e;
  if (direction === 'CCW_COUNTERCLOCKWISE') return e > 0 ? e - 360 : e;
  return e;
}

// --- moveToPoint -------------------------------------------------------------------

export class MoveToPoint implements Motion {
  private readonly lateralPID: PID;
  private readonly angularPID: PID;
  private readonly exit: ExitPair;
  private prevLateral = 0;
  private startPose: Pose | null = null;
  private close = false;
  private travelled = 0;

  constructor(
    private readonly target: Vec2,
    private readonly params: MoveToPointParams,
    settings: RobotSettings,
  ) {
    this.lateralPID = PID.fromSettings(settings.lateral);
    this.angularPID = PID.fromSettings(settings.angular);
    this.exit = exitPairFor(settings.lateral);
  }

  step(pose: Pose, nowMs: number): MotionOutput {
    if (!this.startPose) this.startPose = { ...pose };
    const d = dist(pose, this.target);
    this.travelled = dist(this.startPose, pose);

    // Once inside the close radius LemLib latches: it stops steering for the rest of
    // the motion even if it drifts back out, which is what stops the end-of-motion
    // wobble.
    if (d < CLOSE_IN) this.close = true;

    // When driving backwards LemLib reasons about a virtual pose facing 180 degrees
    // away, so all the error maths below is "forwards" and only the final wheel command
    // is flipped. Doing it any other way makes the sign handling unreadable.
    const facing = this.params.forwards ? pose.theta : sanitizeAngle(pose.theta + 180);
    const angErr = angleError(headingTo(pose, this.target), facing);
    const latErr = d * Math.cos(angErr * DEG);

    const settled = this.exit.update(latErr, nowMs);
    if (settled) return { left: 0, right: 0, done: true, travelled: this.travelled, exit: 'settled' };

    if (this.params.earlyExitRange > 0 && this.params.minSpeed > 0 && d < this.params.earlyExitRange) {
      return { left: 0, right: 0, done: true, travelled: this.travelled, exit: 'earlyExit' };
    }

    const angularPower = this.close ? 0 : this.angularPID.update(angErr);
    let lateralPower = this.lateralPID.update(latErr);

    // Don't reverse back out of the target before you've arrived.
    if (!this.close) lateralPower = Math.max(lateralPower, 0);

    lateralPower = respectSpeeds(lateralPower, this.params.minSpeed, this.params.maxSpeed);
    lateralPower = prioritiseTurning(lateralPower, angularPower);
    lateralPower = slew(lateralPower, this.prevLateral, 127);
    this.prevLateral = lateralPower;

    // Flipping the virtual frame back onto real wheels. A 180-degree flip doesn't
    // change which way is clockwise, so only the lateral term is negated.
    const drive = this.params.forwards ? lateralPower : -lateralPower;
    const [left, right] = desaturate(drive + angularPower, drive - angularPower, 127);
    return { left, right, done: false, travelled: this.travelled, exit: null };
  }
}

// --- moveToPose (boomerang) --------------------------------------------------------

export class MoveToPose implements Motion {
  private readonly lateralPID: PID;
  private readonly angularPID: PID;
  private readonly exit: ExitPair;
  private prevLateral = 0;
  private startPose: Pose | null = null;
  private close = false;
  private travelled = 0;
  /** Exposed so the renderer can draw the carrot chasing ahead of the robot. */
  carrot: Vec2 = { x: 0, y: 0 };

  constructor(
    private readonly target: Pose,
    private readonly params: MoveToPoseParams,
    private readonly settings: RobotSettings,
  ) {
    this.lateralPID = PID.fromSettings(settings.lateral);
    this.angularPID = PID.fromSettings(settings.angular);
    this.exit = exitPairFor(settings.lateral);
  }

  step(pose: Pose, nowMs: number): MotionOutput {
    if (!this.startPose) this.startPose = { ...pose };
    const d = dist(pose, this.target);
    this.travelled = dist(this.startPose, pose);
    if (d < CLOSE_IN) this.close = true;

    // The boomerang carrot: a point `lead * distance` behind the target along the
    // target heading. Chasing it instead of the target is what produces the arc that
    // arrives at the commanded heading.
    const h = headingVector(this.target.theta);
    this.carrot = this.close
      ? { x: this.target.x, y: this.target.y }
      : { x: this.target.x - h.x * this.params.lead * d, y: this.target.y - h.y * this.params.lead * d };

    const settled = this.exit.update(d, nowMs);
    if (settled) return { left: 0, right: 0, done: true, travelled: this.travelled, exit: 'settled' };

    if (this.params.earlyExitRange > 0 && this.params.minSpeed > 0 && d < this.params.earlyExitRange) {
      return { left: 0, right: 0, done: true, travelled: this.travelled, exit: 'earlyExit' };
    }

    // Same virtual-pose trick as MoveToPoint — see the comment there.
    const facing = this.params.forwards ? pose.theta : sanitizeAngle(pose.theta + 180);
    const aim = this.close ? this.target : this.carrot;
    const aimErr = angleError(headingTo(pose, aim), facing);

    // The lateral error is always the *signed* projection of the distance onto the
    // robot's facing. That sign is what lets it back up once it has overshot; using a
    // bare distance here makes the robot orbit the target forever instead of settling.
    const latErr = dist(pose, aim) * Math.cos(aimErr * DEG);
    // Once settling, steer to the commanded arrival heading rather than at the point.
    const angErr = this.close ? angleError(this.target.theta, pose.theta) : aimErr;

    const angularPower = this.angularPID.update(angErr);
    let lateralPower = this.lateralPID.update(latErr);
    if (!this.close) lateralPower = Math.max(lateralPower, 0);

    // horizontalDrift is LemLib's slip model: the tighter the arc being driven, the
    // lower the speed cap. Note the expression is deliberately NOT dimensionally
    // rigorous — LemLib clamps a motor command (-127..127) against
    // sqrt(drift * radius * 9.8) with radius in inches, and horizontalDrift is the
    // tuned fudge factor that makes the result land in motor units. Converting the
    // units "properly" produces a cap around 8 and the robot crawls.
    const drift = this.params.horizontalDrift || this.settings.drivetrain.horizontalDrift;
    if (drift > 0 && !this.close) {
      // Curvature of the circle through the robot pose (tangent to its heading) and
      // the carrot — the same formula pure pursuit uses.
      const dc = dist(pose, this.carrot);
      const curvature = dc < 1e-6 ? 0 : Math.abs((2 * Math.sin(aimErr * DEG)) / dc);
      if (curvature > 1e-6) {
        const maxSlipSpeed = Math.sqrt((drift * 9.8) / curvature);
        lateralPower = Math.max(-maxSlipSpeed, Math.min(maxSlipSpeed, lateralPower));
      }
    }

    lateralPower = respectSpeeds(lateralPower, this.params.minSpeed, this.params.maxSpeed);
    lateralPower = prioritiseTurning(lateralPower, angularPower);
    lateralPower = slew(lateralPower, this.prevLateral, 127);
    this.prevLateral = lateralPower;

    const drive = this.params.forwards ? lateralPower : -lateralPower;
    const [left, right] = desaturate(drive + angularPower, drive - angularPower, 127);
    return { left, right, done: false, travelled: this.travelled, exit: null };
  }

}

// --- turns -------------------------------------------------------------------------

export class TurnToHeading implements Motion {
  private readonly angularPID: PID;
  private readonly exit: ExitPair;
  private prev = 0;
  private startTheta: number | null = null;
  private travelled = 0;

  constructor(
    private readonly targetTheta: number,
    private readonly params: TurnToHeadingParams,
    settings: RobotSettings,
    private readonly lockedSide: DriveSide | null = null,
  ) {
    this.angularPID = PID.fromSettings(settings.angular);
    this.exit = exitPairFor(settings.angular);
  }

  step(pose: Pose, nowMs: number): MotionOutput {
    if (this.startTheta === null) this.startTheta = pose.theta;
    this.travelled = Math.abs(angleError(pose.theta, this.startTheta));

    const err = directedError(this.targetTheta, pose.theta, this.params.direction);

    if (this.exit.update(angleError(this.targetTheta, pose.theta), nowMs)) {
      return { left: 0, right: 0, done: true, travelled: this.travelled, exit: 'settled' };
    }
    if (
      this.params.earlyExitRange > 0 &&
      this.params.minSpeed > 0 &&
      Math.abs(angleError(this.targetTheta, pose.theta)) < this.params.earlyExitRange
    ) {
      return { left: 0, right: 0, done: true, travelled: this.travelled, exit: 'earlyExit' };
    }

    let power = this.angularPID.update(err);
    power = respectSpeeds(power, this.params.minSpeed, this.params.maxSpeed);
    power = slew(power, this.prev, 127);
    this.prev = power;

    // A swing locks one side of the drivetrain at zero and turns about that wheel.
    if (this.lockedSide === 'LEFT') return { left: 0, right: -power, done: false, travelled: this.travelled, exit: null };
    if (this.lockedSide === 'RIGHT') return { left: power, right: 0, done: false, travelled: this.travelled, exit: null };
    return { left: power, right: -power, done: false, travelled: this.travelled, exit: null };
  }
}

/** turnToPoint / swingToPoint — recompute the target heading every tick. */
export class TurnToPoint implements Motion {
  private inner: TurnToHeading | null = null;

  constructor(
    private readonly target: Vec2,
    private readonly params: TurnToHeadingParams & { forwards: boolean },
    private readonly settings: RobotSettings,
    private readonly lockedSide: DriveSide | null = null,
  ) {}

  step(pose: Pose, nowMs: number): MotionOutput {
    const heading = this.params.forwards
      ? headingTo(pose, this.target)
      : sanitizeAngle(headingTo(pose, this.target) + 180);
    // Rebuilt each tick because the target heading moves as the robot does; the PID
    // state lives in `inner` so it isn't reset, only re-aimed.
    if (!this.inner) {
      this.inner = new TurnToHeading(heading, this.params, this.settings, this.lockedSide);
    }
    (this.inner as unknown as { targetTheta: number }).targetTheta = heading;
    return this.inner.step(pose, nowMs);
  }
}

// --- pure pursuit ------------------------------------------------------------------

export class FollowPath implements Motion {
  private readonly points: Vec2[];
  private lastIndex = 0;
  private travelled = 0;
  private startPose: Pose | null = null;
  /** Exposed for rendering. */
  lookaheadPoint: Vec2 = { x: 0, y: 0 };

  constructor(
    controlPoints: Vec2[],
    private readonly lookahead: number,
    private readonly forwards: boolean,
    private readonly settings: RobotSettings,
  ) {
    this.points = sampleBezier(controlPoints, 2).map((s) => s.p);
  }

  step(pose: Pose, _nowMs: number): MotionOutput {
    if (!this.startPose) this.startPose = { ...pose };
    this.travelled = dist(this.startPose, pose);

    const last = this.points[this.points.length - 1]!;
    if (dist(pose, last) < 3 && this.lastIndex >= this.points.length - 2) {
      return { left: 0, right: 0, done: true, travelled: this.travelled, exit: 'settled' };
    }

    // Advance the lookahead point monotonically — never search backwards, or the robot
    // can latch onto an earlier part of a path that crosses itself.
    let target = last;
    for (let i = this.lastIndex; i < this.points.length; i++) {
      if (dist(pose, this.points[i]!) >= this.lookahead) {
        target = this.points[i]!;
        this.lastIndex = i;
        break;
      }
    }
    this.lookaheadPoint = target;

    const facing = this.forwards ? pose.theta : sanitizeAngle(pose.theta + 180);
    const angErr = angleError(headingTo(pose, target), facing) * DEG;
    const d = dist(pose, target);
    const curvature = d < 1e-6 ? 0 : (2 * Math.sin(angErr)) / d;

    const maxVel = (this.settings.drivetrain.rpm / 60) * Math.PI * this.settings.drivetrain.wheelDiameter;
    const base = this.forwards ? 100 : -100;
    const track = this.settings.drivetrain.trackWidth;
    const vL = base * (1 + (curvature * track) / 2);
    const vR = base * (1 - (curvature * track) / 2);
    void maxVel;

    const [left, right] = desaturate(vL, vR, 127);
    return { left, right, done: false, travelled: this.travelled, exit: null };
  }
}

// --- shared ------------------------------------------------------------------------

function exitPairFor(s: ControllerSettings): ExitPair {
  return new ExitPair(s.smallError, s.smallErrorTimeout, s.largeError, s.largeErrorTimeout);
}

export type { SwingToHeadingParams };
