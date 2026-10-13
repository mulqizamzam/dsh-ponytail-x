/**
 * E2E: the shipped bundle artifact itself — package.json declares the bundle
 * patch, the patch parses under the loader's YAML dialect (with !!js inert
 * scalars), the two expected entries exist with a resolvable skills dir, and
 * the skills directory resolves beside the package.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import yaml from 'js-yaml'

const ROOT = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/+$/, '')

/** js-yaml schema that loads the loader's `!!js` scalars as plain strings. */
const JS_INERT_SCHEMA = yaml.DEFAULT_SCHEMA.extend([
  new yaml.Type('tag:yaml.org,2002:js', {
    kind: 'scalar',
    construct: (data: string) => data,
  }),
])

interface PatchEntry {
  id?: unknown
  name?: unknown
  config?: Record<string, unknown> & {
    customSkillDirs?: unknown
  }
  disabled?: unknown
}

describe('bundle artifact', () => {
  it('package.json declares the bundle patch and engine floor', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      name?: string
      dsh?: { bundle?: { patch?: string }; engines?: { dsh?: string } }
    }
    assert.equal(pkg.name, 'dsh-ponytail-x')
    assert.equal(pkg.dsh?.bundle?.patch, './cordis.patch.yml')
    assert.match(pkg.dsh?.engines?.dsh ?? '', />=0\.2\.0-rc\.2/)
  })

  it('cordis.patch.yml parses and inserts the two entries', () => {
    const text = readFileSync(join(ROOT, 'cordis.patch.yml'), 'utf8')
    const patches = yaml.load(text, { schema: JS_INERT_SCHEMA }) as { insert?: PatchEntry[] }[]
    assert.ok(Array.isArray(patches), 'patch root is a YAML array')
    const entries = patches.flatMap(patch => (Array.isArray(patch.insert) ? patch.insert : []))
    const ids = entries.map(entry => entry.id)
    assert.ok(ids.includes('ponytail-x'), 'policy entry id ponytail-x')
    assert.ok(ids.includes('ponytail-x-skills'), 'skills entry id ponytail-x-skills')

    const policy = entries.find(entry => entry.id === 'ponytail-x')
    assert.equal(policy?.name, 'dsh-ponytail-x')
    assert.equal((policy?.config as { defaultMode?: string })?.defaultMode, 'full')

    const skills = entries.find(entry => entry.id === 'ponytail-x-skills')
    assert.equal(skills?.name, '@deepseek-ai/dsh-skill-filesystem')
    const skillsConfig = skills?.config as { providerName?: string; includeDefaultRoots?: unknown; customSkillDirs?: string[] }
    assert.equal(skillsConfig?.providerName, 'ponytail-x')
    assert.equal(skillsConfig?.includeDefaultRoots, false)
    assert.equal(typeof skillsConfig?.customSkillDirs?.[0], 'string', 'the !!js skills dir expression is present')
  })

  it('the skills dir expression resolves beside this package', () => {
    const require = createRequire(join(ROOT, 'package.json'))
    const resolved = require.resolve('dsh-ponytail-x/package.json')
    assert.equal(dirname(resolved), ROOT)
    assert.ok(existsSync(join(ROOT, 'skills')), 'skills/ ships beside the package root')
  })

  // Proof test for the dead-patch-key defect: the patch used to declare
  // models.A/models.B, which the config schema does not name — the values
  // silently vanished and defaults applied. The patch and the schema must
  // agree on the model profile keys and the ids.
  it('the patch model keys match the config schema and the verified catalog', async () => {
    const text = readFileSync(join(ROOT, 'cordis.patch.yml'), 'utf8')
    const patches = yaml.load(text, { schema: JS_INERT_SCHEMA }) as { insert?: PatchEntry[] }[]
    const policy = patches.flatMap(patch => (Array.isArray(patch.insert) ? patch.insert : []))
      .find(entry => entry.id === 'ponytail-x')
    const models = (policy?.config as { models?: Record<string, { model?: string }> })?.models ?? {}
    assert.deepEqual(Object.keys(models).sort(), ['astra', 'fable'])
    const { DEFAULT_CATALOG } = await import('../../src/models.ts')
    assert.equal(models['astra']?.model, DEFAULT_CATALOG.astra.model)
    assert.equal(models['fable']?.model, DEFAULT_CATALOG.fable.model)
  })

  it('the declared types path is the one tsc emits', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      types?: string
      exports?: Record<string, { types?: string }>
    }
    assert.equal(pkg.types, './lib/index.d.ts')
    assert.equal(pkg.exports?.['.']?.types, './lib/index.d.ts')
  })

  it('the benchmark scripts parse and share the bench-path resolver', async () => {
    const runner = readFileSync(join(ROOT, 'benchmarks', 'run-benchmark.mjs'), 'utf8')
    const aggregator = readFileSync(join(ROOT, 'benchmarks', 'aggregate.mjs'), 'utf8')
    // The duplicate existsSync import once made the runner unparseable; keep
    // it unparseable-proof and keep both ends on the shared resolver.
    const { execFileSync } = await import('node:child_process')
    for (const script of ['run-benchmark.mjs', 'aggregate.mjs', 'bench-paths.mjs']) {
      execFileSync(process.execPath, ['--check', join(ROOT, 'benchmarks', script)])
    }
    assert.match(runner, /bench-paths\.mjs/)
    assert.match(aggregator, /bench-paths\.mjs/)
  })

  it('the aggregator honors BENCH_DIR so it reads where the runner writes', async () => {
    const { execFileSync } = await import('node:child_process')
    const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const bench = mkdtempSync(join(tmpdir(), 'ponytail-bench-'))
    mkdirSync(join(bench, 'results'), { recursive: true })
    writeFileSync(join(bench, 'results', 'partial.jsonl'),
      `${JSON.stringify({ condition: 'probe', run: 1, correct: true, totalTokens: 10, toolCalls: 1, durationMs: 100, diffLines: 2 })}\n`)
    try {
      const output = execFileSync(process.execPath, [join(ROOT, 'benchmarks', 'aggregate.mjs')], {
        encoding: 'utf8',
        env: { ...process.env, BENCH_DIR: bench },
      })
      assert.match(output, /probe/)
    } finally {
      rmSync(bench, { recursive: true, force: true })
    }
  })
})
