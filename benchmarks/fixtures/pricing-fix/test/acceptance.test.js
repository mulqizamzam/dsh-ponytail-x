// Acceptance check — the task is done when this passes.
'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { lineTotal, orderTotal } = require('../src/prices.js')

test('bulk quantity applies the 10% discount exactly once', () => {
  // 9.99 * 10 = 99.90; one 10% discount -> 89.91
  assert.equal(lineTotal('widget', 10), 89.91)
})

test('below-threshold quantity is not discounted', () => {
  assert.equal(lineTotal('widget', 9), 89.91)
})

test('order totals aggregate discounted lines once', () => {
  const total = orderTotal([
    { sku: 'widget', quantity: 10 },
    { sku: 'gizmo', quantity: 4 },
  ])
  // 89.91 + 13.00 = 102.91 (rounded to cents; never a float expression —
  // the suite must pass on correct code, not trap IEEE-754 noise)
  assert.equal(total, 102.91)
})
