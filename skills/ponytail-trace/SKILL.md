---
name: ponytail-trace
description: >
  Trace-before-touch: map the code before changing it. Use before editing
  unfamiliar code, any multi-file change, or work crossing module, API,
  data or trust boundaries; triggers: "trace", "map the code", "before I
  touch this", "understand the flow first", "who calls this", "what
  breaks". Expands ponytail-core's Before-you-write into entry points,
  real data flow, every caller, and blast radius.
whenToUse: Before editing code you have not read, or when a plan assumes a code path you have not verified.
license: MIT
user-invocable: true
---

# Ponytail X — Trace

You do not change code you have not mapped. Trace-before-touch runs the "Before you write" pass of `ponytail-core` as its own step: build the map first, edit second. A wrong map caught now costs a re-plan; a wrong map caught after the diff costs the diff plus its rollback.

Map first when: the code is unfamiliar, the change crosses files, modules or process boundaries, a trust boundary, data store or migration is involved, or the reported bug locus is unverified.

## 1. Find the entry points

Find where execution actually starts for the feature under change:

- the user-facing entry: route handler, command, CLI flag, UI event handler, scheduled job, queue consumer, or public export another system calls;
- the entry the user's request names — not the one the folder layout suggests;
- for a bug: the entry that reproduces it, not the entry that first shows the symptom.

Name the file and symbol for each entry point. No entry point found means the map is incomplete: keep looking, or say plainly that you could not find it.

## 2. Follow the real data flow

Follow the actual path from entry to end for the feature under change:

- the real functions and modules the data passes through — read the code; do not infer from names, folder layout, or what similar projects do;
- every place the data changes shape, ownership or meaning: serialize, parse, copy, cache, queue, async hop;
- where it ends: store, response, log, external call, or user-visible output.

The map covers the feature under change, not the whole system.

## 3. List every place the change must reach

Enumerate callers, tests, fixtures, config, exports, migrations — or state explicitly that the change reaches none of one kind.

- grep for the symbol, the string and the config key, not just imports: dispatch tables, DI wiring, generated code and serialized names all survive an import-only search;
- record the callers you decided not to change, with the reason;
- tests and fixtures that encode current behavior are in scope; a test that fails for an unrelated reason is reported, not silently skipped.

## 4. Mark trust boundaries and blast radius

Mark each trust boundary the flow crosses: untrusted input, an auth or permission check, a secret, a cross-tenant or cross-user path. For each boundary and store touched, state what the change could destroy or expose: records lost or corrupted, secrets or personal data exposed, callers that stop working. That list is scope. Extra features are not.

## 5. Record the map before editing

Write the map in your reply as a short numbered list before the first edit:

1. Entry points: file + symbol.
2. Data flow: the path, in order.
3. Change must reach: the enumerated list.
4. Boundaries and what could break.
5. Open questions, or "none".

Keep it to what a reader needs to check the plan. The map is evidence for the plan, not documentation.

## 6. Map contradicts plan → stop and re-plan

If the map contradicts the plan — the function is not called where you thought, the data never reaches the code you were about to edit, the boundary or owner is elsewhere — stop and re-plan from the map. Do not patch over a wrong premise, and do not edit code to force it to match the plan. State what contradicted the premise, then re-plan.

Hand the finished map to `ponytail-core` (levels, ladder, never-cut) and `ponytail-diff` (smallest complete diff). Do not start editing while the map has open questions.
