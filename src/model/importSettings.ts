/**
 * Parse a pasted LemLib chassis setup out of main.cpp. PLAN.md §4.2.
 *
 * This exists because nobody re-types twelve PID constants correctly, and a simulation
 * run on the wrong gains is worse than no simulation at all — it looks authoritative
 * while being wrong.
 *
 * Deliberately tolerant: it scans for the constructor calls anywhere in the pasted text
 * rather than trying to parse C++. Two ControllerSettings blocks are expected; the
 * first is taken as lateral and the second as angular, which is the order the LemLib
 * docs and every example use.
 */

import type { ControllerSettings, DrivetrainSettings, RobotSettings } from './types';

/**
 * lemlib::Omniwheel constants, so `Omniwheel::NEW_325` resolves to 3.25 rather than
 * being read as the number 325. Practically every team passes the enum rather than a
 * literal, so without this the importer is useless.
 */
const OMNIWHEEL: Record<string, number> = {
  NEW_275: 2.75,
  OLD_275: 2.75,
  NEW_275_HALF: 2.744,
  OLD_275_HALF: 2.74,
  NEW_325: 3.25,
  OLD_325: 3.25,
  NEW_325_HALF: 3.246,
  OLD_325_HALF: 3.246,
  NEW_4: 4.0,
  OLD_4: 4.18,
  NEW_4_HALF: 3.995,
  OLD_4_HALF: 4.175,
};

/** Find `Type [name](...)` and return the raw argument text, balancing parentheses. */
function findCallArgs(src: string, typeName: string): string[] {
  const out: string[] = [];
  // Allow an optional variable name between the type and the argument list, which is
  // how these are actually written: `lemlib::Drivetrain drivetrain(...)`.
  const re = new RegExp(`${typeName}(?:\\s+\\w+)?\\s*\\(`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    while (i < src.length && depth > 0) {
      if (src[i] === '(') depth++;
      else if (src[i] === ')') depth--;
      i++;
    }
    out.push(src.slice(start, i - 1));
    re.lastIndex = i;
  }
  return out;
}

/** Split an argument list on top-level commas only. */
function splitArgs(args: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of args) {
    if (ch === '(' || ch === '{' || ch === '[') depth++;
    if (ch === ')' || ch === '}' || ch === ']') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Resolve one argument to a number, or null if it isn't one (a motor group, say). */
function argToNumber(arg: string): number | null {
  const omni = arg.match(/Omniwheel::(\w+)/);
  if (omni && OMNIWHEEL[omni[1]!] !== undefined) return OMNIWHEEL[omni[1]!]!;
  if (/^[&*]/.test(arg)) return null; // &leftMotors — a pointer, not a value
  const num = arg.match(/^-?\d+(?:\.\d+)?f?$/);
  if (num) return Number(arg.replace(/f$/, ''));
  return null;
}

export type ImportResult =
  | { ok: true; settings: RobotSettings; found: string[] }
  | { ok: false; error: string };

export function importChassisSettings(src: string, current: RobotSettings): ImportResult {
  const found: string[] = [];
  const next: RobotSettings = structuredClone(current);

  // --- Drivetrain(left, right, trackWidth, wheelDiameter, rpm, horizontalDrift) ---
  const driveArgs = findCallArgs(src, '(?:lemlib::)?Drivetrain')[0];
  if (driveArgs) {
    const args = splitArgs(driveArgs);
    // Drop the leading motor-group pointers, whatever they are called, then read the
    // four numbers positionally.
    const nums = args.map(argToNumber).filter((v): v is number => v !== null);
    if (nums.length >= 4) {
      const d: DrivetrainSettings = {
        ...next.drivetrain,
        trackWidth: nums[0]!,
        wheelDiameter: nums[1]!,
        rpm: nums[2]!,
        horizontalDrift: nums[3]!,
      };
      next.drivetrain = d;
      found.push('Drivetrain');
    }
  }

  // --- ControllerSettings(kP, kI, kD, windup, smallErr, smallT, largeErr, largeT, slew)
  const parsed: ControllerSettings[] = [];
  for (const c of findCallArgs(src, '(?:lemlib::)?ControllerSettings')) {
    const nums = splitArgs(c)
      .map(argToNumber)
      .filter((v): v is number => v !== null);
    if (nums.length >= 9) {
      parsed.push({
        kP: nums[0]!,
        kI: nums[1]!,
        kD: nums[2]!,
        windupRange: nums[3]!,
        smallError: nums[4]!,
        smallErrorTimeout: nums[5]!,
        largeError: nums[6]!,
        largeErrorTimeout: nums[7]!,
        slew: nums[8]!,
      });
    }
  }
  if (parsed[0]) {
    next.lateral = parsed[0];
    found.push('lateral ControllerSettings');
  }
  if (parsed[1]) {
    next.angular = parsed[1];
    found.push('angular ControllerSettings');
  }

  if (found.length === 0) {
    return {
      ok: false,
      error: 'No Drivetrain or ControllerSettings call found. Paste the block from main.cpp.',
    };
  }
  return { ok: true, settings: next, found };
}
