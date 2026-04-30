# Changelog

All notable changes to opencode-harness will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.1.0] — 2026-04-30

Initial release.

### Added
- `harness` CLI with `install` / `update` / `init` / `doctor` / `status` / `uninstall` commands.
- Homebrew tap formula at `Formula/opencode-harness.rb`.
- `install.sh` curl|bash bootstrap (idempotent).
- Three-framework integration:
  - **GSD** via `npx get-shit-done-cc@latest --opencode --global --minimal` (6 core skills).
  - **gstack** via `git clone + ./setup --host opencode --prefix` (namespaced as `/gstack-*`).
  - **Superpowers** via opencode plugin string in `opencode.json` (auto-updates).
- Four primary opencode agents: `harness`, `decide`, `build`, `verify`.
- Two opencode plugins:
  - `harness-state.ts` — re-injects `.planning/HARNESS.md` state into system prompt every turn.
  - `harness-guard.ts` — hard-aborts forbidden skill calls; appends breadcrumbs.
- Five-layer defense-in-depth enforcement (AGENTS.md → permissions → state inject → hard abort → idle deflection).
- `.planning/HARNESS.md` template with live-editable leg / allow / forbid lists.
- LLM-friendly install via `docs/INSTALL-FOR-LLM.md`.

[Unreleased]: https://github.com/YOUR_USER/opencode-harness/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/YOUR_USER/opencode-harness/releases/tag/v0.1.0
