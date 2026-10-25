# Ponytail X

Ponytail X is a [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) plugin with five engineering modes, six skills, and four tools.

## Installation

Requirements: DSH `0.2.0-rc.2+`, Node.js `22.19.x` or Node.js `24+`, and pnpm. Replace `web` with your DSH profile name.

### 1. NPM Registry

```bash
dsh plugin --profile web add dsh-ponytail-x
```

This method requires the package to be published to npm as `dsh-ponytail-x`.

### 2. GitHub Repository

```bash
dsh plugin --profile web add github:mulqizamzam/dsh-ponytail-x#main
```

**Current limitation:** the repository does not include the generated `lib/` directory or a Git-install build hook, so direct GitHub installation is not ready yet. Use the Local Directory method for the current source.

### 3. Local Directory

Clone the repository, point the `link:` dependencies in `package.json` to your local DSH checkout, then build and install:

```bash
git clone https://github.com/mulqizamzam/dsh-ponytail-x.git
cd dsh-ponytail-x
node scripts/link-deps.mjs
pnpm run build
dsh plugin --profile web add "link:$(pwd)"
```

Restart the profile after installation. Verify the plugin is loaded:

```bash
dsh --profile web --dump-config | grep -i ponytail
```

## Modes

| Mode | Use |
| --- | --- |
| `lite` | Small, straightforward tasks |
| `full` | General development (default) |
| `ultra` | Complex or high-risk tasks |
| `surgical` | Focused debugging and fixes |
| `autopsy` | Incident analysis and prevention |

Set a mode in chat with `/ponytail lite`, `/ponytail full`, `/ponytail ultra`, `/ponytail surgical`, `/ponytail autopsy`, or `/ponytail off`. The `off` mode disables instruction injection for the session.

## Skills and tools

Skills: `ponytail-core`, `ponytail-trace`, `ponytail-debug`, `ponytail-diff`, `ponytail-proof`, and `ponytail-invariant`.

Tools: `ponytail-mode` (session mode), `ponytail-select` (mode selection), `ponytail-model` (router catalog check), and `ponytail-status` (session metrics).

## Configuration

The bundle defaults to `full` mode and currently sets instruction injection to disabled. To enable injection, set `injection.enabled: true` in the effective `ponytail-x` profile configuration. Use `injection.enabled` for new configs; the legacy `injection.disabled` key is also accepted (`true` disables, `false` enables). If both keys are present, `disabled` takes precedence.

## Development

From a checkout with its DSH dependencies configured:

```bash
pnpm run build
pnpm run typecheck
pnpm test
```

## License

MIT. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
