// harness-guard.ts
//
// opencode plugin: hard-aborts skill calls that violate the leg rules in
// .planning/HARNESS.md. This is Layer 4 of the defense-in-depth stack — it
// physically prevents wrong calls from executing, even if the LLM ignored
// AGENTS.md and the per-agent permissions somehow let the call through.
//
// It also appends a breadcrumb to HARNESS.md after every successful skill
// load, so /gsd-progress and human recovery have a log to follow.
//
// Loaded automatically by opencode at startup from ~/.config/opencode/plugin/.

import type { Plugin } from "@opencode-ai/plugin"
import { readFileSync, existsSync, appendFileSync } from "node:fs"
import { join } from "node:path"

interface LegRules {
  allowed: Set<string>
  forbidden: Set<string>
}

// Default rules per leg. The plugin first looks for explicit Allowed-next /
// Forbidden-next fields in HARNESS.md (which take precedence). These are the
// fallback when those fields are missing.
const LEG_RULES: Record<string, LegRules> = {
  decision: {
    allowed: new Set([
      "gstack-office-hours",
      "gstack-plan-ceo-review",
      "gstack-plan-eng-review",
      "gstack-plan-design-review",
      "gstack-autoplan",
      "gstack-codex",
      "gstack-browse",
      "gsd-progress",
      "gsd-discuss-phase",
      "gsd-plan-phase",
    ]),
    forbidden: new Set([
      "test-driven-development",
      "executing-plans",
      "gsd-execute-phase",
      "gstack-ship",
      "gstack-review",
    ]),
  },
  context: {
    allowed: new Set([
      "gsd-discuss-phase",
      "gsd-plan-phase",
      "gsd-progress",
      "writing-plans",
    ]),
    forbidden: new Set([
      "test-driven-development",
      "executing-plans",
      "gsd-execute-phase",
      "gstack-ship",
    ]),
  },
  execution: {
    allowed: new Set([
      "gsd-execute-phase",
      "test-driven-development",
      "executing-plans",
      "subagent-driven-development",
      "using-git-worktrees",
      "systematic-debugging",
      "gsd-progress",
      "gsd-debug",
      "verification-before-completion",
      "finishing-a-development-branch",
    ]),
    forbidden: new Set([
      "gstack-office-hours",
      "gstack-plan-ceo-review",
      "gstack-autoplan",
      "gstack-ship",
      "gsd-new-project",
      "gsd-new-milestone",
      "brainstorming",
    ]),
  },
  verification: {
    allowed: new Set([
      "gsd-verify-work",
      "gstack-review",
      "gstack-codex",
      "gstack-browse",
      "requesting-code-review",
      "receiving-code-review",
      "gsd-progress",
    ]),
    forbidden: new Set([
      "gsd-execute-phase",
      "test-driven-development",
      "gstack-office-hours",
      "gstack-ship",
    ]),
  },
  ship: {
    allowed: new Set([
      "gstack-ship",
      "gsd-audit-milestone",
      "gsd-complete-milestone",
      "gstack-retro",
      "gsd-progress",
    ]),
    forbidden: new Set([
      "test-driven-development",
      "executing-plans",
      "gsd-execute-phase",
    ]),
  },
}

interface HarnessSnapshot {
  leg: string
  rules: LegRules
}

function loadHarness(directory: string): HarnessSnapshot | null {
  const harnessFile = join(directory, ".planning", "HARNESS.md")
  if (!existsSync(harnessFile)) return null

  let content: string
  try {
    content = readFileSync(harnessFile, "utf8")
  } catch {
    return null
  }

  const legMatch = /^- \*\*Leg:\*\*\s*(\w+)/m.exec(content)
  const leg = legMatch ? legMatch[1].toLowerCase() : ""
  if (!leg || !(leg in LEG_RULES)) {
    // Unknown leg — fail open (don't block).
    return null
  }

  // Honor explicit allow/forbid lists if present (override defaults)
  const allowedField = /^- \*\*Allowed next:\*\*\s*(.+)$/m.exec(content)
  const forbiddenField = /^- \*\*Forbidden next:\*\*\s*(.+)$/m.exec(content)

  const baseRules = LEG_RULES[leg]
  const rules: LegRules = {
    allowed: allowedField
      ? new Set(allowedField[1].split(",").map(s => s.trim()).filter(Boolean))
      : baseRules.allowed,
    forbidden: forbiddenField
      ? new Set(forbiddenField[1].split(",").map(s => s.trim()).filter(Boolean))
      : baseRules.forbidden,
  }

  return { leg, rules }
}

function appendBreadcrumb(directory: string, skillName: string): void {
  const harnessFile = join(directory, ".planning", "HARNESS.md")
  if (!existsSync(harnessFile)) return
  const stamp = new Date().toISOString()
  try {
    appendFileSync(harnessFile, `\n- ${stamp} skill: ${skillName}`)
  } catch {
    /* breadcrumb is best-effort */
  }
}

export const HarnessGuard: Plugin = async ({ directory }) => {
  return {
    // -------------------- HARD ABORT on forbidden skill calls --------------------
    "tool.execute.before": async (input: any, output: any) => {
      // Only police skill loads. opencode's native skill tool name is "skill".
      if (input?.tool !== "skill") return

      const snap = loadHarness(directory)
      if (!snap) return // No HARNESS.md or unknown leg — fail open.

      const skillName: string | undefined = input?.args?.name
      if (!skillName) return

      if (snap.rules.forbidden.has(skillName)) {
        output.abort =
          `Harness violation: skill '${skillName}' is forbidden in leg '${snap.leg}'. ` +
          `Allowed-next: ${[...snap.rules.allowed].join(", ")}. ` +
          `Run /gsd-progress for the next correct action, or update .planning/HARNESS.md to change leg.`
        return
      }

      if (snap.rules.allowed.size > 0 && !snap.rules.allowed.has(skillName)) {
        output.abort =
          `Harness violation: skill '${skillName}' is not in the allow-list for leg '${snap.leg}'. ` +
          `Allowed-next: ${[...snap.rules.allowed].join(", ")}. ` +
          `Run /gsd-progress to find the right next command.`
        return
      }
    },

    // -------------------- BREADCRUMB on successful skill load --------------------
    "tool.execute.after": async (input: any) => {
      if (input?.tool !== "skill") return
      const skillName: string | undefined = input?.args?.name
      if (!skillName) return
      appendBreadcrumb(directory, skillName)
    },
  }
}

export default HarnessGuard
