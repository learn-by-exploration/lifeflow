#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  PROBLEMS FEATURE — EXHAUSTIVE USER-PERSPECTIVE TESTS
#  Tests every path a real user would take, including mistakes
# ═══════════════════════════════════════════════════════════════
set -o pipefail

BASE="http://localhost:3456"
COOKIES="/tmp/lf-test-cookies.txt"
PASS=0
FAIL=0
ERRORS=""

# ─── Auth setup: Get CSRF cookie via GET, then login ───
rm -f "$COOKIES"
curl -s -c "$COOKIES" "$BASE/api/auth/login" > /dev/null 2>&1
curl -s -c "$COOKIES" -b "$COOKIES" \
  -H 'Content-Type: application/json' \
  -X POST "$BASE/api/auth/register" \
  -d '{"email":"uxtest_'"$$"'@test.com","password":"UxTester123!@#","display_name":"UX Test '$$'"}' > /dev/null 2>&1
CSRF=$(grep csrf_token "$COOKIES" | awk '{print $NF}')
if [ -z "$CSRF" ]; then
  echo "FATAL: Could not obtain CSRF token. Aborting."
  exit 1
fi

api() {
  local method=$1 path=$2 body=$3
  if [ -n "$body" ]; then
    curl -s -b "$COOKIES" -H "Content-Type: application/json" -H "X-CSRF-Token: $CSRF" -X "$method" "$BASE$path" -d "$body"
  else
    curl -s -b "$COOKIES" -H "Content-Type: application/json" -H "X-CSRF-Token: $CSRF" -X "$method" "$BASE$path"
  fi
}

api_status() {
  local method=$1 path=$2 body=$3
  if [ -n "$body" ]; then
    curl -s -o /dev/null -w "%{http_code}" -b "$COOKIES" -H "Content-Type: application/json" -H "X-CSRF-Token: $CSRF" -X "$method" "$BASE$path" -d "$body"
  else
    curl -s -o /dev/null -w "%{http_code}" -b "$COOKIES" -H "Content-Type: application/json" -H "X-CSRF-Token: $CSRF" -X "$method" "$BASE$path"
  fi
}

jval() { python3 -c "import sys,json; d=json.load(sys.stdin); print(d$1)" 2>/dev/null; }

check() {
  local name=$1 expected=$2 actual=$3
  if [ "$expected" = "$actual" ]; then
    printf "  ✓ %-60s\n" "$name"
    PASS=$((PASS+1))
  else
    printf "  ✗ %-60s (expected: %s, got: %s)\n" "$name" "$expected" "$actual"
    FAIL=$((FAIL+1))
    ERRORS="$ERRORS\n  - $name: expected=$expected actual=$actual"
  fi
}

check_contains() {
  local name=$1 needle=$2 haystack=$3
  if echo "$haystack" | grep -q "$needle"; then
    printf "  ✓ %-60s\n" "$name"
    PASS=$((PASS+1))
  else
    printf "  ✗ %-60s (missing: %s)\n" "$name" "$needle"
    FAIL=$((FAIL+1))
    ERRORS="$ERRORS\n  - $name: missing '$needle'"
  fi
}

check_not_contains() {
  local name=$1 needle=$2 haystack=$3
  if ! echo "$haystack" | grep -q "$needle"; then
    printf "  ✓ %-60s\n" "$name"
    PASS=$((PASS+1))
  else
    printf "  ✗ %-60s (should NOT contain: %s)\n" "$name" "$needle"
    FAIL=$((FAIL+1))
    ERRORS="$ERRORS\n  - $name: should not contain '$needle'"
  fi
}

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║   PROBLEMS FEATURE — EXHAUSTIVE USER-PERSPECTIVE TESTS     ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# ─────────────────────────────────────────────────────────
# SECTION 1: EMPTY STATE — What a new user sees
# ─────────────────────────────────────────────────────────
echo "══ SECTION 1: EMPTY STATE ══"

R=$(api GET /api/problems)
check "New user sees empty problem list" "0" "$(echo "$R" | jval "['pagination']['total']")"
check "Empty list returns correct structure" "1" "$(echo "$R" | jval "['pagination']['page']")"

R=$(api GET /api/problems/stats)
check "Stats show zero problems" "0" "$(echo "$R" | jval "['total_resolved']")"
check "Stats by_phase is empty" "[]" "$(echo "$R" | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin)['by_phase']))" 2>/dev/null)"

# ─────────────────────────────────────────────────────────
# SECTION 2: VALIDATION — Bad inputs a real user might try
# ─────────────────────────────────────────────────────────
echo ""
echo "══ SECTION 2: INPUT VALIDATION ══"

