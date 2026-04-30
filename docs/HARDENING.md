# Hardening

> The five enforcement layers, each strictly stronger than the previous. AGENTS.md is the softest; `tool.execute.before` is the hardest.

## The failure-mode table

| Mistake the LLM might make | Caught by | What happens |
| --- | --- | --- |
| Calls `/gstack-office-hours` while in EXECUTION leg, inside `build` agent | Layer 1 (build's `permission.skill`) | Skill not in `<available_skills>` for the agent |
| Switches to `harness` agent, then calls `/gstack-office-hours` after EXECUTION started | Layer 4 (`tool.execute.before` reads HARNESS.md leg=execution; skill is in `Forbidden next`) | Hard abort with redirect: "Allowed-next: ..."  |
| Tries to invoke a denied subagent via Task tool | Layer 2 (`permission.task: deny`) | Subagent removed from Task tool description; LLM cannot reference |
| Forgets the rules after long session / context compaction | Layer 3 (`chat.system.transform`) | Re-injects `<harness-state>` block every turn — instructions never fade |
| Stops the session without completing the leg | Layer 5 (`session.idle`) | Re-prompted to run `/gsd-progress` (deflection guard) |
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

## Performance cost

- Layer 0: zero (string in system prompt).
- Layers 1, 2: zero (opencode filters at config load).
- Layer 3: <5 ms per turn (one file read).
- Layer 4: <5 ms per tool call (one file read, one set lookup).
- Layer 5: zero (only fires on idle).

Overall: imperceptible.
