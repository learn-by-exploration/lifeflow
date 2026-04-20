'use strict';

class ProblemsRepository {
  constructor(db) {
    this.db = db;
    this._stmts = {
      // Problems
      findById: db.prepare('SELECT * FROM problems WHERE id=? AND user_id=? AND deleted_at IS NULL'),
      create: db.prepare(`INSERT INTO problems
        (user_id,title,description,category,problem_type,phase,status,urgency,importance,emotional_state,privacy_level,deadline,stakeholders,goal_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`),
      update: db.prepare(`UPDATE problems SET
        title=COALESCE(?,title), description=COALESCE(?,description), category=COALESCE(?,category),
        problem_type=COALESCE(?,problem_type),
        urgency=COALESCE(?,urgency), importance=COALESCE(?,importance),
        emotional_state=COALESCE(?,emotional_state), privacy_level=COALESCE(?,privacy_level),
        deadline=?, stakeholders=?, goal_id=?, validated=COALESCE(?,validated),
        updated_at=datetime('now') WHERE id=? AND user_id=? AND deleted_at IS NULL`),
      softDelete: db.prepare(`UPDATE problems SET deleted_at=datetime('now'), updated_at=datetime('now') WHERE id=? AND user_id=? AND deleted_at IS NULL`),
      setPhase: db.prepare(`UPDATE problems SET phase=?, updated_at=datetime('now') WHERE id=? AND user_id=? AND deleted_at IS NULL`),
      resolve: db.prepare(`UPDATE problems SET status='resolved', phase='resolved', resolved_at=datetime('now'), updated_at=datetime('now') WHERE id=? AND user_id=?`),
      archive: db.prepare(`UPDATE problems SET status='shelved', phase='shelved', shelve_reason=?, updated_at=datetime('now') WHERE id=? AND user_id=?`),

      // Reframes
      findReframeById: db.prepare('SELECT * FROM problem_reframes WHERE id=? AND user_id=?'),
      createReframe: db.prepare('INSERT INTO problem_reframes (problem_id,user_id,reframe_text,source) VALUES (?,?,?,?)'),
      deleteReframe: db.prepare('DELETE FROM problem_reframes WHERE id=? AND user_id=?'),

      // Options
      findOptionById: db.prepare('SELECT * FROM problem_options WHERE id=? AND user_id=?'),
      createOption: db.prepare(`INSERT INTO problem_options
        (problem_id,user_id,title,description,pros,cons,effort,impact,risk,emotional_fit,source,position)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`),
      updateOption: db.prepare(`UPDATE problem_options SET
        title=COALESCE(?,title), description=COALESCE(?,description),
        pros=COALESCE(?,pros), cons=COALESCE(?,cons),
        effort=COALESCE(?,effort), impact=COALESCE(?,impact),
        risk=COALESCE(?,risk), emotional_fit=COALESCE(?,emotional_fit),
        updated_at=datetime('now') WHERE id=? AND user_id=?`),
      deleteOption: db.prepare('DELETE FROM problem_options WHERE id=? AND user_id=?'),

      // Decisions
      findDecisionByProblem: db.prepare('SELECT * FROM problem_decisions WHERE problem_id=? AND user_id=? ORDER BY created_at DESC LIMIT 1'),
      createDecision: db.prepare(`INSERT INTO problem_decisions
        (problem_id,user_id,chosen_option_id,rationale,confidence_level,revisit_date) VALUES (?,?,?,?,?,?)`),
      updateDecision: db.prepare(`UPDATE problem_decisions SET
        chosen_option_id=COALESCE(?,chosen_option_id), rationale=COALESCE(?,rationale),
        confidence_level=COALESCE(?,confidence_level), revisit_date=COALESCE(?,revisit_date),
        updated_at=datetime('now')
        WHERE id=? AND user_id=?`),

      // Actions
      findActionById: db.prepare('SELECT * FROM problem_actions WHERE id=? AND user_id=?'),
      createAction: db.prepare(`INSERT INTO problem_actions
        (problem_id,user_id,decision_id,task_id,description,due_date,position) VALUES (?,?,?,?,?,?,?)`),
      updateAction: db.prepare(`UPDATE problem_actions SET
        description=COALESCE(?,description), status=COALESCE(?,status),
        due_date=COALESCE(?,due_date),
        updated_at=datetime('now') WHERE id=? AND user_id=?`),
      deleteAction: db.prepare('DELETE FROM problem_actions WHERE id=? AND user_id=?'),

      // Journal
      createJournalEntry: db.prepare('INSERT INTO problem_journal (problem_id,user_id,phase,content,entry_type,emotional_state) VALUES (?,?,?,?,?,?)'),

      // Tags
      addTag: db.prepare('INSERT OR IGNORE INTO problem_tags (problem_id, tag_id) VALUES (?,?)'),
      removeTag: db.prepare('DELETE FROM problem_tags WHERE problem_id=? AND tag_id=?'),

      // Links
      findLinkById: db.prepare('SELECT * FROM problem_links WHERE id=?'),
      createLink: db.prepare('INSERT INTO problem_links (problem_id,linked_problem_id,link_type) VALUES (?,?,?)'),
      deleteLink: db.prepare('DELETE FROM problem_links WHERE id=?'),

      // Stakeholders
      findStakeholderById: db.prepare('SELECT * FROM problem_stakeholders WHERE id=? AND user_id=?'),
      createStakeholder: db.prepare(`INSERT INTO problem_stakeholders
        (problem_id,user_id,name,role,influence,impact,notes) VALUES (?,?,?,?,?,?,?)`),
      updateStakeholder: db.prepare(`UPDATE problem_stakeholders SET
        name=COALESCE(?,name), role=COALESCE(?,role),
        influence=COALESCE(?,influence), impact=COALESCE(?,impact),
        notes=COALESCE(?,notes) WHERE id=? AND user_id=?`),
      deleteStakeholder: db.prepare('DELETE FROM problem_stakeholders WHERE id=? AND user_id=?'),

      // Phase Transitions
      createPhaseTransition: db.prepare(`INSERT INTO problem_phase_transitions
        (problem_id,user_id,from_phase,to_phase,emotional_state,reflection) VALUES (?,?,?,?,?,?)`),
    };
  }

