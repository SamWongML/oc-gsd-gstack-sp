# Phases 02–05 — opencode-harness Thinning + Long-Running Autonomy

> **Status:** Phases 01 and 03 landed. Phase 04 landed (idempotent install + dry-run). Phase 02 (plugin behavior) and Phase 05 (long-running autonomy) remain.
> **Source plan:** `/Users/demon/.claude/plans/do-a-deep-research-virtual-wozniak.md` (full, ~9k words).
> **This file:** actionable phase tracker so the next session can resume cold.

---

## Phase 02 — Plugins consume legs.json + fail-loud + observability

**Outcome:** legs.json becomes the *actual* source of truth (not just a shipped file). Failures surface visibly. Heartbeat gives operators a way to verify the harness is alive.

### 02-01 — `harness-guard.ts` reads `legs.json` at module load
- File: `share/plugin/harness-guard.ts` (currently 208 lines).
- Drop the 90-line hardcoded `LEG_RULES` const (lines 25–115).
- Resolve the JSON path next to the plugin: `dirname(new URL(import.meta.url).pathname)` → `legs.json`.
- Parse once at module load; cache the `Record<string, LegRules>` shape (keep `Set<string>` for O(1) `.has()`).
- Fall open (today's behavior) if the file is missing or malformed — but log a `console.warn` so operators see it in `~/.local/state/opencode/logs`.
- Fields used: `allowedSkills`, `forbiddenSkills`. Other fields (`ownerAgent`, `allowedTasks`, `allowedCommands`, `bashPatterns`) are reserved for later phases and other consumers.
- **Behavior must match Phase 01 counts exactly** (decision 10/5, context 4/4, execution 10/7, verification 7/4, ship 5/3) — Phase 01 was written specifically to enable this swap.

### 02-02 — `harness-state.ts` injects `<harness-warning>` on missing/unknown leg
- File: `share/plugin/harness-state.ts`.
- When `Leg:` field is missing from `.planning/HARNESS.md` or doesn't match a known leg in `legs.json`, push a `<harness-warning>` block onto `output.system` (in addition to today's `<harness-state>`).
- Body: `unknown leg '<value>' — guard fails open. Edit .planning/HARNESS.md or run /gsd-progress.`
- This is the backup channel for headless `opencode run` where the toast (02-03) won't appear.

### 02-03 — TUI toast on harness violations + per-session dedupe
- File: `share/plugin/harness-guard.ts`.
- Take `client` from the plugin factory destructure (`async ({ directory, client }) => ...`).
- On hard abort, fire `client.tui.showToast({ body: { variant: "warning", title: "Harness Warning", message, duration: 6000 } })`.
- Wrap in `try/catch` for headless mode (toast 404s silently when no TUI).
- Dedupe via a module-level `Set<string>` keyed by `${leg}:${skillName}` so each warning toasts once per session.
- Verified API in `@opencode-ai/sdk@1.14.30` types per the Plan agent's research.

### 02-04 — `trimBreadcrumbs` after every append
- File: `share/plugin/harness-guard.ts` `appendBreadcrumb` function.
- After `appendFileSync`, run `trimBreadcrumbs(harnessFile)`:
  1. Read file.
  2. Split into "head" (everything up to and including the trailing line of the breadcrumb header — find a stable marker, e.g. the section title for breadcrumbs) + "trail" (the breadcrumb lines).
  3. Keep only the last 50 trail entries.
  4. Atomic write: `writeFileSync(file + '.tmp', combined); renameSync(file + '.tmp', file)`.
- Fixes the "last 50 kept" claim in `share/templates/HARNESS.template.md` that today is documented but unenforced.

### 02-05 — Heartbeat file from both plugins
- Path: `~/.config/opencode/.harness-heartbeat.json` (or pass via `directory` if scoped per-project — pick one and document).
- Schema:
  ```json
  {
    "lastInjection": "ISO-8601",
    "injectionCount": 0,
    "lastIntercept": "ISO-8601",
    "interceptCount": 0,
    "lastAbort": "ISO-8601",
    "abortCount": 0,
    "lastAbortedSkill": "skill-name",
    "lastIdleDeflection": null,
    "lastAutoAdvance": null
  }
  ```
