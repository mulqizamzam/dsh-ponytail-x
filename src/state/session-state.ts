/**
 * Per-session Ponytail X state: the active mode plus run metrics.
 *
 * Keyed by the agent's session id; a Map on the service keeps the bundle
 * process-global like the other dsh plugins, and every entry is small and
 * serializable.
 */
import type { ModeId, ModeSetting, ModeSource } from '../modes.ts'

export interface SessionMetrics {
  /** Explicit override set via ponytail-mode; null means none. */
  override: ModeSetting | null
  /** Last resolved mode and where it came from. */
  mode: ModeId
  source: ModeSource
  reasons: readonly string[]
  /** Epoch ms of the first observed step. */
  startedAt: number
  /** Epoch ms of the last observed step. */
  lastStepAt: number
  /** Completed turns observed via session/event. */
  turns: number
  /** Agent steps observed via agent/pre-step. */
  steps: number
  /** Tool results observed via tools/result. */
  toolCalls: number
  /** Approximate output tokens observed via llm/stream (chars/4). */
  approxTokens: number
}

export function emptyMetrics(override: ModeSetting | null, now: number): SessionMetrics {
  return {
    override,
    mode: 'full',
    source: 'default',
    reasons: ['no step observed yet'],
    startedAt: now,
    lastStepAt: now,
    turns: 0,
    steps: 0,
    toolCalls: 0,
    approxTokens: 0,
  }
}

/** Small bounded LRU-ish store; sessions are few and short-lived in dsh. */
export class SessionStateStore {
  private readonly entries = new Map<string, SessionMetrics>()
  private static readonly MAX_ENTRIES = 256

  get(sessionId: string): SessionMetrics | undefined {
    return this.entries.get(sessionId)
  }

  ensure(sessionId: string, now: number): SessionMetrics {
    const existing = this.entries.get(sessionId)
    if (existing) return existing
    const created = emptyMetrics(null, now)
    this.entries.set(sessionId, created)
    if (this.entries.size > SessionStateStore.MAX_ENTRIES) {
      const oldest = this.entries.keys().next()
      if (!oldest.done) this.entries.delete(oldest.value)
    }
    return created
  }

  update(sessionId: string, patch: Partial<SessionMetrics>): SessionMetrics {
    const current = this.entries.get(sessionId) ?? emptyMetrics(null, Date.now())
    const next: SessionMetrics = { ...current, ...patch }
    this.entries.set(sessionId, next)
    return next
  }

  /** Test/inspection helper. */
  size(): number {
    return this.entries.size
  }

  /** Snapshot of every entry, for status reporting. */
  all(): readonly SessionSnapshot[] {
    return [...this.entries].map(([sessionId, metrics]) => ({ sessionId, ...metrics }))
  }
}

/** One session's metrics with its id attached. */
export interface SessionSnapshot extends SessionMetrics {
  readonly sessionId: string
}
