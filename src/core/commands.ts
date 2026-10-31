// Undoable construction/buy commands. Each command captures exact before/after data when applied, so
// undo/redo restores money, geometry, materials, inventory and ownership exactly once.

import type { ContentDB } from '../content/types';
import type { EventBus } from './events';
import type { WorldState } from './types';

export interface CommandContext {
  state: WorldState;
  content: ContentDB;
  events: EventBus;
}

export type CommandResult = { ok: true } | { ok: false; reason: string };

export interface UndoableCommand {
  readonly label: string;
  /** Validate the whole operation first; on failure change nothing and return the reason. */
  apply(ctx: CommandContext): CommandResult;
  /** Exact inverse of a successful apply. */
  revert(ctx: CommandContext): void;
  /** Re-apply after revert (defaults to apply semantics but must not re-validate prices differently). */
  reapply(ctx: CommandContext): CommandResult;
}

export class UndoStack {
  private done: UndoableCommand[] = [];
  private undone: UndoableCommand[] = [];
  constructor(private limit = 100) {}

  run(ctx: CommandContext, cmd: UndoableCommand): CommandResult {
    const r = cmd.apply(ctx);
    if (!r.ok) return r;
    this.done.push(cmd);
    if (this.done.length > this.limit) this.done.shift();
    this.undone = [];
    return r;
  }

  undo(ctx: CommandContext): string | null {
    const cmd = this.done.pop();
    if (!cmd) return null;
    cmd.revert(ctx);
    this.undone.push(cmd);
    return cmd.label;
  }

  redo(ctx: CommandContext): CommandResult | null {
    const cmd = this.undone.pop();
    if (!cmd) return null;
    const r = cmd.reapply(ctx);
    if (r.ok) this.done.push(cmd);
    else this.undone.push(cmd);
    return r;
  }

  canUndo(): boolean { return this.done.length > 0; }
  canRedo(): boolean { return this.undone.length > 0; }
  peekUndo(): string | null { return this.done.at(-1)?.label ?? null; }
  peekRedo(): string | null { return this.undone.at(-1)?.label ?? null; }
  clear(): void { this.done = []; this.undone = []; }
}
