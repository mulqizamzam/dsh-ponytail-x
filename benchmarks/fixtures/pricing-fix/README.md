# Benchmark fixture: pricing-fix

A tiny zero-dependency Node repo with ONE seeded bug in `src/prices.js`: the
bulk discount (10% for quantity >= 10) is applied twice.

## Task given to the agent (identical for every condition)

> Fix the pricing bug: orders of 10 or more must get the bulk discount applied
> exactly once. `node --test test/` must pass with every test green, including
> the existing suite in `test/prices.test.js`. Do not weaken or delete tests.

## Acceptance criteria (scored mechanically by the runner)

1. `node --test test/acceptance.test.js` passes (the bug is actually fixed).
2. `node --test test/prices.test.js` still passes (no regression).
3. Diff limited to `src/` — test files untouched (no test weakening).

## Files

| File | Role |
|---|---|
| `src/prices.js` | pricing module with the seeded double-discount bug |
| `test/acceptance.test.js` | the failing acceptance check (fails before the fix) |
| `test/prices.test.js` | the pre-existing suite (passes before and after) |
