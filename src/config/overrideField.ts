/**
 * Override (2026-27) field image and element geometry.
 *
 * The background is an orthographic top-down render by Jerry Lum
 * (https://field-rendering.jerryio.com/, CC BY 4.0), cropped to exactly the 144 in
 * Floor so it maps 1:1 onto the field rect with no offset bookkeeping. See
 * `docs/FIELD_CALIBRATION.md` for how the crop was measured and verified.
 *
 * Element positions below were **measured from that render**, not guessed — see the
 * same doc. They are good to about a third of an inch.
 */

import fieldImageUrl from '../assets/override-field.webp';
import type { Vec2 } from '../model/types';

export { fieldImageUrl };

/**
 * The image covers exactly the Floor: -72..+72 in on both axes. Because the crop is
 * exact, the renderer draws it straight onto the field rect — there is deliberately no
 * originPx/pxPerInch fudge factor to get wrong.
 */
export const FIELD_IMAGE_SPANS_FLOOR = true;

export type FieldShape =
  | { kind: 'circle'; id: string; label: string; at: Vec2; radius: number; fill: string }
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
    };

const NEUTRAL = '#8f9a93';
const RED = '#c1665c';
const BLUE = '#5b7fa8';
const TOGGLE = '#b99a63';
const LOADER = '#c9c0ae';

/** Measured goal footprint radius, inches. Alliance goals read slightly larger. */
const GOAL_R = 3.5;
const TALL_R = 3.2;

/**
 * Nine Goals, on the symmetric "knight's move" layout the render shows: one Tall Goal
 * at the centre, and eight at (+/-24, +/-48) / (+/-48, +/-24).
 *
 * Measured centres landed within 0.35 in of exact 24 in multiples, which is both a
 * sanity check on the layout and an independent confirmation of the image scale.
 */
export const OVERRIDE_ELEMENTS: FieldShape[] = [
  { kind: 'circle', id: 'tall', label: 'Tall Goal (neutral)', at: { x: 0, y: 0 }, radius: TALL_R, fill: NEUTRAL },

  // Blue Alliance Goals — the +x/+y diagonal
  { kind: 'circle', id: 'blue-a', label: 'Blue Alliance Goal', at: { x: 24, y: 48 }, radius: GOAL_R, fill: BLUE },
  { kind: 'circle', id: 'blue-b', label: 'Blue Alliance Goal', at: { x: 48, y: 24 }, radius: GOAL_R, fill: BLUE },

  // Red Alliance Goals — the -x/-y diagonal
  { kind: 'circle', id: 'red-a', label: 'Red Alliance Goal', at: { x: -48, y: -24 }, radius: GOAL_R, fill: RED },
  { kind: 'circle', id: 'red-b', label: 'Red Alliance Goal', at: { x: -24, y: -48 }, radius: GOAL_R, fill: RED },

  // Four neutral Short Goals on the opposite diagonal
  { kind: 'circle', id: 'short-nw', label: 'Short Goal (neutral)', at: { x: -48, y: 24 }, radius: GOAL_R, fill: NEUTRAL },
  { kind: 'circle', id: 'short-n', label: 'Short Goal (neutral)', at: { x: -24, y: 48 }, radius: GOAL_R, fill: NEUTRAL },
  { kind: 'circle', id: 'short-se', label: 'Short Goal (neutral)', at: { x: 48, y: -24 }, radius: GOAL_R, fill: NEUTRAL },
  { kind: 'circle', id: 'short-s', label: 'Short Goal (neutral)', at: { x: 24, y: -48 }, radius: GOAL_R, fill: NEUTRAL },

  // Toggles at the centre of each wall, flush against the perimeter.
  { kind: 'rect', id: 'tog-n', label: 'Toggle', at: { x: 0, y: 70.5 }, width: 24, length: 3, theta: 0, fill: TOGGLE },
  { kind: 'rect', id: 'tog-s', label: 'Toggle', at: { x: 0, y: -70.5 }, width: 24, length: 3, theta: 0, fill: TOGGLE },
  { kind: 'rect', id: 'tog-e', label: 'Toggle', at: { x: 70.5, y: 0 }, width: 3, length: 24, theta: 0, fill: TOGGLE },
  { kind: 'rect', id: 'tog-w', label: 'Toggle', at: { x: -70.5, y: 0 }, width: 3, length: 24, theta: 0, fill: TOGGLE },

  // Loaders, also flush, on the alliance-station walls.
  { kind: 'rect', id: 'load-nw', label: 'Loader', at: { x: -70.5, y: 36 }, width: 3, length: 16, theta: 0, fill: LOADER },
  { kind: 'rect', id: 'load-sw', label: 'Loader', at: { x: -70.5, y: -36 }, width: 3, length: 16, theta: 0, fill: LOADER },
  { kind: 'rect', id: 'load-ne', label: 'Loader', at: { x: 70.5, y: 36 }, width: 3, length: 16, theta: 0, fill: LOADER },
  { kind: 'rect', id: 'load-se', label: 'Loader', at: { x: 70.5, y: -36 }, width: 3, length: 16, theta: 0, fill: LOADER },
];

/**
 * Goal positions and radii are measured from the official-geometry render and agree
 * with a 24 in grid to ~0.35 in. Toggle and Loader footprints are still approximate —
 * they sit flush to the wall where a robot rarely goes, so they matter far less.
 */
export const ELEMENTS_VERIFIED = true;
