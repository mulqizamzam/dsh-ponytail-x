/**
 * ponytail-x — the policy service IS the plugin (dsh-tools pattern).
 *
 * Holds the validated config, the per-session mode/metrics store, the
 * model-token ledger, and the tool registry. Registered as `ctx.ponytailX`;
 * injects tools, llm, sessions like the harness's own bundles.
 */
import { Context, Service } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Ponytail X policy service, registered under the id `ponytail-x`. */
    ponytailX: PonytailXPolicy
  }
}
import { Config, resolveConfig, type PonytailXConfig } from './config/schema.ts'
import { MODE_SUMMARY, type ModeId, type ModeSetting } from './modes.ts'
import { DEFAULT_CATALOG, fetchRouterModels, checkProfiles, type ModelCheck } from './models.ts'
import { SessionStateStore } from './state/session-state.ts'
import { wireAgentPreStep } from './hooks/agent-pre-step.ts'
import { wireSessionEvent } from './hooks/session-event.ts'
import { wireLlmStream } from './hooks/llm-stream.ts'
import { wireToolsResult } from './hooks/tools-result.ts'
import { registerTools } from './tools/index.ts'

export class PonytailXPolicy extends Service {
  static inject = ['tools', 'llm', 'sessions'] as const

  // Schema value only: Schemastery validates at load; resolveConfig owns the
  // field-path contract at construction.
  static Config = Config

  readonly config: PonytailXConfig
  readonly sessions = new SessionStateStore()
  /** Approximate output tokens per model id (llm/stream, chars/4). */
  readonly modelTokens = new Map<string, number>()

  constructor(ctx: Context, config: Record<string, unknown> = {}) {
    super(ctx, 'ponytailX')
    this.config = resolveConfig(config)
    wireAgentPreStep(ctx)
    wireSessionEvent(ctx)
    wireLlmStream(ctx)
    wireToolsResult(ctx)
    const count = registerTools(ctx)
    ctx.logger('ponytail-x').info(`ponytail-x loaded — ${count} tools registered, default mode ${this.config.defaultMode}`)
  }

  // ---- session mutation API (used by tools and hooks) ----

  overrideSetting(sessionId: string, setting: ModeSetting): void {
    this.sessions.update(sessionId, {
      override: setting,
      mode: setting === 'off' ? this.config.defaultMode : setting,
      source: 'explicit',
      reasons: setting === 'off' ? ['session override: off'] : [`session override: ${setting}`],
    })
  }

  accountModelTokens(model: string, tokens: number): void {
    this.modelTokens.set(model, (this.modelTokens.get(model) ?? 0) + tokens)
  }

  accountToolCall(sessionId: string): void {
    const state = this.sessions.ensure(sessionId, Date.now())
    this.sessions.update(sessionId, { toolCalls: state.toolCalls + 1 })
  }

  // ---- model validation ----

  /**
   * Check the configured profiles against the live router catalog
   * (NINE_ROUTER_BASE_URL, defaulting to the operator's local router).
   * Reachability is reported honestly: a null catalog means "could not ask".
   */
  async validateModels(): Promise<readonly ModelCheck[]> {
    const baseUrl = process.env['NINE_ROUTER_BASE_URL'] ?? 'http://localhost:20128/v1'
    const routerModels = await fetchRouterModels(baseUrl)
    return checkProfiles(this.config.models, routerModels, [])
  }

  /** The catalog this bundle ships, merged with config overrides. */
  modelCatalog(): typeof DEFAULT_CATALOG {
    return this.config.models
  }

  // ---- injection rendering ----

  /** Render the compact mode instructions injected at agent/pre-step. */
  renderInjection(mode: ModeId, reasons: readonly string[]): string {
    const lines = [
      `[ponytail-x] Active mode: ${mode} (${reasons.join('; ') || 'resolved'}).`,
      MODE_SUMMARY[mode],
      `Skill: load \`ponytail-core\` (and \`ponytail-${skillFor(mode)}\`) with the skill tool for the full rule set.`,
      'Never cut: validation at trust boundaries, error handling that prevents data loss, security, accessibility, anything the user asked for.',
    ]
    const body = lines.join('\n')
    return body.length > this.config.injection.maxChars
      ? `${body.slice(0, this.config.injection.maxChars - 1)}…`
      : body
  }
}

/** The companion skill each mode leans on. */
export function skillFor(mode: ModeId): string {
  switch (mode) {
    case 'lite':
    case 'full':
    case 'ultra':
      return 'core'
    case 'surgical':
      return 'debug'
    case 'autopsy':
      return 'proof'
  }
}

/** Cordis plugin entry: the service class is the default export. */
export default PonytailXPolicy

export type { PonytailXConfig }
export { resolveConfig, ConfigError, validateConfig } from './config/schema.ts'
