/**
 * ponytail.select — the adaptive scorer, exposed as a pure tool.
 *
 * Given task text (or explicit signals), return the mode the policy would
 * pick and the score board that produced it. Deterministic: same input, same
 * output; no session state is read or written.
 */
import { extractSignals, selectMode, MODE_SUMMARY } from '../modes.ts'
import { defineTool } from './shared.ts'
import type { PonytailXPolicy } from '../policy-service.ts'

const PARAMETERS = {
  type: 'object',
  additionalProperties: false,
  required: ['text'],
  properties: {
    text: { type: 'string', description: 'The task text to classify.' },
  },
} as const

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['mode', 'scores', 'reasons', 'summary'],
  properties: {
    mode: { type: 'string', enum: ['lite', 'full', 'ultra', 'surgical', 'autopsy'] },
    scores: { type: 'object' },
    reasons: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
} as const

export function selectTool(service: PonytailXPolicy) {
  return defineTool({
    name: 'select',
    description: 'Classify a task text into a Ponytail X mode with the score board (pure, deterministic, no side effects).',
    parameters: PARAMETERS,
    outputSchema: OUTPUT_SCHEMA,
    execute(args: unknown) {
      const input = (args ?? {}) as { text?: unknown }
      if (typeof input.text !== 'string') throw new Error('ponytail.select: `text` (string) is required')
      const signals = extractSignals(input.text)
      const decision = selectMode(signals, service.config.complexity)
      return {
        mode: decision.mode,
        scores: decision.scores,
        reasons: decision.scores.reasons,
        summary: MODE_SUMMARY[decision.mode],
      }
    },
  })
}
