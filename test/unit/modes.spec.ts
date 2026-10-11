/**
 * Unit: the adaptive mode core — signals, scores, selection, gestures,
 * and the resolution chain. All pure functions.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_THRESHOLDS,
  MODE_IDS,
  MODE_SUMMARY,
  extractSignals,
  gestureMode,
  parseModeSetting,
  resolveMode,
  scoreModes,
  selectMode,
} from '../../src/modes.ts'

describe('extractSignals', () => {
  it('is total: any string yields signals without throwing', () => {
    const signals = extractSignals('')
    assert.equal(signals.length, 0)
    assert.equal(signals.pathCount, 0)
    for (const mode of MODE_IDS) assert.ok(MODE_SUMMARY[mode].length > 0)
  })

  it('counts paths, risk words, and detects stack traces', () => {
    const signals = extractSignals('Fix the auth bug in src/login/handler.ts:42\nat foo (/app/x.js:1:2)')
    assert.ok(signals.pathCount >= 2, `paths: ${signals.pathCount}`)
    assert.ok(signals.riskHits >= 1, 'auth is a risk word')
    assert.equal(signals.hasStackTrace, true)
    assert.equal(signals.hasFileLine, true)
  })
})

describe('parseModeSetting', () => {
  it('accepts the five modes and off, case-insensitively; rejects anything else', () => {
    assert.equal(parseModeSetting('ultra'), 'ultra')
    assert.equal(parseModeSetting(' OFF '), 'off')
    assert.equal(parseModeSetting('Surgical'), 'surgical')
    assert.equal(parseModeSetting('review'), null)
    assert.equal(parseModeSetting(42), null)
  })
})

describe('selectMode', () => {
  const select = (text: string) => selectMode(extractSignals(text)).mode

  it('picks surgical for a fix with a stack trace', () => {
    assert.equal(select('fix this crash\nat Object.<anonymous> (/srv/app/index.js:10:5)'), 'surgical')
  })

  it('picks autopsy for a postmortem/why-did prompt', () => {
    assert.equal(select('Why did the import start failing after yesterday? It used to work.'), 'autopsy')
  })

  it('picks ultra for long multi-path risky tasks', () => {
    const text = `Production migration for the billing schema: update src/db/migrate/001_add_invoices.ts,
      then src/api/invoices.ts and src/web/billing/InvoiceTable.tsx, and also src/api/reports.ts.
      We must not lose data. ${'additional detail '.repeat(40)}`
    assert.equal(select(text), 'ultra')
  })

  it('picks lite for a short bounded request', () => {
    assert.equal(select('rename the button label to Save'), 'lite')
  })

  it('picks lite for an ordinary small single-path task', () => {
    assert.equal(select('add a total row to the orders table page and wire the sum from the API'), 'lite')
  })

  it('falls back to full for medium work with paths but no risk', () => {
    assert.equal(select('update the total row in src/orders/Table.tsx and src/api/orders.ts to match the new spec'), 'full')
  })

  it('honors thresholds from config', () => {
    const signals = extractSignals('short task')
    const strict = selectMode(signals, { ultraAt: 0, liteAt: 10 })
    assert.equal(strict.mode, 'ultra')
    const loose = selectMode(signals, { ultraAt: 100, liteAt: 100 })
    assert.equal(loose.mode, 'full')
  })
})

describe('gestureMode', () => {
  it('reads /ponytail <mode> and /ponytail-<skill> <mode>', () => {
    assert.equal(gestureMode('/ponytail ultra please'), 'ultra')
    assert.equal(gestureMode('/ponytail-core surgical'), 'surgical')
    assert.equal(gestureMode('please run /ponytail-diff full now'), 'full')
  })

  it('reads off phrases and ignores ordinary text', () => {
    assert.equal(gestureMode('stop ponytail'), 'off')
    assert.equal(gestureMode('normal mode'), 'off')
    assert.equal(gestureMode('fix the login bug'), null)
    assert.equal(gestureMode(''), null)
  })
})

describe('resolveMode', () => {
  const base = { explicit: null, gesture: null, text: '', defaultMode: 'full' as const }

  it('explicit override wins over everything', () => {
    const resolved = resolveMode({ ...base, explicit: 'autopsy', gesture: 'ultra', text: '/ponytail full' })
    assert.equal(resolved.setting, 'autopsy')
    assert.equal(resolved.source, 'explicit')
  })

  it('off override disables injection', () => {
    const resolved = resolveMode({ ...base, explicit: 'off' })
    assert.equal(resolved.setting, 'off')
    assert.equal(resolved.mode, undefined)
  })

  it('gesture beats adaptive', () => {
    const resolved = resolveMode({ ...base, gesture: 'lite', text: 'production migration with security review and money paths' })
    assert.equal(resolved.mode, 'lite')
    assert.equal(resolved.source, 'gesture')
  })

  it('adaptive beats default', () => {
    const resolved = resolveMode({ ...base, text: 'why did this keep failing since the deploy? used to work' })
    assert.equal(resolved.mode, 'autopsy')
    assert.equal(resolved.source, 'adaptive')
  })

  it('default applies when no signal fires', () => {
    const resolved = resolveMode({ ...base, defaultMode: 'full' })
    assert.equal(resolved.source, 'default')
    assert.equal(resolved.mode, 'full')
  })
})

describe('thresholds', () => {
  it('defaults match the shipped patch', () => {
    assert.deepEqual(DEFAULT_THRESHOLDS, { ultraAt: 6, liteAt: 1 })
  })
})

describe('scoreModes', () => {
  it('reports reasons when a mode fires', () => {
    const scores = scoreModes(extractSignals('fix the failing test in src/a.test.js'))
    assert.ok(scores.reasons.some(r => r.includes('surgical')))
  })
})
