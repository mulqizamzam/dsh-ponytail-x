// Tiny pricing module for the benchmark fixture. Contains ONE seeded bug.
'use strict'

const BULK_THRESHOLD = 10
const BULK_RATE = 0.1

/** Round to cents, half-up (string-safe enough for this fixture). */
function roundCents(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/** Unit price for a SKU. */
function unitPrice(sku) {
  const table = { widget: 9.99, gadget: 24.5, gizmo: 3.25 }
  const price = table[sku]
  if (price === undefined) throw new Error(`unknown sku: ${sku}`)
  return price
}

/**
 * Line total for a quantity of a SKU. Orders of BULK_THRESHOLD or more get
 * BULK_RATE off the line, applied exactly once.
 */
function lineTotal(sku, quantity) {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error(`quantity must be a positive integer, got ${quantity}`)
  }
  const gross = unitPrice(sku) * quantity
  // BUG (seeded for the benchmark): the bulk discount is applied twice.
  const discounted = quantity >= BULK_THRESHOLD
    ? gross * (1 - BULK_RATE) * (1 - BULK_RATE)
    : gross
  return roundCents(discounted)
}

/** Order total across lines. */
function orderTotal(lines) {
  return roundCents(lines.reduce((sum, line) => sum + lineTotal(line.sku, line.quantity), 0))
}

module.exports = { BULK_THRESHOLD, BULK_RATE, unitPrice, lineTotal, orderTotal, roundCents }
