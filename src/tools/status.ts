/**
 * ponytail.status — session metrics for the calling session (or all).
 *
 * Token counts come from the llm/stream approximation (chars/4) and are
 * labelled approximate; tool calls and duration are exact observations.
 */
import { defineTool } from './shared.ts'
import { sessionIdFromAgent } from '../modes.ts'
import type { PonytailXPolicy } from '../policy-service.ts'

const PARAMETERS = {
  type: 'object',
  additionalProperties: false,
  properties: {
    all: { type: 'boolean', description: 'Report every observed session instead of the calling one.' },
  },
} as const

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['session'],
  properties: {
    session: { type: 'object' },
    sessions: { type: 'array' },
    approxTokensByModel: { type: 'object' },
  },
} as const

export function statusTool(service: PonytailXPolicy) {
  return defineTool({
    name: 'status',
    description: 'Report Ponytail X session metrics: active mode, turns, steps, tool calls, elapsed time, approximate output tokens.',
    parameters: PARAMETERS,
    outputSchema: OUTPUT_SCHEMA,
    execute(args: unknown, exec) {
      const input = (args ?? {}) as { all?: unknown }
      const sessionId = sessionIdFromAgent(exec.agent)
      const tokensByModel = Object.fromEntries(service.modelTokens)
      if (input.all === true) {
        return { session: null, sessions: service.sessions.all(), approxTokensByModel: tokensByModel }
      }
      const state = service.sessions.get(sessionId)
      return {
        session: state
          ? {
            sessionId,
            ...state,
            elapsedMs: state.lastStepAt - state.startedAt,
            approxTokens: state.approxTokens,
          }
          : { sessionId, note: 'no step observed yet' },
        approxTokensByModel: tokensByModel,
      }
    },
  })
}
