/**
 * E2E: the shipped bundle artifact itself — package.json declares the bundle
 * patch, the patch parses under the loader's YAML dialect (with !!js inert
 * scalars), the two expected entries exist with a resolvable skills dir, and
 * the skills directory resolves beside the package.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
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
})
