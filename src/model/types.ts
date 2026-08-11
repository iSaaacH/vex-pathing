/**
 * The document model. PLAN.md §6.2.
 *
 * One plain, versioned, JSON-serialisable object. Everything else in the app is a view
 * of it. The segment kinds are *exactly* LemLib's motions — no invented primitive that
 * has no call to emit — and the params objects mirror the C++ structs field-for-field,
 * so code generation is a diff against defaults rather than a translation.
 */

export type Id = string;
export type Ms = number;

export type Vec2 = { x: number; y: number };

/** Inches, degrees. LemLib frame: centre origin, 0 deg = +Y, clockwise-positive. */
export type Pose = { x: number; y: number; theta: number };

export type AngularDirection = 'AUTO' | 'CW_CLOCKWISE' | 'CCW_COUNTERCLOCKWISE';
export type DriveSide = 'LEFT' | 'RIGHT';

// --- params structs, mirroring lemlib/chassis/chassis.hpp @ v0.5.6 -----------------

export type MoveToPointParams = {
  forwards: boolean;
  maxSpeed: number;
  minSpeed: number;
  earlyExitRange: number;
};

export type MoveToPoseParams = {
  forwards: boolean;
  horizontalDrift: number;
  lead: number;
  maxSpeed: number;
  minSpeed: number;
  earlyExitRange: number;
};

export type TurnToHeadingParams = {
  direction: AngularDirection;
  maxSpeed: number;
  minSpeed: number;
  earlyExitRange: number;
};

export type TurnToPointParams = TurnToHeadingParams & { forwards: boolean };

export type SwingToHeadingParams = TurnToHeadingParams;
export type SwingToPointParams = TurnToPointParams;

// --- markers and chaining ----------------------------------------------------------

/** Fires `code` after `atInches` of the motion have elapsed → chassis.waitUntil(d). */
export type Marker = { id: Id; atInches: number; code: string };

/**
 * How a segment hands off to the next one.
 * `blocking` emits waitUntilDone(); `chained` sets minSpeed/earlyExitRange and doesn't.
 */
export type Chain =
  | { mode: 'blocking' }
  | { mode: 'chained'; minSpeed: number; earlyExitRange: number };

type Common = {
  id: Id;
  timeout: Ms;
  markers: Marker[];
  chain: Chain;
  /** User-facing note, emitted as a // comment. */
  note?: string;
};

// --- segments ----------------------------------------------------------------------

export type Segment =
  | (Common & { kind: 'moveToPoint'; target: Vec2; params: MoveToPointParams })
  | (Common & { kind: 'moveToPose'; target: Pose; params: MoveToPoseParams })
  | (Common & { kind: 'turnToHeading'; theta: number; params: TurnToHeadingParams })
  | (Common & { kind: 'turnToPoint'; target: Vec2; params: TurnToPointParams })
  | (Common & {
      kind: 'swingToHeading';
      theta: number;
      side: DriveSide;
      params: SwingToHeadingParams;
    })
  | (Common & {
      kind: 'swingToPoint';
      target: Vec2;
      side: DriveSide;
      params: SwingToPointParams;
    })
  | (Common & {
      kind: 'follow';
      name: string;
      controlPoints: Vec2[];
      lookahead: number;
      forwards: boolean;
    })
  | { id: Id; kind: 'wait'; ms: Ms; note?: string }
  | { id: Id; kind: 'action'; code: string; note?: string };

export type SegmentKind = Segment['kind'];

/** Kinds that carry a params struct, markers and a chain mode. */
export type MotionSegment = Extract<Segment, { chain: Chain }>;

export function isMotion(s: Segment): s is MotionSegment {
  return s.kind !== 'wait' && s.kind !== 'action';
}

/** Kinds whose target is a field point the user can drag. */
export function hasTarget(
  s: Segment,
): s is Extract<Segment, { target: Vec2 | Pose }> {
  return (
    s.kind === 'moveToPoint' ||
    s.kind === 'moveToPose' ||
    s.kind === 'turnToPoint' ||
    s.kind === 'swingToPoint'
  );
}

/** Kinds that command an absolute heading. */
export function hasHeading(
  s: Segment,
): s is Extract<Segment, { kind: 'moveToPose' | 'turnToHeading' | 'swingToHeading' }> {
  return s.kind === 'moveToPose' || s.kind === 'turnToHeading' || s.kind === 'swingToHeading';
}

// --- robot settings ----------------------------------------------------------------

/** lemlib::ControllerSettings */
export type ControllerSettings = {
  kP: number;
  kI: number;
  kD: number;
  windupRange: number;
  smallError: number;
  smallErrorTimeout: number;
  largeError: number;
  largeErrorTimeout: number;
  slew: number;
};

/** lemlib::Drivetrain, plus the physical footprint the sim sweeps for collisions. */
export type DrivetrainSettings = {
  trackWidth: number;
  wheelDiameter: number;
  rpm: number;
  horizontalDrift: number;
  /** Chassis footprint, inches. Drawn, and used for collision. */
  robotWidth: number;
  robotLength: number;
};

export type RobotSettings = {
  drivetrain: DrivetrainSettings;
  lateral: ControllerSettings;
  angular: ControllerSettings;
};

// --- the document ------------------------------------------------------------------

export type Routine = {
  schemaVersion: 1;
  name: string;
  alliance: 'red' | 'blue';
  start: Pose;
  segments: Segment[];
  settings: RobotSettings;
};

// --- simulation output -------------------------------------------------------------

export type TracePoint = {
  t: number; // seconds since routine start
  x: number;
  y: number;
  theta: number; // degrees, LemLib frame
  v: number; // inches/sec, signed (negative = reversing)
  segmentIndex: number;
};

export type SegmentResult = {
  index: number;
  startT: number;
  endT: number;
  /** Why the motion stopped. */
  exit: 'settled' | 'timeout' | 'earlyExit' | 'instant';
  /** Distance travelled during the motion, inches (or degrees for turns). */
  travelled: number;
  collided: boolean;
};

export type SimTrace = {
  points: TracePoint[];
  segments: SegmentResult[];
  duration: number;
  collisions: number;
};
