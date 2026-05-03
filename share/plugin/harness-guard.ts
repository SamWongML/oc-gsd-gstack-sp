// harness-guard.ts
//
// opencode plugin: hard-aborts slash-command invocations that violate the leg
// rules in .planning/HARNESS.md. This is Layer 4 of the defense-in-depth stack
// — it physically prevents wrong calls from executing, even if the LLM ignored
// AGENTS.md and the per-agent permissions somehow let the call through.
//
// Mechanism: in opencode 1.14.x, gsd-* / gstack-* skills are invoked as slash
// commands (`/gsd-execute-phase`, `/gstack-ship`, …), which fire the plugin's
// `command.execute.before` hook. Earlier versions of this plugin policed
// `tool.execute.before` for a `skill` tool that no longer exists in current
// opencode, so Layer 4 was silently dormant — see the runtime test report.
//
// Rules come from legs.json sitting alongside this file (single source of
// truth, shipped by `harness install`). HARNESS.md may override per-project
// via "Allowed next" / "Forbidden next" fields.
//
// On hard abort, surfaces a TUI toast (best-effort, deduped per session) and
// updates ~/.config/opencode/.harness-heartbeat.json so operators can verify
// the harness is alive via `harness doctor`.
//
// Loaded automatically by opencode at startup from ~/.config/opencode/plugin/.

