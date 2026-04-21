/**
 * Problems View — Full Feature (matches wireframe v1)
 * Screens: List · Detail · Board · Insights
 * Global: renderProblemsView(container)
 */

/* ── Constants ── */
const PV_PHASES = ['capture','diagnose','explore','decide','act','review'];
const PV_PHASE_META = {
  capture:  { icon:'edit_note',    label:'Capture',  color:'#3b82f6' },
  diagnose: { icon:'troubleshoot', label:'Diagnose', color:'var(--warn)' },
  explore:  { icon:'explore',      label:'Explore',  color:'#8b5cf6' },
  decide:   { icon:'gavel',        label:'Decide',   color:'#ea580c' },
  act:      { icon:'bolt',         label:'Act',      color:'var(--ok)' },
  review:   { icon:'rate_review',  label:'Review',   color:'#0891b2' },
  resolved: { icon:'check_circle', label:'Resolved', color:'var(--ok)' },
  shelved:  { icon:'archive',      label:'Shelved',  color:'var(--txd)' },
};
const PV_EMOTIONS = ['anxious','overwhelmed','stuck','frustrated','scared','confused','angry','sad','guilty','hopeful','numb','uncertain','conflicted','ashamed','relieved','confident','determined','calm'];
const PV_EMOTION_EMOJI = {anxious:'😰',overwhelmed:'😟',stuck:'😔',frustrated:'😤',scared:'😱',confused:'😶',angry:'😠',sad:'😢',guilty:'😞',hopeful:'🙂',numb:'😶',uncertain:'🤔',conflicted:'😰',ashamed:'😳',relieved:'😌',confident:'💪',determined:'🔥',calm:'😌'};
const PV_CATEGORIES = ['uncategorized','career','relationships','financial','health','health_wellness','personal_growth','education','home','creative','social','existential'];
const PV_CAT_ICONS = {career:'work',relationships:'favorite',financial:'account_balance',health:'health_and_safety',health_wellness:'spa',personal_growth:'self_improvement',education:'school',home:'home',creative:'palette',social:'groups',existential:'psychology',uncategorized:'help_outline'};

let _pvProblems = [];
let _pvCurrentScreen = 'list';
let _pvCurrentProblem = null;
let _pvContainer = null;

/* ═══════════════════════════════════════════════════ */
/*  ENTRY POINT                                        */
/* ═══════════════════════════════════════════════════ */
async function renderProblemsView(container) {
  _pvContainer = container || document.getElementById('ct');
  _pvContainer.innerHTML = '<div style="color:var(--tx2);padding:16px">Loading problems…</div>';

  try {
    const result = await api.get('/api/problems?limit=100');
    _pvProblems = result?.data || result?.items || (Array.isArray(result) ? result : []);
  } catch (e) {
    _pvContainer.innerHTML = '<div style="color:var(--err);padding:16px">Failed to load problems.</div>';
    return;
  }

  _pvCurrentScreen = 'list';
  _pvCurrentProblem = null;
  _pvRender();
}

function _pvRender() {
  if (_pvCurrentScreen === 'detail' && _pvCurrentProblem) {
    _pvRenderDetail();
  } else if (_pvCurrentScreen === 'board') {
    _pvRenderBoard();
  } else if (_pvCurrentScreen === 'stats') {
    _pvRenderStats();
  } else {
    _pvRenderList();
  }
}

/* ═══════════════════════════════════════════════════ */
/*  SCREEN 1: PROBLEM LIST                             */
/* ═══════════════════════════════════════════════════ */
function _pvRenderList() {
  const active = _pvProblems.filter(p => p.status === 'active' || p.status === 'paused');
  const count = active.length;
  const urgent = active.filter(p => p.urgency >= 2).length;

  let h = '<div class="pv">';
  h += _pvTabs('list');

  // Header
  h += `<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px;gap:12px;flex-wrap:wrap">
    <div>
      <div style="font-size:20px;font-weight:700;color:var(--tx)">All Active Problems</div>
      <div style="font-size:13px;color:var(--txd)">${count} problem${count !== 1 ? 's' : ''}${urgent ? ' · ' + urgent + ' need attention' : ''}</div>
    </div>
    <button class="pv-btn-s" id="pv-new" style="font-size:13px;padding:8px 16px"><span class="material-icons-round" style="font-size:16px;vertical-align:middle">add</span> New Problem</button>
  </div>`;

  // Filter pills
  h += '<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">';
  h += '<select id="pv-f-phase" class="pv-fsel" style="width:auto;min-width:120px;padding:6px 10px;font-size:12px"><option value="">All Phases</option>';
  PV_PHASES.forEach(p => h += `<option value="${p}">${PV_PHASE_META[p].label}</option>`);
  h += '</select>';
  h += '<select id="pv-f-status" class="pv-fsel" style="width:auto;min-width:110px;padding:6px 10px;font-size:12px"><option value="">All Status</option><option value="active">Active</option><option value="paused">Paused</option><option value="resolved">Resolved</option><option value="shelved">Shelved</option></select>';
  h += '<select id="pv-f-cat" class="pv-fsel" style="width:auto;min-width:130px;padding:6px 10px;font-size:12px"><option value="">All Categories</option>';
  PV_CATEGORIES.filter(c => c !== 'uncategorized').forEach(c => h += `<option value="${c}">${_pvCatLabel(c)}</option>`);
  h += '</select></div>';

  // List
  h += '<div id="pv-list">';
  if (!_pvProblems.length) {
    h += _pvEmptyState();
  } else {
    _pvProblems.forEach(p => { h += _pvListItem(p); });
  }
  h += '</div></div>';

  _pvContainer.innerHTML = h;
  _pvBindListEvents();
}

