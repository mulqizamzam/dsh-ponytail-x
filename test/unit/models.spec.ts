/**
 * Unit: model catalog checks — pure logic over a router /v1/models payload.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_CATALOG, checkProfiles, type RouterModel } from '../../src/models.ts'

const routerModels: RouterModel[] = [
  { id: 'th/gpt-6-astra', capabilities: { contextWindow: 272000, tools: true, reasoning: true } },
  { id: 'th/claude-fable-5.1', capabilities: { contextWindow: 1000000, tools: true, reasoning: true } },
  { id: 'oc/mimo-v2.6-flash-free(xhigh)' },
]

describe('checkProfiles', () => {
  it('reports advertised ids with their router capabilities', () => {
    const checks = checkProfiles(DEFAULT_CATALOG, routerModels, [])
    const astra = checks.find(c => c.profile === 'astra')
    assert.ok(astra)
    assert.equal(astra.advertised, true)
    assert.match(astra.note, /ctx 272000/)
    const fable = checks.find(c => c.profile === 'fable')
    assert.equal(fable?.advertised, true)
    assert.match(fable!.note, /ctx 1000000/)
  })

  it('reports honestly when the catalog is unreachable', () => {
    const checks = checkProfiles(DEFAULT_CATALOG, null, [])
    for (const check of checks) assert.equal(check.advertised, false)
    assert.match(checks[0]!.note, /not advertised by the router catalog/)
  })

  it('flags ids the host settings do not declare', () => {
    const checks = checkProfiles(DEFAULT_CATALOG, routerModels, ['th/claude-fable-5.1'])
    assert.equal(checks.find(c => c.profile === 'fable')?.configuredInSettings, true)
    assert.equal(checks.find(c => c.profile === 'astra')?.configuredInSettings, false)
    assert.match(checks.find(c => c.profile === 'astra')!.note, /not declared in host settings/)
  })
})

describe('DEFAULT_CATALOG', () => {
  it('uses the verified router ids — never invented ones', () => {
    assert.equal(DEFAULT_CATALOG.astra.model, 'th/gpt-6-astra')
    assert.equal(DEFAULT_CATALOG.fable.model, 'th/claude-fable-5.1')
    assert.equal(DEFAULT_CATALOG.astra.provider, 'nine-router')
    assert.equal(DEFAULT_CATALOG.fable.provider, 'nine-router')
  })
})
