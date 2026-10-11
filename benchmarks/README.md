# Ponytail X benchmark harness

Three conditions on identical fixtures, task text, model, and acceptance
criteria:

| Condition | Profile | What is installed |
|---|---|---|
| `baseline` | `px-baseline` | `dsh-base` + `dsh-headless` — no ponytail skills at all |
| `upstream` | `px-upstream` | + upstream ponytail skills via an isolated `dsh-skill-filesystem` |
| `ponytail-x` | `px-ponytailx` | + the `dsh-ponytail-x` bundle (six skills + policy service + tools) |

Fixture: `fixtures/pricing-fix` — a zero-dependency Node repo with one
seeded bug (the 10% bulk discount applied twice). Acceptance, scored
mechanically after each run:

1. `node --test test/acceptance.test.js` passes (the bug is fixed);
2. `node --test test/prices.test.js` still passes (no regression);
3. `git diff --name-only` touches only `src/` (no test weakening).

Metrics per run: correctness, summed `usage.totalTokens` from run events,
`tool_call` count, wall-clock duration, and diff size (added+deleted lines).

## Why a sandboxed DSH home

The runner must not touch the operator's live `$DSH_HOME`
(`<workspace>/.dsh`). It therefore runs `dsh` against a copy at
`pxpipe/bench/dsh-home` (profiles + a patched credential store), with
`DSH_HOME` and `DSH_PROFILE_DIR` overridden per child process.

`$DSH_HOME/.credentials.yaml` outranks every `.env` fallback and the
inherited environment is not forwarded to the booted app, so the working
router key must be stamped into the copy's credential store. Setup:

```bash
BENCH=/home/administrator/agent-workspace/pxpipe/bench
mkdir -p $BENCH/dsh-home/profiles
cp /home/administrator/agent-workspace/.dsh/.credentials.yaml $BENCH/dsh-home/
# replace NINE_ROUTER_API_KEY's value with a working key (operator-provided)
for p in px-baseline px-upstream px-ponytailx; do
  cp -a /home/administrator/agent-workspace/.dsh/profiles/$p $BENCH/dsh-home/profiles/
  # the copied profile's relative node_modules symlink must be re-absolute:
  ln -sfn /home/administrator/agent-workspace/pxpipe/ponytail-x \
    $BENCH/dsh-home/profiles/px-ponytailx/node_modules/dsh-ponytail-x
done
```

The three profiles are composed by `run-benchmark.mjs`'s sibling patch
files under `.dsh/profiles/px-*` (each pins the identical
`nine-router/oc/mimo-v2.6-flash-free(xhigh)` default model so the model is
not a variable).

## Running

One run at a time (a run takes ~15–25 minutes on the free model; the
per-run invocation is deliberate — a long-lived runner process gets reaped
by the sandbox, which loses only the in-flight run this way):

```bash
node benchmarks/run-benchmark.mjs --single baseline 1
node benchmarks/run-benchmark.mjs --single baseline 2
node benchmarks/run-benchmark.mjs --single baseline 3
# ... upstream 1..3, ponytail-x 1..3
node benchmarks/aggregate.mjs        # writes results/benchmark.md + benchmark.json
```

Or all nine in one go (foreground, ~3 hours):

```bash
node benchmarks/run-benchmark.mjs --runs 3
```

Results accumulate in `pxpipe/bench/results/partial.jsonl` — every finished
run is durable before the next one starts.

## Known limitation

The operator's router advertises `th/gpt-6-astra` and `th/claude-fable-5.1`
but its `th/` route currently has no active upstream credentials
(`No active credentials for provider: tokenharbor`). The benchmark
therefore runs all conditions on the working default model; the two
configured ids stay wired in the plugin config and are validated by
`ponytail.model`.