# Empty title
S=$(api_status POST /api/problems '{"title":""}')
check "Reject empty title" "400" "$S"

# Missing title entirely
S=$(api_status POST /api/problems '{"description":"no title"}')
check "Reject missing title field" "400" "$S"

# Title too long (>300 chars)
LONG=$(python3 -c "print('x'*301)")
S=$(api_status POST /api/problems "{\"title\":\"$LONG\"}")
check "Reject title > 300 chars" "400" "$S"

# Invalid category
S=$(api_status POST /api/problems '{"title":"Test","category":"invalid_cat"}')
check "Reject invalid category" "400" "$S"

# Invalid urgency (out of range)
S=$(api_status POST /api/problems '{"title":"Test","urgency":99}')
check "Reject urgency > 3" "400" "$S"

# Negative importance
S=$(api_status POST /api/problems '{"title":"Test","importance":-1}')
check "Reject negative importance" "400" "$S"

# Invalid privacy level
S=$(api_status POST /api/problems '{"title":"Test","privacy_level":"top_secret"}')
check "Reject invalid privacy level" "400" "$S"

# Valid minimal problem (just title)
R=$(api POST /api/problems '{"title":"Minimal problem test"}')
PID_MIN=$(echo "$R" | jval "['id']")
check "Create problem with just title succeeds" "True" "$([ -n "$PID_MIN" ] && [ "$PID_MIN" != "None" ] && echo True || echo False)"
check "Default category is uncategorized" "uncategorized" "$(echo "$R" | jval "['category']")"
check "Default phase is capture" "capture" "$(echo "$R" | jval "['phase']")"
check "Default status is active" "active" "$(echo "$R" | jval "['status']")"
check "Default urgency is 0" "0" "$(echo "$R" | jval "['urgency']")"
check "Default importance is 0" "0" "$(echo "$R" | jval "['importance']")"
check "Default privacy is normal" "normal" "$(echo "$R" | jval "['privacy_level']")"

# ─────────────────────────────────────────────────────────
# SECTION 3: FULL LIFECYCLE — Real user journey
# ─────────────────────────────────────────────────────────
echo ""
echo "══ SECTION 3: FULL LIFECYCLE — Happy Path ══"

# Create a rich problem
R=$(api POST /api/problems '{"title":"Should I move to a new city for a job?","description":"Got an offer in Bangalore but family is in Chennai. 30% pay raise.","category":"career","urgency":2,"importance":3,"emotional_state":"conflicted","deadline":"2026-08-01T00:00:00Z","stakeholders":"spouse, parents, manager"}')
PID=$(echo "$R" | jval "['id']")
check "Created rich problem" "True" "$([ -n "$PID" ] && [ "$PID" != "None" ] && echo True || echo False)"
check "Emotional state saved" "conflicted" "$(echo "$R" | jval "['emotional_state']")"
check "Deadline saved" "2026-08-01T00:00:00Z" "$(echo "$R" | jval "['deadline']")"
check "Stakeholders saved" "spouse, parents, manager" "$(echo "$R" | jval "['stakeholders']")"

# GET by ID — should have empty sub-resources
R=$(api GET "/api/problems/$PID")
check "GET returns full entity with empty subs" "[]" "$(echo "$R" | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin)['reframes']))" 2>/dev/null)"
check "Decision is null initially" "None" "$(echo "$R" | jval "['decision']")"

# Add reframe in capture phase
R=$(api POST "/api/problems/$PID/reframes" '{"reframe_text":"This is not just about money — it is about what kind of life I want in 5 years"}')
RID=$(echo "$R" | jval "['id']")
check "Added reframe in capture phase" "True" "$([ -n "$RID" ] && [ "$RID" != "None" ] && echo True || echo False)"
check "Reframe source defaults to user" "user" "$(echo "$R" | jval "['source']")"

# Add second reframe (AI-style)
R=$(api POST "/api/problems/$PID/reframes" '{"reframe_text":"A move is reversible. The real question: which city lets you grow most?","source":"ai"}')
RID2=$(echo "$R" | jval "['id']")
check "Added AI-sourced reframe" "ai" "$(echo "$R" | jval "['source']")"

# ── DIAGNOSE ──
api PUT "/api/problems/$PID/phase" '{"phase":"diagnose"}' > /dev/null
R=$(api GET "/api/problems/$PID")
check "Phase moved to diagnose" "diagnose" "$(echo "$R" | jval "['phase']")"

