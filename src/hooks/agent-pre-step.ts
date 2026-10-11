/**
 * agent/pre-step hook — mode resolution and policy injection.
 *
 * Verified contract: `agent/pre-step` is a WATERFALL. Payload is
 * `{ agent, messages, turn, step, signal }`; a listener returns a
 * PreStepDecision and MUST call next() to admit the step. This hook runs
 * after next() (so guard decisions stay authoritative), resolves the session
 * mode through the pure chain (explicit > gesture > adaptive > default), and
 * appends one compact instructions message carrying the active mode's rule
 * set pointer. It never rejects a step and never masks a guard decision.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import type { UserMessage } from '@deepseek-ai/dsh-session'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import '../types/message-source.ts'
import type { PonytailXPolicy } from '../policy-service.ts'
import { gestureMode, resolveMode, sessionIdFromAgent, type ModeId } from '../modes.ts'

interface PreStepPayload {
  agent: Agent
  messages: readonly UserMessage[]
  turn: number
  step: number
  signal: AbortSignal
}

/** Plain text of the newest user-authored message, else ''. */
function newestUserText(messages: readonly UserMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role !== 'user') continue
    if ((message.source as { kind?: unknown }).kind !== 'user') continue
    const text = (message.content ?? [])
      .filter((block): block is { type: 'text'; text: string } => block?.type === 'text')
      .map(block => block.text)
      .join('\n')
    return text
  }
  return ''
}

function sessionIdOf(payload: PreStepPayload): string {
  return sessionIdFromAgent(payload.agent)
}

export function wireAgentPreStep(ctx: Context): void {
  ctx.on('agent/pre-step', async (
    payload: PreStepPayload,
    next: () => Promise<PreStepDecision>,
  ): Promise<PreStepDecision> => {
    // Downstream policies run first; their decision is authoritative.
    const decision = await next()
    if (decision.kind === 'reject') return decision

    const svc = ctx.ponytailX as PonytailXPolicy
    const sessionId = sessionIdOf(payload)
    const state = svc.sessions.ensure(sessionId, Date.now())
    svc.sessions.update(sessionId, {
      steps: state.steps + 1,
      lastStepAt: Date.now(),
    })

    const text = newestUserText(payload.messages ?? [])
    const gesture = gestureMode(text)
    const resolved = resolveMode({
      explicit: state.override,
      gesture,
      text,
      defaultMode: svc.config.defaultMode,
      thresholds: svc.config.complexity,
    })

    const mode: ModeId | null = resolved.setting === 'off' ? null : resolved.mode ?? null
    if (mode !== null) {
      svc.sessions.update(sessionId, {
        mode,
        source: resolved.source,
        reasons: resolved.reasons,
      })
    }

    if (mode === null || svc.config.injection.enabled !== true) return decision

    const body = svc.renderInjection(mode, resolved.reasons)
    const injection = createUserMessage({
      content: [{ type: 'text', text: body }],
      source: { kind: 'ponytail-x', form: 'instructions', mode },
    })
    // One ponytail-x injection per step: an earlier one in this step's
    // message list is replaced, never accumulated. Without this the same
    // block would be appended on every step of a multi-step turn.
    const others = decision.messages.filter(
      message => (message.source as { kind?: unknown }).kind !== 'ponytail-x',
    )
    return { ...decision, messages: [...others, injection] }
  })
}
