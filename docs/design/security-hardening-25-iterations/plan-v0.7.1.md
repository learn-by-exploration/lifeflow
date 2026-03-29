# Implementation Plan — v0.7.1: ESLint & Code Quality Gate

> **Spec:** [spec.md](spec.md) § v0.7.1
> **Base:** v0.7.0 (2,031 tests | 88 test files)
> **Target:** ~2,046 tests (+15)
> **Scope:** Static analysis, lint config, CI lint step — NO functional changes

---

## Pre-Implementation Assessment

### Current State (verified by reading files)

| Item | Status |
|------|--------|
| ESLint installed | No — not in devDependencies |
| `.eslintrc.json` | Does not exist |
| Lint script in package.json | No — only `start`, `backup`, `pretest`, `test` |
| CI (`ci.yml`) | Minimal: checkout → install → test on Node 20+22. No lint step |
| `var` declarations in `src/` | 0 |
| Loose `==` in `src/` | 0 |
| `console.log` in `src/` | 0 |
| `'use strict'` in `src/` | 2 files only (`audit.js`, `push.service.js`) |
| `.editorconfig` | Already exists |
| Project type | `"type": "commonjs"` |

**Key finding:** The codebase is already clean — no `var`, no `==`, no `console.log`.
ESLint should pass on first run with recommended rules. Risk is low.

### Dependencies

- None — this is the first iteration in Phase 1

### Risk Assessment

- **Low risk.** ESLint is a devDependency only. No runtime code changes required.
- The only likely lint errors are `no-unused-vars` warnings (common in route handlers with `(req, res, next)` patterns where `next` is unused).
- `prefer-const` may flag some `let` declarations that are never reassigned.

---

## Task Breakdown

### Task 1: Install ESLint

**Action:** Add `eslint` as devDependency.

```bash
npm install --save-dev eslint
```

**Verification:** `package.json` devDependencies includes `eslint`.

**Estimated effort:** Trivial.

---

### Task 2: Create `.eslintrc.json`

**Action:** Create `.eslintrc.json` at project root.

```json
{
  "env": {
    "node": true,
    "es2022": true
  },
  "extends": ["eslint:recommended"],
  "parserOptions": {
    "ecmaVersion": 2022
  },
  "rules": {
    "eqeqeq": ["error", "always"],
    "no-var": "error",
    "prefer-const": "warn",
    "no-unused-vars": ["warn", {
      "argsIgnorePattern": "^_",
      "varsIgnorePattern": "^_"
    }],
    "no-throw-literal": "error",
    "no-implicit-globals": "error",
    "curly": ["error", "multi-line"]
  },
  "overrides": [
    {
      "files": ["tests/**/*.js"],
      "env": {
        "node": true
      },
      "rules": {
        "no-unused-vars": ["warn", {
          "argsIgnorePattern": "^_",
          "varsIgnorePattern": "^_"
        }]
      }
    }
  ]
}
```

**Design decisions:**
- `argsIgnorePattern: "^_"` — Express handlers often have unused `next`; prefix with `_` to silence.
- `prefer-const` as `warn` not `error` — avoids blocking CI for stylistic issues during initial adoption.
- `curly: "multi-line"` — allows single-line `if` without braces but requires them for multi-line.
- `no-throw-literal` — security-relevant: ensures proper Error objects.
- `es2022` — matches `engines.node >= 22`.
- No `strict` rule — would require adding `'use strict'` to all 30+ files; defer to v0.7.5.

**Verification:** File exists and is valid JSON.

---

### Task 3: Write tests FIRST (TDD) — `tests/lint-config.test.js`

**Action:** Create `tests/lint-config.test.js` with ~15 tests.

**Test list:**

| # | Test | What it verifies |
|---|------|-----------------|
| 1 | `.eslintrc.json` exists | Config file presence |
| 2 | `.eslintrc.json` is valid JSON | Parseable config |
| 3 | Config extends `eslint:recommended` | Base ruleset |
| 4 | Config sets `node` environment | Node.js globals recognized |
| 5 | Config enforces `eqeqeq` | Strict equality required |
| 6 | Config has `no-unused-vars` rule | Dead code detection |
| 7 | Config has `no-var` rule | Modern JS enforced |
| 8 | Config has `prefer-const` rule | Immutability preference |
| 9 | Config has `no-throw-literal` rule | Proper error objects |
| 10 | Config has test file overrides | Test-specific rules |
| 11 | `package.json` has `lint` script | Script presence |
| 12 | `package.json` has `lint:fix` script | Auto-fix script |
| 13 | Lint script targets `src/` and `tests/` | Correct scope |
| 14 | No ESLint errors in `src/**/*.js` | Source code passes (via `child_process.execSync`) |
| 15 | No ESLint errors in `tests/**/*.js` | Test code passes (via `child_process.execSync`) |