R=$(api POST "/api/problems/$PID/journal" '{"entry_type":"observation","content":"Main concern: spouse has a good job in Chennai. Would need to find new work.","emotional_state":"anxious"}')
JID1=$(echo "$R" | jval "['id']")
check "Journal entry in diagnose phase" "diagnose" "$(echo "$R" | jval "['phase']")"
check "Observation entry type accepted" "observation" "$(echo "$R" | jval "['entry_type']")"
check "Emotional state on journal" "anxious" "$(echo "$R" | jval "['emotional_state']")"

R=$(api POST "/api/problems/$PID/journal" '{"entry_type":"question","content":"Can spouse work remote from Bangalore? Need to check company policy."}')
check "Question entry type" "question" "$(echo "$R" | jval "['entry_type']")"

# ── EXPLORE ──
api PUT "/api/problems/$PID/phase" '{"phase":"explore"}' > /dev/null

R=$(api POST "/api/problems/$PID/options" '{"title":"Accept and relocate","description":"Both move to Bangalore","effort":4,"impact":4,"risk":3}')
OID1=$(echo "$R" | jval "['id']")
check "Option 1 created" "True" "$([ -n "$OID1" ] && [ "$OID1" != "None" ] && echo True || echo False)"

R=$(api POST "/api/problems/$PID/options" '{"title":"Negotiate remote work","description":"Stay in Chennai, work remote for Bangalore company","effort":2,"impact":3,"risk":2}')
OID2=$(echo "$R" | jval "['id']")

R=$(api POST "/api/problems/$PID/options" '{"title":"Decline and stay","description":"Keep current job, wait for better opportunity","effort":1,"impact":1,"risk":1}')
OID3=$(echo "$R" | jval "['id']")
check "Three options created" "True" "$([ -n "$OID1" ] && [ -n "$OID2" ] && [ -n "$OID3" ] && echo True || echo False)"

# Update option with pros/cons
R=$(api PUT "/api/options/$OID1" '{"pros":"Higher salary, tech hub, career growth","cons":"Spouse job change, away from family, higher cost of living","emotional_fit":2}')
check "Updated option with pros/cons/emotional_fit" "2" "$(echo "$R" | jval "['emotional_fit']")"

R=$(api PUT "/api/options/$OID2" '{"pros":"No relocation stress, keep spouse job","cons":"May not get promoted, miss networking","emotional_fit":4}')
check "Second option updated" "4" "$(echo "$R" | jval "['emotional_fit']")"

# Add journal insight during explore
R=$(api POST "/api/problems/$PID/journal" '{"entry_type":"insight","content":"Realized the remote option was not just about convenience—it tests whether the company values output over presence."}')
check "Insight during explore" "insight" "$(echo "$R" | jval "['entry_type']")"

# ── DECIDE ──
api PUT "/api/problems/$PID/phase" '{"phase":"decide"}' > /dev/null

R=$(api POST "/api/problems/$PID/decisions" "{\"chosen_option_id\":$OID2,\"rationale\":\"Remote work gives best of both worlds. Can prove value, then revisit relocation later.\",\"confidence\":4,\"revisit_date\":\"2026-12-01T00:00:00Z\"}")
DID=$(echo "$R" | jval "['id']")
check "Decision created with option reference" "$OID2" "$(echo "$R" | jval "['chosen_option_id']")"
check "Decision confidence saved" "4" "$(echo "$R" | jval "['confidence_level']")"
check "Decision revisit_date saved" "2026-12-01T00:00:00Z" "$(echo "$R" | jval "['revisit_date']")"

# ── ACT ──
api PUT "/api/problems/$PID/phase" '{"phase":"act"}' > /dev/null

R=$(api POST "/api/problems/$PID/actions" '{"title":"Negotiate remote work arrangement with new company","due_date":"2026-05-15T00:00:00Z","spawn_task":true}')
AID1=$(echo "$R" | jval "['id']")
ATID1=$(echo "$R" | jval "['task_id']")
check "Action 1 created" "True" "$([ -n "$AID1" ] && [ "$AID1" != "None" ] && echo True || echo False)"
check "Task spawned for action 1" "True" "$([ -n "$ATID1" ] && [ "$ATID1" != "None" ] && [ "$ATID1" != "0" ] && echo True || echo False)"

R=$(api POST "/api/problems/$PID/actions" '{"description":"Research Bangalore neighborhoods with good schools","spawn_task":false}')
AID2=$(echo "$R" | jval "['id']")
check "Action 2 (no task spawn) created" "True" "$([ -n "$AID2" ] && [ "$AID2" != "None" ] && echo True || echo False)"
check "No task spawned when spawn_task=false" "None" "$(echo "$R" | jval "['task_id']")"

R=$(api POST "/api/problems/$PID/actions" '{"title":"Talk to spouse about timeline","due_date":"2026-05-01T00:00:00Z","spawn_task":true}')
AID3=$(echo "$R" | jval "['id']")

