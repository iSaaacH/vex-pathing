# VEX Pathing — Full Plan

A browser-based autonomous path planner and motion simulator for V5RC **Override**
(2026–27), speaking **LemLib**'s coordinate system and motion vocabulary, presented in
the Pedro Pathing Visualizer's interaction model and VEX Live Tuning's cream/paper
visual system, deployed as a static site on GitHub Pages.

> Status: **M0–M4 built and live** at <https://isaaach.github.io/vex-pathing/>.
> This document is the original research and design record; where the build diverged
> from it, the divergence is noted inline. See `docs/SIM_FINDINGS.md` for what porting
> LemLib actually turned up and `docs/FIELD_CALIBRATION.md` for the field image.

---

## 0. TL;DR

| Question | Answer |
| --- | --- |
| What is it? | A web app where you drag waypoints on the Override field and it produces a LemLib autonomous routine plus a simulated preview of what the robot will actually do |
| Who is it for? | 4613R (and anyone else running LemLib). Auton design moves off graph paper and out of "drive it, guess, re-flash" |
| Target library | **LemLib v0.5.6** (latest stable, 2025-06-18). The `master` v1.0 rewrite is *not* the target — see §3.6 |
| Coordinate system | LemLib native: origin at field **centre**, inches, **0° = +Y (up), clockwise-positive**. Range −72…+72 |
| Field | Override 2026–27. **Built:** a CC BY 4.0 orthographic render cropped to exactly the 144″ Floor, not a CAD import — see `docs/FIELD_CALIBRATION.md` |
| Interaction model | Pedro Pathing Visualizer: waypoint list ⇄ draggable canvas ⇄ live-generated code (§2) |
| Visual system | The VEX Live Tuning cream/paper palette, lifted token-for-token (§7) |
| Simulation | Actual TS ports of LemLib's PID, exit conditions, boomerang carrot and pure pursuit — not a spline animation (§4) |
| Output | Generated `autonomous()` C++, downloadable as a file; plus `.txt` pure-pursuit paths in LemLib's `x, y, velocity` / `endData` format (§8) |
| Explicitly **not** claimed | That generated code drops in and works. It is a tuned-on-robot starting point (§8.4) |
| Stack | Vite + TypeScript + Svelte 5, canvas 2D, zero backend |
| Hosting | GitHub Pages, **public repo**, branch-deploy (not Actions) — see the token blocker in §9 |

---

## 1. What this is, and the one honest caveat

The workflow today for a V5RC auton is: sketch on a field diagram, guess coordinates,
write `moveToPoint` calls, download, watch it miss, adjust a number, repeat. Every
iteration costs a field, a battery and three minutes.

VEX Pathing collapses the first four steps. You place the robot's start pose, drag
waypoints across a real Override field render, and the app both **tells you the
coordinates** and **shows you the motion LemLib would actually produce** for those
coordinates — including the boomerang overshoot, the turn direction it will pick, and
whether your `earlyExitRange` chain actually chains.

**The caveat, stated up front:** the generated C++ is a starting point, not a drop-in.
Simulated odometry is perfect; real odometry drifts. Simulated motors hit their
commanded voltage; real ones sag on a 30-second auton. What the tool removes is the
*geometry* guesswork — where the robot goes and roughly how — not the *tuning*. Every
generated routine still needs a pass on the real field. The UI says this, once, in the
export dialog, and then never nags again.

---

## 2. What we are copying — the Pedro Pathing Visualizer model

