#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Problems Feature — Expert Panel Recommendations E2E Tests
# Tests all new features from migration 010 + panel review
# ═══════════════════════════════════════════════════════════════
set -o pipefail

BASE="http://localhost:3456"
COOKIES="/tmp/lf-panel-e2e-cookies-$$.txt"
PASS=0
FAIL=0
TOTAL=0

cleanup() { rm -f "$COOKIES"; }
trap cleanup EXIT

# ── Auth setup ──
rm -f "$COOKIES"
curl -s -c "$COOKIES" "$BASE/api/auth/login" > /dev/null 2>&1
CSRF=$(grep csrf_token "$COOKIES" | awk '{print $NF}')
EMAIL="panel_e2e_$$@test.com"
curl -s -c "$COOKIES" -b "$COOKIES" -X POST "$BASE/api/auth/register" \
  -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $CSRF" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"PanelTest12345!\",\"display_name\":\"Panel Tester\"}" > /dev/null 2>&1
CSRF=$(grep csrf_token "$COOKIES" | awk '{print $NF}')
if [ -z "$CSRF" ]; then echo "FATAL: No CSRF token"; exit 1; fi

# ── Helper functions ──
api() {
  local method=$1 path=$2 body=$3
  if [ -n "$body" ]; then
    curl -s -b "$COOKIES" -H "Content-Type: application/json" -H "X-CSRF-Token: $CSRF" -X "$method" "$BASE$path" -d "$body" 2>/dev/null
  else
    curl -s -b "$COOKIES" -H "X-CSRF-Token: $CSRF" -X "$method" "$BASE$path" 2>/dev/null
  fi
}

api_status() {
  local method=$1 path=$2 body=$3
  if [ -n "$body" ]; then
    curl -s -o /dev/null -w "%{http_code}" -b "$COOKIES" -H "Content-Type: application/json" -H "X-CSRF-Token: $CSRF" -X "$method" "$BASE$path" -d "$body" 2>/dev/null
  else
    curl -s -o /dev/null -w "%{http_code}" -b "$COOKIES" -H "Content-Type: application/json" -H "X-CSRF-Token: $CSRF" -X "$method" "$BASE$path" 2>/dev/null
  fi
}

jval() { echo "$1" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d$2)" 2>/dev/null; }
jlen() { echo "$1" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d$2))" 2>/dev/null; }
jkeys() { echo "$1" | python3 -c "import sys,json; d=json.load(sys.stdin); print(sorted(d$2.keys()))" 2>/dev/null; }

assert_eq() {
  TOTAL=$((TOTAL + 1))
  if [ "$1" = "$2" ]; then
    printf "  \033[32m✓\033[0m %-60s\n" "$3"
    PASS=$((PASS + 1))
  else
    printf "  \033[31m✗\033[0m %-60s (expected: %s, got: %s)\n" "$3" "$1" "$2"
    FAIL=$((FAIL + 1))
  fi
}

assert_ge() {
  TOTAL=$((TOTAL + 1))
  if [ "$1" -ge "$2" ] 2>/dev/null; then
    printf "  \033[32m✓\033[0m %-60s\n" "$3"
    PASS=$((PASS + 1))
  else
    printf "  \033[31m✗\033[0m %-60s (expected >= %s, got: %s)\n" "$3" "$2" "$1"
    FAIL=$((FAIL + 1))
  fi
}

assert_ne() {
  TOTAL=$((TOTAL + 1))
  if [ "$1" != "$2" ]; then
    printf "  \033[32m✓\033[0m %-60s\n" "$3"
    PASS=$((PASS + 1))
  else
    printf "  \033[31m✗\033[0m %-60s (should NOT be: %s)\n" "$3" "$2"
    FAIL=$((FAIL + 1))
  fi
}

section() { echo ""; echo "══ $1 ══"; }

# ═══════════════════════════════════════════════════════════════
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  PANEL RECOMMENDATIONS — COMPREHENSIVE E2E TESTS            ║"
echo "╚══════════════════════════════════════════════════════════════╝"

# ─────────────────────────────────────────────────────────────
section "SECTION 1: EMOTIONAL CLUSTERS"
# ─────────────────────────────────────────────────────────────
R=$(api GET /api/problems/emotional-clusters)
assert_eq "8" "$(jlen "$R" '')" "8 emotional clusters returned"

