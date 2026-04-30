# opencode-harness rules

You are operating inside a three-framework harness. Each framework owns ONE concern.
Never reimplement another's command. Hop between frameworks via files on disk, not chat.

> gstack thinks  →  GSD stabilizes  →  Superpowers executes

## Concern → Owner (canonical commands; never redefine)

- **DECISION / roles** → gstack
  `/gstack-office-hours`, `/gstack-plan-ceo-review`, `/gstack-plan-eng-review`,
  `/gstack-plan-design-review`, `/gstack-autoplan`, `/gstack-review`, `/gstack-codex`,
  `/gstack-browse`, `/gstack-ship`, `/gstack-retro`, `/gstack-learn`,
  `/gstack-freeze`, `/gstack-guard`, `/gstack-careful`
- **CONTEXT / spec / state** → GSD (auto-loads `.planning/`)
  `/gsd-new-project`, `/gsd-new-milestone`, `/gsd-discuss-phase`, `/gsd-plan-phase`,
  `/gsd-execute-phase`, `/gsd-verify-work`, `/gsd-progress`, `/gsd-resume-work`,
  `/gsd-pause-work`, `/gsd-quick`, `/gsd-debug`
- **EXECUTION / TDD** → Superpowers (load via `skill` tool)
  `brainstorming`, `writing-plans`, `executing-plans`, `subagent-driven-development`,
  `test-driven-development`, `using-git-worktrees`, `systematic-debugging`,
  `requesting-code-review`, `receiving-code-review`, `verification-before-completion`,
  `finishing-a-development-branch`

## Source of truth on disk

- `.planning/STATE.md` — managed by GSD. Never hand-edit.
- `.planning/HARNESS.md` — harness state machine. Read on every turn by the guard plugin.
  Contains: Size, Leg, Phase, Plan, Allowed-next, Forbidden-next, Exit-criteria, Breadcrumb.
- All decisions live in commits. Nothing of value lives only in chat.

## Recovery — first action when uncertain

1. `cat .planning/HARNESS.md` (size + leg + last 5 breadcrumbs).
2. Run `/gsd-progress` — it routes to the next correct command (routes A–F).
3. If `.planning/` does not exist, ask the size question (mini/small/medium/large) once
   and follow the matching flow.

## Task-size router — choose ONE flow

### MINI — typo, comment, single-line config (≤ ~10 LOC)
`/gsd-quick` only. One atomic commit. No TDD if the file is not code.

### SMALL — one function or one file (≤ ~50 LOC)
1. `/gsd-quick`
2. Inside execution → Superpowers `test-driven-development`:
   RED (commit) → GREEN (commit) → REFACTOR (commit).

### MEDIUM — multi-file feature (one phase, ≤ ~500 LOC)
1. (Optional) `/gstack-office-hours` if scope is unclear.
2. `/gsd-discuss-phase N` — lock decisions in `{phase}-CONTEXT.md`.
3. `/gsd-plan-phase N` — atomic XML plans, verifier loop.
4. `/gsd-execute-phase N` — wave execution; INSIDE each plan, executor uses
   Superpowers `executing-plans` + `test-driven-development`.
5. `/gstack-review` — paranoid review on the diff only.
6. `/gsd-verify-work N` — manual UAT, fix-plan loop on failures.

### LARGE — milestone, new project, epic
1. `/gsd-new-project` (or `/gsd-new-milestone`).
2. (High stakes only) `/gstack-autoplan` — chained CEO + design + eng review.
3. For each phase: MEDIUM flow above.
4. `/gsd-audit-milestone` → `/gstack-ship` → `/gstack-retro`.

## Cross-framework hops (file-based, not re-prompted)

| From → To | Artifact | How consumed |
| --- | --- | --- |
| gstack → GSD | One-paragraph decision summary | Pasted verbatim as `/gsd-discuss-phase` first answer |
| GSD → Superpowers | `{phase}-{N}-PLAN.md` (XML on disk) | Read as spec; tests written from `<verify>` and `<done>` |
| Superpowers → gstack | `git diff main...HEAD` | `/gstack-review` reads the diff only, never the whole repo |
| gstack → GSD (close) | Verdict text | Pasted into UAT notes; failures become fix plans |

## TDD + atomic commits — non-negotiable

- Every code change in SMALL/MEDIUM/LARGE goes through RED-GREEN-REFACTOR.
- One commit per atomic unit. Never bundle.
- Conventional commit prefix includes the GSD phase-plan ID where one exists:
  `feat(NN-NN): …`, `fix(NN-NN): …`, `test(NN-NN): …`, `refactor(NN-NN): …`.

## Refactor rule — no compatibility layers

Refactors replace, they do not layer. No `v2`/`_legacy`/`_old` parallel paths.
Exception: an external (non-repo) consumer requires backward compat, AND that
consumer is named in the plan. Otherwise `/gstack-review` rejects the PR.

## Forbidden

- Do NOT invent slash commands. Missing capability → author it as a Superpowers skill
  via `writing-skills` and place it in YOUR project's `.opencode/skills/`,
  never inside any framework's directory.
- Do NOT edit files under `~/.config/opencode/skills/gstack/`,
  `~/.config/opencode/agents/gsd-*`, or the Superpowers plugin cache.
- Do NOT run brainstorming-style skills from two frameworks for the same task.
  gstack owns decisions; Superpowers `brainstorming` is reserved for SMALL when
  no gstack decision was needed.

## Update procedure

- All three frameworks: `harness update` (single command, idempotent).
- After any update: run `/gsd-progress` once before resuming work.

## Hard rules (enforced by the guard plugin — `tool.execute.before`)

The plugin reads `.planning/HARNESS.md` on every tool call and aborts skills not
allowed in the current leg. If you receive a "Harness violation" error, do not
retry — read the abort message, run `/gsd-progress`, and follow its routing.
