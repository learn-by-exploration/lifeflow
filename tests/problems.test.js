const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, cleanDb, teardown, makeProblem, makeTag, agent } = require('./helpers');

let db;

before(() => {
  const env = setup();
  db = env.db;
});
after(() => teardown());

describe('Problems API', () => {
  beforeEach(() => cleanDb());

  // ─── CRUD ───

  describe('GET /api/problems', () => {
    it('returns empty array when no problems exist', async () => {
      const res = await agent().get('/api/problems').expect(200);
      assert.deepStrictEqual(res.body.data, []);
      assert.equal(res.body.pagination.total, 0);
    });

    it('returns created problems with pagination', async () => {
      makeProblem({ title: 'Problem A' });
      makeProblem({ title: 'Problem B' });
      const res = await agent().get('/api/problems').expect(200);
      assert.equal(res.body.data.length, 2);
      assert.equal(res.body.pagination.total, 2);
    });

    it('filters by phase', async () => {
      makeProblem({ title: 'A', phase: 'capture' });
      makeProblem({ title: 'B', phase: 'diagnose' });
      const res = await agent().get('/api/problems?phase=capture').expect(200);
      assert.equal(res.body.data.length, 1);
      assert.equal(res.body.data[0].title, 'A');
    });

    it('filters by category', async () => {
      makeProblem({ title: 'A', category: 'health' });
      makeProblem({ title: 'B', category: 'career' });
      const res = await agent().get('/api/problems?category=health').expect(200);
      assert.equal(res.body.data.length, 1);
      assert.equal(res.body.data[0].title, 'A');
    });

    it('searches by title substring', async () => {
      makeProblem({ title: 'Find this one' });
      makeProblem({ title: 'Unrelated' });
      const res = await agent().get('/api/problems?search=find').expect(200);
      assert.equal(res.body.data.length, 1);
      assert.equal(res.body.data[0].title, 'Find this one');
    });

    it('paginates with limit and offset', async () => {
      makeProblem({ title: 'A' });
      makeProblem({ title: 'B' });
      makeProblem({ title: 'C' });
      const res = await agent().get('/api/problems?limit=2&page=2').expect(200);
      assert.equal(res.body.data.length, 1);
      assert.equal(res.body.pagination.total, 3);
    });
  });

  describe('POST /api/problems', () => {
    it('creates a problem with minimal fields', async () => {
      const res = await agent()
        .post('/api/problems')
        .send({ title: 'My Problem' })
        .expect(201);
      assert.equal(res.body.title, 'My Problem');
      assert.equal(res.body.phase, 'capture');
      assert.equal(res.body.status, 'active');
      assert.ok(res.body.id);
    });

    it('creates a problem with all fields', async () => {
      const res = await agent()
        .post('/api/problems')
        .send({
          title: 'Full Problem',
          description: 'Detailed desc',
          category: 'career',
          urgency: 3,
          importance: 2,
          emotional_state: 'anxious',
          privacy_level: 'private',
          stakeholders: 'Team,Boss',
          deadline: '2025-12-31'
        })
        .expect(201);
      assert.equal(res.body.title, 'Full Problem');
      assert.equal(res.body.category, 'career');
      assert.equal(res.body.urgency, 3);
    });

    it('returns 400 when title is missing', async () => {
      await agent().post('/api/problems').send({}).expect(400);
    });

    it('returns 400 when title is empty string', async () => {
      await agent().post('/api/problems').send({ title: '' }).expect(400);
    });
  });

  describe('GET /api/problems/:id', () => {
    it('returns full problem with sub-entities', async () => {
      const p = makeProblem({ title: 'Detailed' });
      const res = await agent().get(`/api/problems/${p.id}`).expect(200);
      assert.equal(res.body.title, 'Detailed');
      assert.ok(Array.isArray(res.body.reframes));
      assert.ok(Array.isArray(res.body.options));
      assert.ok(Array.isArray(res.body.journal));
      assert.ok(Array.isArray(res.body.actions));
      assert.ok(Array.isArray(res.body.tags));
      assert.ok(Array.isArray(res.body.links));
    });

    it('returns 404 for non-existent problem', async () => {
      await agent().get('/api/problems/99999').expect(404);
    });
  });

  describe('PUT /api/problems/:id', () => {
    it('updates problem fields', async () => {
      const p = makeProblem({ title: 'Old' });
      const res = await agent()
        .put(`/api/problems/${p.id}`)
        .send({ title: 'New Title', urgency: 3 })
        .expect(200);
      assert.equal(res.body.title, 'New Title');
      assert.equal(res.body.urgency, 3);
    });

    it('returns 404 for non-existent problem', async () => {
      await agent().put('/api/problems/99999').send({ title: 'X' }).expect(404);
    });
  });

  describe('DELETE /api/problems/:id', () => {
    it('soft-deletes a problem', async () => {
      const p = makeProblem({ title: 'Delete Me' });
      await agent().delete(`/api/problems/${p.id}`).expect(200);
      // Should not appear in listing
      const res = await agent().get('/api/problems').expect(200);
      assert.equal(res.body.data.length, 0);
    });

    it('returns 404 for non-existent problem', async () => {
      await agent().delete('/api/problems/99999').expect(404);
    });
  });

  // ─── Phase Transitions ───

  describe('PUT /api/problems/:id/phase', () => {
    it('changes phase', async () => {
      const p = makeProblem();
      const res = await agent()
        .put(`/api/problems/${p.id}/phase`)
        .send({ phase: 'diagnose' })
        .expect(200);
      // Verify phase was changed
      const get = await agent().get(`/api/problems/${p.id}`).expect(200);
      assert.equal(get.body.phase, 'diagnose');
    });

    it('returns 404 for non-existent problem', async () => {
      await agent()
        .put('/api/problems/99999/phase')
        .send({ phase: 'diagnose' })
        .expect(404);
    });

    it('returns 400 for invalid phase', async () => {
      const p = makeProblem();
      await agent()
        .put(`/api/problems/${p.id}/phase`)
        .send({ phase: 'nonexistent' })
        .expect(400);
    });
  });

  describe('PUT /api/problems/:id/archive', () => {
    it('archives a problem', async () => {
      const p = makeProblem();
      await agent().put(`/api/problems/${p.id}/archive`).expect(200);
      const get = await agent().get(`/api/problems/${p.id}`).expect(200);
      assert.equal(get.body.status, 'shelved');
    });
  });

  // ─── Reframes ───

  describe('Reframes sub-resource', () => {
    it('creates and lists reframes', async () => {
      const p = makeProblem();
      const create = await agent()
        .post(`/api/problems/${p.id}/reframes`)
        .send({ reframe_text: 'I am exploring options instead of being stuck' })
        .expect(201);
      assert.equal(create.body.reframe_text, 'I am exploring options instead of being stuck');

      const list = await agent()
        .get(`/api/problems/${p.id}/reframes`)
        .expect(200);
      assert.equal(list.body.length, 1);
    });

    it('deletes a reframe', async () => {
      const p = makeProblem();
      const create = await agent()
        .post(`/api/problems/${p.id}/reframes`)
        .send({ reframe_text: 'B' })
        .expect(201);
      await agent().delete(`/api/reframes/${create.body.id}`).expect(200);
      const list = await agent().get(`/api/problems/${p.id}/reframes`).expect(200);
      assert.equal(list.body.length, 0);
    });
  });

  // ─── Options ───

  describe('Options sub-resource', () => {
    it('creates and lists options', async () => {
      const p = makeProblem();
      const create = await agent()
        .post(`/api/problems/${p.id}/options`)
        .send({ title: 'Option A', description: 'Desc A' })
        .expect(201);
      assert.equal(create.body.title, 'Option A');

      const list = await agent()
        .get(`/api/problems/${p.id}/options`)
        .expect(200);
      assert.equal(list.body.length, 1);
    });

    it('updates an option with pros/cons', async () => {
      const p = makeProblem();
      const create = await agent()
        .post(`/api/problems/${p.id}/options`)
        .send({ title: 'Opt' })
        .expect(201);
      const update = await agent()
        .put(`/api/options/${create.body.id}`)
        .send({ pros: 'Fast', cons: 'Costly', effort: 4 })
        .expect(200);
      assert.equal(update.body.pros, 'Fast');
      assert.equal(update.body.cons, 'Costly');
    });

    it('deletes an option', async () => {
      const p = makeProblem();
      const create = await agent()
        .post(`/api/problems/${p.id}/options`)
        .send({ title: 'X' })
        .expect(201);
      await agent().delete(`/api/options/${create.body.id}`).expect(200);
    });
  });

  // ─── Decisions ───

  describe('Decisions sub-resource', () => {
    it('creates and retrieves a decision', async () => {
      const p = makeProblem();
      const opt = await agent()
        .post(`/api/problems/${p.id}/options`)
        .send({ title: 'Chosen' })
        .expect(201);

      const create = await agent()
        .post(`/api/problems/${p.id}/decision`)
        .send({ chosen_option_id: opt.body.id, rationale: 'Best fit' })
        .expect(201);
      assert.equal(create.body.rationale, 'Best fit');

      const get = await agent()
        .get(`/api/problems/${p.id}/decision`)
        .expect(200);
      assert.equal(get.body.rationale, 'Best fit');
    });

    it('returns null when no decision exists', async () => {
      const p = makeProblem();
      const res = await agent()
        .get(`/api/problems/${p.id}/decision`)
        .expect(200);
      assert.equal(res.body, null);
    });

    it('rejects decision with option from another problem', async () => {
      const p1 = makeProblem({ title: 'P1' });
      const p2 = makeProblem({ title: 'P2' });
      const opt = await agent()
        .post(`/api/problems/${p2.id}/options`)
        .send({ title: 'Wrong' })
        .expect(201);
      await agent()
        .post(`/api/problems/${p1.id}/decision`)
        .send({ chosen_option_id: opt.body.id, rationale: 'Bad' })
        .expect(400);
    });
  });

  // ─── Actions ───

  describe('Actions sub-resource', () => {
    it('creates and lists actions', async () => {
      const p = makeProblem();
      const create = await agent()
        .post(`/api/problems/${p.id}/actions`)
        .send({ description: 'Do something' })
        .expect(201);
      assert.equal(create.body.description, 'Do something');

      const list = await agent()
        .get(`/api/problems/${p.id}/actions`)
        .expect(200);
      assert.equal(list.body.length, 1);
    });

    it('updates an action status', async () => {
      const p = makeProblem();
      const create = await agent()
        .post(`/api/problems/${p.id}/actions`)
        .send({ description: 'Act' })
        .expect(201);
      const update = await agent()
        .put(`/api/actions/${create.body.id}`)
        .send({ status: 'done' })
        .expect(200);
      assert.equal(update.body.status, 'done');
    });

    it('deletes an action', async () => {
      const p = makeProblem();
      const create = await agent()
        .post(`/api/problems/${p.id}/actions`)
        .send({ description: 'X' })
        .expect(201);
      await agent().delete(`/api/actions/${create.body.id}`).expect(200);
    });
  });

  // ─── Journal ───

  describe('Journal sub-resource', () => {
    it('creates and lists journal entries', async () => {
      const p = makeProblem();
      const create = await agent()
        .post(`/api/problems/${p.id}/journal`)
        .send({ entry_type: 'reflection', content: 'Thinking about this...' })
        .expect(201);
      assert.equal(create.body.content, 'Thinking about this...');
      assert.equal(create.body.phase, 'capture'); // defaults to current problem phase

      const list = await agent()
        .get(`/api/problems/${p.id}/journal`)
        .expect(200);
      assert.equal(list.body.length, 1);
    });
  });

  // ─── Tags ───

  describe('Tags sub-resource', () => {
    it('adds and removes a tag', async () => {
      const p = makeProblem();
      const tag = makeTag({ name: 'urgent' });
      await agent()
        .post(`/api/problems/${p.id}/tags`)
        .send({ tag_id: tag.id })
        .expect(200);

      // Verify tag appears in full problem
      const get = await agent().get(`/api/problems/${p.id}`).expect(200);
      assert.equal(get.body.tags.length, 1);
      assert.equal(get.body.tags[0].name, 'urgent');

      // Remove tag
      await agent()
        .delete(`/api/problems/${p.id}/tags/${tag.id}`)
        .expect(200);

      const get2 = await agent().get(`/api/problems/${p.id}`).expect(200);
      assert.equal(get2.body.tags.length, 0);
    });

    it('returns 404 when adding non-existent tag', async () => {
      const p = makeProblem();
      await agent()
        .post(`/api/problems/${p.id}/tags`)
        .send({ tag_id: 99999 })
        .expect(404);
    });
  });

  // ─── Links ───

  describe('Links sub-resource', () => {
    it('creates and lists links between problems', async () => {
      const p1 = makeProblem({ title: 'Problem A' });
      const p2 = makeProblem({ title: 'Problem B' });

      const create = await agent()
        .post(`/api/problems/${p1.id}/links`)
        .send({ linked_problem_id: p2.id, link_type: 'related' })
        .expect(201);
      assert.equal(create.body.link_type, 'related');

      const list = await agent()
        .get(`/api/problems/${p1.id}/links`)
        .expect(200);
      assert.equal(list.body.length, 1);
    });

    it('rejects linking a problem to itself', async () => {
      const p = makeProblem();
      await agent()
        .post(`/api/problems/${p.id}/links`)
        .send({ linked_problem_id: p.id, link_type: 'related' })
        .expect(400);
    });

    it('rejects duplicate link', async () => {
      const p1 = makeProblem({ title: 'A' });
      const p2 = makeProblem({ title: 'B' });
      await agent()
        .post(`/api/problems/${p1.id}/links`)
        .send({ linked_problem_id: p2.id, link_type: 'related' })
        .expect(201);
      await agent()
        .post(`/api/problems/${p1.id}/links`)
        .send({ linked_problem_id: p2.id, link_type: 'related' })
        .expect(409);
    });
  });

  // ─── Stats ───

  describe('GET /api/problems/stats', () => {
    it('returns stats with phase breakdown', async () => {
      makeProblem({ phase: 'capture' });
      makeProblem({ phase: 'capture' });
      makeProblem({ phase: 'diagnose' });
      const res = await agent().get('/api/problems/stats').expect(200);
      assert.ok(res.body.by_phase);
      assert.ok(res.body.by_category);
      assert.ok(typeof res.body.total_resolved === 'number');
    });
  });

  // ─── Validation ───

  describe('Validation edge cases', () => {
    it('rejects invalid urgency value', async () => {
      await agent()
        .post('/api/problems')
        .send({ title: 'X', urgency: 5 })
        .expect(400);
    });

    it('rejects invalid phase', async () => {
      const p = makeProblem();
      await agent()
        .put(`/api/problems/${p.id}/phase`)
        .send({ phase: 'invalid' })
        .expect(400);
    });

    it('rejects invalid category', async () => {
      await agent()
        .post('/api/problems')
        .send({ title: 'X', category: 'nonexistent_category' })
        .expect(400);
    });
  });
});
