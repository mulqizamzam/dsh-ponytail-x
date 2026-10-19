# Ponytail X

Lazy senior dev mode for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
— a fork of [ponytail](https://github.com/DietrichGebert/ponytail) (MIT, © 2026
Dietrich Gebert), specialized for the DSH plugin system.

> He says nothing. He writes one line. It works.

Ponytail X keeps the upstream rule set verbatim (the ladder, the never-cut
list, the skip-and-risk closing lines) and adds what a DSH agent needs: six
skills on the native `skill-filesystem` provider, five adaptive workflow
modes selected per step, two configured agent model profiles, and session
metrics — all through public plugin seams. No DSH core is modified.

## What ships

| Piece | What it is |
|---|---|
| `skills/ponytail-core` | The upstream rule set (verbatim) + modes + evidence lines |
| `skills/ponytail-trace` | Map the code before touching it |
| `skills/ponytail-debug` | Surgical-mode debugging: reproduce → localize → root cause → guard |
| `skills/ponytail-diff` | Smallest complete diff + scope discipline |
| `skills/ponytail-proof` | Proof tests, honest verification, report lines |
| `skills/ponytail-invariant` | Hold the repo's contract; adversarial checklist |
| Policy service (`ponytail-` tools) | Mode resolution, adaptive selection, model validation, metrics |
| `cordis.patch.yml` | The bundle patch inserting both entries |

### Modes

`lite` · `full` (default) · `ultra` · `surgical` · `autopsy`

Selected per step, first match wins:

1. explicit override — `ponytail-mode` tool (`{ "mode": "ultra" }`, `"off"` disables), session-sticky
2. user gesture — `/ponytail ultra`, `/ponytail-core surgical`, or `stop ponytail`, recorded as that
   same session override, so it holds past the step it arrived in
3. adaptive scoring — deterministic signals over the step's newest user message
   (complexity, risk, failure, uncertainty)
4. the configured default (`full`)

1–2 are instructions and persist until countermanded; 3–4 are inference and are re-scored every step.

### Tools (namespace `ponytail-`)

| Tool | Purpose |
|---|---|
| `ponytail-mode` | Read/set the session mode; preview an adaptive pick with `text` |
| `ponytail-select` | Classify a task text into a mode with the score board (pure) |
| `ponytail-model` | Validate the configured model profiles against the live router catalog |
| `ponytail-status` | Session metrics: mode, turns, steps, tool calls, elapsed, tokens |

## Install

Requirements: DSH `>=0.2.0-rc.2`, Node `^22.19.0 \|\| >=24`.

```bash
# from your DSH home (default: <workspace>/.dsh)
dsh plugin --profile web add link:/path/to/ponytail-x
```

`dsh plugin add` does the three things the compose needs: the link
dependency, the `dsh.profile.bundles` entry, and the install. The bundle's
own `cordis.patch.yml` then inserts the policy entry and the isolated
skill-filesystem instance on the next boot.

Manual equivalent (what `dsh plugin add` writes):

```jsonc
// <DSH_HOME>/profiles/web/package.json
{
  "dependencies": { "dsh-ponytail-x": "link:/path/to/ponytail-x" },
  "dsh": { "profile": { "bundles": ["…", "dsh-ponytail-x"] } }
}
```

then `pnpm install` in that profile directory.

### Verifying the install

```bash
dsh --dump-config --profile web | grep ponytail        # both entries present
dsh --dump-config-schema --profile web                 # composed config validates
dsh headless "load the skill ponytail-core and quote its first line"
```

## Build and test (from a checkout)

```bash
node scripts/link-deps.mjs   # link: peer/dev deps into the harness checkout
npm run build                # tsc -b -> lib/
npm test                     # node:test via tsx: unit + integration + e2e
```

`scripts/link-deps.mjs` pins a workspace-local pnpm store; a bare
`pnpm install` fails in sandboxes where the parent workspace `storeDir` is
unwritable.

## Model configuration (GPT 6 ASTRA / FABLE 5.1)