- Best-effort writes (try/catch, never crash).
- `harness-state.ts` updates `lastInjection` / `injectionCount` per `experimental.chat.system.transform` call.
- `harness-guard.ts` updates `lastIntercept` / `interceptCount` on every `tool.execute.before` it inspects, and `lastAbort` / `abortCount` / `lastAbortedSkill` on hard aborts.
- `harness doctor` reads and prints `lastInjection` + counts.

### 02-06 — `harness self-test` subcommand
- New subcommand in `bin/harness` (model after `cmd_doctor`).
- Checks:
  1. Plugin files exist + parse as TypeScript (run `node --check` via Bun, or just verify `default export` with grep).
  2. `~/.config/opencode/plugin/legs.json` parses + has known leg names matching the 5-leg shape.
  3. Grep `~/.config/opencode/node_modules/@opencode-ai/plugin/dist/index.d.ts` for the literal string `experimental.chat.system.transform` — warn loudly if absent (opencode may have renamed the hook).
  4. If `.planning/HARNESS.md` exists, parse `Leg:` and validate against legs.json keys.
- Wire into `cmd_help`, dispatcher, and the help text.

---

## Phase 03 — `gsd-opencode` migration

**Outcome:** `get-shit-done-cc --minimal` (6 skills, 6 subagents, flat `gsd-*.md` layout) → `gsd-opencode@latest` (12 skills, 33 subagents, ~85 commands, structured layout). Permission allow-lists corrected to reflect skills-vs-commands taxonomy.

### 03-01 — Install line swap
- File: `bin/harness` `cmd_install` step 1 (currently line ~80).
- Replace:
  ```bash
  npx --yes get-shit-done-cc@latest --opencode --global --minimal >/dev/null
  ```
  with:
  ```bash
  npx --yes gsd-opencode@latest install --global >/dev/null
  ```
- **Order matters:** run gsd-opencode install *first*, then clean up old flat `gsd-*.md` files in `~/.config/opencode/skills/` and `~/.config/opencode/agents/`. This minimizes the "no skills installed" window.
- Cleanup pattern: any `gsd-*.md` flat file in `skills/` (gsd-opencode uses `skills/gsd-*/SKILL.md` directories instead).

### 03-02 — Uninstall path
- File: `bin/harness` `cmd_uninstall`.
- Replace direct `find ... rm -rf` with:
  ```bash
  npx --yes gsd-opencode uninstall --global --force 2>/dev/null \
    || warn "gsd-opencode uninstall failed; falling back to manual cleanup"
  ```
- Manual fallback targets the new layout: `skills/gsd-*/`, `command/gsd/`, `agents/gsd-*.md`, `get-shit-done/`.

### 03-03 — Correct `share/opencode.global.json`
- `permission.skill` 15 → 12. Drop these (they are slash commands, not skills):
  - `gsd-quick`, `gsd-progress`, `gsd-debug`, `gsd-resume-work`, `gsd-pause-work`, `gsd-help`, `gsd-update`, `gsd-new-project`, `gsd-new-milestone`
- Keep these 12 as real skills:
  - `gsd-discuss-phase`, `gsd-plan-phase`, `gsd-execute-phase`, `gsd-verify-work`, `gsd-audit-milestone`, `gsd-complete-milestone` (6 GSD)
  - All `gstack-*` and Superpowers skills already correct.
- `permission.task` 6 → 11:
  - decide: `gsd-phase-researcher`, `gsd-planner`, `gsd-pattern-mapper`, `gsd-codebase-mapper`
  - build: `gsd-executor`, `gsd-debugger`, `gsd-code-fixer`
  - verify: `gsd-verifier`, `gsd-code-reviewer`, `gsd-eval-auditor`, `gsd-security-auditor`
- Add `_note: "DERIVED from share/legs.json — edit legs.json first."` at top.
- Optionally: have `bin/harness install` recompute the union from `legs.json` so the file is truly derived (stretch goal — defer if it complicates the merge).