function _pvListItem(p) {
  const pm = PV_PHASE_META[p.phase] || PV_PHASE_META.capture;
  const isTerminal = p.phase === 'resolved' || p.phase === 'shelved';
  const emotions = (p.emotional_state || '').split(',').filter(Boolean);
  const emotionFirst = emotions[0];
  const emoji = PV_EMOTION_EMOJI[emotionFirst] || '';
  const catLabel = p.category && p.category !== 'uncategorized' ? _pvCatLabel(p.category) : '';
  const urgDots = _pvDots(p.urgency || 0, 3);
  const dateStr = _pvRelDate(p.updated_at || p.created_at);

  return `<div class="pi" data-id="${p.id}" data-phase="${p.phase}" data-status="${p.status||'active'}" data-cat="${p.category||''}">
    <div class="pi-icon ${esc(p.phase)}"><span class="material-icons-round">${pm.icon}</span></div>
    <div class="pi-body">
      <div class="pi-title"${isTerminal ? ' style="text-decoration:line-through;opacity:.6"' : ''}>${esc(p.title)}</div>
      ${p.description ? `<div class="pi-desc">${esc(p.description)}</div>` : ''}
      <div class="pi-meta">
        <span class="pi-tag phase">${pm.label}</span>
        ${emotionFirst ? `<span class="pi-tag emotion">${emoji} ${esc(emotionFirst)}</span>` : ''}
        ${p.urgency >= 2 ? '<span class="pi-tag urg-high">⏰ Urgent</span>' : ''}
        ${catLabel ? `<span class="pi-tag category">${esc(catLabel)}</span>` : ''}
        ${p.privacy_level === 'private' ? '<span class="pi-tag private">🔒 Private</span>' : ''}
      </div>
    </div>
    <div class="pi-right">
      <div class="pi-date">${dateStr}</div>
      <div class="pi-dots">${urgDots}</div>
    </div>
  </div>`;
}

function _pvBindListEvents() {
  _pvContainer.querySelectorAll('.pi[data-id]').forEach(el => {
    el.addEventListener('click', () => _pvOpenDetail(Number(el.dataset.id)));
  });
  _pvBindTabs();
  document.getElementById('pv-new')?.addEventListener('click', () => _pvOpenNewSheet());
  const applyFilter = () => {
    const phase = document.getElementById('pv-f-phase')?.value || '';
    const status = document.getElementById('pv-f-status')?.value || '';
    const cat = document.getElementById('pv-f-cat')?.value || '';
    _pvContainer.querySelectorAll('.pi[data-id]').forEach(el => {
      const ok = (!phase || el.dataset.phase === phase) && (!status || el.dataset.status === status) && (!cat || el.dataset.cat === cat);
      el.style.display = ok ? '' : 'none';
    });
  };
  document.getElementById('pv-f-phase')?.addEventListener('change', applyFilter);
  document.getElementById('pv-f-status')?.addEventListener('change', applyFilter);
  document.getElementById('pv-f-cat')?.addEventListener('change', applyFilter);
}

/* ═══════════════════════════════════════════════════ */
/*  SCREEN 2: PROBLEM DETAIL                           */
/* ═══════════════════════════════════════════════════ */
async function _pvOpenDetail(id) {
  _pvContainer.innerHTML = '<div style="color:var(--tx2);padding:16px">Loading…</div>';
  try {
    _pvCurrentProblem = await api.get('/api/problems/' + id);
    _pvCurrentScreen = 'detail';
    _pvRenderDetail();
  } catch (e) {
    showToast('Failed to load problem', null, 3000);
    _pvCurrentScreen = 'list';
    _pvRenderList();
  }
}

