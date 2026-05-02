# opencode-harness

> **A disciplined, deny-by-default coding harness for [opencode](https://opencode.ai).**
> Combines the strongest parts of **gstack**, **GSD**, and **Superpowers** — without their bloat or collisions — and locks them down with five layers of structural enforcement so the agent can't drift.

```text
gstack thinks  →  GSD stabilizes  →  Superpowers executes
   decision         context/spec        TDD execution
```

**Built for macOS. One command to install. One command to update. Zero file copy/paste.**

---

## Why

Three Claude/opencode frameworks each solve one piece of the AI-coding problem:

- **[gstack](https://github.com/garrytan/gstack)** — role-based decisions (CEO/Eng/Design review).
- **[GSD](https://github.com/gsd-build/get-shit-done)** — context/spec engineering, atomic commits, fresh subagent contexts.
- **[Superpowers](https://github.com/obra/superpowers)** — strict TDD, RED-GREEN-REFACTOR, code-review subagents.

Installing all three the naive way gives you ~123 skills + 33 subagents, ~12k tokens of permanent system-prompt overhead, and constant collisions (`/qa` exists in two frameworks; `/review` in three; debugging in three). The LLM picks wrong, often.

This harness fixes that with: minimal installs, namespaced commands, deny-by-default permissions, and a **5-layer enforcement stack** that includes runtime hard-blocks via opencode plugin hooks. From ~123 visible skills to **~9 visible** in the agent that matters.

---

## Install — pick one

### 🍺 Homebrew (recommended)

```bash
brew tap YOUR_USER/opencode-harness
brew install opencode-harness
harness install
```

### 🌀 One-liner (no Homebrew)

```bash
curl -fsSL https://raw.githubusercontent.com/YOUR_USER/opencode-harness/main/install.sh | bash
```

### 🛠️ From a local clone (no tap, no curl)

For hacking on the harness itself, offline installs, or skipping the tap:

```bash
git clone https://github.com/YOUR_USER/opencode-harness.git ~/.config/opencode-harness
cd ~/.config/opencode-harness && chmod +x bin/harness && ./bin/harness install
```

Full walkthrough: [`docs/LOCAL-BUILD.md`](docs/LOCAL-BUILD.md).

### 🤖 Tell your AI to do it

Paste this to opencode (or any agent in your terminal):

```text
Install and configure opencode-harness by following:
https://raw.githubusercontent.com/YOUR_USER/opencode-harness/main/docs/INSTALL-FOR-LLM.md
```

The agent reads the file, runs the steps, and verifies the install for you.

---

## Update

Same `harness install` command. The script is **idempotent** — running it again pulls latest gstack, latest GSD `--minimal`, latest Superpowers, and refreshes all assets.

```bash
harness update     # alias for `harness install`
brew upgrade       # if you installed via brew
```

---

## Use it in 30 seconds

```bash
cd your-project
harness init                # creates .planning/HARNESS.md and project AGENTS.md
opencode                    # launch opencode

# Inside opencode, press Tab to cycle agents:
#   harness  → router (default)
#   decide   → gstack decision skills only
#   build    → Superpowers TDD + GSD execute only
#   verify   → review + UAT only
```

Then ask normally. The harness routes by task size:

| You say | Harness routes to |
| --- | --- |
| `Fix typo in README line 42` | MINI: `/gsd-quick` only |
| `Add ?since= filter to /orders` | SMALL: `/gsd-quick` + Superpowers TDD |
| `Build OAuth login` | MEDIUM: gstack `/office-hours` → GSD discuss/plan/execute (TDD inside) → review → verify |
| `Ship analytics-v2 milestone` | LARGE: full milestone with `/autoplan` + `/ship` + `/retro` |

If focus is ever lost: `/gsd-progress` reads `.planning/HARNESS.md` and tells you (and the LLM) the exact next legal command. The hooks abort wrong calls before they run.

---

## What gets installed

| Layer | From | What | Visible to LLM |
| --- | --- | --- | --- |
| Decision | `garrytan/gstack` (`./setup --host opencode --prefix`) | 23 skills, all namespaced as `/gstack-*` | ~14 (rest denied) |
| Context | `get-shit-done-cc --opencode --global --minimal` | 6 core GSD skills + 6 subagents | ~14 |
| Execution | `superpowers@git+...` opencode plugin | 14 skills, native lazy-load | ~11 |
| Harness glue | this repo | 4 primary agents, 2 plugins, AGENTS.md, opencode.json | always |

After deny-by-default filtering: **~9 skills** visible inside the `build` agent. ~30 visible to `harness` (the router). The rest are on disk for upgrade continuity but invisible to the model.

---

## Architecture (the 5-layer enforcement stack)

```text
 0  AGENTS.md                     ← soft, declarative (advisory only)
 1  Per-agent skill perm          ← skills literally absent from agent's tool list
 2  Per-agent task perm           ← subagents removed from Task tool description
 3  chat.system.transform +       ← refresh state from disk EVERY turn AND seed the
    experimental.session.compacting   compaction summary (kills compaction drift)
 4  tool.execute.before           ← HARD ABORT on forbidden skill, returns redirect
 4b tool.execute.after            ← AUTO-ADVANCE Leg: in HARNESS.md when a sentinel
                                    skill succeeds (gsd-verify-work, gstack-ship)
 5  session.idle                  ← DEFLECTION via tui.appendPrompt (opt-in via
                                    Autonomous: true; default for medium/large)
```

Layer 4 is the killer feature: a 50-line opencode plugin reads `.planning/HARNESS.md` on every tool call, and aborts any skill that isn't allowed in the current leg with a redirect message. **One file edit reconfigures everything live — no restart.** Layer 4b/5 turn that into a self-driving sequence for medium/large milestones; small/mini sizes leave it off.

Full architecture: see [`docs/DESIGN.md`](docs/DESIGN.md) and [`docs/HARDENING.md`](docs/HARDENING.md).

---

## CLI reference

```text
harness install              install or update everything (idempotent)
harness update               alias for `harness install`
harness init [size]          init harness in current project (size: mini|small|medium|large)
harness doctor               verify installation, run health checks
harness status               show what's installed, where, and at which versions
harness uninstall            remove harness (with confirmation; preserves your projects)
harness version              print version
harness help                 show this
```

Every command is safe to re-run.

---

## Requirements

- **macOS** (Apple Silicon or Intel).
- **Homebrew** ([install](https://brew.sh)).
- The installer auto-installs: `opencode`, `git`, `node`, `jq` if missing.
- Disk space: ~25 MB for the harness + framework checkouts.

For Linux/Windows: see [`docs/PLATFORMS.md`](docs/PLATFORMS.md). The same steps work, but you'll skip the Homebrew tap and use the curl installer or run `bin/harness` directly.

---

## Uninstall

```bash
harness uninstall            # removes ~/.config/opencode-harness, gstack, GSD, harness agents/plugins
brew uninstall opencode-harness   # if installed via brew
brew untap YOUR_USER/opencode-harness
```

Your projects' `.planning/` directories are **never touched** — they're yours.

---

## License

MIT. See [`LICENSE`](LICENSE).

## Credits

This harness wires together work by [@garrytan](https://github.com/garrytan/gstack), [@TÂCHES / gsd-build](https://github.com/gsd-build/get-shit-done), and [@obra](https://github.com/obra/superpowers). All credit for the underlying frameworks goes to them. This repo only adds the routing/enforcement layer.

Inspired by the install ergonomics of [oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) and [cc-sdd](https://github.com/gotalab/cc-sdd).
