#!/usr/bin/env bash
# claudex bootstrap installer — served publicly from the distribution bucket.
#
#   curl -fsSL https://storage.googleapis.com/claudex-dist/install.sh | bash
#
# Downloads the compiled claudex binary, verifies its SHA256, and installs it to
# ~/.local/bin. Contains NO source and NO secret — just download + verify + place.
# Apple Silicon (arm64) macOS only.
set -euo pipefail

DIST_BASE="${CLAUDEX_DIST_BASE:-https://storage.googleapis.com/claudex-dist}"
VERSION_SEL="${CLAUDEX_VERSION:-latest}"   # "latest" or a pinned "vX.Y.Z"
DEST_DIR="${CLAUDEX_DEST:-$HOME/.local/bin}"
DEST="$DEST_DIR/claudex"
BIN_NAME="claudex-arm64"

# ── platform gate ────────────────────────────────────────────────────────────
os="$(uname -s)"
arch="$(uname -m)"
if [ "$os" != "Darwin" ]; then
  echo "error: claudex is macOS-only (detected: $os)." >&2
  exit 1
fi
if [ "$arch" != "arm64" ]; then
  echo "error: claudex ships an Apple Silicon (arm64) build only — no Intel (x86_64) build is available." >&2
  echo "       (detected architecture: $arch)" >&2
  exit 1
fi

# ── resolve the bucket prefix (latest/ or a pinned version) ──────────────────
if [ "$VERSION_SEL" = "latest" ]; then
  prefix="latest"
else
  prefix="$VERSION_SEL"            # e.g. v1.16.0
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "→ downloading claudex ($prefix · arm64)…"
if ! curl -fsSL "$DIST_BASE/$prefix/$BIN_NAME" -o "$tmp/claudex"; then
  echo "error: could not download $DIST_BASE/$prefix/$BIN_NAME" >&2
  exit 1
fi
if ! curl -fsSL "$DIST_BASE/$prefix/SHA256SUMS" -o "$tmp/SHA256SUMS"; then
  echo "error: could not download the checksum file" >&2
  exit 1
fi

# ── verify checksum BEFORE doing anything with the file ──────────────────────
expected="$(awk -v f="$BIN_NAME" '$2 == f || $2 == "*"f {print $1}' "$tmp/SHA256SUMS" | head -n1)"
if [ -z "$expected" ]; then
  echo "error: no checksum for $BIN_NAME in SHA256SUMS — refusing to install." >&2
  exit 1
fi
actual="$(shasum -a 256 "$tmp/claudex" | awk '{print $1}')"
if [ "$actual" != "$expected" ]; then
  echo "error: checksum mismatch — refusing to install." >&2
  echo "       expected $expected" >&2
  echo "       actual   $actual" >&2
  exit 1
fi

# ── install ──────────────────────────────────────────────────────────────────
mkdir -p "$DEST_DIR"
install -m 755 "$tmp/claudex" "$DEST"
# Strip the download-quarantine so Gatekeeper stays silent (binary is ad-hoc signed).
xattr -d com.apple.quarantine "$DEST" 2>/dev/null || true

echo "✓ installed claudex → $DEST"

# ── ensure ~/.local/bin is on PATH (configure the shell startup file for them) ─
# Intentionally literal: $HOME/$PATH must expand at shell startup, not now.
# shellcheck disable=SC2016
path_line='export PATH="$HOME/.local/bin:$PATH"'

already_on_path() {
  case ":$PATH:" in *":$DEST_DIR:"*) return 0 ;; *) return 1 ;; esac
}

if already_on_path; then
  :   # nothing to do — claudex is immediately runnable
elif [ -n "${CLAUDEX_NO_MODIFY_PATH:-}" ]; then
  # Opt-out: don't touch their dotfiles, just tell them what to add.
  echo
  echo "⚠  $DEST_DIR is not on your PATH. Add this to your shell startup file:"
  echo "     $path_line"
else
  # Pick the startup file macOS actually reads for the user's login shell.
  case "$(basename "${SHELL:-/bin/zsh}")" in
    zsh)  rc="$HOME/.zshrc" ;;
    bash) rc="$HOME/.bash_profile" ;;
    *)    rc="" ;;
  esac

  if [ -z "$rc" ]; then
    echo
    echo "⚠  Add this to your shell startup file so 'claudex' is found:"
    echo "     $path_line"
  elif [ -f "$rc" ] && grep -qF "$path_line" "$rc"; then
    echo "✓ $DEST_DIR already configured in $rc — open a new terminal"
  else
    {
      echo ""
      echo "# Added by the claudex installer — put ~/.local/bin on PATH"
      echo "$path_line"
    } >> "$rc"
    echo "✓ added $DEST_DIR to your PATH in $rc"
    echo "→ open a new terminal (or run:  source $rc)  to use 'claudex'"
  fi
fi

echo
"$DEST" --version || true

# ── enable the always-on proxy (routes Claude Code through a local, self-healing
# proxy in transparent passthrough; `claudex pool start` turns on token-swap). Skips
# cleanly on a headless/SSH box or when opted out. CLAUDEX_PROXY_OFF=1 disables it. ─
if [ -z "${CLAUDEX_PROXY_OFF:-}" ]; then
  if "$DEST" proxy on >/dev/null 2>&1; then
    echo "✓ always-on proxy enabled (passthrough; 'claudex pool start' to pool · 'claudex proxy off' to disable)"
  else
    echo "• always-on proxy not enabled here (headless or unavailable) — 'claudex proxy on' to try later"
  fi
fi

echo "Done. Try:  claudex --help"