function _pvRenderDetail() {
  const p = _pvCurrentProblem;
  if (!p) return;
  const pm = PV_PHASE_META[p.phase] || PV_PHASE_META.capture;
  const isTerminal = p.phase === 'resolved' || p.phase === 'shelved';
  const emotions = (p.emotional_state || '').split(',').filter(Boolean);
  const catLabel = _pvCatLabel(p.category);
  const daysSince = Math.round((Date.now() - new Date(p.created_at).getTime()) / 864e5);

  let h = '<div class="pv">';

  // Back + title
  h += `<div style="margin-bottom:16px">
    <button class="pv-link" id="pv-back" style="margin-bottom:8px;padding-left:0"><span class="material-icons-round">arrow_back</span> All Problems</button>
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">
      <div>
        <div style="font-size:22px;font-weight:700;color:var(--tx)">${esc(p.title)}</div>
        <div style="font-size:13px;color:var(--txd)">${catLabel} · Created ${daysSince}d ago · Phase: ${pm.label}</div>
      </div>
      <div style="display:flex;gap:4px">
        <button class="pv-link" id="pv-edit-btn" title="Edit"><span class="material-icons-round">edit</span></button>
        ${!isTerminal ? `<button class="pv-link" id="pv-advance-btn" title="Advance phase"><span class="material-icons-round">arrow_forward</span></button>` : ''}
        ${!isTerminal ? `<button class="pv-link" id="pv-resolve-btn" title="Resolve" style="color:var(--ok)"><span class="material-icons-round">check_circle</span></button>` : ''}
        <button class="pv-link" id="pv-del-btn" title="Delete" style="color:var(--err)"><span class="material-icons-round">delete</span></button>
      </div>
    </div>
  </div>`;

  // Phase Stepper
  h += _pvPhaseStepper(p.phase);

  // Deadline
  if (p.deadline) {
    const daysLeft = Math.round((new Date(p.deadline).getTime() - Date.now()) / 864e5);
    const deadColor = daysLeft <= 7 ? 'var(--err)' : 'var(--warn)';
    h += `<div class="cm" style="background:color-mix(in srgb,${deadColor} 8%,var(--bg-s));border:1px solid color-mix(in srgb,${deadColor} 15%,transparent)">
      <span class="material-icons-round" style="font-size:20px;color:${deadColor}">schedule</span>
      <span style="font-weight:600;color:${deadColor};white-space:nowrap">Decision Deadline</span>
      <span style="flex:1;color:var(--tx2)">Due <strong style="color:${deadColor}">${new Date(p.deadline).toLocaleDateString()}</strong></span>
      <span style="font-size:12px;color:${deadColor};font-weight:600">${daysLeft > 0 ? daysLeft + 'd left' : Math.abs(daysLeft) + 'd overdue'}</span>
    </div>`;
  }

  // Description
  if (p.description) {
    h += `<div class="pv-card">
      <div class="pv-card-h"><h3><span class="material-icons-round">description</span> Description</h3></div>
      <div style="font-size:14px;line-height:1.6;color:var(--tx2);white-space:pre-wrap">${esc(p.description)}</div>
    </div>`;
  }

  // Emotional State
  h += `<div class="pv-card">
    <div class="pv-card-h"><h3><span class="material-icons-round" style="color:var(--warn)">mood</span> How I'm Feeling</h3></div>
    <div class="em-pick">`;
  PV_EMOTIONS.forEach(e => {
    const sel = emotions.includes(e) ? ' sel' : '';
    h += `<span class="em-tag${sel}" data-emotion="${e}">${PV_EMOTION_EMOJI[e] || ''} ${e}</span>`;
  });
  h += '</div></div>';

  // Stakeholders
  const stakeholders = p.stakeholders || [];
  h += `<div class="pv-card">
    <div class="pv-card-h"><h3><span class="material-icons-round" style="color:#3b82f6">group</span> People Involved (${stakeholders.length})</h3>
      <button class="pv-link" id="pv-add-sh"><span class="material-icons-round">add</span> Add</button></div>`;
  if (stakeholders.length) {
    h += '<div class="sh-grid">';
    stakeholders.forEach(s => {
      const infColor = s.influence === 'high' ? 'var(--err)' : s.influence === 'medium' ? 'var(--warn)' : 'var(--ok)';
      const stanceIcon = s.influence === 'high' ? '🔴' : s.influence === 'medium' ? '🟡' : '🟢';
      h += `<div class="sh-chip">
        <div class="sh-av" style="background:color-mix(in srgb,${infColor} 12%,transparent);color:${infColor}">${esc(s.name.charAt(0).toUpperCase())}</div>
        <div style="flex:1;min-width:0"><div class="sh-name">${esc(s.name)}</div><div class="sh-stance">${stanceIcon} ${esc(s.role || '')}${s.notes ? ' — ' + esc(s.notes) : ''}</div></div>
      </div>`;
    });
    h += '</div>';
  } else {
    h += '<div style="font-size:13px;color:var(--txd);padding:8px 0">No stakeholders added yet.</div>';
  }
  h += '</div>';

  // Reframes
  const reframes = p.reframes || [];
  h += `<div class="pv-card">
    <div class="pv-card-h"><h3><span class="material-icons-round" style="color:#8b5cf6">lightbulb</span> Reframes (${reframes.length})</h3>
      <button class="pv-link" id="pv-add-rf"><span class="material-icons-round">add</span> Add</button></div>`;
  if (reframes.length) {
    reframes.forEach(r => {
      const srcIcon = r.source === 'ai' ? '<span class="material-icons-round" style="font-size:14px;color:#0891b2">auto_awesome</span> AI' : '<span class="material-icons-round" style="font-size:14px">person</span> You';
      h += `<div style="padding:8px 0;border-bottom:1px solid var(--brd);font-size:14px;line-height:1.6;color:var(--tx2)">
        <div style="font-size:11px;color:var(--txd);margin-bottom:2px;display:flex;align-items:center;gap:4px">${srcIcon}</div>
        "${esc(r.reframe_text)}"
      </div>`;
    });
  } else {
    h += '<div style="font-size:13px;color:var(--txd);padding:8px 0">Reframe to see the problem from a new angle.</div>';
  }
  h += '</div>';

  // Options
  const options = p.options || [];
  const decision = p.decision || null;
  h += `<div class="pv-card">
    <div class="pv-card-h"><h3><span class="material-icons-round" style="color:#3b82f6">compare_arrows</span> Options (${options.length})</h3>
      <button class="pv-link" id="pv-add-opt"><span class="material-icons-round">add</span> Add</button></div>`;
  if (options.length) {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    options.forEach((o, i) => {
      const isChosen = decision && decision.chosen_option_id === o.id;
      h += `<div class="oc${isChosen ? ' chosen' : ''}">
        <div class="oc-h">
          <div class="oc-num">${letters[i] || i + 1}</div>
          <div class="oc-title">${esc(o.title)}</div>
          ${o.source === 'ai' ? '<span class="oc-src">AI generated</span>' : ''}
        </div>`;
      if (o.pros || o.cons) {
        h += `<div class="oc-body">
          <div class="oc-pros"><div class="oc-plabel">✓ Pros</div>${esc(o.pros || 'None listed')}</div>
          <div class="oc-cons"><div class="oc-clabel">✗ Cons</div>${esc(o.cons || 'None listed')}</div>
        </div>`;
      }
      if (o.impact || o.risk || o.emotional_fit) {
        h += '<div class="oc-scores">';
        if (o.impact) h += _pvScoreDots('Impact', o.impact, 5);
        if (o.risk) h += _pvScoreDots('Risk', o.risk, 5);
        if (o.emotional_fit) h += _pvScoreDots('Fit', o.emotional_fit, 5);
        if (o.effort) h += _pvScoreDots('Effort', o.effort, 5);
        h += '</div>';
      }
      h += '</div>';
    });
  } else {
    h += '<div style="font-size:13px;color:var(--txd);padding:8px 0">Add options to compare different paths forward.</div>';
  }
  h += '</div>';

  // Decision
  if (decision) {
    const chosenOpt = options.find(o => o.id === decision.chosen_option_id);
    h += `<div class="pv-card" style="border-color:var(--ok);background:color-mix(in srgb,var(--ok) 6%,var(--bg-s))">
      <div class="pv-card-h"><h3 style="color:var(--ok)"><span class="material-icons-round">task_alt</span> Decision Made</h3></div>
      <div style="font-size:14px;color:var(--tx)">
        ${chosenOpt ? `<div style="margin-bottom:6px"><strong>Chosen:</strong> ${esc(chosenOpt.title)}</div>` : ''}
        ${decision.rationale ? `<div style="margin-bottom:6px"><strong>Why:</strong> ${esc(decision.rationale)}</div>` : ''}
        <div style="display:flex;gap:12px;font-size:13px;color:var(--tx2);margin-top:8px">
          <span>Confidence: ${_pvConfDots(decision.confidence_level || 3)}</span>
          ${decision.revisit_date ? `<span>Revisit: ${new Date(decision.revisit_date).toLocaleDateString()}</span>` : ''}
        </div>
      </div>
    </div>`;
  }

  // Actions
  const actions = p.actions || [];
  const doneCount = actions.filter(a => a.status === 'done').length;
  h += `<div class="pv-card">
    <div class="pv-card-h"><h3><span class="material-icons-round" style="color:var(--ok)">checklist</span> Actions (${doneCount}/${actions.length})</h3>
      <button class="pv-link" id="pv-add-act"><span class="material-icons-round">add</span> Add</button></div>`;
  if (actions.length) {
    actions.forEach(a => {
      const isDone = a.status === 'done';
      h += `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--brd)">
        <div class="pv-act-ck${isDone ? ' done' : ''}" data-aid="${a.id}" style="width:22px;height:22px;border-radius:50%;border:2px solid ${isDone ? 'var(--ok)' : 'var(--txd)'};flex-shrink:0;display:flex;align-items:center;justify-content:center;cursor:pointer;${isDone ? 'background:var(--ok)' : ''}">
          ${isDone ? '<span style="color:#fff;font-size:11px;font-weight:700">✓</span>' : ''}
        </div>
        <span style="font-size:14px;flex:1;color:var(--tx);${isDone ? 'text-decoration:line-through;color:var(--txd)' : ''}">${esc(a.description || a.title || '')}</span>
        ${a.due_date ? `<span style="font-size:11px;color:var(--txd)">${fmtDue(a.due_date)}</span>` : ''}
      </div>`;
    });
  } else {
    h += '<div style="font-size:13px;color:var(--txd);padding:8px 0">No actions yet. Add tasks to move forward.</div>';
  }
  h += '</div>';

  // Thinking Journal
  const journal = p.journal || [];
  h += `<div class="pv-card">
    <div class="pv-card-h"><h3><span class="material-icons-round" style="color:#3b82f6">menu_book</span> Thinking Journal (${journal.length})</h3>
      <button class="pv-link" id="pv-add-je"><span class="material-icons-round">add</span> Add Entry</button></div>`;
  if (journal.length) {
    journal.forEach((j, idx) => {
      const type = j.entry_type || 'reflection';
      const isLast = idx === journal.length - 1;
      h += `<div class="je">
        <div class="je-tl"><div class="je-dot ${esc(type)}"></div>${!isLast ? '<div class="je-line"></div>' : ''}</div>
        <div class="je-body">
          <div class="je-head"><span class="je-type ${esc(type)}">${esc(type)}</span><span class="je-date">${_pvRelDate(j.created_at)}</span></div>
          <div class="je-text">${esc(j.content)}</div>
        </div>
      </div>`;
    });
  } else {
    h += '<div style="font-size:13px;color:var(--txd);padding:8px 0">Document your thinking as you work through this.</div>';
  }
  h += '</div>';

  h += '</div>';
  _pvContainer.innerHTML = h;
  _pvBindDetailEvents();
}