# Update action statuses
api PUT "/api/actions/$AID3" '{"status":"in_progress"}' > /dev/null
R=$(api PUT "/api/actions/$AID3" '{"status":"done"}')
check "Action marked done" "done" "$(echo "$R" | jval "['status']")"

R=$(api PUT "/api/actions/$AID2" '{"status":"skipped"}')
check "Action skipped" "skipped" "$(echo "$R" | jval "['status']")"

# Add tags
R=$(api POST "/api/problems/$PID/tags" '{"tag":"relocation"}')
TID1=$(echo "$R" | jval "['tag_id']")
check "Tag added by name" "True" "$([ -n "$TID1" ] && [ "$TID1" != "None" ] && echo True || echo False)"

R=$(api POST "/api/problems/$PID/tags" '{"tag":"career"}')
TID2=$(echo "$R" | jval "['tag_id']")

# Add same tag again (should it error or succeed?)
R2=$(api POST "/api/problems/$PID/tags" '{"tag":"career"}')
check_contains "Duplicate tag attempt gives response" "tag_id" "$R2"

# ── REVIEW ──
api PUT "/api/problems/$PID/phase" '{"phase":"review"}' > /dev/null
R=$(api POST "/api/problems/$PID/journal" '{"entry_type":"lesson","content":"Learned that being proactive about alternatives (remote) changes the whole dynamic. Never assume the offered terms are the only terms.","emotional_state":"confident"}')
check "Lesson entry in review" "lesson" "$(echo "$R" | jval "['entry_type']")"

# ── RESOLVE ──
api PUT "/api/problems/$PID/phase" '{"phase":"resolved"}' > /dev/null
R=$(api GET "/api/problems/$PID")
check "Problem marked resolved" "resolved" "$(echo "$R" | jval "['status']")"
check "resolved_at is set" "True" "$(echo "$R" | jval "['resolved_at']" | python3 -c "import sys; print('True' if sys.stdin.read().strip() not in ('None','null','') else 'False')")"

# ─────────────────────────────────────────────────────────
# SECTION 4: GUARD RAILS — Things users shouldn't be able to do
# ─────────────────────────────────────────────────────────
echo ""
echo "══ SECTION 4: GUARD RAILS ══"

# Can't modify resolved problem's phase
S=$(api_status PUT "/api/problems/$PID/phase" '{"phase":"capture"}')
check "Can't change phase of resolved problem" "400" "$S"

# Can't set invalid phase
S=$(api_status PUT "/api/problems/$PID_MIN/phase" '{"phase":"invalid_phase"}')
check "Reject invalid phase name" "400" "$S"

# Non-existent problem
S=$(api_status GET "/api/problems/99999")
check "404 for non-existent problem" "404" "$S"

# Non-existent option update
S=$(api_status PUT "/api/options/99999" '{"pros":"test"}')
check "404 for non-existent option" "404" "$S"

# Non-existent action update
S=$(api_status PUT "/api/actions/99999" '{"status":"done"}')
check "404 for non-existent action" "404" "$S"

# Action with neither title nor description
S=$(api_status POST "/api/problems/$PID_MIN/actions" '{"spawn_task":false}')
check "Reject action with no title or description" "400" "$S"

# Journal with empty content
S=$(api_status POST "/api/problems/$PID_MIN/journal" '{"content":""}')
check "Reject empty journal content" "400" "$S"

# Reframe with empty text
S=$(api_status POST "/api/problems/$PID_MIN/reframes" '{"reframe_text":""}')
check "Reject empty reframe text" "400" "$S"

# Option with no title
S=$(api_status POST "/api/problems/$PID_MIN/options" '{"description":"no title"}')
check "Reject option without title" "400" "$S"

# Tag with neither tag_id nor name
S=$(api_status POST "/api/problems/$PID_MIN/tags" '{}')
check "Reject tag with no identifier" "400" "$S"

# Link to non-existent problem
S=$(api_status POST "/api/problems/$PID_MIN/links" '{"linked_problem_id":99999,"link_type":"related"}')
check "Reject link to non-existent problem" "404" "$S"

# Self-link
S=$(api_status POST "/api/problems/$PID_MIN/links" "{\"linked_problem_id\":$PID_MIN,\"link_type\":\"related\"}")
check "Reject self-linking" "400" "$S"

# Invalid link type
S=$(api_status POST "/api/problems/$PID_MIN/links" "{\"linked_problem_id\":$PID,\"link_type\":\"invalid_type\"}")
check "Reject invalid link type" "400" "$S"

