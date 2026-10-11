---
name: ponytail-debug
description: >
  Debugging for surgical mode: reproduce the failure exactly, localize by
  bisect, root-cause it, fix once in shared code, leave one test that fails
  on the unfixed code. Use when fixing a bug, a test fails, an error must
  be diagnosed, or the bug locus is known. Triggers: "fix this bug", "why
  does this fail", "stack trace", "debug this", "regression",
  /ponytail-debug.
license: MIT
whenToUse: >
  During surgical mode (known bug locus) and any fix task. Debug the failure
  before touching code; autopsy mode covers failures of the past.
---

# Ponytail Debug

Surgical mode is a debugging mode: the bug locus is known, so the job is a
minimal diff at the root cause, with one proof test, and no refactor. Work
the six steps in order. Skipping reproduce or localize is how you fix the
wrong thing.

## 1. Reproduce first

Before touching code, name the exact command and the observed failure:

- The command: `pnpm test -- path/to/file.test.ts`, `node scripts/x.mjs`,
  the HTTP request, the exact user action.
- The observed failure: the real message, assertion, exit code, or
  malformed output — plus how it differs from the expected result.
- Read the *real* error, never the assumed one: full stack, the actual
  values at the failing line, the first frame inside this repo. Quote the
  error, don't paraphrase it from memory.
- If it cannot be reproduced: say so in one line and stop guessing. Either
  get a reproducer (input, seed, data, environment, timing) or treat the
  task as autopsy mode — timeline, root cause, prevention rule, postmortem
  artifact. A fix for an unreproduced bug is a guess with extra steps.
- Determinism check: run it three times. If it fails intermittently, name
  the variable (concurrency, clock, random, order, cache) — that variable
  is a debugging lead, not noise to be averaged away.

## 2. Localize by bisect

Narrow the failure to the smallest input or the exact failing assertion:

- Halve the input space: comment out halves, bisect a config, reduce a
  diff, or split the data until one line fails one assertion.
- End state: one function, one input, one wrong output. If you cannot get
  there, your localization is incomplete — keep narrowing before editing.
- git bisect is legitimate only when the failure appeared mid-history, the
  repo state allows it, and each candidate commit is actually runnable.
  Never use destructive history operations, and never bisect a working tree
  you did not clean yourself.
- Write down the disagreement: "the code assumes X, reality is Y." The bug
  is exactly where assumption and reality part ways.

## 3. Root cause, not the error site

- The failing line is usually the *symptom*. Trace backwards until you find
  the code that had wrong information — the function that accepted a bad
  value, dropped an error, or computed from a stale assumption. Fixing at
  the error site while the cause lives elsewhere is a failed fix.
- Grep every caller of the function you touch *before* editing. Fix the
  root cause once in the shared code. Fixing one caller while the shared
  function stays broken leaves the same defect waiting for the other
  callers — that is a failed fix, not a partial one.
- Classify the failure with evidence: implementation bug, test bug,
  dependency, configuration, environment, or wrong assumption. Name which.
- Multiple candidate causes? Do not pretend to know. Design the cheapest
  experiment that discriminates between them, run it, then conclude.
- One cause can hide behind another. When the first fix removes the crash
  but leaves wrong results, you have not finished.

## 4. Fix once, at the root cause

- Smallest diff that removes the cause, in the shared code. Surgical means
  no refactor, no rename, no "while I'm here" cleanup, no reformatting of
  untouched lines.
- Code you move or merge keeps its error handling and validation. Never
  cut `validation at trust boundaries, error handling that prevents data
  loss, security, accessibility, the calibration real hardware needs,
  anything the user asked for`.
- Do not narrow the symptom: no try/catch that swallows, no loosened
  validation, no special case for the reported input when the same defect
  hits every input like it.
- If the correct fix is larger than the reported symptom, make it and say
  why the small fix would be wrong — name the other inputs that stay
  broken. Correctness outranks diff size.

## 5. Guard the fix

- Leave one test that FAILS on the unfixed code and PASSES on the fixed
  code. You must have seen it fail; a test that passes on the first run
  proves nothing. This is the defect/test twin, and the contract lives in
  `ponytail-proof`.
- The test encodes the reproducer: same input, assertion on output. Use
  the repo's framework and the closest existing test as the pattern.
- Cannot automate it (real hardware, external service)? Leave the smallest
  assert-based self-check, or label the change UNPROVEN with the reason.
- Forbidden: weakening tests, deleting assertions, swallowing exceptions,
  changing the environment to make red green. Green bought that way is a
  lie, and the next person pays for it.

## 6. Report

- `INTENT` — one sentence: what changed and why.
- Verified — the exact commands re-run, with the output actually read:
  the failing test before, the passing test after.
- Unverified — what was not checked and why. "Cannot reproduce" is a
  legitimate report; a guessed cause dressed as a diagnosis is not.
- If unfixed: the blocker and the evidence that stopped you.

## Red flags — stop and restart

- Editing code before the failure is reproduced.
- Fix at the first error site with no trace back to the cause.
- "It works on my machine" as a diagnosis.
- A test that passes immediately; no test at all.
- Weakening anything to reach green.

All of these mean: back to step 1.