# Check each cluster exists
for C in fear confusion frustration sadness shame hope confidence resolve; do
  V=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print('$C' in d)" 2>/dev/null)
  assert_eq "True" "$V" "Cluster '$C' exists"
done

# Check cluster contents are non-empty arrays
FEAR_LEN=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['fear']))" 2>/dev/null)
assert_ge "$FEAR_LEN" "1" "Fear cluster has emotions"

# ─────────────────────────────────────────────────────────────
section "SECTION 2: REFRAME STARTERS"
# ─────────────────────────────────────────────────────────────
R=$(api GET /api/problems/reframe-starters)
assert_eq "8" "$(jlen "$R" '')" "8 reframe starters returned"

# Check starters are objects with text field
FIRST=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d[0].get('text','')) > 5)" 2>/dev/null)
assert_eq "True" "$FIRST" "First starter has meaningful text"

# ─────────────────────────────────────────────────────────────
section "SECTION 3: CRISIS RESOURCES"
# ─────────────────────────────────────────────────────────────
R=$(api GET /api/problems/crisis-resources)
assert_eq "5" "$(jlen "$R" "['resources']")" "5 crisis helplines"

# Check resource structure
FIRST_NAME=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print('name' in d['resources'][0])" 2>/dev/null)
FIRST_NUMBER=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print('number' in d['resources'][0])" 2>/dev/null)
assert_eq "True" "$FIRST_NAME" "Resource has 'name' field"
assert_eq "True" "$FIRST_NUMBER" "Resource has 'number' field"

# Check banner and disclaimer
HAS_BANNER=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print('banner' in d)" 2>/dev/null)
HAS_DISCLAIMER=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print('disclaimer' in d)" 2>/dev/null)
assert_eq "True" "$HAS_BANNER" "Crisis response has banner"
assert_eq "True" "$HAS_DISCLAIMER" "Crisis response has disclaimer"

# ─────────────────────────────────────────────────────────────
section "SECTION 4: PROBLEM TEMPLATES"
# ─────────────────────────────────────────────────────────────
R=$(api GET /api/problems/templates)
assert_eq "6" "$(jlen "$R" '')" "6 templates available"

# Check each template ID exists
for T in job_decision conflict_resolution health_decision financial_decision life_transition stuck_feeling; do
  V=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(any(t['id']=='$T' for t in d))" 2>/dev/null)
  assert_eq "True" "$V" "Template '$T' exists"
done

# Check template structure
HAS_TITLE=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print('title' in d[0])" 2>/dev/null)
HAS_CATEGORY=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print('category' in d[0])" 2>/dev/null)
HAS_OPTIONS=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print('suggested_options' in d[0])" 2>/dev/null)
HAS_STAKEHOLDERS=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print('suggested_stakeholders' in d[0])" 2>/dev/null)
assert_eq "True" "$HAS_TITLE" "Template has title"
assert_eq "True" "$HAS_CATEGORY" "Template has category"
assert_eq "True" "$HAS_OPTIONS" "Template has suggested_options"
assert_eq "True" "$HAS_STAKEHOLDERS" "Template has suggested_stakeholders"

# ─────────────────────────────────────────────────────────────
section "SECTION 5: CREATE FROM TEMPLATE"
# ─────────────────────────────────────────────────────────────

# Job decision template
R=$(api POST /api/problems/from-template '{"template_id":"job_decision"}')
JOB_ID=$(jval "$R" "['id']")
assert_ne "$JOB_ID" "" "Job decision problem created from template"
assert_eq "career" "$(jval "$R" "['category']")" "Job template → category=career"
assert_eq "decide" "$(jval "$R" "['problem_type']")" "Job template → type=decide"
JOB_OPTS=$(jlen "$R" "['options']")
JOB_SH=$(jlen "$R" "['stakeholders']")
assert_ge "$JOB_OPTS" "3" "Job template auto-created >= 3 options"
assert_ge "$JOB_SH" "2" "Job template auto-created >= 2 stakeholders"

