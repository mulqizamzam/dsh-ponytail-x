#!/usr/bin/env node
/**
 * Ponytail X benchmark runner.
 *
 * Three conditions on the SAME task and acceptance criteria:
 *   baseline   — dsh headless, no ponytail skills at all
 *   upstream   — dsh headless + upstream ponytail skills (skill-filesystem)
 *   ponytail-x — dsh headless + the dsh-ponytail-x bundle (skills + policy)
 *
 * Same model, same fixture, same task text. Metrics per run:
 *   correctness  — acceptance suite passes, existing suite passes, diff stays in src/
 *   tokens       — summed run-event usage.totalTokens
 *   tool calls   — counted tool_call events
 *   duration     — wall-clock of the dsh process
 *   diff size    — added+deleted lines under git diff
 *
 * Usage:
 *   node run-benchmark.mjs --single <condition> <run>   one run, foreground
 *   node run-benchmark.mjs --runs 3 --conditions baseline,upstream,ponytail-x
 *   node aggregate.mjs                                    rebuild the report
 *
 * Results accumulate in ../bench/results/partial.jsonl, so a killed process
 * loses only the in-flight run, never the finished ones.
 *
 * Environment: NINE_ROUTER_API_KEY must be stamped into the sandboxed DSH
 * home's managed credential store (see benchmarks/README.md).
 */
import { execFileSync, spawn } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(new URL('..', import.meta.url)))
const BENCH = join(ROOT, '..', 'bench')
const DSH_HOME = process.env['BENCH_DSH_HOME'] ?? join(BENCH, 'dsh-home')
const FIXTURES_DIR = fileURLToPath(new URL('./fixtures', import.meta.url))

const TASK = 'Fix the pricing bug: orders of 10 or more must get the bulk discount applied exactly once. `node --test test/` must pass with every test green, including the existing suite in `test/prices.test.js`. Do not weaken or delete tests.'

const CONDITIONS = {
  baseline: 'px-baseline',
  upstream: 'px-upstream',
  'ponytail-x': 'px-ponytailx',
}

function parseArgs() {
  const args = process.argv.slice(2)
  const out = { runs: 3, conditions: Object.keys(CONDITIONS), task: 'pricing-fix', single: null }
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--runs') out.runs = Number(args[++index])
    else if (args[index] === '--conditions') out.conditions = args[++index].split(',')
    else if (args[index] === '--task') out.task = args[++index]
    else if (args[index] === '--single') out.single = [args[++index], args[++index]]
  }
  return out
}

function fixtureOf(task) {
  const fixture = join(FIXTURES_DIR, task)
  if (!existsSync(fixture)) throw new Error(`no fixture at ${fixture}`)
  return fixture
}

function git(dir, ...gitArgs) {
  return execFileSync('git', gitArgs, { cwd: dir, encoding: 'utf8' })
}

function scoreRun(workdir) {
  const results = {}
  for (const suite of ['acceptance.test.js', 'prices.test.js']) {
    // Exit code is the oracle: `node --test` exits non-zero on any failure.
    // Text matching is NOT used — the summary line carries an ℹ prefix, and a
    // "# fail N" pattern silently matches nothing.
    try {
      execFileSync('node', ['--test', `test/${suite}`], {
        cwd: workdir,
        encoding: 'utf8',
        stdio: ['ignore', 'ignore', 'ignore'],
      })
      results[suite] = true
    } catch {
      results[suite] = false
    }
  }
  let diffFiles = []
  try {
    diffFiles = git(workdir, 'diff', '--name-only').split('\n').filter(Boolean)
  } catch { /* repo not initialized */ }
  const outsideSrc = diffFiles.filter(file => !file.startsWith('src/'))
  let diffLines = 0
  try {
    const numstat = git(workdir, 'diff', '--numstat')
    for (const line of numstat.split('\n')) {
      const [added, deleted] = line.split('\t')
      if (added !== undefined && deleted !== undefined) diffLines += Number(added) + Number(deleted)
    }
  } catch { /* ignore */ }
  return {
    acceptance: results['acceptance.test.js'] === true,
    regressionFree: results['prices.test.js'] === true,
    srcOnlyDiff: outsideSrc.length === 0,
    diffFiles,
    diffLines,
    correct: results['acceptance.test.js'] === true && results['prices.test.js'] === true && outsideSrc.length === 0,
  }
}

