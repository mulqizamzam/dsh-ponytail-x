/**
 * ponytail-model — report the configured agent models and validate them
 * against the live router catalog.
 *
 * The two profiles (astra, fable) are the operator's real router ids:
 * th/gpt-6-astra and th/claude-fable-5.1. Nothing here invents an id; the
 * check asks the router what it actually serves and reports reachability
 * honestly (advertised / not advertised / catalog unreachable).
 */
import { defineTool } from './shared.ts'
import type { PonytailXPolicy } from '../policy-service.ts'

const PARAMETERS = {
  type: 'object',
  additionalProperties: false,
  properties: {},
} as const

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['profiles', 'catalogReachable', 'baseUrl'],
  properties: {
    profiles: { type: 'array' },
    catalogReachable: { type: 'boolean' },
    baseUrl: { type: 'string' },
  },
} as const

export function modelTool(service: PonytailXPolicy) {
  return defineTool({
    name: 'model',
    description: 'Report the configured Ponytail X agent models (GPT 6 ASTRA / FABLE 5.1) and validate them against the live router catalog.',
    parameters: PARAMETERS,
    outputSchema: OUTPUT_SCHEMA,
    async execute() {
      const baseUrl = process.env['NINE_ROUTER_BASE_URL'] ?? 'http://localhost:20128/v1'
      const checks = await service.validateModels()
      return {
        profiles: checks,
        catalogReachable: checks.some(check => check.advertised || check.note !== 'not advertised by the router catalog'),
        baseUrl,
      }
    },
  })
}
