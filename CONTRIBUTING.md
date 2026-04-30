# Contributing

Thanks for your interest! This harness is a thin orchestration layer over
three upstream frameworks. We do **not** vendor those frameworks — patches
to the underlying gstack/GSD/Superpowers behavior should go upstream.

## What belongs here

- Routing / hop logic (the four agent files in `share/agents/`).
- Enforcement plugins (`share/plugin/*.ts`).
- Permission tuning (`share/opencode.global.json`).
- The CLI (`bin/harness`) and installer (`install.sh`).
- Templates (`share/templates/`).
- Documentation.

## What doesn't

- New skills — author them in your project's `.opencode/skills/` instead.
  If they're broadly useful, propose them upstream to the relevant framework.
- Forks of GSD/gstack/Superpowers — we want the canonical upstreams.

## Local dev

```bash
git clone https://github.com/YOUR_USER/opencode-harness.git
cd opencode-harness
chmod +x bin/harness install.sh

# Test the CLI without installing globally:
HARNESS_HOME="$PWD" ./bin/harness version
HARNESS_HOME="$PWD" ./bin/harness help

# Run shellcheck:
shellcheck install.sh bin/harness

# Validate JSON:
jq empty share/opencode.global.json
jq empty share/templates/opencode.project.json
```

## Testing changes to plugins

The plugins (`harness-state.ts`, `harness-guard.ts`) load via opencode at
startup. To test changes:

1. `cp share/plugin/*.ts ~/.config/opencode/plugin/`
2. Quit and relaunch opencode.
3. In a project with `.planning/HARNESS.md`, observe behavior.

## Releasing

1. Update `CHANGELOG.md` with the new version.
2. Bump `VERSION` in `bin/harness` and `Formula/opencode-harness.rb`.
3. Tag: `git tag v0.x.y && git push --tags`.
4. Update the `sha256` in the formula to match the GitHub-generated tarball.
5. Push to the homebrew-tap repo.
