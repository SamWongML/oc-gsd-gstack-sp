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
import { readFileSync, existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

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

export const HarnessState: Plugin = async ({ directory }) => {
  return {
    "experimental.chat.system.transform": async (_input: any, output: any) => {
      const state = loadState(directory)
      if (!state) return

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

      // opencode plugin API exposes output.system as a string array we can append to.
      if (Array.isArray(output?.system)) {
        output.system.push(block)

        // Backup channel for headless mode: warn on missing/unknown leg.
        if (KNOWN_LEGS.size > 0 && !KNOWN_LEGS.has(legRaw.toLowerCase())) {
          const value = legRaw || "(missing)"
          output.system.push(
            `<harness-warning>\n  unknown leg '${value}' — guard fails open. Edit .planning/HARNESS.md or run /gsd-progress.\n</harness-warning>`,
          )
        }
      }
    },
  }
}

export default HarnessState
