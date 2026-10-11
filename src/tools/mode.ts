/**
 * ponytail-mode — read or set the session mode.
 *
 * Read: `{}` returns the resolved mode for the calling session (override,
 * adaptive pick, or default). Set: `{ mode: "ultra" | "surgical" | "off" }`
 * writes a session-sticky override. No global state is mutated; the override
 * lives in the calling session's entry only.
 */
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import { MODE_IDS, MODE_SUMMARY, parseModeSetting, extractSignals, selectMode, sessionIdFromAgent } from '../modes.ts'
import { defineTool } from './shared.ts'
import type { PonytailXPolicy } from '../policy-service.ts'

const MODE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    mode: {
      type: 'string',
      enum: [...MODE_IDS, 'off'],
      description: 'Omit to read the current mode; pass a mode to set a session-sticky override; "off" disables injection.',
    },
    text: {
      type: 'string',
      description: 'Optional task text to preview the adaptive pick without setting anything.',
    },
  },
} as const

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['mode', 'source', 'reasons'],
  properties: {
    mode: { type: 'string', enum: [...MODE_IDS, 'off'] },
    source: { type: 'string', enum: ['explicit', 'gesture', 'adaptive', 'default'] },
    reasons: { type: 'array', items: { type: 'string' } },
    // Always a string: the active override, or 'none'. DSH's tool registry
    // rejects JSON-Schema type arrays, so null is not expressible here.
    override: { type: 'string', description: 'The session override, or "none".' },
    summary: { type: 'string' },
    scores: { type: 'object' },
  },
} as const

export function modeTool(service: PonytailXPolicy) {
  return defineTool({
    name: 'mode',
    description: 'Read or set the active Ponytail X mode (lite/full/ultra/surgical/autopsy/off) for this session. Omit `mode` to read; pass a mode to set a sticky override; pass `text` to preview the adaptive pick.',
    parameters: MODE_SCHEMA,
    outputSchema: OUTPUT_SCHEMA,
    execute(args: unknown, exec: ToolRunContext) {
      const input = (args ?? {}) as { mode?: unknown; text?: unknown }
      const sessionId = sessionIdFromAgent(exec.agent)
      const overrideText = (setting: string | null) => setting ?? 'none'

      if (typeof input.mode === 'string') {
        const setting = parseModeSetting(input.mode)
        if (setting === null) {
          throw new Error(`ponytail-mode: unknown mode "${input.mode}"; use ${[...MODE_IDS, 'off'].join(', ')}`)
        }
        service.overrideSetting(sessionId, setting)
        const state = service.sessions.get(sessionId)
        return {
          mode: setting,
          source: 'explicit' as const,
          reasons: state?.reasons ?? [],
          override: overrideText(setting),
          summary: setting === 'off' ? 'ponytail-x disabled for this session' : MODE_SUMMARY[setting],
        }
      }

      if (typeof input.text === 'string' && input.text.length > 0) {
        const decision = selectMode(extractSignals(input.text), service.config.complexity)
        return {
          mode: decision.mode,
          source: 'adaptive' as const,
          reasons: decision.scores.reasons,
          override: overrideText(service.sessions.get(sessionId)?.override ?? null),
          summary: MODE_SUMMARY[decision.mode],
          scores: decision.scores,
        }
      }

      const state = service.sessions.get(sessionId)
      const mode = state?.override && state.override !== 'off'
        ? state.override
        : state?.mode ?? service.config.defaultMode
      return {
        mode: state?.override === 'off' ? 'off' : mode,
        source: state?.source ?? 'default',
        reasons: state?.reasons ?? ['no step observed yet'],
        override: overrideText(state?.override ?? null),
        summary: state?.override === 'off' ? 'ponytail-x disabled for this session' : MODE_SUMMARY[mode],
      }
    },
  })
}