function _pvBindDetailEvents() {
  const p = _pvCurrentProblem;
  const id = p.id;

  document.getElementById('pv-back')?.addEventListener('click', () => { _pvCurrentScreen = 'list'; _pvCurrentProblem = null; renderProblemsView(_pvContainer); });

  document.getElementById('pv-del-btn')?.addEventListener('click', async () => {
    if (!confirm('Delete this problem permanently?')) return;
    await api.del('/api/problems/' + id);
    _pvCurrentScreen = 'list'; _pvCurrentProblem = null;
    renderProblemsView(_pvContainer);
  });

  document.getElementById('pv-resolve-btn')?.addEventListener('click', async () => {
    if (!confirm('Mark as resolved?')) return;
    await api.put('/api/problems/' + id + '/phase', { phase: 'resolved' });
    _pvOpenDetail(id);
  });

  document.getElementById('pv-advance-btn')?.addEventListener('click', async () => {
    const idx = PV_PHASES.indexOf(p.phase);
    const next = idx >= 0 && idx < PV_PHASES.length - 1 ? PV_PHASES[idx + 1] : null;
    if (!next) { showToast('Already at final active phase', null, 3000); return; }
    await api.put('/api/problems/' + id + '/phase', { phase: next });
    _pvOpenDetail(id);
  });

  document.getElementById('pv-edit-btn')?.addEventListener('click', () => _pvOpenNewSheet(p));

  _pvContainer.querySelectorAll('.pv-act-ck').forEach(el => {
    el.addEventListener('click', async () => {
      const aid = el.dataset.aid;
      const isDone = el.classList.contains('done');
      await api.put('/api/actions/' + aid, { status: isDone ? 'pending' : 'done' });
      _pvOpenDetail(id);
    });
  });

  document.getElementById('pv-add-sh')?.addEventListener('click', () => {
    const name = prompt('Stakeholder name:');
    if (!name?.trim()) return;
    const role = prompt('Role (e.g. spouse, manager):') || '';
    const influence = prompt('Influence (high/medium/low):') || 'medium';
    api.post('/api/problems/' + id + '/stakeholders', { name: name.trim(), role, influence }).then(() => _pvOpenDetail(id));
  });

  document.getElementById('pv-add-rf')?.addEventListener('click', () => {
    const text = prompt('Reframe this problem:');
    if (!text?.trim()) return;
    api.post('/api/problems/' + id + '/reframes', { reframe_text: text.trim(), source: 'user' }).then(() => _pvOpenDetail(id));
  });

  document.getElementById('pv-add-opt')?.addEventListener('click', () => {
    const title = prompt('Option title:');
    if (!title?.trim()) return;
    const pros = prompt('Pros:') || '';
    const cons = prompt('Cons:') || '';
    api.post('/api/problems/' + id + '/options', { title: title.trim(), pros, cons }).then(() => _pvOpenDetail(id));
  });

  document.getElementById('pv-add-act')?.addEventListener('click', () => {
    const desc = prompt('Action to take:');
    if (!desc?.trim()) return;
    api.post('/api/problems/' + id + '/actions', { description: desc.trim() }).then(() => _pvOpenDetail(id));
  });

  document.getElementById('pv-add-je')?.addEventListener('click', () => {
    const content = prompt('What are you thinking?');
    if (!content?.trim()) return;
    const type = prompt('Type (reflection/insight/question/breakthrough/setback):') || 'reflection';
    api.post('/api/problems/' + id + '/journal', { content: content.trim(), entry_type: type }).then(() => _pvOpenDetail(id));
  });

  _pvContainer.querySelectorAll('.em-tag').forEach(el => {
    el.addEventListener('click', async () => {
      const emotion = el.dataset.emotion;
      const current = (p.emotional_state || '').split(',').filter(Boolean);
      let next;
      if (current.includes(emotion)) {
        next = current.filter(e => e !== emotion);
      } else {
        next = [...current, emotion];
      }
      await api.put('/api/problems/' + id, { emotional_state: next.join(',') });
      _pvOpenDetail(id);
    });
  });
}

