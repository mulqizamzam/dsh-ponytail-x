# Third-party notices

## ponytail (upstream)

Ponytail X is a fork of [ponytail](https://github.com/DietrichGebert/ponytail)
by Dietrich Gebert.

- License: MIT
- Copyright: Copyright (c) 2026 DietrichGebert
- Repository: https://github.com/DietrichGebert/ponytail
- npm: `@dietrichgebert/ponytail`

Portions of `skills/ponytail-core/SKILL.md`, `skills/ponytail-trace/SKILL.md`,
`skills/ponytail-diff/SKILL.md`, and `skills/ponytail-proof/SKILL.md` are
derived from the upstream `skills/ponytail/SKILL.md` and the mode/level model
in `hooks/ponytail-mode-tracker.js` and `hooks/ponytail-config.js` of that
repository. The full MIT license text is in `LICENSE`.

## DeepSeek Harness

This plugin runs on the DeepSeek Harness plugin system
(https://github.com/deepseek-ai/deepseek-harness), MIT licensed. It uses only
public plugin seams (Cordis services, the `agent/pre-step` and `session/event`
waterfalls, the `@deepseek-ai/dsh-skill-filesystem` provider, and the tool
registry). No core files are modified.
