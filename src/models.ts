/**
 * Model profiles for the two configured agents.
 *
 * The ids below are REAL, verified against the live router catalog
 * (GET {NINE_ROUTER_BASE_URL}/v1/models, probe 2026-10-11):
 *   - th/gpt-6-astra      ctx 272000, tools, reasoning, thinkingFormat openai
 *   - th/claude-fable-5.1 ctx 1000000, tools, reasoning, thinkingFormat claude-budget
 * Nothing here invents a model id or an endpoint; validation is done against
 * the router's own catalog at runtime.
 */
export interface ModelProfile {
  /** Registered provider route (host settings `llm-pi-ai.providers`). */
  readonly provider: string
  /** Provider-owned model id. */
  readonly model: string
}

/** The two profiles this bundle ships. */
export interface ModelCatalog {
  readonly astra: ModelProfile
  readonly fable: ModelProfile
}

export const DEFAULT_CATALOG: ModelCatalog = {
  astra: { provider: 'nine-router', model: 'th/gpt-6-astra' },
  fable: { provider: 'nine-router', model: 'th/claude-fable-5.1' },
}

/** Outcome of checking one profile against the live router catalog. */
export interface ModelCheck {
  readonly profile: string
  readonly provider: string
  readonly model: string
  /** The id is advertised by the router catalog. */
  readonly advertised: boolean
  /** The id is in the host settings model list (wiring, not reachability). */
  readonly configuredInSettings: boolean
  /** Human-readable note (capabilities, or why not reachable). */
  readonly note: string
}

/** Router catalog entry shape (subset of the /v1/models response). */
export interface RouterModel {
  readonly id: string
  readonly capabilities?: {
    readonly contextWindow?: number
    readonly tools?: boolean
    readonly reasoning?: boolean
  }
}

/**
 * Compare the catalog profiles against a router /v1/models response. Pure;
 * fetching the response is the caller's job so this stays testable.
 */
export function checkProfiles(
  catalog: ModelCatalog,
  routerModels: readonly RouterModel[] | null,
  settingsModelIds: readonly string[],
): readonly ModelCheck[] {
  const ids = new Set((routerModels ?? []).map(m => m.id))
  return (['astra', 'fable'] as const).map(name => {
    const profile = catalog[name]
    const advertised = ids.has(profile.model)
    const capabilities = (routerModels ?? []).find(m => m.id === profile.model)?.capabilities
    const configuredInSettings = settingsModelIds.includes(profile.model)
    let note: string
    if (!advertised) note = 'not advertised by the router catalog'
    else if (capabilities) {
      note = `ctx ${capabilities.contextWindow ?? '?'}, tools ${capabilities.tools === true ? 'yes' : 'no'}, reasoning ${capabilities.reasoning === true ? 'yes' : 'no'}`
    } else note = 'advertised; capabilities unknown'
    if (advertised && !configuredInSettings) {
      note += '; not declared in host settings (pass-through id)'
    }
    return { profile: name, provider: profile.provider, model: profile.model, advertised, configuredInSettings, note }
  })
}

/**
 * Fetch the router catalog. `baseUrl` comes from the environment
 * (NINE_ROUTER_BASE_URL) or the caller; failures return null so callers report
 * honestly instead of throwing.
 */
export async function fetchRouterModels(baseUrl: string): Promise<readonly RouterModel[] | null> {
  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/models`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) return null
    const payload = await response.json() as { data?: RouterModel[] }
    return Array.isArray(payload.data) ? payload.data : null
  } catch {
    return null
  }
}
