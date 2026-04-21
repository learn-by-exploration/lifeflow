/**
 * Problems View Module
 * Lists all problems with phase badges, emotional state, filtering, and CRUD.
 * Global function: renderProblemsView(container)
 * Dispatched from app.js when currentView === 'problems'
 */

const PHASE_COLORS = {
  capture: '#6366f1', diagnose: '#f59e0b', explore: '#3b82f6',
  decide: '#8b5cf6', act: '#10b981', review: '#06b6d4',
  resolved: '#22c55e', shelved: '#94a3b8',
};
const PHASE_ICONS = {
  capture: 'edit_note', diagnose: 'psychology', explore: 'explore',
  decide: 'gavel', act: 'rocket_launch', review: 'rate_review',
  resolved: 'check_circle', shelved: 'archive',
};

async function renderProblemsView(container) {
  const c = container || document.getElementById('ct');
  c.innerHTML = '<div style="color:var(--tx2);padding:16px">Loading problems…</div>';

  let result;
  try {
    result = await api.get('/api/problems');
  } catch (e) {
    c.innerHTML = '<div class="err-banner">Failed to load problems.</div>';
    return;
  }

  const problems = result?.data || result?.items || (Array.isArray(result) ? result : []);

  let h = '<div class="pv-wrap" style="max-width:720px">';

  // Toolbar
  h += `<div style="display:flex;gap:8px;margin-bottom:16px;align-items:center;flex-wrap:wrap">
    <select id="pv-phase-filter" class="inp" style="font-size:12px;padding:4px 8px;min-width:120px">
      <option value="">All Phases</option>
      <option value="capture">Capture</option>
      <option value="diagnose">Diagnose</option>
      <option value="explore">Explore</option>
      <option value="decide">Decide</option>
      <option value="act">Act</option>
      <option value="review">Review</option>
      <option value="resolved">Resolved</option>
      <option value="shelved">Shelved</option>
    </select>
    <select id="pv-status-filter" class="inp" style="font-size:12px;padding:4px 8px">
      <option value="">All Status</option>
      <option value="active">Active</option>
      <option value="paused">Paused</option>
      <option value="resolved">Resolved</option>
      <option value="shelved">Shelved</option>
    </select>
    <button class="btn-s" id="pv-add-btn" style="font-size:12px;margin-left:auto">
      <span class="material-icons-round" style="font-size:14px;vertical-align:middle">add</span> New Problem
    </button>
  </div>`;

  // Problems list
  h += '<div id="pv-list">';

  if (!problems.length) {
    h += `<div style="text-align:center;padding:40px;color:var(--tx2)">
      <span class="material-icons-round" style="font-size:48px;display:block;margin-bottom:8px">lightbulb</span>
      <div style="font-size:15px;font-weight:500;margin-bottom:4px">No problems yet</div>
      <div style="font-size:13px">Capture a problem you're working through — big or small.</div>
    </div>`;
  } else {
    problems.forEach(p => {
      const phaseColor = PHASE_COLORS[p.phase] || '#94a3b8';
      const phaseIcon = PHASE_ICONS[p.phase] || 'help_outline';
      const isTerminal = p.phase === 'resolved' || p.phase === 'shelved';
      const urgencyLabel = p.urgency === 'high' ? '🔴' : p.urgency === 'medium' ? '🟡' : '';
      const actionPct = p.action_count ? Math.round((p.actions_done || 0) / p.action_count * 100) : 0;

      h += `<div class="pv-card" data-id="${p.id}" data-phase="${p.phase}" data-status="${p.status || 'active'}"
        style="background:var(--bg2);border:1px solid var(--brd);border-left:4px solid ${phaseColor};
          border-radius:var(--rc);padding:14px 16px;margin-bottom:10px;cursor:pointer"
        title="Click to view details">
        <div style="display:flex;align-items:flex-start;gap:10px">
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">
              <span style="font-weight:600;font-size:14px${isTerminal ? ';text-decoration:line-through;opacity:.7' : ''}">${urgencyLabel} ${esc(p.title)}</span>
              <span style="font-size:11px;padding:2px 8px;border-radius:999px;background:${phaseColor}22;color:${phaseColor};font-weight:500;display:inline-flex;align-items:center;gap:3px">
                <span class="material-icons-round" style="font-size:12px">${phaseIcon}</span>${esc(p.phase)}
              </span>
              ${p.emotional_state ? `<span style="font-size:11px;padding:2px 7px;border-radius:999px;background:var(--brd);color:var(--tx2)">${esc(p.emotional_state)}</span>` : ''}
            </div>
            ${p.category && p.category !== 'uncategorized' ? `<div style="font-size:11px;color:var(--tx2);margin-bottom:4px;text-transform:capitalize">${esc(p.category.replace(/_/g, ' '))}</div>` : ''}
            ${p.description ? `<div style="font-size:12px;color:var(--tx2);margin-bottom:8px;white-space:pre-wrap;max-height:40px;overflow:hidden;text-overflow:ellipsis">${esc(p.description)}</div>` : ''}
            <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;font-size:11px;color:var(--tx2);margin-bottom:6px">
              ${p.reframe_count ? `<span>💡 ${p.reframe_count} reframe${p.reframe_count > 1 ? 's' : ''}</span>` : ''}
              ${p.option_count ? `<span>⚖️ ${p.option_count} option${p.option_count > 1 ? 's' : ''}</span>` : ''}
              ${p.action_count ? `<span>✅ ${p.actions_done || 0}/${p.action_count} actions</span>` : ''}
              ${p.journal_count ? `<span>📝 ${p.journal_count} journal</span>` : ''}
              ${p.deadline ? `<span>📅 ${fmtDue(p.deadline)}</span>` : ''}
            </div>
            ${p.action_count ? `<div style="background:var(--brd);border-radius:999px;height:4px;margin-bottom:8px">
              <div style="background:${phaseColor};width:${actionPct}%;border-radius:999px;height:4px;transition:width .3s"></div>
            </div>` : ''}
            <div style="display:flex;gap:4px;flex-wrap:wrap">
              ${!isTerminal ? `<button class="btn-c pv-phase-btn" data-id="${p.id}" style="font-size:11px;padding:3px 10px">Advance Phase</button>` : ''}
              ${!isTerminal ? `<button class="btn-c pv-resolve-btn" data-id="${p.id}" style="font-size:11px;padding:3px 10px;color:var(--ok)">✓ Resolve</button>` : ''}
              <button class="btn-c pv-del" data-id="${p.id}" style="font-size:11px;padding:3px 10px;color:var(--err);margin-left:auto">Delete</button>
            </div>
          </div>
          <div style="text-align:center;min-width:36px">
            <span class="material-icons-round" style="font-size:28px;color:${phaseColor}">${phaseIcon}</span>
          </div>
        </div>
      </div>`;
    });
  }

  h += '</div></div>';
  c.innerHTML = h;

  // ─── Filter ───
  function applyFilter() {
    const phase = document.getElementById('pv-phase-filter')?.value;
    const status = document.getElementById('pv-status-filter')?.value;
    c.querySelectorAll('.pv-card').forEach(card => {
      const phaseMatch = !phase || card.dataset.phase === phase;
      const statusMatch = !status || card.dataset.status === status;
      card.style.display = (phaseMatch && statusMatch) ? '' : 'none';
    });
  }
  document.getElementById('pv-phase-filter')?.addEventListener('change', applyFilter);
  document.getElementById('pv-status-filter')?.addEventListener('change', applyFilter);

  // ─── Add ───
  document.getElementById('pv-add-btn')?.addEventListener('click', () => {
    _openProblemModal(null, () => renderProblemsView(c));
  });

  // ─── Resolve ───
  c.querySelectorAll('.pv-resolve-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('Mark this problem as resolved?')) return;
      await api.put('/api/problems/' + btn.dataset.id + '/phase', { phase: 'resolved' });
      await renderProblemsView(c);
    });
  });

  // ─── Advance Phase ───
  c.querySelectorAll('.pv-phase-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const problem = problems.find(p => p.id === Number(btn.dataset.id));
      if (!problem) return;
      const phases = ['capture', 'diagnose', 'explore', 'decide', 'act', 'review'];
      const idx = phases.indexOf(problem.phase);
      const nextPhase = idx >= 0 && idx < phases.length - 1 ? phases[idx + 1] : null;
      if (!nextPhase) { showToast('Already at final active phase', 'info'); return; }
      await api.put('/api/problems/' + btn.dataset.id + '/phase', { phase: nextPhase });
      await renderProblemsView(c);
    });
  });

  // ─── Delete ───
  c.querySelectorAll('.pv-del').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('Delete this problem? This cannot be undone.')) return;
      await api.del('/api/problems/' + btn.dataset.id);
      await renderProblemsView(c);
    });
  });
}