# Conflict resolution template
R=$(api POST /api/problems/from-template '{"template_id":"conflict_resolution"}')
CR_ID=$(jval "$R" "['id']")
assert_ne "$CR_ID" "" "Conflict resolution problem created"
assert_eq "relationships" "$(jval "$R" "['category']")" "Conflict template → relationships"
assert_eq "solve" "$(jval "$R" "['problem_type']")" "Conflict template → type=solve"

# Health decision template
R=$(api POST /api/problems/from-template '{"template_id":"health_decision"}')
assert_eq "health" "$(jval "$R" "['category']")" "Health template → category=health"

# Financial decision template
R=$(api POST /api/problems/from-template '{"template_id":"financial_decision"}')
assert_eq "financial" "$(jval "$R" "['category']")" "Financial template → category=financial"

# Life transition template
R=$(api POST /api/problems/from-template '{"template_id":"life_transition"}')
assert_eq "personal_growth" "$(jval "$R" "['category']")" "Life transition → personal_growth"

# Stuck feeling template
R=$(api POST /api/problems/from-template '{"template_id":"stuck_feeling"}')
SF_ID=$(jval "$R" "['id']")
assert_eq "process" "$(jval "$R" "['problem_type']")" "Stuck template → type=process"

# Invalid template
S=$(api_status POST /api/problems/from-template '{"template_id":"nonexistent"}')
assert_eq "404" "$S" "Invalid template_id → 404"

# Missing template_id
S=$(api_status POST /api/problems/from-template '{}')
assert_eq "400" "$S" "Missing template_id → 400"

# ─────────────────────────────────────────────────────────────
section "SECTION 6: PROBLEM TYPE CLASSIFICATION"
# ─────────────────────────────────────────────────────────────

# Create with each problem_type
R=$(api POST /api/problems '{"title":"Solve type test","problem_type":"solve"}')
SOLVE_ID=$(jval "$R" "['id']")
assert_eq "solve" "$(jval "$R" "['problem_type']")" "problem_type=solve accepted"

R=$(api POST /api/problems '{"title":"Decide type test","problem_type":"decide"}')
assert_eq "decide" "$(jval "$R" "['problem_type']")" "problem_type=decide accepted"

R=$(api POST /api/problems '{"title":"Process type test","problem_type":"process"}')
assert_eq "process" "$(jval "$R" "['problem_type']")" "problem_type=process accepted"

R=$(api POST /api/problems '{"title":"Unclassified test","problem_type":"unclassified"}')
assert_eq "unclassified" "$(jval "$R" "['problem_type']")" "problem_type=unclassified accepted"

# Default problem_type
R=$(api POST /api/problems '{"title":"Default type test"}')
DEFAULT_ID=$(jval "$R" "['id']")
DT=$(jval "$R" "['problem_type']")
# Default should be unclassified (from DB DEFAULT or schema)
assert_eq "unclassified" "$DT" "Default problem_type is unclassified"

# Update problem_type
R=$(api PUT "/api/problems/$DEFAULT_ID" '{"problem_type":"solve"}')
assert_eq "solve" "$(jval "$R" "['problem_type']")" "Updated problem_type to solve"

# ─────────────────────────────────────────────────────────────
section "SECTION 7: PROBLEM VALIDATION"
# ─────────────────────────────────────────────────────────────

# Create fresh problem
R=$(api POST /api/problems '{"title":"Validation target"}')
VAL_ID=$(jval "$R" "['id']")

# Not validated initially
assert_eq "0" "$(jval "$R" "['validated']")" "New problem starts unvalidated"

# Validate it
R=$(api PUT "/api/problems/$VAL_ID/validate")
assert_eq "1" "$(jval "$R" "['validated']")" "Problem validated successfully"

# Validate idempotently
R=$(api PUT "/api/problems/$VAL_ID/validate")
assert_eq "1" "$(jval "$R" "['validated']")" "Validate is idempotent"

# Validate non-existent problem
S=$(api_status PUT /api/problems/999999/validate)
assert_eq "404" "$S" "Validate non-existent → 404"

# ─────────────────────────────────────────────────────────────
section "SECTION 8: STAKEHOLDERS CRUD"
# ─────────────────────────────────────────────────────────────

