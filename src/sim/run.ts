/**
 * The simulation runner: Routine -> SimTrace. PLAN.md §4.2, §6.3.
 *
 * Walks the segment list, builds the matching motion controller for each, and steps the
 * plant at LemLib's 10 ms period until the motion settles, exits early, or hits its
 * timeout. Timings from here feed both the playback scrubber and the estimate comments
 * in the generated code.
 */

import { OVERRIDE_ELEMENTS } from '../config/overrideField';
import type { Routine, SegmentResult, SimTrace, TracePoint } from '../model/types';
import { collidesAt } from './collision';
import { DT_MS, DT_S, Drivetrain } from './drivetrain';
import { FollowPath, MoveToPoint, MoveToPose, TurnToHeading, TurnToPoint, type Motion } from './motions';

/** Hard cap so a badly-configured routine can't spin the browser. */
const MAX_TICKS = 60_000; // 600 s

export function simulate(routine: Routine): SimTrace {
  const dt = new Drivetrain(routine.settings.drivetrain, routine.start);
  const points: TracePoint[] = [];
  const results: SegmentResult[] = [];
  const { robotWidth, robotLength } = routine.settings.drivetrain;

  let t = 0;
  let ticks = 0;
  let collisions = 0;

  const record = (segmentIndex: number) => {
    points.push({
      t,
      x: dt.pose.x,
      y: dt.pose.y,
      theta: dt.pose.theta,
      v: dt.velocity,
      segmentIndex,
    });
  };

  record(-1);

  routine.segments.forEach((seg, index) => {
    const startT = t;
    let collided = false;

    if (seg.kind === 'wait') {
      const until = t + seg.ms / 1000;
      while (t < until && ticks < MAX_TICKS) {
        dt.step(0, 0);
        t += DT_S;
        ticks++;
        record(index);
      }
      results.push({ index, startT, endT: t, exit: 'instant', travelled: 0, collided: false });
      return;
    }

    if (seg.kind === 'action') {
      results.push({ index, startT, endT: t, exit: 'instant', travelled: 0, collided: false });
      return;
    }

    const motion = build(seg, routine);
    if (!motion) {
      results.push({ index, startT, endT: t, exit: 'instant', travelled: 0, collided: false });
      return;
    }

    let exit: SegmentResult['exit'] = 'timeout';
    let travelled = 0;
    const deadline = t + seg.timeout / 1000;

    while (t < deadline && ticks < MAX_TICKS) {
      const out = motion.step(dt.pose, (t - startT) * 1000);
      travelled = out.travelled;
      if (out.done) {
        exit = out.exit === 'earlyExit' ? 'earlyExit' : 'settled';
        break;
      }
      dt.step(out.left, out.right);
      t += DT_S;
      ticks++;
      record(index);

      if (!collided && collidesAt(dt.pose, robotWidth, robotLength, OVERRIDE_ELEMENTS)) {
        collided = true;
        collisions++;
      }
    }

    results.push({ index, startT, endT: t, exit, travelled, collided });
  });

  return { points, segments: results, duration: t, collisions };
}

function build(seg: Routine['segments'][number], routine: Routine): Motion | null {
  const s = routine.settings;
  switch (seg.kind) {
    case 'moveToPoint':
      return new MoveToPoint(seg.target, applyChain(seg.params, seg.chain), s);
    case 'moveToPose':
      return new MoveToPose(seg.target, applyChain(seg.params, seg.chain), s);
    case 'turnToHeading':
      return new TurnToHeading(seg.theta, applyChain(seg.params, seg.chain), s);
    case 'turnToPoint':
      return new TurnToPoint(seg.target, applyChain(seg.params, seg.chain), s);
    case 'swingToHeading':
      return new TurnToHeading(seg.theta, applyChain(seg.params, seg.chain), s, seg.side);
    case 'swingToPoint':
      return new TurnToPoint(seg.target, applyChain(seg.params, seg.chain), s, seg.side);
    case 'follow':
      return new FollowPath(seg.controlPoints, seg.lookahead, seg.forwards, s);
    default:
      return null;
  }
}

/**
 * Chaining is expressed on the segment but implemented through the params, exactly as
 * it is in real LemLib code — a chained motion is just one with a minSpeed floor and a
 * non-zero earlyExitRange.
 */
function applyChain<T extends { minSpeed: number; earlyExitRange: number }>(
  params: T,
  chain: { mode: 'blocking' } | { mode: 'chained'; minSpeed: number; earlyExitRange: number },
): T {
  if (chain.mode === 'blocking') return params;
  return { ...params, minSpeed: chain.minSpeed, earlyExitRange: chain.earlyExitRange };
}

/** Pose at a given time, by binary search over the trace. */
export function poseAt(trace: SimTrace, t: number): TracePoint | null {
  if (trace.points.length === 0) return null;
  let lo = 0;
  let hi = trace.points.length - 1;
  if (t <= trace.points[0]!.t) return trace.points[0]!;
  if (t >= trace.points[hi]!.t) return trace.points[hi]!;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (trace.points[mid]!.t <= t) lo = mid;
    else hi = mid;
  }
  return trace.points[lo]!;
}

export { DT_MS };
