#!/usr/bin/env bash
# OPSEC scan (R14) — fail-closed if founder identity leaks into OSS adapter trees.
#
# Usage:
#   bash packages/oss/scripts/opsec-scan.sh [target_dir]
#
# Default target: all 4 adapter repos (acp/ap2/ucp/mcp) under packages/oss/.
# Per-repo prepublishOnly hook: bash ../scripts/opsec-scan.sh "$PWD"
#
# Patterns (case-insensitive, word-boundary aware):
#   - kim                (founder family name, raw)
#   - kkb2689            (founder personal email handle)
#   - 롯데 / lotte       (employer)
#   - 김경범 / kyungbeom (founder full name, ko + en)
#
# Exit codes:
#   0 — clean
#   1 — match found (one or more patterns)
#   2 — invocation error

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OSS_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [[ $# -ge 1 ]]; then
  TARGETS=("$1")
else
  TARGETS=(
    "${OSS_ROOT}/acp-adapter"
    "${OSS_ROOT}/ap2-adapter"
    "${OSS_ROOT}/ucp-adapter"
    "${OSS_ROOT}/mcp-adapter"
  )
fi

# Word-boundary patterns. ERE \b portable on macOS BSD grep + GNU grep via -E.
PATTERNS=(
  '\bkim\b'
  '\bkkb2689\b'
  '롯데'
  '\blotte\b'
  '김경범'
  '\bkyungbeom\b'
)

EXCLUDE_DIRS=(
  --exclude-dir=node_modules
  --exclude-dir=dist
  --exclude-dir=.git
  --exclude-dir=coverage
  --exclude-dir=.turbo
)

EXCLUDE_FILES=(
  --exclude=pnpm-lock.yaml
  --exclude=package-lock.json
  --exclude=yarn.lock
  --exclude=opsec-scan.sh
)

violations=0

for target in "${TARGETS[@]}"; do
  if [[ ! -d "$target" ]]; then
    echo "[opsec-scan] skip (not a dir): $target" >&2
    continue
  fi
  for pat in "${PATTERNS[@]}"; do
    if grep -RInE -i "${EXCLUDE_DIRS[@]}" "${EXCLUDE_FILES[@]}" "$pat" "$target" 2>/dev/null; then
      echo "[opsec-scan] FAIL pattern=$pat target=$target" >&2
      violations=$((violations + 1))
    fi
  done
done

if [[ $violations -gt 0 ]]; then
  echo "[opsec-scan] $violations violation(s) — R14 OPSEC fail-closed." >&2
  exit 1
fi

echo "[opsec-scan] clean across ${#TARGETS[@]} target(s)."
exit 0