# Create stakeholders
R=$(api POST "/api/problems/$VAL_ID/stakeholders" '{"name":"Mom","role":"Family advisor","influence":"high","impact":"high","notes":"Always gives good advice"}')
SH1_ID=$(jval "$R" "['id']")
assert_ne "$SH1_ID" "" "Stakeholder created"
assert_eq "Mom" "$(jval "$R" "['name']")" "Stakeholder name saved"
assert_eq "high" "$(jval "$R" "['influence']")" "Stakeholder influence=high"
assert_eq "high" "$(jval "$R" "['impact']")" "Stakeholder impact=high"

R=$(api POST "/api/problems/$VAL_ID/stakeholders" '{"name":"Best Friend","role":"Peer support","influence":"medium","impact":"medium"}')
SH2_ID=$(jval "$R" "['id']")
assert_ne "$SH2_ID" "" "Second stakeholder created"

R=$(api POST "/api/problems/$VAL_ID/stakeholders" '{"name":"Boss","role":"Manager","influence":"high","impact":"low"}')
SH3_ID=$(jval "$R" "['id']")
assert_ne "$SH3_ID" "" "Third stakeholder created"

# List stakeholders
R=$(api GET "/api/problems/$VAL_ID/stakeholders")
assert_eq "3" "$(jlen "$R" '')" "3 stakeholders listed"

# Update stakeholder
R=$(api PUT "/api/stakeholders/$SH1_ID" '{"name":"Mother","influence":"medium"}')
assert_eq "Mother" "$(jval "$R" "['name']")" "Stakeholder name updated"
assert_eq "medium" "$(jval "$R" "['influence']")" "Stakeholder influence updated"

# Delete stakeholder
S=$(api_status DELETE "/api/stakeholders/$SH3_ID")
assert_eq "200" "$S" "Delete stakeholder → 200"

# Verify deletion
R=$(api GET "/api/problems/$VAL_ID/stakeholders")
assert_eq "2" "$(jlen "$R" '')" "2 stakeholders after delete"

# Create stakeholder validation
S=$(api_status POST "/api/problems/$VAL_ID/stakeholders" '{}')
assert_eq "400" "$S" "Stakeholder without name → 400"

S=$(api_status POST "/api/problems/$VAL_ID/stakeholders" '{"name":"Test","influence":"invalid"}')
assert_eq "400" "$S" "Invalid influence level → 400"

# Stakeholder on non-existent problem
S=$(api_status POST /api/problems/999999/stakeholders '{"name":"Ghost"}')
assert_eq "404" "$S" "Stakeholder on non-existent problem → 404"

S=$(api_status PUT /api/stakeholders/999999 '{"name":"Ghost"}')
assert_eq "404" "$S" "Update non-existent stakeholder → 404"

S=$(api_status DELETE /api/stakeholders/999999)
assert_eq "404" "$S" "Delete non-existent stakeholder → 404"

# ─────────────────────────────────────────────────────────────
section "SECTION 9: PHASE TRANSITIONS WITH REFLECTION"
# ─────────────────────────────────────────────────────────────

# Create problem for phase transitions  
R=$(api POST /api/problems '{"title":"Phase transition test","problem_type":"solve"}')
PT_ID=$(jval "$R" "['id']")

# Transition with reflection and emotional state
R=$(api PUT "/api/problems/$PT_ID/phase" '{"phase":"diagnose","reflection":"I realize this is about control","emotional_state":"hopeful"}')
assert_eq "diagnose" "$(jval "$R" "['phase']")" "Phase moved to diagnose"

# Check transition recorded
R=$(api GET "/api/problems/$PT_ID/transitions")
assert_eq "1" "$(jlen "$R" '')" "One transition recorded"
assert_eq "capture" "$(jval "$R" "[0]['from_phase']")" "From phase=capture"
assert_eq "diagnose" "$(jval "$R" "[0]['to_phase']")" "To phase=diagnose"
assert_eq "I realize this is about control" "$(jval "$R" "[0]['reflection']")" "Reflection saved"
assert_eq "hopeful" "$(jval "$R" "[0]['emotional_state']")" "Emotional state saved"

