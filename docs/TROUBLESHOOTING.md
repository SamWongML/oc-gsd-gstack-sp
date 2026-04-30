# Troubleshooting

## "Harness violation" errors

**Symptom:** opencode aborts a tool call with `Harness violation: skill 'X' is forbidden in leg 'Y'`.

**This is working as intended.** The guard plugin caught the LLM trying to call a skill that doesn't fit the current leg.

**Fix:**
1. Read the abort message — it lists `Allowed-next`.
2. Run `/gsd-progress` — it routes to the next correct command.
3. If you actually want to change leg, edit `.planning/HARNESS.md`:
   - Update the `**Leg:**` line.
   - Update `**Allowed next:**` and `**Forbidden next:**` to match the new leg.
   - Save. The guard reads on the next tool call.

## Skills not appearing

**Symptom:** opencode says it doesn't know about `/gsd-progress` or `/gstack-office-hours`.

**Diagnosis:**
```bash
harness doctor
```

**Fixes:**
- Re-run `harness install` (idempotent).
- Verify SKILL.md filenames are uppercase.
- Restart opencode — skills are loaded at startup and not hot-reloaded.

## Plugin not loading

**Symptom:** Layer 3 (`<harness-state>` block) or Layer 4 (hard aborts) are not active.

**Fixes:**
- Quit opencode fully (not just close the window) and relaunch.
- Check that the plugin files exist:
  ```bash
  ls -la ~/.config/opencode/plugin/harness-{state,guard}.ts
  ```
- Look for plugin errors in opencode logs:
  ```bash
  opencode run --print-logs "ping" 2>&1 | grep -i -E "harness|plugin"
  ```

## Multiple GSD versions / leftover skills

**Symptom:** old GSD skills still showing up after running `harness install`.

**Fix:** run the GSD uninstall first, then reinstall:
```bash
npx --yes gsd-opencode uninstall --global 2>/dev/null || true
harness install
```

## Conflict with existing AGENTS.md

**Symptom:** `harness init` warns that `AGENTS.md` already exists and only appended a section.

**Behavior:** that's correct. The harness section is delimited by an HTML comment so re-running `harness init` is idempotent. To re-write fully: delete `AGENTS.md` and re-run.

## Token usage feels high

**Diagnosis:**
```bash
# Verify GSD was installed --minimal
ls ~/.config/opencode/skills/ | grep -c '^gsd-'
# Should be ~6, not ~86. If higher, --minimal was missed.
```

**Fix:**
```bash
npx --yes gsd-opencode uninstall --global || true
harness install   # always passes --minimal
```

## "I'm in the wrong agent"

The agents are mode-locked by `permission.skill`. If you started in `build`
and need to brainstorm, just press **Tab** to cycle to `decide`. Each agent
has its own narrowed skill set.

## Recovery from total confusion

When in doubt:
```bash
cat .planning/HARNESS.md   # see size, leg, allowed/forbidden, last 5 breadcrumbs
```

Then in opencode:
```
/gsd-progress
```

This is the always-on orientation surface. It re-routes to the next correct
command from any state.

## Reporting bugs

```bash
harness doctor 2>&1 | tee /tmp/harness-doctor.txt
harness status >> /tmp/harness-doctor.txt
```

Open an issue at https://github.com/YOUR_USER/opencode-harness/issues with that file attached.
