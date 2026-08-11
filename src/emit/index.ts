/**
 * Emitter registry. PLAN.md §3.6.
 *
 * The document model is version-agnostic; each emitter turns it into the syntax of one
 * LemLib release. v0.5.6 is the only one today — `master` is an unreleased v1.0 rewrite
 * with a completely different surface (no `Chassis` class, motions as free functions in
 * `include/lemlib/motions/`), and when it ships it plugs in here.
 */

import type { Routine, SimTrace } from '../model/types';
import { emit as emitLemlib05, type EmitResult } from './lemlib05';

export type EmitterId = 'lemlib-0.5';

export type Emitter = {
  id: EmitterId;
  label: string;
  emit(routine: Routine, trace: SimTrace | null): EmitResult;
};

export const EMITTERS: Record<EmitterId, Emitter> = {
  'lemlib-0.5': {
    id: 'lemlib-0.5',
    label: 'LemLib v0.5.6',
    emit: emitLemlib05,
  },
};

export const DEFAULT_EMITTER: EmitterId = 'lemlib-0.5';

export type { EmitResult };
