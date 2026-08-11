/**
 * The application store. PLAN.md §6.4, §2.2.
 *
 * One document, several views. The canvas and the segment list are the *same object*
 * viewed twice — dragging a handle mutates the document, which re-renders the list, and
 * typing in the list mutates the document, which re-renders the canvas. There is no
 * apply button and no component-local copy of the data anywhere.
 *
 * Undo/redo is a bounded stack of whole-document snapshots. A 20-segment routine is a
 * few KB, so structural sharing would be complexity for no gain.
 */

import { demoRoutine, makeSegment } from '../config/defaults';
import { emit } from '../emit/lemlib05';
import type { EmitResult } from '../emit';
import type { Pose, Routine, Segment, SegmentKind, SimTrace } from '../model/types';
import { simulate } from '../sim/run';

const STORAGE_KEY = 'vex-pathing:working';
const HISTORY_LIMIT = 100;

function load(): Routine {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Routine;
      if (parsed && parsed.schemaVersion === 1 && Array.isArray(parsed.segments)) return parsed;
    }
  } catch {
    // Corrupt autosave shouldn't brick the app; fall through to the demo.
  }
  return demoRoutine();
}

class Store {
  routine = $state<Routine>(load());
  selectedId = $state<string | null>(null);
  /** Playback head, seconds. */
  playhead = $state(0);
  playing = $state(false);
  showOnion = $state(true);
  onionSpacing = $state(6);
  showElements = $state(false);
  showGrid = $state(true);

  #undo: string[] = [];
  #redo: string[] = [];
  #saveTimer: ReturnType<typeof setTimeout> | null = null;

  /** Simulation of the current document. Recomputed whenever the document changes. */
  trace = $derived.by<SimTrace>(() => simulate(this.routine));

  generated = $derived.by<EmitResult>(() => emit(this.routine, this.trace));

  selected = $derived.by<Segment | null>(
    () => this.routine.segments.find((s) => s.id === this.selectedId) ?? null,
  );

  selectedIndex = $derived.by<number>(() => this.routine.segments.findIndex((s) => s.id === this.selectedId));

  /** Pose the robot is in when a given segment begins — where new handles anchor. */
  poseBefore(index: number): Pose {
    const res = this.trace.segments[index - 1];
    if (index <= 0 || !res) return this.routine.start;
    const pt = this.trace.points.findLast((p) => p.t <= res.endT);
    return pt ? { x: pt.x, y: pt.y, theta: pt.theta } : this.routine.start;
  }

  get endPose(): Pose {
    const last = this.trace.points[this.trace.points.length - 1];
    return last ? { x: last.x, y: last.y, theta: last.theta } : this.routine.start;
  }

  // --- mutation ---------------------------------------------------------------------

  /**
   * Wrap a mutation so it lands in history exactly once.
   * `coalesce` is for drags: repeated calls with the same key collapse into one entry,
   * so undo steps back over a whole drag rather than every mouse-move.
   */
  edit(fn: (r: Routine) => void, coalesceKey?: string): void {
    const snapshot = JSON.stringify(this.routine);
    if (!coalesceKey || this.#lastKey !== coalesceKey) {
      this.#undo.push(snapshot);
      if (this.#undo.length > HISTORY_LIMIT) this.#undo.shift();
      this.#redo = [];
    }
    this.#lastKey = coalesceKey ?? null;
    fn(this.routine);
    this.#scheduleSave();
  }

  #lastKey: string | null = null;

  /** Call when a drag finishes, so the next drag starts a new history entry. */
  endCoalesce(): void {
    this.#lastKey = null;
  }

  undo(): void {
    const prev = this.#undo.pop();
    if (!prev) return;
    this.#redo.push(JSON.stringify(this.routine));
    this.routine = JSON.parse(prev) as Routine;
    this.#lastKey = null;
    this.#scheduleSave();
  }

  redo(): void {
    const next = this.#redo.pop();
    if (!next) return;
    this.#undo.push(JSON.stringify(this.routine));
    this.routine = JSON.parse(next) as Routine;
    this.#lastKey = null;
    this.#scheduleSave();
  }

  get canUndo(): boolean {
    return this.#undo.length > 0;
  }
  get canRedo(): boolean {
    return this.#redo.length > 0;
  }

  #scheduleSave(): void {
    if (this.#saveTimer) clearTimeout(this.#saveTimer);
    this.#saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.routine));
      } catch {
        // Quota or private mode — not worth interrupting the user over.
      }
    }, 250);
  }

  // --- segment operations -----------------------------------------------------------

  addSegment(kind: SegmentKind): void {
    const anchor = this.routine.segments.length ? this.endPose : this.routine.start;
    const seg = makeSegment(kind, anchor);
    this.edit((r) => r.segments.push(seg));
    this.selectedId = seg.id;
  }

  removeSegment(id: string): void {
    this.edit((r) => {
      r.segments = r.segments.filter((s) => s.id !== id);
    });
    if (this.selectedId === id) this.selectedId = null;
  }

  moveSegment(id: string, delta: number): void {
    this.edit((r) => {
      const i = r.segments.findIndex((s) => s.id === id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= r.segments.length) return;
      const [seg] = r.segments.splice(i, 1);
      r.segments.splice(j, 0, seg!);
    });
  }

  duplicateSegment(id: string): void {
    this.edit((r) => {
      const i = r.segments.findIndex((s) => s.id === id);
      if (i < 0) return;
      const copy = structuredClone(r.segments[i]!);
      copy.id = `${copy.id}-c${Math.random().toString(36).slice(2, 6)}`;
      r.segments.splice(i + 1, 0, copy);
    });
  }

  replace(routine: Routine): void {
    this.edit(() => {});
    this.routine = routine;
    this.selectedId = null;
    this.playhead = 0;
    this.#scheduleSave();
  }
}

export const store = new Store();