### 03-04 — Per-agent frontmatter corrections
- Files: `share/agents/{harness,decide,build,verify}.md`.
- Remove command-name entries from `permission.skill` blocks (commands aren't skill-tool entries).
- Add new subagents to `permission.task` per leg (mirror legs.json `allowedTasks` once Phase 03-03 expands them).
- `harness.md` becomes `skill: { "*": "deny" }` — the router uses only slash commands (verify against final taxonomy first).

### 03-05 — `share/AGENTS.md` clarity
- Add explicit subsections in the framework-ownership area:
  - **GSD slash commands (user-invoked):** `/gsd-progress`, `/gsd-quick`, `/gsd-debug`, `/gsd-help`, etc. Listed with one-line descriptions. Not gated by `permission.skill`.
  - **GSD skills (LLM-invoked, permission-gated):** the 12 above. Match `legs.json`.

### 03-06 — HARNESS template
- File: `share/templates/HARNESS.template.md`.
- Update `Allowed next` and `Forbidden next` initial values to match the new skill-vs-command taxonomy per leg.

### 03-07 — Doctor coverage
- File: `bin/harness` `cmd_doctor`.
- Validate the 12 gsd-opencode skill *directories* (not flat files): `for skill in gsd-discuss-phase gsd-plan-phase ...; do [[ -d "$OPENCODE_DIR/skills/$skill" ]] || warn ...; done`.
- Validate `~/.config/opencode/command/gsd/` exists and has `*.md` files.
- Read `~/.config/opencode/get-shit-done/VERSION` and report.

---

## Phase 04 — Idempotent install + dry-run ✅

**Outcome:** `harness install` no longer clobbers a user's pre-existing `plugin` array; provides a dry-run preview; backs up before touching `opencode.json`.

**Landed:** `bin/harness` `cmd_install` now:
- Parses `--dry-run`; in that mode every step prints "would …" and the JSON merge prints `diff -u` instead of writing.
- For the real merge: timestamped backup at `opencode.json.bak.YYYYmmdd-HHMMSS`, recursive harness-wins merge for scalars/objects, `unique` union for `plugin` and `instructions` arrays, and a "keep last 5 backups" GC step.
- Verified via fixture: user's custom `plugin` entries survive; user-only top-level keys preserved; user's extra `permission.skill` entries survive at depth; harness scalar policies still override; merge is idempotent on a second run; GC trims old backups to 5.

### 04-01 — Backup + union-merge
- File: `bin/harness` `cmd_install` step 5 (currently lines ~111–122).
- Replace `jq -s '.[0] * .[1]'` with:
  ```bash
  local backup="$cfg.bak.$(date +%Y%m%d-%H%M%S)"
  cp "$cfg" "$backup"
  jq -s '
    .[0] as $user | .[1] as $harness |
    $user * $harness |
    .plugin       = ([$user.plugin // [],       $harness.plugin // []]       | add | unique) |
    .instructions = ([$user.instructions // [], $harness.instructions // []] | add | unique)
  ' "$cfg" "$SHARE/opencode.global.json" > "$tmp" && mv "$tmp" "$cfg"
  ```
- Print backup path so user knows where to revert.
- Optionally garbage-collect old backups (keep last 5).

### 04-02 — `--dry-run` flag
- File: `bin/harness` dispatcher + `cmd_install`.
- Parse `--dry-run` from args. When set:
  - Run the same merge through `diff <(cat "$cfg") -` (or `git diff --no-index`).
  - Skip writes. No backup.
  - Exit 0 with the diff printed.
- Inherited by `cmd_update` since it's `cmd_install` aliased.

---

## Phase 05 — Long-running autonomy

**Outcome:** A `harness init medium` job can run end-to-end without manual nudging. Compaction can't drop state. Idle ticks resume from the canonical recovery command. Successful verification auto-advances to ship.

### 05-01 — Add `nextLeg` to `share/legs.json`
- New per-leg field in `share/legs.json`:
  ```json
  "decision":     { ..., "nextLeg": "context" },
  "context":      { ..., "nextLeg": "execution" },
  "execution":    { ..., "nextLeg": "verification" },
  "verification": { ..., "nextLeg": "ship" },
  "ship":         { ..., "nextLeg": null }
  ```
- Updates `harness self-test` Phase 02-06 check: validate no cycles, terminal `ship`.

### 05-02 — `autonomousMode` toggle
- New top-level key in `share/legs.json`: `"autonomousMode": { "mini": false, "small": false, "medium": true, "large": true }`.
- `bin/harness cmd_init` reads the flag for the requested size and writes `Autonomous: true|false` to the new HARNESS.md.
- `share/templates/HARNESS.template.md` gets a `__AUTONOMOUS__` slot that `cmd_init` substitutes (mirror existing `__SIZE__`).
- User can flip per-project by editing the field.

### 05-03 — Compaction-survival hook
- File: `share/plugin/harness-state.ts`.
- Register `experimental.session.compacting` alongside `experimental.chat.system.transform`.
- Compaction handler pushes the current `<harness-state>` block into `output.context` so the post-compaction summary inherits leg, allowed/forbidden, last-known phase ID.
- Layer 3 already re-injects every turn — this hook makes the compaction summary itself state-aware so the very first post-compaction turn cannot drift.

### 05-04 — Idle deflection (Layer 5 implementation)
- File: `share/plugin/harness-guard.ts`.
- Register `session.idle`.
- On idle:
  1. Read `.planning/HARNESS.md`.
  2. If `Autonomous: true` AND not (leg = `ship` with exit-criteria met):
     - Call `client.tui.appendPrompt({ text: "\n/gsd-progress" })` (leading newline so it doesn't land mid-message if user is mid-typing).
     - Update heartbeat `lastIdleDeflection`.
  3. Otherwise no-op.
- `tui.appendPrompt` is a real SDK call (verified). Per GitHub #17412 we cannot inject AI-visible messages, but we can enqueue the next slash command — that's the workable form of Layer 5.
- Headless mode degrades gracefully (the call 404s); compaction + per-turn re-injection still hold.

### 05-05 — Auto-advance on exit-criteria match
- File: `share/plugin/harness-guard.ts` `tool.execute.after`.
- Detect sentinels:
  - `gsd-verify-work` returns success in `verification` leg → advance to `ship`.
  - `gstack-ship` success in `ship` leg → mark complete (set `Leg: done` or similar terminal marker; Layer 5 stops deflecting).
- Atomic rewrite of `Leg:` in `.planning/HARNESS.md` via the same `.tmp` + `renameSync` pattern as `trimBreadcrumbs` (02-04).
- Append breadcrumb `auto-advance: <from> → <to>`.
- Update heartbeat `lastAutoAdvance`.
- Eliminates the human "Tab to next agent" step that today gates progression.

### 05-06 — Self-test extensions
- Extend `harness self-test` (Phase 02-06):
  - Validate `legs.json` advance graph: no cycles, terminal `ship`, every `nextLeg` resolves to a known key.
  - Check `Autonomous:` field present in `.planning/HARNESS.md`.
  - Recency check on `lastIdleDeflection` and `lastAutoAdvance` (warn if autonomous mode enabled but neither has fired in N turns).

### 05-07 — Documentation realignment
- Files: `docs/DESIGN.md`, `docs/HARDENING.md`, `docs/TROUBLESHOOTING.md`, `README.md`.
- Re-purpose Layer 5 from "documented-only" to "implemented as `tui.appendPrompt` deflection on `session.idle`."
- Update the failure-mode table.
- Add an "Autonomous mode" section explaining the gate, the safety properties, and how to disable per-project.

---

## End-to-end verification (run after Phase 05)

```bash
# Fresh install + structural correctness
harness install
harness doctor                       # all green incl. heartbeat + experimental hook present
harness self-test                    # plugin exports, legs.json parse, hook introspection, leg validity

# gsd-opencode layout
ls ~/.config/opencode/skills/ | grep -c '^gsd-'        # → 12 directories
ls ~/.config/opencode/command/gsd/*.md | wc -l         # → ~85
cat ~/.config/opencode/get-shit-done/VERSION           # → 1.38.5+
jq '.permission.skill | keys | map(select(startswith("gsd-")))' ~/.config/opencode/opencode.json
                                                       # → exactly the 12 real skills

# Single source of truth
# Edit share/legs.json: remove gstack-office-hours from decision.allowedSkills.
# harness install. Open opencode in decide leg. Try gstack-office-hours → blocked.

# Fail-loud
echo "- **Leg:** typoleg" >> .planning/HARNESS.md
# Open opencode → TUI toast warns "unknown leg 'typoleg'"; <harness-warning> appears in system prompt;
# guard fails open (no enforcement) but the warning surfaces clearly.

# Hard abort still works on a real violation
# Set Leg: execution. In build agent, attempt skill: gstack-office-hours.
# → "Harness violation: skill 'gstack-office-hours' is forbidden in leg 'execution'" + toast.

# Breadcrumb trim
for i in $(seq 1 60); do echo "- 2026-05-01T00:00:0${i}Z skill: test-$i" >> .planning/HARNESS.md; done
# Trigger any allowed skill → after-hook trims:
grep -c "skill:" .planning/HARNESS.md                  # → 50, not 61

# Idempotent install
jq '.plugin += ["my-custom-plugin"]' ~/.config/opencode/opencode.json | sponge ~/.config/opencode/opencode.json
harness install
jq '.plugin' ~/.config/opencode/opencode.json         # → ["my-custom-plugin", "superpowers@..."]
ls ~/.config/opencode/opencode.json.bak.*             # backup created

# Dry-run
harness install --dry-run                              # prints diff, no writes, no backup

# Long-running autonomy
harness init medium                                    # writes Autonomous: true to HARNESS.md
# Open opencode in build, complete an /gsd-execute-phase RED-GREEN-REFACTOR cycle.
# After verification leg's gsd-verify-work succeeds → guard auto-advances Leg: ship in HARNESS.md
# (cat .planning/HARNESS.md). Heartbeat shows lastAutoAdvance timestamp.
# Stop typing — wait for session.idle. tui.appendPrompt enqueues "/gsd-progress" automatically.

# Compaction survival
# Drive a long session past 75% context to trigger /compact (or /compact manually).
# After compaction: harness state should still be present in the very first turn.
```

---

## Resume protocol

When picking up later:

1. Open this file.
2. Pick the next un-checked phase.
3. Re-read the original full plan at `/Users/demon/.claude/plans/do-a-deep-research-virtual-wozniak.md` for context (Recommended Approach, Risks & Trade-offs sections).
4. Re-read `share/legs.json` (Phase 01 output, behavior baseline) and `share/plugin/harness-guard.ts` (current Layer 4 implementation) before touching plugins.
5. Use atomic commits per task ID: `feat(02-01): guard reads legs.json at module load`, etc.

## Critical files (reference)

- `share/legs.json` — single source of truth (Phase 01 ✅)
- `share/plugin/harness-guard.ts` — Layer 4 hard abort, target of 02-01/02-03/02-04/05-04/05-05
- `share/plugin/harness-state.ts` — Layer 3 injection, target of 02-02/02-05/05-03
- `bin/harness` — CLI, target of 02-06/03-01/03-02/03-07/04-01/04-02/05-02
- `share/opencode.global.json` — target of 03-03
- `share/agents/{harness,decide,build,verify}.md` — target of 03-04
- `share/AGENTS.md` — target of 03-05
- `share/templates/HARNESS.template.md` — target of 03-06/05-02
- `docs/{DESIGN,HARDENING,TROUBLESHOOTING}.md`, `README.md` — target of 05-07

## Risks (carry-forward from full plan)

1. `experimental.*` hooks may be renamed by opencode → mitigated by 02-06 self-test grep.
2. `output.abort` and `input?.args?.name` are runtime-only contracts → guard logs a `console.warn` if `skill` arrives without `args.name`.
3. `client.tui.*` 404s in headless mode → `<harness-warning>` block (02-02) is the backup channel.
4. Auto-advance is opt-in via `Autonomous: true` → mini/small default false.
5. `session.idle` + `tui.appendPrompt` is not the same as injecting an AI-visible message (#17412) → if opencode ships true idle-injection later, swap implementations in 05-04.
6. `gsd-opencode` is a community port → doctor reports `get-shit-done/VERSION`; users can pin in `bin/harness` if needed.
