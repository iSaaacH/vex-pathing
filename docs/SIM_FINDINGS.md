# Simulator findings

What porting LemLib's motions to TypeScript actually turned up, written down while it
was fresh. Read this before touching `src/sim/`.

Everything below was verified against the **v0.5.6** tag of `LemLib/LemLib`, reading
`include/lemlib/chassis/chassis.hpp` and `src/lemlib/chassis/motions/*` rather than the
docs site — the published docs render Doxygen directives and do not include default
values.

---

## 1. Three LemLib behaviours that determine path shape

These are not incidental implementation details. Get any of them wrong and the preview
shows a path the robot will never drive.

### 1.1 The lateral error is a *signed projection*, not a distance

```
latErr = distance(pose, aimPoint) * cos(angleBetween(headingToAim, robotFacing))
```

The `cos` is what makes the error go negative once the robot has driven past its target,
which is what lets the motion back up and settle.

**This was the first real bug in this port.** `moveToPose` originally fed the raw
distance to the exit condition and used it as the lateral error. The robot could
therefore never produce a negative lateral command, so on overshoot it drove *away* from
the target, turned back, overshot again, and orbited until the timeout fired. It looked
plausible on the canvas — a nice arc that just never finished.

Symptom to watch for: a motion that reports `exit: timeout` while visually sitting near
its target.

### 1.2 Turning is prioritised over moving, by subtraction

```cpp
const float overturn = fabs(angularPower) + fabs(lateralPower) - 127;
if (overturn > 0) lateralPower -= lateralPower > 0 ? overturn : -overturn;
```

When the two controllers together ask for more than the motors can give, **the lateral
term yields and the angular term is untouched**. This is why a LemLib motion tucks into
its target instead of sailing past it.

Note this is *not* proportional desaturation. Scaling both terms by the same factor
preserves the arc; subtracting from only the lateral one tightens it. We do both, in
that order — `prioritiseTurning` first, then `desaturate` as a final clamp so no wheel
command exceeds 127.

### 1.3 `horizontalDrift` is a tuned fudge factor, not a physical quantity

```cpp
const float maxSlipSpeed = sqrt(horizontalDrift * radius * 9.8);
lateralPower = clamp(lateralPower, -maxSlipSpeed, maxSlipSpeed);
```

`radius` is in inches, `9.8` is in m/s², and the result is compared against a motor
command in the range −127…127. It is dimensionally meaningless. `horizontalDrift`
(typically 2–8) is simply the number a team tunes until the expression lands in a useful
range of motor units.

**This was the second real bug.** The first implementation "fixed" the units — converting
inches to metres, computing a genuine slip speed in in/s, then rescaling to motor units
against the drivetrain's max velocity. That produced a cap of about **8** instead of
about **29**, and the simulated robot crawled at 1.6 in/s for four seconds before
reaching its close radius and suddenly accelerating.

Do not make this expression dimensionally correct. Copy it.

---

## 2. Reverse driving

LemLib reasons about a *virtual pose* rotated 180° when `forwards = false`: every error
is computed as though driving forwards, and only the final wheel command is flipped.

A 180° flip does not change which way is clockwise, so **only the lateral term is
negated** — the angular term maps across unchanged:

```ts
const drive = forwards ? lateralPower : -lateralPower;
const [left, right] = desaturate(drive + angularPower, drive - angularPower, 127);
```

The first attempt instead clamped the lateral power with `Math.min(lateralPower, 0)`
when reversing, on the theory that reverse means negative. Combined with an error term
computed from the *adjusted* heading, that clamped every command to exactly zero and the
robot never moved at all. Covered now by the "reverses when forwards is false" test.

---

## 3. `AngularDirection` is worth simulating explicitly

Forcing a turn direction when the shortest path goes the other way is a real and
expensive mistake — 350° → 10° is +20° under `AUTO` and −340° under
`CCW_COUNTERCLOCKWISE`. In simulation that is the difference between roughly 0.35 s and
2.5 s, which at competition is most of a scoring cycle.

`directedError()` reproduces it, and there is a test asserting the forced direction takes
at least 1.5× as long. This is the kind of thing you cannot see by reading the numbers in
a routine, which is most of the argument for the simulator existing.

---

## 4. The pure-pursuit path format bites

From `getData()` in `src/lemlib/chassis/motions/pursuit.cpp`:

- The delimiter is the **two-character string `", "`** — comma *and* space. A file
  written with a bare comma fails to parse, and LemLib logs an error and silently
  abandons the path rather than throwing.
- Exactly three fields per line: `x, y, velocity`. Any other count aborts the read.
- Parsing stops at a line equal to `endData` (or `endData\r`).

There is a test asserting the exact line shape. Do not "tidy" the delimiter.

---

## 5. What this simulator does not model

Stated so nobody reads more into a green path than is there:

- **No wheel slip, no centre-of-mass transfer, no battery sag.** The plant is a
  differential-drive kinematic model at 10 ms with a first-order motor lag
  (τ ≈ 90 ms) and a voltage→velocity map from `rpm`/`wheelDiameter`.
- **Odometry is perfect.** Real tracking-wheel drift and IMU error are the single largest
  source of divergence on a long routine, and none of it is here.
- **Field elements are placeholder geometry** (`src/config/overrideField.ts`) — plausible
  and symmetric, but not yet checked against Appendix A of the game manual. Collision
  results are indicative. ISA-113.
- **`FIELD_SIZE_IN` is 144**, the foam-tile span. The perimeter interior may be ~140.5,
  which is enough to make a wall-hugging routine clip in reality and clear here. ISA-111.

The controllers are ported faithfully; the *world* they run in is approximate. That is
why the UI says **predicted**, not simulated, and will keep saying it until the on-field
comparison in ISA-130 passes.

---

## 6. Open question the port raised

`turnToPoint` recomputes its target heading every tick as the robot moves, so the PID is
re-aimed continuously while its internal state persists. That matches the intent, but the
implementation reaches into the inner `TurnToHeading` to overwrite `targetTheta` rather
than exposing a setter. It works and is tested, but it is the ugliest thing in
`motions.ts` and should get a proper interface if turns ever need more behaviour.
