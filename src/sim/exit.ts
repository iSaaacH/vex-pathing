/**
 * Port of lemlib::ExitCondition (src/lemlib/exitcondition.cpp @ v0.5.6).
 * PLAN.md §4.2.
 *
 * This is the state machine that decides when a motion ends, so it is what every
 * timing estimate in the app rests on. A motion exits when the error has stayed inside
 * `range` continuously for `timeout` milliseconds; leaving the range resets the clock.
 *
 * LemLib runs two of these per motion — a tight one (smallError/smallErrorTimeout) and
 * a loose one (largeError/largeErrorTimeout) — and exits when *either* fires. The loose
 * pair is what rescues a motion that settles just outside the tight band.
 */

export class ExitCondition {
  private startTime: number | null = null;
  private done = false;

  constructor(
    private readonly range: number,
    private readonly timeoutMs: number,
  ) {}

  /** @param error current error @param nowMs current sim clock in ms */
  update(error: number, nowMs: number): boolean {
    if (Math.abs(error) > this.range) {
      this.startTime = null;
    } else {
      if (this.startTime === null) this.startTime = nowMs;
      else if (nowMs - this.startTime > this.timeoutMs) this.done = true;
    }
    return this.done;
  }

  get settled(): boolean {
    return this.done;
  }

  reset(): void {
    this.startTime = null;
    this.done = false;
  }
}

/** The small/large pair LemLib builds from a ControllerSettings. */
export class ExitPair {
  private readonly small: ExitCondition;
  private readonly large: ExitCondition;

  constructor(smallError: number, smallTimeout: number, largeError: number, largeTimeout: number) {
    this.small = new ExitCondition(smallError, smallTimeout);
    this.large = new ExitCondition(largeError, largeTimeout);
  }

  update(error: number, nowMs: number): boolean {
    const a = this.small.update(error, nowMs);
    const b = this.large.update(error, nowMs);
    return a || b;
  }

  reset(): void {
    this.small.reset();
    this.large.reset();
  }
}