[Pedro Pathing](https://pedropathing.com) is an FTC path-following library whose
[web visualizer](https://visualizer.pedropathing.com/) is the best-in-class example of
this genre. Its source is public
([Pedro-Pathing/Visualizer](https://github.com/Pedro-Pathing/Visualizer), Svelte + Vite
+ Tailwind, deployed to Vercel), which makes the feature inventory a matter of reading
rather than guessing.

### 2.1 Feature inventory, taken from its component tree

| Component | What it does | Port? |
| --- | --- | --- |
| `StartingPointSection` | Sets the robot's initial pose (x, y, heading) | **Yes** — becomes `chassis.setPose()` |
| `PathLineSection` | The ordered list of segments; add / delete / reorder | **Yes** — the core of the app |
| `ControlPointsSection` | Numeric x/y editing of each Bézier control point | **Yes**, but only for pure-pursuit paths (§3.4) |
| `HeadingControls` | Per-segment heading interpolation (constant / linear / tangential) | **Reworked** — LemLib expresses heading through *motion choice*, not interpolation mode (§2.3) |
| `WaitRow` | Insert a timed wait between segments | **Yes** — `pros::delay()` |
| `EventMarkersSection` | Fire a subsystem action at a % along a segment | **Yes** — maps onto `chassis.waitUntil(dist)` (§3.3), which is a *better* fit than FTC's marker model |
| `ObstaclesSection` | Draw keep-out zones; path validity checking | **Yes** — Override's goals and toggles are pre-loaded as fixed obstacles (§5.4) |
| `PlaybackControls` | Play / pause / scrub the animation | **Yes** — but driven by the simulator, not by arc-length parameterisation |
| `RobotPositionDisplay` | Live pose readout as the animation runs | **Yes** |
| `ExportCodeDialog` | Generates the Java class | **Reworked** — C++ / LemLib (§8) |
| `SettingsDialog` | Robot dimensions, velocities, field image, theme | **Yes**, plus LemLib PID gains (§4.2) |
| Onion layers / ghost paths | Robot footprint stamped every N inches along the path | **Yes** — this is the single best feature it has, and it's how you catch a corner clip |
| GIF / APNG export | Shareable animation | **v2** — nice, not load-bearing |
| `FileManager` / `browserFileStore` | Save/load named paths in the browser | **Yes** (§6.4) |

### 2.2 The structural ideas worth stealing

1. **The list and the canvas are one object viewed twice.** Dragging a point on the
   canvas edits the number in the list; typing the number moves the point. There is no
   "apply" button. This is the whole reason the tool feels good, and it dictates the
   store design in §6.2.
2. **Code is generated continuously, not on demand.** The export panel is always
   showing the current routine. You learn the API by watching it change as you drag —
   which for a team half of whose members have not written a `moveToPose` call yet is
   the actual pedagogical value.
3. **Everything is a plain serialisable object.** Their `Point`/`Line`/`Shape` types
   are JSON all the way down, which is why save/load and undo/redo cost almost nothing.

### 2.3 What deliberately does not port

- **Heading interpolation modes.** Pedro follows a Bézier and *separately* interpolates
  heading along it (constant / linear / tangential). LemLib doesn't work that way: the
  heading behaviour is a property of *which motion you called*. `moveToPoint` faces the
  target the whole way; `moveToPose` arrives at a commanded heading; `turnToHeading` is
  its own segment. So the "heading" control in VEX Pathing is a **motion-type selector**
  per segment, and the heading fields it exposes change with the selection (§3.2).
  Getting this wrong would produce a tool that generates code LemLib can't express.
- **Their velocity/acceleration model.** Pedro's settings carry `xVelocity`,
  `yVelocity`, `kFriction`, `maxAcceleration` etc. because Pedro does trajectory
  generation. LemLib v0.5.6's lateral motions are **PID to a point**, not a profiled
  trajectory — there is no acceleration limit to configure. Our settings expose LemLib's
  actual knobs instead (§4.2). Importing Pedro's knob names would be cargo-culting.
- **FTC field size.** Their `FIELD_SIZE = 141.5`; ours is a V5RC constant (§5.3).
- **Vercel.** GitHub Pages, per the brief (§9).

---

## 3. LemLib research — the API we are generating for

Verified against the **v0.5.6** tag of
[LemLib/LemLib](https://github.com/LemLib/LemLib), reading
`include/lemlib/chassis/chassis.hpp` and `src/lemlib/chassis/motions/*` directly rather
than the docs site, because the docs render Doxygen directives that don't include
default values.

### 3.1 Coordinate system

> The origin of the field is in the middle, and the field coordinates are measured in
> inches. 0 degrees is facing up, and increases clockwise.
> — [LemLib tutorial 4](https://lemlib.readthedocs.io/en/master/tutorials/5_angular_motion.html)

| Thing | LemLib convention |
| --- | --- |
| Origin | Field centre |
| Units | Inches |
| +X | Toward the right wall |
| +Y | Up-field |
| Heading 0° | **+Y (up)** |
| Heading sign | **Clockwise-positive** |
| Range | −72 … +72 on both axes (§5.3) |

⚠️ **This differs from `vex-scope`.** That project's `PLAN.md` §5.4 fixes heading
0° = +x, CCW-positive (the maths convention). VEX Pathing uses LemLib's compass
convention because it is generating LemLib code and any translation layer is a bug
farm. If the two projects ever share a field renderer, the conversion is
`θ_lemlib = 90 − θ_scope (mod 360)` and it must live in exactly one named function.
This is logged as an open question in §12.

### 3.2 The motion catalogue — exact signatures

These are the segment types the app can emit. Signatures copied verbatim from
`chassis.hpp` @ v0.5.6.

```cpp
void setPose(float x, float y, float theta, bool radians = false);

void moveToPoint(float x, float y, int timeout,
                 MoveToPointParams params = {}, bool async = true);

void moveToPose(float x, float y, float theta, int timeout,
                MoveToPoseParams params = {}, bool async = true);

void turnToHeading(float theta, int timeout,
                   TurnToHeadingParams params = {}, bool async = true);

void turnToPoint(float x, float y, int timeout,
                 TurnToPointParams params = {}, bool async = true);

void swingToHeading(float theta, DriveSide lockedSide, int timeout,
                    SwingToHeadingParams params = {}, bool async = true);

void swingToPoint(float x, float y, DriveSide lockedSide, int timeout,
                  SwingToPointParams params = {}, bool async = true);

void follow(const asset& path, float lookahead, int timeout,
            bool forwards = true, bool async = true);

void waitUntil(float dist);
void waitUntilDone();
void cancelMotion();
void cancelAllMotions();
bool isInMotion() const;
```

Params structs, with **defaults** — these are what the UI's per-segment inspector
exposes, and what code generation omits when unchanged:

```cpp
struct MoveToPointParams {
    bool  forwards       = true;
    float maxSpeed       = 127;
    float minSpeed       = 0;
    float earlyExitRange = 0;
};

struct MoveToPoseParams {
    bool  forwards        = true;
    float horizontalDrift = 0;    // overrides the drivetrain's value for this motion
    float lead            = 0.6;  // carrot multiplier, 0–1. Higher = curvier
    float maxSpeed        = 127;
    float minSpeed        = 0;
    float earlyExitRange  = 0;
};

struct TurnToHeadingParams {
    AngularDirection direction = AngularDirection::AUTO;
    int   maxSpeed       = 127;
    int   minSpeed       = 0;
    float earlyExitRange = 0;
};

struct TurnToPointParams {
    bool  forwards = true;
    AngularDirection direction = AngularDirection::AUTO;
    int   maxSpeed       = 127;
    int   minSpeed       = 0;
    float earlyExitRange = 0;
};

// SwingToHeadingParams / SwingToPointParams mirror the Turn variants,
// with float maxSpeed/minSpeed instead of int.

enum class AngularDirection { CW_CLOCKWISE, CCW_COUNTERCLOCKWISE, AUTO };
enum class DriveSide        { LEFT, RIGHT };
```

`AngularDirection::AUTO` picking the shortest turn is worth simulating explicitly — a
turn from 350° to 10° going the "wrong" way because the user forced a direction is a
classic 2-second auton loss, and the sim will show it.

### 3.3 Motion chaining — the thing the tool should make obvious

Every motion is `async = true` by default and returns immediately. Sequencing comes from:

- `chassis.waitUntilDone()` — block until this motion's exit conditions fire.
- `chassis.waitUntil(dist)` — block until `dist` inches (or degrees, for turns) of the
  motion have elapsed. **This is the event-marker mechanism.** A Pedro-style "fire the
  intake at 60% along this segment" becomes `chassis.waitUntil(0.6 * segmentLength);
  intake.move(127);`, which is exactly what the generator emits.
- `minSpeed` + `earlyExitRange` — the motion exits early and *at speed*, so the next
  motion picks up without stopping. This is how a fast auton is built, and it is
  invisible on paper: you cannot tell by looking at numbers whether your exit ranges
  chain smoothly or produce a stutter. The simulator can.

The generator's default is a `waitUntilDone()` after each segment (correct, slow), with
a per-segment "chain into next" toggle that switches to `minSpeed`/`earlyExitRange` and
drops the wait. The sim re-runs on toggle so the difference is immediately visible.

### 3.4 `follow()` and the path file format

`follow()` is LemLib's pure pursuit, and it does *not* take coordinates inline — it
takes an `asset`, a `.txt` file baked into the binary via the `ASSET()` macro from a
`static/` directory. Format, confirmed by reading `getData()` in
`src/lemlib/chassis/motions/pursuit.cpp`:

- One point per line, fields separated by the literal two-character delimiter `", "`
  (comma **and space** — a bare comma fails to parse).
- Exactly three fields: `x, y, velocity`.
- Parsing stops at a line equal to `endData` (or `endData\r`).
- A line with anything other than 3 fields logs an error and aborts the read.

```
-24.000, -48.000, 60.000
-20.412, -41.336, 62.500
...
endData
```

So a "pure pursuit" segment in VEX Pathing produces **two** artefacts: a `.txt` for
`static/`, and the `ASSET(myPath_txt);` + `chassis.follow(myPath_txt, 10, 4000);` lines
in the routine. The export dialog offers both as a zip. Bézier control-point editing
(the `ControlPointsSection` port) only applies to this segment type — for PID motions
there is no curve to shape, only a target.

### 3.5 What LemLib does *not* give us

- **No trajectory / velocity profile.** `moveToPoint` is PID on distance and heading.
  There is no "max acceleration" to respect, and the path shape is an emergent property
  of the two controllers fighting, not a designed curve. The simulator has to model the
  controllers to get the shape right — see §4.
- **No holonomic support.** Fine; 4613R is a tank drive.
- **No native "path" object.** A routine is a list of calls, full stop. Our document
  model must not invent an abstraction LemLib cannot round-trip.
- **`horizontalDrift`** is a drivetrain-level tuned constant (how much the chassis
  slides sideways) that `moveToPose` can override per-motion. It has a real effect on
  simulated arc shape and must be in settings.

### 3.6 Version targeting — v0.5.6, not `master`

LemLib's `master` branch is a substantial v1.0 rewrite: the `Chassis` class is gone,
motions live as free functions in `include/lemlib/motions/{moveToPoint,moveToPose,turnTo,follow}.hpp`,
and there is a new hardware abstraction layer (`include/hardware/`). It is unreleased —
the latest tagged release is **v0.5.6 (2025-06-18)**.

**Decision: generate v0.5.6 syntax.** It is what teams are running today. But the code
generator is built as a pluggable **emitter** behind a stable internal document model
(§6.3) from day one, so a `v1` emitter is a new file, not a rewrite. This costs perhaps
half a day now and saves the project when v1.0 lands mid-season.

---

## 4. The simulator — how honest can it be?

This is the part that separates a path *drawer* from a path *planner*, and it is where
most of the engineering risk lives.

### 4.1 The rejected approach

The easy version animates the robot along a spline between waypoints at constant speed.
It looks fine and is worthless: it shows a path LemLib will never drive. `moveToPoint`
does not drive straight to its target — it turns while translating, producing a curved
approach whose shape depends entirely on the ratio of the lateral and angular PID gains.

### 4.2 The chosen approach — port the controllers

Reimplement, in TypeScript, the pieces of LemLib that determine motion shape:

| LemLib source | TS port | Why it matters |
| --- | --- | --- |
| `src/lemlib/pid.cpp` | `sim/pid.ts` | ~40 lines. Anti-windup range, sign-flip integral reset |
| `src/lemlib/exitcondition.cpp` | `sim/exit.ts` | The small/large error + timeout state machine that decides when a motion ends. Directly determines how long each segment takes |
| `motions/moveToPoint.cpp` | `sim/moveToPoint.ts` | Lateral + angular PID, `forwards`, speed clamping, desaturation |
| `motions/moveToPose.cpp` | `sim/moveToPose.ts` | The boomerang carrot point (`lead`), `horizontalDrift` |
| `motions/turnToHeading.cpp` etc. | `sim/turns.ts` | `AngularDirection` resolution, swing kinematics with one side locked |
| `motions/pursuit.cpp` | `sim/pursuit.ts` | Lookahead intersection, curvature → wheel speeds |
| `src/lemlib/util.cpp` | `sim/util.ts` | `angleError`, `sanitizeAngle`, `slew`, `respectSpeed` |

Fed by the user's actual `ControllerSettings` (kP, kI, kD, windupRange, smallError,
smallErrorTimeout, largeError, largeErrorTimeout, slew) for both the lateral and angular
controllers, plus `Drivetrain` (trackWidth, wheelDiameter, rpm, horizontalDrift) — the
same numbers that are already in their `main.cpp`. **A settings importer that pastes in
a `lemlib::Chassis chassis(...)` constructor block and parses the values out** is a
small parser and removes the single biggest source of "the sim doesn't match the robot".

The plant is a differential-drive kinematic model at LemLib's own 10 ms loop rate, with
a first-order motor lag and a voltage→velocity map from `rpm`/`wheelDiameter`. Not a
full dynamics model — no slip, no CoM transfer. That's the honest boundary.

### 4.3 Validation

The sim is not trustworthy until it is checked against reality. The plan:

1. **Unit**: port LemLib's own behaviour on synthetic cases; assert exit conditions fire
   at the same iteration count as a hand-traced C++ run.
2. **Field**: run three known motions on 4613R (a straight `moveToPoint`, a
   `moveToPose` with `lead = 0.6`, a chained pair with `earlyExitRange`), log real
   odometry via the existing **VEX Live Tuning** telemetry stream, and overlay the
   recorded trace on the simulated one in the app. Target: **< 2 in RMS** positional
   error over a 48-inch motion.
3. That overlay is a shipped feature, not just a test — "import a `.vslog` and compare"
   ties this repo to `vex-scope` and makes tuning visible.

Milestone M4 owns this. Until it passes, the UI labels the preview **"predicted"**, not
"simulated".

---

## 5. The Override field

### 5.1 Source of truth

VEX publishes official Override field CAD (STEP) at
`link.vex.com/docs/26-27/v5rc/field-cad`, and the
[game manual](https://content.vexrobotics.com/docs/2026-2027/override/files/v5rc-override-1.0.pdf)
Appendix A carries dimensioned drawings of every element. The field contains nine Goals
(four neutral Short Goals, one neutral Tall Goal, two Red and two Blue Alliance Goals),
four Toggles at the centre of each field wall, and four Loaders adjacent to the alliance
stations, plus 56 Cups and 63 Pins as scoring objects.

### 5.2 Rendering pipeline — 2D, not 3D

`vex-scope` needs a `.glb` for its 3D field tab. VEX Pathing needs a **top-down raster**,
which is a much cheaper ask and renders instantly at any zoom if done right:

1. Import the STEP into Blender (CAD add-on) or FreeCAD.
2. Orthographic camera straight down, framed exactly to the field interior.
3. Render at **2048 × 2048**, export `override.webp` (Pedro uses `.webp` for the same
   reason: a third the size of PNG at visually identical quality).
4. Commit to `public/fields/override.webp` with a sidecar
   `override.json` giving `{ "name", "fieldSize", "originPx", "pxPerInch" }` so the
   renderer never hardcodes pixel offsets.
5. Separately, hand-author `override-elements.json`: the *collision* geometry (§5.4) as
   circles and rectangles in field inches. This is authored from the manual's Appendix A
   dimensions, not traced from the render, so it is correct rather than approximately
   correct.

Custom field upload (Pedro's `custom` option) stays, so a practice-field layout or next
season's game works without a release.

### 5.3 Field size — verify, don't assume

Six 24-inch foam tiles per side gives 144 in, and LemLib's −72…+72 convention assumes
that. But the *field perimeter interior* is smaller than the tile span, and V5RC
perimeter interiors have historically been ≈140.5 in. The difference is 1.75 in per
wall — enough to make a wall-hugging auton clip in reality and clear in sim.

**Action:** `FIELD_SIZE_IN` is a single named constant in `src/config/field.ts`,
defaulting to 144 (LemLib's assumption) with a settings override, and M1 includes a task
to read Appendix A of the Override manual and pin the real interior number with a source
comment. Do not guess this in code.

### 5.4 Obstacles and collision

Goals, Toggles and Loaders are static and are pre-loaded as keep-out shapes from
`override-elements.json`. The robot is a rectangle (`rWidth` × `rHeight`, default 15 ×
15 in for an 18-inch-class bot after bumper allowance, user-configurable) swept along the
simulated pose trace.

Collision check is per-simulation-tick SAT (rect vs rect / rect vs circle) — cheap
enough at 10 ms ticks over a 15-second auton (1500 checks × ~20 shapes). A hit paints the
offending segment red in the list and stamps the colliding footprint on the canvas. It
does **not** stop the sim; you want to see how badly you clipped.

The onion-layer render (robot footprint every N inches) is the same data, and is the
feature that actually catches near-misses that SAT calls clear.

---

## 6. Architecture

### 6.1 Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Build | **Vite 6** | Same as VEX-Live-Tuning and vex-scope. Static output, trivial Pages base-path config |
| Language | **TypeScript**, strict | The document model and the emitters are the whole product; types are load-bearing |
| UI | **Svelte 5** (runes) | What Pedro's visualizer uses, and the fine-grained reactivity is exactly right for "drag a point, 40 numbers update". Vanilla TS (the VEX-Live-Tuning choice) would mean hand-writing that graph |
| Canvas | **2D context**, no library | Field + paths + robot at 60 fps is well within raw canvas. No three.js — this is not vex-scope |
| Styling | **Plain CSS** with the VEX-Live-Tuning token block | Pedro uses Tailwind; we are matching an existing house style instead (§7) |
| State | Svelte stores + a plain-object document | Serialisable end to end (§6.4) |
| Backend | **None** | Static site, hard requirement |
| Tests | **Vitest** | The simulator ports need real unit tests (§4.3) |

### 6.2 The document model

One plain, versioned, JSON-serialisable object. Everything else is a view of it.

```ts
type Routine = {
  schemaVersion: 1;
  name: string;
  alliance: "red" | "blue";
  start: Pose;                    // → chassis.setPose(...)
  segments: Segment[];
  settings: RobotSettings;        // drivetrain + both ControllerSettings
};

type Pose = { x: number; y: number; theta: number };  // inches, degrees, LemLib frame

type Segment =
  | { kind: "moveToPoint";   id: Id; target: Vec2;          timeout: Ms; params: MoveToPointParams;   markers: Marker[]; chain: Chain }
  | { kind: "moveToPose";    id: Id; target: Pose;          timeout: Ms; params: MoveToPoseParams;    markers: Marker[]; chain: Chain }
  | { kind: "turnToHeading"; id: Id; theta: number;         timeout: Ms; params: TurnToHeadingParams; markers: Marker[]; chain: Chain }
  | { kind: "turnToPoint";   id: Id; target: Vec2;          timeout: Ms; params: TurnToPointParams;   markers: Marker[]; chain: Chain }
  | { kind: "swingToHeading";id: Id; theta: number;  side: DriveSide; timeout: Ms; params: SwingToHeadingParams; markers: Marker[]; chain: Chain }
  | { kind: "swingToPoint";  id: Id; target: Vec2;   side: DriveSide; timeout: Ms; params: SwingToPointParams;   markers: Marker[]; chain: Chain }
  | { kind: "follow";        id: Id; controlPoints: Vec2[]; lookahead: number; timeout: Ms; forwards: boolean; markers: Marker[]; chain: Chain }
  | { kind: "wait";          id: Id; ms: Ms }
  | { kind: "action";        id: Id; code: string };   // raw C++ escape hatch

type Marker = { id: Id; atInches: number; code: string };   // → chassis.waitUntil(d); <code>
type Chain  = { mode: "blocking" } | { mode: "chained"; minSpeed: number; earlyExitRange: number };
```

Three constraints this encodes deliberately:

- **The segment kinds are exactly LemLib's motions.** No invented "arc" or "spline"
  primitive that has no call to emit.
- **`params` mirrors the C++ structs field-for-field**, so codegen is a diff against
  defaults, not a translation.
- **`action` exists** because every real auton has an intake or a clamp in it, and a tool
  that can't express `clamp.set_value(true)` gets abandoned in week two.

### 6.3 Module layout

```
vex-pathing/
├─ PLAN.md
├─ LINEAR_PROJECT.md
├─ README.md
├─ public/
│  ├─ fields/override.webp
│  ├─ fields/override.json
│  └─ fields/override-elements.json
├─ src/
│  ├─ main.ts
│  ├─ App.svelte
│  ├─ config/
│  │  ├─ field.ts            # FIELD_SIZE_IN and friends (§5.3)
│  │  └─ defaults.ts         # default RobotSettings, LemLib param defaults
│  ├─ model/
│  │  ├─ types.ts            # §6.2
│  │  ├─ routine.ts          # constructors, validation, migration by schemaVersion
│  │  └─ geometry.ts         # field ⇄ canvas transforms, angle conversions
│  ├─ sim/                   # §4.2 — the LemLib ports
│  │  ├─ pid.ts  exit.ts  util.ts  drivetrain.ts
│  │  ├─ moveToPoint.ts  moveToPose.ts  turns.ts  pursuit.ts
│  │  └─ run.ts              # Routine → SimTrace (poses @10ms, per-segment timing)
│  ├─ emit/
│  │  ├─ index.ts            # emitter registry
│  │  ├─ lemlib-0.5.ts       # the v0.5.6 emitter (§8)
│  │  └─ pursuit-txt.ts      # the "x, y, velocity" / endData writer (§3.4)
│  ├─ render/
│  │  ├─ field.ts  paths.ts  robot.ts  onion.ts  collision.ts
│  ├─ stores/
│  │  ├─ routine.ts  selection.ts  history.ts  settings.ts
│  ├─ lib/                   # Svelte components, mirroring §2.1
│  └─ styles/app.css         # §7
└─ tests/
```

### 6.4 Persistence

- **Autosave** the working `Routine` to `localStorage` on every mutation (debounced).
  Closing the tab must never lose work.
- **Named routines** in IndexedDB, listed in a file manager panel.
- **Import / export `.vexpath`** — the `Routine` JSON, pretty-printed, with
  `schemaVersion`. This is the format that gets committed into the team's robot-code
  repo next to the generated `.cpp`, so a routine is reviewable in a diff.
- **Undo/redo** as a bounded stack of whole-document snapshots. The document is small
  (a 20-segment routine is a few KB); structural sharing is not worth the complexity.

---

## 7. UI — the cream/paper system

The brief: "VEX tuning, white creamy style". That system already exists in
`iSaaacH/VEX-Live-Tuning` at `web/src/styles/app.css`. It is lifted **token-for-token**,
not re-derived, so the two apps are visibly one family:

```css
:root {
  font-family: Inter, Aptos, "Segoe UI", system-ui, sans-serif;
  color: #292d29;
  background: #f7f3eb;
  --cream: #f7f3eb;  --paper: #fffdfa;  --ink: #292d29;
  --muted: #787a73;  --line:  #e5dfd3;
  --green: #3f6b5b;  --green-soft: #dfe9e3;  --orange: #bd6b3d;
}
body { background: radial-gradient(circle at 72% -10%, #fff 0, transparent 34%), var(--cream); }
```

Carried across with it: 17 px panel radii, `1px solid var(--line)` borders,
`0 12px 34px rgba(69,57,42,.045)` shadows, the translucent `rgba(255,253,250,.82)` panel
fill, `"Cascadia Mono"` for every number, uppercase 9 px letterspaced section headings,
and the pill/chip and toggle-switch components verbatim.

### 7.1 Layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [VP] VEX Pathing · Override 26-27      12 segments · 11.4 s   [Sim][Export]│  topbar 72px
├──────────────┬───────────────────────────────────────┬───────────────────┤
│ ROUTINE      │                                       │ GENERATED         │
│              │                                       │                   │
│ ▸ Start      │           ┌───────────────┐           │  void autonomous()│
│   (−58, −12, │           │               │           │  {                │
│    90°)      │           │   Override    │           │    chassis.set…   │
│              │           │   field       │           │    chassis.move…  │
│ ▾ 1 moveTo…  │           │   render      │           │    …              │
│   x  −24.0   │           │   + paths     │           │  }                │
│   y   36.0   │           │   + robot     │           │                   │
│   ⏱ 2000 ms  │           │   + onion     │           │  [Copy] [Download]│
│   ⚙ params   │           │               │           │                   │
│   ⚑ markers  │           └───────────────┘           │ ─────────────────  │
│              │   ◀◀  ▶  ▶▶   ──────●────── 4.2 / 11.4s│ POSE              │
│ ▾ 2 turnTo…  │                                       │ x −24.0  y 36.0   │
│              │                                       │ θ 137.4°  v 41 ips│
│ [+ Segment ▾]│                                       │                   │
└──────────────┴───────────────────────────────────────┴───────────────────┘
   292px            flex, square-locked field              360px
```

- **Left**: the routine as an ordered accordion. Each segment collapses to
  `kind + target`; expanded it shows the fields for that segment kind and nothing else —
  a `turnToHeading` never shows an x/y box. Drag to reorder. This is the
  `PathLineSection` port.
- **Centre**: the field, aspect-locked square, with playback scrub beneath it. Pan/zoom.
  Waypoints are draggable handles; the selected segment's handle gets a heading arm you
  can rotate. Shift-drag snaps to a 0.5 in grid, and to tile lines.
- **Right**: continuously-regenerated C++ with the current segment's lines highlighted —
  hover a line, the corresponding waypoint pulses on the canvas. Under it, the live pose
  readout during playback.
- **Below 1000 px**: right panel collapses to a tab beside the field, per the same
  breakpoints VEX-Live-Tuning already uses. Below 720 px it is a read-only viewer —
  dragging waypoints on a phone is not a use case worth designing for.

### 7.2 Colour semantics

Paths are drawn in the accent palette by segment kind — `--green` for lateral motions,
`--orange` for turns, muted grey for waits, red (`#b85349`) for a segment whose
simulation collides or times out. Alliance colour tints the field overlay only, never the
path, so a red routine and a blue routine are legible in the same screenshot.

---

## 8. Code generation

### 8.1 Shape of the output

```cpp
// Generated by VEX Pathing — Override 2026-27
// Routine: "red-left-4ring"  ·  LemLib v0.5.6  ·  est. 11.4 s
// This is a starting point. Tune on the field.

ASSET(redLeftArc_txt);          // only if a follow() segment exists

void autonomous() {
    chassis.setPose(-58, -12, 90);

    chassis.moveToPoint(-24, 36, 2000, {.minSpeed = 40, .earlyExitRange = 4});
    chassis.waitUntil(18);
    intake.move(127);

    chassis.turnToHeading(180, 900, {.direction = AngularDirection::CW_CLOCKWISE});
    chassis.waitUntilDone();

    chassis.moveToPose(12, 48, 90, 2500, {.forwards = false, .lead = 0.4});
    chassis.waitUntilDone();

    pros::delay(250);
    clamp.set_value(true);

    chassis.follow(redLeftArc_txt, 10, 3000);
    chassis.waitUntilDone();
}
```

Rules the emitter follows:

- **Only non-default params are emitted.** Designated initialisers (`{.lead = 0.4}`)
  keep it readable and are valid in the C++20 PROS toolchain LemLib targets.
- **`waitUntilDone()` after every blocking segment**, omitted where the segment is
  chained. Never silently rely on the next call blocking.
- **Markers emit as `waitUntil(d)` + the user's code**, in inches along the segment,
  converted from the marker's stored position.
- **Comments carry the estimate** (per-segment and total) from the simulator, so the
  routine in the repo records what it was predicted to take. When the real run takes 14 s
  against a predicted 11.4 s, that delta is a tuning signal.
- Emitted numbers are rounded to 2 dp. Nobody needs `-23.999996`.

### 8.2 Export bundle

The export dialog offers, mirroring VEX-Live-Tuning's `export-option` card layout:

| Option | Contents |
| --- | --- |
| **Copy to clipboard** | The `autonomous()` body |
| **Download `.cpp`** | The above with a header comment block |
| **Download bundle (`.zip`)** | `autonomous.cpp` + `static/*.txt` for every `follow()` segment + the `.vexpath` source |
| **Download `.vexpath`** | Just the document, for re-editing or committing |

### 8.3 The pure-pursuit `.txt` writer

Per §3.4: sample the Bézier at a fixed arc-length spacing (2 in default), emit
`x, y, velocity` with the two-character `", "` delimiter, terminate with `endData`. The
velocity column is filled from a simple curvature-based taper (slower through tight
curvature, capped at the user's max) — LemLib's pure pursuit uses it as a speed cap, so a
constant column works but wastes time on straights.

### 8.4 The honesty line

The export dialog carries one sentence, in `--muted`, not a modal:

> Simulated with perfect odometry. Verify on the field before you trust the timings.

That is the entirety of the caveat UI. It is stated once and does not repeat.

---

## 9. Hosting on GitHub Pages — and the token blocker

**Repo must be public before M0's deploy task.** GitHub Pages on a private repository
requires a paid plan; every other repo in this workspace is private, so this is a
deliberate exception. A path planner contains no competitive information — routines live
in the user's browser and in their own robot repo, not in this one. If the account later
has Pro, it can be flipped back with no code change.

The repo is **created private**, matching the workspace default, because nothing is
deployed yet. Flipping it is one command and is Isaac's call:

```
gh repo edit iSaaacH/vex-pathing --visibility public --accept-visibility-change-consequences
```

**⚠️ The `gh` token cannot push workflow files.** The `iSaaacH` OAuth token has scopes
`gist`, `read:org`, `repo` — **not `workflow`**. Any push that creates
`.github/workflows/*` is rejected outright. This has already bitten `vex-scope`
(ISA-101). Two ways forward:

1. **Branch deploy (chosen default).** Pages set to "Deploy from a branch" →
   `gh-pages` / root. Publishing is `npm run deploy`, which is the `gh-pages` npm package
   pushing `dist/` to that branch. **No workflow file, so no scope problem**, and it
   works today with zero setup from Isaac.
2. **Actions deploy** (`actions/deploy-pages`), which is tidier and gives
   deploy-on-merge, but requires Isaac to run, interactively:
   ```
   gh auth refresh -h github.com -s workflow
   ```

M0 ships option 1. A task in M5 upgrades to option 2 *if* the token gets refreshed —
tracked, not assumed.

**Vite config**: `base: '/vex-pathing/'` for a project-pages URL
(`https://isaaach.github.io/vex-pathing/`). All asset references must go through Vite's
import graph or `import.meta.env.BASE_URL`; a hardcoded `/fields/override.webp` will 404
in production and work locally, which is the classic way to lose an afternoon. A 404.html
copy of index.html handles deep links if routing is ever added.

---

## 10. Risks

| # | Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| 1 | Simulated motion doesn't match the real robot, so the tool is decorative | Medium | **High** | §4.3 validation gate; label output "predicted" until the < 2 in RMS check passes; ship the `.vslog` overlay so the gap is always visible rather than hidden |
| 2 | Field CAD → clean top-down render is fiddlier than expected (STEP import, materials) | Medium | Medium | The render is decoration; collision geometry comes from manual dimensions (§5.2 step 5). A hand-drawn placeholder field unblocks all of M1–M3 |
| 3 | LemLib v1.0 releases mid-season and the team migrates | Medium | Medium | Pluggable emitter from day one (§3.6). Document model is version-agnostic |
| 4 | `FIELD_SIZE` / perimeter interior guessed wrong; every coordinate is subtly off | Medium | **High** | §5.3 — one named constant, pinned against Appendix A in M1 with a source comment, never inlined |
| 5 | Pages deploy blocked by the workflow-scope token | **High** (already true) | Low | Branch deploy, no workflow file (§9) |
| 6 | Scope creep into "AdvantageScope but for paths" | High | Medium | This repo does not do telemetry, 3D, or log viewing. That is `vex-scope`. The only link between them is the `.vslog` import in §4.3 |
| 7 | Heading-convention mismatch with vex-scope leaks into shared code | Low | Medium | §3.1 — one named conversion function, tested, or no sharing at all |
| 8 | Canvas performance with onion layers on a long routine | Low | Low | Onion layers render to an offscreen canvas once per sim, not per frame |

---

## 11. Build order → Linear milestones

| Milestone | Goal | Done when |
| --- | --- | --- |
| **M0 — Foundation** | Repo, Vite + Svelte + TS, cream design tokens, empty three-pane shell, `gh-pages` deploy live | The URL loads and shows the shell |
| **M1 — Field & coordinates** | Override render + `override.json`, field↔canvas transform, LemLib frame, `FIELD_SIZE_IN` pinned against the manual, pan/zoom, grid | Click the field, get correct LemLib coordinates in the readout |
| **M2 — Document & editing** | `Routine` model, segment list, draggable waypoints, per-kind inspectors, undo/redo, autosave | Build a 10-segment routine, reload the page, it's still there |
| **M3 — Code generation** | v0.5.6 emitter, param diffing, markers → `waitUntil`, chaining toggle, export dialog, `.txt` writer, `.vexpath` I/O | Paste a generated routine into a PROS project; it compiles |
| **M4 — Simulation** | LemLib controller ports, sim runner, playback + scrub, onion layers, collision, timing estimates, **the §4.3 field validation** | Predicted vs recorded overlay is under 2 in RMS on the three test motions |
| **M5 — Polish** | Obstacles UI, alliance mirroring, keyboard shortcuts, GIF export, Actions deploy (if token refreshed), README + docs | 4613R designs a competition auton in it without asking how it works |

Milestones are sequential; M4 is the largest and highest-risk and deliberately follows a
useful-without-it M3 — after M3 the tool is already a coordinate calculator with codegen,
which is most of the day-to-day value.

---

## 12. Open questions

1. **Field interior dimension.** 144 in (tile span) or ≈140.5 in (perimeter interior)?
   Resolve in M1 from Appendix A and pin it. *(Risk 4.)*
2. **Heading convention vs `vex-scope`.** Do the two projects ever share a renderer? If
   yes, where does the conversion live? Decide before M1 ships, or accept duplication.
3. **Which LemLib version is 4613R actually on right now?** The plan assumes v0.5.6.
   Confirm from the team's `project.pros` before writing the emitter in M3.
4. **Does the team want alliance mirroring** (design red, auto-generate blue)? It is
   cheap for symmetric fields; Override's symmetry needs checking against the manual
   first. Currently M5.
5. **Robot footprint** — actual 4613R dimensions with bumpers, and is the tracking centre
   the geometric centre? The sim's pose is the tracking centre; the drawn rectangle is
   the chassis. If they differ, every collision result is off by that offset.
6. **`.vslog` import (§4.3)** — does the format from `vex-scope` PLAN.md §6 exist yet, or
   does M4 need to define an interim CSV? Check before M4 starts.
7. **Repo visibility.** This plan assumes public for Pages. Confirm that's acceptable.

---

## Sources

- LemLib v0.5.6 source — [`include/lemlib/chassis/chassis.hpp`](https://github.com/LemLib/LemLib/blob/v0.5.6/include/lemlib/chassis/chassis.hpp) (signatures, params structs, enums), [`src/lemlib/chassis/motions/pursuit.cpp`](https://github.com/LemLib/LemLib/blob/v0.5.6/src/lemlib/chassis/motions/pursuit.cpp) (path file format)
- [LemLib releases](https://github.com/LemLib/LemLib/releases) — v0.5.6, 2025-06-18, latest stable
- [LemLib documentation](https://lemlib.readthedocs.io/en/stable/) — [lateral motion](https://lemlib.readthedocs.io/en/stable/tutorials/6_lateral_motion.html), [angular motion](https://lemlib.readthedocs.io/en/master/tutorials/5_angular_motion.html), [motion chaining](https://lemlib.readthedocs.io/en/stable/tutorials/8_motion_chaining.html)
- [Pedro Pathing Visualizer](https://visualizer.pedropathing.com/) and its [source](https://github.com/Pedro-Pathing/Visualizer) — feature inventory, component structure, defaults
- [Pedro Pathing docs — Bézier curves](https://pedropathing.com/docs/pathing/reference/beziercurves)
- [V5RC Override Game Manual](https://content.vexrobotics.com/docs/2026-2027/override/files/v5rc-override-1.0.pdf) — Appendix A field/element dimensions
- Override field CAD — `link.vex.com/docs/26-27/v5rc/field-cad`
- [V5RC Override overview](https://www.vexrobotics.com/v5/competition/vrc-current-game)
- `iSaaacH/VEX-Live-Tuning` — `web/src/styles/app.css` (design tokens), `PLAN.md` (house style)
- `iSaaacH/vex-scope` — `PLAN.md` §5 (field asset pipeline, coordinate conventions), §6 (`.vslog`)
- [GitHub Pages: publishing sources](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
