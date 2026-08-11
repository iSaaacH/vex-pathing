# Field image calibration

How `src/assets/override-field.webp` was produced and how its scale was verified. If you
ever replace the field image, redo every step here — a background that is *nearly* to
scale is worse than none, because every coordinate the tool reports inherits the error
silently.

## Source

[field-rendering.jerryio.com](https://field-rendering.jerryio.com/) — Jerry Lum's
standardised VEX field renderings, **CC BY 4.0**.

File: `V5RC-Override-H2H-TopDown-TileColor66_71@0.1.png`, 4000 × 4000, RGBA.

Chosen over the game manual's Figure FO-1 for three reasons: it is an orthographic
render rather than a page graphic, it is 4000 px rather than a PDF figure, and it is
openly licensed so it can be redistributed in a public repo. The manual's FO-1 was used
as an independent cross-check of orientation and element layout.

**Why orthographic matters:** a perspective photo cannot be used for this at all. Objects
further from the camera appear smaller, so no single scale factor exists. Only an
orthographic projection (parallel rays, no vanishing point) maps field inches linearly
onto pixels.

## Orientation

Verified against two independent sources before committing to it:

- The manual's Figure FO-1 shows **red Alliance Stations on the west, blue on the east**,
  Toggles at the centre of each wall, Loaders beside the stations. The render matches.
- PATH.JERRYIO, which these renders are made for, documents its frame as *"Y Axis
  increases by north, X Axis increases by east, heading in degree starting from north
  (Y+ Axis) and increasing clockwise, with the origin at the center of the field."*

That is **identical to LemLib's convention**, which is what this app uses. So the image
is drawn unrotated, with its top edge at +Y. No flip, no transpose.

## Finding the Floor

The coordinate system is defined by the **Floor**, not the perimeter. From the game
manual's definitions:

> **Floor** — The interior flat part of the playing Field, made up of an array of six (6)
> gray foam field tiles wide by six (6) gray foam field tiles long (totaling 36 Field
> tiles) that are within the Field Perimeter.

and

> V5RC Override is played on a 12ft x 12ft foam mat […]

Six 24-inch tiles = 144 in = 12 ft, consistent both ways. So **the Floor is 144 × 144 in
and maps to −72…+72**, which is exactly what LemLib assumes. `FIELD_SIZE_IN = 144` is
correct and cited.

The Floor boundary in the render is the light perimeter wall meeting the dark foam — a
high-contrast edge. It was measured **sub-pixel** on all four sides, on 486 scanlines
each, taking the crossing of the midpoint between wall and floor luminance and then the
median:

| Edge | Pixel | Inter-quartile range |
| --- | --- | --- |
| left | 66.652 | — |
| right | 3932.590 | **0.061 px** |
| top | 66.690 | — |
| bottom | 3932.512 | — |

- Floor width **3865.938 px**, height **3865.822 px** — square to 0.12 px.
- Centre **(1999.62, 1999.60)** against an image centre of 1999.5 — centred to 0.12 px.
- Scale **26.847 px/in**.

## Verification: the goals land on a 24-inch lattice

An independent check, using content rather than the boundary. The four Alliance Goals
were located by connected-component analysis of saturated red and blue pixels, and their
centroids converted to inches using the calibration above:

| Goal | Measured (in) | Nominal | Error |
| --- | --- | --- | --- |
| Red | (−48.18, −24.09) | (−48, −24) | 0.20 |
| Red | (−24.01, −48.21) | (−24, −48) | 0.21 |
| Blue | (24.20, 48.30) | (24, 48) | 0.36 |
| Blue | (48.34, 24.16) | (48, 24) | 0.37 |

All nine Goals sit on a symmetric lattice — one Tall Goal at the origin and eight at
(±24, ±48) / (±48, ±24) — and every one lands within **0.37 in** of an exact 24-inch
multiple. That is two independent methods agreeing, so the scale is right.

`docs/` also contains the overlay used for the visual check: a 24-inch grid and the
modelled collision circles drawn on the source image. Every circle sits concentric on a
goal and every grid line passes through goal centres and tile seams.

### The residual

The goal centroids are biased outward by ~0.25 in on average, which would be explained by
a scale of 26.98 px/in instead of 26.847 (a 0.5 % difference). Two reasons for not
chasing it:

1. The boundary measurement is far more trustworthy — it is a high-contrast edge, sampled
   486 times per side, square and centred to a tenth of a pixel. Blob centroids of ring-
   shaped objects with directional lighting are not that precise.
2. 0.5 % is 0.36 in at the field edge, well under the placement repeatability of a real
   robot, and under the width of the tape lines.

**A note on a rejected measurement:** an attempt to calibrate from tile seams via a
high-pass column profile returned a pitch of ~27 px/in but placed the seams ~46 px (1.7
in) off any consistent grid, with the centre seam 20 px out of line. Those were tape
edges and shadows, not seams. It was discarded rather than averaged in — a measurement
you cannot explain should not be allowed to vote.

## Producing the asset

1. Composite the RGBA render onto an opaque background (the corners are transparent).
2. Crop to `(67, 67) … (3933, 3933)` — exactly the Floor, 3866 × 3866 px.
3. Resize to 2048 × 2048 (Lanczos).
4. Save as WebP, quality 88 — **96 KB**, versus ~4 MB for the source PNG.

Because the crop is exactly the Floor, the renderer blits it straight onto the field rect
with no origin offset and no px-per-inch constant anywhere in the drawing code. That is
deliberate: the only way to get the mapping wrong would be to change the crop.

## The standing check

The 24-inch tile grid in `src/render/field.ts` is generated from `FIELD_SIZE_IN`, not
from the image. It is drawn on top of the render, so **if the drawn grid ever drifts off
the render's tile seams, the mapping is broken**. Toggle it with the "tile grid" chip.
Keep that property when changing either the image or the transform.
