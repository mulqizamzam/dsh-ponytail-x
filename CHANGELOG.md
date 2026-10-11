# Changelog

## 1.0.0 — 2026-10-11

First release of Ponytail X, a fork of
[DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) (MIT)
specialized for DeepSeek Harness 0.2.0-rc.2.

### Added
- Six skills on the native `@deepseek-ai/dsh-skill-filesystem` provider:
  `ponytail-core` (upstream rule set verbatim + modes + evidence lines),
  `ponytail-trace`, `ponytail-debug`, `ponytail-diff`, `ponytail-proof`,
  `ponytail-invariant`.
- Policy service (`ctx.ponytailX`) with per-step mode resolution:
  explicit override > `/ponytail` gesture > adaptive scoring > default.
- Five modes: `lite`, `full`, `ultra` (upstream parity) plus `surgical`
  and `autopsy` (new).
- Tools: `ponytail.mode`, `ponytail.select`, `ponytail.model`,
  `ponytail.status`.
- Model profiles `astra` (`th/gpt-6-astra`) and `fable`
  (`th/claude-fable-5.1`) — real router ids, validated live, host-level
  activation via `agent-default-model` (no core modification).
- Session metrics: turns, steps, tool calls, approximate output tokens,
  elapsed time.
- 54 tests (unit + integration + e2e), benchmark harness with a seeded-bug
  fixture and mechanical acceptance scoring.

### Known limitations
- The router's `th/` route currently has no active upstream credentials
  (`No active credentials for provider: tokenharbor`); the two configured
  model ids are advertised but not completable at ship time. The shipped
  benchmark therefore runs all conditions on the operator's working
  default model.
- `llm/stream` token accounting is approximate (chars/4, per chunk);
  `usage.totalTokens` from run events is the exact number and is what the
  benchmark reports.
