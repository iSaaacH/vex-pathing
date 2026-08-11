/**
 * LemLib v0.5.6 struct defaults, plus the app's starting document.
 *
 * The params defaults are transcribed verbatim from
 * `include/lemlib/chassis/chassis.hpp` @ v0.5.6. Code generation diffs against these,
 * so a wrong value here silently emits a wrong routine — treat them as data, not
 * as tunables.
 */

import type {
  ControllerSettings,
  MoveToPointParams,
  MoveToPoseParams,
  RobotSettings,
  Routine,
  Segment,
  SegmentKind,
  SwingToHeadingParams,
  SwingToPointParams,
  TurnToHeadingParams,
  TurnToPointParams,
} from '../model/types';

export const MOVE_TO_POINT_DEFAULTS: MoveToPointParams = {
  forwards: true,
  maxSpeed: 127,
  minSpeed: 0,
  earlyExitRange: 0,
};

export const MOVE_TO_POSE_DEFAULTS: MoveToPoseParams = {
  forwards: true,
  horizontalDrift: 0,
  lead: 0.6,
  maxSpeed: 127,
  minSpeed: 0,
  earlyExitRange: 0,
};

export const TURN_TO_HEADING_DEFAULTS: TurnToHeadingParams = {
  direction: 'AUTO',
  maxSpeed: 127,
  minSpeed: 0,
  earlyExitRange: 0,
};

export const TURN_TO_POINT_DEFAULTS: TurnToPointParams = {
  ...TURN_TO_HEADING_DEFAULTS,
  forwards: true,
};

export const SWING_TO_HEADING_DEFAULTS: SwingToHeadingParams = { ...TURN_TO_HEADING_DEFAULTS };
export const SWING_TO_POINT_DEFAULTS: SwingToPointParams = { ...TURN_TO_POINT_DEFAULTS };

/** Default timeout per motion, ms. */
export const DEFAULT_TIMEOUT = 2000;
export const DEFAULT_TURN_TIMEOUT = 1000;

// --- robot -------------------------------------------------------------------------

/**
 * Placeholder gains, in the shape of a typical LemLib setup. These are NOT 4613R's
 * numbers — import the real ones from main.cpp (Settings → Import).
 */
export const DEFAULT_LATERAL: ControllerSettings = {
  kP: 10,
  kI: 0,
  kD: 3,
  windupRange: 3,
  smallError: 1,
  smallErrorTimeout: 100,
  largeError: 3,
  largeErrorTimeout: 500,
  slew: 20,
};

export const DEFAULT_ANGULAR: ControllerSettings = {
  kP: 2,
  kI: 0,
  kD: 10,
  windupRange: 3,
  smallError: 1,
  smallErrorTimeout: 100,
  largeError: 3,
  largeErrorTimeout: 500,
  slew: 0,
};

export const DEFAULT_SETTINGS: RobotSettings = {
  drivetrain: {
    trackWidth: 11.5,
    wheelDiameter: 3.25,
    rpm: 450,
    horizontalDrift: 2,
    robotWidth: 15,
    robotLength: 15,
  },
  lateral: DEFAULT_LATERAL,
  angular: DEFAULT_ANGULAR,
};

// --- ids ---------------------------------------------------------------------------

let idCounter = 0;
export function newId(): string {
  idCounter += 1;
  return `s${Date.now().toString(36)}${idCounter.toString(36)}`;
}

// --- segment constructors ----------------------------------------------------------

export const SEGMENT_LABELS: Record<SegmentKind, string> = {
  moveToPoint: 'Move to point',
  moveToPose: 'Move to pose',
  turnToHeading: 'Turn to heading',
  turnToPoint: 'Turn to point',
  swingToHeading: 'Swing to heading',
  swingToPoint: 'Swing to point',
  follow: 'Follow path',
  wait: 'Wait',
  action: 'Action',
};

/** Lateral motions are green, angular are orange, the rest muted. PLAN.md §7.2. */
export const SEGMENT_FAMILY: Record<SegmentKind, 'lateral' | 'angular' | 'other'> = {
  moveToPoint: 'lateral',
  moveToPose: 'lateral',
  follow: 'lateral',
  turnToHeading: 'angular',
  turnToPoint: 'angular',
  swingToHeading: 'angular',
  swingToPoint: 'angular',
  wait: 'other',
  action: 'other',
};

