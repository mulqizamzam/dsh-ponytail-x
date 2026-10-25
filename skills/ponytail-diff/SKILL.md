---
name: ponytail-diff
description: >
  Diff discipline: produce the smallest complete diff and prove it. Use
  when writing or reviewing a change, fixing a bug at its root cause, or
  holding a diff to its scope; triggers: "smallest diff", "minimal
  change", "fix the root cause", "don't touch anything else", "what's in
  scope". Enumerates must-change and must-not-change, keeps error handling
  of moved code, never cuts the never-cut list, runs the relevant check
  before reporting.
whenToUse: Any time a change is being written or reviewed and its scope or proof is in question.
license: MIT
user-invocable: true
---

# Ponytail X — Diff

Produce the smallest complete diff, then prove it. "Complete" is the constraint: every place the change must reach is edited, and nothing else is. Shortness wins only after you know everything the diff must touch — a one-liner that needs decoding is not short.

Use with `ponytail-core` (rules, levels, never-cut) and `ponytail-trace` (the map of what the change must reach).

## 1. Enumerate before the first edit

Two lists, written before editing:

- MUST change: every file, symbol and caller the change must reach — from the trace map when there is one — each with the reason it is in scope.
- MUST NOT change: behavior, contracts, callers, formatting and files the task does not touch.

Anything else you notice — unrelated findings, tempting cleanups — goes to the closing report, not the diff. Scope creep enters as "while I was here"; it does not enter.

## 2. Root cause, not symptom

Fix where the defect is created, not where it is observed. Grep every caller of the symbol you touch before editing, then fix the root cause once in the shared code. A symptom patch — a guard at one call site, a swallowed error, a special case for the reported input — is a second bug wearing the first one's name.

## 3. Edit

- Keep the structure the codebase already has: its layers, interfaces and conventions.
- Code you move or merge keeps its error handling and validation; moving code is not a license to drop its checks.
- Between options of equal size, take the one that is correct on edge cases.
- New non-trivial logic (a branch, a loop, a parser, money or security, a whole new script) leaves one small test or an assert-based self-check; trivial changes need none.
- Comment only the why the code cannot show, in one line. A deliberate limit gets `shortcut: <the limit>, <when to upgrade>`.
- No abstraction, wrapper, option or config nobody asked for. Deletion beats addition.

## 4. Never cut

Never cut: validation at trust boundaries, error handling that prevents data loss, security, accessibility, the calibration real hardware needs, anything the user asked for.

This list is not a diff-size tool. A diff that only fits because a boundary check is gone is not smaller; it is unfinished.

## 5. Prove it before reporting

Run the relevant check — the test that covers the change, the failing reproduction, or the repo's check command (lint, typecheck, build) the change could affect — before reporting the work as done. Start from the most relevant check; widen when the change touches shared code or a public contract. Report a check that did not run as not run, never as passed.

## 6. Report the diff honestly

Close with:

- files changed, with lines added and removed;
- checks run and their actual result;
- what was deliberately not done: skipped options, unrelated findings, and anything on the must-not-change list you left alone;
- the risk the user must know.

Claims follow evidence: "verified by <check>" or "not verified — <reason>". Nothing is reported green that was not run.
