/**
 * Areas View Module
 * Lists all life areas, shows task/goal counts, and allows CRUD.
 * Global function: renderAreasView(container)
 * Dispatched from app.js when currentView === 'areas'
 */

async function renderAreasView(container) {
  const c = container || document.getElementById('ct');
  c.innerHTML = '<div style="color:var(--tx2);padding:16px">Loading areas…</div>';

  let areas;
  try {
    areas = await api.get('/api/areas');
  } catch (e) {
    c.innerHTML = '<div class="err-banner">Failed to load areas.</div>';
    return;
  }
  if (!Array.isArray(areas)) areas = [];

  let h = `<div class="av-wrap" style="max-width:720px">`;

  // Header / add button
  h += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:16px">
    <h3 style="margin:0;font-size:15px;flex:1">Life Areas <span style="font-size:13px;color:var(--tx2);font-weight:400">(${areas.length})</span></h3>
    <button class="btn-c" id="av-show-archived" style="font-size:11px">
      <span class="material-icons-round" style="font-size:13px;vertical-align:middle">archive</span> Archived
    </button>
    <button class="btn-s" id="av-add-btn" style="font-size:12px">
      <span class="material-icons-round" style="font-size:14px;vertical-align:middle">add</span> New Area
    </button>
  </div>`;

  if (!areas.length) {
    h += `<div style="text-align:center;padding:40px;color:var(--tx2)">
      <span class="material-icons-round" style="font-size:48px;display:block;margin-bottom:8px">category</span>
      <div style="font-size:15px;font-weight:500;margin-bottom:4px">No life areas yet</div>
      <div style="font-size:13px">Create areas like "Work", "Health", "Family" to organize your goals.</div>
    </div>`;
  } else {
    h += `<div id="av-list" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px">`;

    areas.forEach(area => {
      const taskCount = area.task_count || 0;
      const goalCount = area.goal_count || 0;

      h += `<div class="av-card" data-id="${area.id}"
        style="background:var(--bg2);border:1px solid var(--brd);border-top:4px solid ${escA(area.color || 'var(--brand)')};
          border-radius:var(--rc);padding:14px;cursor:pointer;transition:box-shadow .15s">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
          <span style="font-size:24px">${esc(area.icon || '📋')}</span>
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(area.name)}</div>
            ${area.archived ? '<span style="font-size:10px;color:var(--tx2);background:var(--brd);padding:1px 6px;border-radius:999px">Archived</span>' : ''}
          </div>
        </div>
        <div style="display:flex;gap:12px;font-size:11px;color:var(--tx2);margin-bottom:10px">
          <span>🎯 ${goalCount} goals</span>
          <span>📋 ${taskCount} tasks</span>
        </div>
        <div style="display:flex;gap:4px;flex-wrap:wrap">
          <button class="btn-c av-edit" data-id="${area.id}" style="font-size:11px;padding:3px 10px">Edit</button>
          <button class="btn-c av-goals" data-id="${area.id}" data-name="${escA(area.name)}" style="font-size:11px;padding:3px 10px">View Goals</button>
          ${!area.archived
            ? `<button class="btn-c av-archive" data-id="${area.id}" title="Archive area" style="font-size:11px;padding:3px 8px;color:var(--tx2);margin-left:auto">Archive</button>`
            : `<button class="btn-c av-unarchive" data-id="${area.id}" title="Unarchive" style="font-size:11px;padding:3px 8px;margin-left:auto">Restore</button>`}
          <button class="btn-c av-del" data-id="${area.id}" title="Delete area" style="font-size:11px;padding:3px 8px;color:var(--err)">
            <span class="material-icons-round" style="font-size:13px;vertical-align:middle">delete_outline</span>
          </button>
        </div>
      </div>`;
    });

    h += `</div>`;
  }

  // Goals sub-panel
  h += `<div id="av-goals-panel" style="display:none;margin-top:20px;background:var(--bg2);border:1px solid var(--brd);border-radius:var(--rc);padding:14px">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
      <strong id="av-gp-title" style="flex:1;font-size:13px"></strong>
      <button class="btn-s" id="av-gp-add" style="font-size:11px">+ Goal</button>
      <button class="btn-c" id="av-gp-close" style="font-size:11px">Close</button>
    </div>
    <div id="av-gp-list"></div>
  </div>`;

  h += `</div>`;
  c.innerHTML = h;

  let showingGoalsForAreaId = null;

  // ─── Add area ───
  document.getElementById('av-add-btn')?.addEventListener('click', () => {
    _openAreaModal(null, () => renderAreasView(c));
  });

  // ─── Show archived ───
  document.getElementById('av-show-archived')?.addEventListener('click', async () => {
    const archivedAreas = await api.get('/api/areas?include_archived=1');
    if (!Array.isArray(archivedAreas)) return;
    _renderAreasIntoList(archivedAreas.filter(a => a.archived), c, () => renderAreasView(c));
  });

  // ─── Edit ───
  c.querySelectorAll('.av-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const area = areas.find(a => a.id === Number(btn.dataset.id));
      if (area) _openAreaModal(area, () => renderAreasView(c));
    });
  });

  // ─── Archive/Unarchive ───
  c.querySelectorAll('.av-archive').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      await api.put('/api/areas/' + btn.dataset.id + '/archive');
      await renderAreasView(c);
    });
  });
  c.querySelectorAll('.av-unarchive').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      await api.put('/api/areas/' + btn.dataset.id + '/unarchive');
      await renderAreasView(c);
    });
  });

  // ─── Delete ───
  c.querySelectorAll('.av-del').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm('Delete this area and all its goals and tasks? This cannot be undone.')) return;
      await api.del('/api/areas/' + btn.dataset.id);
      await renderAreasView(c);
    });
  });

  // ─── View goals ───
  c.querySelectorAll('.av-goals').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      showingGoalsForAreaId = Number(btn.dataset.id);
      document.getElementById('av-gp-title').textContent = btn.dataset.name + ' — Goals';
      document.getElementById('av-goals-panel').style.display = 'block';
      await _refreshAreaGoals(showingGoalsForAreaId, areas);
    });
  });

  document.getElementById('av-gp-close')?.addEventListener('click', () => {
    document.getElementById('av-goals-panel').style.display = 'none';
    showingGoalsForAreaId = null;
  });

  document.getElementById('av-gp-add')?.addEventListener('click', () => {
    if (!showingGoalsForAreaId) return;
    const title = prompt('Goal title:');
    if (!title) return;
    api.post('/api/areas/' + showingGoalsForAreaId + '/goals', { title }).then(() => {
      _refreshAreaGoals(showingGoalsForAreaId, areas);
    });
  });
}

