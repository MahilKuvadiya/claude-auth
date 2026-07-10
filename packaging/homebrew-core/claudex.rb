class Claudex < Formula
  desc "Multi-account switcher and rate-limit tooling for Claude Code"
  homepage "https://github.com/vishalmakwana111/claudex"
  url "https://github.com/vishalmakwana111/claudex/archive/refs/tags/v1.12.0.tar.gz"
  sha256 "3ea7fee7b99a1b42240a4d93a76dd2b740d07e02e59cd01f7f94f77187a92676"
  license "MIT"

  # macOS-only: reads/writes the login Keychain via the `security` CLI.
  depends_on :macos

  def install
    bin.install "bin/claudex"
  end

  test do
    assert_match "claudex #{version}", shell_output("#{bin}/claudex --version")
  end
end
