const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { setup, cleanDb, teardown, agent, makeArea, makeGoal, makeTask, makeTag, linkTag } = require('./helpers');

describe('SQL Safety', () => {
  let area, goal;

  before(() => setup());
  beforeEach(() => {
    cleanDb();
    area = makeArea();
    goal = makeGoal(area.id);
  });
  after(() => teardown());

  // ═══════════════════════════════════════════════════════════
  // SQL Injection Resistance — Parameterized Queries
  // ═══════════════════════════════════════════════════════════

  it('SQL injection in task title: stored as literal string', async () => {
    const sqli = "'; DROP TABLE tasks; --";
    const res = await agent().post(`/api/goals/${goal.id}/tasks`).send({ title: sqli });
    assert.equal(res.status, 201);
    assert.equal(res.body.title, sqli);
    // Verify tasks table still works
    const check = await agent().get('/api/tasks/all');
    assert.equal(check.status, 200);
    assert.ok(Array.isArray(check.body));
    assert.equal(check.body.length, 1);
    assert.equal(check.body[0].title, sqli);
  });

  it('SQL injection in area name: stored as literal string', async () => {
    const sqli = "Test'; DELETE FROM life_areas WHERE '1'='1";
    const res = await agent().post('/api/areas').send({ name: sqli, icon: '🧪', color: '#FF0000' });
    assert.equal(res.status, 201);
    assert.equal(res.body.name, sqli);
    // Verify areas still exist
    const check = await agent().get('/api/areas');
    assert.equal(check.status, 200);
    assert.ok(check.body.length >= 2); // original + injected
  });

  it('SQL injection in tag name: stored as literal string', async () => {
    const sqli = "'; DROP TABLE tags; --";
    const res = await agent().post('/api/tags').send({ name: sqli });
    assert.equal(res.status, 201);
    // Tag name may be normalized (trimmed, lowercased, etc) but is stored safely
    assert.ok(res.body.name);
    assert.ok(res.body.id);
    // Verify tags table still works (DROP TABLE had no effect)
    const check = await agent().get('/api/tags');
    assert.equal(check.status, 200);
    assert.ok(check.body.length >= 1);
  });

  it('SQL injection in search query: no data leak', async () => {
    // Create a task belonging to the user
    makeTask(goal.id, { title: 'Normal Task' });
    // Try to inject via search
    const sqli = "' OR '1'='1' --";
    const res = await agent().get('/api/tasks/search').query({ q: sqli });
    assert.equal(res.status, 200);
    // Should not return anything since the search looks for LIKE match of the literal string
    assert.ok(Array.isArray(res.body));
    // The injection string doesn't match any real task title
    assert.equal(res.body.length, 0);
  });

  it('SQL injection in note content: stored as literal string', async () => {
    const sqli = "content'); DROP TABLE notes; --";
    const res = await agent().post('/api/notes').send({ title: 'Test Note', content: sqli });
    assert.equal(res.status, 201);
    assert.equal(res.body.content, sqli);
    // Verify notes table still works
    const check = await agent().get('/api/notes');
    assert.equal(check.status, 200);
    assert.ok(check.body.some(n => n.content === sqli));
  });

  it('SQL injection in comment text: stored as literal string', async () => {
    const task = makeTask(goal.id, { title: 'Task' });
    const sqli = "comment'); DELETE FROM task_comments; --";
    const res = await agent().post(`/api/tasks/${task.id}/comments`).send({ text: sqli });
    assert.equal(res.status, 201);
    assert.equal(res.body.text, sqli);
    // Verify comments still work
    const check = await agent().get(`/api/tasks/${task.id}/comments`);
    assert.equal(check.status, 200);
    assert.equal(check.body.length, 1);
    assert.equal(check.body[0].text, sqli);
  });

  it('Union-based injection attempt returns normal response', async () => {
    makeTask(goal.id, { title: 'Legit Task' });
    const sqli = "' UNION SELECT * FROM users --";
    const res = await agent().get('/api/tasks/search').query({ q: sqli });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    // Should not contain user data
    const hasPasswordHash = res.body.some(r => r.password_hash);
    assert.equal(hasPasswordHash, false);
  });

  it('Boolean-based injection in filter returns normal response', async () => {
    makeTask(goal.id, { title: 'Task A' });
    // Try boolean injection in area_id filter param
    const res = await agent().get('/api/tasks/search').query({ q: 'Task', area_id: "1 OR 1=1" });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    // area_id is Number()-converted, so "1 OR 1=1" becomes NaN — should not match
  });

  // ═══════════════════════════════════════════════════════════
  // Query Boundaries
  // ═══════════════════════════════════════════════════════════

  it('GET /api/tasks/all returns data correctly with many tasks', async () => {
    // Create 25 tasks
    for (let i = 0; i < 25; i++) {
      makeTask(goal.id, { title: `Task ${i}` });
    }
    const res = await agent().get('/api/tasks/all');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.equal(res.body.length, 25);
  });

  it('Bulk task update limited to reasonable number', async () => {
    // Build an oversized array of 200 IDs — should be rejected
    const bigIds = Array.from({ length: 200 }, (_, i) => i + 1);
    const res = await agent().put('/api/tasks/bulk').send({ ids: bigIds, changes: { priority: 1 } });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /too many|max|limit/i);
  });

  it('Bulk my-day limited to reasonable number', async () => {
    const bigIds = Array.from({ length: 200 }, (_, i) => i + 1);
    const res = await agent().post('/api/tasks/bulk-myday').send({ ids: bigIds });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /too many|max|limit/i);
  });

  it('Search results bounded', async () => {
    // Create many tasks
    for (let i = 0; i < 60; i++) {
      makeTask(goal.id, { title: `Searchable Item ${i}` });
    }
    const res = await agent().get('/api/tasks/search').query({ q: 'Searchable' });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    // Search already has LIMIT 50
    assert.ok(res.body.length <= 50, `Search should be bounded, got ${res.body.length}`);
  });

  // ═══════════════════════════════════════════════════════════
  // Static Analysis — SQL Safety Patterns
  // ═══════════════════════════════════════════════════════════

  it('src/ files have no string concatenation for SQL', () => {
    const srcDir = path.join(__dirname, '..', 'src');
    const jsFiles = getAllJsFiles(srcDir);
    const violations = [];

    for (const file of jsFiles) {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Check for string concatenation with SQL keywords that aren't in comments
        // Allow template literals used with db.prepare (which are safe since they build static SQL)
        // Flag: "SELECT " + or 'INSERT ' + or "DELETE " + variable concatenation
        if (/(['"](?:SELECT|INSERT|UPDATE|DELETE)\s.*['"])\s*\+\s*(?!['"])/.test(line)) {
          // Check it's not a comment
          const trimmed = line.trim();
          if (!trimmed.startsWith('//') && !trimmed.startsWith('*')) {
            violations.push(`${path.relative(srcDir, file)}:${i + 1}: ${trimmed.substring(0, 80)}`);
          }
        }
      }
    }

    assert.equal(violations.length, 0,
      `Found SQL string concatenation (should use parameterized queries):\n${violations.join('\n')}`);
  });

  it('All SQL queries use ? placeholders (static analysis)', () => {
    const srcDir = path.join(__dirname, '..', 'src');
    const jsFiles = getAllJsFiles(srcDir);
    const violations = [];

    for (const file of jsFiles) {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Look for db.prepare or db.exec with dynamic content after WHERE/SET/VALUES
        // that uses ${} template substitution with user input (not table/column names)
        // Safe patterns: ${ph} (placeholder list), ${whereClause} (built from safe parts),
        //   ${table} (internal), ${scopeCol} (internal)
        const match = line.match(/db\.(prepare|exec)\s*\(\s*`[^`]*\$\{([^}]+)\}/);
        if (match) {
          const expr = match[2].trim();
          // Allow known-safe template variables used for query structure
          const safeVars = [
            'ph', 'hph', 'lph', 'aph', 'placeholders',  // placeholder lists
            'table', 'scopeCol', 'tbl',                    // internal table/column names
            'whereClause', 'where', 'whereStr',            // built from safe parts
            'sets.join', 'clauses.join', 'whereParts.join', // joined clauses
            'sets',                                         // SET clause variables
            'sql',                                          // full SQL variable
            'habitIds.map', 'taskIds.map', 'goalIds.map', 'listIds.map', // placeholder builders
          ];
          const isSafe = safeVars.some(sv => expr.includes(sv));
          if (!isSafe) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('//') && !trimmed.startsWith('*')) {
              violations.push(`${path.relative(srcDir, file)}:${i + 1}: interpolates \${${expr}}`);
            }
          }
        }
      }
    }

    assert.equal(violations.length, 0,
      `Found SQL queries with unsafe interpolation:\n${violations.join('\n')}`);
  });
});

// ─── Helper: recursively collect .js files ───
function getAllJsFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...getAllJsFiles(full));
    } else if (entry.name.endsWith('.js')) {
      results.push(full);
    }
  }
  return results;
}