/* ═══════════════════════════════════════════════════ */
/*  SCREEN 3: BOARD (Kanban by Phase)                  */
/* ═══════════════════════════════════════════════════ */
function _pvRenderBoard() {
  const byPhase = {};
  PV_PHASES.forEach(p => byPhase[p] = []);
  _pvProblems.forEach(p => {
    if (byPhase[p.phase]) byPhase[p.phase].push(p);
  });

  let h = '<div class="pv">';
  h += _pvTabs('board');
  h += '<div style="font-size:20px;font-weight:700;color:var(--tx);margin-bottom:4px">Problem Board</div>';
  h += '<div style="font-size:13px;color:var(--txd);margin-bottom:16px">Problems organized by phase</div>';
  h += '<div class="kb-wrap">';

  PV_PHASES.forEach(phase => {
    const items = byPhase[phase];
    const pm = PV_PHASE_META[phase];
    h += `<div class="kb-col">
      <div class="kb-col-title" style="color:${pm.color}">
        <span class="material-icons-round">${pm.icon}</span> ${pm.label}
        <span class="cnt" style="background:color-mix(in srgb,${pm.color} 15%,transparent);color:${pm.color}">${items.length}</span>
      </div>`;
    if (items.length) {
      items.forEach(p => {
        const emotions = (p.emotional_state || '').split(',').filter(Boolean);
        const em1 = emotions[0];
        h += `<div class="kb-card" data-id="${p.id}">
          <div class="kb-card-title">${esc(p.title)}</div>
          <div class="kb-card-cat">${_pvCatLabel(p.category)}</div>
          ${em1 ? `<div style="margin-top:6px"><span class="pi-tag emotion" style="font-size:10px">${PV_EMOTION_EMOJI[em1]||''} ${esc(em1)}</span></div>` : ''}
          ${p.urgency >= 2 ? '<div style="margin-top:4px"><span class="pi-tag urg-high" style="font-size:10px">⏰ Urgent</span></div>' : ''}
        </div>`;
      });
    } else {
      h += `<div style="text-align:center;padding:24px 8px;color:var(--txd);font-size:12px">
        <span class="material-icons-round" style="font-size:28px;display:block;margin-bottom:4px;opacity:.4">${pm.icon}</span>
        Empty
      </div>`;
    }
    h += '</div>';
  });

  h += '</div></div>';
  _pvContainer.innerHTML = h;

  _pvContainer.querySelectorAll('.kb-card[data-id]').forEach(el => {
    el.addEventListener('click', () => _pvOpenDetail(Number(el.dataset.id)));
  });
  _pvBindTabs();
}

