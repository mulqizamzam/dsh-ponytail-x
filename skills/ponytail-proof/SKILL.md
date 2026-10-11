---
name: ponytail-proof
description: >
  Proof tests and honest verification: non-trivial logic ships with a test
  that fails on the broken code; every claim is backed by a re-run
  command. Use when finishing code, claiming tests pass, or verifying a
  fix. Triggers: "is it done", "tests pass", "verify this", "ship it",
  /ponytail-proof.
license: MIT
whenToUse: >
  Any time work is about to be reported as done, fixed, or passing — in
  every mode. Companion to ponytail-debug (the guard step) and
  ponytail-invariant (the checklist step).
---

# Ponytail Proof

A change is proven, not believed. The proof is a test that fails on the
broken code and passes on the fixed one, plus a claim you can re-run.
Everything else is a guess wearing a uniform.

## What needs a proof

Ship one small test or an assert-based self-check for any new non-trivial
logic:

- a branch, a loop, a parser, a validator, a formatter
- money or security paths
- any whole new script, module, or app
- every bug fix — the fix without a failing-first test is unverified

Trivial changes (a comment, a local rename, one-line formatting) need
none. When in doubt, write the test: it is minutes, and it is the only
thing that separates "done" from "looks done".

## The proof test contract

A proof test must satisfy all four:

1. **PASSES on the fixed code.** Obvious, and not sufficient on its own.
2. **FAILS on the reverted (broken) code.** You must have observed this
   failure — revert the fix, run, watch red, restore the fix, run, watch
   green. A test that never failed tells you nothing about the fix.
3. **Runnable by someone who did not write it.** Name the command
   (`pnpm test -- path/to/file.test.ts`), no hidden setup, no dependence on
   local state or your session.
4. **Asserts behavior, not implementation.** Input in, expected output out,
   named after the defect or the rule it pins. One focused test beats a
   suite of tautologies.

Use the repo's existing framework and the closest existing test as the
pattern. A test outside the project's runner is a test nobody runs.

## When proof is impossible

- Label the change `UNPROVEN` with the reason: needs real hardware, an
  external service, a soak, an environment nobody can reproduce here.
- UNPROVEN is a report, not a confession. State what was checked instead
  and what would close the gap.
- Never present a confirmation as a proof: "looks right", "I manually
  checked", "should work", "the logic is simple" are not verification.
  A confidence level is not an observation.

## Verification claims

- Re-run the named command and read the output before reporting. The
  output is the evidence; the memory of a green run is not.
- "Tests pass" without output is not a claim, it is a guess. Quote the
  command and the line that proves it.
- If a command cannot run, say why and say what that leaves unverified.
- Calibrate language to evidence: "verified by `<cmd>`" vs "unverified
  because `<reason>`" vs "assumed `<x>` pending `<check>`".

## Report lines when finishing work

Four lines at the end of finished work. A required line that is absent is
a defect, not a style issue.

- `INTENT` — what changed and why (required whenever behavior changed).
- `TWINS` — the defect and its proof test; or `UNPROVEN` with the reason.
  Required for every fix and every new non-trivial logic.
- `PENDING` — what remains and why it is blocked. "Nothing" is a value.
- `STOP` — which stop condition fired and why. "None" is a value.

Stop conditions: the failure cannot be reproduced; the proof is impossible
without an UNPROVEN label; a required invariant is missing or unverified;
the failure is not understood enough to fix; a command that would verify
the change cannot run.

## Red flags

- Reporting "tests pass" with no command in the same reply.
- A test written after the fix and never run against the broken code.
- An assertion deleted, flipped, or scoped down so the suite goes green.
- Work reported as done with PENDING items left unstated.
- "PENDING: none" hiding an item you chose not to check.
