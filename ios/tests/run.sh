#!/usr/bin/env bash
# Compiles the app's plain-Swift files (engine + ledger) on any machine with swiftc,
# runs the ledger/engine checks, and compares the Swift engine with poker/web/engine.js.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
app="$here/../Saldo.swiftpm"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
swiftc -O "$app/Engine/PokerEngine.swift" "$app/Logic/Ledger.swift" "$here/main.swift" -o "$tmp/checks"
node "$here/parity.js" "$tmp/input.json" "$tmp/js.json"
"$tmp/checks" "$tmp/input.json" "$tmp/js.json"