# Another transition
R=$(api PUT "/api/problems/$PT_ID/phase" '{"phase":"explore","reflection":"Found three possible approaches"}')
R=$(api GET "/api/problems/$PT_ID/transitions")
assert_eq "2" "$(jlen "$R" '')" "Two transitions recorded"

# Transition without reflection (backward compat)
R=$(api PUT "/api/problems/$PT_ID/phase" '{"phase":"decide"}')
assert_eq "decide" "$(jval "$R" "['phase']")" "Phase changed without reflection"

R=$(api GET "/api/problems/$PT_ID/transitions")
assert_eq "3" "$(jlen "$R" '')" "Three transitions (including sans-reflection)"

# Check journal entry was created for phase transition
R=$(api GET "/api/problems/$PT_ID")
JOURNAL_LEN=$(jlen "$R" "['journal']")
assert_ge "$JOURNAL_LEN" "1" "Journal entries created for transitions"

# Check a phase_transition entry type exists
HAS_PT=$(echo "$R" | python3 -c "
import sys,json
d=json.load(sys.stdin)
entries=[j for j in d.get('journal',[]) if j.get('entry_type')=='phase_transition']
print(len(entries) > 0)" 2>/dev/null)
assert_eq "True" "$HAS_PT" "Journal has phase_transition entries"

# ─────────────────────────────────────────────────────────────
section "SECTION 10: SHELVING WITH REASON"
# ─────────────────────────────────────────────────────────────

# Create problem to shelve
R=$(api POST /api/problems '{"title":"Problem to shelve"}')
SHELVE_ID=$(jval "$R" "['id']")

# Shelve with reason
R=$(api PUT "/api/problems/$SHELVE_ID/archive" '{"shelve_reason":"waiting_for_info","shelve_notes":"Need Q3 numbers"}')
assert_eq "shelved" "$(jval "$R" "['status']")" "Shelved status set"
assert_eq "waiting_for_info" "$(jval "$R" "['shelve_reason']")" "Shelve reason saved"

# Check transition was recorded
R=$(api GET "/api/problems/$SHELVE_ID/transitions")
assert_ge "$(jlen "$R" '')" "1" "Shelve created transition record"
LAST_TO=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[-1]['to_phase'])" 2>/dev/null)
assert_eq "shelved" "$LAST_TO" "Transition to=shelved"

# Shelve reason: not_mine_to_solve
R2=$(api POST /api/problems '{"title":"Not mine to solve"}')
NMS_ID=$(jval "$R2" "['id']")
R2=$(api PUT "/api/problems/$NMS_ID/archive" '{"shelve_reason":"not_mine_to_solve","shelve_notes":"Friend handled it"}')
assert_eq "not_mine_to_solve" "$(jval "$R2" "['shelve_reason']")" "Shelve reason=not_mine_to_solve"

# Shelve reason: lower_priority
R3=$(api POST /api/problems '{"title":"Lower priority problem"}')
LP_ID=$(jval "$R3" "['id']")
R3=$(api PUT "/api/problems/$LP_ID/archive" '{"shelve_reason":"lower_priority"}')
assert_eq "lower_priority" "$(jval "$R3" "['shelve_reason']")" "Shelve reason=lower_priority"

# Shelve with default reason (backward compat)
R4=$(api POST /api/problems '{"title":"Default shelve"}')
DS_ID=$(jval "$R4" "['id']")
R4=$(api PUT "/api/problems/$DS_ID/archive" '{}')
assert_eq "shelved" "$(jval "$R4" "['status']")" "Shelve with empty body works"

# ─────────────────────────────────────────────────────────────
section "SECTION 11: CRISIS DETECTION"
# ─────────────────────────────────────────────────────────────

# Non-crisis problem
R=$(api POST /api/problems '{"title":"Normal career question","emotional_state":"confused"}')
NC_ID=$(jval "$R" "['id']")
R=$(api GET "/api/problems/$NC_ID/crisis-check")
assert_eq "False" "$(jval "$R" "['is_crisis']")" "Normal problem is not crisis"

