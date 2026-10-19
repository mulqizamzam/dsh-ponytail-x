# Ponytail X — Design

Fork of [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) (MIT),
specialized for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
plugin system (DSH 0.2.0-rc.2, Cordis plugins).

## Evidence base (verified during inspection)

| Fact | Evidence |
|---|---|
| DSH plugins are Cordis plugins: `export const name`, `export const inject`, `export function apply(ctx, config)` or a `Service` subclass as default export | `dsh-custom/plugins/dsh-omni-auto/lib/index.js`, `fable-5-1-dsh/src/policy-service.ts` |
| A bundle declares `package.json` → `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }` and is listed in the profile's `dsh.profile.bundles` + `link:` dependency | `fable-5-1-dsh/package.json`, `.dsh/profiles/web/package.json` |
| Patch entries are a YAML array of `{insert: [{id, name, config}], config: {...}, disabled}` items; `!!js` expressions allowed | `dsh --dump-config-schema --profile web`, `.dsh/profiles/web/cordis.patch.yml` |
| Skills are `SKILL.md` files (frontmatter: `name`, `description` required; `whenToUse`, `user-invocable`, `disable-model-invocation` optional; name must match `^[a-z0-9]+(?:-[a-z0-9]+)*$`) served by `@deepseek-ai/dsh-skill-filesystem` with `providerName` + `customSkillDirs` | `packages/skill/skill-filesystem/src/index.ts`, `packages/skill/skill/src/index.ts` |
| A user message starting with `/<name>` deterministically loads a user-invocable skill as injected instructions | `packages/skill/tool-skill/src/index.ts` (`SKILL_GESTURE` + `agent/pre-step` listener) |
| Events: `agent/pre-step` (waterfall, payload `{agent, messages, turn, step, signal}`, must call `next()`), `session/event` (emit, `(session, event)`), `session/created`, `session/disposed`, `tools/result` (emit), `llm/stream` (waterfall) | fable hooks, omni-auto `lib/index.js`, tool-skill |
| Tools: `defineTool({name, description, parameters, output: {schema, render}, execute})` registered via `ctx.tools.register` | `packages/core/tools`, fable `src/tools/shared.ts` |
| Model routing is host config: `agent-default-model` service, settings key `agent-default-model: {provider, model, reasoningEffort}`; providers declare models with `reasoningEfforts` map | `packages/core/agent-default-model/src/index.ts`, `.dsh/settings.yaml` |
| Live router models include `th/gpt-6-astra` (ctx 272k, tools, reasoning, thinkingFormat openai) and `th/claude-fable-5.1` (ctx 1M, tools, reasoning, thinkingFormat claude-budget) | `GET http://localhost:20128/v1/models` (probe 2026-10-11) |
| `th/*` route currently answers `No active credentials for provider: tokenharbor`; `oc/mimo-v2.6-flash-free(xhigh)` works | chat-completions probes 2026-10-11 |
| `dsh headless --json "<task>"` runs one task and emits NDJSON run events (benchmark vehicle) | `dsh headless --help` |

## Architecture

```
ponytail-x/                      # deliverable repo
├── package.json                 # name dsh-ponytail-x, dsh.bundle.patch, engines.dsh
├── cordis.patch.yml             # insert: policy entry + skill-filesystem entry
├── LICENSE                      # MIT, upstream copyright preserved + fork notice
├── THIRD_PARTY_NOTICES.md       # ponytail upstream MIT attribution
├── README.md                    # install/config/troubleshooting
├── CHANGELOG.md
├── DESIGN.md                    # this file
├── src/
│   ├── index.ts                 # bundle entry: default export = PonytailXPolicy
│   ├── policy-service.ts        # Cordis Service: config, state, wiring
│   ├── config/
│   │   └── schema.ts            # Schemastery Config + resolveConfig() (fail-loud, rejects unknown keys)
│   ├── modes.ts                 # pure: MODE table, adaptive scoring, resolution
│   ├── models.ts                # pure: model catalog (verified ids), provider check
│   ├── hooks/
│   │   ├── agent-pre-step.ts    # mode resolution + policy injection
│   │   ├── session-event.ts     # turn accounting, duration
│   │   ├── llm-stream.ts        # token accounting (approximate)
│   │   └── tools-result.ts      # tool-call counting
│   ├── tools/
│   │   ├── shared.ts            # defineTool wrapper (namespaced ponytail-)
│   │   ├── mode.ts              # ponytail-mode get/set
│   │   ├── select.ts            # ponytail-select (pure scoring, exposed)
│   │   ├── model.ts             # ponytail-model validate/report
│   │   └── status.ts            # ponytail-status session metrics
│   └── state/
│       └── session-state.ts     # per-session mode + metrics map
├── skills/                      # 6 SKILL.md files (fork of upstream content)
│   ├── ponytail-core/SKILL.md
│   ├── ponytail-trace/SKILL.md
│   ├── ponytail-debug/SKILL.md
│   ├── ponytail-diff/SKILL.md
│   ├── ponytail-proof/SKILL.md
│   └── ponytail-invariant/SKILL.md
├── lib/                         # tsc build output (gitignored, built in validate)
├── test/
│   ├── unit/                    # modes, config, models, skill frontmatter, state
│   ├── integration/             # real Cordis mount: activation, tools, hooks
│   └── e2e/                     # bundle patch parses; skills resolve
└── benchmarks/
    ├── fixtures/                # task repo(s) with acceptance criteria
    ├── run-benchmark.mjs        # 3 conditions × N tasks, captures metrics
    └── results/                 # raw + report output
```