The two profiles are configured with their **real, verified router ids**
(probed live against the operator's 9Router `GET /v1/models`):

| Profile | Provider | Model | Router capabilities |
|---|---|---|---|
| `astra` | `nine-router` | `th/gpt-6-astra` | ctx 272k, tools, reasoning (thinkingFormat `openai`) |
| `fable` | `nine-router` | `th/claude-fable-5.1` | ctx 1M, tools, reasoning (thinkingFormat `claude-budget`) |

Nothing here invents a model id or endpoint. The plugin does not re-route
requests itself — model selection is host configuration, and the native
mechanism is `agent-default-model` in the profile patch or settings:

```yaml
# <DSH_HOME>/profiles/<profile>/cordis.patch.yml — pick the agent model
- id: agent-default-model
  name: "@deepseek-ai/dsh-agent-default-model"
  config:
    provider: nine-router
    model: th/gpt-6-astra          # or th/claude-fable-5.1
    reasoningEffort: max
```

`ponytail-model` validates both ids against the live router and reports
`advertised` / `not advertised` / capabilities honestly. **Known state at
ship time:** both ids are advertised by the router catalog, but the `th/`
route currently answers `No active credentials for provider: tokenharbor`
for chat completions; the operator's working default
(`oc/mimo-v2.6-flash-free(xhigh)`) is used for the shipped benchmark. When
the credentials come back, no plugin change is needed — the ids are already
wired.

## Configuration

Bundle defaults, overridable from the patch entry `ponytail-x`:

```yaml
- insert:
    - id: ponytail-x
      name: dsh-ponytail-x
      config:
        defaultMode: full          # lite | full | ultra | surgical | autopsy
        injection:
          enabled: true            # the per-step instructions message
          maxChars: 1200
        complexity:
          ultraAt: 6               # adaptive score threshold for ultra
          liteAt: 1                # adaptive score threshold for lite
        models:
          astra: { provider: nine-router, model: th/gpt-6-astra }
          fable: { provider: nine-router, model: th/claude-fable-5.1 }
```

Config is fail-loud: every rejection names the exact field path
(`injection.enabled must be a boolean`).

## Benchmark

`benchmarks/run-benchmark.mjs` runs three conditions — `baseline` (no
skills), `upstream` (upstream ponytail skills via skill-filesystem),
`ponytail-x` (this bundle) — on the same fixture
(`benchmarks/fixtures/pricing-fix`: one seeded double-discount bug) with
identical task text, identical model (`nine-router/ds/deepseek-v4-flash`), and identical acceptance criteria
(acceptance suite green, existing suite green, diff limited to `src/`).
Metrics: correctness, tokens, tool calls, duration, diff size.

```bash
node benchmarks/run-benchmark.mjs --single baseline 1   # one run, foreground
node benchmarks/aggregate.mjs                          # rebuild the report
```

Measured result, 3 runs per condition, full table in
[`benchmarks/RESULTS.md`](benchmarks/RESULTS.md):

| condition | pass rate | mean tokens | mean tool calls | mean duration | mean diff lines |
|---|---|---|---|---|---|
| baseline | 3/3 | 244,286 | 25.3 | 69.2 s | 3.7 |
| upstream | 3/3 | 144,611 | 16.3 | 47.5 s | 3.7 |
| ponytail-x | 3/3 | 314,821 | 21.3 | 91.9 s | 3.0 |

Read this honestly: on a small, well-specified fixture all three conditions
fix the bug — the fixture does not separate them on correctness. Upstream
ponytail is the leanest (fewest tokens, fastest), consistent with its
"write less" thesis. Ponytail X pays for its extras (injected mode policy,
five skills, session metrics) in tokens and time, and in return produces the
smallest and most consistent diff (3 lines in all 3 runs). The run also
caught a real defect — dotted tool names (`ponytail.mode`) are rejected by
the OpenAI-completions provider grammar; the bundle now ships kebab-case
tool names.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `skill "ponytail-core" is unknown` | Bundle not in the profile's `dsh.profile.bundles`, or the profile's `node_modules` link dangles | re-run `dsh plugin --profile <p> add link:…`; check `node_modules/dsh-ponytail-x` resolves |
| `ponytail-x` entries missing from `--dump-config` | Bundle patch not applied | the profile `package.json` must list `dsh-ponytail-x` in `dsh.profile.bundles` |
| AUTH fails with an old key | `$DSH_HOME/.credentials.yaml` outranks `.env` and the process env is not inherited by the booted app | update the managed store in `$DSH_HOME/.credentials.yaml` |
| `th/*` models fail with `No active credentials` | Router-side credentials for the `th` route are inactive | use another provider model; the ids stay wired for when it returns |
| Modes never switch | a session override from `ponytail-mode` is sticky | `ponytail-mode { "mode": "off" }` then back, or restart the session |
| `type arrays are not supported` from the tool registry | a plugin tool schema used `type: [x, "null"]` | keep output schemas single-typed (this bundle's tool outputs are strings) |
| Provider rejects the request with `tools[N].function.name` | a tool name carried a dot | kebab-case only (`ponytail-*`); the provider grammar is `^[a-zA-Z0-9_-]+$` |

## License

MIT. Upstream copyright (© 2026 DietrichGebert) preserved; fork notice in
`LICENSE`, attribution in `THIRD_PARTY_NOTICES.md`. Upstream rule text in
`skills/ponytail-core` is kept verbatim under that license.
