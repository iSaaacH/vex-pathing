# VEX Pathing

A browser-based autonomous path planner and motion simulator for V5RC **Override**
(2026–27), speaking [LemLib](https://github.com/LemLib/LemLib)'s coordinate system and
motion vocabulary.

> **Status: planning.** No code yet. The full research and design document is
> [`PLAN.md`](./PLAN.md); the milestone/issue breakdown is
> [`LINEAR_PROJECT.md`](./LINEAR_PROJECT.md).

## What it will do

Drag waypoints across a real Override field render. The app tells you the LemLib
coordinates and shows you the motion LemLib will *actually* produce for them — the
boomerang overshoot, the direction `AngularDirection::AUTO` picks, whether your
`earlyExitRange` chain actually chains — then generates the `autonomous()` routine.

It removes the geometry guesswork. It does not remove the tuning: simulated odometry is
perfect and real odometry is not, so every generated routine still needs a pass on the
field.

## Shape of it

| | |
| --- | --- |
| Target library | LemLib **v0.5.6** (latest stable), behind a pluggable emitter |
| Coordinates | LemLib native — centre origin, inches, 0° = +Y, clockwise-positive |
| Interaction model | [Pedro Pathing Visualizer](https://visualizer.pedropathing.com/) |
| Visual system | The `VEX-Live-Tuning` cream/paper palette |
| Simulation | TypeScript ports of LemLib's PID, exit conditions, boomerang and pure pursuit |
| Stack | Vite + TypeScript + Svelte 5, canvas 2D, no backend |
| Hosting | GitHub Pages |

## Related

- **[VEX-Live-Tuning](https://github.com/iSaaacH/VEX-Live-Tuning)** — live tuning over
  Web Serial. Source of the design system, and the telemetry stream this project
  validates its simulator against.
- **[vex-scope](https://github.com/iSaaacH/vex-scope)** — the AdvantageScope-equivalent
  viewer. VEX Pathing deliberately does **not** do telemetry, 3D, or log viewing.

Team 4613R · Redbacks
