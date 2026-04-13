/**
 * Goals View Module
 * Lists all goals across life areas with progress, milestones, and CRUD.
 * Global function: renderGoalsView(container)
 * Dispatched from app.js when currentView === 'goals'
 */

async function renderGoalsView(container) {
  const c = container || document.getElementById('ct');
  c.innerHTML = '<div style="color:var(--tx2);padding:16px">Loading goals…</div>';

  let areas, allGoals;
  try {
    [areas, allGoals] = await Promise.all([
      api.get('/api/areas'),
      api.get('/api/goals'),
    ]);
  } catch (e) {
    c.innerHTML = '<div class="err-banner">Failed to load goals.</div>';
    return;
  }

  if (!Array.isArray(areas)) areas = [];
  if (!Array.isArray(allGoals)) allGoals = allGoals?.items || [];

  const todayStr = _toDateStr(new Date());

  // ─── Build UI ───
  let h = `<div class="gv-wrap" style="max-width:720px">`;

  // Tool bar
  h += `<div style="display:flex;gap:8px;margin-bottom:16px;align-items:center;flex-wrap:wrap">
    <select id="gv-area-filter" class="inp" style="font-size:12px;padding:4px 8px;min-width:130px">
      <option value="">All Areas</option>
      ${areas.map(a => `<option value="${a.id}">${esc(a.icon || '📋')} ${esc(a.name)}</option>`).join('')}
    </select>
    <select id="gv-status-filter" class="inp" style="font-size:12px;padding:4px 8px">
      <option value="">All Status</option>
      <option value="active">Active</option>
      <option value="completed">Completed</option>
      <option value="archived">Archived</option>
    </select>
    <button class="btn-s" id="gv-add-btn" style="font-size:12px;margin-left:auto">
      <span class="material-icons-round" style="font-size:14px;vertical-align:middle">add</span> New Goal
    </button>
  </div>`;

  // Goals list
  h += `<div id="gv-list">`;

  if (!allGoals.length) {
    h += `<div style="text-align:center;padding:40px;color:var(--tx2)">
      <span class="material-icons-round" style="font-size:48px;display:block;margin-bottom:8px">flag</span>
      <div style="font-size:15px;font-weight:500;margin-bottom:4px">No goals yet</div>
      <div style="font-size:13px">Create your first goal to start tracking your progress.</div>
    </div>`;
  } else {
    allGoals.forEach(goal => {
      const area = areas.find(a => a.id === goal.area_id);
      const pct = goal.total_tasks ? Math.round((goal.done_tasks || 0) / goal.total_tasks * 100) : (goal.status === 'completed' ? 100 : 0);
      const overdue = goal.due_date && goal.due_date < todayStr && goal.status !== 'completed';

      h += `<div class="gv-goal-card" data-id="${goal.id}" data-area="${goal.area_id || ''}" data-status="${goal.status || 'active'}"
        style="background:var(--bg2);border:1px solid var(--brd);border-left:4px solid ${escA(goal.color || 'var(--brand)')};
          border-radius:var(--rc);padding:14px 16px;margin-bottom:10px">
        <div style="display:flex;align-items:flex-start;gap:10px">
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">
              <span style="font-weight:600;font-size:14px${goal.status === 'completed' ? ';text-decoration:line-through;opacity:.7' : ''}">${esc(goal.title)}</span>
              ${goal.status !== 'active' ? `<span style="font-size:11px;padding:2px 7px;border-radius:999px;background:var(--brd);color:var(--tx2)">${esc(goal.status)}</span>` : ''}
            </div>
            ${area ? `<div style="font-size:11px;color:var(--tx2);margin-bottom:6px">${esc(area.icon || '📋')} ${esc(area.name)}</div>` : ''}
            ${goal.description ? `<div style="font-size:12px;color:var(--tx2);margin-bottom:8px;white-space:pre-wrap">${esc(goal.description)}</div>` : ''}
            <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;font-size:11px;color:var(--tx2);margin-bottom:8px">
              ${goal.due_date ? `<span style="color:${overdue ? 'var(--err)' : 'var(--tx2)'}">${overdue ? '⚠️ ' : '📅 '}${fmtDue(goal.due_date)}</span>` : ''}
              ${goal.total_tasks ? `<span>📋 ${goal.done_tasks || 0}/${goal.total_tasks} tasks</span>` : ''}
            </div>
            <div style="background:var(--brd);border-radius:999px;height:5px;margin-bottom:10px">
              <div style="background:${escA(goal.color || 'var(--brand)')};width:${pct}%;border-radius:999px;height:5px;transition:width .3s"></div>
            </div>
            <div style="display:flex;gap:4px;flex-wrap:wrap">
              <button class="btn-c gv-edit" data-id="${goal.id}" style="font-size:11px;padding:3px 10px">Edit</button>
              <button class="btn-c gv-milestones" data-id="${goal.id}" data-title="${escA(goal.title)}" style="font-size:11px;padding:3px 10px">Milestones</button>
              ${goal.status !== 'completed' ? `<button class="btn-c gv-complete" data-id="${goal.id}" style="font-size:11px;padding:3px 10px;color:var(--ok)">✓ Complete</button>` : ''}
              <button class="btn-c gv-del" data-id="${goal.id}" style="font-size:11px;padding:3px 10px;color:var(--err);margin-left:auto">Delete</button>
            </div>
          </div>
          <div style="text-align:center;min-width:44px">
            <div style="font-size:18px;font-weight:700;color:${escA(goal.color || 'var(--brand)')}">${pct}%</div>
            <div style="font-size:10px;color:var(--tx2)">done</div>
          </div>
        </div>
      </div>`;
    });
  }

  h += `</div>`;

  // Milestones panel (hidden by default)
  h += `<div id="gv-milestones-panel" style="display:none;margin-top:16px;background:var(--bg2);border:1px solid var(--brd);border-radius:var(--rc);padding:14px">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
      <strong id="gv-ms-title" style="flex:1;font-size:13px"></strong>
      <button class="btn-c" id="gv-ms-close" style="font-size:11px">Close</button>
    </div>
    <div id="gv-ms-list"></div>
    <div style="display:flex;gap:6px;margin-top:8px">
      <input type="text" id="gv-ms-inp" class="inp" placeholder="New milestone…" style="flex:1;font-size:13px">
      <button class="btn-s" id="gv-ms-add" style="font-size:12px">Add</button>
    </div>
  </div>`;

  h += `</div>`;
  c.innerHTML = h;

  // ─── Filter ───
  function applyFilter() {
    const area = document.getElementById('gv-area-filter')?.value;
    const status = document.getElementById('gv-status-filter')?.value;
    c.querySelectorAll('.gv-goal-card').forEach(card => {
      const areaMatch = !area || card.dataset.area === area;
      const statusMatch = !status || card.dataset.status === status;
      card.style.display = (areaMatch && statusMatch) ? '' : 'none';
    });
  }

  document.getElementById('gv-area-filter')?.addEventListener('change', applyFilter);
  document.getElementById('gv-status-filter')?.addEventListener('change', applyFilter);

  // ─── Add goal ───
  document.getElementById('gv-add-btn')?.addEventListener('click', () => {
    _openGoalModal(null, areas, () => renderGoalsView(c));
  });

  // ─── Edit goal ───
  c.querySelectorAll('.gv-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const goal = allGoals.find(g => g.id === Number(btn.dataset.id));
      if (goal) _openGoalModal(goal, areas, () => renderGoalsView(c));
    });
  });

  // ─── Complete goal ───
  c.querySelectorAll('.gv-complete').forEach(btn => {
    btn.addEventListener('click', async () => {
      await api.put('/api/goals/' + btn.dataset.id, { status: 'completed' });
      await renderGoalsView(c);
    });
  });

  // ─── Delete goal ───
  c.querySelectorAll('.gv-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this goal and all its tasks? This cannot be undone.')) return;
      await api.del('/api/goals/' + btn.dataset.id);
      await renderGoalsView(c);
    });
  });

  // ─── Milestones ───
  let currentMsGoalId = null;

  c.querySelectorAll('.gv-milestones').forEach(btn => {
    btn.addEventListener('click', async () => {
      currentMsGoalId = Number(btn.dataset.id);
      document.getElementById('gv-ms-title').textContent = btn.dataset.title + ' — Milestones';
      document.getElementById('gv-milestones-panel').style.display = 'block';
      await _refreshMilestones(currentMsGoalId);
    });
  });

  document.getElementById('gv-ms-close')?.addEventListener('click', () => {
    document.getElementById('gv-milestones-panel').style.display = 'none';
    currentMsGoalId = null;
  });

  document.getElementById('gv-ms-add')?.addEventListener('click', async () => {
    const inp = document.getElementById('gv-ms-inp');
    const title = inp.value.trim();
    if (!title || !currentMsGoalId) return;
    await api.post('/api/goals/' + currentMsGoalId + '/milestones', { title });
    inp.value = '';
    await _refreshMilestones(currentMsGoalId);
  });
  document.getElementById('gv-ms-inp')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('gv-ms-add').click();
  });
}