# Crisis via emotional combo (numb + ashamed + sad)
R=$(api POST /api/problems '{"title":"Feeling terrible","emotional_state":"numb,ashamed,sad"}')
CE_ID=$(jval "$R" "['id']")
R=$(api GET "/api/problems/$CE_ID/crisis-check")
assert_eq "True" "$(jval "$R" "['is_crisis']")" "numb+ashamed+sad triggers crisis"
TRIGGERS=$(jlen "$R" "['triggers']")
assert_ge "$TRIGGERS" "1" "Crisis has triggers"

# Crisis via keyword in description
R=$(api POST /api/problems '{"title":"Hard times","description":"I feel like giving up. Everything seems hopeless and I wonder about ending it all.","emotional_state":"sad"}')
CK_ID=$(jval "$R" "['id']")
R=$(api GET "/api/problems/$CK_ID/crisis-check")
assert_eq "True" "$(jval "$R" "['is_crisis']")" "Crisis keyword in description triggers"

# Crisis check response structure
HAS_TRIGGERS=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print('triggers' in d)" 2>/dev/null)
HAS_RESOURCES=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print('resources' in d)" 2>/dev/null)
assert_eq "True" "$HAS_TRIGGERS" "Crisis response has triggers"
assert_eq "True" "$HAS_RESOURCES" "Crisis response has resources"

# Crisis with scared+numb+sad combo
R=$(api POST /api/problems '{"title":"Bad combo","emotional_state":"scared,numb,sad"}')
CB_ID=$(jval "$R" "['id']")
R=$(api GET "/api/problems/$CB_ID/crisis-check")
assert_eq "True" "$(jval "$R" "['is_crisis']")" "scared+numb+sad triggers crisis"

# Non-crisis positive emotions
R=$(api POST /api/problems '{"title":"Positive","emotional_state":"hopeful,confident"}')
POS_ID=$(jval "$R" "['id']")
R=$(api GET "/api/problems/$POS_ID/crisis-check")
assert_eq "False" "$(jval "$R" "['is_crisis']")" "Positive emotions don't trigger crisis"

# Crisis check on non-existent problem
S=$(api_status GET /api/problems/999999/crisis-check)
assert_eq "404" "$S" "Crisis check non-existent → 404"

# ─────────────────────────────────────────────────────────────
section "SECTION 12: DORMANT PROBLEMS DETECTION"
# ─────────────────────────────────────────────────────────────

# All recently created, none should be dormant
R=$(api GET "/api/problems/dormant?days=7")
assert_eq "0" "$(jlen "$R" '')" "No dormant problems (all recent)"

# Dormant with days=0 should catch all active
R=$(api GET "/api/problems/dormant?days=0")
DOR_LEN=$(jlen "$R" '')
assert_ge "$DOR_LEN" "1" "days=0 finds recently-active as dormant"

# Default days parameter
R=$(api GET "/api/problems/dormant")
# Should work with default value
S=$(api_status GET /api/problems/dormant)
assert_eq "200" "$S" "Dormant endpoint with default days=200"

# ─────────────────────────────────────────────────────────────
section "SECTION 13: PATTERN DETECTION"
# ─────────────────────────────────────────────────────────────

R=$(api GET /api/problems/patterns)

# Check structure
HAS_CAT_FREQ=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print('category_frequency' in d)" 2>/dev/null)
HAS_EMO_FREQ=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print('emotional_frequency' in d)" 2>/dev/null)
HAS_INSIGHTS=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print('insights' in d)" 2>/dev/null)
HAS_STUCK=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print('stuck_phases' in d)" 2>/dev/null)
HAS_RESOLUTION=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print('resolution_rate' in d)" 2>/dev/null)
HAS_RECURRING=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print('recurring_emotions' in d)" 2>/dev/null)
assert_eq "True" "$HAS_CAT_FREQ" "Patterns has category_frequency"
assert_eq "True" "$HAS_EMO_FREQ" "Patterns has emotional_frequency"
assert_eq "True" "$HAS_INSIGHTS" "Patterns has insights"
assert_eq "True" "$HAS_STUCK" "Patterns has stuck_phases"
assert_eq "True" "$HAS_RESOLUTION" "Patterns has resolution_rate"
assert_eq "True" "$HAS_RECURRING" "Patterns has recurring_emotions"

# Verify category frequency has data (we created many problems)
CAT_LEN=$(jlen "$R" "['category_frequency']")
assert_ge "$CAT_LEN" "1" "Category frequency has entries"

