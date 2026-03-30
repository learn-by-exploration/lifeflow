#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────────────────────
# scripts/bump-version.sh — Bump LifeFlow version across all files
#
# Usage:
#   ./scripts/bump-version.sh 0.7.51
#   ./scripts/bump-version.sh 0.7.51 --commit   # also git commit + tag
# ──────────────────────────────────────────────────────────────

VERSION="${1:-}"
COMMIT="${2:-}"

if [[ -z "$VERSION" ]]; then
  echo "Usage: $0 <new-version> [--commit]"
  echo "  e.g. $0 0.7.51"
  echo "  e.g. $0 0.7.51 --commit"
  exit 1
fi

# Validate semver-ish format
if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Error: Version must be in X.Y.Z format (got: $VERSION)"
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

OLD_VERSION=$(node -p "require('./package.json').version")
echo "Bumping $OLD_VERSION → $VERSION"

# 1. package.json
sed -i "s/\"version\": \"$OLD_VERSION\"/\"version\": \"$VERSION\"/" package.json
echo "  ✓ package.json"

# 2. docs/openapi.yaml
sed -i "s/version: $OLD_VERSION/version: $VERSION/" docs/openapi.yaml
echo "  ✓ docs/openapi.yaml"

# 3. CLAUDE.md header
sed -i "s/Version:** $OLD_VERSION/Version:** $VERSION/" CLAUDE.md
echo "  ✓ CLAUDE.md"

# 4. CHANGELOG.md — insert new version entry after line 4
TODAY=$(date +%Y-%m-%d)
sed -i "4a\\\\n## [$VERSION] - $TODAY" CHANGELOG.md
echo "  ✓ CHANGELOG.md"

echo ""
echo "Version bumped to $VERSION in all 4 files."

# Optional: git commit + tag
if [[ "$COMMIT" == "--commit" ]]; then
  git add package.json docs/openapi.yaml CLAUDE.md CHANGELOG.md
  git commit -m "v$VERSION"
  git tag "v$VERSION"
  echo "  ✓ Committed and tagged v$VERSION"
fi
