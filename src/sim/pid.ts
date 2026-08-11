/**
 * Port of lemlib::PID (src/lemlib/pid.cpp @ v0.5.6). PLAN.md §4.2.
 *
 * Two behaviours matter and are easy to get wrong:
 *  - the integral only accumulates inside `windupRange` (0 disables the check), and
 *  - it resets outright when the error changes sign, which is what stops a LemLib
 *    motion from winding up through an overshoot.
 */

import type { ControllerSettings } from '../model/types';

export class PID {
  private integral = 0;
  private prevError = 0;

  constructor(
    private readonly kP: number,
    private readonly kI: number,
    private readonly kD: number,
    private readonly windupRange = 0,
    private readonly signFlipReset = true,
  ) {}

  static fromSettings(s: ControllerSettings): PID {
    return new PID(s.kP, s.kI, s.kD, s.windupRange, true);
  }

  update(error: number): number {
    this.integral += error;
    if (this.signFlipReset && Math.sign(error) !== Math.sign(this.prevError)) this.integral = 0;
    if (this.windupRange !== 0 && Math.abs(error) > this.windupRange) this.integral = 0;

    const derivative = error - this.prevError;
    this.prevError = error;

    return error * this.kP + this.integral * this.kI + derivative * this.kD;
  }

  reset(): void {
    this.integral = 0;
    this.prevError = 0;
  }
}