/* ═══════════════════════════════════════════════════ */
/*  SCREEN 4: INSIGHTS / STATS                        */
/* ═══════════════════════════════════════════════════ */
async function _pvRenderStats() {
  let stats = {};
  try { stats = await api.get('/api/problems/stats') || {}; } catch (e) { /* continue */ }

  const total = _pvProblems.length;
  const resolved = _pvProblems.filter(p => p.status === 'resolved').length;
  const active = _pvProblems.filter(p => p.status === 'active').length;
  const resRate = total ? Math.round((resolved / total) * 100) : 0;

  const resolvedProblems = _pvProblems.filter(p => p.status === 'resolved' && p.resolved_at && p.created_at);
  let avgDays = 0;
  if (resolvedProblems.length) {
    const totalDays = resolvedProblems.reduce((sum, p) => sum + Math.round((new Date(p.resolved_at) - new Date(p.created_at)) / 864e5), 0);
    avgDays = Math.round(totalDays / resolvedProblems.length);
  }

  const catCount = {};
  _pvProblems.forEach(p => {
    const c = p.category || 'uncategorized';
    catCount[c] = (catCount[c] || 0) + 1;
  });
  const catEntries = Object.entries(catCount).sort((a, b) => b[1] - a[1]);
  const maxCat = catEntries.length ? catEntries[0][1] : 1;

  const emCount = {};
  _pvProblems.forEach(p => {
    (p.emotional_state || '').split(',').filter(Boolean).forEach(e => {
      emCount[e] = (emCount[e] || 0) + 1;
    });
  });
  const emEntries = Object.entries(emCount).sort((a, b) => b[1] - a[1]).slice(0, 6);

  let h = '<div class="pv">';
  h += _pvTabs('stats');
  h += '<div style="font-size:20px;font-weight:700;color:var(--tx);margin-bottom:4px">Problem Insights</div>';
  h += '<div style="font-size:13px;color:var(--txd);margin-bottom:16px">Your thinking patterns and resolution stats</div>';

  h += '<div class="st-grid">';
  h += `<div class="st-card"><div class="st-val" style="color:var(--brand)">${total}</div><div class="st-label">Total Problems</div></div>`;
  h += `<div class="st-card"><div class="st-val" style="color:var(--ok)">${resolved}</div><div class="st-label">Resolved</div><div class="st-trend up">${resRate}% rate</div></div>`;
  h += `<div class="st-card"><div class="st-val" style="color:#3b82f6">${active}</div><div class="st-label">Active</div></div>`;
  h += `<div class="st-card"><div class="st-val" style="color:#0891b2">${avgDays || '—'}</div><div class="st-label">Avg Days to Resolve</div></div>`;
  h += '</div>';

  if (catEntries.length) {
    h += '<div class="pv-card"><div class="pv-card-h"><h3><span class="material-icons-round" style="color:var(--brand)">donut_large</span> By Category</h3></div>';
    catEntries.forEach(([cat, count]) => {
      const pct = Math.round((count / maxCat) * 100);
      h += `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--brd)">
        <span style="font-size:14px;font-weight:500;color:var(--tx)">${_pvCatLabel(cat)}</span>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="width:100px;height:6px;background:var(--bg-c);border-radius:100px;overflow:hidden"><div style="width:${pct}%;height:100%;background:var(--brand);border-radius:100px"></div></div>
          <span style="font-size:13px;font-weight:600;min-width:28px;text-align:right;color:var(--tx)">${count}</span>
        </div>
      </div>`;
    });
    h += '</div>';
  }

  if (emEntries.length) {
    h += '<div class="pv-card"><div class="pv-card-h"><h3><span class="material-icons-round" style="color:var(--warn)">psychology</span> Emotional Patterns</h3></div>';
    h += '<div style="display:flex;gap:8px;flex-wrap:wrap">';
    emEntries.forEach(([em, count]) => {
      h += `<span style="padding:4px 12px;border-radius:100px;background:color-mix(in srgb,var(--warn) 15%,var(--bg-c));color:var(--warn);font-size:12px;font-weight:500">${PV_EMOTION_EMOJI[em]||''} ${esc(em)} × ${count}</span>`;
    });
    h += '</div></div>';
  }

  const recentResolved = _pvProblems.filter(p => p.status === 'resolved').slice(0, 5);
  if (recentResolved.length) {
    h += '<div class="pv-card"><div class="pv-card-h"><h3><span class="material-icons-round" style="color:var(--ok)">task_alt</span> Recently Resolved</h3></div>';
    recentResolved.forEach(p => {
      const days = p.resolved_at && p.created_at ? Math.round((new Date(p.resolved_at) - new Date(p.created_at)) / 864e5) : '?';
      h += `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--brd)">
        <span class="material-icons-round" style="font-size:20px;color:var(--ok)">check_circle</span>
        <div style="flex:1"><div style="font-weight:500;color:var(--tx)">${esc(p.title)}</div>
        <div style="font-size:12px;color:var(--txd)">${_pvRelDate(p.resolved_at)} · ${days} days</div></div>
      </div>`;
    });
    h += '</div>';
  }

  h += '</div>';
  _pvContainer.innerHTML = h;
  _pvBindTabs();
}

