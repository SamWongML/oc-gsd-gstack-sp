# Hardening

> The five enforcement layers, each strictly stronger than the previous. AGENTS.md is the softest; `tool.execute.before` is the hardest.

## The failure-mode table

| Mistake the LLM might make | Caught by | What happens |
| --- | --- | --- |
| Calls `/gstack-office-hours` while in EXECUTION leg, inside `build` agent | Layer 1 (build's `permission.skill`) | Skill not in `<available_skills>` for the agent |
| Switches to `harness` agent, then calls `/gstack-office-hours` after EXECUTION started | Layer 4 (`tool.execute.before` reads HARNESS.md leg=execution; skill is in `Forbidden next`) | Hard abort with redirect: "Allowed-next: ..."  |
| Tries to invoke a denied subagent via Task tool | Layer 2 (`permission.task: deny`) | Subagent removed from Task tool description; LLM cannot reference |
| Forgets the rules after long session / context compaction | Layer 3 (`chat.system.transform`) | Re-injects `<harness-state>` block every turn — instructions never fade |
| Stops the session without completing the leg (autonomous mode) | Layer 5 (`session.idle` event → `client.tui.appendPrompt`) | `/gsd-progress` is enqueued onto the TUI prompt so the next turn picks up automatically. No-ops when `Autonomous: false` or `Leg: done`. |
| Verification leg succeeds but no one taps the next agent | Layer 4b (`tool.execute.after`) | Sentinel-skill detection (`gsd-verify-work` in `verification`, `gstack-ship` in `ship`) atomically rewrites `Leg:` in `HARNESS.md` and breadcrumbs the transition |
| Long session compacted — the harness state block is at risk of being summarized away | Layer 3 (`experimental.session.compacting`) | The current `<harness-state>` block is pushed into the compaction `output.context` so the summary itself carries leg / allowed / forbidden / phase forward |
| User edits `~/.config/opencode/skills/gstack/...` directly to "fix" something | Layer 0 + discipline | Soft only; rely on `git diff` and `/gstack-retro` |
| User sets the wrong leg in HARNESS.md by mistake | Layer 4 falsely blocks | `/gsd-progress` rewrites HARNESS.md to the right leg; guard reconfigures live |

Five layers. A single missed rule never causes a wrong call.

## Configuration locations

| File | Layer | Editable by user? |
| --- | --- | --- |
| `~/.config/opencode/AGENTS.md` | 0 | Yes (declarative) |
| `~/.config/opencode/agents/{harness,decide,build,verify}.md` | 1, 2 | Yes (per-agent overrides) |
| `~/.config/opencode/opencode.json` permission block | 1, 2 (global default) | Yes (overrides allowed) |
| `~/.config/opencode/plugin/harness-state.ts` | 3 | Yes (TypeScript; restart opencode after edit) |
| `~/.config/opencode/plugin/harness-guard.ts` | 4, 5 | Yes (TypeScript; restart opencode after edit) |
| `<project>/.planning/HARNESS.md` | drives 3, 4, 5 at runtime | Yes — edits take effect on next tool call |

The plugins reference skills **by name**, so adding/removing skills upstream
doesn't break anything. New upstream skills stay denied (safe default) until
you add them to the allow-list. This is how updates stay safe.

## Tuning

- **Loosen for a specific leg:** edit `Allowed next` in `.planning/HARNESS.md`. Effect is live.
- **Loosen globally:** edit `permission.skill` in `~/.config/opencode/opencode.json`.
- **Tighten for an agent:** edit `permission.skill` in the agent's `.md` file.
- **Disable Layer 4 (not recommended):** rename `harness-guard.ts` to `harness-guard.ts.disabled`. Restart opencode.
- **Disable autonomy per project:** set `- **Autonomous:** false` in `.planning/HARNESS.md`. Idle deflection and auto-advance both stop on the next event.
- **Change which sizes default to autonomous:** edit `autonomousMode` in `share/legs.json`, then `harness install`. Existing projects keep their current `Autonomous:` value; only `harness init` reads the new defaults.

## Performance cost

- Layer 0: zero (string in system prompt).
- Layers 1, 2: zero (opencode filters at config load).
- Layer 3: <5 ms per turn (one file read on `chat.system.transform`; one extra read on `experimental.session.compacting`, which only fires at compaction).
- Layer 4: <5 ms per tool call (one file read, one set lookup).
- Layer 4b: <5 ms per skill `tool.execute.after` (sentinel skill match → atomic `Leg:` rewrite only on transition).
- Layer 5: <5 ms on each `session.idle` event (one file read; HTTP `tui.appendPrompt` only when autonomous and leg ≠ done).

Overall: imperceptible.
