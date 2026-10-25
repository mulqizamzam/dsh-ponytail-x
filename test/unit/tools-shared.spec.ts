/**
 * Unit: the shared tool factory. `parameters` is enforced in execute(), so the
 * schema must also be provably inside the subset the harness can enforce —
 * otherwise an author adds a constraint that is silently ignored forever.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { defineTool, type PonytailToolSpec } from '../../src/tools/shared.ts'

function spec(parameters: Record<string, unknown>): PonytailToolSpec {
  return {
    name: 'probe',
    description: 'probe',
    parameters,
    outputSchema: { type: 'object', additionalProperties: false, properties: {} },
    execute: () => ({ ok: true }),
  }
}

describe('defineTool schema assertion', () => {
  // Proof tests for the enforced-subset hole: register() asserts only
  // output.schema, so without an assertion here an out-of-subset keyword is
  // silently IGNORED by validateJsonSchemaValue (minLength:3 lets "a"
  // through) and a mistyped `type` makes every call fail with one misleading
  // root violation that blames the model instead of the schema.
  it('rejects an out-of-subset keyword instead of silently ignoring it', () => {
    assert.throws(
      () => defineTool(spec({
        type: 'object', additionalProperties: false,
        properties: { text: { type: 'string', minLength: 3 } },
      })),
      /unsupported JSON schema|minLength/,
    )
  })

  it('rejects a mistyped `type` at definition time, not on every call', () => {
    assert.throws(
      () => defineTool(spec({
        type: 'object', additionalProperties: false,
        properties: { text: { type: 'strng' } },
      })),
      /unsupported JSON schema|strng/,
    )
  })

  it('rejects a non-object-root parameters schema', () => {
    assert.throws(
      () => defineTool(spec({ type: 'string' })),
      /unsupported JSON schema|object/,
    )
  })

  it('accepts every shipped ponytail-* parameters schema', async () => {
    const [{ MODE_IDS }, { modeTool }, { selectTool }, { modelTool }, { statusTool }, { PonytailXPolicy }] =
      await Promise.all([
        import('../../src/modes.ts'),
        import('../../src/tools/mode.ts'),
        import('../../src/tools/select.ts'),
        import('../../src/tools/model.ts'),
        import('../../src/tools/status.ts'),
        import('../../src/policy-service.ts'),
      ])
    assert.deepEqual([...MODE_IDS], ['lite', 'full', 'ultra', 'surgical', 'autopsy'])
    // The four factories only touch `service` inside execute(), so a bare
    // stub is enough to build — and therefore to assert — every real schema.
    const stub = { config: { complexity: { ultraAt: 6, liteAt: 1 }, defaultMode: 'full' } } as unknown as PonytailXPolicy
    for (const factory of [modeTool, selectTool, modelTool, statusTool]) {
      const definition = factory(stub)
      assert.match(definition.name, /^ponytail-/)
      assert.equal(typeof definition.execute, 'function')
    }
  })
})
