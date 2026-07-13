#!/usr/bin/env bash
# Remove the claudex binary. Your saved accounts (Keychain items and
# ~/.claude-accounts) are left untouched unless you pass --purge.
set -euo pipefail

DEST="$HOME/.local/bin/claudex"
PURGE="${1:-}"

if [[ -f "$DEST" ]]; then
  # CRITICAL: revert routing + remove the always-on agent BEFORE deleting the binary.
  # Otherwise settings.json stays wired to a dead port and (after a reboot) launchd
  # can't restart the now-missing binary → every Claude Code request fails, with no
  # claudex left to run `proxy off`. Do this first, always.
  "$DEST" proxy off >/dev/null 2>&1 || true
  echo "✓ proxy disabled and routing restored"
  rm -f "$DEST"
  echo "✓ removed $DEST"
else
  echo "claudex is not installed at $DEST"
  echo "⚠  if Claude Code was routed through claudex, remove the ANTHROPIC_BASE_URL"
  echo "   line from ~/.claude/settings.json and delete"
  echo "   ~/Library/LaunchAgents/ai.devxlabs.claudex.proxy.plist by hand."
fi

if [[ "$PURGE" == "--purge" ]]; then
  echo
  echo "Purging saved account data…"
  rm -rf "$HOME/.claude-accounts"
  echo "✓ removed ~/.claude-accounts"
  # Delete every namespaced backup item from the Keychain
  while security delete-generic-password -s "claude-auth-store" >/dev/null 2>&1; do :; done
  echo "✓ removed claude-auth-store Keychain items"
  echo
  echo "Note: your live Claude Code login (the 'Claude Code-credentials' item) was NOT touched."
else
  echo
  echo "Saved accounts kept. To also delete them, run:  ./uninstall.sh --purge"
fi
