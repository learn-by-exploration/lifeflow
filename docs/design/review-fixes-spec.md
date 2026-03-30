# Expert Review Fixes — Spec

> **Created:** 30 March 2026
> **Status:** In Progress
> **Source:** docs/EXPERT_REVIEW_v0.7.26-v0.7.50.md — 5 mandatory conditions

## Mandatory Fixes

### 1. Automated Version Bump Script (`scripts/bump-version.sh`)

**Problem:** Versions get out of sync across 4 files during rapid iteration.
**Fix:** Create `scripts/bump-version.sh <new-version>` that updates:
- `package.json` → `"version": "X.Y.Z"`
- `docs/openapi.yaml` → `version: X.Y.Z`
- `CLAUDE.md` → `**Version:** X.Y.Z` header line
- `CHANGELOG.md` → Add `## [X.Y.Z] - YYYY-MM-DD` entry
- Optionally: `git commit -m "vX.Y.Z" && git tag vX.Y.Z`

**Effort:** Small

### 2. Fix FTS5 Index Population in Test Setup

**Problem:** Test factories (`makeTask`, `makeGoal`, etc.) insert directly via SQL, bypassing FTS rebuild. Tests that depend on search (`/api/search`) must manually seed `search_index`.
**Fix:**
- Export `rebuildSearchIndex` from `src/server.js` module.exports
- Add `rebuildSearch()` helper to `tests/helpers.js`
- Add `DELETE FROM search_index` to `cleanDb()`

**Effort:** Small

### 3. Remove `'unsafe-inline'` from CSP `script-src`

**Problem:** `script-src 'unsafe-inline'` weakens XSS protection.
**Fix:**
- Extract inline `<script>` from `login.html` → `public/js/login.js`
- Extract inline `<script>` from `share.html` → `public/js/share.js`
- Remove `'unsafe-inline'` from `scriptSrc` in helmet config
- Keep `'unsafe-inline'` in `styleSrc` (needed for dynamic element.style in app.js)

**Effort:** Medium

### 4. Add Accessibility Audit Test

**Problem:** No automated accessibility testing.
**Fix:**
- Install `axe-core` + `jsdom` as dev dependencies
- Create `tests/accessibility.test.js` that:
  - Parses `index.html`, `login.html`, `share.html` with jsdom
  - Runs axe-core rules (ARIA, contrast, labels, landmarks)
  - Validates static HTML structure (not runtime rendering)

**Effort:** Medium

### 5. Add E2E Browser Smoke Test

**Problem:** No browser-based testing of login + task creation flow.
**Fix:**
- Install `playwright` as dev dependency
- Create `tests/e2e/smoke.test.js` with:
  - Start server on random port
  - Test login form → session cookie → redirect to app
  - Test task creation through API (browser context)
- Add `test:e2e` npm script

**Note:** Playwright downloads ~200MB of browsers. Mark as optional in CI.

**Effort:** Large

## Recommended Fixes (bonus)

### 6. Add `test:smoke` npm script
Run subset of fast tests for <10s CI feedback.

### 7. Create `RELEASING.md`
Release checklist document for the project.
