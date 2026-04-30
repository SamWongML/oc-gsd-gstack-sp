# Other platforms

This harness targets macOS first. Linux and Windows (WSL) work with the curl installer.

## Linux

```bash
# Install opencode + git + node + jq via your package manager (or asdf, etc.)
# Then:
curl -fsSL https://raw.githubusercontent.com/YOUR_USER/opencode-harness/main/install.sh | bash
```

The installer's preflight check rejects non-Darwin systems. If you understand the
implications and want to bypass it, fork and patch the `[[ "$(uname -s)" == "Darwin" ]]`
check in `install.sh`. Or run `bin/harness install` directly after cloning the repo
manually.

## Windows (WSL2 only)

opencode officially recommends WSL2. Same flow as Linux above, inside WSL.

## Why macOS-first?

- gstack's `/gstack-browse` skill compiles a native Bun binary and is best-tested
  on macOS.
- Homebrew is the cleanest distribution mechanism for Mac users.
- Most opencode users are on Mac.

For other platforms, consider whether you need `/gstack-browse`. Without it,
the harness works fine on Linux. On Windows, Bun has a known Playwright pipe
issue (oven-sh/bun#4253) that affects the gstack browser. Use WSL2 to avoid it.
