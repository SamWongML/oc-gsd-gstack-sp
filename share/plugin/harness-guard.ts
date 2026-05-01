// harness-guard.ts
//
// opencode plugin: hard-aborts skill calls that violate the leg rules in
// .planning/HARNESS.md. This is Layer 4 of the defense-in-depth stack — it
// physically prevents wrong calls from executing, even if the LLM ignored
// AGENTS.md and the per-agent permissions somehow let the call through.
//
// Rules come from legs.json sitting alongside this file (single source of
// truth, shipped by `harness install`). HARNESS.md may override per-project
// via "Allowed next" / "Forbidden next" fields.
//
// On hard abort, surfaces a TUI toast (best-effort, deduped per session) so
// the operator sees the violation in the UI in addition to the abort string.
//
// Loaded automatically by opencode at startup from ~/.config/opencode/plugin/.

import type { Plugin } from "@opencode-ai/plugin"
import { readFileSync, existsSync, appendFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

interface LegRules {
  allowed: Set<string>
  forbidden: Set<string>
}

// -------------------- legs.json (single source of truth) --------------------

const PLUGIN_DIR = dirname(fileURLToPath(import.meta.url))
const LEGS_PATH = join(PLUGIN_DIR, "legs.json")

function loadLegRules(): Record<string, LegRules> {
  try {
    const raw = readFileSync(LEGS_PATH, "utf8")
    const data = JSON.parse(raw)
    const legs = data?.legs
    if (!legs || typeof legs !== "object") {
      console.warn(`[harness-guard] ${LEGS_PATH} has no .legs object — guard fails open.`)
      return {}
    }
    const out: Record<string, LegRules> = {}
    for (const [name, leg] of Object.entries(legs as Record<string, any>)) {
      const allowed = Array.isArray(leg?.allowedSkills) ? leg.allowedSkills : []
      const forbidden = Array.isArray(leg?.forbiddenSkills) ? leg.forbiddenSkills : []
      out[name] = {
        allowed: new Set(allowed),
        forbidden: new Set(forbidden),
      }
    }
    return out
  } catch (err) {
    console.warn(`[harness-guard] failed to load ${LEGS_PATH}: ${(err as Error).message} — guard fails open.`)
    return {}
  }
}

const LEG_RULES: Record<string, LegRules> = loadLegRules()

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

  // Honor explicit allow/forbid lists if present (per-project override)
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

// -------------------- toast dedupe (per-session) --------------------

const toastDedupe = new Set<string>()

export const HarnessGuard: Plugin = async ({ directory, client }) => {
  return {
    // -------------------- HARD ABORT on forbidden skill calls --------------------
    "tool.execute.before": async (input: any, output: any) => {
      // Only police skill loads. opencode's native skill tool name is "skill".
      if (input?.tool !== "skill") return

      const snap = loadHarness(directory)
      if (!snap) return // No HARNESS.md or unknown leg — fail open.

      const skillName: string | undefined = input?.args?.name
      if (!skillName) {
        // Runtime contract: skill tool should always carry args.name. If not, log once.
        console.warn("[harness-guard] skill tool invoked without args.name; cannot evaluate.")
        return
      }

      let abortMsg: string | undefined

      if (snap.rules.forbidden.has(skillName)) {
        abortMsg =
          `Harness violation: skill '${skillName}' is forbidden in leg '${snap.leg}'. ` +
          `Allowed-next: ${[...snap.rules.allowed].join(", ")}. ` +
          `Run /gsd-progress for the next correct action, or update .planning/HARNESS.md to change leg.`
      } else if (snap.rules.allowed.size > 0 && !snap.rules.allowed.has(skillName)) {
        abortMsg =
          `Harness violation: skill '${skillName}' is not in the allow-list for leg '${snap.leg}'. ` +
          `Allowed-next: ${[...snap.rules.allowed].join(", ")}. ` +
          `Run /gsd-progress to find the right next command.`
      }

      if (!abortMsg) return

      output.abort = abortMsg

      // Per-session dedupe: only toast once per (leg, skill) pair.
      const key = `${snap.leg}:${skillName}`
      if (!toastDedupe.has(key)) {
        toastDedupe.add(key)
        try {
          await client.tui.showToast({
            body: {
              variant: "warning",
              title: "Harness Warning",
              message: abortMsg,
              duration: 6000,
            },
          })
        } catch {
          // Headless mode (no TUI) — toast endpoint 404s. Hard abort already set.
        }
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
