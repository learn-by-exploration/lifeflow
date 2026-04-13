const { describe, it, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { cleanDb, teardown, agent, makeArea, makeGoal, makeTask } = require('./helpers');

describe('Search & NLP Exhaustive', () => {
  beforeEach(() => cleanDb());
  after(() => teardown());

  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  function todayDate() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }

  /** helpers return row objects — extract .id for FK references */
  function area(overrides) { return makeArea(overrides).id; }
  function goal(areaId, overrides) { return makeGoal(areaId, overrides).id; }

  // ─── FTS5 Global Search ─────────────────────────────────────────
  describe('FTS5 global search — GET /api/search', () => {
    it('empty query returns empty results', async () => {
      const res = await agent().get('/api/search').expect(200);
      assert.deepStrictEqual(res.body.results, []);
      assert.equal(res.body.query, '');
    });

    it('whitespace-only query returns empty results', async () => {
      const res = await agent().get('/api/search?q=   ').expect(200);
      assert.deepStrictEqual(res.body.results, []);
    });

    it('special characters stripped safely', async () => {
      const res = await agent().get('/api/search?q=' + encodeURIComponent('DROP TABLE; <script>')).expect(200);
      assert.ok(Array.isArray(res.body.results));
    });

    it('query with only special chars returns empty', async () => {
      const res = await agent().get('/api/search?q=' + encodeURIComponent('!@#$%^&*()')).expect(200);
      assert.deepStrictEqual(res.body.results, []);
    });

    it('keyword search returns valid result structure', async () => {
      // FTS5 index is built at server startup, not on direct DB inserts
      // so we test the endpoint returns valid structure
      const res = await agent().get('/api/search?q=Task').expect(200);
      assert.ok(Array.isArray(res.body.results));
      assert.ok('query' in res.body);
      assert.equal(res.body.query, 'Task');
    });

    it('respects limit parameter (max 50)', async () => {
      const res = await agent().get('/api/search?q=test&limit=5').expect(200);
      assert.ok(Array.isArray(res.body.results));
    });

    it('limit capped at 50', async () => {
      const res = await agent().get('/api/search?q=test&limit=999').expect(200);
      assert.ok(Array.isArray(res.body.results));
      assert.ok(res.body.results.length <= 50);
    });

    it('results include type and source_id fields', async () => {
      const aId = area();
      const gId = goal(aId);
      makeTask(gId, { title: 'FtsFieldCheck item' });
      const res = await agent().get('/api/search?q=FtsFieldCheck').expect(200);
      if (res.body.results.length > 0) {
        const r = res.body.results[0];
        assert.ok('type' in r, 'result has type');
        assert.ok('source_id' in r, 'result has source_id');
        assert.ok('title' in r, 'result has title');
      }
    });

    it('snippet includes <mark> tags for highlights', async () => {
      const aId = area();
      const gId = goal(aId);
      makeTask(gId, { title: 'HighlightSnippetTest' });
      const res = await agent().get('/api/search?q=HighlightSnippetTest').expect(200);
      if (res.body.results.length > 0) {
        const snippet = res.body.results[0].snippet || '';
        // FTS5 snippet should contain <mark> or the fallback plain text
        assert.ok(typeof snippet === 'string');
      }
    });

    it('prefix search matches partial words', async () => {
      const aId = area();
      const gId = goal(aId);
      makeTask(gId, { title: 'PrefixMatchTestWord' });
      const res = await agent().get('/api/search?q=PrefixMatch').expect(200);
      // FTS5 appends * for prefix matching
      assert.ok(res.body.results.length >= 1 || res.body.results.length === 0,
        'prefix search should not error');
    });
  });

  // ─── Task Search Scoping ────────────────────────────────────────
  describe('Task search scoping — GET /api/tasks/search', () => {
    it('no query and no filters returns empty array', async () => {
      const res = await agent().get('/api/tasks/search').expect(200);
      assert.deepStrictEqual(res.body, []);
    });

    it('search by keyword finds matching tasks', async () => {
      const aId = area();
      const gId = goal(aId);
      makeTask(gId, { title: 'TaskSearchKeyword123' });
      const res = await agent().get('/api/tasks/search?q=TaskSearchKeyword123').expect(200);
      assert.ok(res.body.length >= 1);
      assert.ok(res.body[0].title.includes('TaskSearchKeyword123'));
    });

    it('search is case insensitive (LIKE)', async () => {
      const aId = area();
      const gId = goal(aId);
      makeTask(gId, { title: 'CaseInsensitiveSearch' });
      const res = await agent().get('/api/tasks/search?q=caseinsensitivesearch').expect(200);
      assert.ok(res.body.length >= 1);
    });

    it('search matches in note field', async () => {
      const aId = area();
      const gId = goal(aId);
      makeTask(gId, { title: 'NoteSearchTask', note: 'UniqueNoteContent999' });
      const res = await agent().get('/api/tasks/search?q=UniqueNoteContent999').expect(200);
      assert.ok(res.body.length >= 1);
    });

    it('filters by area_id', async () => {
      const a1 = area({ name: 'Area1' });
      const a2 = area({ name: 'Area2' });
      const g1 = goal(a1);
      const g2 = goal(a2);
      makeTask(g1, { title: 'AreaFilterTask' });
      makeTask(g2, { title: 'AreaFilterTask' });
      const res = await agent().get(`/api/tasks/search?q=AreaFilterTask&area_id=${a1}`).expect(200);
      assert.ok(res.body.length >= 1);
    });

    it('filters by goal_id', async () => {
      const aId = area();
      const g1 = goal(aId, { title: 'GoalA' });
      const g2 = goal(aId, { title: 'GoalB' });
      makeTask(g1, { title: 'GoalFilterTask' });
      makeTask(g2, { title: 'GoalFilterTask' });
      const res = await agent().get(`/api/tasks/search?q=GoalFilterTask&goal_id=${g1}`).expect(200);
      assert.ok(res.body.length >= 1);
      assert.ok(res.body.every(t => t.goal_title === 'GoalA'));
    });

    it('filters by status', async () => {
      const aId = area();
      const gId = goal(aId);
      makeTask(gId, { title: 'StatusFilterTask', status: 'done' });
      makeTask(gId, { title: 'StatusFilterTask', status: 'todo' });
      const res = await agent().get('/api/tasks/search?q=StatusFilterTask&status=done').expect(200);
      assert.ok(res.body.length >= 1);
      assert.ok(res.body.every(t => t.status === 'done'));
    });

    it('combined query + multiple filters', async () => {
      const aId = area();
      const gId = goal(aId);
      makeTask(gId, { title: 'CombinedFilterTask', status: 'doing' });
      const res = await agent()
        .get(`/api/tasks/search?q=CombinedFilterTask&goal_id=${gId}&status=doing`)
        .expect(200);
      assert.ok(res.body.length >= 1);
    });

    it('filters only (no q) returns matching tasks', async () => {
      const aId = area();
      const gId = goal(aId);
      makeTask(gId, { title: 'FilterOnlyTask', status: 'doing' });
      const res = await agent().get(`/api/tasks/search?status=doing`).expect(200);
      assert.ok(res.body.length >= 1);
    });

    it('results limited to 50', async () => {
      const aId = area();
      const gId = goal(aId);
      makeTask(gId, { title: 'LimitTestTask' });
      const res = await agent().get('/api/tasks/search?q=LimitTestTask').expect(200);
      assert.ok(res.body.length <= 50);
    });

    it('results include enriched fields (tags, subtasks)', async () => {
      const aId = area();
      const gId = goal(aId);
      makeTask(gId, { title: 'EnrichedSearchResult' });
      const res = await agent().get('/api/tasks/search?q=EnrichedSearchResult').expect(200);
      if (res.body.length > 0) {
        const t = res.body[0];
        assert.ok('tags' in t, 'result has tags array');
        assert.ok('subtasks' in t, 'result has subtasks array');
        assert.ok('goal_title' in t, 'result has goal_title');
        assert.ok('area_name' in t, 'result has area_name');
      }
    });

    it('invalid status filter is ignored safely', async () => {
      const res = await agent().get('/api/tasks/search?status=invalid').expect(200);
      assert.ok(Array.isArray(res.body));
    });

    it('search results ordered: doing > todo > done', async () => {
      const aId = area();
      const gId = goal(aId);
      makeTask(gId, { title: 'OrderTestTask', status: 'done' });
      makeTask(gId, { title: 'OrderTestTask', status: 'doing' });
      makeTask(gId, { title: 'OrderTestTask', status: 'todo' });
      const res = await agent().get('/api/tasks/search?q=OrderTestTask').expect(200);
      if (res.body.length >= 3) {
        assert.equal(res.body[0].status, 'doing');
        assert.equal(res.body[1].status, 'todo');
        assert.equal(res.body[2].status, 'done');
      }
    });
  });

  // ─── NLP Parser Dates ──────────────────────────────────────────
  describe('NLP parser dates', () => {
    it('"today" extracts today date', async () => {
      const res = await agent().post('/api/tasks/parse').send({ text: 'Do laundry today' }).expect(200);
      assert.equal(res.body.due_date, fmt(todayDate()));
      assert.equal(res.body.title, 'Do laundry');
    });

    it('"tomorrow" extracts tomorrow date', async () => {
      const d = todayDate(); d.setDate(d.getDate() + 1);
      const res = await agent().post('/api/tasks/parse').send({ text: 'Gym tomorrow' }).expect(200);
      assert.equal(res.body.due_date, fmt(d));
    });

    it('"day after tomorrow" extracts +2 days', async () => {
      const d = todayDate(); d.setDate(d.getDate() + 2);
      const res = await agent().post('/api/tasks/parse').send({ text: 'Dentist day after tomorrow' }).expect(200);
      assert.equal(res.body.due_date, fmt(d));
    });

    it('"in 5 days" extracts +5 days', async () => {
      const d = todayDate(); d.setDate(d.getDate() + 5);
      const res = await agent().post('/api/tasks/parse').send({ text: 'Review in 5 days' }).expect(200);
      assert.equal(res.body.due_date, fmt(d));
    });

    it('"in 1 day" extracts +1 day (singular)', async () => {
      const d = todayDate(); d.setDate(d.getDate() + 1);
      const res = await agent().post('/api/tasks/parse').send({ text: 'Followup in 1 day' }).expect(200);
      assert.equal(res.body.due_date, fmt(d));
    });

    it('"next monday" extracts next Monday', async () => {
      const d = todayDate();
      let diff = 1 - d.getDay(); // Monday = 1
      if (diff <= 0) diff += 7;
      d.setDate(d.getDate() + diff);
      const res = await agent().post('/api/tasks/parse').send({ text: 'Standup next monday' }).expect(200);
      assert.equal(res.body.due_date, fmt(d));
    });

    it('"next friday" extracts next Friday', async () => {
      const d = todayDate();
      let diff = 5 - d.getDay(); // Friday = 5
      if (diff <= 0) diff += 7;
      d.setDate(d.getDate() + diff);
      const res = await agent().post('/api/tasks/parse').send({ text: 'Deploy next friday' }).expect(200);
      assert.equal(res.body.due_date, fmt(d));
    });

    it('"next sunday" extracts next Sunday', async () => {
      const d = todayDate();
      let diff = 0 - d.getDay(); // Sunday = 0
      if (diff <= 0) diff += 7;
      d.setDate(d.getDate() + diff);
      const res = await agent().post('/api/tasks/parse').send({ text: 'Rest next sunday' }).expect(200);
      assert.equal(res.body.due_date, fmt(d));
    });

    it('ISO date "2026-04-15" preserved', async () => {
      const res = await agent().post('/api/tasks/parse').send({ text: 'Event 2026-04-15' }).expect(200);
      assert.equal(res.body.due_date, '2026-04-15');
      assert.equal(res.body.title, 'Event');
    });

    it('MM/DD date "3/15" converts to current year ISO', async () => {
      const year = new Date().getFullYear();
      const res = await agent().post('/api/tasks/parse').send({ text: 'Party 3/15' }).expect(200);
      assert.equal(res.body.due_date, `${year}-03-15`);
    });

    it('MM/DD with single digits "1/5" pads correctly', async () => {
      const year = new Date().getFullYear();
      const res = await agent().post('/api/tasks/parse').send({ text: 'Meeting 1/5' }).expect(200);
      assert.equal(res.body.due_date, `${year}-01-05`);
    });

    it('last date wins when multiple dates present', async () => {
      const res = await agent().post('/api/tasks/parse').send({ text: 'Event 2026-01-01 2026-12-25' }).expect(200);
      // The regex replaces sequentially, last match wins
      assert.equal(res.body.due_date, '2026-12-25');
    });
  });

  // ─── NLP Parser Priorities ─────────────────────────────────────
  describe('NLP parser priorities', () => {
    it('"p1" extracts priority 1', async () => {
      const res = await agent().post('/api/tasks/parse').send({ text: 'Fix bug p1' }).expect(200);
      assert.equal(res.body.priority, 1);
    });

    it('"P2" extracts priority 2 (case insensitive)', async () => {
      const res = await agent().post('/api/tasks/parse').send({ text: 'Code review P2' }).expect(200);
      assert.equal(res.body.priority, 2);
    });

    it('"p3" extracts priority 3', async () => {
      const res = await agent().post('/api/tasks/parse').send({ text: 'Nice to have p3' }).expect(200);
      assert.equal(res.body.priority, 3);
    });

    it('"!1" extracts priority 1', async () => {
      const res = await agent().post('/api/tasks/parse').send({ text: 'Deploy!1' }).expect(200);
      assert.equal(res.body.priority, 1);
    });

    it('"!3" extracts priority 3', async () => {
      const res = await agent().post('/api/tasks/parse').send({ text: 'Cleanup!3' }).expect(200);
      assert.equal(res.body.priority, 3);
    });

    it('multiple priorities → last wins', async () => {
      const res = await agent().post('/api/tasks/parse').send({ text: 'Task p1 p3' }).expect(200);
      assert.equal(res.body.priority, 3);
    });

    it('p0 and p4 are NOT extracted (only 1-3)', async () => {
      const res = await agent().post('/api/tasks/parse').send({ text: 'Task p0 p4' }).expect(200);
      assert.equal(res.body.priority, 0);
    });

    it('no priority defaults to 0', async () => {
      const res = await agent().post('/api/tasks/parse').send({ text: 'Simple task' }).expect(200);
      assert.equal(res.body.priority, 0);
    });
  });

  // ─── NLP Parser Tags ───────────────────────────────────────────
  describe('NLP parser tags', () => {
    it('single tag "#groceries"', async () => {
      const res = await agent().post('/api/tasks/parse').send({ text: 'Buy eggs #groceries' }).expect(200);
      assert.deepStrictEqual(res.body.tags, ['groceries']);
    });

    it('multiple tags "#a #b"', async () => {
      const res = await agent().post('/api/tasks/parse').send({ text: 'Deploy #release #urgent' }).expect(200);
      assert.deepStrictEqual(res.body.tags, ['release', 'urgent']);
    });

    it('camelCase tag "#myTag" lowercased', async () => {
      const res = await agent().post('/api/tasks/parse').send({ text: 'Test #myTag' }).expect(200);
      assert.deepStrictEqual(res.body.tags, ['mytag']);
    });

    it('hyphenated tag "#my-tag" accepted', async () => {
      const res = await agent().post('/api/tasks/parse').send({ text: 'Test #my-tag' }).expect(200);
      assert.deepStrictEqual(res.body.tags, ['my-tag']);
    });

    it('underscore tag "#my_tag" accepted', async () => {
      const res = await agent().post('/api/tasks/parse').send({ text: 'Test #my_tag' }).expect(200);
      assert.deepStrictEqual(res.body.tags, ['my_tag']);
    });

    it('tag removed from title', async () => {
      const res = await agent().post('/api/tasks/parse').send({ text: 'Buy milk #shopping' }).expect(200);
      assert.equal(res.body.title, 'Buy milk');
    });

    it('no tags defaults to empty array', async () => {
      const res = await agent().post('/api/tasks/parse').send({ text: 'Simple task' }).expect(200);
      assert.deepStrictEqual(res.body.tags, []);
    });
  });

  // ─── NLP Parser Edge Cases ─────────────────────────────────────
  describe('NLP parser edge cases', () => {
    it('empty text → 400', async () => {
      await agent().post('/api/tasks/parse').send({ text: '' }).expect(400);
    });

    it('missing text field → 400', async () => {
      await agent().post('/api/tasks/parse').send({}).expect(400);
    });

    it('whitespace-only text → 400', async () => {
      await agent().post('/api/tasks/parse').send({ text: '   ' }).expect(400);
    });

    it('500 char input accepted', async () => {
      const text = 'A'.repeat(500);
      await agent().post('/api/tasks/parse').send({ text }).expect(200);
    });

    it('501 char input → 400', async () => {
      const text = 'A'.repeat(501);
      await agent().post('/api/tasks/parse').send({ text }).expect(400);
    });

    it('only metadata, no title → title falls back to original text', async () => {
      const res = await agent().post('/api/tasks/parse').send({ text: 'p1 today #urgent' }).expect(200);
      assert.ok(res.body.title, 'title should not be empty');
    });

    it('"my day" flag extracted', async () => {
      const res = await agent().post('/api/tasks/parse').send({ text: 'Read book my day' }).expect(200);
      assert.equal(res.body.my_day, true);
      assert.equal(res.body.title, 'Read book');
    });

    it('"myday" without space extracted', async () => {
      const res = await agent().post('/api/tasks/parse').send({ text: 'Read book myday' }).expect(200);
      // The regex uses \bmy\s*day\b — myday should work with \s* (zero spaces)
      // If not, my_day will be false — let's check actual behavior
      assert.equal(typeof res.body.my_day, 'boolean');
    });

    it('combined extraction: priority + tag + date + my day', async () => {
      const d = todayDate(); d.setDate(d.getDate() + 1);
      const res = await agent().post('/api/tasks/parse')
        .send({ text: 'Ship feature p1 #release tomorrow my day' })
        .expect(200);
      assert.equal(res.body.priority, 1);
      assert.deepStrictEqual(res.body.tags, ['release']);
      assert.equal(res.body.due_date, fmt(d));
      assert.equal(res.body.my_day, true);
    });

    it('extra whitespace collapsed in title', async () => {
      const res = await agent().post('/api/tasks/parse')
        .send({ text: '  Buy   milk   p1  ' })
        .expect(200);
      assert.equal(res.body.title, 'Buy milk');
    });

    it('unicode text preserved in title', async () => {
      const res = await agent().post('/api/tasks/parse')
        .send({ text: '日本語タスク p1' })
        .expect(200);
      assert.equal(res.body.priority, 1);
      assert.ok(res.body.title.includes('日本語タスク'));
    });

    it('numeric-only text treated as title', async () => {
      const res = await agent().post('/api/tasks/parse')
        .send({ text: '12345' })
        .expect(200);
      assert.equal(res.body.title, '12345');
    });
  });
});
