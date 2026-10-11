/**
 * Adaptive mode model — the pure core of Ponytail X.
 *
 * Modes lite/full/ultra keep upstream ponytail parity; surgical and autopsy
 * are the X extensions. Selection is a deterministic pure function so the
 * policy service, the tools, and the unit tests all share one implementation.
 */
import type { Agent } from '@deepseek-ai/dsh-agent'

/** The five workflow modes. `off` disables injection entirely. */
export type ModeId = 'lite' | 'full' | 'ultra' | 'surgical' | 'autopsy'

/** Every mode plus the disabled state. */
export type ModeSetting = ModeId | 'off'

export const MODE_IDS: readonly ModeId[] = ['lite', 'full', 'ultra', 'surgical', 'autopsy']

/** One-line behavior contract per mode, mirrored by the skills. */
export const MODE_SUMMARY: Record<ModeId, string> = {
  lite: 'Build the smallest version that fully solves the task; name the smaller options you skipped in one line.',
  full: 'Lazy senior dev rules: the 7-rung ladder, finish callers/tests/fixtures, the never-cut list, one small test for new logic.',
  ultra: 'Full plus push back on any part of the request the need does not justify, and run extra verification passes before reporting.',
  surgical: 'Known bug locus: reproduce, root-cause, minimal diff in shared code, proof test that fails on the unfixed code, no refactor.',
  autopsy: 'Failure analysis: timeline, root cause, prevention rule, and a postmortem artifact; used on regressions and repeated failures.',
}

/** Tunable thresholds; defaults mirror cordis.patch.yml. */
export interface ModeThresholds {
  /** Adaptive score at or above which `ultra` wins. */
  readonly ultraAt: number
  /** Adaptive score at or above which `lite` wins when nothing else fires. */
  readonly liteAt: number
}

export const DEFAULT_THRESHOLDS: ModeThresholds = { ultraAt: 6, liteAt: 1 }

const RISK_WORDS: readonly string[] = [
  'security', 'auth', 'login', 'password', 'token', 'secret', 'credential',
  'money', 'billing', 'payment', 'invoice', 'charge',
  'migration', 'migrate', 'schema change', 'production', 'prod ',
  'data loss', 'delete', 'drop table', 'encrypt', 'permission', 'pii',
]

const FAILURE_WORDS: readonly string[] = [
  'error', 'crash', 'fail', 'failing', 'failed', 'regression', 'broken',
  'bug', 'exception', 'traceback', 'stack trace', 'panic', '500', 'undefined',
]

const SURGICAL_WORDS: readonly string[] = [
  'fix', 'failing test', 'test fails', 'broken test', 'hotfix', 'repair', 'patch the',
]

const AUTOPSY_WORDS: readonly string[] = [
  'postmortem', 'post-mortem', 'why did', 'root cause', 'incident', 'outage',
  'regression since', 'stopped working', 'no longer works', 'used to work',
  'was working yesterday', 'keep failing', 'keeps failing', 'recurring',
]

const UNCERTAINTY_WORDS: readonly string[] = [
  'not sure', 'unclear', 'ambiguous', 'investigate', 'explore', 'figure out',
  'not certain', 'somehow', 'mysteriously', 'no idea', 'understand why',
]

const MULTI_STEP_WORDS: readonly string[] = [
  'then', 'after that', 'and also', 'afterwards', 'followed by', 'step 1',
  'first,', 'finally,', 'additionally', 'on top of that',
]

/** Count case-insensitive whole-word-ish occurrences of each term. */
function countHits(text: string, words: readonly string[]): number {
  const lower = text.toLowerCase()
  let hits = 0
  for (const word of words) hits += lower.split(word).length - 1
  return hits
}

/** Signals extracted from the newest user message. Pure. */
export interface Signals {
  readonly length: number
  readonly pathCount: number
  readonly riskHits: number
  readonly failureHits: number
  readonly surgicalHits: number
  readonly autopsyHits: number
  readonly uncertaintyHits: number
  readonly multiStepHits: number
  readonly hasStackTrace: boolean
  readonly hasFileLine: boolean
  readonly hasRegressionMarker: boolean
}

