# Ponytail X

**Adaptive senior-engineering discipline for DeepSeek Harness (DSH).**

Ponytail X is a DSH plugin fork of [ponytail](https://github.com/DietrichGebert/ponytail). It combines focused engineering workflows with deterministic mode selection, session-scoped controls, model-profile checks, and session metrics. It uses DSH's plugin and skill systems; it does not modify DSH core.

## What it does

- Selects a workflow mode from task text and configurable thresholds.
- Supports explicit session overrides so a chosen mode persists across steps.
- Provides six focused skills for tracing, debugging, implementation discipline, proof, and invariants.
- Registers four tools for mode control, mode preview, model checks, and session metrics.
- Injects a short mode instruction before agent steps when injection is enabled.
- Rejects unknown configuration keys with a path-specific error instead of silently ignoring typos.

## Workflow modes

| Mode | Use it for | Working rule |
| --- | --- | --- |
| **lite** | Small, bounded tasks | Solve the task with the smallest complete change and state important options skipped. |
| **full** | General development; default mode | Follow the engineering ladder, finish related callers/tests/fixtures, and protect the never-cut requirements. |
| **ultra** | Complex, risky, or multi-step work | Challenge unnecessary scope and perform additional verification passes. |
| **surgical** | A known bug or failing test | Reproduce first, find the root cause, make the smallest complete fix, and add a regression test. Avoid unrelated refactoring. |
| **autopsy** | Regressions, incidents, repeated failures | Build a timeline, identify root cause, define prevention, and write a postmortem artifact. |

Adaptive selection is deterministic: the same task text and thresholds produce the same scores. It uses signals such as risk and failure terms, mentioned file paths, stack traces, multi-step phrasing, and uncertainty. The scoring rules are implementation heuristics, not a substitute for engineering judgment.

### Mode resolution and overrides

The plugin resolves a step's mode in this order:

1. A session override set with the mode tool.
2. A mode gesture in the newest user message.
3. Adaptive scoring of that message.
4. The configured default mode.

Explicit overrides and gestures persist for the session until changed. Adaptive selections are reconsidered on each step.

Supported gestures include:

    /ponytail lite
    /ponytail full
    /ponytail ultra
    /ponytail surgical
    /ponytail autopsy
    /ponytail off
    stop ponytail

The matching **/ponytail-skill mode** form is also recognized. Use **off** to disable Ponytail X injection for the current session; it is a runtime setting, not a valid value for **defaultMode**.

## Included skills

| Skill | Purpose |
| --- | --- |
| **ponytail-core** | Core engineering rules, mode guidance, and evidence requirements. |
| **ponytail-trace** | Map the code and call paths before changing them. |
| **ponytail-debug** | Reproduce, localize, fix, and guard against a defect. |
| **ponytail-diff** | Keep the change small without omitting required work. |
| **ponytail-proof** | Design proof tests and report verification honestly. |
| **ponytail-invariant** | Protect contracts and challenge likely regressions. |

The skills are provided by DSH's **@deepseek-ai/dsh-skill-filesystem** plugin under the **ponytail-x** provider name.

## Tools

| Tool | Purpose |
| --- | --- |
| **ponytail-mode** | Read the current mode or set a session-sticky override. Pass **text** to preview adaptive scoring without changing the override. |
| **ponytail-select** | Classify task text and return the selected mode, score board, and reasons. It is deterministic and does not change session state. |
| **ponytail-model** | Compare configured model profiles with the live router catalog. |
| **ponytail-status** | Report session mode and metrics such as turns, steps, tool calls, elapsed time, and approximate token counts. |

The exact way to invoke tools depends on the DSH client in use. Tool names use the **ponytail-** prefix.

## Requirements

- DeepSeek Harness **0.2.0-rc.2 or newer**.
- Node.js **22.19.x or newer in the 22 line, or 24 or newer**.
- The DSH peer packages available to the profile that loads the plugin.

## Install

From the DSH workspace, link the local plugin to the profile you want to use. Replace the path with the actual checkout location:

    dsh plugin --profile web add link:/path/to/dsh-ponytail-x

The plugin command installs the link dependency and registers the bundle in the profile. On the next boot, the bundle's **cordis.patch.yml** inserts the policy service and the isolated skill-filesystem provider.

To install it into another profile, replace **web** with that profile name.

### Verify the installation

Run these from the same DSH workspace:

    dsh --dump-config --profile web | grep ponytail
    dsh --dump-config-schema --profile web
    dsh headless "load the skill ponytail-core and quote its first line"

The first command should show the Ponytail X service and its skill provider. The schema dump checks the composed profile configuration. The headless command checks that the skill can be loaded.

### Manual profile setup

Use the plugin command above where possible. The equivalent profile package configuration contains a local link dependency and the bundle name:

    {
      "dependencies": {
        "dsh-ponytail-x": "link:/path/to/dsh-ponytail-x"
      },
      "dsh": {
        "profile": {
          "bundles": ["...", "dsh-ponytail-x"]
        }
      }
    }

Then run **pnpm install** in the profile directory. Preserve the profile's existing dependencies and bundle entries when applying this manually.

## Configuration

The bundle defaults are declared in **src/config/schema.ts**. The bundled patch in **cordis.patch.yml** overrides some of them for the installed profile.

    - insert:
        - id: ponytail-x
          name: dsh-ponytail-x
          config:
            defaultMode: full
            injection:
              enabled: false
              maxChars: 1200
            complexity:
              ultraAt: 6
              liteAt: 1
            models:
              astra:
                provider: nine-router
                model: oc/minimax-m3.1-flash-free(thinking)
              fable:
                provider: nine-router
                model: oc/minimax-m3.1-flash-free(thinking)

Configuration fields:

| Field | Default in schema | Meaning |
| --- | --- | --- |
| **defaultMode** | **full** | Fallback mode; allowed values are **lite**, **full**, **ultra**, **surgical**, and **autopsy**. |
| **injection.enabled** | **true** | Whether to append Ponytail X's short instructions message at each admitted agent step. |
| **injection.maxChars** | **1200** | Maximum length of the injected message; non-positive values render an empty message. |
| **complexity.ultraAt** | **6** | Score at which adaptive selection can choose **ultra**. |
| **complexity.liteAt** | **1** | Score at which a bounded task can choose **lite**. |
| **models.astra.provider** | **nine-router** | Provider recorded for the Astra model profile. |
| **models.astra.model** | **th/gpt-6-astra** | Schema fallback model ID for Astra. |
| **models.fable.provider** | **nine-router** | Provider recorded for the Fable model profile. |
| **models.fable.model** | **th/claude-fable-5.1** | Schema fallback model ID for Fable. |

**Important:** the shipped **cordis.patch.yml** sets **injection.enabled: false**, so the service and tools load but per-step instructions are not injected by default. Set it to **true** in that patch if you want the mode instructions enabled globally. The defaults in the table apply when no override is supplied.

### Legacy injection.disabled key

The configuration resolver accepts **injection.disabled** as a compatibility alias and converts it to the canonical **injection.enabled** setting:

- **disabled: true** means injection is disabled.
- **disabled: false** means injection is enabled.
- If both **enabled** and **disabled** are present, **disabled** takes precedence.

Use **enabled** for new configurations. **disabled** exists only to keep older profile configuration from failing while it is migrated. Other unknown keys are still rejected with the full field path.

**defaultMode: off** is not supported. To turn injection off only for one session, use **ponytail-mode** with **mode: off** or the **/ponytail off** gesture.

## Model profiles and routing

Ponytail X stores two model profiles, **astra** and **fable**, and exposes **ponytail-model** to check those IDs against the router's live **/v1/models** catalog. The schema fallback IDs are shown above; the shipped patch currently overrides both profiles to **oc/minimax-m3.1-flash-free(thinking)**.

These profiles are **not a separate routing engine**. Ponytail X does not change the model used by the main agent. To change that agent's model, configure DSH's **agent-default-model** service in the profile or its settings. For example:

    - id: agent-default-model
      name: "@deepseek-ai/dsh-agent-default-model"
      config:
        provider: nine-router
        model: your-provider-model-id
        reasoningEffort: max

Replace the provider and model with IDs supported by your own router; the example is a shape, not a claim that a particular ID is available. **ponytail-model** reads the live router catalog and reports when the catalog cannot be reached or a profile ID is not advertised.

The router base URL used by the model check is **NINE_ROUTER_BASE_URL**; if unset, the service uses **http://localhost:20128/v1**.

## Build and test

From a checkout that has access to the DSH workspace and peer dependencies:

    node scripts/link-deps.mjs
    npm run build
    npm test

Useful focused test commands:

    npm run test:unit
    npm run test:integration
    npm run test:e2e

The build uses TypeScript project build mode. The test script uses Node's test runner through **tsx**. The dependency-link helper is intended for the workspace layout this plugin was developed against; inspect it before adapting it to a different workspace.

## Benchmark

The recorded benchmark in **benchmarks/RESULTS.md** is a small historical experiment dated **2026-10-11**. It compares baseline, upstream ponytail, and Ponytail X on three runs per condition against the same seeded pricing bug and acceptance criteria.

| Condition | Pass rate | Mean tokens | Mean tool calls | Mean duration | Mean changed lines |
| --- | ---: | ---: | ---: | ---: | ---: |
| Baseline | 3/3 | 244,286 | 25.3 | 69.2 s | 3.7 |
| Upstream ponytail | 3/3 | 144,611 | 16.3 | 47.5 s | 3.7 |
| Ponytail X | 3/3 | 314,821 | 21.3 | 91.9 s | 3.0 |

Interpret this result narrowly: every condition fixed the same small fixture, so this test did not distinguish the approaches on correctness. Upstream ponytail used fewer tokens and less time in this experiment; Ponytail X produced the smallest mean diff. These results are not a general performance guarantee. See [benchmarks/RESULTS.md](benchmarks/RESULTS.md) for the recorded details.

## Troubleshooting

| Symptom | Likely cause | Action |
| --- | --- | --- |
| **injection.disabled is not a recognized config key** | An older profile config uses the legacy alias and the installed build may not contain the compatibility fix. | Update to a build containing the fix, rebuild, and restart the affected profile. For new config, use **injection.enabled**. |
| Ponytail X tools are missing | The bundle is absent from the profile, the patch was not applied, or the plugin link is broken. | Re-run the plugin add command and check the profile's bundle list and **node_modules/dsh-ponytail-x** link. |
| Skill **ponytail-core** is unknown | The **ponytail-x-skills** provider did not load or its skill directory cannot be resolved. | Check the composed config and run the headless skill-loading check above. |
| Injection does not appear | The shipped patch sets **injection.enabled** to **false**, or the session override is **off**. | Set **enabled: true** in the profile patch or clear/change the session override. |
| A model is reported as not advertised | The profile model ID is absent from the router catalog, or the router cannot be reached. | Check the router URL and model ID; distinguish an unreachable catalog from an unadvertised model. |
| Model requests fail | The route or provider credentials may be unavailable even if an ID is listed in the router catalog. | Check the provider's current credentials and use a model/route that is currently working. |
| The mode does not change | A session-sticky override may be active. | Use **ponytail-mode** to read the override, then set a different mode or **off**. |

## License and attribution

Ponytail X is distributed under the MIT license. It is a fork of [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail); see [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for license and attribution details.
