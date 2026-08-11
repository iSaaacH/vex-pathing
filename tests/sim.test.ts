import { describe, expect, it } from 'vitest';
import { blankRoutine, MOVE_TO_POINT_DEFAULTS, MOVE_TO_POSE_DEFAULTS, TURN_TO_HEADING_DEFAULTS, newId } from '../src/config/defaults';
import { simulate } from '../src/sim/run';
import { ExitCondition, ExitPair } from '../src/sim/exit';
import { PID } from '../src/sim/pid';
import { angleError, headingTo, sanitizeAngle } from '../src/model/geometry';
import type { Routine } from '../src/model/types';

function routineWith(segments: Routine['segments'], start = { x: 0, y: 0, theta: 0 }): Routine {
  const r = blankRoutine();
  r.start = start;
  r.segments = segments;
  return r;
}

describe('geometry / LemLib conventions', () => {
  it('0 degrees is +Y and headings increase clockwise', () => {
    // Straight up from the origin is heading 0.
    expect(headingTo({ x: 0, y: 0 }, { x: 0, y: 10 })).toBeCloseTo(0, 5);
    // Straight right is 90 (clockwise from up).
    expect(headingTo({ x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(90, 5);
    // Straight down is 180.
    expect(headingTo({ x: 0, y: 0 }, { x: 0, y: -10 })).toBeCloseTo(180, 5);
    // Straight left is 270.
    expect(headingTo({ x: 0, y: 0 }, { x: -10, y: 0 })).toBeCloseTo(270, 5);
  });

  it('angleError wraps the short way', () => {
    expect(angleError(10, 350)).toBeCloseTo(20, 5);
    expect(angleError(350, 10)).toBeCloseTo(-20, 5);
    expect(sanitizeAngle(-90)).toBe(270);
  });
});

describe('PID', () => {
  it('accumulates the integral, then discards it when the error changes sign', () => {
    // kI only, so the output *is* the integral. Matches LemLib, which zeroes the
    // integral outright on a sign flip rather than decaying it.
    const pid = new PID(0, 1, 0, 0);
    expect(pid.update(10)).toBe(0); // first call: prevError 0, so it reads as a flip
    expect(pid.update(10)).toBe(10);
    expect(pid.update(10)).toBe(20);
    expect(pid.update(-10)).toBe(0); // flip discards the accumulated 20
  });

  it('does not accumulate outside the windup range', () => {
    const pid = new PID(0, 1, 0, 5);
    pid.update(100);
    expect(pid.update(100)).toBe(0);
  });
});

describe('ExitCondition', () => {
  it('fires only after the error stays in range for the full timeout', () => {
    const ec = new ExitCondition(1, 100);
    expect(ec.update(0.5, 0)).toBe(false);
    expect(ec.update(0.5, 50)).toBe(false);
    expect(ec.update(0.5, 101)).toBe(true);
  });

  it('resets the clock when the error leaves the range', () => {
    const ec = new ExitCondition(1, 100);
    ec.update(0.5, 0);
    ec.update(5, 50); // out of range — clock resets
    expect(ec.update(0.5, 120)).toBe(false);
    expect(ec.update(0.5, 260)).toBe(true);
  });

  it('the small/large pair fires on whichever settles first', () => {
    const pair = new ExitPair(1, 500, 3, 100);
    // Error of 2 is outside small but inside large, so the large pair should fire.
    pair.update(2, 0);
    expect(pair.update(2, 101)).toBe(true);
  });
});

describe('simulate', () => {
  it('drives moveToPoint to within an inch of its target', () => {
    const r = routineWith([
      {
        id: newId(),
        kind: 'moveToPoint',
        target: { x: 0, y: 36 },
        timeout: 4000,
        params: { ...MOVE_TO_POINT_DEFAULTS },
        markers: [],
        chain: { mode: 'blocking' },
      },
    ]);
    const t = simulate(r);
    const end = t.points[t.points.length - 1]!;
    expect(Math.hypot(end.x - 0, end.y - 36)).toBeLessThan(1);
    expect(t.segments[0]!.exit).toBe('settled');
    expect(t.duration).toBeGreaterThan(0.3);
    expect(t.duration).toBeLessThan(4);
  });

  it('reverses when forwards is false', () => {
    const r = routineWith([
      {
        id: newId(),
        kind: 'moveToPoint',
        target: { x: 0, y: -36 },
        timeout: 4000,
        params: { ...MOVE_TO_POINT_DEFAULTS, forwards: false },
        markers: [],
        chain: { mode: 'blocking' },
      },
    ]);
    const t = simulate(r);
    const end = t.points[t.points.length - 1]!;
    expect(Math.hypot(end.x - 0, end.y + 36)).toBeLessThan(1.5);
    // Heading should not have flipped around; it reversed into the target.
    expect(Math.abs(angleError(end.theta, 0))).toBeLessThan(45);
  });

  it('turnToHeading reaches the commanded angle', () => {
    const r = routineWith([
      {
        id: newId(),
        kind: 'turnToHeading',
        theta: 90,
        timeout: 3000,
        params: { ...TURN_TO_HEADING_DEFAULTS },
        markers: [],
        chain: { mode: 'blocking' },
      },
    ]);
    const t = simulate(r);
    const end = t.points[t.points.length - 1]!;
    expect(Math.abs(angleError(90, end.theta))).toBeLessThan(3);
    expect(t.segments[0]!.exit).toBe('settled');
  });

  it('a forced turn direction takes the long way round', () => {
    // 350 -> 10 is +20 the short way; forcing CCW should sweep ~340 the other way.
    const seg = (direction: 'AUTO' | 'CCW_COUNTERCLOCKWISE') =>
      routineWith(
        [
          {
            id: newId(),
            kind: 'turnToHeading',
            theta: 10,
            timeout: 6000,
            params: { ...TURN_TO_HEADING_DEFAULTS, direction },
            markers: [],
            chain: { mode: 'blocking' },
          },
        ],
        { x: 0, y: 0, theta: 350 },
      );

    const auto = simulate(seg('AUTO'));
    const ccw = simulate(seg('CCW_COUNTERCLOCKWISE'));
    // The long way must take meaningfully longer — this is the "2-second auton loss"
    // the simulator exists to make visible.
    expect(ccw.duration).toBeGreaterThan(auto.duration * 1.5);
  });

  it('moveToPose arrives at the commanded heading', () => {
    const r = routineWith([
      {
        id: newId(),
        kind: 'moveToPose',
        target: { x: 24, y: 24, theta: 90 },
        timeout: 5000,
        params: { ...MOVE_TO_POSE_DEFAULTS },
        markers: [],
        chain: { mode: 'blocking' },
      },
    ]);
    const t = simulate(r);
    const end = t.points[t.points.length - 1]!;
    // It must actually settle, not run out its timeout. The signed lateral error is
    // what makes that possible — with an unsigned one it orbits the target forever.
    expect(t.segments[0]!.exit).toBe('settled');
    expect(Math.hypot(end.x - 24, end.y - 24)).toBeLessThan(3);
    expect(Math.abs(angleError(90, end.theta))).toBeLessThan(20);
  });

  it('a chained segment exits earlier than a blocking one', () => {
    const mk = (chain: Routine['segments'][number] extends never ? never : any) =>
      routineWith([
        {
          id: newId(),
          kind: 'moveToPoint',
          target: { x: 0, y: 36 },
          timeout: 4000,
          params: { ...MOVE_TO_POINT_DEFAULTS },
          markers: [],
          chain,
        },
      ]);

    const blocking = simulate(mk({ mode: 'blocking' }));
    const chained = simulate(mk({ mode: 'chained', minSpeed: 40, earlyExitRange: 6 }));
    expect(chained.duration).toBeLessThan(blocking.duration);
    expect(chained.segments[0]!.exit).toBe('earlyExit');
  });

  it('a wait segment costs exactly its duration', () => {
    const r = routineWith([{ id: newId(), kind: 'wait', ms: 500 }]);
    const t = simulate(r);
    expect(t.duration).toBeCloseTo(0.5, 1);
  });

  it('flags a collision when the path runs through a goal', () => {
    // The centre Tall Goal sits at the origin; driving through it must register.
    const r = routineWith(
      [
        {
          id: newId(),
          kind: 'moveToPoint',
          target: { x: 0, y: 30 },
          timeout: 4000,
          params: { ...MOVE_TO_POINT_DEFAULTS },
          markers: [],
          chain: { mode: 'blocking' },
        },
      ],
      { x: 0, y: -30, theta: 0 },
    );
    const t = simulate(r);
    expect(t.collisions).toBeGreaterThan(0);
    expect(t.segments[0]!.collided).toBe(true);
  });
});
