/**
 * Unit: model catalog checks — pure logic over a router /v1/models payload.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { DEFAULT_CATALOG, checkProfiles, fetchRouterModels, type RouterModel } from '../../src/models.ts'

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
    for (const check of checks) {
      assert.equal(check.advertised, false)
      assert.equal(check.note, 'router catalog unreachable; not checked')
    }
  })

  it('flags ids the host settings do not declare', () => {
    const checks = checkProfiles(DEFAULT_CATALOG, routerModels, ['th/claude-fable-5.1'])
    assert.equal(checks.find(c => c.profile === 'fable')?.configuredInSettings, true)
    assert.equal(checks.find(c => c.profile === 'astra')?.configuredInSettings, false)
    assert.match(checks.find(c => c.profile === 'astra')!.note, /not declared in host settings/)
  })

  // Proof test for the honesty defect: validateModels used to pass [] (nobody
  // inspected settings), and every profile still claimed a settings state.
  it('says settings were not inspected when passed null', () => {
    const checks = checkProfiles(DEFAULT_CATALOG, routerModels, null)
    for (const check of checks) {
      assert.equal(check.configuredInSettings, false)
      assert.match(check.note, /host settings not inspected/)
      assert.doesNotMatch(check.note, /not declared in host settings/)
    }
  })
  // Proof test for the untrusted-input defect: the catalog body is arbitrary
  // JSON, and a single `null` row made `.map(m => m.id)` throw a TypeError out
  // of the ponytail-model tool instead of reporting the catalog it did reach.
  it('never throws on a malformed catalog row; it reports what it can read', () => {
    const malformed = [null, 'garbage', 42, {}, { id: 'th/gpt-6-astra' }] as unknown as RouterModel[]
    const checks = checkProfiles(DEFAULT_CATALOG, malformed, null)
    assert.equal(checks.find(c => c.profile === 'astra')?.advertised, true, 'the readable row still counts')
    const fable = checks.find(c => c.profile === 'fable')
    assert.equal(fable?.advertised, false)
    assert.equal(fable?.note, 'not advertised by the router catalog')
  })

  it('reports an all-malformed catalog as reachable-but-empty, not as a crash', () => {
    const checks = checkProfiles(DEFAULT_CATALOG, [null, null] as unknown as RouterModel[], null)
    for (const check of checks) assert.equal(check.advertised, false)
  })
})

describe('fetchRouterModels', () => {
  it('accepts both the wrapped {data:[…]} and the bare-array catalog shapes', async () => {
    const server = createServer((_req, res) => {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify([{ id: 'th/gpt-6-astra' }]))
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address() as { port: number }
    try {
      const models = await fetchRouterModels(`http://127.0.0.1:${address.port}/v1`)
      assert.deepEqual(models?.map(m => m.id), ['th/gpt-6-astra'])
    } finally {
      await new Promise(resolve => server.close(resolve))
    }
  })

  it('returns null (not a throw) when the catalog cannot be reached', async () => {
    const models = await fetchRouterModels('http://127.0.0.1:1/v1')
    assert.equal(models, null)
  })

  // A router that answers 200 with a malformed row is still REACHABLE: the
  // bad entries are dropped, and the result stays a non-null array so the
  // caller never conflates "unreachable" with "nothing usable in it".
  it('drops malformed rows but still reports a reachable catalog', async () => {
    const server = createServer((_req, res) => {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ data: [null, { id: 'th/gpt-6-astra' }, 'junk', { nope: 1 }] }))
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address() as { port: number }
    try {
      const models = await fetchRouterModels(`http://127.0.0.1:${address.port}/v1`)
      assert.notEqual(models, null, 'a 200 response is a reachable catalog, not an unreachable one')
      assert.deepEqual(models?.map(m => m.id), ['th/gpt-6-astra'])
    } finally {
      await new Promise(resolve => server.close(resolve))
    }
  })

  it('returns null for a 200 body that is not a catalog at all', async () => {
    const server = createServer((_req, res) => {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ error: 'not a router' }))
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address() as { port: number }
    try {
      assert.equal(await fetchRouterModels(`http://127.0.0.1:${address.port}/v1`), null)
    } finally {
      await new Promise(resolve => server.close(resolve))
    }
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
