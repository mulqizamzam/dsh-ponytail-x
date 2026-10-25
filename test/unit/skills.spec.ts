/**
 * Unit: the six shipped skills parse under the dsh skill-filesystem
 * frontmatter contract (name + description required, kebab-case names).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'

const SKILLS_DIR = join(fileURLToPath(new URL('../../skills', import.meta.url)))
const EXPECTED = [
  'ponytail-core',
  'ponytail-trace',
  'ponytail-debug',
  'ponytail-diff',
  'ponytail-proof',
  'ponytail-invariant',
]
const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

interface Frontmatter {
  name?: unknown
  description?: unknown
  license?: unknown
}

function parseSkill(name: string): { frontmatter: Frontmatter; body: string } {
  const path = join(SKILLS_DIR, name, 'SKILL.md')
  assert.ok(existsSync(path), `${path} must exist`)
  const text = readFileSync(path, 'utf8')
  const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  assert.ok(match, `${name}: frontmatter block missing`)
  const frontmatter = yaml.load(match[1]!) as Frontmatter
  return { frontmatter, body: match[2]! }
}

describe('skills registry', () => {
  it('ships exactly the six expected skill directories', () => {
    const dirs = readdirSync(SKILLS_DIR, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .sort()
    assert.deepEqual(dirs, [...EXPECTED].sort())
  })

  for (const name of EXPECTED) {
    it(`${name}: valid frontmatter and a non-trivial body`, () => {
      const { frontmatter, body } = parseSkill(name)
      assert.equal(typeof frontmatter.name, 'string', 'name must be a string')
      assert.equal(frontmatter.name, name, 'frontmatter name must match the directory')
      assert.match(frontmatter.name as string, NAME_RE, 'name must be kebab-case')
      assert.equal(typeof frontmatter.description, 'string', 'description is required')
      assert.ok((frontmatter.description as string).length > 40, 'description carries routing detail')
      assert.ok(body.trim().length > 800, 'body carries real instructions')
    })
  }

  it('core declares the mode argument hint', () => {
    const path = join(SKILLS_DIR, 'ponytail-core', 'SKILL.md')
    const text = readFileSync(path, 'utf8')
    assert.match(text, /argument-hint:/, 'core must advertise the mode argument hint')
  })
})
