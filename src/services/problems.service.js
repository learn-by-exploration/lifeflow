'use strict';

const { NotFoundError, ValidationError, ConflictError } = require('../errors');
const {
  CRISIS_EMOTIONAL_COMBOS, CRISIS_KEYWORDS, CRISIS_RESOURCES,
  EMOTIONAL_CLUSTERS, REFRAME_STARTERS, PROBLEM_TEMPLATES,
} = require('../schemas/problems.schema');

class ProblemsService {
  constructor(repo, deps) {
    this.repo = repo;
    this.deps = deps;
  }

  // ─── Problems CRUD ───

  list(userId, query) {
    return this.repo.findAll(userId, query);
  }

  get(id, userId) {
    const problem = this.repo.findByIdFull(id, userId);
    if (!problem) throw new NotFoundError('Problem', id);
    return problem;
  }

  create(userId, data) {
    return this.repo.create(userId, data);
  }

  update(id, userId, data) {
    const existing = this.repo.findById(id, userId);
    if (!existing) throw new NotFoundError('Problem', id);
    return this.repo.update(id, userId, data);
  }

  remove(id, userId) {
    const result = this.repo.softDelete(id, userId);
    if (result.changes === 0) throw new NotFoundError('Problem', id);
  }

  setPhase(id, userId, phase, reflection, emotionalState) {
    const existing = this.repo.findById(id, userId);
    if (!existing) throw new NotFoundError('Problem', id);
    if (existing.status === 'resolved' || existing.status === 'abandoned') {
      throw new ValidationError('Cannot change phase of a resolved or abandoned problem');
    }

    // Record phase transition with optional reflection + emotional state
    const fromPhase = existing.phase;
    if (fromPhase !== phase) {
      this.repo.createTransition(id, userId, fromPhase, phase, emotionalState, reflection);
      // Auto-create a journal entry for the transition
      if (reflection) {
        this.repo.createJournalEntry(id, userId, {
          phase: fromPhase,
          content: reflection,
          entry_type: 'phase_transition',
          emotional_state: emotionalState || null,
        });
      }
    }

    const result = this.repo.setPhase(id, userId, phase);
    // Auto-update status when moving to terminal phases
    if (phase === 'resolved') return this.repo.resolve(id, userId);
    if (phase === 'shelved') return this.repo.archive(id, userId, 'other');
    return result;
  }

  archive(id, userId, shelveReason, shelveNotes) {
    const existing = this.repo.findById(id, userId);
    if (!existing) throw new NotFoundError('Problem', id);

    // Record phase transition
    if (existing.phase !== 'shelved') {
      this.repo.createTransition(id, userId, existing.phase, 'shelved', null, shelveNotes || null);
    }

    return this.repo.archive(id, userId, shelveReason || 'other');
  }

  // ─── Reframes ───

  listReframes(problemId, userId) {
    this._ensureProblemExists(problemId, userId);
    return this.repo.listReframes(problemId);
  }

  createReframe(problemId, userId, data) {
    this._ensureProblemExists(problemId, userId);
    return this.repo.createReframe(problemId, userId, data);
  }

  deleteReframe(reframeId, userId) {
    const result = this.repo.deleteReframe(reframeId, userId);
    if (result.changes === 0) throw new NotFoundError('Reframe', reframeId);
  }

  // ─── Options ───

  listOptions(problemId, userId) {
    this._ensureProblemExists(problemId, userId);
    return this.repo.listOptions(problemId);
  }

  createOption(problemId, userId, data) {
    this._ensureProblemExists(problemId, userId);
    return this.repo.createOption(problemId, userId, data);
  }

  updateOption(optionId, userId, data) {
    const existing = this.repo.findOptionById(optionId, userId);
    if (!existing) throw new NotFoundError('Option', optionId);
    return this.repo.updateOption(optionId, userId, data);
  }

  deleteOption(optionId, userId) {
    const result = this.repo.deleteOption(optionId, userId);
    if (result.changes === 0) throw new NotFoundError('Option', optionId);
  }

  // ─── Decisions ───

  getDecision(problemId, userId) {
    this._ensureProblemExists(problemId, userId);
    return this.repo.findDecision(problemId, userId) || null;
  }

  createDecision(problemId, userId, data) {
    this._ensureProblemExists(problemId, userId);
    // Check if option belongs to this problem
    if (data.chosen_option_id) {
      const opt = this.repo.findOptionById(data.chosen_option_id, userId);
      if (!opt || opt.problem_id !== problemId) {
        throw new ValidationError('Chosen option does not belong to this problem');
      }
    }
    return this.repo.createDecision(problemId, userId, data);
  }

  updateDecision(decisionId, userId, data) {
    const existing = this.deps.db.prepare('SELECT * FROM problem_decisions WHERE id=? AND user_id=?').get(decisionId, userId);
    if (!existing) throw new NotFoundError('Decision', decisionId);
    return this.repo.updateDecision(decisionId, userId, data);
  }

  // ─── Actions ───