export function makeSegment(kind: SegmentKind, near: { x: number; y: number; theta: number }): Segment {
  const id = newId();
  const base = { id, markers: [], chain: { mode: 'blocking' as const } };
  // Drop the new target a little ahead of where the robot currently is, so a
  // freshly-added segment is visible and grabbable rather than stacked on the last one.
  const rad = ((90 - near.theta) * Math.PI) / 180;
  const ahead = { x: near.x + 24 * Math.cos(rad), y: near.y + 24 * Math.sin(rad) };

  switch (kind) {
    case 'moveToPoint':
      return { ...base, kind, timeout: DEFAULT_TIMEOUT, target: ahead, params: { ...MOVE_TO_POINT_DEFAULTS } };
    case 'moveToPose':
      return {
        ...base,
        kind,
        timeout: DEFAULT_TIMEOUT,
        target: { ...ahead, theta: near.theta },
        params: { ...MOVE_TO_POSE_DEFAULTS },
      };
    case 'turnToHeading':
      return {
        ...base,
        kind,
        timeout: DEFAULT_TURN_TIMEOUT,
        theta: (near.theta + 90) % 360,
        params: { ...TURN_TO_HEADING_DEFAULTS },
      };
    case 'turnToPoint':
      return { ...base, kind, timeout: DEFAULT_TURN_TIMEOUT, target: ahead, params: { ...TURN_TO_POINT_DEFAULTS } };
    case 'swingToHeading':
      return {
        ...base,
        kind,
        timeout: DEFAULT_TURN_TIMEOUT,
        theta: (near.theta + 90) % 360,
        side: 'LEFT',
        params: { ...SWING_TO_HEADING_DEFAULTS },
      };
    case 'swingToPoint':
      return {
        ...base,
        kind,
        timeout: DEFAULT_TURN_TIMEOUT,
        target: ahead,
        side: 'LEFT',
        params: { ...SWING_TO_POINT_DEFAULTS },
      };
    case 'follow':
      return {
        ...base,
        kind,
        timeout: 4000,
        name: 'path',
        lookahead: 10,
        forwards: true,
        controlPoints: [
          { x: near.x, y: near.y },
          { x: near.x + 12 * Math.cos(rad) - 10, y: near.y + 12 * Math.sin(rad) },
          { x: ahead.x + 10, y: ahead.y },
          { x: ahead.x, y: ahead.y + 12 },
        ],
      };
    case 'wait':
      return { id, kind, ms: 250 };
    case 'action':
      return { id, kind, code: 'intake.move(127);' };
  }
}

// --- the starting document ---------------------------------------------------------

export function blankRoutine(): Routine {
  return {
    schemaVersion: 1,
    name: 'new-routine',
    alliance: 'red',
    start: { x: -58, y: -36, theta: 90 },
    segments: [],
    settings: structuredClone(DEFAULT_SETTINGS),
  };
}

/**
 * A small demo so the app isn't an empty canvas on first load.
 *
 * Deliberately routed clear of the placeholder field elements — a demo that opens
 * showing three collisions teaches the wrong thing about the tool on first contact.
 */
export function demoRoutine(): Routine {
  const r = blankRoutine();
  r.name = 'demo-red-left';
  r.start = { x: -48, y: -40, theta: 0 };
  r.segments = [
    {
      id: newId(),
      kind: 'moveToPoint',
      target: { x: -48, y: 24 },
      timeout: 2000,
      params: { ...MOVE_TO_POINT_DEFAULTS },
      markers: [{ id: newId(), atInches: 40, code: 'intake.move(127);' }],
      chain: { mode: 'chained', minSpeed: 40, earlyExitRange: 4 },
    },
    {
      id: newId(),
      kind: 'moveToPose',
      target: { x: -24, y: 46, theta: 90 },
      timeout: 3000,
      params: { ...MOVE_TO_POSE_DEFAULTS, lead: 0.45 },
      markers: [],
      chain: { mode: 'blocking' },
    },
    { id: newId(), kind: 'wait', ms: 250 },
    { id: newId(), kind: 'action', code: 'clamp.set_value(true);' },
    {
      id: newId(),
      kind: 'turnToHeading',
      theta: 0,
      timeout: 1000,
      params: { ...TURN_TO_HEADING_DEFAULTS },
      markers: [],
      chain: { mode: 'blocking' },
    },
    {
      id: newId(),
      kind: 'moveToPoint',
      target: { x: -56, y: 20 },
      timeout: 2500,
      params: { ...MOVE_TO_POINT_DEFAULTS, forwards: false },
      markers: [],
      chain: { mode: 'blocking' },
    },
  ];
  return r;
}
