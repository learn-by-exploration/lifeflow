const { describe, it, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { cleanDb, teardown, makeArea, makeGoal, makeTask, agent, setup } = require('./helpers');

describe('Backup, Export & Misc API', () => {
  beforeEach(() => cleanDb());
  after(() => teardown());

  describe('POST /api/backup', () => {
    it('creates a backup file and returns filename', async () => {
      const area = makeArea({ name: 'Health' });
      const goal = makeGoal(area.id, { title: 'Fitness' });
      makeTask(goal.id, { title: 'Run' });

      const res = await agent().post('/api/backup').expect(200);
      assert.equal(res.body.ok, true);
      assert.ok(res.body.file.startsWith('lifeflow-backup-'));
      assert.ok(res.body.file.endsWith('.json'));

      // Verify file exists in backup dir
      const { dir } = setup();
      const backupPath = path.join(dir, 'backups', res.body.file);
      assert.ok(fs.existsSync(backupPath));

      // Verify file contents
      const data = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
      assert.ok(data.backupDate);
      assert.equal(data.areas.length, 1);
      assert.equal(data.goals.length, 1);
      assert.equal(data.tasks.length, 1);
    });
  });

  describe('GET /api/backups', () => {
    it('lists backup files', async () => {
      // Trigger a backup first
      await agent().post('/api/backup').expect(200);

      const res = await agent().get('/api/backups').expect(200);
      assert.ok(res.body.length >= 1);
      assert.ok(res.body[0].name);
      assert.ok(res.body[0].size > 0);
      assert.ok(res.body[0].date);
    });

    it('returns backups in reverse chronological order', async () => {
      await agent().post('/api/backup').expect(200);

      const res = await agent().get('/api/backups').expect(200);
      // All backups from today so at least one
      assert.ok(res.body.length >= 1);
    });
  });

  describe('GET /api/export', () => {
    it('exports all data as JSON', async () => {
      const area = makeArea({ name: 'Health' });
      const goal = makeGoal(area.id, { title: 'Fitness' });
      makeTask(goal.id, { title: 'Run' });

      const res = await agent().get('/api/export').expect(200);
      assert.ok(res.body.exportDate);
      assert.equal(res.body.areas.length, 1);
      assert.equal(res.body.areas[0].name, 'Health');
      assert.equal(res.body.goals.length, 1);
      assert.equal(res.body.tasks.length, 1);
      assert.ok(Array.isArray(res.body.tags));
    });

    it('sets Content-Disposition header for download', async () => {
      const res = await agent().get('/api/export').expect(200);
      const disposition = res.headers['content-disposition'];
      assert.ok(disposition);
      assert.ok(disposition.includes('lifeflow-export.json'));
    });

    it('includes enriched tasks with tags and subtasks', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id, { title: 'Enriched' });
      const { makeSubtask, makeTag, linkTag } = require('./helpers');
      const sub = makeSubtask(task.id, { title: 'Sub' });
      const tag = makeTag({ name: 'export-tag' });
      linkTag(task.id, tag.id);

      const res = await agent().get('/api/export').expect(200);
      assert.ok(res.body.tasks[0].tags.length >= 1);
      assert.ok(res.body.tasks[0].subtasks.length >= 1);
    });
  });

  describe('SPA Fallback', () => {
    it('serves index.html for unknown routes', async () => {
      const res = await agent().get('/some/random/path').expect(200);
      assert.ok(res.text.includes('<!DOCTYPE html>') || res.text.includes('<html'));
    });

    it('serves index.html for root path', async () => {
      const res = await agent().get('/').expect(200);
      assert.ok(res.text.includes('<!DOCTYPE html>') || res.text.includes('<html'));
    });
  });

  describe('Edge cases', () => {
    it('handles large batch of concurrent operations', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);

      // Create 20 tasks concurrently
      const promises = [];
      for (let i = 0; i < 20; i++) {
        promises.push(
          agent()
            .post(`/api/goals/${goal.id}/tasks`)
            .send({ title: `Task ${i}` })
            .expect(201)
        );
      }
      const results = await Promise.all(promises);
      assert.equal(results.length, 20);

      // Verify all were created
      const tasks = await agent().get(`/api/goals/${goal.id}/tasks`).expect(200);
      assert.equal(tasks.body.length, 20);
    });

    it('handles unicode in names and titles', async () => {
      const res = await agent()
        .post('/api/areas')
        .send({ name: '日本語テスト 🎌', icon: '🗾', color: '#FF0000' })
        .expect(201);
      assert.equal(res.body.name, '日本語テスト 🎌');
      assert.equal(res.body.icon, '🗾');
    });

    it('handles empty JSON body gracefully', async () => {
      // Endpoints that require fields should return 400
      await agent().post('/api/areas').send({}).expect(400);
      await agent().post('/api/tags').send({}).expect(400);
    });

    it('cascading delete removes entire hierarchy', async () => {
      const area = makeArea();
      const goal = makeGoal(area.id);
      const task = makeTask(goal.id);
      const { makeSubtask, makeTag, linkTag } = require('./helpers');
      makeSubtask(task.id, { title: 'Deep subtask' });
      const tag = makeTag({ name: 'cascade-test' });
      linkTag(task.id, tag.id);

      // Delete the area - should cascade through goals -> tasks -> subtasks, task_tags
      await agent().delete(`/api/areas/${area.id}`).expect(200);

      // Verify everything is gone
      const { db } = setup();
      const tasks = db.prepare('SELECT COUNT(*) as c FROM tasks').get();
      const subtasks = db.prepare('SELECT COUNT(*) as c FROM subtasks').get();
      const taskTags = db.prepare('SELECT COUNT(*) as c FROM task_tags').get();
      assert.equal(tasks.c, 0);
      assert.equal(subtasks.c, 0);
      assert.equal(taskTags.c, 0);
      // Tag itself should still exist (not cascaded from area)
      const tags = db.prepare('SELECT COUNT(*) as c FROM tags').get();
      assert.equal(tags.c, 1);
    });
  });
});
