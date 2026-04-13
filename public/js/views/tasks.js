/**
 * Tasks Kanban View Module
 * Provides a kanban-style task management view grouped by status.
 * Global function: renderTasksKanban(container)
 * Uses globals from app.js: esc, escA, api, fmtDue, isOD, PL, PC, _toDateStr
 */

// ─── Tasks Kanban ───
async function renderTasksKanban(container) {
  const c = container || document.getElementById('ct');
  c.innerHTML = '<div style="color:var(--tx2);padding:16px">Loading tasks…</div>';

  let tasks, areas;
  try {
    [tasks, areas] = await Promise.all([
      api.get('/api/tasks/board'),
      api.get('/api/areas'),
    ]);
  } catch (e) {
    c.innerHTML = '<div class="err-banner">Failed to load tasks.</div>';
    return;
  }

  if (!Array.isArray(tasks)) tasks = [];
  if (!Array.isArray(areas)) areas = [];

  const todayStr = _toDateStr(new Date());

  // ─── Filter bar ───
  const areaOpts = areas.map(a =>
    `<option value="${a.id}">${esc(a.icon || '📋')} ${esc(a.name)}</option>`
  ).join('');

  let h = `<div class="tkb-wrap">`;

  // Filter row
  h += `<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center">
    <select id="tkb-area-filter" class="inp" style="font-size:12px;padding:4px 8px;min-width:120px">
      <option value="">All Areas</option>${areaOpts}
    </select>
    <select id="tkb-pri-filter" class="inp" style="font-size:12px;padding:4px 8px">
      <option value="">All Priorities</option>
      <option value="3">🔴 Critical</option>
      <option value="2">🟠 High</option>
      <option value="1">🔵 Normal</option>
      <option value="0">⚪ None</option>
    </select>
    <button class="btn-c" id="tkb-add-btn" style="font-size:12px;margin-left:auto">
      <span class="material-icons-round" style="font-size:14px;vertical-align:middle">add</span> New Task
    </button>
  </div>`;

  // Kanban columns
  const COLS = [
    { id: 'todo',  label: 'To Do',       icon: 'radio_button_unchecked', color: 'var(--tx2)' },
    { id: 'doing', label: 'In Progress',  icon: 'pending',                color: 'var(--brand)' },
    { id: 'done',  label: 'Done',         icon: 'check_circle',           color: 'var(--ok)' },
  ];

  const byStatus = { todo: [], doing: [], done: [] };
  tasks.forEach(t => { if (byStatus[t.status]) byStatus[t.status].push(t); });

  h += `<div id="tkb-board" style="display:flex;gap:12px;overflow-x:auto;padding-bottom:8px;align-items:flex-start">`;

  COLS.forEach(col => {
    const colTasks = byStatus[col.id] || [];
    h += `<div class="tkb-col" data-status="${col.id}" style="flex:1;min-width:220px;max-width:360px;background:var(--bg2);border-radius:var(--rc);padding:10px">`;

    // Column header
    h += `<div style="display:flex;align-items:center;gap:6px;margin-bottom:10px;padding:0 2px">
      <span class="material-icons-round" style="font-size:16px;color:${col.color}">${col.icon}</span>
      <span style="font-weight:600;font-size:13px">${esc(col.label)}</span>
      <span class="tkb-count" data-status="${col.id}" style="margin-left:auto;background:var(--brd);color:var(--tx2);padding:1px 7px;border-radius:999px;font-size:11px">${colTasks.length}</span>
    </div>`;

    // Task cards
    colTasks.forEach(t => {
      const overdue = t.due_date && t.due_date < todayStr && col.id !== 'done';
      const priColor = PC[t.priority] || 'var(--brd)';
      h += `<div class="tkb-card" data-id="${t.id}" tabindex="0"
        style="background:var(--bg);border:1px solid var(--brd);border-left:3px solid ${escA(t.goal_color || priColor)};border-radius:var(--rs);padding:10px;margin-bottom:8px;cursor:pointer">
        <div style="font-size:13px;font-weight:500;margin-bottom:5px;word-break:break-word">${esc(t.title)}</div>`;

      if (t.area_name || t.goal_title) {
        h += `<div style="font-size:11px;color:var(--tx2);margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
          ${t.area_icon ? esc(t.area_icon) + ' ' : ''}${esc(t.area_name || '')}${t.goal_title ? ' › ' + esc(t.goal_title) : ''}
        </div>`;
      }

      const metaItems = [];
      if (t.due_date) metaItems.push(`<span style="color:${overdue ? 'var(--err)' : 'var(--tx2)'}">${overdue ? '⚠️ ' : '📅 '}${fmtDue(t.due_date)}</span>`);
      if (t.priority > 0) metaItems.push(`<span style="color:${priColor}">● ${PL[t.priority]}</span>`);
      if (t.assigned_to) metaItems.push(`<span>👤 ${esc(t.assigned_to)}</span>`);
      if (metaItems.length) {
        h += `<div style="display:flex;flex-wrap:wrap;gap:6px;font-size:11px;margin-top:4px">${metaItems.join('')}</div>`;
      }

      // Move buttons
      h += `<div style="display:flex;gap:4px;margin-top:8px;flex-wrap:wrap">`;
      COLS.filter(s => s.id !== col.id).forEach(s => {
        h += `<button class="btn-c tkb-mv" data-id="${t.id}" data-status="${s.id}" title="Move to ${s.label}"
          style="font-size:11px;padding:2px 8px;flex:1">
          <span class="material-icons-round" style="font-size:12px;vertical-align:middle">${s.icon}</span> ${esc(s.label)}
        </button>`;
      });
      h += `<button class="btn-c tkb-del" data-id="${t.id}" title="Delete task"
        style="font-size:11px;padding:2px 6px;color:var(--err)">
        <span class="material-icons-round" style="font-size:12px;vertical-align:middle">delete_outline</span>
      </button>`;
      h += `</div></div>`;
    });

    // Add task button per column
    h += `<button class="btn-c tkb-qadd" data-status="${col.id}"
      style="width:100%;margin-top:4px;font-size:12px;color:var(--tx2);border:1px dashed var(--brd);background:transparent;padding:7px;border-radius:var(--rs)">
      <span class="material-icons-round" style="font-size:14px;vertical-align:middle">add</span> Add task
    </button>`;

    h += `</div>`;
  });

  h += `</div></div>`;
  c.innerHTML = h;

  // ─── Filter logic ───
  function applyFilters() {
    const areaVal = document.getElementById('tkb-area-filter')?.value;
    const priVal = document.getElementById('tkb-pri-filter')?.value;
    c.querySelectorAll('.tkb-card').forEach(card => {
      const id = Number(card.dataset.id);
      const t = tasks.find(t => t.id === id);
      if (!t) return;
      const areaMatch = !areaVal || String(t.area_id) === areaVal;
      const priMatch = priVal === '' || String(t.priority) === priVal;
      card.style.display = (areaMatch && priMatch) ? '' : 'none';
    });
    // Update counts
    COLS.forEach(col => {
      const visibleInCol = [...c.querySelectorAll(`.tkb-col[data-status="${col.id}"] .tkb-card`)].filter(el => el.style.display !== 'none').length;
      const badge = c.querySelector(`.tkb-count[data-status="${col.id}"]`);
      if (badge) badge.textContent = visibleInCol;
    });
  }

  document.getElementById('tkb-area-filter')?.addEventListener('change', applyFilters);
  document.getElementById('tkb-pri-filter')?.addEventListener('change', applyFilters);

  // ─── Move buttons ───
  c.querySelectorAll('.tkb-mv').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const { id, status } = btn.dataset;
      btn.disabled = true;
      await api.patch('/api/tasks/' + id, { status });
      await renderTasksKanban(c);
    });
  });

  // ─── Delete buttons ───
  c.querySelectorAll('.tkb-del').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm('Delete this task?')) return;
      await api.del('/api/tasks/' + btn.dataset.id);
      await renderTasksKanban(c);
    });
  });

  // ─── Quick-add per column ───
  c.querySelectorAll('.tkb-qadd').forEach(btn => {
    btn.addEventListener('click', () => {
      const status = btn.dataset.status;
      const col = btn.closest('.tkb-col');
      // Insert inline add form
      const form = document.createElement('div');
      form.style.cssText = 'margin-bottom:8px';
      form.innerHTML = `<input type="text" class="inp tkb-inline-title" placeholder="Task title…"
        style="width:100%;font-size:13px;margin-bottom:6px">
        <div style="display:flex;gap:6px">
          <button class="btn-s tkb-confirm-add" style="font-size:12px;flex:1">Add</button>
          <button class="btn-c tkb-cancel-add" style="font-size:12px">Cancel</button>
        </div>`;
      col.insertBefore(form, btn);
      btn.style.display = 'none';
      form.querySelector('.tkb-inline-title').focus();

      form.querySelector('.tkb-cancel-add').addEventListener('click', () => {
        form.remove();
        btn.style.display = '';
      });
      form.querySelector('.tkb-confirm-add').addEventListener('click', async () => {
        const title = form.querySelector('.tkb-inline-title').value.trim();
        if (!title) return;
        // Need a goal_id — use first available
        const goalRes = await api.get('/api/goals?limit=1');
        const goals = Array.isArray(goalRes) ? goalRes : (goalRes.items || []);
        if (!goals.length) {
          if (typeof showToast === 'function') showToast('Create a goal first to add tasks', 'warn');
          return;
        }
        await api.post('/api/goals/' + goals[0].id + '/tasks', { title, status });
        await renderTasksKanban(c);
      });
      form.querySelector('.tkb-inline-title').addEventListener('keydown', e => {
        if (e.key === 'Enter') form.querySelector('.tkb-confirm-add').click();
        if (e.key === 'Escape') form.querySelector('.tkb-cancel-add').click();
      });
    });
  });

  // ─── Global add ───
  document.getElementById('tkb-add-btn')?.addEventListener('click', () => {
    // Fall back to quick capture if available
    if (typeof openQuickCapture === 'function') openQuickCapture();
  });
}
