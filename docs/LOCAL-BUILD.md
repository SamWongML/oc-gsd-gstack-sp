# Local build — install from a clone of this repo

Use this path when you want to install the harness **directly from a local
checkout** instead of via the Homebrew tap or the `curl | bash` one-liner.
Common reasons: you're hacking on the harness itself, you don't have (or
don't want) a Homebrew tap, or you're on an air-gapped/offline machine that
already has the repo on disk.

The `harness` CLI is a plain bash script and reads its assets from
`$HARNESS_HOME/share`. There's no compile step — "build" here just means
pointing the CLI at your local checkout and running it.

---

## Prerequisites

Same as the regular install (the script will check for these):

- macOS (Apple Silicon or Intel). For Linux/Windows see [`PLATFORMS.md`](PLATFORMS.md).
- `git`, `node`, `jq`, `opencode` on your `PATH`.
  - On macOS: `brew install git node jq opencode`.

---

## 1. Clone the repo

```bash
git clone https://github.com/YOUR_USER/opencode-harness.git ~/.config/opencode-harness
cd ~/.config/opencode-harness
chmod +x bin/harness install.sh
```

Cloning into `~/.config/opencode-harness` matches the default `HARNESS_HOME`
the CLI looks for, so no env var is needed afterwards. If you'd rather keep
the checkout elsewhere (e.g. `~/codes/opencode-harness`), see [Option B](#option-b--keep-the-checkout-anywhere).

---

## 2. Wire it up

### Option A — checkout lives at `~/.config/opencode-harness`

```bash
./bin/harness install
```

That's it. The CLI copies agents, plugins, templates, and `opencode.json`
fragments out of `./share` into `~/.config/opencode/`, and pulls down
gstack + GSD via their official installers.

Optionally symlink `harness` onto your `PATH` so you can call it from
anywhere:

```bash
ln -snf "$PWD/bin/harness" /usr/local/bin/harness
# or, if /usr/local/bin isn't writable:
ln -snf "$PWD/bin/harness" "$(brew --prefix)/bin/harness"
```

### Option B — keep the checkout anywhere

Set `HARNESS_HOME` to your checkout for every invocation:

```bash
export HARNESS_HOME="$PWD"            # add this to your shell rc to persist
./bin/harness install
./bin/harness doctor
```

`HARNESS_HOME` tells the CLI where `share/` lives. Without it the CLI
defaults to `~/.config/opencode-harness` and will fail to find assets.

---

## 3. Verify

```bash
./bin/harness doctor
./bin/harness status
```

`doctor` should report all green checks. If anything is missing, re-run
`./bin/harness install`.

---

## 4. Use it in a project

Same as the normal flow:

```bash
cd your-project
harness init           # or: ~/.config/opencode-harness/bin/harness init
opencode
```

---

## Updating

Pull and re-run — the install command is idempotent:

```bash
cd ~/.config/opencode-harness
git pull --ff-only
./bin/harness install
```

Same script, same outcome as `harness update`.

---

## Uninstalling

```bash
./bin/harness uninstall          # removes installed agents/plugins/skills
rm -rf ~/.config/opencode-harness   # remove the local checkout
sudo rm -f /usr/local/bin/harness   # if you symlinked
```

Your projects' `.planning/` directories are never touched.

---

## Troubleshooting

- **`Required command not found: jq`** — install with `brew install jq`.
- **`opencode not found`** — `brew install opencode`.
- **`Harness assets missing`** in `harness doctor` — `HARNESS_HOME` is
  pointing at the wrong directory. Confirm `$HARNESS_HOME/share/agents/`
  exists.
- **Plugin changes aren't picked up** — opencode loads plugins at startup;
  quit and relaunch after re-running `./bin/harness install`.

For deeper hacking (running the CLI without installing, validating JSON,
shellcheck), see [`../CONTRIBUTING.md`](../CONTRIBUTING.md#local-dev).
