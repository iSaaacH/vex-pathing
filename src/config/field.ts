/**
 * Field geometry constants.
 *
 * PLAN.md §5.3 — do NOT inline these numbers anywhere else. Every coordinate in the
 * app derives from them.
 */

/**
 * Span of the playing field, in inches.
 *
 * Six 24-inch foam tiles per side = 144 in, which is the span LemLib's -72..+72
 * convention assumes. The *field perimeter interior* is smaller than the tile span
 * (V5RC perimeters have historically been ~140.5 in), so this is deliberately
 * overridable in settings.
 *
 * TODO(ISA-111): pin against Appendix A of the Override game manual and cite the page.
 */
export const FIELD_SIZE_IN = 144;

/** Half-span. Field coordinates run -FIELD_HALF_IN .. +FIELD_HALF_IN on both axes. */
export const FIELD_HALF_IN = FIELD_SIZE_IN / 2;

/** Foam tile edge length, inches. */
export const TILE_IN = 24;

/** Tiles per side. */
export const TILES_PER_SIDE = Math.round(FIELD_SIZE_IN / TILE_IN);
