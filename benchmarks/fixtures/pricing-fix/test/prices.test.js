// Existing regression suite — must keep passing before AND after the fix.
'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { unitPrice, lineTotal, orderTotal, roundCents } = require('../src/prices.js')

test('unit prices come from the table', () => {
  assert.equal(unitPrice('widget'), 9.99)
  assert.equal(unitPrice('gadget'), 24.5)
  assert.equal(unitPrice('gizmo'), 3.25)
})

test('unknown sku throws', () => {
  assert.throws(() => unitPrice('nope'), /unknown sku/)
})

test('quantity must be a positive integer', () => {
  assert.throws(() => lineTotal('widget', 0), /positive integer/)
  assert.throws(() => lineTotal('widget', -1), /positive integer/)
  assert.throws(() => lineTotal('widget', 1.5), /positive integer/)
})

test('small orders are not discounted', () => {
  assert.equal(lineTotal('gizmo', 3), 9.75)
  assert.equal(lineTotal('gadget', 2), 49)
})

test('order totals sum the lines', () => {
  // 6.50 + 9.99 = 16.49 after cents rounding (exact literal, not a float sum)
  assert.equal(orderTotal([{ sku: 'gizmo', quantity: 2 }, { sku: 'widget', quantity: 1 }]), 16.49)
})

test('rounding is half-up to cents', () => {
  assert.equal(roundCents(1.005), 1.01)
  assert.equal(roundCents(2.675), 2.68)
})