# Decision confidence out of range
api PUT "/api/problems/$PID_MIN/phase" '{"phase":"decide"}' > /dev/null 2>&1
S=$(api_status POST "/api/problems/$PID_MIN/decisions" '{"confidence":99}')
check "Reject confidence > 5" "400" "$S"

# ─────────────────────────────────────────────────────────
# SECTION 5: FILTERING, SEARCH & PAGINATION
# ─────────────────────────────────────────────────────────
echo ""
echo "══ SECTION 5: SEARCH, FILTER & PAGINATION ══"

# Create a few more problems for filtering
api POST /api/problems '{"title":"Budget planning for wedding","category":"financial","urgency":3,"importance":3}' > /dev/null
api POST /api/problems '{"title":"Learn Spanish before trip","category":"education","urgency":1,"importance":1}' > /dev/null
api POST /api/problems '{"title":"Fix relationship with brother","category":"relationships","urgency":0,"importance":2,"privacy_level":"private"}' > /dev/null

# Filter by category
R=$(api GET "/api/problems?category=financial")
check "Filter by category=financial" "1" "$(echo "$R" | jval "['pagination']['total']")"

R=$(api GET "/api/problems?category=career")
check "Filter by category=career (resolved shows too)" "1" "$(echo "$R" | jval "['pagination']['total']")"

# Filter by privacy
R=$(api GET "/api/problems?privacy_level=private")
check "Filter by privacy_level=private" "1" "$(echo "$R" | jval "['pagination']['total']")"

# Filter by status
R=$(api GET "/api/problems?status=active")
ACTIVE_COUNT=$(echo "$R" | jval "['pagination']['total']")
check "Filter by status=active returns non-resolved" "True" "$([ "$ACTIVE_COUNT" -ge 3 ] && echo True || echo False)"

R=$(api GET "/api/problems?status=resolved")
check "Filter by status=resolved" "1" "$(echo "$R" | jval "['pagination']['total']")"

# Pagination
R=$(api GET "/api/problems?limit=2&page=1")
check "Pagination limit=2 returns 2 items" "2" "$(echo "$R" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['data']))" 2>/dev/null)"

R=$(api GET "/api/problems?limit=2&page=2")
P2_COUNT=$(echo "$R" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['data']))" 2>/dev/null)
check "Pagination page 2 has items" "True" "$([ "$P2_COUNT" -ge 1 ] && echo True || echo False)"

# Search
R=$(api GET "/api/problems?search=wedding")
check "Search finds 'wedding' problem" "1" "$(echo "$R" | jval "['pagination']['total']")"

R=$(api GET "/api/problems?search=xyz_nothing_matches")
check "Search with no results returns empty" "0" "$(echo "$R" | jval "['pagination']['total']")"

# Sort
R=$(api GET "/api/problems?sort=urgency&order=desc")
FIRST_URGENCY=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin)['data']; print(d[0]['urgency'] if d else 'empty')" 2>/dev/null)
check "Sort by urgency desc, highest first" "3" "$FIRST_URGENCY"

R=$(api GET "/api/problems?sort=title&order=asc")
FIRST_TITLE=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin)['data']; print(d[0]['title'][:10] if d else '')" 2>/dev/null)
check "Sort by title asc works" "True" "$([ -n "$FIRST_TITLE" ] && echo True || echo False)"

# ─────────────────────────────────────────────────────────
# SECTION 6: PROBLEM LINKING & RELATIONSHIPS
# ─────────────────────────────────────────────────────────
echo ""
echo "══ SECTION 6: PROBLEM LINKING ══"

# Create two problems to link
R1=$(api POST /api/problems '{"title":"Time management issues","category":"personal_growth"}')
LID1=$(echo "$R1" | jval "['id']")
R2=$(api POST /api/problems '{"title":"Cannot focus at work","category":"career"}')
LID2=$(echo "$R2" | jval "['id']")

# Create valid link
R=$(api POST "/api/problems/$LID1/links" "{\"linked_problem_id\":$LID2,\"link_type\":\"causes\"}")
LINK_ID=$(echo "$R" | jval "['id']")
check "Created link between problems" "True" "$([ -n "$LINK_ID" ] && [ "$LINK_ID" != "None" ] && echo True || echo False)"
check "Link type is causes" "causes" "$(echo "$R" | jval "['link_type']")"

# Duplicate link should fail
S=$(api_status POST "/api/problems/$LID1/links" "{\"linked_problem_id\":$LID2,\"link_type\":\"causes\"}")
check "Duplicate link rejected (409)" "409" "$S"

# Different link type between same problems — UNIQUE(problem_id, linked_problem_id) rejects
S=$(api_status POST "/api/problems/$LID1/links" "{\"linked_problem_id\":$LID2,\"link_type\":\"blocks\"}")
check "Different link type same pair rejected (409)" "409" "$S"

