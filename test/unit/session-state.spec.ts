/**
 * Unit: session state store — per-session metrics, bounded size.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { SessionStateStore, emptyMetrics } from '../../src/state/session-state.ts'

describe('SessionStateStore', () => {
  it('ensures one entry per session with sane defaults', () => {
    const store = new SessionStateStore()
    const first = store.ensure('s1', 1000)
    assert.equal(first.mode, 'full')
    assert.equal(first.override, null)
    assert.equal(first.toolCalls, 0)
    assert.equal(store.ensure('s1', 2000), first, 'ensure is idempotent')
  })

  it('updates merge into the existing entry', () => {
    const store = new SessionStateStore()
    store.ensure('s1', 1000)
    store.update('s1', { toolCalls: 3 })
    store.update('s1', { turns: 2 })
    const state = store.get('s1')
    assert.equal(state?.toolCalls, 3)
    assert.equal(state?.turns, 2)
  })

  it('stays bounded past 256 sessions', () => {
    const store = new SessionStateStore()
    for (let index = 0; index < 300; index += 1) store.ensure(`s${index}`, index)
    assert.equal(store.size(), 256)
  })
})

describe('emptyMetrics', () => {
  it('records the override it was created with', () => {
    const metrics = emptyMetrics('ultra', 500)
    assert.equal(metrics.override, 'ultra')
    assert.equal(metrics.startedAt, 500)
    assert.equal(metrics.source, 'default')
  })
})
