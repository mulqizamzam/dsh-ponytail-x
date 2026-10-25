#!/usr/bin/env node
/**
 * Shared bench-path resolution for the Ponytail X benchmark harness.
 *
 * The bench workspace (dsh-home sandbox + results) lives outside the plugin
 * now that the plugin is installed under dsh-custom/plugins. Both the runner
 * (run-benchmark.mjs) and the aggregator (aggregate.mjs) resolve it here so
 * they can never disagree about where partial.jsonl lives.
 *
 * Resolution order:
 *   1. BENCH_DIR env var (explicit)
 *   2. <plugin>/../bench (the old in-suite layout)
 *   3. the operator's absolute pxpipe location
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PLUGIN_ROOT = join(fileURLToPath(new URL('..', import.meta.url)))

export function resolveBench() {
  if (process.env['BENCH_DIR']) return process.env['BENCH_DIR']
  const sibling = join(PLUGIN_ROOT, '..', 'bench')
  if (existsSync(sibling)) return sibling
  return '/home/administrator/agent-workspace/pxpipe/bench'
}

export function benchResultsDir() {
  return join(resolveBench(), 'results')
}
