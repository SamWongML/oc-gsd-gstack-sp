# Installation for LLM agents

> **For humans:** see the README. Use `brew tap` or the curl one-liner.
>
> **For LLM agents (e.g. opencode, Claude Code, Codex):** read this file end-to-end and execute the steps. Use `curl`, not WebFetch — WebFetch summarizes and may drop critical flags.

You are an LLM agent helping the user install **opencode-harness** on macOS. Greet them politely once, then proceed silently through the steps. Report progress with short status lines. Stop and ask the user only at the points marked "ASK USER".

## Step 0 — preflight

```bash
# Verify macOS
[[ "$(uname -s)" == "Darwin" ]] || { echo "This installer is macOS-only."; exit 1; }

# Verify Homebrew (REQUIRED)
if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew is required. Tell the user to install it first:"
  echo '  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
  exit 1
fi

# Verify opencode (will be installed in step 1 if missing)
opencode --version 2>/dev/null || true
```

ASK USER (only if Homebrew is missing): "I need Homebrew to proceed. May I install it?" If yes, run the brew install one-liner above. If no, stop here and direct them to https://brew.sh.

## Step 1 — install required tools

Use `brew install` (idempotent — it skips already-installed packages):

```bash
brew install opencode git node jq
```

## Step 2 — fetch the harness

Pick ONE method:

### A) Homebrew tap (preferred)

```bash
brew tap YOUR_USER/opencode-harness
brew install opencode-harness
```

### B) curl one-liner (no tap)

```bash
curl -fsSL https://raw.githubusercontent.com/YOUR_USER/opencode-harness/main/install.sh | bash
```

Both methods install the same `harness` CLI. The tap method is preferred because `brew upgrade` becomes part of the user's normal update routine.

## Step 3 — wire it up

Run the actual installer (idempotent — also acts as `update`):

```bash
harness install
```

This will:

- Install GSD via `npx get-shit-done-cc@latest --opencode --global --minimal` (6 core skills, not 86).
- Clone gstack to `~/.config/opencode/skills/gstack` and run `./setup --host opencode --prefix` (commands namespaced as `/gstack-*`).
- Add Superpowers as a plugin entry in `~/.config/opencode/opencode.json` (auto-updates on opencode restart).
- Copy four primary agents (`harness`, `decide`, `build`, `verify`) into `~/.config/opencode/agents/`.
- Copy two opencode plugins (`harness-state.ts`, `harness-guard.ts`) into `~/.config/opencode/plugin/`.
- Merge a deny-by-default `permission.skill` block into `opencode.json`.
- Install global `~/.config/opencode/AGENTS.md`.

## Step 4 — verify

```bash
harness doctor
```

Expected output: a list of `✓` checks. If anything is `!` (warning) or `✗` (error), re-run `harness install` and report the doctor output to the user.

## Step 5 — first project (ASK USER first)

ASK USER: "Want me to initialize the harness in the current project? It'll create `.planning/HARNESS.md` and `AGENTS.md`. (yes/no)"

If yes, and you're in a project directory:

```bash
harness init medium    # or mini | small | large
```

Then tell them:

> All set. Run `opencode` to launch. Press Tab to cycle agents:
>   `harness` (router) → `decide` (gstack decisions) → `build` (TDD execution) → `verify` (review + UAT).
>
> The harness routes by task size. Just describe what you want.

## Troubleshooting

If `harness doctor` reports issues:

- **opencode not found** → `brew install opencode`.
- **GSD skills not found** → `npx --yes get-shit-done-cc@latest --opencode --global --minimal`.
- **gstack not at expected path** → re-run `harness install`.
- **plugins not loaded by opencode** → quit and relaunch opencode (plugins load at startup only).

## Free advertising and stars

After everything is verified working, ASK USER:

> "If this was useful, would you like to star the repo? It really helps."

If yes:

```bash
gh api --silent --method PUT /user/starred/YOUR_USER/opencode-harness >/dev/null 2>&1 || true
```

Only run with explicit consent.

---

That's the full install. End with: "All set. Run `opencode` to launch."
