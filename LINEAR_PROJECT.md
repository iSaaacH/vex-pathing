# Linear — VEX Pathing

Mirror of the Linear project. Keep this in sync when issues move.

**Status as of 2026-08-11:** M0–M4 are built and the app runs. 18 of 28 issues are Done;
the open ones are listed with what is actually left. See `docs/SIM_FINDINGS.md` for what
the simulator port turned up.

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

| # | Title | Status |
| --- | --- | --- |
| ✅ ISA-107 | Scaffold Vite + Svelte 5 + TypeScript project | Done. Vite 6, Svelte 5 runes, strict TS, Vitest |
| ✅ ISA-108 | Port the VEX Live Tuning cream/paper design tokens | Done. Token-for-token in `src/styles/app.css` |
| ✅ ISA-109 | Three-pane app shell (routine / field / generated code) | Done, with the &lt;1000px / &lt;720px breakpoints |
| ⏳ ISA-110 | GitHub Pages branch deploy + base path | Code done (`base`, `npm run deploy`). **Blocked: repo must go public, then run deploy** |

## M1 — Field & coordinates

> Override render + sidecar JSON, field↔canvas transform in the LemLib frame,
> `FIELD_SIZE_IN` pinned against the game manual, pan/zoom, grid. **Done when clicking
> the field yields correct LemLib coordinates.**

| # | Title | Status |
| --- | --- | --- |
| ⏳ ISA-111 | Pin `FIELD_SIZE_IN` against the Override game manual | **High.** Still 144. Isolated in `config/field.ts`; nothing else inlines it, so it's a one-line fix |
| ⏳ ISA-112 | Produce the Override top-down field render from official CAD | Not started. Field is drawn procedurally, which unblocked everything as planned |
| ⏳ ISA-113 | Author `override-elements.json` collision geometry | Placeholder geometry in `config/overrideField.ts`; `ELEMENTS_VERIFIED = false` drives a UI banner |
| ✅ ISA-114 | Field ⇄ canvas transform in the LemLib frame | Done + tested. 0° = +Y, CW-positive |
| ✅ ISA-115 | Canvas pan / zoom / grid and live coordinate readout | Done. Cursor-anchored zoom, shift-snap |

## M2 — Document & editing

> The `Routine` model, segment list with per-kind inspectors, draggable waypoints,
> undo/redo, autosave. **Done when a 10-segment routine survives a page reload.**

| # | Title | Status |
| --- | --- | --- |
| ✅ ISA-116 | Routine document model and types | Done. Nine kinds, exactly LemLib's motions |
| ✅ ISA-117 | Segment list with per-kind inspectors | Done. Params behind a disclosure, markers inline |
| ✅ ISA-118 | Draggable waypoints and heading arms on the canvas | Done. Verified drag → list → code → undo in a headless browser |
| ⏳ ISA-119 | Undo/redo, autosave, and named routine storage | Undo/redo + autosave + `.vexpath` done. **IndexedDB named routines outstanding** |

## M3 — Code generation

> v0.5.6 emitter with param diffing, markers → `waitUntil`, chaining toggle, export
> dialog, `.txt` writer, `.vexpath` I/O. **Done when a generated routine compiles in a
> PROS project.**

| # | Title | Status |
| --- | --- | --- |
| ✅ ISA-120 | LemLib v0.5.6 emitter behind a pluggable emitter interface | Done. ⚠️ 4613R's actual LemLib version still unconfirmed |
| ✅ ISA-121 | Param diffing against LemLib struct defaults | Done + tested. Designated initialisers |
| ✅ ISA-122 | Event markers → `waitUntil()`, and the motion chaining toggle | Done. Chain toggle re-runs the sim live |
| ✅ ISA-123 | Pure-pursuit `.txt` path writer | Done. Test asserts the exact line shape |
| ⏳ ISA-124 | Export dialog, bundle zip, and `.vexpath` import/export | Dialog + all four exports done. **`.zip` bundle outstanding** |

## M4 — Simulation

> LemLib controller ports, sim runner, playback, onion layers, collision, timings.
> **Gated on the field validation (ISA-130).** Until that passes the UI says
> "predicted", not "simulated".

| # | Title | Status |
| --- | --- | --- |
| ✅ ISA-125 | Port LemLib's PID and exit conditions to TypeScript | Done + tested |
| ✅ ISA-126 | Port `moveToPoint`, `moveToPose`, turns and swings | Done. Three LemLib gotchas found — `docs/SIM_FINDINGS.md` |
| ✅ ISA-127 | Port pure pursuit and build the sim runner + drivetrain plant | Done. 10 ms ticks, first-order motor lag |
| ✅ ISA-128 | Settings importer: paste a `lemlib::Chassis` constructor | Done. Resolves `Omniwheel::` enums too |
| ✅ ISA-129 | Playback controls, onion layers, and collision detection | Done. SAT per tick, doesn't halt the sim |
| ⏳ ISA-130 | Field validation gate — predicted vs recorded under 2 in RMS | **Urgent, not started.** Needs field time on 4613R. UI says "predicted" until it passes |

## M5 — Polish

> Obstacles, mirroring, shortcuts, GIF, Actions deploy if unblocked, docs. **Done when
> 4613R designs a competition auton in it without asking how it works.**

| # | Title | Status |
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