async function _refreshMilestones(goalId) {
  const listEl = document.getElementById('gv-ms-list');
  if (!listEl) return;
  let milestones;
  try { milestones = await api.get('/api/goals/' + goalId + '/milestones'); } catch { milestones = []; }
  if (!Array.isArray(milestones)) milestones = [];

  if (!milestones.length) {
    listEl.innerHTML = '<div style="color:var(--tx2);font-size:12px;padding:4px 0">No milestones yet.</div>';
    return;
  }

  listEl.innerHTML = milestones.map(ms =>
    `<div class="gv-ms-item" style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--brd)">
      <input type="checkbox" class="gv-ms-check" data-id="${ms.id}" ${ms.done ? 'checked' : ''}>
      <span style="${ms.done ? 'text-decoration:line-through;opacity:.6;' : ''}font-size:13px;flex:1">${esc(ms.title)}</span>
      <button class="btn-c gv-ms-del" data-id="${ms.id}" title="Delete" style="font-size:11px;padding:2px 6px;color:var(--err)">×</button>
    </div>`
  ).join('');

  listEl.querySelectorAll('.gv-ms-check').forEach(chk => {
    chk.addEventListener('change', async () => {
      await api.put('/api/milestones/' + chk.dataset.id, { done: chk.checked });
      await _refreshMilestones(goalId);
    });
  });
  listEl.querySelectorAll('.gv-ms-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      await api.del('/api/milestones/' + btn.dataset.id);
      await _refreshMilestones(goalId);
    });
  });
}