const REGRESSION_RE = /\b(regression|since|used to|stopped|no longer|was working|yesterday)\b/i

/** Path-like tokens: `a/b`, `a.b.js`, `src/x.ts`, backticked paths. */
const PATH_RE = /(?:`[^`]+`|\b[\w.-]+\/[\w./-]+|\b[\w-]+\.[a-z0-9]{1,4}\b)/gi
const STACK_RE = /^\s*at\s+.*\(.+\)|^\s*at\s+\S+:\d+:\d+|Traceback \(most recent call last\)/im
const FILE_LINE_RE = /\b[\w./-]+:\d+(:\d+)?\b/

/**
 * Extract scoring signals from raw text. Pure and total: any string in,
 * signals out; no I/O, no randomness.
 */
export function extractSignals(text: string): Signals {
  const safe = typeof text === 'string' ? text : ''
  return {
    length: safe.length,
    pathCount: (safe.match(PATH_RE) ?? []).length,
    riskHits: countHits(safe, RISK_WORDS),
    failureHits: countHits(safe, FAILURE_WORDS),
    surgicalHits: countHits(safe, SURGICAL_WORDS),
    autopsyHits: countHits(safe, AUTOPSY_WORDS),
    uncertaintyHits: countHits(safe, UNCERTAINTY_WORDS),
    multiStepHits: countHits(safe, MULTI_STEP_WORDS),
    hasStackTrace: STACK_RE.test(safe),
    hasFileLine: FILE_LINE_RE.test(safe),
    hasRegressionMarker: REGRESSION_RE.test(safe),
  }
}

/** Per-mode affinity scores with the reasons that produced them. */
export interface ModeScores {
  readonly lite: number
  readonly ultra: number
  readonly surgical: number
  readonly autopsy: number
  readonly reasons: readonly string[]
}

/** Score every mode against the signals. Pure and deterministic. */
export function scoreModes(signals: Signals, thresholds: ModeThresholds = DEFAULT_THRESHOLDS): ModeScores {
  const reasons: string[] = []

  const surgical = signals.surgicalHits * 2
    + Math.min(signals.failureHits, 2) * 0.5
    + (signals.hasStackTrace ? 2 : 0)
    + (signals.hasFileLine ? 1 : 0)

  const autopsy = signals.autopsyHits * 3
    + Math.min(signals.failureHits, 2) * 0.5
    + (signals.hasRegressionMarker ? 2 : 0)

  const ultra = Math.min(3, Math.ceil(signals.length / 400))
    + Math.min(signals.multiStepHits, 3)
    + Math.min(signals.pathCount, 4) * 0.5
    + Math.min(signals.riskHits, 3) * 1.5
    + signals.uncertaintyHits

  // Lite needs positive boundedness evidence — a short, path-free,
  // single-step ask. Absence of every signal is NOT lite; that is the
  // ordinary middle (`full`), which stays the default level. An empty
  // message carries no evidence at all.
  const bounded = signals.length > 0 && signals.length <= 200 && signals.pathCount === 0 && signals.multiStepHits === 0
  const lite = bounded
    ? Math.max(0, 1 - Math.min(signals.riskHits, 2) * 0.5 - Math.min(signals.failureHits, 2) * 0.25)
    : 0

  if (surgical >= 3) reasons.push(`surgical signals (${surgical})`)
  if (autopsy >= 3) reasons.push(`autopsy signals (${autopsy})`)
  if (ultra >= thresholds.ultraAt) reasons.push(`complexity ${ultra} >= ultraAt ${thresholds.ultraAt}`)
  if (lite >= thresholds.liteAt && surgical < 3 && autopsy < 3 && ultra < thresholds.ultraAt) {
    reasons.push(`bounded task (lite ${lite} >= liteAt ${thresholds.liteAt})`)
  }
  return { lite, ultra, surgical, autopsy, reasons }
}

/** The adaptive decision: which mode, why, with the full score board. */
export interface ModeDecision {
  readonly mode: ModeId
  readonly scores: ModeScores
}

/**
 * Pick a mode from signals. Priority: autopsy (analysis of failure) >
 * surgical (fix with locus) > ultra (complexity) > lite (bounded) > full.
 */
export function selectMode(signals: Signals, thresholds: ModeThresholds = DEFAULT_THRESHOLDS): ModeDecision {
  const scores = scoreModes(signals, thresholds)
  if (scores.autopsy >= 3) return { mode: 'autopsy', scores }
  if (scores.surgical >= 3) return { mode: 'surgical', scores }
  if (scores.ultra >= thresholds.ultraAt) return { mode: 'ultra', scores }
  if (scores.lite >= thresholds.liteAt) return { mode: 'lite', scores }
  return { mode: 'full', scores }
}

/** Where the active mode came from. */
export type ModeSource = 'explicit' | 'gesture' | 'adaptive' | 'default'

/** The resolved mode for one agent step. */
export interface ResolvedMode {
  readonly setting: ModeSetting
  readonly source: ModeSource
  readonly mode?: ModeId
  readonly reasons: readonly string[]
}

/** Normalize any string to a ModeSetting, or null. */
export function parseModeSetting(value: unknown): ModeSetting | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  if (normalized === 'off') return 'off'
  return (MODE_IDS as readonly string[]).includes(normalized) ? (normalized as ModeId) : null
}

/** Resolve the session id from an Agent, defensively (test stubs included). */
export function sessionIdFromAgent(agent: Agent | undefined): string {
  const session = agent?.session as { id?: string; header?: { id?: string } } | undefined
  return session?.id ?? session?.header?.id ?? 'ponytail-x:unknown-session'
}

/**
 * `/ponytail-<skill> <mode>` and `/ponytail <mode>` gestures. Returns the
 * mode named in a gesture inside any user message, or null.
 */
const GESTURE_RE = /(^|\s)\/ponytail(?:-[a-z0-9]+)*\s+(lite|full|ultra|surgical|autopsy|off)\b/i
const OFF_PHRASE_RE = /^\s*(stop ponytail|ponytail off|normal mode)\s*[.!?]?\s*$/i

/** Read a mode gesture out of raw user-message text. Pure. */
export function gestureMode(text: string): ModeSetting | null {
  if (typeof text !== 'string') return null
  const off = text.trim().match(OFF_PHRASE_RE)
  if (off) return 'off'
  const match = text.match(GESTURE_RE)
  if (!match) return null
  return parseModeSetting(match[2])
}

/**
 * Full resolution chain: explicit override > gesture > adaptive > default.
 * Pure; the policy service feeds it session state and message text.
 */
export function resolveMode(input: {
  readonly explicit: ModeSetting | null
  readonly gesture: ModeSetting | null
  readonly text: string
  readonly defaultMode: ModeId
  readonly thresholds?: ModeThresholds
}): ResolvedMode {
  if (input.explicit !== null) {
    return input.explicit === 'off'
      ? { setting: 'off', source: 'explicit', reasons: ['session override: off'] }
      : { setting: input.explicit, mode: input.explicit, source: 'explicit', reasons: ['session override'] }
  }
  if (input.gesture !== null) {
    return input.gesture === 'off'
      ? { setting: 'off', source: 'gesture', reasons: ['user asked to stop ponytail'] }
      : { setting: input.gesture, mode: input.gesture, source: 'gesture', reasons: [`/ponytail gesture: ${input.gesture}`] }
  }
  const decision = selectMode(extractSignals(input.text), input.thresholds ?? DEFAULT_THRESHOLDS)
  if (decision.mode === 'full' && decision.scores.reasons.length === 0) {
    return { setting: 'full', mode: 'full', source: 'default', reasons: ['no signal fired; default level'] }
  }
  return {
    setting: decision.mode,
    mode: decision.mode,
    source: 'adaptive',
    reasons: decision.scores.reasons.length > 0 ? decision.scores.reasons : ['fallthrough level'],
  }
}
