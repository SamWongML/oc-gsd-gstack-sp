#!/usr/bin/env bash
#
# opencode-harness installer — curl|bash bootstrap.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/YOUR_USER/opencode-harness/main/install.sh | bash
#
# Behavior:
#   - macOS only (use brew).
#   - Idempotent: safe to run multiple times. Used for both first install and update.
#   - Installs: opencode, git, node, jq via Homebrew if missing.
#   - Clones (or updates) this repo to ~/.config/opencode-harness.
#   - Symlinks `harness` into a brew-managed bin dir if available, else /usr/local/bin.
#   - Then runs `harness install` to wire up the three frameworks.
#
# Environment:
#   HARNESS_REPO     override the repo URL (default: github.com/YOUR_USER/opencode-harness)
#   HARNESS_BRANCH   override the branch (default: main)
#   HARNESS_HOME     override install dir (default: $HOME/.config/opencode-harness)

set -euo pipefail

REPO_URL="${HARNESS_REPO:-https://github.com/YOUR_USER/opencode-harness.git}"
BRANCH="${HARNESS_BRANCH:-main}"
INSTALL_DIR="${HARNESS_HOME:-$HOME/.config/opencode-harness}"

# ---------- pretty printing ----------
if [[ -t 1 ]]; then
  BOLD=$'\033[1m'; RESET=$'\033[0m'
  GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RED=$'\033[31m'; BLUE=$'\033[34m'
else
  BOLD=""; RESET=""; GREEN=""; YELLOW=""; RED=""; BLUE=""
fi

step()  { printf "%s==>%s %s\n" "$BLUE$BOLD" "$RESET" "$*"; }
ok()    { printf "%s✓%s %s\n" "$GREEN" "$RESET" "$*"; }
warn()  { printf "%s!%s %s\n" "$YELLOW" "$RESET" "$*"; }
fail()  { printf "%s✗%s %s\n" "$RED" "$RESET" "$*" >&2; exit 1; }

# ---------- preflight ----------
[[ "$(uname -s)" == "Darwin" ]] || fail "This installer targets macOS. For other platforms see docs/PLATFORMS.md."

step "Checking Homebrew"
if ! command -v brew >/dev/null 2>&1; then
  fail "Homebrew not found. Install it first:
    /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\"
  Then re-run this installer."
fi
ok "Homebrew $(brew --version | head -n1 | awk '{print $2}')"

# Required tools — install only if missing
ensure_brew_pkg() {
  local pkg="$1"; local cmd="${2:-$1}"
  if command -v "$cmd" >/dev/null 2>&1; then
    ok "$cmd present"
  else
    step "Installing $pkg"
    brew install "$pkg" >/dev/null
    ok "$pkg installed"
  fi
}

ensure_brew_pkg git
ensure_brew_pkg node
ensure_brew_pkg jq

# opencode is critical — install via brew if missing
if ! command -v opencode >/dev/null 2>&1; then
  step "Installing opencode"
  brew install opencode >/dev/null || \
    fail "Could not install opencode. Try manually: brew install opencode"
  ok "opencode installed"
else
  ok "opencode $(opencode --version 2>/dev/null | head -n1 || echo present)"
fi

# ---------- clone or update this repo ----------
step "Fetching opencode-harness assets to $INSTALL_DIR"
if [[ -d "$INSTALL_DIR/.git" ]]; then
  git -C "$INSTALL_DIR" fetch --quiet --depth 1 origin "$BRANCH"
  git -C "$INSTALL_DIR" reset --hard --quiet "origin/$BRANCH"
else
  rm -rf "$INSTALL_DIR"
  git clone --quiet --depth 1 --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
fi
ok "Harness assets ready ($(git -C "$INSTALL_DIR" rev-parse --short HEAD))"

# ---------- symlink the harness CLI ----------
HARNESS_BIN="$INSTALL_DIR/bin/harness"
chmod +x "$HARNESS_BIN"

# Pick a bin dir that is on PATH and writable.
LINK_DIR=""
for candidate in "$(brew --prefix)/bin" "/usr/local/bin" "$HOME/.local/bin"; do
  if [[ -d "$candidate" && -w "$candidate" ]]; then
    LINK_DIR="$candidate"; break
  fi
done

if [[ -z "$LINK_DIR" ]]; then
  warn "No writable bin dir on PATH. Add this to your shell rc:"
  echo "    export PATH=\"\$PATH:$INSTALL_DIR/bin\""
else
  ln -snf "$HARNESS_BIN" "$LINK_DIR/harness"
  ok "Linked $LINK_DIR/harness"
fi

# ---------- run the actual installer ----------
echo
step "Running 'harness install'"
echo
exec "$HARNESS_BIN" install
