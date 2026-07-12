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

# ── PATH hint ────────────────────────────────────────────────────────────────
case ":$PATH:" in
  *":$DEST_DIR:"*) : ;;
  *)
    echo
    echo "⚠  $DEST_DIR is not on your PATH. Add it:"
    echo "     echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ~/.zshrc && source ~/.zshrc"
    ;;
esac

echo
"$DEST" --version || true
echo "Done. Try:  claudex --help"
