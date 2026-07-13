#!/usr/bin/env bash
# Install claudex into ~/.local/bin
set -euo pipefail

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$SRC_DIR/bin/claudex"
DEST_DIR="$HOME/.local/bin"
DEST="$DEST_DIR/claudex"

if [[ "$(uname)" != "Darwin" ]]; then
  echo "error: claudex supports macOS only (it uses the login Keychain)." >&2
  exit 1
fi

if [[ ! -f "$SRC" ]]; then
  echo "error: cannot find $SRC" >&2
  exit 1
fi

mkdir -p "$DEST_DIR"
cp "$SRC" "$DEST"
chmod +x "$DEST"
echo "✓ installed claudex → $DEST"

# Transition shim: keep the legacy `claude-auth` name working so any autoswitch/pool
# hooks written before the rename still resolve. Deprecated — remove once re-enabled.
LEGACY="$DEST_DIR/claude-auth"
if [[ ! -e "$LEGACY" || -L "$LEGACY" ]]; then
  ln -sf claudex "$LEGACY"
  echo "✓ legacy alias claude-auth → claudex (deprecated; for existing hooks)"
fi

# Install the automatic analytics agent (self-healing; runs every 10 min, read-only,
# nice'd). Running the binary once registers the launchd agent and does a first sync.
# Set CLAUDEX_ANALYTICS_OFF=1 to opt out silently.
if [[ -z "${CLAUDEX_ANALYTICS_OFF:-}" ]]; then
  "$DEST" __analytics-sync >/dev/null 2>&1 || true
  echo "✓ analytics agent enabled (background, read-only; set CLAUDEX_ANALYTICS_OFF=1 to disable)"
fi

# Warn if ~/.local/bin isn't on PATH
case ":$PATH:" in
  *":$DEST_DIR:"*)
    echo "✓ $DEST_DIR is already on your PATH"
    ;;
  *)
    echo
    echo "⚠  $DEST_DIR is not on your PATH. Add it:"
    echo "     echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ~/.zshrc"
    echo "     source ~/.zshrc"
    ;;
esac

echo
echo "Done. Try:  claudex --help"
