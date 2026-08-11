# Linear — VEX Pathing

Mirror of the Linear project. Keep this in sync when issues move.

- **Workspace**: Isaac Hronopoulos
- **Team**: RedbacksVEX2026 (`ISA`)
- **Project**: [VEX Pathing](https://linear.app/isaac-hronopoulos/project/vex-pathing-493e0182af47)
- **Created**: 2026-08-11
- **Issues**: ISA-107 … ISA-134 (28)

Design rationale for every issue below lives in [`PLAN.md`](./PLAN.md); each issue
description cites its section.

---

## M0 — Foundation

> Repo, Vite + Svelte 5 + TypeScript, the VEX Live Tuning cream/paper design tokens, an
> empty three-pane shell, and a live GitHub Pages deploy. **Done when the URL loads and
> shows the shell.**

| Issue | Title | Notes |
| --- | --- | --- |
| ISA-107 | Scaffold Vite + Svelte 5 + TypeScript project | Vitest from day one — the M4 ports need real tests |
| ISA-108 | Port the VEX Live Tuning cream/paper design tokens | Token-for-token from `web/src/styles/app.css`. Do not re-derive |
| ISA-109 | Three-pane app shell (routine / field / generated code) | §7.1 wireframe |
| ISA-110 | GitHub Pages branch deploy + base path | Branch deploy, **not** Actions — token lacks `workflow` scope |

## M1 — Field & coordinates

> Override render + sidecar JSON, field↔canvas transform in the LemLib frame,
> `FIELD_SIZE_IN` pinned against the game manual, pan/zoom, grid. **Done when clicking
> the field yields correct LemLib coordinates.**

| Issue | Title | Notes |
| --- | --- | --- |
| ISA-111 | Pin `FIELD_SIZE_IN` against the Override game manual | **High.** Research task, do first. 144 in tile span vs ≈140.5 in perimeter interior — Risk 4 |
| ISA-112 | Produce the Override top-down field render from official CAD | 2D raster, not `.glb`. A placeholder unblocks M1–M3 |
| ISA-113 | Author `override-elements.json` collision geometry | From Appendix A dimensions, not traced |
| ISA-114 | Field ⇄ canvas transform in the LemLib frame | **High.** 0° = +Y, CW-positive. Diverges from vex-scope — see §3.1 |
| ISA-115 | Canvas pan / zoom / grid and live coordinate readout | Raw canvas 2D, no library |

## M2 — Document & editing

> The `Routine` model, segment list with per-kind inspectors, draggable waypoints,
> undo/redo, autosave. **Done when a 10-segment routine survives a page reload.**

| Issue | Title | Notes |
| --- | --- | --- |
| ISA-116 | Routine document model and types | **High.** Segment kinds are exactly LemLib's motions — no invented primitives |
| ISA-117 | Segment list with per-kind inspectors | A `turnToHeading` never shows an x/y box |
| ISA-118 | Draggable waypoints and heading arms on the canvas | **High.** List and canvas are one object viewed twice. No apply button |
| ISA-119 | Undo/redo, autosave, and named routine storage | Whole-document snapshots; a routine is a few KB |

## M3 — Code generation

> v0.5.6 emitter with param diffing, markers → `waitUntil`, chaining toggle, export
> dialog, `.txt` writer, `.vexpath` I/O. **Done when a generated routine compiles in a
> PROS project.**

| Issue | Title | Notes |
| --- | --- | --- |
| ISA-120 | LemLib v0.5.6 emitter behind a pluggable emitter interface | **Urgent.** Blocked on confirming 4613R's actual LemLib version |
| ISA-121 | Param diffing against LemLib struct defaults | C++20 designated initialisers. Defaults transcribed in the issue |
| ISA-122 | Event markers → `waitUntil()`, and the motion chaining toggle | The two features that make it an auton designer, not a calculator |
| ISA-123 | Pure-pursuit `.txt` path writer | `", "` delimiter — comma **and space**. `endData` terminator |
| ISA-124 | Export dialog, bundle zip, and `.vexpath` import/export | Carries the one-sentence honesty line |

## M4 — Simulation

> LemLib controller ports, sim runner, playback, onion layers, collision, timings.
> **Gated on the field validation (ISA-130).** Until that passes the UI says
> "predicted", not "simulated".

| Issue | Title | Notes |
| --- | --- | --- |
| ISA-125 | Port LemLib's PID and exit conditions to TypeScript | **High.** Exit conditions determine every timing estimate |
| ISA-126 | Port `moveToPoint`, `moveToPose`, turns and swings | **High.** Not a spline animation — see §4.1 |
| ISA-127 | Port pure pursuit and build the sim runner + drivetrain plant | Kinematic + lag. No slip, no CoM transfer — stated boundary |
| ISA-128 | Settings importer: paste a `lemlib::Chassis` constructor | Removes the biggest source of sim/robot mismatch |
| ISA-129 | Playback controls, onion layers, and collision detection | Onion layers are the feature that catches near-misses |
| ISA-130 | Field validation gate — predicted vs recorded under 2 in RMS | **Urgent.** Decides whether the project is useful or decorative |

## M5 — Polish

> Obstacles, mirroring, shortcuts, GIF, Actions deploy if unblocked, docs. **Done when
> 4613R designs a competition auton in it without asking how it works.**

| Issue | Title | Notes |
| --- | --- | --- |
| ISA-131 | Obstacles UI and alliance mirroring | Check Override's symmetry type before mirroring |
| ISA-132 | Keyboard shortcuts and GIF/APNG export | |
| ISA-133 | Upgrade to Actions-based Pages deploy | **Blocked** on `gh auth refresh -s workflow`. Same blocker as ISA-101 |
| ISA-134 | README, usage docs, and `LINEAR_PROJECT.md` upkeep | |

---

## Cross-project links

- **ISA-101** (vex-scope) — the same `workflow`-scope token blocker. ISA-133 unblocks
  when it does.
- **vex-scope** `PLAN.md` §5.4 — the conflicting heading convention (§3.1 here).
- **vex-scope** `PLAN.md` §6 — the `.vslog` format ISA-130 wants to import.
- **VEX-Live-Tuning** `web/src/styles/app.css` — the design tokens (ISA-108) and the
  telemetry stream ISA-130 records against.

## Blocked / needs Isaac

| What | Who | Why |
| --- | --- | --- |
| `gh auth refresh -h github.com -s workflow` | Isaac (interactive) | Unblocks ISA-133 (and vex-scope ISA-101) |
| Flip the repo to public | Isaac | GitHub Pages on a private repo needs a paid plan (ISA-110) |
| Confirm 4613R's LemLib version from `project.pros` | Isaac | Blocks ISA-120 |
| Field time on 4613R for three test motions | Isaac | Blocks ISA-130 |
