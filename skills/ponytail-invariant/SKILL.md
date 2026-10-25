---
name: ponytail-invariant
description: >
  Hold the repo's contract while changing it: list invariants before
  editing, verify each after, name every affected caller when one changes.
  Use when touching shared code, public API, data on disk, wire format,
  auth, or validation. Triggers: "change the API", "migrate the format",
  "rename", "edit the shared helper", /ponytail-invariant.
license: MIT
whenToUse: >
  Before editing any code other people depend on — shared helpers,
  exported interfaces, schemas, persisted data, formats, auth checks.
  Pairs with ponytail-debug (fix discipline) and ponytail-proof (evidence).
---

# Ponytail Invariant

Changing the contract is easy; changing it on purpose is the skill. Before
you edit, write down what must stay true. After you edit, prove each line.
Silent contract drift is how a one-line fix becomes next week's incident.

## Before editing — list the invariants

Name every invariant the code under change must keep. Write them down:
an unwritten invariant is an unchecked one.

- **Public API shape** — exported names, signatures, arity, types, return
  shape, error types, defaults, deprecations.
- **Data on disk** — file formats, schemas, field and column names,
  encodings, migrations: can old data still be read, and by which version?
- **Wire format** — request/response shape, field optionality, event names,
  protocol version, ordering guarantees.
- **Auth checks** — which path requires which credential or role, and what
  happens on failure. No path may gain access by accident.
- **Validation rules** — what is accepted and rejected at each trust
  boundary, and with which error and status.
- **Error behavior** — which errors are raised when, exit codes, retry and
  idempotency semantics, what is logged.
- **Data-integrity behavior** — write ordering, transactions, cleanup on
  failure, partial-write behavior.

## After editing — verify each invariant

For every invariant you listed:

- state whether it holds, with the evidence: a test run, a caller read, a
  command output.
- explicit about what was **not** checked and why. "I read the callers in
  these files" is not "there are no callers" — grep every reference before
  claiming a count.
- if an invariant is now broken, the change is not finished: either
  restore it or follow the contract-change procedure below.

## When an invariant must change

Some changes legitimately break a contract. Make the break deliberate:

1. Name the invariant and the reason it must change.
2. Name **every** caller and consumer affected: grep the whole repo for
   the symbol, format, field, event, and endpoint — code, tests, fixtures,
   docs, config, serialized data, downstream services.
3. Update them in the same change, or flag them as PENDING with the reason
   they could not be updated. A contract change with unlisted consumers is
   a broken change, not a migration.
4. Prefer the expand/contract path when data or consumers cannot move at
   once: write both shapes, read both, remove the old one after the last
   consumer is gone. One atomic cut is a lie when consumers do not move
   together.
5. Never silently change behavior at a trust boundary. Any change to
   input validation, auth, permissions, data-write ordering, or error
   swallowing must be explicit, deliberate, minimal, and stated in the
   report — even when the caller asked for it casually.

## The never-cut list

Never cut:

> validation at trust boundaries, error handling that prevents data loss,
> security, accessibility, the calibration real hardware needs, anything
> the user asked for.

Code you move, rename, or merge keeps its error handling and validation.
A refactor that drops an error path is a defect, not a cleanup.

## Adversarial checklist

Run before finishing, and answer in the report where the answer is not
obvious:

- How could this change fail?
- What edge case matters most — empty, zero, last item, concurrent writer,
  malformed input, partial write, stale cache, unicode, time zone?
- What assumption is the weakest?
- Who is affected — callers, consumers, persisted data, other processes,
  other versions, the user?
- What behavior could change unintentionally?
- Is there a simpler change with the same correctness?

The last question is the one that saves the most work: the smallest change
that preserves the invariant beats an elegant one that needs a migration.

## Report

- Invariants kept: which were checked, with what evidence, and which were
  not checked and why.
- Invariants changed: every caller or consumer named, updated or flagged.
- Report lines `INTENT`, `TWINS`, `PENDING`, `STOP` — the contract lives
  in `ponytail-proof`.

## Red flags

- Editing before the invariant list exists.
- "No other callers" without a grep.
- A trust-boundary behavior change mentioned only in the diff.
- An invariant verified by reading the code instead of running it, when
  running it was possible.