/* ═══════════════════════════════════════════════════ */
/*  NEW PROBLEM BOTTOM SHEET                           */
/* ═══════════════════════════════════════════════════ */
function _pvOpenNewSheet(existing) {
  const isEdit = !!existing;
  const p = existing || {};
  const emotions = (p.emotional_state || '').split(',').filter(Boolean);

  const ov = document.createElement('div');
  ov.className = 'pv-sheet-ov open';
  ov.innerHTML = `
    <div class="pv-sheet">
      <div class="pv-sheet-handle"></div>
      <div class="pv-sheet-title"><span class="material-icons-round">${isEdit ? 'edit' : 'add_circle'}</span> ${isEdit ? 'Edit Problem' : 'New Problem'}</div>
      <div class="pv-sheet-body">
        <div class="pv-fg">
          <label class="pv-fl">What's the problem?</label>
          <input class="pv-fi" type="text" id="pvn-title" value="${isEdit ? escA(p.title) : ''}" placeholder="e.g. Can't decide whether to change careers" maxlength="200">
        </div>
        <div class="pv-fg">
          <label class="pv-fl">Tell me more (optional)</label>
          <textarea class="pv-fi pv-fi-ta" id="pvn-desc" placeholder="Dump everything on your mind. Messy is fine." maxlength="2000">${isEdit ? esc(p.description || '') : ''}</textarea>
        </div>
        <div class="pv-frow">
          <div class="pv-fg">
            <label class="pv-fl">Category</label>
            <select class="pv-fsel" id="pvn-cat">
              ${PV_CATEGORIES.map(c => `<option value="${c}"${p.category === c ? ' selected' : ''}>${_pvCatLabel(c)}</option>`).join('')}
            </select>
          </div>
          <div class="pv-fg">
            <label class="pv-fl">Privacy</label>
            <select class="pv-fsel" id="pvn-priv">
              <option value="normal"${p.privacy_level === 'normal' ? ' selected' : ''}>Normal</option>
              <option value="private"${p.privacy_level === 'private' ? ' selected' : ''}>Private</option>
            </select>
          </div>
        </div>
        <div class="pv-frow">
          <div class="pv-fg">
            <label class="pv-fl">Deadline (optional)</label>
            <input class="pv-fi" type="date" id="pvn-dead" value="${p.deadline ? p.deadline.split('T')[0] : ''}">
          </div>
          <div class="pv-fg">
            <label class="pv-fl">Urgency</label>
            <select class="pv-fsel" id="pvn-urg">
              <option value="0"${p.urgency === 0 ? ' selected' : ''}>None</option>
              <option value="1"${p.urgency === 1 ? ' selected' : ''}>Low</option>
              <option value="2"${p.urgency === 2 ? ' selected' : ''}>Medium</option>
              <option value="3"${p.urgency === 3 ? ' selected' : ''}>High</option>
            </select>
          </div>
        </div>
        <div class="pv-frow">
          <div class="pv-fg">
            <label class="pv-fl">Type</label>
            <select class="pv-fsel" id="pvn-type">
              <option value="unclassified"${p.problem_type === 'unclassified' ? ' selected' : ''}>Unclassified</option>
              <option value="solve"${p.problem_type === 'solve' ? ' selected' : ''}>Solve</option>
              <option value="decide"${p.problem_type === 'decide' ? ' selected' : ''}>Decide</option>
              <option value="process"${p.problem_type === 'process' ? ' selected' : ''}>Process</option>
            </select>
          </div>
          <div class="pv-fg">
            <label class="pv-fl">Who's involved?</label>
            <input class="pv-fi" type="text" id="pvn-who" value="${isEdit ? escA(p.stakeholders || '') : ''}" placeholder="e.g. wife, boss" maxlength="200">
          </div>
        </div>
        <div class="pv-fg">
          <label class="pv-fl">How are you feeling?</label>
          <div class="em-pick" id="pvn-em">
            ${PV_EMOTIONS.slice(0, 10).map(e => `<span class="em-tag${emotions.includes(e) ? ' sel' : ''}" data-emotion="${e}">${PV_EMOTION_EMOJI[e]||''} ${e}</span>`).join('')}
          </div>
        </div>
        <div class="pv-factions">
          <button class="pv-btn-c" id="pvn-cancel">Cancel</button>
          <button class="pv-btn-s" id="pvn-save"><span class="material-icons-round" style="font-size:16px;vertical-align:middle">${isEdit ? 'save' : 'add'}</span> ${isEdit ? 'Save' : 'Create Problem'}</button>
        </div>
      </div>
    </div>`;

  document.body.appendChild(ov);
  document.getElementById('pvn-title').focus();

  ov.querySelectorAll('.em-tag').forEach(el => {
    el.addEventListener('click', () => el.classList.toggle('sel'));
  });

  const close = () => ov.remove();
  ov.addEventListener('click', e => { if (e.target === ov) close(); });
  document.getElementById('pvn-cancel').addEventListener('click', close);

  document.getElementById('pvn-save').addEventListener('click', async () => {
    const title = document.getElementById('pvn-title').value.trim();
    if (!title) { showToast('Title is required', null, 3000); return; }
    const selectedEmotions = Array.from(ov.querySelectorAll('.em-tag.sel')).map(el => el.dataset.emotion);
    const body = {
      title,
      description: document.getElementById('pvn-desc').value.trim() || undefined,
      category: document.getElementById('pvn-cat').value,
      privacy_level: document.getElementById('pvn-priv').value,
      deadline: document.getElementById('pvn-dead').value || undefined,
      urgency: Number(document.getElementById('pvn-urg').value),
      problem_type: document.getElementById('pvn-type').value,
      stakeholders: document.getElementById('pvn-who').value.trim() || undefined,
      emotional_state: selectedEmotions.join(',') || undefined,
    };
    if (isEdit) {
      await api.put('/api/problems/' + p.id, body);
    } else {
      await api.post('/api/problems', body);
    }
    close();
    renderProblemsView(_pvContainer);
  });
}