function _openProblemModal(problem, onSaved) {
  const isEdit = !!problem;
  const title = isEdit ? 'Edit Problem' : 'New Problem';

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:900;display:flex;align-items:center;justify-content:center;padding:20px';
  overlay.innerHTML = `
    <div style="background:var(--bg);border-radius:var(--rc);width:100%;max-width:480px;padding:20px;box-shadow:0 20px 60px rgba(0,0,0,.4);max-height:90vh;overflow-y:auto">
      <h3 style="margin:0 0 16px;font-size:15px">${title}</h3>
      <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">What's the problem? *</label>
      <input type="text" id="pm-title" class="inp" value="${isEdit ? escA(problem.title) : ''}" placeholder="e.g. Can't decide whether to switch jobs" style="width:100%;margin-bottom:10px;font-size:13px" maxlength="200">
      <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Description</label>
      <textarea id="pm-desc" class="inp" rows="3" placeholder="Add context…" style="width:100%;margin-bottom:10px;font-size:13px;resize:vertical" maxlength="2000">${isEdit ? esc(problem.description || '') : ''}</textarea>
      <div style="display:flex;gap:10px;margin-bottom:10px">
        <div style="flex:1">
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Category</label>
          <select id="pm-category" class="inp" style="width:100%;font-size:13px">
            <option value="uncategorized">Uncategorized</option>
            <option value="career" ${isEdit && problem.category === 'career' ? 'selected' : ''}>Career</option>
            <option value="relationships" ${isEdit && problem.category === 'relationships' ? 'selected' : ''}>Relationships</option>
            <option value="financial" ${isEdit && problem.category === 'financial' ? 'selected' : ''}>Financial</option>
            <option value="health" ${isEdit && problem.category === 'health' ? 'selected' : ''}>Health</option>
            <option value="personal_growth" ${isEdit && problem.category === 'personal_growth' ? 'selected' : ''}>Personal Growth</option>
            <option value="education" ${isEdit && problem.category === 'education' ? 'selected' : ''}>Education</option>
            <option value="home" ${isEdit && problem.category === 'home' ? 'selected' : ''}>Home</option>
            <option value="creative" ${isEdit && problem.category === 'creative' ? 'selected' : ''}>Creative</option>
            <option value="social" ${isEdit && problem.category === 'social' ? 'selected' : ''}>Social</option>
            <option value="existential" ${isEdit && problem.category === 'existential' ? 'selected' : ''}>Existential</option>
          </select>
        </div>
        <div style="flex:1">
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Type</label>
          <select id="pm-type" class="inp" style="width:100%;font-size:13px">
            <option value="unclassified">Unclassified</option>
            <option value="solve" ${isEdit && problem.problem_type === 'solve' ? 'selected' : ''}>Solve</option>
            <option value="decide" ${isEdit && problem.problem_type === 'decide' ? 'selected' : ''}>Decide</option>
            <option value="process" ${isEdit && problem.problem_type === 'process' ? 'selected' : ''}>Process</option>
          </select>
        </div>
      </div>
      <div style="display:flex;gap:10px;margin-bottom:10px">
        <div style="flex:1">
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">How are you feeling?</label>
          <select id="pm-emotion" class="inp" style="width:100%;font-size:13px">
            <option value="">Not sure</option>
            <option value="anxious">Anxious</option>
            <option value="overwhelmed">Overwhelmed</option>
            <option value="stuck">Stuck</option>
            <option value="frustrated">Frustrated</option>
            <option value="confused">Confused</option>
            <option value="scared">Scared</option>
            <option value="angry">Angry</option>
            <option value="sad">Sad</option>
            <option value="hopeful">Hopeful</option>
            <option value="determined">Determined</option>
            <option value="calm">Calm</option>
          </select>
        </div>
        <div style="flex:1">
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Urgency</label>
          <select id="pm-urgency" class="inp" style="width:100%;font-size:13px">
            <option value="low">Low</option>
            <option value="medium" ${isEdit && problem.urgency === 'medium' ? 'selected' : ''}>Medium</option>
            <option value="high" ${isEdit && problem.urgency === 'high' ? 'selected' : ''}>High</option>
          </select>
        </div>
      </div>
      <div id="pm-err" style="color:var(--err);font-size:12px;margin-bottom:8px;display:none"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn-c" id="pm-cancel">Cancel</button>
        <button class="btn-s" id="pm-save">${isEdit ? 'Save' : 'Create'}</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  document.getElementById('pm-title').focus();

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.getElementById('pm-cancel').addEventListener('click', () => overlay.remove());
  document.getElementById('pm-save').addEventListener('click', async () => {
    const titleVal = document.getElementById('pm-title').value.trim();
    const desc = document.getElementById('pm-desc').value.trim();
    const category = document.getElementById('pm-category').value;
    const problemType = document.getElementById('pm-type').value;
    const emotionalState = document.getElementById('pm-emotion').value || null;
    const urgency = document.getElementById('pm-urgency').value;
    const errEl = document.getElementById('pm-err');

    if (!titleVal) { errEl.textContent = 'Title is required'; errEl.style.display = 'block'; return; }
    errEl.style.display = 'none';

    const body = { title: titleVal, description: desc, category, problem_type: problemType, emotional_state: emotionalState, urgency };

    let result;
    if (isEdit) {
      result = await api.put('/api/problems/' + problem.id, body);
    } else {
      result = await api.post('/api/problems', body);
    }

    if (result && result.error) { errEl.textContent = result.error; errEl.style.display = 'block'; return; }
    overlay.remove();
    if (typeof onSaved === 'function') onSaved();
  });
}
