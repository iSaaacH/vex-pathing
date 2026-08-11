import { describe, expect, it } from 'vitest';
import { blankRoutine, MOVE_TO_POINT_DEFAULTS, MOVE_TO_POSE_DEFAULTS, TURN_TO_HEADING_DEFAULTS, newId } from '../src/config/defaults';
import { emit, emitPathFile } from '../src/emit/lemlib05';
import { importChassisSettings } from '../src/model/importSettings';
import type { Routine } from '../src/model/types';

function withSegments(segments: Routine['segments']): Routine {
  const r = blankRoutine();
  r.start = { x: -58, y: -12, theta: 90 };
  r.segments = segments;
  return r;
}

describe('emit', () => {
  it('emits setPose and omits params that match the LemLib defaults', () => {
    const r = withSegments([
      {
        id: newId(),
        kind: 'moveToPoint',
        target: { x: -24, y: 36 },
        timeout: 2000,
        params: { ...MOVE_TO_POINT_DEFAULTS },
        markers: [],
        chain: { mode: 'blocking' },
      },
    ]);
    const { code } = emit(r, null);
    expect(code).toContain('chassis.setPose(-58, -12, 90);');
    // No params struct at all when everything is default.
    expect(code).toContain('chassis.moveToPoint(-24, 36, 2000);');
    expect(code).toContain('chassis.waitUntilDone();');
  });

  it('emits only the non-default params, as designated initialisers', () => {
    const r = withSegments([
      {
        id: newId(),
        kind: 'moveToPose',
        target: { x: 12, y: 48, theta: 90 },
        timeout: 2500,
        params: { ...MOVE_TO_POSE_DEFAULTS, forwards: false, lead: 0.4 },
        markers: [],
        chain: { mode: 'blocking' },
      },
    ]);
    const { code } = emit(r, null);
    expect(code).toContain('chassis.moveToPose(12, 48, 90, 2500, {.forwards = false, .lead = 0.4});');
    // maxSpeed is at its default of 127 and must not appear.
    expect(code).not.toContain('maxSpeed');
  });

  it('renders the direction enum with its LemLib qualifier', () => {
    const r = withSegments([
      {
        id: newId(),
        kind: 'turnToHeading',
        theta: 180,
        timeout: 900,
        params: { ...TURN_TO_HEADING_DEFAULTS, direction: 'CW_CLOCKWISE' },
        markers: [],
        chain: { mode: 'blocking' },
      },
    ]);
    const { code } = emit(r, null);
    expect(code).toContain('chassis.turnToHeading(180, 900, {.direction = AngularDirection::CW_CLOCKWISE});');
  });

  it('turns markers into waitUntil calls and drops waitUntilDone when chained', () => {
    const r = withSegments([
      {
        id: newId(),
        kind: 'moveToPoint',
        target: { x: 0, y: 24 },
        timeout: 2000,
        params: { ...MOVE_TO_POINT_DEFAULTS },
        markers: [{ id: newId(), atInches: 18, code: 'intake.move(127);' }],
        chain: { mode: 'chained', minSpeed: 40, earlyExitRange: 4 },
      },
    ]);
    const { code } = emit(r, null);
    expect(code).toContain('{.minSpeed = 40, .earlyExitRange = 4}');
    expect(code).toContain('chassis.waitUntil(18);');
    expect(code).toContain('intake.move(127);');
    expect(code).not.toContain('waitUntilDone');
  });

  it('emits ASSET and follow for a pure-pursuit segment', () => {
    const r = withSegments([
      {
        id: newId(),
        kind: 'follow',
        name: 'redLeftArc',
        controlPoints: [
          { x: 0, y: 0 },
          { x: 10, y: 20 },
          { x: 30, y: 30 },
          { x: 40, y: 40 },
        ],
        lookahead: 10,
        timeout: 3000,
        forwards: true,
        markers: [],
        chain: { mode: 'blocking' },
      },
    ]);
    const { code, paths } = emit(r, null);
    expect(code).toContain('ASSET(redLeftArc_txt);');
    expect(code).toContain('chassis.follow(redLeftArc_txt, 10, 3000);');
    expect(Object.keys(paths)).toEqual(['redLeftArc.txt']);
  });

  it('emits wait and raw action segments verbatim', () => {
    const r = withSegments([
      { id: newId(), kind: 'wait', ms: 250 },
      { id: newId(), kind: 'action', code: 'clamp.set_value(true);' },
    ]);
    const { code } = emit(r, null);
    expect(code).toContain('pros::delay(250);');
    expect(code).toContain('clamp.set_value(true);');
  });
});

describe('pure-pursuit path file', () => {
  it('uses the ", " delimiter, three columns, and the endData terminator', () => {
    const r = blankRoutine();
    const text = emitPathFile(
      [
        { x: 0, y: 0 },
        { x: 10, y: 20 },
        { x: 30, y: 30 },
        { x: 40, y: 40 },
      ],
      r,
    );
    const lines = text.split('\n');
    expect(lines[lines.length - 1]).toBe('endData');

    for (const line of lines.slice(0, -1)) {
      // The delimiter is comma AND space; a bare comma fails LemLib's parser.
      expect(line).toMatch(/^-?\d+\.\d{3}, -?\d+\.\d{3}, \d+\.\d{3}$/);
      expect(line.split(', ')).toHaveLength(3);
    }
    expect(lines.length).toBeGreaterThan(5);
  });
});

describe('settings importer', () => {
  it('pulls the drivetrain and both controllers out of a pasted main.cpp block', () => {
    const src = `
      lemlib::Drivetrain drivetrain(&leftMotors, &rightMotors, 11.5, lemlib::Omniwheel::NEW_325, 450, 2);

      lemlib::ControllerSettings lateralController(10, 0, 3, 3, 1, 100, 3, 500, 20);
      lemlib::ControllerSettings angularController(2, 0, 10, 3, 1, 100, 3, 500, 0);
    `;
    const r = blankRoutine();
    const out = importChassisSettings(src, r.settings);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.settings.drivetrain.trackWidth).toBe(11.5);
    expect(out.settings.drivetrain.rpm).toBe(450);
    expect(out.settings.drivetrain.horizontalDrift).toBe(2);
    expect(out.settings.lateral.kP).toBe(10);
    expect(out.settings.lateral.kD).toBe(3);
    expect(out.settings.angular.kP).toBe(2);
    expect(out.settings.angular.kD).toBe(10);
  });

  it('reports a useful error when nothing matches', () => {
    const r = blankRoutine();
    const out = importChassisSettings('int x = 5;', r.settings);
    expect(out.ok).toBe(false);
  });
});