# All valid link types
for lt in related causes blocks child_of duplicate; do
  api POST "/api/problems/$LID1/links" "{\"linked_problem_id\":$PID_MIN,\"link_type\":\"$lt\"}" > /dev/null 2>&1
done
R=$(api GET "/api/problems/$LID1")
LINK_COUNT=$(echo "$R" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['links']))" 2>/dev/null)
check "Multiple link types work" "True" "$([ "$LINK_COUNT" -ge 1 ] && echo True || echo False)"

# Delete a link
S=$(api_status DELETE "/api/links/$LINK_ID")
check "Delete link succeeds" "200" "$S"

# ─────────────────────────────────────────────────────────
# SECTION 7: UPDATE OPERATIONS
# ─────────────────────────────────────────────────────────
echo ""
echo "══ SECTION 7: UPDATE OPERATIONS ══"

# Update problem title
R=$(api PUT "/api/problems/$PID_MIN" '{"title":"Updated: A simple test problem"}')
check "Update problem title" "Updated: A simple test problem" "$(echo "$R" | jval "['title']")"

# Update problem category
R=$(api PUT "/api/problems/$PID_MIN" '{"category":"personal_growth"}')
check "Update problem category" "personal_growth" "$(echo "$R" | jval "['category']")"

# Update problem urgency
R=$(api PUT "/api/problems/$PID_MIN" '{"urgency":3,"importance":3}')
check "Update urgency and importance" "3" "$(echo "$R" | jval "['urgency']")"

# Update problem description to null (clear it)
R=$(api PUT "/api/problems/$PID_MIN" '{"description":null}')
check "Clear description to null" "" "$(echo "$R" | jval "['description']")"

# Update problem emotional state
R=$(api PUT "/api/problems/$PID_MIN" '{"emotional_state":"hopeful"}')
check "Update emotional state" "hopeful" "$(echo "$R" | jval "['emotional_state']")"

# ─────────────────────────────────────────────────────────
# SECTION 8: MULTI-USER ISOLATION
# ─────────────────────────────────────────────────────────
echo ""
echo "══ SECTION 8: MULTI-USER DATA ISOLATION ══"

# Unauthenticated access
S=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3456/api/problems)
check "Unauthenticated: /api/problems returns 401" "401" "$S"

S=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3456/api/problems/stats)
check "Unauthenticated: /api/problems/stats returns 401" "401" "$S"

# CSRF protection
S=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIES" -H "Content-Type: application/json" -X POST http://localhost:3456/api/problems -d '{"title":"no csrf"}')
check "POST without CSRF token rejected" "403" "$S"

# ─────────────────────────────────────────────────────────
# SECTION 9: EDGE CASES & BOUNDARY VALUES
# ─────────────────────────────────────────────────────────
echo ""
echo "══ SECTION 9: EDGE CASES ══"

# Unicode in title
R=$(api POST /api/problems '{"title":"移民の問題 — ¿debería mudarme? 🏠✈️","category":"personal_growth"}')
UNICODE_PID=$(echo "$R" | jval "['id']")
check "Unicode title saved" "True" "$(echo "$R" | python3 -c "import sys,json; print('True' if '移民' in json.load(sys.stdin)['title'] else 'False')" 2>/dev/null)"

# Very long description (near 10000 chars)
LONG_DESC=$(python3 -c "print('A'*9999)")
S=$(api_status POST /api/problems "{\"title\":\"Long desc test\",\"description\":\"$LONG_DESC\"}")
check "Near-max description (9999 chars) accepted" "201" "$S"

S=$(api_status POST /api/problems "{\"title\":\"Too long\",\"description\":\"$(python3 -c "print('B'*10001)")\"}")
check "Over-max description (10001 chars) rejected" "400" "$S"

# Effort/impact/risk at boundaries
R=$(api POST "/api/problems/$PID_MIN/options" '{"title":"Min scores","effort":1,"impact":1,"risk":1}')
check "Effort/impact/risk min=1 accepted" "1" "$(echo "$R" | jval "['effort']")"

R=$(api POST "/api/problems/$PID_MIN/options" '{"title":"Max scores","effort":5,"impact":5,"risk":5}')
check "Effort/impact/risk max=5 accepted" "5" "$(echo "$R" | jval "['effort']")"

S=$(api_status POST "/api/problems/$PID_MIN/options" '{"title":"Over max","effort":6}')
check "Effort=6 rejected (> max 5)" "400" "$S"