function _openGoalModal(goal, areas, onSaved) {
  const isEdit = !!goal;
  const title = isEdit ? 'Edit Goal' : 'New Goal';

  // Build modal
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:900;display:flex;align-items:center;justify-content:center;padding:20px';
  overlay.innerHTML = `
    <div style="background:var(--bg);border-radius:var(--rc);width:100%;max-width:440px;padding:20px;box-shadow:0 20px 60px rgba(0,0,0,.4)">
      <h3 style="margin:0 0 16px;font-size:15px">${title}</h3>
      <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Area *</label>
      <select id="gm-area" class="inp" style="width:100%;margin-bottom:10px;font-size:13px">
        ${areas.map(a => `<option value="${a.id}" ${isEdit && goal.area_id === a.id ? 'selected' : ''}>${esc(a.icon || '')} ${esc(a.name)}</option>`).join('')}
      </select>
      <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Title *</label>
      <input type="text" id="gm-title" class="inp" value="${isEdit ? escA(goal.title) : ''}" placeholder="Goal title…" style="width:100%;margin-bottom:10px;font-size:13px">
      <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Description</label>
      <textarea id="gm-desc" class="inp" rows="2" placeholder="What do you want to achieve?" style="width:100%;margin-bottom:10px;font-size:13px;resize:vertical">${isEdit ? esc(goal.description || '') : ''}</textarea>
      <div style="display:flex;gap:10px;margin-bottom:10px">
        <div style="flex:1">
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Due Date</label>
          <input type="date" id="gm-due" class="inp" value="${isEdit && goal.due_date ? goal.due_date : ''}" style="width:100%;font-size:13px">
        </div>
        <div>
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Color</label>
          <input type="color" id="gm-color" value="${isEdit ? (goal.color || '#6C63FF') : '#6C63FF'}" style="width:44px;height:36px;border-radius:var(--rs);cursor:pointer;border:1px solid var(--brd)">
        </div>
      </div>
      <div id="gm-err" style="color:var(--err);font-size:12px;margin-bottom:8px;display:none"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn-c" id="gm-cancel">Cancel</button>
        <button class="btn-s" id="gm-save">${isEdit ? 'Save' : 'Create'}</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  document.getElementById('gm-title').focus();

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.getElementById('gm-cancel').addEventListener('click', () => overlay.remove());
  document.getElementById('gm-save').addEventListener('click', async () => {
    const areaId = Number(document.getElementById('gm-area').value);
    const titleVal = document.getElementById('gm-title').value.trim();
    const desc = document.getElementById('gm-desc').value.trim();
    const dueDate = document.getElementById('gm-due').value || null;
    const color = document.getElementById('gm-color').value;
    const errEl = document.getElementById('gm-err');

    if (!titleVal) { errEl.textContent = 'Title is required'; errEl.style.display = 'block'; return; }
    errEl.style.display = 'none';

    let result;
    if (isEdit) {
      result = await api.put('/api/goals/' + goal.id, { title: titleVal, description: desc, due_date: dueDate, color });
    } else {
      result = await api.post('/api/areas/' + areaId + '/goals', { title: titleVal, description: desc, due_date: dueDate, color });
    }

    if (result && result.error) { errEl.textContent = result.error; errEl.style.display = 'block'; return; }
    overlay.remove();
    if (typeof onSaved === 'function') onSaved();
  });
}
