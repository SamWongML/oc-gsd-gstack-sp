# Architecture

> Why this harness exists and how the pieces fit. For installation see [README](../README.md).

## The split

Three frameworks. Each owns one concern. No replication.

| Concern | Owner | Strength |
| --- | --- | --- |
| Decision / roles | **gstack** | role-based reviews (CEO, Eng, Design); paranoid `/review`; cross-model `/codex` |
| Context / spec / state | **GSD** | `.planning/` files, atomic commits, fresh subagent contexts, `/gsd-progress` always-on orientation |
| Execution / TDD | **Superpowers** | RED-GREEN-REFACTOR enforced; subagent-driven dev with two-stage review |

Slogan: **gstack thinks → GSD stabilizes → Superpowers executes**.

## Hops between frameworks (file-based, never re-prompted)

| Hop | Producer | Artifact | Consumer |
| --- | --- | --- | --- |
| gstack → GSD | `/gstack-office-hours` | one-paragraph decision summary | pasted into `/gsd-discuss-phase` |
| GSD → Superpowers | `/gsd-plan-phase` | `{phase}-{N}-PLAN.md` (XML) | `executing-plans` reads as spec |
| Superpowers → gstack | `finishing-a-development-branch` | `git diff main...HEAD` | `/gstack-review` reads diff only |
| gstack → GSD (close) | `/gstack-review` verdict | text | pasted into `/gsd-verify-work` UAT notes |

## Task-size router

| Size | Flow |
| --- | --- |
| MINI | `/gsd-quick` only |
| SMALL | `/gsd-quick` + Superpowers `test-driven-development` |
| MEDIUM | (optional `/gstack-office-hours`) → `/gsd-discuss-phase N` → `/gsd-plan-phase N` → `/gsd-execute-phase N` (TDD inside) → `/gstack-review` → `/gsd-verify-work N` |
| LARGE | `/gsd-new-project` or `/gsd-new-milestone` → MEDIUM per phase → `/gsd-audit-milestone` → `/gstack-ship` → `/gstack-retro` |

## Defense-in-depth: 5 enforcement layers

```text
0  AGENTS.md                          soft, declarative
1  Per-agent permission.skill         STRUCTURAL — skills absent from agent's tool list
2  Per-agent permission.task          STRUCTURAL — subagents removed from Task tool
3  chat.system.transform +
   experimental.session.compacting    ACTIVE — re-injects HARNESS.md state every turn AND
                                      seeds the compaction summary so post-compaction
                                      turns inherit leg / allowed / forbidden / phase
4  tool.execute.before                HARD — aborts forbidden skill calls before they run
4b tool.execute.after                 ADVANCE — auto-advances Leg: in HARNESS.md when a
                                      sentinel skill succeeds (gsd-verify-work → ship,
                                      gstack-ship → done)
5  session.idle (event hook)          DEFLECTION — when Autonomous: true and leg ≠ done,
                                      enqueues "/gsd-progress" via tui.appendPrompt so
                                      the next turn picks up automatically
```

Layers 1 and 2 use opencode's deny-by-default permission model. The denied
skills are not just blocked — they're removed from the LLM's view, so it
cannot accidentally call them.

Layer 4 is the killer feature. The `tool.execute.before` plugin reads
`.planning/HARNESS.md` on every tool call, looks at the current leg, and
aborts skills not allowed in that leg with a redirect message. **One file
edit reconfigures everything live — no restart.**

Layer 5 is opt-in via `Autonomous: true` (default for `medium` / `large`
sizes per `share/legs.json`'s `autonomousMode` block). It uses the
`tui.appendPrompt` SDK call — which enqueues a slash command rather than
injecting an AI-visible message — to drive the canonical `/gsd-progress`
recovery path when the assistant goes idle. Headless `opencode run` falls
back gracefully: the call 404s, but Layer 3 + 4 still hold.

## Footprint

| Item | Default install | This harness |
| --- | --- | --- |
| Skill files on disk | ~123 | ~43 |
| Skills surfaced to LLM (any agent) | ~123 | ~32 |
| Skills surfaced inside `build` agent | ~123 | **~9** |
| Subagents on disk | ~33 | ~10 |
| Subagents surfaced inside `build` | ~33 | 2 |
| Approx. fixed system-prompt tokens | ~12k | ~2–3k |

The reductions come from:

- GSD `--minimal` flag → 6 core skills instead of 86.
- gstack `--prefix` flag → namespaces all commands as `/gstack-*` so they cannot collide.
- Superpowers' native lazy loading → only descriptions surface; bodies load on demand.
- opencode `permission.skill: "*": "deny"` → globally hide everything not allow-listed.
- Per-agent `permission.skill` overrides → narrow further per agent (build sees ~9).

## State machine: `.planning/HARNESS.md`

The single state file the guard plugin reads. Four things matter:

```markdown
- **Leg:** decision | context | execution | verification | ship | done
- **Autonomous:** true | false
- **Allowed next:** comma-separated list of skill names
- **Forbidden next:** comma-separated list of skill names
```

If `Allowed next` / `Forbidden next` are present, they override the plugin's
defaults for the current leg. If they're absent, the plugin uses built-in
defaults per leg. Either way, you can edit the file and the guard reconfigures
on the next tool call.

`Autonomous: true` opts the project into Layer 5 idle deflection and Layer 4b
auto-advance. `Leg: done` is the terminal marker the auto-advance writes after
a successful `gstack-ship`; deflection stops at that point. To disable
autonomy mid-project, set `Autonomous: false` and save — the plugin reads it
on the next idle tick.

## Autonomous mode

Sourced from `share/legs.json`:

```json
"autonomousMode": { "mini": false, "small": false, "medium": true, "large": true }
```

`harness init <size>` substitutes the matching value into `Autonomous:`. The
small/mini sizes default off because they finish in a single turn; medium and
large benefit from the harness driving itself across the leg sequence
`decision → context → execution → verification → ship → done`. The advance
graph is encoded per-leg as `nextLeg`; `harness self-test` validates it for
cycles and a terminal `ship`.

## Why this design

- **No fork.** Each upstream framework is installed via its own canonical
  channel. We don't vendor any of them. Updates flow through their normal pipes.
- **Declarative + structural + active.** AGENTS.md is the documentation; the
  permissions are the structural constraint; the plugins are the active enforcement.
  All three layers point to the same source of truth (HARNESS.md), so they can't
  drift.
- **Recovery is one file read.** If everything goes wrong, the user can `cat
  .planning/HARNESS.md` and see exactly what state the harness thinks it's in,
  then `/gsd-progress` resumes from there.