S=$(api_status POST "/api/problems/$PID_MIN/options" '{"title":"Zero effort","effort":0}')
check "Effort=0 rejected (< min 1)" "400" "$S"

# Journal with all entry types
for et in reflection insight question breakthrough setback observation lesson; do
  R=$(api POST "/api/problems/$PID_MIN/journal" "{\"content\":\"Testing entry type: $et\",\"entry_type\":\"$et\"}")
  check "Journal entry_type=$et accepted" "$et" "$(echo "$R" | jval "['entry_type']")"
done

# All emotional states in journal
for es in anxious overwhelmed stuck frustrated scared confused angry sad guilty hopeful numb uncertain conflicted ashamed relieved confident determined calm; do
  R=$(api POST "/api/problems/$PID_MIN/journal" "{\"content\":\"Feeling $es\",\"emotional_state\":\"$es\"}")
  check "Emotional state=$es accepted" "$es" "$(echo "$R" | jval "['emotional_state']")"
done

# All categories
for cat in uncategorized career relationships financial health health_wellness personal_growth education home creative social existential; do
  R=$(api POST /api/problems "{\"title\":\"Cat test: $cat\",\"category\":\"$cat\"}")
  CID=$(echo "$R" | jval "['id']")
  check "Category=$cat accepted" "$cat" "$(echo "$R" | jval "['category']")"
  # Clean up
  api DELETE "/api/problems/$CID" > /dev/null 2>&1
done

# ─────────────────────────────────────────────────────────
# SECTION 10: ARCHIVE, SHELVE & DELETE OPERATIONS
# ─────────────────────────────────────────────────────────
echo ""
echo "══ SECTION 10: ARCHIVE, SHELVE & DELETE ══"

# Archive a problem
R=$(api PUT "/api/problems/$LID2/archive")
check "Archive sets status to shelved" "shelved" "$(echo "$R" | jval "['status']")"
check "Archive sets phase to shelved" "shelved" "$(echo "$R" | jval "['phase']")"

# Shelved problem shouldn't appear in active filter
R=$(api GET "/api/problems?status=active")
check_not_contains "Shelved problem not in active list" "\"id\": $LID2" "$R"

# Soft delete
api DELETE "/api/problems/$UNICODE_PID" > /dev/null
R=$(api GET "/api/problems")
check_not_contains "Soft-deleted problem not in list" "\"id\": $UNICODE_PID" "$R"

# Can still GET a soft-deleted problem by ID?
S=$(api_status GET "/api/problems/$UNICODE_PID")
# This tests whether we designed it to 404 or still return it
echo "  ℹ Soft-deleted GET status: $S (design decision: $([ "$S" = "200" ] && echo "returns data" || echo "returns 404"))"

# ─────────────────────────────────────────────────────────
# SECTION 11: STATS ACCURACY
# ─────────────────────────────────────────────────────────
echo ""
echo "══ SECTION 11: STATS ACCURACY ══"

R=$(api GET /api/problems/stats)
RESOLVED=$(echo "$R" | jval "['total_resolved']")
check "Stats total_resolved count" "1" "$RESOLVED"

# Check by_status includes all statuses
STATUS_LIST=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(','.join(sorted([s['status'] for s in d['by_status']])))" 2>/dev/null)
check_contains "Stats include resolved status" "resolved" "$STATUS_LIST"

# recently_active should not include resolved/shelved
RECENT=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(','.join([str(r['id']) for r in d['recently_active']]))" 2>/dev/null)
check_not_contains "Recently active excludes resolved" "$PID" "$RECENT"

# ─────────────────────────────────────────────────────────
# SECTION 12: DECISION WORKFLOW EDGE CASES
# ─────────────────────────────────────────────────────────
echo ""
echo "══ SECTION 12: DECISION EDGE CASES ══"

# Create decision without choosing an option
R3=$(api POST /api/problems '{"title":"What color to paint the room?","category":"home"}')
PID3=$(echo "$R3" | jval "['id']")
api PUT "/api/problems/$PID3/phase" '{"phase":"decide"}' > /dev/null
R=$(api POST "/api/problems/$PID3/decisions" '{"rationale":"Going with gut feeling — blue","confidence":3}')
check "Decision without option_id works" "True" "$(echo "$R" | jval "['id']" | python3 -c "import sys; v=sys.stdin.read().strip(); print('True' if v not in ('None','') else 'False')")"
check "chosen_option_id is null" "None" "$(echo "$R" | jval "['chosen_option_id']")"

# Update decision confidence
DID3=$(echo "$R" | jval "['id']")
R=$(api PUT "/api/decisions/$DID3" '{"confidence":5}')
check "Update decision confidence" "5" "$(echo "$R" | jval "['confidence_level']")"