## Mode model (adaptive workflow)

Modes: `lite`, `full`, `ultra` (upstream parity) plus `surgical`, `autopsy` (X extensions).

| Mode | Fires when (signals) | Behavior |
|---|---|---|
| `lite` | bounded task, low complexity, no risk signals | build the smallest thing, name skipped options |
| `full` | default | upstream rule set: ladder + never-cut + proof test |
| `ultra` | high complexity: multi-file/multi-step/uncertain | full + challenge the request, extra verification passes |
| `surgical` | bug-fix locus known (failing test, error text, named function) | minimal diff at root cause, proof test first, no refactor |
| `autopsy` | failure analysis: repeated failures, regression, postmortem ask | root-cause + timeline + prevention + postmortem artifact |

Resolution order (deterministic, unit-tested):
1. explicit override via the `ponytail-mode` tool, session-sticky, `off` included;
2. user gesture `/ponytail-<mode>` or `stop ponytail`, promoted into that same override so it
   outlives the step it arrived in — the host delivers a turn's user message to step 1 only
   (`agent-loop/src/agent.ts:311/364` with `inbox.ts:110-112`), so a gesture read straight from
   the payload covers exactly one step and then silently reverts to the default;
3. adaptive scoring over the step's newest user message (`selectMode(signals) -> {mode, scores, reasons}`);
4. config `defaultMode` (default `full`).

Steps 1–2 are instructions, so they persist until countermanded; steps 3–4 are inference, so they
are re-derived on every step. A newly typed gesture outranks the stored override, which is what
keeps mode switching working.

Adaptive scoring is a pure function of extracted signals: message length, mentioned paths
count, risk keywords (security, money, migration, data loss, production), failure keywords
(error, crash, regression, failing test, broken), and multi-step markers (then, after that,
and also). Thresholds live in config so they are tunable without code changes.

## Model configuration (GPT 6 ASTRA / FABLE 5.1)

- Verified ids (no invention): provider `nine-router`, `th/gpt-6-astra` and `th/claude-fable-5.1`.
- Plugin ships these as config (`models.astra`, `models.fable`) and the `ponytail-model` tool
  validates them against the live router catalog, reporting `available` / `no-active-credentials`
  honestly.
- Host-level activation is native config, documented (not invented):
  `settings.yaml` → `agent-default-model: { provider: nine-router, model: th/gpt-6-astra }`.
- Because `th/*` credentials are currently inactive on the router, the benchmark runs on the
  operator's working default `oc/mimo-v2.6-flash-free(xhigh)` for all three conditions; the two
  named models are configured and validated, and the credential state is reported as a known
  limitation.

## Acceptance criteria (for the build itself)

1. `pnpm build` (tsc) and `pnpm typecheck` clean.
2. `pnpm test` — unit + integration + e2e all green (node:test via tsx).
3. Bundle patch validates: `dsh --dump-config --profile <test-profile>` shows the ponytail-x
   entries; `dsh --dump-config-schema` accepts the composed config.
4. Install into a test profile succeeds and `dsh headless` smoke task completes with the
   skills visible (model can load `ponytail-core`).
5. Benchmark report exists with real measured numbers for baseline / upstream / ponytail-x
   on identical tasks and acceptance criteria.


## Final measured results (2026-10-11)

- 56/56 tests pass; oxlint 0 warnings; tsc build clean.
- Bundle installs via `dsh plugin --profile px-ponytailx add link:…`;
  `dsh --dump-config-schema` validates; skills load through `skill()`;
  `ponytail-select` and `ponytail-model` verified live through the harness.
- Benchmark (3 conditions x 3 runs, identical fixture/task/model
  nine-router/ds/deepseek-v4-flash): baseline 3/3 @ 244,286 tokens,
  upstream 3/3 @ 144,611 tokens, ponytail-x 3/3 @ 314,821 tokens with the
  smallest mean diff (3.0 lines). Full table in benchmarks/RESULTS.md.
- The benchmark caught and the fix shipped: dotted tool names rejected by
  the provider grammar; the dual-th/default `status` schema bug; per-step
  injection duplication. Each fix has a regression test that fails on the
  reverted code.