async function _refreshAreaGoals(areaId, areas) {
  const listEl = document.getElementById('av-gp-list');
  if (!listEl) return;
  let goals;
  try { goals = await api.get('/api/areas/' + areaId + '/goals'); } catch { goals = []; }
  if (!Array.isArray(goals)) goals = [];

  if (!goals.length) {
    listEl.innerHTML = '<div style="color:var(--tx2);font-size:12px;padding:4px 0">No goals in this area yet.</div>';
    return;
  }

  listEl.innerHTML = goals.map(g => {
    const pct = g.total_tasks ? Math.round((g.done_tasks || 0) / g.total_tasks * 100) : (g.status === 'completed' ? 100 : 0);
    return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--brd)">
      <div style="width:8px;height:8px;border-radius:50%;background:${escA(g.color || 'var(--brand)')};flex-shrink:0"></div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:500">${esc(g.title)}</div>
        <div style="background:var(--brd);border-radius:999px;height:4px;margin-top:4px">
          <div style="background:${escA(g.color || 'var(--brand)')};width:${pct}%;border-radius:999px;height:4px"></div>
        </div>
      </div>
      <span style="font-size:11px;color:var(--tx2)">${pct}%</span>
      <button class="btn-c av-gp-del" data-id="${g.id}" style="font-size:11px;padding:2px 6px;color:var(--err)">×</button>
    </div>`;
  }).join('');

  listEl.querySelectorAll('.av-gp-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this goal?')) return;
      await api.del('/api/goals/' + btn.dataset.id);
      await _refreshAreaGoals(areaId, areas);
    });
  });
}

function _openAreaModal(area, onSaved) {
  const isEdit = !!area;
  const COLORS = ['#2563EB','#16A34A','#DC2626','#D97706','#7C3AED','#0891B2','#EC4899','#64748B'];

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:900;display:flex;align-items:center;justify-content:center;padding:20px';
  overlay.innerHTML = `
    <div style="background:var(--bg);border-radius:var(--rc);width:100%;max-width:380px;padding:20px;box-shadow:0 20px 60px rgba(0,0,0,.4)">
      <h3 style="margin:0 0 16px;font-size:15px">${isEdit ? 'Edit Area' : 'New Life Area'}</h3>
      <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Name *</label>
      <input type="text" id="avm-name" class="inp" value="${isEdit ? escA(area.name) : ''}" placeholder="e.g. Health, Work, Family…" style="width:100%;margin-bottom:10px;font-size:13px">
      <div style="display:flex;gap:10px;margin-bottom:12px">
        <div>
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Icon</label>
          <input type="text" id="avm-icon" class="inp" value="${isEdit ? escA(area.icon || '') : ''}" placeholder="📋" maxlength="4" style="width:60px;font-size:18px;text-align:center">
        </div>
        <div style="flex:1">
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Color</label>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            ${COLORS.map(col =>
              `<button class="avm-swatch" data-color="${col}"
                style="width:24px;height:24px;border-radius:50%;background:${col};border:2px solid ${isEdit && area.color === col ? '#fff' : 'transparent'};cursor:pointer;transition:.1s"></button>`
            ).join('')}
          </div>
          <input type="hidden" id="avm-color" value="${isEdit ? (area.color || '#2563EB') : '#2563EB'}">
        </div>
      </div>
      <div id="avm-err" style="color:var(--err);font-size:12px;margin-bottom:8px;display:none"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn-c" id="avm-cancel">Cancel</button>
        <button class="btn-s" id="avm-save">${isEdit ? 'Save' : 'Create'}</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  document.getElementById('avm-name').focus();

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.getElementById('avm-cancel').addEventListener('click', () => overlay.remove());

  // Swatch picker
  overlay.querySelectorAll('.avm-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      overlay.querySelectorAll('.avm-swatch').forEach(s => s.style.border = '2px solid transparent');
      sw.style.border = '2px solid #fff';
      document.getElementById('avm-color').value = sw.dataset.color;
    });
  });

  document.getElementById('avm-save').addEventListener('click', async () => {
    const nameVal = document.getElementById('avm-name').value.trim();
    const icon = document.getElementById('avm-icon').value.trim() || '📋';
    const color = document.getElementById('avm-color').value;
    const errEl = document.getElementById('avm-err');

    if (!nameVal) { errEl.textContent = 'Name is required'; errEl.style.display = 'block'; return; }
    errEl.style.display = 'none';

    let result;
    if (isEdit) {
      result = await api.put('/api/areas/' + area.id, { name: nameVal, icon, color });
    } else {
      result = await api.post('/api/areas', { name: nameVal, icon, color });
    }

    if (result && result.error) { errEl.textContent = result.error; errEl.style.display = 'block'; return; }
    overlay.remove();
    if (typeof onSaved === 'function') onSaved();
  });
}

function _renderAreasIntoList(archivedAreas, c, onAction) {
  // Simple list popup
  if (!archivedAreas.length) {
    if (typeof showToast === 'function') showToast('No archived areas');
    return;
  }
  // For simplicity, show a toast list. Full implementation would use a modal.
  alert('Archived areas:\n' + archivedAreas.map(a => (a.icon || '') + ' ' + a.name).join('\n'));
}
