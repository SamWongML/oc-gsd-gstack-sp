class OpencodeHarness < Formula
  desc "Disciplined, deny-by-default coding harness for opencode (gstack + GSD + Superpowers)"
  homepage "https://github.com/YOUR_USER/opencode-harness"
  url "https://github.com/YOUR_USER/opencode-harness/archive/refs/tags/v0.1.0.tar.gz"
  sha256 "REPLACE_WITH_RELEASE_TARBALL_SHA256"
  license "MIT"
  head "https://github.com/YOUR_USER/opencode-harness.git", branch: "main"

  depends_on "git"
  depends_on "jq"
  depends_on "node"
  # opencode is detected at runtime; we don't hard-depend so users on a tap can
  # install opencode separately. The harness CLI auto-installs it if missing.

  def install
    # Layout under HOMEBREW_PREFIX/share/opencode-harness/share
    libexec.install "bin/harness"
    (libexec/"share").install Dir["share/*"]
    (bin/"harness").write_env_script(libexec/"harness", HARNESS_HOME: libexec.to_s)
  end

  def caveats
    <<~EOS
      opencode-harness is installed but not yet wired into your opencode config.

      Run:
        harness install        # wires up gstack + GSD --minimal + Superpowers
        harness doctor         # verifies the install

      Then in any project:
        cd my-project
        harness init
        opencode

      Update later with:  brew upgrade opencode-harness && harness update
    EOS
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/harness version")
    # `help` should list subcommands without error
    assert_match "harness install", shell_output("#{bin}/harness help")
  end
end
