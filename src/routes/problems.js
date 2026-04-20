'use strict';

const { Router } = require('express');
const { validate } = require('../middleware/validate');
const {
  createProblem, updateProblem, updatePhase, queryProblems, archiveProblem,
  createReframe,
  createOption, updateOption,
  createDecision, updateDecision,
  createAction, updateAction,
  createJournalEntry,
  createLink, addTag,
  createStakeholder, updateStakeholder, queryDormant,
} = require('../schemas/problems.schema');
const { idParam } = require('../schemas/common.schema');
const ProblemsRepository = require('../repositories/problems.repository');
const ProblemsService = require('../services/problems.service');

module.exports = function(deps) {
  const { db } = deps;
  const router = Router();

  const repo = new ProblemsRepository(db);
  const svc = new ProblemsService(repo, deps);

  // ─── Static endpoints (MUST come before :id routes) ───

  router.get('/api/problems/emotional-clusters', (req, res) => {
    res.json(svc.getEmotionalClusters());
  });

  router.get('/api/problems/reframe-starters', (req, res) => {
    res.json(svc.getReframeStarters());
  });

  router.get('/api/problems/templates', (req, res) => {
    res.json(svc.getTemplates());
  });

  router.post('/api/problems/from-template', (req, res) => {
    const { template_id } = req.body;
    if (!template_id) return res.status(400).json({ error: 'template_id is required' });
    res.status(201).json(svc.createFromTemplate(req.userId, template_id));
  });

  router.get('/api/problems/crisis-resources', (req, res) => {
    res.json(svc.getCrisisResources());
  });

  router.get('/api/problems/dormant', validate(queryDormant, 'query'), (req, res) => {
    const days = parseInt(req.query.days, 10) || 14;
    res.json(svc.findDormant(req.userId, days));
  });

  router.get('/api/problems/patterns', (req, res) => {
    res.json(svc.detectPatterns(req.userId));
  });

  // ─── Problems CRUD ───

  router.get('/api/problems', (req, res) => {
    res.json(svc.list(req.userId, req.query));
  });

  router.get('/api/problems/stats', (req, res) => {
    res.json(svc.getStats(req.userId));
  });

  router.get('/api/problems/:id', validate(idParam, 'params'), (req, res) => {
    res.json(svc.get(req.params.id, req.userId));
  });

  router.post('/api/problems', validate(createProblem), (req, res) => {
    res.status(201).json(svc.create(req.userId, req.body));
  });

  router.put('/api/problems/:id', validate(idParam, 'params'), validate(updateProblem), (req, res) => {
    res.json(svc.update(req.params.id, req.userId, req.body));
  });

  router.delete('/api/problems/:id', validate(idParam, 'params'), (req, res) => {
    svc.remove(req.params.id, req.userId);
    res.json({ ok: true });
  });

  // ─── Phase transitions ───

  router.put('/api/problems/:id/phase', validate(idParam, 'params'), validate(updatePhase), (req, res) => {
    res.json(svc.setPhase(req.params.id, req.userId, req.body.phase, req.body.reflection, req.body.emotional_state));
  });

  router.put('/api/problems/:id/archive', validate(idParam, 'params'), validate(archiveProblem), (req, res) => {
    res.json(svc.archive(req.params.id, req.userId, req.body.shelve_reason, req.body.shelve_notes));
  });

  // ─── Crisis Check ───

  router.get('/api/problems/:id/crisis-check', validate(idParam, 'params'), (req, res) => {
    res.json(svc.checkCrisis(req.params.id, req.userId));
  });

  // ─── Validate (emotional validation before reframing) ───

  router.put('/api/problems/:id/validate', validate(idParam, 'params'), (req, res) => {
    res.json(svc.validate(req.params.id, req.userId));
  });

  // ─── Hard Delete (GDPR Article 17 — permanent cascade) ───

  router.delete('/api/problems/:id/permanent', validate(idParam, 'params'), (req, res) => {
    svc.hardDelete(req.params.id, req.userId);
    res.json({ ok: true, message: 'Problem and all related data permanently deleted' });
  });

  // ─── Reframes ───

  router.get('/api/problems/:id/reframes', validate(idParam, 'params'), (req, res) => {
    res.json(svc.listReframes(req.params.id, req.userId));
  });

  router.post('/api/problems/:id/reframes', validate(idParam, 'params'), validate(createReframe), (req, res) => {
    res.status(201).json(svc.createReframe(req.params.id, req.userId, req.body));
  });

  router.delete('/api/reframes/:id', validate(idParam, 'params'), (req, res) => {
    svc.deleteReframe(req.params.id, req.userId);
    res.json({ ok: true });
  });

  // ─── Options ───

  router.get('/api/problems/:id/options', validate(idParam, 'params'), (req, res) => {
    res.json(svc.listOptions(req.params.id, req.userId));
  });

  router.post('/api/problems/:id/options', validate(idParam, 'params'), validate(createOption), (req, res) => {
    res.status(201).json(svc.createOption(req.params.id, req.userId, req.body));
  });

  router.put('/api/options/:id', validate(idParam, 'params'), validate(updateOption), (req, res) => {
    res.json(svc.updateOption(req.params.id, req.userId, req.body));
  });

  router.delete('/api/options/:id', validate(idParam, 'params'), (req, res) => {
    svc.deleteOption(req.params.id, req.userId);
    res.json({ ok: true });
  });

  // ─── Decisions ───

  router.get('/api/problems/:id/decision', validate(idParam, 'params'), (req, res) => {
    res.json(svc.getDecision(req.params.id, req.userId));
  });

  // Accept both singular and plural
  router.get('/api/problems/:id/decisions', validate(idParam, 'params'), (req, res) => {
    res.json(svc.getDecision(req.params.id, req.userId));
  });

  router.post('/api/problems/:id/decision', validate(idParam, 'params'), validate(createDecision), (req, res) => {
    res.status(201).json(svc.createDecision(req.params.id, req.userId, req.body));
  });

  router.post('/api/problems/:id/decisions', validate(idParam, 'params'), validate(createDecision), (req, res) => {
    res.status(201).json(svc.createDecision(req.params.id, req.userId, req.body));
  });

  router.put('/api/decisions/:id', validate(idParam, 'params'), validate(updateDecision), (req, res) => {
    res.json(svc.updateDecision(req.params.id, req.userId, req.body));
  });

  // ─── Actions ───

  router.get('/api/problems/:id/actions', validate(idParam, 'params'), (req, res) => {
    res.json(svc.listActions(req.params.id, req.userId));
  });

  router.post('/api/problems/:id/actions', validate(idParam, 'params'), validate(createAction), (req, res) => {
    res.status(201).json(svc.createAction(req.params.id, req.userId, req.body));
  });

  router.put('/api/actions/:id', validate(idParam, 'params'), validate(updateAction), (req, res) => {
    res.json(svc.updateAction(req.params.id, req.userId, req.body));
  });

  router.delete('/api/actions/:id', validate(idParam, 'params'), (req, res) => {
    svc.deleteAction(req.params.id, req.userId);
    res.json({ ok: true });
  });

  // ─── Journal ───

  router.get('/api/problems/:id/journal', validate(idParam, 'params'), (req, res) => {
    res.json(svc.listJournal(req.params.id, req.userId));
  });

  router.post('/api/problems/:id/journal', validate(idParam, 'params'), validate(createJournalEntry), (req, res) => {
    res.status(201).json(svc.createJournalEntry(req.params.id, req.userId, req.body));
  });

  // ─── Tags ───

  router.post('/api/problems/:id/tags', validate(idParam, 'params'), validate(addTag), (req, res) => {
    res.json(svc.addTag(req.params.id, req.userId, req.body));
  });

  router.delete('/api/problems/:problemId/tags/:tagId', (req, res) => {
    const problemId = Number(req.params.problemId);
    const tagId = Number(req.params.tagId);
    if (!Number.isInteger(problemId) || !Number.isInteger(tagId)) {
      return res.status(400).json({ error: 'Invalid ID' });
    }
    svc.removeTag(problemId, req.userId, tagId);
    res.json({ ok: true });
  });

  // ─── Links ───

  router.get('/api/problems/:id/links', validate(idParam, 'params'), (req, res) => {
    res.json(svc.listLinks(req.params.id, req.userId));
  });

  router.post('/api/problems/:id/links', validate(idParam, 'params'), validate(createLink), (req, res) => {
    res.status(201).json(svc.createLink(req.params.id, req.userId, req.body));
  });

  router.delete('/api/links/:id', validate(idParam, 'params'), (req, res) => {
    svc.deleteLink(req.params.id, req.userId);
    res.json({ ok: true });
  });

  // ─── Stakeholders ───

  router.get('/api/problems/:id/stakeholders', validate(idParam, 'params'), (req, res) => {
    res.json(svc.listStakeholders(req.params.id, req.userId));
  });

  router.post('/api/problems/:id/stakeholders', validate(idParam, 'params'), validate(createStakeholder), (req, res) => {
    res.status(201).json(svc.createStakeholder(req.params.id, req.userId, req.body));
  });

  router.put('/api/stakeholders/:id', validate(idParam, 'params'), validate(updateStakeholder), (req, res) => {
    res.json(svc.updateStakeholder(req.params.id, req.userId, req.body));
  });

  router.delete('/api/stakeholders/:id', validate(idParam, 'params'), (req, res) => {
    svc.deleteStakeholder(req.params.id, req.userId);
    res.json({ ok: true });
  });

  // ─── Phase Transitions ───

  router.get('/api/problems/:id/transitions', validate(idParam, 'params'), (req, res) => {
    res.json(svc.listTransitions(req.params.id, req.userId));
  });

  return router;
};
