#!/usr/bin/env node
/**
 * Local-link dependency setup for this checkout.
 *
 * The devDependencies are `link:` paths into the DeepSeek Harness checkout,
 * following the operator's existing plugin convention (cf.
 * dsh-custom/plugins/fable-5-1-dsh). pnpm refuses a bare `install` here
 * because the parent workspace's storeDir is unwritable from this sandbox,
 * so this script pins a workspace-local store and installs.
 *
 * Usage: node scripts/link-deps.mjs
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const storeDir = join(root, '..', '.pnpm-store')
mkdirSync(storeDir, { recursive: true })

execFileSync('pnpm', ['install', '--ignore-workspace', '--store-dir', storeDir], {
  cwd: root,
  stdio: 'inherit',
})
console.log('link-deps: installed with store', storeDir)
