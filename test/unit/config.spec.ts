/**
 * Unit: configuration — defaults, fail-loud rejections, field paths.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { resolveConfig, ConfigError } from '../../src/config/schema.ts'

describe('resolveConfig', () => {
  it('fills documented defaults for an empty config', () => {
    const config = resolveConfig({})
    assert.equal(config.defaultMode, 'full')
    assert.equal(config.injection.enabled, true)
    assert.equal(config.injection.maxChars, 1200)
    assert.deepEqual(config.complexity, { ultraAt: 6, liteAt: 1 })
    assert.deepEqual(config.models.astra, { provider: 'nine-router', model: 'th/gpt-6-astra' })
    assert.deepEqual(config.models.fable, { provider: 'nine-router', model: 'th/claude-fable-5.1' })
  })

  it('accepts a valid override', () => {
    const config = resolveConfig({
      defaultMode: 'surgical',
      injection: { enabled: false, maxChars: 400 },
      complexity: { ultraAt: 4, liteAt: 2 },
      models: { astra: { provider: 'nine-router', model: 'th/gpt-6-astra-fast' } },
    })
    assert.equal(config.defaultMode, 'surgical')
    assert.equal(config.injection.enabled, false)
    assert.equal(config.complexity.ultraAt, 4)
    assert.equal(config.models.astra.model, 'th/gpt-6-astra-fast')
  })

  it('accepts the legacy injection.disabled alias and normalizes it', () => {
    assert.equal(resolveConfig({ injection: { disabled: true } }).injection.enabled, false)
    assert.equal(resolveConfig({ injection: { disabled: false } }).injection.enabled, true)
  })

  it('validates the type of the legacy injection.disabled alias', () => {
    assert.throws(
      () => resolveConfig({ injection: { disabled: 'yes' } }),
      /injection\\.disabled must be a boolean/,
    )
  })

  it('rejects an unknown mode naming the field', () => {
    assert.throws(() => resolveConfig({ defaultMode: 'review' }), (error: unknown) => {
      assert.ok(error instanceof ConfigError)
      assert.match(error.message, /defaultMode must be one of/)
      return true
    })
  })

  it('rejects wrong types with exact field paths', () => {
    assert.throws(() => resolveConfig({ injection: { enabled: 'yes' } }), /injection\.enabled must be a boolean/)
    assert.throws(() => resolveConfig({ complexity: { ultraAt: 'high' } }), /complexity\.ultraAt must be a finite number/)
    assert.throws(() => resolveConfig({ models: { astra: { model: '' } } }), /models\.astra\.model must be a non-empty string/)
    assert.throws(() => resolveConfig({ models: 'none' }), /models must be an object/)
  })

  // Proof test for the dead-patch-key defect (commit e38394b shipped
  // models.A/models.B; the schema reads models.astra/models.fable, so the
  // patch config silently vanished and defaults applied).
  it('rejects unrecognized config keys instead of silently dropping them', () => {
    assert.throws(() => resolveConfig({ models: { A: { provider: 'nine-router', model: 'x' } } }), /models\.A is not a recognized config key/)
    assert.throws(() => resolveConfig({ injection: { maxChar: 10 } }), /injection\.maxChar is not a recognized config key/)
    assert.throws(() => resolveConfig({ defualtMode: 'full' }), /config\.defualtMode is not a recognized config key/)
  })
})