  listActions(problemId, userId) {
    this._ensureProblemExists(problemId, userId);
    return this.repo.listActions(problemId);
  }

  createAction(problemId, userId, data) {
    const problem = this._ensureProblemExists(problemId, userId);
    // Use title as description if description not provided
    const description = data.description || data.title;
    let taskId = null;

    // Spawn a LifeFlow task if requested
    if (data.spawn_task) {
      // Ensure user has an Inbox area and Problems goal for spawned tasks
      const goalId = this._getOrCreateProblemsGoal(userId);
      const taskResult = this.deps.db.prepare(`
        INSERT INTO tasks (user_id, goal_id, title, due_date, status, created_at)
        VALUES (?, ?, ?, ?, 'todo', datetime('now'))
      `).run(userId, goalId, description, data.due_date || null);
      taskId = taskResult.lastInsertRowid;
    }

    return this.repo.createAction(problemId, userId, { ...data, description }, taskId);
  }

  updateAction(actionId, userId, data) {
    const existing = this.repo.findActionById(actionId, userId);
    if (!existing) throw new NotFoundError('Action', actionId);
    return this.repo.updateAction(actionId, userId, data);
  }

  deleteAction(actionId, userId) {
    const result = this.repo.deleteAction(actionId, userId);
    if (result.changes === 0) throw new NotFoundError('Action', actionId);
  }

  // ─── Journal ───

  listJournal(problemId, userId) {
    this._ensureProblemExists(problemId, userId);
    return this.repo.listJournal(problemId);
  }

  createJournalEntry(problemId, userId, data) {
    const problem = this._ensureProblemExists(problemId, userId);
    // Default phase to current problem phase if not specified
    const entryData = { ...data, phase: data.phase || problem.phase };
    return this.repo.createJournalEntry(problemId, userId, entryData);
  }

  // ─── Tags ───

  addTag(problemId, userId, data) {
    this._ensureProblemExists(problemId, userId);
    let tagId = data.tag_id;
    // Resolve tag by name if tag_id not provided
    if (!tagId && data.tag) {
      const existing = this.deps.db.prepare('SELECT id FROM tags WHERE name=? AND user_id=?').get(data.tag, userId);
      if (existing) {
        tagId = existing.id;
      } else {
        const result = this.deps.db.prepare(
          "INSERT INTO tags (user_id, name, color) VALUES (?, ?, '#808080')"
        ).run(userId, data.tag);
        tagId = result.lastInsertRowid;
      }
    }
    // Verify tag exists
    const tag = this.deps.db.prepare('SELECT id FROM tags WHERE id=? AND user_id=?').get(tagId, userId);
    if (!tag) throw new NotFoundError('Tag', tagId);
    this.repo.addTag(problemId, tagId);
    return { ok: true, tag_id: tagId };
  }

  removeTag(problemId, userId, tagId) {
    this._ensureProblemExists(problemId, userId);
    const result = this.repo.removeTag(problemId, tagId);
    if (result.changes === 0) throw new NotFoundError('Tag association');
  }

  // ─── Links ───

  listLinks(problemId, userId) {
    this._ensureProblemExists(problemId, userId);
    return this.repo.listLinks(problemId);
  }

  createLink(problemId, userId, data) {
    this._ensureProblemExists(problemId, userId);
    // Verify linked problem exists
    const linked = this.repo.findById(data.linked_problem_id, userId);
    if (!linked) throw new NotFoundError('Linked problem', data.linked_problem_id);
    if (problemId === data.linked_problem_id) throw new ValidationError('Cannot link a problem to itself');

    try {
      return this.repo.createLink(problemId, data.linked_problem_id, data.link_type);
    } catch (err) {
      if (err.message.includes('UNIQUE')) throw new ConflictError('Link already exists');
      throw err;
    }
  }

  deleteLink(linkId, userId) {
    const link = this.repo.findLinkById(linkId);
    if (!link) throw new NotFoundError('Link', linkId);
    // Verify ownership via problem
    const problem = this.repo.findById(link.problem_id, userId);
    if (!problem) throw new NotFoundError('Link', linkId);
    this.repo.deleteLink(linkId);
  }

  // ─── Stats ───

  getStats(userId) {
    return this.repo.getStats(userId);
  }

  // ─── Crisis Detection (Clinical Psychologist: non-negotiable) ───

