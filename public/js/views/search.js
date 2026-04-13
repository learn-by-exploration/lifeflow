/**
 * Search View Module
 * Cross-feature real-time search across tasks, goals, and areas.
 * Global function: renderSearchView(container)
 * Dispatched from app.js when currentView === 'search'
 */

async function renderSearchView(container) {
  const c = container || document.getElementById('ct');

  let h = `<div class="sv-wrap" style="max-width:680px">`;

  // Search input
  h += `<div style="position:relative;margin-bottom:14px">
    <span class="material-icons-round" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--tx2);font-size:18px;pointer-events:none">search</span>
    <input type="text" id="sv-input" class="inp" placeholder="Search tasks, goals, areas…"
      autocomplete="off" autocorrect="off" spellcheck="false"
      style="width:100%;padding:10px 12px 10px 36px;font-size:14px;border-radius:var(--rc)">
    <button class="btn-c" id="sv-clear" title="Clear" style="position:absolute;right:6px;top:50%;transform:translateY(-50%);display:none;padding:3px 6px">
      <span class="material-icons-round" style="font-size:16px">close</span>
    </button>
  </div>`;

  // Filter chips
  h += `<div style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap">
    <button class="sv-chip active" data-type="all" style="font-size:12px;padding:4px 12px;border-radius:999px;border:1px solid var(--brand);background:var(--brand);color:#fff">All</button>
    <button class="sv-chip" data-type="tasks" style="font-size:12px;padding:4px 12px;border-radius:999px;border:1px solid var(--brd);background:transparent;color:var(--tx2)">Tasks</button>
    <button class="sv-chip" data-type="goals" style="font-size:12px;padding:4px 12px;border-radius:999px;border:1px solid var(--brd);background:transparent;color:var(--tx2)">Goals</button>
    <button class="sv-chip" data-type="areas" style="font-size:12px;padding:4px 12px;border-radius:999px;border:1px solid var(--brd);background:transparent;color:var(--tx2)">Areas</button>
  </div>`;

  // Results area
  h += `<div id="sv-results">
    <div style="text-align:center;padding:40px;color:var(--tx2)">
      <span class="material-icons-round" style="font-size:40px;display:block;margin-bottom:8px">manage_search</span>
      <div style="font-size:13px">Start typing to search across your tasks, goals, and areas.</div>
    </div>
  </div>`;

  h += `</div>`;
  c.innerHTML = h;

  const input = document.getElementById('sv-input');
  const results = document.getElementById('sv-results');
  const clearBtn = document.getElementById('sv-clear');
  let activeType = 'all';
  let searchTimeout = null;
  let lastQuery = '';

  // ─── Chip filter ───
  c.querySelectorAll('.sv-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      c.querySelectorAll('.sv-chip').forEach(ch => {
        ch.style.background = 'transparent';
        ch.style.borderColor = 'var(--brd)';
        ch.style.color = 'var(--tx2)';
        ch.classList.remove('active');
      });
      chip.style.background = 'var(--brand)';
      chip.style.borderColor = 'var(--brand)';
      chip.style.color = '#fff';
      chip.classList.add('active');
      activeType = chip.dataset.type;
      if (lastQuery) performSearch(lastQuery);
    });
  });

  // ─── Clear ───
  clearBtn.addEventListener('click', () => {
    input.value = '';
    clearBtn.style.display = 'none';
    lastQuery = '';
    showEmpty();
    input.focus();
  });

  // ─── Input ───
  input.addEventListener('input', () => {
    const q = input.value.trim();
    clearBtn.style.display = q ? 'inline-flex' : 'none';
    clearTimeout(searchTimeout);
    if (!q) { showEmpty(); lastQuery = ''; return; }
    searchTimeout = setTimeout(() => performSearch(q), 220);
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') clearBtn.click();
  });

  input.focus();

  function showEmpty() {
    results.innerHTML = `<div style="text-align:center;padding:40px;color:var(--tx2)">
      <span class="material-icons-round" style="font-size:40px;display:block;margin-bottom:8px">manage_search</span>
      <div style="font-size:13px">Start typing to search across your tasks, goals, and areas.</div>
    </div>`;
  }

  async function performSearch(q) {
    lastQuery = q;
    results.innerHTML = `<div style="color:var(--tx2);padding:8px 0;font-size:13px">Searching…</div>`;

    const promises = [];
    if (activeType === 'all' || activeType === 'tasks') promises.push(api.get('/api/tasks/search?q=' + encodeURIComponent(q)).catch(() => []));
    else promises.push(Promise.resolve([]));
    if (activeType === 'all' || activeType === 'goals') promises.push(api.get('/api/goals?q=' + encodeURIComponent(q)).catch(() => []));
    else promises.push(Promise.resolve([]));
    if (activeType === 'all' || activeType === 'areas') promises.push(api.get('/api/areas').catch(() => []));
    else promises.push(Promise.resolve([]));

    const [tasks, goals, areas] = await Promise.all(promises);

    const taskArr = Array.isArray(tasks) ? tasks : [];
    const goalArr = Array.isArray(goals) ? (goals.items || goals) : [];
    // Filter areas by query (client-side since no search endpoint)
    const areaArr = Array.isArray(areas) ? areas.filter(a =>
      a.name.toLowerCase().includes(q.toLowerCase())
    ) : [];

    // If no results
    if (!taskArr.length && !goalArr.length && !areaArr.length) {
      results.innerHTML = `<div style="text-align:center;padding:40px;color:var(--tx2)">
        <span class="material-icons-round" style="font-size:40px;display:block;margin-bottom:8px">search_off</span>
        <div style="font-size:13px">No results for <strong>${esc(q)}</strong></div>
      </div>`;
      return;
    }

    let html = '';
    const todayStr = _toDateStr(new Date());

    // ─── Tasks ───
    if (taskArr.length) {
      html += `<div style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--tx2);font-weight:600;margin-bottom:6px;margin-top:4px">
        <span class="material-icons-round" style="font-size:12px;vertical-align:middle">checklist</span> Tasks (${taskArr.length})
      </div>`;
      taskArr.slice(0, 20).forEach(t => {
        const overdue = t.due_date && t.due_date < todayStr && t.status !== 'done';
        html += `<div class="sv-result-task" data-id="${t.id}" tabindex="0"
          style="display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:var(--rs);
            margin-bottom:4px;cursor:pointer;background:var(--bg2);border:1px solid var(--brd);
            border-left:3px solid ${escA(t.goal_color || 'var(--brand)')}">
          <span class="material-icons-round" style="font-size:16px;color:${t.status === 'done' ? 'var(--ok)' : 'var(--tx2)'};flex-shrink:0">
            ${t.status === 'done' ? 'check_circle' : 'radio_button_unchecked'}
          </span>
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:500;${t.status === 'done' ? 'text-decoration:line-through;opacity:.6;' : ''}">
              ${_highlightMatch(t.title, q)}
            </div>
            <div style="font-size:11px;color:var(--tx2)">
              ${esc(t.area_name || '')}${t.goal_title ? ' › ' + esc(t.goal_title) : ''}
              ${t.due_date ? ` · <span style="color:${overdue ? 'var(--err)' : 'inherit'}">${fmtDue(t.due_date)}</span>` : ''}
            </div>
          </div>
          ${t.priority > 0 ? `<span style="font-size:11px;color:${PC[t.priority]||''};flex-shrink:0">● ${PL[t.priority]}</span>` : ''}
        </div>`;
      });
    }

    // ─── Goals ───
    if (goalArr.length) {
      html += `<div style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--tx2);font-weight:600;margin-bottom:6px;margin-top:12px">
        <span class="material-icons-round" style="font-size:12px;vertical-align:middle">flag</span> Goals (${goalArr.length})
      </div>`;
      goalArr.slice(0, 10).forEach(g => {
        const pct = g.total_tasks ? Math.round((g.done_tasks || 0) / g.total_tasks * 100) : 0;
        html += `<div class="sv-result-goal" data-id="${g.id}" tabindex="0"
          style="display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:var(--rs);
            margin-bottom:4px;cursor:pointer;background:var(--bg2);border:1px solid var(--brd);
            border-left:3px solid ${escA(g.color || 'var(--brand)')}">
          <span class="material-icons-round" style="font-size:16px;color:${escA(g.color || 'var(--brand)')};flex-shrink:0">flag</span>
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:500">${_highlightMatch(g.title, q)}</div>
            <div style="font-size:11px;color:var(--tx2)">${pct}% complete${g.due_date ? ' · Due ' + fmtDue(g.due_date) : ''}</div>
          </div>
        </div>`;
      });
    }

    // ─── Areas ───
    if (areaArr.length) {
      html += `<div style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--tx2);font-weight:600;margin-bottom:6px;margin-top:12px">
        <span class="material-icons-round" style="font-size:12px;vertical-align:middle">category</span> Areas (${areaArr.length})
      </div>`;
      areaArr.slice(0, 5).forEach(a => {
        html += `<div class="sv-result-area" data-id="${a.id}" tabindex="0"
          style="display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:var(--rs);
            margin-bottom:4px;cursor:pointer;background:var(--bg2);border:1px solid var(--brd);
            border-left:3px solid ${escA(a.color || 'var(--brand)')}">
          <span style="font-size:20px;flex-shrink:0">${esc(a.icon || '📋')}</span>
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:500">${_highlightMatch(a.name, q)}</div>
          </div>
        </div>`;
      });
    }

    results.innerHTML = html;

    // ─── Click handlers ───
    results.querySelectorAll('.sv-result-task').forEach(el => {
      el.addEventListener('click', () => {
        // Navigate to board view and scroll/open the task if openTask is available
        if (typeof openTaskDetail === 'function') {
          openTaskDetail(Number(el.dataset.id));
        } else if (window.currentView !== undefined) {
          window.currentView = 'board';
          if (typeof render === 'function') render();
        }
      });
    });

    results.querySelectorAll('.sv-result-goal').forEach(el => {
      el.addEventListener('click', () => {
        if (window.currentView !== undefined) {
          window.currentView = 'goals';
          if (typeof render === 'function') render();
        }
      });
    });

    results.querySelectorAll('.sv-result-area').forEach(el => {
      el.addEventListener('click', () => {
        if (window.activeAreaId !== undefined) {
          window.activeAreaId = Number(el.dataset.id);
          window.currentView = 'area';
          if (typeof render === 'function') render();
        }
      });
    });
  }
}

// Highlight matching text in result items
function _highlightMatch(text, q) {
  if (!q) return esc(text);
  const escaped = esc(text);
  const escQ = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return escaped.replace(
    new RegExp('(' + escQ.split('').map(ch => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('') + ')', 'gi'),
    '<mark style="background:var(--brand)33;border-radius:2px;padding:0 1px">$1</mark>'
  );
}
