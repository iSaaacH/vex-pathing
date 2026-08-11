/**
 * Override (2026-27) field elements.
 *
 * ⚠️ PLACEHOLDER GEOMETRY — ISA-113.
 *
 * The layout below is a plausible, symmetric arrangement of the elements the game
 * describes (nine Goals: four neutral Short, one neutral Tall, two Red and two Blue
 * Alliance; four Toggles at the centre of each wall; four Loaders beside the alliance
 * stations). The *positions and sizes are not yet verified* against Appendix A of the
 * game manual, so collision results are indicative rather than authoritative.
 *
 * When the real dimensions are transcribed, only this file changes — everything
 * downstream reads it as data. Do not scatter these numbers into the renderer.
 */

import type { Vec2 } from '../model/types';

export type FieldShape =
  | { kind: 'circle'; id: string; label: string; at: Vec2; radius: number; fill: string; stroke?: string }
  | {
      kind: 'rect';
      id: string;
      label: string;
      at: Vec2;
      width: number;
      length: number;
      /** LemLib-frame rotation, degrees. */
      theta: number;
      fill: string;
      stroke?: string;
    };

const NEUTRAL = '#9aa39c';
const RED = '#c1665c';
const BLUE = '#5b7fa8';
const TOGGLE = '#b99a63';
const LOADER = '#c9c0ae';

/**
 * Wall-mounted elements sit flush against the perimeter (70 in from centre, 4 in deep,
 * so they occupy 68..72). Anything that protrudes further blocks the corridor a robot
 * actually starts and drives in, which would make every routine read as a collision.
 */
export const OVERRIDE_ELEMENTS: FieldShape[] = [
  // Centre neutral Tall Goal
  { kind: 'circle', id: 'tall', label: 'Tall Goal', at: { x: 0, y: 0 }, radius: 8, fill: NEUTRAL },

  // Four neutral Short Goals, on the diagonals
  { kind: 'circle', id: 'short-nw', label: 'Short Goal', at: { x: -24, y: 24 }, radius: 6, fill: NEUTRAL },
  { kind: 'circle', id: 'short-ne', label: 'Short Goal', at: { x: 24, y: 24 }, radius: 6, fill: NEUTRAL },
  { kind: 'circle', id: 'short-sw', label: 'Short Goal', at: { x: -24, y: -24 }, radius: 6, fill: NEUTRAL },
  { kind: 'circle', id: 'short-se', label: 'Short Goal', at: { x: 24, y: -24 }, radius: 6, fill: NEUTRAL },

  // Alliance Goals — tucked into the corners. Red on the -Y half, blue on +Y.
  { kind: 'circle', id: 'red-a', label: 'Red Alliance Goal', at: { x: -60, y: -60 }, radius: 6.5, fill: RED },
  { kind: 'circle', id: 'red-b', label: 'Red Alliance Goal', at: { x: 60, y: -60 }, radius: 6.5, fill: RED },
  { kind: 'circle', id: 'blue-a', label: 'Blue Alliance Goal', at: { x: -60, y: 60 }, radius: 6.5, fill: BLUE },
  { kind: 'circle', id: 'blue-b', label: 'Blue Alliance Goal', at: { x: 60, y: 60 }, radius: 6.5, fill: BLUE },

  // Toggles at the centre of each wall
  { kind: 'rect', id: 'tog-n', label: 'Toggle', at: { x: 0, y: 70 }, width: 18, length: 4, theta: 0, fill: TOGGLE },
  { kind: 'rect', id: 'tog-s', label: 'Toggle', at: { x: 0, y: -70 }, width: 18, length: 4, theta: 0, fill: TOGGLE },
  { kind: 'rect', id: 'tog-e', label: 'Toggle', at: { x: 70, y: 0 }, width: 4, length: 18, theta: 0, fill: TOGGLE },
  { kind: 'rect', id: 'tog-w', label: 'Toggle', at: { x: -70, y: 0 }, width: 4, length: 18, theta: 0, fill: TOGGLE },

  // Loaders adjacent to the alliance stations
  { kind: 'rect', id: 'load-sw', label: 'Loader', at: { x: -70, y: -30 }, width: 4, length: 20, theta: 0, fill: LOADER },
  { kind: 'rect', id: 'load-se', label: 'Loader', at: { x: 70, y: -30 }, width: 4, length: 20, theta: 0, fill: LOADER },
  { kind: 'rect', id: 'load-nw', label: 'Loader', at: { x: -70, y: 30 }, width: 4, length: 20, theta: 0, fill: LOADER },
  { kind: 'rect', id: 'load-ne', label: 'Loader', at: { x: 70, y: 30 }, width: 4, length: 20, theta: 0, fill: LOADER },
];

/** True once the geometry has been checked against the manual. Flips with ISA-113. */
export const ELEMENTS_VERIFIED = false;