function parseEvents(eventsPath) {
  let totalTokens = 0
  let toolCalls = 0
  let inputTokens = 0
  let outputTokens = 0
  for (const line of readFileSync(eventsPath, 'utf8').split('\n')) {
    if (line.trim() === '') continue
    let event
    try { event = JSON.parse(line) } catch { continue }
    if (event.type === 'tool_call') toolCalls += 1
    if (event.type === 'status' && event.phase === 'step_end' && event.usage) {
      inputTokens += event.usage.inputTokens ?? 0
      outputTokens += event.usage.outputTokens ?? 0
      totalTokens += event.usage.totalTokens ?? 0
    }
  }
  return { totalTokens, inputTokens, outputTokens, toolCalls }
}

async function runDsh(profile, workdir) {
  const started = Date.now()
  const eventsPath = join(workdir, 'run-events.jsonl')
  return await new Promise((resolve, reject) => {
    const child = spawn('dsh', ['--profile', profile, 'headless', '--json', TASK], {
      cwd: workdir,
      env: {
        ...process.env,
        DSH_HOME,
        DSH_PROFILE_DIR: '',
      },
      // stdout must be piped: 'ignore' leaves child.stdout null and the
      // event collector would throw on .on().
      stdio: ['ignore', 'pipe', 'inherit'],
    })
    const chunks = []
    child.stdout.on('data', chunk => chunks.push(chunk))
    child.on('error', reject)
    child.on('close', code => {
      writeFileSync(eventsPath, Buffer.concat(chunks).toString('utf8'))
      if (code !== 0) reject(new Error(`dsh exited ${code}`))
      else resolve({ durationMs: Date.now() - started, eventsPath })
    })
  })
}

function mean(values) {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

const PARTIAL = () => join(BENCH, 'results', 'partial.jsonl')

/** Execute exactly one (condition, run) and append its record to partial.jsonl. */
async function runOne(condition, run, fixture, options) {
  const profile = CONDITIONS[condition]
  if (!profile) throw new Error(`unknown condition ${condition}`)
  const workdir = join(BENCH, 'work', `${condition}-${run}`)
  rmSync(workdir, { recursive: true, force: true })
  cpSync(fixture, workdir, { recursive: true })
  rmSync(join(workdir, '.git'), { recursive: true, force: true })
  git(workdir, 'init', '-q')
  git(workdir, 'add', '-A')
  git(workdir, '-c', 'user.email=bench@local', '-c', 'user.name=bench', 'commit', '-qm', 'fixture')
  process.stderr.write(`[bench] ${condition} run ${run}/${options.runs} ...\n`)
  let record
  try {
    const { durationMs, eventsPath } = await runDsh(profile, workdir)
    const metrics = parseEvents(eventsPath)
    const score = scoreRun(workdir)
    record = { condition, run, task: options.task, durationMs, ...metrics, ...score }
  } catch (error) {
    record = { condition, run, task: options.task, error: String(error), correct: false }
  }
  appendFileSync(PARTIAL(), `${JSON.stringify(record)}\n`)
  rmSync(workdir, { recursive: true, force: true })
  return record
}

async function main() {
  const options = parseArgs()
  const fixture = fixtureOf(options.task)
  mkdirSync(join(BENCH, 'results'), { recursive: true })
  mkdirSync(join(BENCH, 'work'), { recursive: true })

  if (options.single) {
    const [condition, runText] = options.single
    const record = await runOne(condition, Number(runText), fixture, options)
    console.log(JSON.stringify(record))
    return
  }

  for (const condition of options.conditions) {
    for (let run = 1; run <= options.runs; run += 1) {
      await runOne(condition, run, fixture, options)
    }
  }
  console.log('runs complete — build the report with: node benchmarks/aggregate.mjs')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
