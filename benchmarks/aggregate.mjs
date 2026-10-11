#!/usr/bin/env node
/**
 * Aggregate partial.jsonl into the benchmark report.
 *
 * Reads every per-run record appended by run-benchmark.mjs and writes
 * benchmark.md (table) + benchmark.json (full detail) beside it.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(new URL('..', import.meta.url)))
const BENCH = join(ROOT, '..', 'bench')
const RESULTS = join(BENCH, 'results')

function mean(values) {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function main() {
  const partial = join(RESULTS, 'partial.jsonl')
  if (!existsSync(partial)) {
    console.error('no partial.jsonl — run at least one --single run first')
    process.exitCode = 1
    return
  }
  const records = readFileSync(partial, 'utf8')
    .split('\n')
    .filter(line => line.trim() !== '')
    .map(line => JSON.parse(line))

  const conditions = {}
  for (const record of records) {
    const bucket = (conditions[record.condition] ??= { runs: [] })
    bucket.runs.push(record)
  }
  for (const bucket of Object.values(conditions)) {
    bucket.passRate = bucket.runs.filter(r => r.correct).length / bucket.runs.length
    bucket.meanTokens = mean(bucket.runs.map(r => r.totalTokens ?? 0))
    bucket.meanInputTokens = mean(bucket.runs.map(r => r.inputTokens ?? 0))
    bucket.meanOutputTokens = mean(bucket.runs.map(r => r.outputTokens ?? 0))
    bucket.meanToolCalls = mean(bucket.runs.map(r => r.toolCalls ?? 0))
    bucket.meanDurationMs = mean(bucket.runs.map(r => r.durationMs ?? 0))
    bucket.meanDiffLines = mean(bucket.runs.map(r => r.diffLines ?? 0))
    bucket.regressions = bucket.runs.filter(r => r.regressionFree === false).length
  }

  const report = { generatedAt: new Date().toISOString(), runs: records, conditions }
  writeFileSync(join(RESULTS, 'benchmark.json'), JSON.stringify(report, null, 2))

  const lines = []
  lines.push(`# Ponytail X benchmark — ${report.generatedAt}`)
  lines.push('')
  lines.push('Conditions share the fixture (pricing-fix), the task text, the model (nine-router/ds/deepseek-v4-flash), and the acceptance criteria: acceptance suite green, existing suite green, diff limited to src/.')
  lines.push('')
  lines.push('| condition | runs | pass rate | mean tokens (in/out) | mean tool calls | mean duration (s) | mean diff lines | regressions |')
  lines.push('|---|---|---|---|---|---|---|---|')
  for (const [condition, summary] of Object.entries(conditions)) {
    lines.push(`| ${condition} | ${summary.runs.length} | ${(summary.passRate * 100).toFixed(0)}% | ${summary.meanTokens.toFixed(0)} (${summary.meanInputTokens.toFixed(0)}/${summary.meanOutputTokens.toFixed(0)}) | ${summary.meanToolCalls.toFixed(1)} | ${(summary.meanDurationMs / 1000).toFixed(1)} | ${summary.meanDiffLines.toFixed(1)} | ${summary.regressions} |`)
  }
  lines.push('')
  lines.push('Per-run detail (diff files, error text) in benchmark.json.')
  writeFileSync(join(RESULTS, 'benchmark.md'), lines.join('\n'))
  console.log(lines.join('\n'))
}

mkdirSync(RESULTS, { recursive: true })
main()