import type { Plugin } from "@opencode-ai/plugin"
import { readFileSync, existsSync, appendFileSync, writeFileSync, renameSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { homedir } from "node:os"

interface LegRules {
  allowed: Set<string>
  forbidden: Set<string>
}

const HEARTBEAT_PATH = join(homedir(), ".config", "opencode", ".harness-heartbeat.json")

// -------------------- legs.json (single source of truth) --------------------

const PLUGIN_DIR = dirname(fileURLToPath(import.meta.url))
const LEGS_PATH = join(PLUGIN_DIR, "legs.json")

function loadLegRules(): { rules: Record<string, LegRules>; nextLeg: Record<string, string | null> } {
  try {
    const raw = readFileSync(LEGS_PATH, "utf8")
    const data = JSON.parse(raw)
    const legs = data?.legs
    if (!legs || typeof legs !== "object") {
      console.warn(`[harness-guard] ${LEGS_PATH} has no .legs object — guard fails open.`)
      return { rules: {}, nextLeg: {} }
    }
    const rules: Record<string, LegRules> = {}
    const nextLeg: Record<string, string | null> = {}
    for (const [name, leg] of Object.entries(legs as Record<string, any>)) {
      const allowed = Array.isArray(leg?.allowedSkills) ? leg.allowedSkills : []
      const forbidden = Array.isArray(leg?.forbiddenSkills) ? leg.forbiddenSkills : []
      rules[name] = {
        allowed: new Set(allowed),
        forbidden: new Set(forbidden),
      }
      nextLeg[name] = typeof leg?.nextLeg === "string" ? leg.nextLeg : null
    }
    return { rules, nextLeg }
  } catch (err) {
    console.warn(`[harness-guard] failed to load ${LEGS_PATH}: ${(err as Error).message} — guard fails open.`)
    return { rules: {}, nextLeg: {} }
  }
}

const { rules: LEG_RULES, nextLeg: NEXT_LEG } = loadLegRules()

// -------------------- heartbeat (operator visibility) --------------------

interface Heartbeat {
  lastInjection: string | null
  injectionCount: number
  lastIntercept: string | null
  interceptCount: number
  lastAbort: string | null
  abortCount: number
  lastAbortedSkill: string | null
  lastIdleDeflection: string | null
  lastAutoAdvance: string | null
}

function readHeartbeat(): Heartbeat {
  try {
    if (existsSync(HEARTBEAT_PATH)) {
      const parsed = JSON.parse(readFileSync(HEARTBEAT_PATH, "utf8"))
      return {
        lastInjection: parsed.lastInjection ?? null,
        injectionCount: parsed.injectionCount ?? 0,
        lastIntercept: parsed.lastIntercept ?? null,
        interceptCount: parsed.interceptCount ?? 0,
        lastAbort: parsed.lastAbort ?? null,
        abortCount: parsed.abortCount ?? 0,
        lastAbortedSkill: parsed.lastAbortedSkill ?? null,
        lastIdleDeflection: parsed.lastIdleDeflection ?? null,
        lastAutoAdvance: parsed.lastAutoAdvance ?? null,
      }
    }
  } catch {
    /* fall through to defaults */
  }
  return {
    lastInjection: null,
    injectionCount: 0,
    lastIntercept: null,
    interceptCount: 0,
    lastAbort: null,
    abortCount: 0,
    lastAbortedSkill: null,
    lastIdleDeflection: null,
    lastAutoAdvance: null,
  }
}

function updateHeartbeat(patch: Partial<Heartbeat>): void {
  try {
    const current = readHeartbeat()
    const next = { ...current, ...patch }
    const tmp = HEARTBEAT_PATH + ".tmp"
    writeFileSync(tmp, JSON.stringify(next, null, 2))
    renameSync(tmp, HEARTBEAT_PATH)
  } catch {
    /* heartbeat is best-effort */
  }
}

interface HarnessSnapshot {
  leg: string
  rules: LegRules
}

function readHarnessFile(directory: string): string | null {
  const harnessFile = join(directory, ".planning", "HARNESS.md")
  if (!existsSync(harnessFile)) return null
  try {
    return readFileSync(harnessFile, "utf8")
  } catch {
    return null
  }
}

function readLegRaw(directory: string): string {
  const content = readHarnessFile(directory)
  if (!content) return ""
  const legMatch = /^- \*\*Leg:\*\*\s*(\w+)/m.exec(content)
  return legMatch ? legMatch[1].toLowerCase() : ""
}

function readAutonomous(directory: string): boolean {
  const content = readHarnessFile(directory)
  if (!content) return false
  const m = /^- \*\*Autonomous:\*\*\s*(\w+)/m.exec(content)
  return !!m && m[1].toLowerCase() === "true"
}

function loadHarness(directory: string): HarnessSnapshot | null {
  const content = readHarnessFile(directory)
  if (!content) return null

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

// -------------------- atomic Leg: rewrite (auto-advance) --------------------

function rewriteLeg(directory: string, fromLeg: string, toLeg: string): boolean {
  const harnessFile = join(directory, ".planning", "HARNESS.md")
  if (!existsSync(harnessFile)) return false
  let content: string
  try {
    content = readFileSync(harnessFile, "utf8")
  } catch {
    return false
  }
  const legLine = /^- \*\*Leg:\*\*\s*\w+.*$/m
  if (!legLine.test(content)) return false
  const next = content.replace(legLine, `- **Leg:** ${toLeg}`)
  if (next === content) return false
  try {
    const tmp = harnessFile + ".tmp"
    writeFileSync(tmp, next)
    renameSync(tmp, harnessFile)
  } catch {
    return false
  }
  // Breadcrumb the transition so operators can see why the leg changed.
  try {
    const stamp = new Date().toISOString()
    appendFileSync(harnessFile, `\n- ${stamp} auto-advance: ${fromLeg} → ${toLeg}`)
    trimBreadcrumbs(harnessFile)
  } catch {
    /* breadcrumb is best-effort */
  }
  return true
}

// -------------------- breadcrumb append + trim --------------------

const BREADCRUMB_LIMIT = 50
const BREADCRUMB_LINE_RE = /^- \d{4}-\d{2}-\d{2}T[^\s]+\s+(?:skill:|auto-advance:)\s+/

function appendBreadcrumb(directory: string, skillName: string): void {
  const harnessFile = join(directory, ".planning", "HARNESS.md")
  if (!existsSync(harnessFile)) return
  const stamp = new Date().toISOString()
  try {
    appendFileSync(harnessFile, `\n- ${stamp} skill: ${skillName}`)
  } catch {
    return // append failed; nothing to trim
  }
  trimBreadcrumbs(harnessFile)
}

function trimBreadcrumbs(harnessFile: string): void {
  try {
    const content = readFileSync(harnessFile, "utf8")
    const lines = content.split("\n")

    let breadcrumbCount = 0
    for (const line of lines) {
      if (BREADCRUMB_LINE_RE.test(line)) breadcrumbCount++
    }
    if (breadcrumbCount <= BREADCRUMB_LIMIT) return

    let toDrop = breadcrumbCount - BREADCRUMB_LIMIT
    const kept: string[] = []
    for (const line of lines) {
      if (BREADCRUMB_LINE_RE.test(line) && toDrop > 0) {
        toDrop--
        continue
      }
      kept.push(line)
    }
    const newContent = kept.join("\n")
    const tmp = harnessFile + ".tmp"
    writeFileSync(tmp, newContent)
    renameSync(tmp, harnessFile)
  } catch {
    /* trim is best-effort */
  }
}

// -------------------- toast dedupe (per-session) --------------------

const toastDedupe = new Set<string>()

export const HarnessGuard: Plugin = async ({ directory, client }) => {
  return {
    // -------------------- HARD ABORT + BREADCRUMB + AUTO-ADVANCE --------------------
    // command.execute.before fires when a slash command (e.g. /gsd-execute-phase)
    // is about to be rendered into the chat. We intercept gsd-* / gstack-*
    // commands here:
    //   - if forbidden in the current leg → replace output.parts with a single
    //     denial TextPart so the model only sees "blocked, do X instead".
    //   - if allowed → append breadcrumb and, for sentinel commands, advance
    //     Leg: in HARNESS.md so the next turn picks up the new leg.
    "command.execute.before": async (input: any, output: any) => {
      const command: string = input?.command ?? ""
      if (!command) return

      // Only police harness-managed commands. Everything else (e.g. user's own
      // /custom-thing) flows through untouched.
      if (!command.startsWith("gsd-") && !command.startsWith("gstack-")) return

      const now = new Date().toISOString()
      updateHeartbeat({
        lastIntercept: now,
        interceptCount: readHeartbeat().interceptCount + 1,
      })

      const snap = loadHarness(directory)
      if (!snap) return // No HARNESS.md or unknown leg — fail open.

      let abortMsg: string | undefined
      if (snap.rules.forbidden.has(command)) {
        abortMsg =
          `Harness violation: '${command}' is forbidden in leg '${snap.leg}'. ` +
          `Allowed-next: ${[...snap.rules.allowed].join(", ")}. ` +
          `Run /gsd-progress for the next correct action, or update .planning/HARNESS.md to change leg.`
      } else if (snap.rules.allowed.size > 0 && !snap.rules.allowed.has(command)) {
        abortMsg =
          `Harness violation: '${command}' is not in the allow-list for leg '${snap.leg}'. ` +
          `Allowed-next: ${[...snap.rules.allowed].join(", ")}. ` +
          `Run /gsd-progress to find the right next command.`
      }

      if (abortMsg) {
        // Replace the rendered command output with a synthetic denial part so
        // the model receives only the denial, not the command's instructions.
        // Required TextPart fields (id/sessionID/messageID) are filled with
        // synthetic placeholders; opencode treats parts pushed by plugins as
        // synthetic message content.
        if (Array.isArray(output?.parts)) {
          const sid = input?.sessionID ?? ""
          const partID = `harness-abort-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
          output.parts.length = 0
          output.parts.push({
            id: partID,
            sessionID: sid,
            messageID: partID,
            type: "text",
            text: abortMsg,
            synthetic: true,
          } as any)
        }

        const hb = readHeartbeat()
        updateHeartbeat({
          lastAbort: now,
          abortCount: hb.abortCount + 1,
          lastAbortedSkill: command,
        })

        // Per-session dedupe: only toast once per (leg, command) pair.
        const key = `${snap.leg}:${command}`
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
            // Headless mode (no TUI) — toast endpoint 404s. The denial part is
            // already in output.parts, so the model still sees the block.
          }
        }
        return
      }

      // Allowed path: breadcrumb the call so operators can audit the leg path.
      appendBreadcrumb(directory, command)

      // Auto-advance: a sentinel command rewrites Leg: in HARNESS.md so the
      // next turn (and the guard) see the new leg without manual edit. This
      // fires optimistically before the command renders — semantically "we
      // committed to advancing because the user asked for the sentinel". If
      // the sentinel fails, the user can edit Leg: back manually.
      //   - /gsd-verify-work in 'verification' → advance to nextLeg ('ship')
      //   - /gstack-ship     in 'ship'         → terminal marker 'done'
      let advanceTo: string | null = null
      if (command === "gsd-verify-work" && snap.leg === "verification") {
        advanceTo = NEXT_LEG["verification"] ?? "ship"
      } else if (command === "gstack-ship" && snap.leg === "ship") {
        advanceTo = "done"
      }
      if (advanceTo && rewriteLeg(directory, snap.leg, advanceTo)) {
        updateHeartbeat({ lastAutoAdvance: new Date().toISOString() })
      }
    },

    // -------------------- IDLE DEFLECTION (Layer 5) --------------------
    // session.idle fires when the assistant's turn ends. If the project is in
    // autonomous mode and not already at a terminal state, enqueue the
    // canonical recovery command into the prompt so the next turn picks up
    // automatically. tui.appendPrompt 404s in headless mode — caught.
    event: async (input: any) => {
      if (input?.event?.type !== "session.idle") return
      if (!readAutonomous(directory)) return
      const leg = readLegRaw(directory)
      // 'done' is the terminal marker auto-advance writes after gstack-ship.
      // Skipping it here is what stops the deflection loop on a finished milestone.
      if (!leg || leg === "done") return
      try {
        await client.tui.appendPrompt({ body: { text: "\n/gsd-progress" } })
        updateHeartbeat({ lastIdleDeflection: new Date().toISOString() })
      } catch {
        // Headless mode (no TUI) — appendPrompt endpoint 404s. Per-turn
        // re-injection (Layer 3) and compaction-survival still hold.
      }
    },
  }
}

export default HarnessGuard