**Implementation pattern:** Tests 1-13 use `fs.readFileSync` + JSON.parse to inspect config files statically. Tests 14-15 use `child_process.execSync('npx eslint src/ --format json')` and assert zero error count.

**File structure:**
```javascript
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

describe('ESLint Configuration', () => {
  // Tests 1-13: static config checks
  // Tests 14-15: live lint execution
});
```

**No test helpers dependency needed** — these are pure static/filesystem tests like `release-hygiene.test.js`.

---

### Task 4: Add lint scripts to `package.json`

**Action:** Add two scripts to `package.json`:

```json
{
  "scripts": {
    "lint": "eslint src/ tests/",
    "lint:fix": "eslint src/ tests/ --fix"
  }
}
```

**Verification:** `npm run lint` exits 0. `npm run lint:fix` exits 0.

---

### Task 5: Run ESLint and fix any errors

**Action:** Run `npx eslint src/ tests/` and fix any violations.

**Expected issues (based on codebase analysis):**
1. **`no-unused-vars`** — Express route handlers with unused `next` parameter. Fix: rename to `_next` or `_`.
2. **`prefer-const`** — `let` declarations that are never reassigned. Fix: change to `const`.
3. **Possible `no-undef`** from `eslint:recommended` — unlikely since all files use `require()`.

**What should NOT change:**
- No functional logic changes.
- No refactoring beyond what ESLint requires.
- Frontend files (`public/`) are NOT linted (they run in browser, not Node).

**Approach:**
1. Run `npm run lint` first to see all errors.
2. Run `npm run lint:fix` for auto-fixable issues (`prefer-const`, formatting).
3. Manually fix remaining issues (rename unused params to `_`-prefix).
4. Re-run `npm run lint` to confirm zero errors.
5. Run `npm test` to confirm no regressions.

---

### Task 6: Update CI workflow

**Action:** Add lint step before test in `.github/workflows/ci.yml`.

**Target state:**
```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npm run lint

  test:
    needs: lint
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [20, 22]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
      - run: npm ci
      - run: npm test
```

**Design decisions:**
- Lint runs on Node 22 only (single version is sufficient for static analysis).
- `needs: lint` — test job only runs if lint passes (fast-fail).
- Keeps existing Node 20+22 test matrix.

**Verification:** CI YAML is valid. Lint job defined. Test depends on lint.

---

### Task 7: Update documentation

**Action:** Update CLAUDE.md and CHANGELOG.md.

| File | Change |
|------|--------|
| `CLAUDE.md` header | Version → 0.7.1, test count → ~2,046 |
| `CLAUDE.md` § Architecture | Add `.eslintrc.json` mention |
| `CLAUDE.md` § Quick Start | Add `npm run lint` |
| `CHANGELOG.md` | Add v0.7.1 entry |
| `package.json` | Version → 0.7.1 |
| `docs/openapi.yaml` | Version → 0.7.1 |

---

## Execution Order

```
1. Task 3 — Write tests first (TDD). Tests will FAIL (no eslint yet).
2. Task 1 — Install ESLint.
3. Task 2 — Create .eslintrc.json. Tests 1-13 now pass.
4. Task 4 — Add lint scripts. Tests 11-13 now pass.
5. Task 5 — Fix lint errors. Tests 14-15 now pass.
6. Task 6 — Update CI workflow.
7. Task 7 — Update documentation.
8. Run full test suite: `npm test` — confirm 2,046 pass, 0 fail.
9. Git commit + tag v0.7.1.
```

---

## Review Checkpoint

Before committing, verify:

- [ ] `npm run lint` exits 0 (no errors)
- [ ] `npm test` passes all ~2,046 tests (0 failures)
- [ ] No functional code changes (only lint fixes: `let`→`const`, unused param renames)
- [ ] CI workflow has lint → test dependency
- [ ] `package.json` version is `0.7.1`
- [ ] CHANGELOG.md has v0.7.1 entry
- [ ] CLAUDE.md header updated

---

## What This Plan Does NOT Cover

- Coverage measurement (v0.7.2)
- Pre-commit hooks / husky (v0.7.5)
- Frontend linting (`public/`) — separate concern, needs browser env config
- `strict` mode enforcement — would touch every file; defer to later iteration
- Prettier / formatting rules — keep scope narrow
