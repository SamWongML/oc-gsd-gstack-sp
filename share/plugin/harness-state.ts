// harness-state.ts
//
// opencode plugin: injects the current harness leg + allow/forbid lists from
// .planning/HARNESS.md into the system prompt before EVERY LLM call.
//
// This is Layer 3 of the harness defense-in-depth stack:
//   - AGENTS.md fades after compaction.
//   - This hook re-injects state every turn, so it never fades.
//   - The injection is small (~200 chars), cheap.
//
// When the project's Leg field is missing or unknown vs legs.json, also push
// a <harness-warning> block. That is the backup channel for headless runs
// where TUI toasts (Layer 4) are silent.
//
// Loaded automatically by opencode at startup from ~/.config/opencode/plugin/.

import type { Plugin } from "@opencode-ai/plugin"
import { readFileSync, existsSync, writeFileSync, renameSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { homedir } from "node:os"

const HEARTBEAT_PATH = join(homedir(), ".config", "opencode", ".harness-heartbeat.json")

// -------------------- legs.json (key set, for leg validation) --------------------

const PLUGIN_DIR = dirname(fileURLToPath(import.meta.url))
const LEGS_PATH = join(PLUGIN_DIR, "legs.json")

function loadKnownLegs(): Set<string> {
  try {
    const data = JSON.parse(readFileSync(LEGS_PATH, "utf8"))
    if (data?.legs && typeof data.legs === "object") {
      return new Set(Object.keys(data.legs))
    }
    console.warn(`[harness-state] ${LEGS_PATH} has no .legs object — leg validation disabled.`)
  } catch (err) {
    console.warn(`[harness-state] failed to load ${LEGS_PATH}: ${(err as Error).message} — leg validation disabled.`)
  }
  return new Set()
}

const KNOWN_LEGS = loadKnownLegs()

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

// -------------------- HARNESS.md parsing --------------------

function loadState(directory: string): string | null {
  const harnessFile = join(directory, ".planning", "HARNESS.md")
  if (!existsSync(harnessFile)) return null
  try {
    return readFileSync(harnessFile, "utf8")
  } catch {
    return null
  }
}

function field(state: string, name: string): string {
  const re = new RegExp(`^- \\*\\*${name}:\\*\\*\\s*(.+)$`, "m")
  const m = re.exec(state)
  return m ? m[1].trim() : ""
}

interface RenderedState {
  block: string
  warning: string | null
  legRaw: string
}

function renderState(directory: string): RenderedState | null {
  const state = loadState(directory)
  if (!state) return null

  const size = field(state, "Size") || "unset"
  const legRaw = field(state, "Leg")
  const leg = legRaw || "unset"
  const phase = field(state, "Phase") || "—"
  const plan = field(state, "Plan") || "—"
  const allowed = field(state, "Allowed next") || "(none specified)"
  const forbidden = field(state, "Forbidden next") || "(none specified)"

  const block = `<harness-state>
  Size: ${size}
  Leg: ${leg}
  Phase: ${phase}
  Plan: ${plan}
  Allowed-next: ${allowed}
  Forbidden-next: ${forbidden}

  Hard rules:
    - Use only commands in Allowed-next. Never call commands in Forbidden-next.
    - If unsure, run /gsd-progress (it routes to the next correct command).
    - To change leg, edit .planning/HARNESS.md or run /gsd-progress.
</harness-state>`

  let warning: string | null = null
  if (KNOWN_LEGS.size > 0 && !KNOWN_LEGS.has(legRaw.toLowerCase())) {
    const value = legRaw || "(missing)"
    warning = `<harness-warning>\n  unknown leg '${value}' — guard fails open. Edit .planning/HARNESS.md or run /gsd-progress.\n</harness-warning>`
  }

  return { block, warning, legRaw }
}

export const HarnessState: Plugin = async ({ directory }) => {
  return {
    "experimental.chat.system.transform": async (_input: any, output: any) => {
      const rendered = renderState(directory)
      if (!rendered) return

      // opencode plugin API exposes output.system as a string array we can append to.
      if (Array.isArray(output?.system)) {
        output.system.push(rendered.block)

        // Backup channel for headless mode: warn on missing/unknown leg.
        if (rendered.warning) output.system.push(rendered.warning)
      }

      const hb = readHeartbeat()
      updateHeartbeat({
        lastInjection: new Date().toISOString(),
        injectionCount: hb.injectionCount + 1,
      })
    },

    // Compaction-survival: push the current <harness-state> block into the
    // compaction prompt's context so the summary itself inherits leg / allowed
    // / forbidden / phase. The per-turn re-injection above already covers
    // post-compaction turns, but seeding the summary prevents the very first
    // post-compaction turn from drifting before the next transform fires.
    "experimental.session.compacting": async (_input: any, output: any) => {
      const rendered = renderState(directory)
      if (!rendered) return
      if (Array.isArray(output?.context)) {
        output.context.push(rendered.block)
        if (rendered.warning) output.context.push(rendered.warning)
      }
    },
  }
}

export default HarnessState