  checkCrisis(id, userId) {
    const problem = this.repo.findByIdFull(id, userId);
    if (!problem) throw new NotFoundError('Problem', id);

    let isCrisis = false;
    const triggers = [];

    // Check emotional state combinations
    const emotionalStates = (problem.emotional_state || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    for (const combo of CRISIS_EMOTIONAL_COMBOS) {
      if (combo.every(state => emotionalStates.includes(state))) {
        isCrisis = true;
        triggers.push({ type: 'emotional_combo', states: combo });
      }
    }

    // Check description + journal for crisis keywords
    const textToCheck = [
      problem.description || '',
      ...(problem.journal || []).map(j => j.content),
      ...(problem.reframes || []).map(r => r.reframe_text),
    ].join(' ').toLowerCase();

    for (const keyword of CRISIS_KEYWORDS) {
      if (textToCheck.includes(keyword)) {
        isCrisis = true;
        triggers.push({ type: 'keyword', keyword });
      }
    }

    return {
      is_crisis: isCrisis,
      triggers: isCrisis ? triggers : [],
      resources: isCrisis ? CRISIS_RESOURCES : null,
    };
  }

  getCrisisResources() {
    return CRISIS_RESOURCES;
  }

  // ─── Emotional Clusters ───

  getEmotionalClusters() {
    return EMOTIONAL_CLUSTERS;
  }

  // ─── Reframe Starters ───

  getReframeStarters() {
    return REFRAME_STARTERS;
  }

  // ─── Problem Templates ───

  getTemplates() {
    return PROBLEM_TEMPLATES;
  }

  createFromTemplate(userId, templateId) {
    const template = PROBLEM_TEMPLATES.find(t => t.id === templateId);
    if (!template) throw new NotFoundError('Template', templateId);

    const problem = this.repo.create(userId, {
      title: template.title,
      description: template.description,
      category: template.category,
      problem_type: template.problem_type,
      urgency: 0,
      importance: 0,
      emotional_state: null,
      privacy_level: 'normal',
      deadline: null,
      stakeholders: null,
      goal_id: null,
    });

    // Auto-create suggested stakeholders
    if (template.suggested_stakeholders && template.suggested_stakeholders.length > 0) {
      for (const name of template.suggested_stakeholders) {
        this.repo.createStakeholder(problem.id, userId, { name, role: null, influence: null, impact: null, notes: null });
      }
    }

    // Auto-create suggested options
    if (template.suggested_options && template.suggested_options.length > 0) {
      for (const title of template.suggested_options) {
        this.repo.createOption(problem.id, userId, {
          title, description: '', pros: '', cons: '',
          effort: null, impact: null, risk: null, emotional_fit: null, source: 'ai',
        });
      }
    }

    return this.repo.findByIdFull(problem.id, userId);
  }

  // ─── Stakeholders ───

  listStakeholders(problemId, userId) {
    this._ensureProblemExists(problemId, userId);
    return this.repo.listStakeholders(problemId);
  }

  createStakeholder(problemId, userId, data) {
    this._ensureProblemExists(problemId, userId);
    return this.repo.createStakeholder(problemId, userId, data);
  }

  updateStakeholder(stakeholderId, userId, data) {
    const existing = this.repo.findStakeholderById(stakeholderId, userId);
    if (!existing) throw new NotFoundError('Stakeholder', stakeholderId);
    return this.repo.updateStakeholder(stakeholderId, userId, data);
  }

  deleteStakeholder(stakeholderId, userId) {
    const result = this.repo.deleteStakeholder(stakeholderId, userId);
    if (result.changes === 0) throw new NotFoundError('Stakeholder', stakeholderId);
  }

  // ─── Phase Transitions ───

  listTransitions(problemId, userId) {
    this._ensureProblemExists(problemId, userId);
    return this.repo.listTransitions(problemId);
  }

  // ─── Dormant Problems ───

  findDormant(userId, days) {
    return this.repo.findDormant(userId, days);
  }

  // ─── Cascade Hard Delete (GDPR Article 17) ───

  hardDelete(id, userId) {
    const existing = this.repo.findById(id, userId);
    if (!existing) throw new NotFoundError('Problem', id);
    return this.repo.hardDelete(id, userId);
  }

  // ─── Pattern Detection ───

  detectPatterns(userId) {
    return this.repo.detectPatterns(userId);
  }

  // ─── Validate (emotional validation before reframing) ───

  validate(id, userId) {
    const existing = this.repo.findById(id, userId);
    if (!existing) throw new NotFoundError('Problem', id);
    return this.repo.update(id, userId, { validated: 1 });
  }

  // ─── Helpers ───

  _ensureProblemExists(problemId, userId) {
    const problem = this.repo.findById(problemId, userId);
    if (!problem) throw new NotFoundError('Problem', problemId);
    return problem;
  }

  _getOrCreateProblemsGoal(userId) {
    const db = this.deps.db;
    // Find existing "Problems" goal for this user
    const existing = db.prepare(
      "SELECT id FROM goals WHERE title='Problems' AND user_id=?"
    ).get(userId);
    if (existing) return existing.id;

    // Create Inbox area if user has none
    let area = db.prepare(
      "SELECT id FROM life_areas WHERE user_id=? LIMIT 1"
    ).get(userId);
    if (!area) {
      const areaResult = db.prepare(
        "INSERT INTO life_areas (name, user_id) VALUES ('Inbox', ?)"
      ).run(userId);
      area = { id: areaResult.lastInsertRowid };
    }

    // Create Problems goal
    const goalResult = db.prepare(
      "INSERT INTO goals (area_id, title, description, user_id) VALUES (?, 'Problems', 'Tasks spawned from problem-solving', ?)"
    ).run(area.id, userId);
    return goalResult.lastInsertRowid;
  }
}

module.exports = ProblemsService;
