/**
 * Calendar View Module
 * Provides a monthly grid calendar showing tasks by due_date.
 * Global function: renderCalendarMonthView(container)
 * Uses globals from app.js: esc, escA, api, _toDateStr, _parseDate, calY, calM
 */

async function renderCalendarMonthView(container) {
  const c = container || document.getElementById('ct');
  c.innerHTML = '<div style="color:var(--tx2);padding:16px">Loading calendar…</div>';

  const y = window.calViewY !== undefined ? window.calViewY : new Date().getFullYear();
  const m = window.calViewM !== undefined ? window.calViewM : new Date().getMonth();
  window.calViewY = y;
  window.calViewM = m;

  // Build date range for month view
  const firstDay = new Date(y, m, 1);
  const lastDay = new Date(y, m + 1, 0);
  const startPad = new Date(firstDay);
  // Go back to Sunday
  while (startPad.getDay() !== 0) startPad.setDate(startPad.getDate() - 1);
  const endPad = new Date(lastDay);
  while (endPad.getDay() !== 6) endPad.setDate(endPad.getDate() + 1);

  const startStr = _toDateStr(startPad);
  const endStr = _toDateStr(endPad);

  let tasks;
  try {
    tasks = await api.get(`/api/tasks/calendar?start=${startStr}&end=${endStr}`);
  } catch (e) {
    c.innerHTML = '<div class="err-banner">Failed to load calendar tasks.</div>';
    return;
  }
  if (!Array.isArray(tasks)) tasks = [];

  // Group tasks by date
  const tasksByDate = {};
  tasks.forEach(t => {
    if (!tasksByDate[t.due_date]) tasksByDate[t.due_date] = [];
    tasksByDate[t.due_date].push(t);
  });

  const todayStr = _toDateStr(new Date());
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  let h = `<div class="cvm-wrap">`;

  // Header
  h += `<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
    <button class="btn-c" id="cvm-prev" title="Previous month" style="padding:4px 10px">
      <span class="material-icons-round">chevron_left</span>
    </button>
    <h3 style="flex:1;text-align:center;margin:0;font-size:16px;font-weight:600">${MONTHS[m]} ${y}</h3>
    <button class="btn-c" id="cvm-today" style="font-size:12px">Today</button>
    <button class="btn-c" id="cvm-next" title="Next month" style="padding:4px 10px">
      <span class="material-icons-round">chevron_right</span>
    </button>
  </div>`;

  // Day headers
  h += `<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:1px;margin-bottom:4px">`;
  DAYS.forEach(d => {
    h += `<div style="text-align:center;font-weight:600;font-size:11px;color:var(--tx2);padding:4px">${d}</div>`;
  });
  h += `</div>`;

  // Grid
  h += `<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:1px;background:var(--brd);border:1px solid var(--brd);border-radius:var(--rs);overflow:hidden">`;

  const cur = new Date(startPad);
  while (cur <= endPad) {
    const dateStr = _toDateStr(cur);
    const isToday = dateStr === todayStr;
    const isCurrentMonth = cur.getMonth() === m;
    const dayTasks = tasksByDate[dateStr] || [];

    h += `<div class="cvm-cell" data-date="${dateStr}"
      style="background:var(--bg${isCurrentMonth ? '' : '2'});padding:6px;min-height:70px;cursor:pointer;${isToday ? 'border:2px solid var(--brand);' : ''}">
      <div style="font-weight:${isToday ? '700' : '400'};font-size:12px;color:${isToday ? 'var(--brand)' : isCurrentMonth ? 'var(--tx)' : 'var(--tx3, var(--tx2))'};margin-bottom:3px">
        ${cur.getDate()}
      </div>`;

    // Show up to 3 tasks, then "+N more"
    const visible = dayTasks.slice(0, 3);
    visible.forEach(t => {
      const overdue = t.due_date < todayStr && t.status !== 'done';
      h += `<div class="cvm-task-pill" data-id="${t.id}" title="${esc(t.title)}"
        style="font-size:10px;padding:2px 4px;border-radius:3px;margin-bottom:2px;
          background:${escA(t.goal_color || 'var(--brand)')}22;
          border-left:2px solid ${escA(t.goal_color || 'var(--brand)')};
          color:var(--tx);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
          ${t.status === 'done' ? 'opacity:0.5;text-decoration:line-through;' : ''}
          ${overdue ? 'border-left-color:var(--err);' : ''}">
        ${esc(t.title)}
      </div>`;
    });
    if (dayTasks.length > 3) {
      h += `<div style="font-size:10px;color:var(--tx2)">+${dayTasks.length - 3} more</div>`;
    }

    h += `</div>`;
    cur.setDate(cur.getDate() + 1);
  }
  h += `</div>`;

  // Selected day detail panel
  h += `<div id="cvm-day-detail" style="margin-top:16px;display:none">
    <div id="cvm-day-header" style="font-weight:600;font-size:14px;margin-bottom:8px"></div>
    <div id="cvm-day-tasks"></div>
  </div>`;

  h += `</div>`;
  c.innerHTML = h;

  // ─── Navigation ───
  document.getElementById('cvm-prev')?.addEventListener('click', () => {
    window.calViewM--;
    if (window.calViewM < 0) { window.calViewM = 11; window.calViewY--; }
    renderCalendarMonthView(c);
  });
  document.getElementById('cvm-next')?.addEventListener('click', () => {
    window.calViewM++;
    if (window.calViewM > 11) { window.calViewM = 0; window.calViewY++; }
    renderCalendarMonthView(c);
  });
  document.getElementById('cvm-today')?.addEventListener('click', () => {
    const now = new Date();
    window.calViewY = now.getFullYear();
    window.calViewM = now.getMonth();
    renderCalendarMonthView(c);
  });

  // ─── Day click ───
  const detail = document.getElementById('cvm-day-detail');
  const dayHeader = document.getElementById('cvm-day-header');
  const dayTasksEl = document.getElementById('cvm-day-tasks');
  let selectedDate = null;

  c.querySelectorAll('.cvm-cell').forEach(cell => {
    cell.addEventListener('click', e => {
      if (e.target.closest('.cvm-task-pill')) return;
      const date = cell.dataset.date;
      const dayTasks = tasksByDate[date] || [];
      selectedDate = date;

      // Highlight selected
      c.querySelectorAll('.cvm-cell').forEach(cl => cl.style.outline = '');
      cell.style.outline = '2px solid var(--brand)';

      const d = _parseDate(date);
      const DAYS_FULL = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
      dayHeader.innerHTML = `<span class="material-icons-round" style="font-size:14px;vertical-align:middle;margin-right:6px">event</span>
        ${DAYS_FULL[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}
        <button class="btn-c" id="cvm-quick-add" data-date="${date}" style="margin-left:12px;font-size:11px">
          <span class="material-icons-round" style="font-size:13px;vertical-align:middle">add</span> Add task
        </button>`;

      if (!dayTasks.length) {
        dayTasksEl.innerHTML = '<div style="color:var(--tx2);font-size:13px;padding:8px 0">No tasks for this day.</div>';
      } else {
        dayTasksEl.innerHTML = dayTasks.map(t => {
          const overdue = t.due_date < todayStr && t.status !== 'done';
          return `<div class="cvm-ddetail" data-id="${t.id}"
            style="display:flex;align-items:center;gap:8px;padding:8px;background:var(--bg2);
              border-radius:var(--rs);margin-bottom:6px;border-left:3px solid ${escA(t.goal_color || 'var(--brand)')}">
            <span class="cvm-status material-icons-round" data-id="${t.id}" data-status="${t.status}"
              style="font-size:18px;cursor:pointer;color:${t.status === 'done' ? 'var(--ok)' : overdue ? 'var(--err)' : 'var(--tx2)'}"
              title="Toggle status">
              ${t.status === 'done' ? 'check_circle' : 'radio_button_unchecked'}
            </span>
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:500;${t.status === 'done' ? 'text-decoration:line-through;opacity:.6' : ''}">${esc(t.title)}</div>
              ${t.goal_title ? `<div style="font-size:11px;color:var(--tx2)">${esc(t.area_name || '')} › ${esc(t.goal_title)}</div>` : ''}
            </div>
            ${t.priority > 0 ? `<span style="font-size:11px;color:${PC[t.priority]||''}">● ${PL[t.priority]}</span>` : ''}
          </div>`;
        }).join('');

        // Status toggle
        dayTasksEl.querySelectorAll('.cvm-status').forEach(btn => {
          btn.addEventListener('click', async () => {
            const newStatus = btn.dataset.status === 'done' ? 'todo' : 'done';
            await api.patch('/api/tasks/' + btn.dataset.id, { status: newStatus });
            await renderCalendarMonthView(c);
          });
        });
      }

      detail.style.display = 'block';

      // Quick add
      document.getElementById('cvm-quick-add')?.addEventListener('click', () => {
        const title = prompt('Task title:');
        if (!title) return;
        api.get('/api/goals?limit=1').then(async goalRes => {
          const goals = Array.isArray(goalRes) ? goalRes : (goalRes.items || []);
          if (!goals.length) {
            if (typeof showToast === 'function') showToast('Create a goal first', 'warn');
            return;
          }
          await api.post('/api/goals/' + goals[0].id + '/tasks', { title, due_date: date });
          await renderCalendarMonthView(c);
        });
      });
    });
  });

  // Task pill click = show in detail
  c.querySelectorAll('.cvm-task-pill').forEach(pill => {
    pill.addEventListener('click', e => {
      e.stopPropagation();
      const cell = pill.closest('.cvm-cell');
      if (cell) cell.click();
    });
  });
}
