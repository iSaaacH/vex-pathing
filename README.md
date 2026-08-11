# VEX Pathing

A browser-based autonomous path planner and motion simulator for V5RC **Override**
(2026–27), speaking [LemLib](https://github.com/LemLib/LemLib)'s coordinate system and
motion vocabulary.

Drag waypoints across the field. The app tells you the LemLib coordinates, simulates the
motion LemLib will actually produce for them, and generates the `autonomous()` routine as
you go.

> **The honest caveat:** the generated C++ is a starting point, not a drop-in. Simulated
> odometry is perfect; real odometry drifts. This removes the geometry guesswork, not the
> tuning.

## Quickstart

```bash
npm install
npm run dev        # http://localhost:5173/vex-pathing/
npm test           # simulator + emitter tests
npm run check      # svelte-check
npm run build      # type-check then build to dist/
npm run deploy     # build and push dist/ to the gh-pages branch
```

## What works today

- **Nine segment kinds**, one per LemLib motion: `moveToPoint`, `moveToPose`,
  `turnToHeading`, `turnToPoint`, `swingToHeading`, `swingToPoint`, `follow`, plus
  `wait` and a raw-C++ `action` escape hatch.
- **Drag-to-edit.** The segment list and the field canvas are the same document viewed
  twice — drag a handle and the numbers update, type a number and the handle moves.
  There is no apply button. Shift snaps to the half-inch.
- **A real simulator.** TypeScript ports of LemLib's PID, exit conditions,
  `moveToPoint`/`moveToPose` (including the boomerang carrot and the `horizontalDrift`
  slip cap), turns and swings, and pure pursuit — stepped at LemLib's own 10 ms period
  against a differential-drive plant. Not a spline animation: `moveToPoint` turns *while*
  it translates, and the curve you see is the one the gains produce.
- **Live code generation.** Only non-default params are emitted, as C++20 designated
  initialisers. Markers become `chassis.waitUntil(d)`; the chain toggle swaps
  `waitUntilDone()` for `minSpeed`/`earlyExitRange`. Per-segment timing estimates land in
  the comments.
- **Pure-pursuit path files** in LemLib's exact `x, y, velocity` format with the
  two-character `", "` delimiter and `endData` terminator.
- **The real field.** The background is an orthographic top-down render of the Override
  field, cropped to exactly the 144&Prime; Floor so it maps 1:1 onto the coordinate system —
  no offset, no scale constant in the drawing code. The 24&Prime; tile grid is drawn from
  `FIELD_SIZE_IN` on top of it, so it doubles as a standing calibration check.
  See [`docs/FIELD_CALIBRATION.md`](docs/FIELD_CALIBRATION.md).
- **Collision + onion layers.** The robot footprint is swept along the trace and tested
  against the nine Goals every tick. Goal positions were measured from the render and
  land within 0.37&Prime; of an exact 24&Prime; lattice.
- **Settings import.** Paste your `lemlib::Drivetrain` / `ControllerSettings` block from
  `main.cpp` and it parses the numbers out, `Omniwheel::NEW_325` included.
- Undo/redo, autosave to `localStorage`, `.vexpath` import/export.

## Coordinate system

LemLib native, so nothing is translated between what you see and what is emitted:

| | |
| --- | --- |
| Origin | Field centre |
| Units | Inches, −72 … +72 |
| +X / +Y | Right wall / up-field |
| Heading 0° | **+Y (up)** |
| Heading sign | **Clockwise-positive** |

⚠️ This differs from [vex-scope](https://github.com/iSaaacH/vex-scope), which uses the
maths convention. See `PLAN.md` §3.1.

## Known limits

- **Toggle and Loader footprints are still approximate.** The nine Goals are measured;
  the wall-mounted elements are modelled flush to the perimeter, where a robot rarely
  goes. (ISA-113)
- **The simulator has not been validated against a real robot yet.** Until it is, the UI
  says "predicted", not "simulated". (ISA-130)
- Default PID gains are placeholders — import yours.

## Layout

```
src/
├─ config/     field constants, LemLib struct defaults, Override elements
├─ model/      document types, geometry/coordinate conversions, settings importer
├─ sim/        the LemLib ports — pid, exit, motions, drivetrain, collision, run
├─ emit/       code generators (lemlib05 today, pluggable for v1.0)
├─ render/     canvas drawing
├─ stores/     the document store, undo/redo, autosave
└─ lib/        Svelte components
```

Design rationale for all of it is in [`PLAN.md`](./PLAN.md); the milestone and issue
breakdown is in [`LINEAR_PROJECT.md`](./LINEAR_PROJECT.md).

## Attribution

The field render is by **Jerry Lum** ([field-rendering.jerryio.com](https://field-rendering.jerryio.com/)),
used under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) and modified
(cropped and rescaled). See [`NOTICE`](NOTICE).

Not affiliated with VEX Robotics.

## Related

- **[VEX-Live-Tuning](https://github.com/iSaaacH/VEX-Live-Tuning)** — live tuning over Web
  Serial. Source of the design system, and the telemetry stream this project will
  validate its simulator against.
- **[vex-scope](https://github.com/iSaaacH/vex-scope)** — the AdvantageScope-equivalent
  viewer. VEX Pathing deliberately does **not** do telemetry, 3D, or log viewing.

Team 4613R · Redbacks