/* ═══════════════════════════════════════════════════ */
/*  SHARED HELPERS                                     */
/* ═══════════════════════════════════════════════════ */
function _pvTabs(active) {
  const tabs = [
    { id:'list', icon:'list', label:'All Problems', badge: _pvProblems.filter(p=>p.status==='active'||p.status==='paused').length },
    { id:'board', icon:'view_kanban', label:'Board' },
    { id:'stats', icon:'analytics', label:'Insights' },
  ];
  let h = '<div class="pv-tabs">';
  tabs.forEach(t => {
    h += `<button class="pv-tab${active === t.id ? ' active' : ''}" data-screen="${t.id}">
      <span class="material-icons-round">${t.icon}</span> ${t.label}
      ${t.badge ? `<span class="badge">${t.badge}</span>` : ''}
    </button>`;
  });
  h += '</div>';
  return h;
}

function _pvBindTabs() {
  _pvContainer.querySelectorAll('.pv-tab').forEach(el => {
    el.addEventListener('click', () => {
      _pvCurrentScreen = el.dataset.screen;
      _pvCurrentProblem = null;
      _pvRender();
    });
  });
}

function _pvPhaseStepper(currentPhase) {
  const phases = PV_PHASES;
  const currentIdx = phases.indexOf(currentPhase);
  let h = '<div class="phase-stepper">';
  phases.forEach((p, i) => {
    const pm = PV_PHASE_META[p];
    let cls = 'phase-step';
    if (i < currentIdx) cls += ' done';
    else if (i === currentIdx) cls += ' current';

    if (i > 0) h += '<div class="ps-conn"></div>';
    h += `<div class="${cls}">
      <div class="ps-icon"><span class="material-icons-round">${i < currentIdx ? 'check' : pm.icon}</span></div>
      <div class="ps-name">${pm.label}</div>
    </div>`;
  });
  h += '</div>';
  return h;
}

function _pvDots(val, max) {
  let h = '';
  for (let i = 0; i < max; i++) {
    h += `<span class="dot${i < val ? ' on' : ''}"></span>`;
  }
  return h;
}

function _pvScoreDots(label, val, max) {
  let h = `<div class="oc-score">${esc(label)} <div class="dots">`;
  for (let i = 0; i < max; i++) h += `<span class="dot${i < val ? ' on' : ''}"></span>`;
  h += `</div><span style="font-weight:600;font-size:11px;min-width:24px;text-align:right">${val}/${max}</span></div>`;
  return h;
}

function _pvConfDots(val) {
  let h = '';
  for (let i = 0; i < 5; i++) {
    h += `<span style="display:inline-block;width:14px;height:5px;border-radius:100px;margin-right:2px;background:${i < val ? 'var(--ok)' : 'var(--brd)'}"></span>`;
  }
  return h;
}

function _pvRelDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const diff = Math.round((Date.now() - d.getTime()) / 864e5);
  if (diff === 0) return 'Today';
  if (diff === 1) return '1d ago';
  if (diff < 7) return diff + 'd ago';
  if (diff < 14) return '1w ago';
  if (diff < 30) return Math.floor(diff / 7) + 'w ago';
  if (diff < 60) return '1mo ago';
  return Math.floor(diff / 30) + 'mo ago';
}

function _pvCatLabel(cat) {
  if (!cat || cat === 'uncategorized') return 'Uncategorized';
  return cat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function _pvEmptyState() {
  return `<div style="text-align:center;padding:60px 20px">
    <span class="material-icons-round" style="font-size:64px;color:var(--txd);display:block;margin-bottom:16px">psychology</span>
    <div style="font-size:18px;font-weight:600;color:var(--tx);margin-bottom:6px">No problems yet</div>
    <div style="font-size:14px;color:var(--txd);max-width:360px;margin:0 auto 16px;line-height:1.5">
      Capture a problem you're working through — big or small. AI will help you think it through, not give you answers.
    </div>
    <button class="pv-btn-s" onclick="_pvOpenNewSheet()"><span class="material-icons-round" style="font-size:16px;vertical-align:middle">add</span> Capture First Problem</button>
  </div>`;
}