  // ─── Problems CRUD ───

  findAll(userId, query) {
    const { status, phase, category, privacy_level, search } = query;
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
    const sort = query.sort;
    const order = query.order;
    const conditions = ['p.user_id=?', 'p.deleted_at IS NULL'];
    const params = [userId];

    if (status) { conditions.push('p.status=?'); params.push(status); }
    if (phase) { conditions.push('p.phase=?'); params.push(phase); }
    if (category) { conditions.push('p.category=?'); params.push(category); }
    if (privacy_level) { conditions.push('p.privacy_level=?'); params.push(privacy_level); }
    if (search) { conditions.push('(p.title LIKE ? OR p.description LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }

    const where = conditions.join(' AND ');
    const allowedSorts = ['created_at', 'updated_at', 'title', 'urgency', 'importance'];
    const safeSort = allowedSorts.includes(sort) ? sort : 'updated_at';
    const safeOrder = order === 'asc' ? 'ASC' : 'DESC';
    const offset = (page - 1) * limit;

    const total = this.db.prepare(`SELECT COUNT(*) as c FROM problems p WHERE ${where}`).get(...params).c;
    const data = this.db.prepare(`
      SELECT p.*,
        (SELECT COUNT(*) FROM problem_reframes r WHERE r.problem_id=p.id) as reframe_count,
        (SELECT COUNT(*) FROM problem_options o WHERE o.problem_id=p.id) as option_count,
        (SELECT COUNT(*) FROM problem_journal j WHERE j.problem_id=p.id) as journal_count,
        (SELECT COUNT(*) FROM problem_actions a WHERE a.problem_id=p.id) as action_count,
        (SELECT COUNT(*) FROM problem_actions a WHERE a.problem_id=p.id AND a.status='done') as actions_done
      FROM problems p WHERE ${where}
      ORDER BY p.${safeSort} ${safeOrder}
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    // Attach tags
    if (data.length) {
      const ids = data.map(p => p.id);
      const ph = ids.map(() => '?').join(',');
      const allTags = this.db.prepare(`
        SELECT pt.problem_id, t.id, t.name, t.color
        FROM problem_tags pt JOIN tags t ON pt.tag_id=t.id
        WHERE pt.problem_id IN (${ph})
      `).all(...ids);
      const tagMap = {};
      allTags.forEach(r => { (tagMap[r.problem_id] = tagMap[r.problem_id] || []).push({ id: r.id, name: r.name, color: r.color }); });
      data.forEach(p => { p.tags = tagMap[p.id] || []; });
    }

    return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  findById(id, userId) {
    return this._stmts.findById.get(id, userId);
  }

  findByIdFull(id, userId) {
    const problem = this._stmts.findById.get(id, userId);
    if (!problem) return null;

    problem.reframes = this.db.prepare('SELECT * FROM problem_reframes WHERE problem_id=? ORDER BY created_at').all(id);
    problem.options = this.db.prepare('SELECT * FROM problem_options WHERE problem_id=? ORDER BY position').all(id);
    problem.decision = this._stmts.findDecisionByProblem.get(id, userId) || null;
    problem.actions = this.db.prepare('SELECT * FROM problem_actions WHERE problem_id=? ORDER BY position').all(id);
    problem.journal = this.db.prepare('SELECT * FROM problem_journal WHERE problem_id=? ORDER BY created_at DESC').all(id);
    problem.tags = this.db.prepare(`
      SELECT t.id, t.name, t.color FROM tags t
      JOIN problem_tags pt ON t.id=pt.tag_id WHERE pt.problem_id=?
    `).all(id);
    problem.links = this.db.prepare(`
      SELECT pl.*, p.title as linked_title, p.phase as linked_phase
      FROM problem_links pl JOIN problems p ON pl.linked_problem_id=p.id
      WHERE pl.problem_id=?
    `).all(id);
    problem.stakeholders = this.db.prepare('SELECT * FROM problem_stakeholders WHERE problem_id=? ORDER BY created_at').all(id);
    problem.transitions = this.db.prepare('SELECT * FROM problem_phase_transitions WHERE problem_id=? ORDER BY created_at').all(id);

    return problem;
  }

  create(userId, data) {
    const r = this._stmts.create.run(
      userId, data.title, data.description || '', data.category, data.problem_type || 'unclassified',
      'capture', 'active', data.urgency, data.importance,
      data.emotional_state, data.privacy_level,
      data.deadline, data.stakeholders, data.goal_id
    );
    return this._stmts.findById.get(r.lastInsertRowid, userId);
  }

  update(id, userId, data) {
    const existing = this._stmts.findById.get(id, userId);
    this._stmts.update.run(
      data.title || null, data.description !== undefined ? data.description : null,
      data.category || null, data.problem_type || null,
      data.urgency !== undefined ? data.urgency : null,
      data.importance !== undefined ? data.importance : null,
      data.emotional_state !== undefined ? data.emotional_state : null,
      data.privacy_level || null,
      data.deadline !== undefined ? data.deadline : (existing ? existing.deadline : null),
      data.stakeholders !== undefined ? data.stakeholders : (existing ? existing.stakeholders : null),
      data.goal_id !== undefined ? data.goal_id : (existing ? existing.goal_id : null),
      data.validated !== undefined ? data.validated : null,
      id, userId
    );
    return this._stmts.findById.get(id, userId);
  }

  softDelete(id, userId) {
    return this._stmts.softDelete.run(id, userId);
  }

  setPhase(id, userId, phase) {
    this._stmts.setPhase.run(phase, id, userId);
    return this._stmts.findById.get(id, userId);
  }

  resolve(id, userId) {
    this._stmts.resolve.run(id, userId);
    return this._stmts.findById.get(id, userId);
  }

  archive(id, userId, shelveReason) {
    this._stmts.archive.run(shelveReason || 'other', id, userId);
    return this._stmts.findById.get(id, userId);
  }

  // ─── Reframes ───

  listReframes(problemId) {
    return this.db.prepare('SELECT * FROM problem_reframes WHERE problem_id=? ORDER BY created_at').all(problemId);
  }

  createReframe(problemId, userId, data) {
    const r = this._stmts.createReframe.run(problemId, userId, data.reframe_text, data.source);
    return this._stmts.findReframeById.get(r.lastInsertRowid, userId);
  }

  deleteReframe(id, userId) {
    return this._stmts.deleteReframe.run(id, userId);
  }

  // ─── Options ───

  listOptions(problemId) {
    return this.db.prepare('SELECT * FROM problem_options WHERE problem_id=? ORDER BY position').all(problemId);
  }

  findOptionById(id, userId) {
    return this._stmts.findOptionById.get(id, userId);
  }

  createOption(problemId, userId, data) {
    const pos = this.db.prepare('SELECT COALESCE(MAX(position),-1)+1 as p FROM problem_options WHERE problem_id=?').get(problemId).p;
    const r = this._stmts.createOption.run(
      problemId, userId, data.title, data.description || '', data.pros || '', data.cons || '',
      data.effort, data.impact, data.risk, data.emotional_fit, data.source, pos
    );
    return this._stmts.findOptionById.get(r.lastInsertRowid, userId);
  }

  updateOption(id, userId, data) {
    this._stmts.updateOption.run(
      data.title || null, data.description !== undefined ? data.description : null,
      data.pros !== undefined ? data.pros : null, data.cons !== undefined ? data.cons : null,
      data.effort !== undefined ? data.effort : null, data.impact !== undefined ? data.impact : null,
      data.risk !== undefined ? data.risk : null, data.emotional_fit !== undefined ? data.emotional_fit : null,
      id, userId
    );
    return this._stmts.findOptionById.get(id, userId);
  }

  deleteOption(id, userId) {
    return this._stmts.deleteOption.run(id, userId);
  }

  // ─── Decisions ───

  findDecision(problemId, userId) {
    return this._stmts.findDecisionByProblem.get(problemId, userId);
  }

  createDecision(problemId, userId, data) {
    const r = this._stmts.createDecision.run(
      problemId, userId, data.chosen_option_id, data.rationale || '',
      data.confidence || data.confidence_level || 3,
      data.revisit_date || null
    );
    return this.db.prepare('SELECT * FROM problem_decisions WHERE id=?').get(r.lastInsertRowid);
  }

  updateDecision(id, userId, data) {
    this._stmts.updateDecision.run(
      data.chosen_option_id !== undefined ? data.chosen_option_id : null,
      data.rationale !== undefined ? data.rationale : null,
      data.confidence !== undefined ? data.confidence : (data.confidence_level !== undefined ? data.confidence_level : null),
      data.revisit_date !== undefined ? data.revisit_date : null,
      id, userId
    );
    return this.db.prepare('SELECT * FROM problem_decisions WHERE id=?').get(id);
  }

  // ─── Actions ───

  listActions(problemId) {
    return this.db.prepare('SELECT * FROM problem_actions WHERE problem_id=? ORDER BY position').all(problemId);
  }

  findActionById(id, userId) {
    return this._stmts.findActionById.get(id, userId);
  }

  createAction(problemId, userId, data, taskId) {
    const pos = this.db.prepare('SELECT COALESCE(MAX(position),-1)+1 as p FROM problem_actions WHERE problem_id=?').get(problemId).p;
    const r = this._stmts.createAction.run(problemId, userId, data.decision_id, taskId, data.description, data.due_date || null, pos);
    return this._stmts.findActionById.get(r.lastInsertRowid, userId);
  }

  updateAction(id, userId, data) {
    this._stmts.updateAction.run(
      data.description || data.title || null, data.status || null,
      data.due_date !== undefined ? data.due_date : null,
      id, userId
    );
    return this._stmts.findActionById.get(id, userId);
  }

  deleteAction(id, userId) {
    return this._stmts.deleteAction.run(id, userId);
  }

  // ─── Journal ───

  listJournal(problemId) {
    return this.db.prepare('SELECT * FROM problem_journal WHERE problem_id=? ORDER BY created_at DESC').all(problemId);
  }

  createJournalEntry(problemId, userId, data) {
    const r = this._stmts.createJournalEntry.run(problemId, userId, data.phase, data.content, data.entry_type, data.emotional_state || null);
    return this.db.prepare('SELECT * FROM problem_journal WHERE id=?').get(r.lastInsertRowid);
  }

  // ─── Tags ───

  addTag(problemId, tagId) {
    this._stmts.addTag.run(problemId, tagId);
  }

  removeTag(problemId, tagId) {
    return this._stmts.removeTag.run(problemId, tagId);
  }

  // ─── Links ───

  listLinks(problemId) {
    return this.db.prepare(`
      SELECT pl.*, p.title as linked_title, p.phase as linked_phase, p.status as linked_status
      FROM problem_links pl JOIN problems p ON pl.linked_problem_id=p.id
      WHERE pl.problem_id=?
    `).all(problemId);
  }

  createLink(problemId, linkedProblemId, linkType) {
    const r = this._stmts.createLink.run(problemId, linkedProblemId, linkType);
    return this._stmts.findLinkById.get(r.lastInsertRowid);
  }

  findLinkById(id) {
    return this._stmts.findLinkById.get(id);
  }

  deleteLink(id) {
    return this._stmts.deleteLink.run(id);
  }

  // ─── Stakeholders ───

  listStakeholders(problemId) {
    return this.db.prepare('SELECT * FROM problem_stakeholders WHERE problem_id=? ORDER BY created_at').all(problemId);
  }

  findStakeholderById(id, userId) {
    return this._stmts.findStakeholderById.get(id, userId);
  }

  createStakeholder(problemId, userId, data) {
    const r = this._stmts.createStakeholder.run(
      problemId, userId, data.name, data.role || null,
      data.influence || null, data.impact || null, data.notes || null
    );
    return this._stmts.findStakeholderById.get(r.lastInsertRowid, userId);
  }

  updateStakeholder(id, userId, data) {
    this._stmts.updateStakeholder.run(
      data.name || null, data.role !== undefined ? data.role : null,
      data.influence !== undefined ? data.influence : null,
      data.impact !== undefined ? data.impact : null,
      data.notes !== undefined ? data.notes : null,
      id, userId
    );
    return this._stmts.findStakeholderById.get(id, userId);
  }

  deleteStakeholder(id, userId) {
    return this._stmts.deleteStakeholder.run(id, userId);
  }

  // ─── Phase Transitions ───

  listTransitions(problemId) {
    return this.db.prepare('SELECT * FROM problem_phase_transitions WHERE problem_id=? ORDER BY created_at').all(problemId);
  }

  createTransition(problemId, userId, fromPhase, toPhase, emotionalState, reflection) {
    const r = this._stmts.createPhaseTransition.run(
      problemId, userId, fromPhase, toPhase, emotionalState || null, reflection || null
    );
    return this.db.prepare('SELECT * FROM problem_phase_transitions WHERE id=?').get(r.lastInsertRowid);
  }

  // ─── Dormant Problems ───

  findDormant(userId, days) {
    return this.db.prepare(`
      SELECT id, title, phase, category, emotional_state, updated_at,
        CAST(julianday('now') - julianday(updated_at) AS INTEGER) as days_dormant
      FROM problems
      WHERE user_id=? AND status='active' AND deleted_at IS NULL
        AND julianday('now') - julianday(updated_at) >= ?
      ORDER BY updated_at ASC
    `).all(userId, days);
  }

  // ─── Cascade Hard Delete (GDPR Article 17) ───

  hardDelete(id, userId) {
    // Verify ownership first
    const problem = this.db.prepare('SELECT id FROM problems WHERE id=? AND user_id=?').get(id, userId);
    if (!problem) return { changes: 0 };

    // CASCADE: delete all related entities explicitly for safety
    this.db.prepare('DELETE FROM problem_phase_transitions WHERE problem_id=?').run(id);
    this.db.prepare('DELETE FROM problem_stakeholders WHERE problem_id=?').run(id);
    this.db.prepare('DELETE FROM problem_links WHERE problem_id=? OR linked_problem_id=?').run(id, id);
    this.db.prepare('DELETE FROM problem_tags WHERE problem_id=?').run(id);
    this.db.prepare('DELETE FROM problem_journal WHERE problem_id=?').run(id);
    this.db.prepare('DELETE FROM problem_actions WHERE problem_id=?').run(id);
    this.db.prepare('DELETE FROM problem_decisions WHERE problem_id=?').run(id);
    this.db.prepare('DELETE FROM problem_options WHERE problem_id=?').run(id);
    this.db.prepare('DELETE FROM problem_reframes WHERE problem_id=?').run(id);
    return this.db.prepare('DELETE FROM problems WHERE id=? AND user_id=?').run(id, userId);
  }

  // ─── Pattern Detection (basic cross-problem analysis) ───

  detectPatterns(userId) {
    // Category frequency
    const categoryFreq = this.db.prepare(`
      SELECT category, COUNT(*) as count FROM problems
      WHERE user_id=? AND deleted_at IS NULL GROUP BY category ORDER BY count DESC
    `).all(userId);

    // Emotional state frequency across all problems
    const emotionalFreq = this.db.prepare(`
      SELECT emotional_state, COUNT(*) as count FROM problems
      WHERE user_id=? AND deleted_at IS NULL AND emotional_state IS NOT NULL
      GROUP BY emotional_state ORDER BY count DESC
    `).all(userId);

    // Journal emotional patterns
    const journalEmotions = this.db.prepare(`
      SELECT emotional_state, COUNT(*) as count FROM problem_journal
      WHERE user_id=? AND emotional_state IS NOT NULL
      GROUP BY emotional_state ORDER BY count DESC
    `).all(userId);

    // Phase where problems get stuck (most time spent)
    const stuckPhases = this.db.prepare(`
      SELECT phase, COUNT(*) as count FROM problems
      WHERE user_id=? AND status='active' AND deleted_at IS NULL
      GROUP BY phase ORDER BY count DESC
    `).all(userId);

    // Resolution rate by category
    const resolutionRate = this.db.prepare(`
      SELECT category,
        COUNT(*) as total,
        SUM(CASE WHEN status='resolved' THEN 1 ELSE 0 END) as resolved,
        ROUND(100.0 * SUM(CASE WHEN status='resolved' THEN 1 ELSE 0 END) / COUNT(*), 1) as rate
      FROM problems WHERE user_id=? AND deleted_at IS NULL
      GROUP BY category HAVING total >= 2
      ORDER BY rate DESC
    `).all(userId);

    // Avg time to resolution by category
    const avgResolution = this.db.prepare(`
      SELECT category,
        ROUND(AVG(julianday(resolved_at) - julianday(created_at)), 1) as avg_days
      FROM problems
      WHERE user_id=? AND status='resolved' AND resolved_at IS NOT NULL AND deleted_at IS NULL
      GROUP BY category
    `).all(userId);

    // Recurring emotional states (appears in 3+ problems)
    const recurringEmotions = emotionalFreq.filter(e => e.count >= 3);

    return {
      category_frequency: categoryFreq,
      emotional_frequency: emotionalFreq,
      journal_emotions: journalEmotions,
      stuck_phases: stuckPhases,
      resolution_rate: resolutionRate,
      avg_resolution_by_category: avgResolution,
      recurring_emotions: recurringEmotions,
      insights: this._generateInsights(categoryFreq, emotionalFreq, stuckPhases, recurringEmotions),
    };
  }

  _generateInsights(categoryFreq, emotionalFreq, stuckPhases, recurringEmotions) {
    const insights = [];
    if (categoryFreq.length > 0 && categoryFreq[0].count >= 3) {
      insights.push({
        type: 'category_pattern',
        message: `Most of your problems (${categoryFreq[0].count}) fall in the "${categoryFreq[0].category}" category. Consider if there's an underlying theme.`,
      });
    }
    if (recurringEmotions.length > 0) {
      const top = recurringEmotions[0];
      insights.push({
        type: 'emotional_pattern',
        message: `You frequently feel "${top.emotional_state}" across ${top.count} problems. This recurring emotion may point to a deeper pattern worth exploring.`,
      });
    }
    if (stuckPhases.length > 0 && stuckPhases[0].phase !== 'capture') {
      insights.push({
        type: 'stuck_pattern',
        message: `You tend to have the most active problems in the "${stuckPhases[0].phase}" phase. Are you finding it hard to move past this stage?`,
      });
    }
    return insights;
  }