# Verify emotional frequency has data
EMO_LEN=$(jlen "$R" "['emotional_frequency']")
assert_ge "$EMO_LEN" "1" "Emotional frequency has entries"

# Check insights are generated
INSIGHT_LEN=$(jlen "$R" "['insights']")
assert_ge "$INSIGHT_LEN" "1" "Auto-generated insights exist"

# ─────────────────────────────────────────────────────────────
section "SECTION 14: GDPR HARD DELETE (CASCADE)"
# ─────────────────────────────────────────────────────────────

# Create a fully-loaded problem with all sub-entities
R=$(api POST /api/problems '{"title":"GDPR delete target","problem_type":"decide","category":"career","emotional_state":"anxious"}')
GDPR_ID=$(jval "$R" "['id']")

# Add sub-entities
api POST "/api/problems/$GDPR_ID/reframes" '{"reframe_text":"Different perspective"}' > /dev/null
api POST "/api/problems/$GDPR_ID/options" '{"title":"Option A"}' > /dev/null
api POST "/api/problems/$GDPR_ID/options" '{"title":"Option B"}' > /dev/null
api POST "/api/problems/$GDPR_ID/journal" '{"content":"Thinking...","entry_type":"reflection"}' > /dev/null
api POST "/api/problems/$GDPR_ID/stakeholders" '{"name":"Key person","influence":"high"}' > /dev/null
# Phase transition with reflection
api PUT "/api/problems/$GDPR_ID/phase" '{"phase":"diagnose","reflection":"Understanding better"}' > /dev/null

# Verify subs exist before delete
R=$(api GET "/api/problems/$GDPR_ID")
assert_ge "$(jlen "$R" "['reframes']")" "1" "Reframes exist before delete"
assert_ge "$(jlen "$R" "['options']")" "2" "Options exist before delete"
assert_ge "$(jlen "$R" "['journal']")" "1" "Journal entries exist before delete"
assert_ge "$(jlen "$R" "['stakeholders']")" "1" "Stakeholders exist before delete"

# HARD DELETE
R=$(api DELETE "/api/problems/$GDPR_ID/permanent")
assert_eq "True" "$(jval "$R" "['ok']")" "Hard delete returns ok=true"

# Verify problem is completely gone
S=$(api_status GET "/api/problems/$GDPR_ID")
assert_eq "404" "$S" "Hard-deleted problem returns 404"

# Hard delete non-existent problem
S=$(api_status DELETE /api/problems/999999/permanent)
assert_eq "404" "$S" "Hard delete non-existent → 404"

# ─────────────────────────────────────────────────────────────
section "SECTION 15: FULL LIFECYCLE WITH PANEL FEATURES"
# ─────────────────────────────────────────────────────────────

# Simulate a complete journey using panel features
# 1. Start from template
R=$(api POST /api/problems/from-template '{"template_id":"job_decision"}')
LIFE_ID=$(jval "$R" "['id']")
assert_ne "$LIFE_ID" "" "Lifecycle: Created from job template"

# 2. Validate the framing
R=$(api PUT "/api/problems/$LIFE_ID/validate")
assert_eq "1" "$(jval "$R" "['validated']")" "Lifecycle: Validated problem"

# 3. Add personal stakeholders
api POST "/api/problems/$LIFE_ID/stakeholders" '{"name":"Partner","role":"Life partner","influence":"high","impact":"high"}' > /dev/null

# 4. Crisis check (should be clean)
R=$(api GET "/api/problems/$LIFE_ID/crisis-check")
assert_eq "False" "$(jval "$R" "['is_crisis']")" "Lifecycle: Not a crisis"

# 5. Progress with reflections
R=$(api PUT "/api/problems/$LIFE_ID/phase" '{"phase":"diagnose","reflection":"The real issue is growth opportunity, not just money","emotional_state":"hopeful"}')
assert_eq "diagnose" "$(jval "$R" "['phase']")" "Lifecycle: Diagnosed"

R=$(api PUT "/api/problems/$LIFE_ID/phase" '{"phase":"explore","reflection":"Identified three paths: stay, negotiate, leave","emotional_state":"confident"}')
assert_eq "explore" "$(jval "$R" "['phase']")" "Lifecycle: Exploring"

