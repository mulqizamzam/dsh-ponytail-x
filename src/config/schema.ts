/**
 * Ponytail X configuration — Schemastery schema (validated at bundle load)
 * plus the fail-loud resolver that owns the field-path contract.
 */
import z from '@deepseek-ai/schemastery'
import type { ModeThresholds } from '../modes.ts'
import type { ModelProfile } from '../models.ts'

export interface PonytailXConfig {
  readonly defaultMode: 'lite' | 'full' | 'ultra' | 'surgical' | 'autopsy'
  readonly injection: {
    readonly enabled: boolean
    readonly maxChars: number
  }
  readonly complexity: ModeThresholds
  readonly models: {
    readonly astra: ModelProfile
    readonly fable: ModelProfile
  }
}

export const Config: z<PonytailXConfig> = z.object({
  defaultMode: z.union(['lite', 'full', 'ultra', 'surgical', 'autopsy'] as const).default('full'),
  injection: z.object({
    enabled: z.boolean().default(true),
    maxChars: z.number().default(1200),
  }),
  complexity: z.object({
    ultraAt: z.number().default(6),
    liteAt: z.number().default(1),
  }),
  models: z.object({
    astra: z.object({
      provider: z.string().default('nine-router'),
      model: z.string().default('th/gpt-6-astra'),
    }),
    fable: z.object({
      provider: z.string().default('nine-router'),
      model: z.string().default('th/claude-fable-5.1'),
    }),
  }),
})

export class ConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigError'
  }
}

function fail(path: string, detail: string): never {
  throw new ConfigError(`ponytail-x config: ${path} ${detail}`)
}

function expectObject(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(path, 'must be an object')
  return value as Record<string, unknown>
}

function expectString(source: Record<string, unknown>, key: string, path: string, fallback: string): string {
  const value = source[key]
  if (value === undefined) return fallback
  if (typeof value !== 'string' || value.length === 0) fail(path, 'must be a non-empty string')
  return value
}

function expectBoolean(source: Record<string, unknown>, key: string, path: string, fallback: boolean): boolean {
  const value = source[key]
  if (value === undefined) return fallback
  if (typeof value !== 'boolean') fail(path, 'must be a boolean')
  return value
}

function expectNumber(source: Record<string, unknown>, key: string, path: string, fallback: number): number {
  const value = source[key]
  if (value === undefined) return fallback
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(path, 'must be a finite number')
  return value
}

function expectMode(value: unknown, path: string): PonytailXConfig['defaultMode'] {
  const modes = ['lite', 'full', 'ultra', 'surgical', 'autopsy'] as const
  if (typeof value !== 'string' || !(modes as readonly string[]).includes(value)) {
    fail(path, `must be one of ${modes.join(', ')}`)
  }
  return value as PonytailXConfig['defaultMode']
}

/**
 * Reject keys the config contract does not name. Without this, a typo or a
 * stale patch key (e.g. `models.A` instead of `models.astra`) is silently
 * dropped and the default quietly applies — the failure mode this whole
 * fail-loud resolver exists to prevent.
 */
function rejectUnknown(source: Record<string, unknown>, path: string, known: readonly string[]): void {
  for (const key of Object.keys(source)) {
    if (!known.includes(key)) fail(`${path}.${key}`, 'is not a recognized config key')
  }
}

/**
 * Validate a raw patch config into the typed config. Every rejection names the
 * exact field path; no silent defaults beyond the documented fallbacks.
 */
export function resolveConfig(input: Record<string, unknown> = {}): PonytailXConfig {
  const root = expectObject(input, 'config')
  rejectUnknown(root, 'config', ['defaultMode', 'injection', 'complexity', 'models'])
  if (root['defaultMode'] !== undefined && typeof root['defaultMode'] !== 'string') {
    fail('defaultMode', 'must be a mode string')
  }
  const defaultMode = root['defaultMode'] === undefined ? 'full' : expectMode(root['defaultMode'], 'defaultMode')

  const injection = expectObject(root['injection'] ?? {}, 'injection')
  rejectUnknown(injection, 'injection', ['enabled', 'maxChars'])
  const complexity = expectObject(root['complexity'] ?? {}, 'complexity')
  rejectUnknown(complexity, 'complexity', ['ultraAt', 'liteAt'])
  const models = expectObject(root['models'] ?? {}, 'models')
  rejectUnknown(models, 'models', ['astra', 'fable'])

  const astra = expectObject(models['astra'] ?? {}, 'models.astra')
  rejectUnknown(astra, 'models.astra', ['provider', 'model'])
  const fable = expectObject(models['fable'] ?? {}, 'models.fable')
  rejectUnknown(fable, 'models.fable', ['provider', 'model'])

  return {
    defaultMode,
    injection: {
      enabled: expectBoolean(injection, 'enabled', 'injection.enabled', true),
      maxChars: expectNumber(injection, 'maxChars', 'injection.maxChars', 1200),
    },
    complexity: {
      ultraAt: expectNumber(complexity, 'ultraAt', 'complexity.ultraAt', 6),
      liteAt: expectNumber(complexity, 'liteAt', 'complexity.liteAt', 1),
    },
    models: {
      astra: {
        provider: expectString(astra, 'provider', 'models.astra.provider', 'nine-router'),
        model: expectString(astra, 'model', 'models.astra.model', 'th/gpt-6-astra'),
      },
      fable: {
        provider: expectString(fable, 'provider', 'models.fable.provider', 'nine-router'),
        model: expectString(fable, 'model', 'models.fable.model', 'th/claude-fable-5.1'),
      },
    },
  }
}

/** Legacy alias kept for the index surface. */
export const validateConfig = resolveConfig
