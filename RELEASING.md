# Releasing LifeFlow

## Pre-release Checklist

1. **All tests pass**
   ```bash
   npm test
   ```
   Verify 0 failures.

2. **Lint clean**
   ```bash
   npm run lint
   ```

3. **Smoke tests pass**
   ```bash
   npm run test:smoke
   ```

4. **Version bump**
   ```bash
   ./scripts/bump-version.sh X.Y.Z
   ```
   This updates: `package.json`, `docs/openapi.yaml`, `CLAUDE.md`, `CHANGELOG.md`.

5. **Update CHANGELOG.md**
   Add release notes under the new version header created by the bump script.

6. **Update CLAUDE.md metrics** (if significant changes)
   - Test count, test file count, route count, table count, LOC

7. **Commit and tag**
   ```bash
   git add -A
   git commit -m "vX.Y.Z: <summary>"
   git tag vX.Y.Z
   ```
   Or use the `--commit` flag with the bump script:
   ```bash
   ./scripts/bump-version.sh X.Y.Z --commit
   ```

## Post-release

8. **Verify the server starts**
   ```bash
   node src/server.js
   ```

9. **Run backup**
   ```bash
   npm run backup
   ```

## Version Files

These files must stay in sync:

| File | Field |
|------|-------|
| `package.json` | `"version": "X.Y.Z"` |
| `docs/openapi.yaml` | `version: X.Y.Z` |
| `CLAUDE.md` | `**Version:** X.Y.Z` |
| `CHANGELOG.md` | `## [X.Y.Z] - YYYY-MM-DD` |

The `tests/release-hygiene.test.js` validates version consistency automatically.