# 6. Add reframes
api POST "/api/problems/$LIFE_ID/reframes" '{"reframe_text":"What if staying could mean creating a new role?"}' > /dev/null
api POST "/api/problems/$LIFE_ID/reframes" '{"reframe_text":"Growth might be possible without leaving"}' > /dev/null

# 7. Journal
api POST "/api/problems/$LIFE_ID/journal" '{"content":"Had a great talk with mentor. She suggested I consider internal transfers.","entry_type":"insight","emotional_state":"hopeful"}' > /dev/null

# 8. Decide
R=$(api PUT "/api/problems/$LIFE_ID/phase" '{"phase":"decide","reflection":"After careful analysis, I see the best path","emotional_state":"determined"}')
assert_eq "decide" "$(jval "$R" "['phase']")" "Lifecycle: Decision time"

# 9. Check transitions trace the full journey
R=$(api GET "/api/problems/$LIFE_ID/transitions")
TRANS_COUNT=$(jlen "$R" '')
assert_ge "$TRANS_COUNT" "3" "Lifecycle: 3+ transitions recorded"

# 10. Get full entity — verify all parts present
R=$(api GET "/api/problems/$LIFE_ID")
assert_ge "$(jlen "$R" "['options']")" "3" "Lifecycle: Template options present"
assert_ge "$(jlen "$R" "['stakeholders']")" "3" "Lifecycle: Stakeholders present"
assert_ge "$(jlen "$R" "['reframes']")" "2" "Lifecycle: Reframes present"
assert_ge "$(jlen "$R" "['journal']")" "1" "Lifecycle: Journal entries present"
assert_eq "1" "$(jval "$R" "['validated']")" "Lifecycle: Validated flag persists"
assert_eq "decide" "$(jval "$R" "['problem_type']")" "Lifecycle: Problem type persists"

# ─────────────────────────────────────────────────────────────
section "SECTION 16: JOURNAL ENTRY TYPES (NEW)"
# ─────────────────────────────────────────────────────────────

R=$(api POST /api/problems '{"title":"Journal type test"}')
JT_ID=$(jval "$R" "['id']")

# Test new entry types
R=$(api POST "/api/problems/$JT_ID/journal" '{"content":"Phase transition note","entry_type":"phase_transition"}')
assert_eq "phase_transition" "$(jval "$R" "['entry_type']")" "phase_transition entry type"

R=$(api POST "/api/problems/$JT_ID/journal" '{"content":"My core values are...","entry_type":"values_clarification"}')
assert_eq "values_clarification" "$(jval "$R" "['entry_type']")" "values_clarification entry type"

# ─────────────────────────────────────────────────────────────
section "SECTION 17: FULL ENTITY INCLUDES NEW FIELDS"
# ─────────────────────────────────────────────────────────────

R=$(api GET "/api/problems/$LIFE_ID")
HAS_PTYPE=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print('problem_type' in d)" 2>/dev/null)
HAS_VALIDATED=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print('validated' in d)" 2>/dev/null)
HAS_STAKEHOLDERS=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print('stakeholders' in d)" 2>/dev/null)
HAS_TRANSITIONS=$(echo "$R" | python3 -c "import sys,json; d=json.load(sys.stdin); print('transitions' in d)" 2>/dev/null)
assert_eq "True" "$HAS_PTYPE" "Full entity has problem_type"
assert_eq "True" "$HAS_VALIDATED" "Full entity has validated"
assert_eq "True" "$HAS_STAKEHOLDERS" "Full entity has stakeholders"
assert_eq "True" "$HAS_TRANSITIONS" "Full entity has transitions"

# ═══════════════════════════════════════════════════════════════
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  TEST RESULTS                                               ║"
echo "╠══════════════════════════════════════════════════════════════╣"
printf "║  PASSED: %-47s ║\n" "$PASS"
printf "║  FAILED: %-47s ║\n" "$FAIL"
printf "║  TOTAL:  %-47s ║\n" "$TOTAL"
echo "╚══════════════════════════════════════════════════════════════╝"

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "SOME TESTS FAILED — see above for details"
  exit 1
fi