# Update decision rationale
R=$(api PUT "/api/decisions/$DID3" '{"rationale":"Changed mind — going green"}')
check_contains "Updated rationale" "green" "$R"

# ─────────────────────────────────────────────────────────
# SECTION 13: PHASE SKIP & BACKTRACK TESTS
# ─────────────────────────────────────────────────────────
echo ""
echo "══ SECTION 13: PHASE TRANSITIONS ══"

R4=$(api POST /api/problems '{"title":"Phase test problem"}')
PID4=$(echo "$R4" | jval "['id']")

# Forward skip (capture → decide, skipping diagnose and explore)
S=$(api_status PUT "/api/problems/$PID4/phase" '{"phase":"decide"}')
check "Skip phases forward allowed (capture→decide)" "200" "$S"

# Backtrack (decide → capture)
S=$(api_status PUT "/api/problems/$PID4/phase" '{"phase":"capture"}')
check "Backtrack allowed (decide→capture)" "200" "$S"

# Jump to resolve directly
S=$(api_status PUT "/api/problems/$PID4/phase" '{"phase":"resolved"}')
R=$(api GET "/api/problems/$PID4")
check "Direct resolve from capture" "resolved" "$(echo "$R" | jval "['status']")"

# Cannot change after resolve
S=$(api_status PUT "/api/problems/$PID4/phase" '{"phase":"capture"}')
check "Cannot reopen resolved problem" "400" "$S"

# Shelve directly
R5=$(api POST /api/problems '{"title":"Shelve test"}')
PID5=$(echo "$R5" | jval "['id']")
S=$(api_status PUT "/api/problems/$PID5/phase" '{"phase":"shelved"}')
check "Shelve from capture" "200" "$S"
R=$(api GET "/api/problems/$PID5")
check "Shelved status set" "shelved" "$(echo "$R" | jval "['status']")"

# ─────────────────────────────────────────────────────────
# SECTION 14: TASK SPAWN VERIFICATION
# ─────────────────────────────────────────────────────────
echo ""
echo "══ SECTION 14: TASK SPAWN INTEGRATION ══"

R6=$(api POST /api/problems '{"title":"Task spawn test"}')
PID6=$(echo "$R6" | jval "['id']")
api PUT "/api/problems/$PID6/phase" '{"phase":"act"}' > /dev/null

# Spawn task
R=$(api POST "/api/problems/$PID6/actions" '{"title":"Verify task appears in LifeFlow","due_date":"2026-06-01T00:00:00Z","spawn_task":true}')
SPAWNED_TID=$(echo "$R" | jval "['task_id']")
check "Spawned task has ID" "True" "$([ -n "$SPAWNED_TID" ] && [ "$SPAWNED_TID" != "None" ] && [ "$SPAWNED_TID" != "0" ] && echo True || echo False)"

# Verify the task exists in LifeFlow tasks API
R=$(api GET "/api/tasks/$SPAWNED_TID")
check_contains "Spawned task exists in tasks API" "Verify task appears" "$R"

# No spawn
R=$(api POST "/api/problems/$PID6/actions" '{"title":"Manual action, no task"}')
check "Action without spawn has null task_id" "None" "$(echo "$R" | jval "['task_id']")"

# ─────────────────────────────────────────────────────────
# SECTION 15: RAPID FIRE — STRESS TEST
# ─────────────────────────────────────────────────────────
echo ""
echo "══ SECTION 15: RAPID FIRE (10 problems) ══"

CREATED=0
for i in $(seq 1 10); do
  R=$(api POST /api/problems "{\"title\":\"Rapid problem $i\",\"category\":\"uncategorized\"}")
  ID=$(echo "$R" | jval "['id']")
  if [ -n "$ID" ] && [ "$ID" != "None" ]; then
    CREATED=$((CREATED+1))
  fi
done
check "Created 10 problems rapidly" "10" "$CREATED"

R=$(api GET "/api/problems?limit=100")
TOTAL=$(echo "$R" | jval "['pagination']['total']")
check "All problems visible in list (15+)" "True" "$([ "$TOTAL" -ge 15 ] && echo True || echo False)"

# ─────────────────────────────────────────────────────────
# FINAL REPORT
# ─────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  TEST RESULTS                                               ║"
echo "╠══════════════════════════════════════════════════════════════╣"
printf "║  PASSED: %-49s║\n" "$PASS"
printf "║  FAILED: %-49s║\n" "$FAIL"
printf "║  TOTAL:  %-49s║\n" "$((PASS+FAIL))"
echo "╚══════════════════════════════════════════════════════════════╝"

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "FAILED TESTS:"
  echo -e "$ERRORS"
fi
