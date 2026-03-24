# Phase A (v0.0.13) QA Review — Expert Panel Analysis

## Panel Composition
- **QA1** (Sarah) — Automation architect, API contract testing
- **QA2** (Raj) — End-to-end integration, regression specialist  
- **T1–T5** — Boundary, negative, concurrency, data integrity, UX flow testers
- **PS1–PS5** — Product stability: crash resilience, rollback safety, migration durability, state consistency, monitoring

---

## 1. Current Test Scorecard

| Category | Covered | Total Needed | Gap |
|----------|---------|-------------|-----|
| Happy paths | 17 | 17 | ✅ 0 |
| Error/negative paths | 5 | 14 | ❌ 9 |
| Edge cases | 2 | 10 | ❌ 8 |
| Integration (cross-endpoint) | 0 | 6 | ❌ 6 |
| Data integrity | 0 | 4 | ❌ 4 |
| Regression guards | 0 | 3 | ❌ 3 |
| **Total** | **19** | **54** | **35 missing** |

---

## 2. Critical Findings

### 🔴 C1 — Frontend silent crash on API error (QA1, PS1)
**Location:** `renderSBLists()` sidebar duplicate handler, `ld-dup` in list detail  
**Bug:** `api.post()` on non-ok returns the error body `{error:"..."}` without throwing. The handler then accesses `r.id` which is `undefined`, causing a crash:
```javascript
const r = await api.post('/api/lists/'+lid+'/duplicate');
activeListId = r.id; // r = {error:"Maximum 100 lists reached"} → r.id = undefined
```
**Impact:** App state corrupted (`activeListId=undefined`), blank screen.  
**Fix:** Wrap in try/catch, check for `r.error` before accessing `.id`.

### 🔴 C2 — Reorder endpoint accepts garbage data (T1, PS3)
**Location:** `PUT /api/areas/reorder`  
**Bug:** No validation that:
- Each item has numeric `id` and `position`
- IDs actually exist in the database
- Positions are non-negative integers  
**Impact:** Silently corrupt position data with bad payloads.  
**Fix:** Validate each item's `id` and `position` are integers.

### 🟡 C3 — Duplicate preserves parent_id (T3, PS4)
**Location:** `POST /api/lists/:id/duplicate`  
**Issue:** A duplicated child list retains the same `parent_id`, creating a new child under the original parent. This is arguably correct behavior, but not explicitly documented or tested.  
**Fix:** Add explicit test for child list duplication.

### 🟡 C4 — No max-length validation on area name (T1, QA2)
**Location:** `PUT /api/areas/:id`, `POST /api/areas`  
**Bug:** Name can be arbitrarily long. An area with a 10KB name would render poorly.  
**Fix:** Cap at 100 characters, same as the existing list name limit.

### 🟡 C5 — Categories endpoint — malformed JSON fallback not tested (T2)
**Location:** `GET /api/lists/categories/configured`  
**Issue:** If settings has bad JSON, the try/catch silently falls back to defaults. This is correct behavior but has zero test coverage.

---

## 3. Missing Test Matrix

### Error/Negative Paths (QA1)
| # | Test | Risk |
|---|------|------|
| N1 | Archive already-archived area returns idempotent 200 | Low |
| N2 | Unarchive an already-active area returns idempotent 200 | Low |
| N3 | Reorder with non-integer position | Medium |
| N4 | Reorder with non-existent area ID | Medium |
| N5 | Duplicate at max 100 list limit → 400 | High |
| N6 | Duplicate non-existent list → 404 (already covered) | — |
| N7 | Categories with malformed JSON in settings → fallback | Medium |

### Edge Cases (T1–T5)
| # | Test | Risk |
|---|------|------|
| E1 | Archive area → its goals/tasks still accessible directly | Medium |
| E2 | Reorder empty area list → no-op success | Low |
| E3 | Duplicate list with 0 items → empty copy | Low |
| E4 | Duplicate list with special chars in name | Low |
| E5 | Uncheck-all on list with 0 items (already covered ✅) | — |
| E6 | Duplicate child list → parent_id preserved | Medium |
| E7 | Area name at max length (100 chars) | Low |
| E8 | Duplicate list name uniqueness ("X (copy) (copy)") | Low |

### Integration Tests (QA2)
| # | Test | Risk |
|---|------|------|
| I1 | Archive → GET excludes → unarchive → GET includes | High |
| I2 | Reorder → verify GET returns new order | High (partially covered) |
| I3 | Duplicate → verify original unchanged | Medium |
| I4 | Duplicate → new list works independently (edit, delete) | Medium |
| I5 | Archive area → its goals still queryable via /api/areas/:id/goals | Medium |
| I6 | Create area → reorder → archive → verify remaining order | Medium |

### Data Integrity (PS3–PS5)
| # | Test | Risk |
|---|------|------|
| D1 | Duplicate list items have different IDs from original | High |
| D2 | Duplicate list position is unique (not colliding) | Medium |
| D3 | Archive column migration is idempotent (re-run safe) | Low |
| D4 | Reorder preserves non-position fields (name, icon, etc.) | Medium |

---

## 4. Recommendations

### Immediate Fixes (before release)
1. **Add try/catch + error check** in all 4 frontend duplicate/uncheck handlers
2. **Validate reorder payload** — each item must have integer `id` + `position`
3. **Add 35 missing tests** to reach 90%+ coverage
4. **Cap area name length** at 100 characters

### Automation Infrastructure (PS1, QA1)
- Each new endpoint should have a minimum of: 1 happy path, 1 not-found, 1 bad-input test
- Frontend handlers that call API should always check `r.error` before using response fields

---

*Generated by: 2 QA + 5 Testers + 5 Product Stability panel review*
*Date: 2026-03-24*
