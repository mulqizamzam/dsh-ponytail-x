# Ponytail X benchmark — 2026-10-11T12:32:24.454Z

Conditions share the fixture (pricing-fix), the task text, the model (nine-router/ds/deepseek-v4-flash), and the acceptance criteria: acceptance suite green, existing suite green, diff limited to src/.

| condition | runs | pass rate | mean tokens (in/out) | mean tool calls | mean duration (s) | mean diff lines | regressions |
|---|---|---|---|---|---|---|---|
| baseline | 3 | 100% | 244286 (46286/9968) | 25.3 | 69.2 | 3.7 | 0 |
| upstream | 3 | 100% | 144611 (26166/6573) | 16.3 | 47.5 | 3.7 | 0 |
| ponytail-x | 3 | 100% | 314821 (45253/10837) | 21.3 | 91.9 | 3.0 | 0 |

Per-run detail (diff files, error text) in benchmark.json.