  // ─── Stats ───

  getStats(userId) {
    const byPhase = this.db.prepare(`
      SELECT phase, COUNT(*) as count FROM problems
      WHERE user_id=? AND deleted_at IS NULL AND status='active'
      GROUP BY phase
    `).all(userId);

    const byCategory = this.db.prepare(`
      SELECT category, COUNT(*) as count FROM problems
      WHERE user_id=? AND deleted_at IS NULL
      GROUP BY category ORDER BY count DESC
    `).all(userId);

    const byStatus = this.db.prepare(`
      SELECT status, COUNT(*) as count FROM problems
      WHERE user_id=? AND deleted_at IS NULL
      GROUP BY status
    `).all(userId);

    const resolved = this.db.prepare(`
      SELECT COUNT(*) as count FROM problems
      WHERE user_id=? AND status='resolved' AND deleted_at IS NULL
    `).get(userId);

    const avgResolutionDays = this.db.prepare(`
      SELECT AVG(julianday(resolved_at) - julianday(created_at)) as avg_days
      FROM problems WHERE user_id=? AND status='resolved' AND resolved_at IS NOT NULL AND deleted_at IS NULL
    `).get(userId);

    const recentlyActive = this.db.prepare(`
      SELECT id, title, phase, category, updated_at FROM problems
      WHERE user_id=? AND status='active' AND deleted_at IS NULL
      ORDER BY updated_at DESC LIMIT 5
    `).all(userId);

    return {
      by_phase: byPhase,
      by_category: byCategory,
      by_status: byStatus,
      total_resolved: resolved.count,
      avg_resolution_days: avgResolutionDays.avg_days ? Math.round(avgResolutionDays.avg_days * 10) / 10 : null,
      recently_active: recentlyActive,
    };
  }
}

module.exports = ProblemsRepository;
