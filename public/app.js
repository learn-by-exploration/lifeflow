// Today view module: js/views/today.js (progressive migration — see renderTodayModule below)
const COLORS=['#D50000','#E67C73','#F4511E','#F6BF26','#33B679','#0B8043','#039BE5','#3F51B5','#7986CB','#8E24AA','#616161','#795548'];
const $=id=>document.getElementById(id);
// renderTodayModule will be loaded when app.js migrates to ES modules
const renderTodayModule = null; // future: import('./js/views/today.js')
const api={
  _csrfToken:null,
  _getCsrf(){if(this._csrfToken)return this._csrfToken;const m=document.cookie.match(/csrf_token=([a-f0-9]{64})/);return m?m[1]:''},
  async get(u){try{const r=await fetch(u);if(r.status===401){window.location.href='/login';return{}}if(!r.ok){const b=await r.json().catch(()=>({}));return b}return await r.json()}catch(e){showToast('Network error — please try again');throw e}},
  async post(u,d){try{const r=await fetch(u,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':this._getCsrf()},body:JSON.stringify(d)});if(r.status===401){window.location.href='/login';return{}}if(!r.ok){const b=await r.json().catch(()=>({}));return b}return await r.json()}catch(e){showToast('Network error — please try again');throw e}},
  async put(u,d){try{const r=await fetch(u,{method:'PUT',headers:{'Content-Type':'application/json','X-CSRF-Token':this._getCsrf()},body:JSON.stringify(d)});if(r.status===401){window.location.href='/login';return{}}if(!r.ok){const b=await r.json().catch(()=>({}));return b}return await r.json()}catch(e){showToast('Network error — please try again');throw e}},
  async del(u){try{const r=await fetch(u,{method:'DELETE',headers:{'X-CSRF-Token':this._getCsrf()}});if(r.status===401){window.location.href='/login';return{}}if(!r.ok){const b=await r.json().catch(()=>({}));return b}return await r.json()}catch(e){showToast('Network error — please try again');throw e}},
  async patch(u,d){try{const r=await fetch(u,{method:'PATCH',headers:{'Content-Type':'application/json','X-CSRF-Token':this._getCsrf()},body:JSON.stringify(d)});if(r.status===401){window.location.href='/login';return{}}if(!r.ok){const b=await r.json().catch(()=>({}));return b}return await r.json()}catch(e){showToast('Network error — please try again');throw e}}
};
function esc(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML}
function isValidHexColor(c){return /^#[0-9A-Fa-f]{3,6}$/.test(c)}

// ─── FORM VALIDATION HELPER ───
function validateField(inputId, rules) {
  const el = $(inputId); if (!el) return true;
  const v = el.value.trim();
  const errEl = document.getElementById(inputId + '-err');
  let msg = '';
  if (rules.required && !v) msg = rules.requiredMsg || 'This field is required';
  else if (rules.maxlength && v.length > rules.maxlength) msg = `Max ${rules.maxlength} characters`;
  else if (rules.pattern && !rules.pattern.test(v)) msg = rules.patternMsg || 'Invalid format';
  if (msg) {
    el.classList.add('inp-err');
    if (errEl) { errEl.textContent = msg; errEl.classList.add('visible'); }
    el.focus();
    return false;
  }
  el.classList.remove('inp-err');
  if (errEl) { errEl.textContent = ''; errEl.classList.remove('visible'); }
  return true;
}
function clearFieldError(inputId) {
  const el = $(inputId); if (!el) return;
  el.classList.remove('inp-err');
  const errEl = document.getElementById(inputId + '-err');
  if (errEl) { errEl.textContent = ''; errEl.classList.remove('visible'); }
}

// ─── OVERLAY LIFECYCLE (scroll-lock, focus save/restore) ───
let _overlayStack=[];
function _lockBody(){document.body.style.overflow='hidden'}
function _unlockBody(){if(!document.querySelector('.mo.active,.triage-modal,.sr-ov.active,.qc-ov.active,.dr-ov.active,.ft-ov.active,.kb-ov.active,.onb-ov.active,.tour-ov.active,.tmpl-apply-ov.active,.dp.open'))document.body.style.overflow=''}
function _pushFocus(){_overlayStack.push(document.activeElement)}
function _popFocus(){const el=_overlayStack.pop();if(el&&el.focus)try{el.focus()}catch(e){}}

// ─── AUTH STATE ───
let currentUser=null;
async function loadCurrentUser(){
  try{
    const data=await api.get('/api/auth/me');
    if(data&&data.user){
      currentUser=data.user;
      const el=document.getElementById('sb-user-name');
      if(el)el.textContent=data.user.display_name||data.user.email;
    }
  }catch(e){
    // Not authenticated — redirect to login
    window.location.href='/login';
  }
}
function initLogout(){
  const btn=document.getElementById('sb-logout-btn');
  if(btn)btn.addEventListener('click',async()=>{
    try{await fetch('/api/auth/logout',{method:'POST'})}catch(e){}
    window.location.href='/login';
  });
}
// Load user info at startup
loadCurrentUser();
initLogout();


// ─── KEYBOARD SHORTCUT MAP (rebindable) ───
const DEFAULT_SHORTCUTS={
  'search':'ctrl+k','quick-add':'n','help':'?','today':'1','all-tasks':'2',
  'board':'3','calendar':'4','dashboard':'5','weekly':'6','matrix':'7',
  'logbook':'8','tags-view':'9','focus-history':'0','multi-select':'m',
  'daily-review':'r','vim-down':'j','vim-up':'k','vim-complete':'x','vim-open':'Enter'
};
let _shortcutMap={...DEFAULT_SHORTCUTS};
function _loadShortcuts(){try{const s=localStorage.getItem('lf-shortcuts');if(s)_shortcutMap={...DEFAULT_SHORTCUTS,...JSON.parse(s)}}catch(e){}}
function _saveShortcuts(){localStorage.setItem('lf-shortcuts',JSON.stringify(_shortcutMap));try{api.put('/api/settings',{keyboardShortcuts:JSON.stringify(_shortcutMap)})}catch(e){}}
_loadShortcuts();
function _keyStr(e){const parts=[];if(e.ctrlKey||e.metaKey)parts.push('ctrl');if(e.altKey)parts.push('alt');if(e.shiftKey)parts.push('shift');const k=e.key.length===1?e.key.toLowerCase():e.key;if(!['Control','Meta','Alt','Shift'].includes(e.key))parts.push(k);return parts.join('+')}
function _matchShortcut(action,e){const bound=_shortcutMap[action]||DEFAULT_SHORTCUTS[action];if(!bound)return false;return _keyStr(e)===bound.toLowerCase()}
function escA(s){return String(s).replace(/[&"'<>]/g,m=>({'&':'&amp;','"':'&quot;',"'":'&#39;','<':'&lt;','>':'&gt;'})[m])}
// Parse "YYYY-MM-DD" as local midnight (avoids timezone shift)
function _parseDate(d){const [y,m,day]=d.split('-');return new Date(Number(y),Number(m)-1,Number(day))}
// Format a Date to "YYYY-MM-DD" in local timezone (replaces toISOString().slice(0,10))
function _toDateStr(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function fmtDue(d){if(!d)return'';const dt=_parseDate(d),td=new Date();td.setHours(0,0,0,0);const df=Math.round((dt-td)/864e5);const fmt=appSettings.dateFormat||'relative';if(fmt==='relative'){if(df===0)return'Today';if(df===1)return'Tomorrow';if(df===-1)return'Yesterday';if(df===-2)return'2 days ago';if(df>1&&df<=6)return'in '+df+' days';if(df<-1&&df>=-7)return Math.abs(df)+'d overdue';if(df===7)return'Next week';const wd=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];if(df>1&&df<=13)return'Next '+wd[dt.getDay()];return dt.toLocaleDateString('en-US',{month:'short',day:'numeric'})}if(fmt==='iso')return d;if(fmt==='us')return dt.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});if(fmt==='eu'){const dd=String(dt.getDate()).padStart(2,'0'),mm=String(dt.getMonth()+1).padStart(2,'0');return dd+'/'+mm+'/'+dt.getFullYear()}return d}
function isOD(d){if(!d)return false;const dt=_parseDate(d),td=new Date();td.setHours(0,0,0,0);return dt<td}
const PL=['','Normal','High','Critical'],PC=['','var(--brand)','var(--warn)','var(--err)'];

// ─── SHARED TIMELINE HELPERS ───
const TL_HOUR_PX=60,TL_START_HR=6,TL_END_HR=22;
function _tlMinToY(hr,min){return((hr-TL_START_HR)*60+min)*(TL_HOUR_PX/60)}
function _tlParseHHMM(s){if(!s)return null;const[h,m]=s.split(':').map(Number);return{h,m}}
function _tlDuration(start,end,est){
  if(end){const s=_tlParseHHMM(start),e=_tlParseHHMM(end);if(s&&e)return(e.h*60+e.m)-(s.h*60+s.m)}
  if(est)return Math.max(15,est);
  return 30; // default 30min
}
function _tlLayoutColumns(tasks){
  // Assign columns to overlapping tasks
  const sorted=[...tasks].sort((a,b)=>{
    const sa=_tlParseHHMM(a.time_block_start),sb=_tlParseHHMM(b.time_block_start);
    return(sa.h*60+sa.m)-(sb.h*60+sb.m);
  });
  const groups=[];
  for(const t of sorted){
    const s=_tlParseHHMM(t.time_block_start);
    const dur=_tlDuration(t.time_block_start,t.time_block_end,t.estimated_minutes);
    const startMin=s.h*60+s.m,endMin=startMin+dur;
    t._startMin=startMin;t._endMin=endMin;
    let placed=false;
    for(const g of groups){
      if(startMin<g.end){g.items.push(t);g.end=Math.max(g.end,endMin);placed=true;break}
    }
    if(!placed)groups.push({items:[t],end:endMin});
  }
  for(const g of groups){
    const cols=[];
    for(const t of g.items){
      let col=0;
      while(cols[col]&&cols[col]>t._startMin)col++;
      t._col=col;t._totalCols=g.items.length;
      cols[col]=t._endMin;
    }
    const maxCol=Math.max(...g.items.map(i=>i._col))+1;
    g.items.forEach(i=>i._totalCols=maxCol);
  }
  return sorted;
}
function _tlTaskHtml(t){
  const s=_tlParseHHMM(t.time_block_start);if(!s)return'';
  const dur=_tlDuration(t.time_block_start,t.time_block_end,t.estimated_minutes);
  const top=_tlMinToY(s.h,s.m);
  const height=Math.max(dur*(TL_HOUR_PX/60),18);
  const col=t._col||0,totalCols=t._totalCols||1;
  const widthPct=100/totalCols;
  const leftPct=col*widthPct;
  const color=t.goal_color||'var(--brand)';
  const endTime=t.time_block_end||_tlFmtMin(s.h*60+s.m+dur);
  return`<div class="planner-task ${t.status==='done'?'done':''}" draggable="true" data-id="${t.id}"
    data-start="${t.time_block_start}" data-end="${endTime}" data-dur="${dur}"
    style="top:${top}px;height:${height}px;left:${leftPct}%;width:calc(${widthPct}% - 4px);border-left-color:${escA(color)};background:${escA(color)}18">
    <div class="pt-header">
      <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500">${esc(t.title)}</span>
      <span class="pt-time">${t.time_block_start}–${endTime}</span>
      <span class="pt-actions">
        <span class="material-icons-round" style="cursor:pointer;color:var(--txd)" data-unblock="${t.id}" title="Remove">close</span>
      </span>
    </div>
    ${height>30?`<div style="font-size:10px;color:var(--txd);margin-top:2px">${dur}min${t.goal_title?' · '+esc(t.goal_title):''}</div>`:''}
    <div class="pt-resize" data-id="${t.id}"></div>
  </div>`;
}
function _tlFmtMin(totalMin){return String(Math.floor(totalMin/60)).padStart(2,'0')+':'+String(totalMin%60).padStart(2,'0')}
async function seedQuickCaptureForDate(dateStr){
  await openQuickCapture();
  requestAnimationFrame(()=>{
    const inp=document.querySelector('.qc-input input');
    if(inp){
      inp.value=`due:${dateStr} `;
      inp.focus();
      inp.dispatchEvent(new Event('input'));
    }
  });
}
function _tlBuildGrid(tasks,opts){
  const {showNowLine,colId}=opts||{};
  const laid=_tlLayoutColumns(tasks.filter(t=>t.time_block_start));
  const totalHeight=(TL_END_HR-TL_START_HR)*TL_HOUR_PX;
  let h=`<div class="planner-timeline" style="position:relative">`;
  // Hour rows
  for(let hr=TL_START_HR;hr<=TL_END_HR;hr++){
    const label=hr<12?(hr+' AM'):hr===12?'12 PM':((hr-12)+' PM');
    const hKey=String(hr).padStart(2,'0');
    h+=`<div class="planner-hour" data-hour="${hKey}" ${colId?`data-col="${colId}"`:''}><div class="planner-hour-label">${label}</div><div class="planner-hour-body" data-hour="${hKey}" ${colId?`data-col="${colId}"`:''}>`;
    h+=`</div></div>`;
  }
  // Absolute positioned task blocks
  h+=`<div style="position:absolute;top:0;left:56px;right:0;height:${totalHeight}px;pointer-events:none">`;
  h+=`<div style="position:relative;width:100%;height:100%;pointer-events:auto">`;
  laid.forEach(t=>h+=_tlTaskHtml(t));
  h+=`</div></div>`;
  // Now line
  if(showNowLine){
    const now=new Date();const nowH=now.getHours(),nowM=now.getMinutes();
    if(nowH>=TL_START_HR&&nowH<=TL_END_HR){
      const nowY=_tlMinToY(nowH,nowM);
      h+=`<div class="planner-now-dot" style="top:${nowY}px"></div><div class="planner-now-line" style="top:${nowY}px"></div>`;
    }
  }
  h+=`</div>`;
  return h;
}
function _tlWireEvents(container,dateStr,refreshFn){
  // Drag & drop tasks to time slots
  container.querySelectorAll('.planner-task[draggable],.planner-task-unsched[draggable]').forEach(el=>{
    el.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain',el.dataset.id);el.classList.add('planner-task-drag')});
    el.addEventListener('dragend',()=>el.classList.remove('planner-task-drag'));
  });
  container.querySelectorAll('.planner-hour-body').forEach(slot=>{
    slot.addEventListener('dragover',e=>{e.preventDefault();slot.classList.add('dragover')});
    slot.addEventListener('dragleave',()=>slot.classList.remove('dragover'));
    slot.addEventListener('drop',async e=>{
      e.preventDefault();slot.classList.remove('dragover');
      const taskId=Number(e.dataTransfer.getData('text/plain'));if(!taskId)return;
      const hour=slot.dataset.hour;
      // Calculate drop position within the hour for 15-min snapping
      const rect=slot.getBoundingClientRect();
      const yInSlot=e.clientY-rect.top;
      const minuteOffset=Math.round(yInSlot/(TL_HOUR_PX/60)/15)*15;
      const startMin=Number(hour)*60+Math.min(minuteOffset,45);
      const endMin=startMin+30; // default 30min
      const d=slot.dataset.col||dateStr;
      await api.put('/api/tasks/'+taskId,{due_date:d,time_block_start:_tlFmtMin(startMin),time_block_end:_tlFmtMin(endMin)});
      refreshFn();
    });
  });
  // Click to open task detail
  container.querySelectorAll('.planner-task[data-id]').forEach(el=>{
    el.addEventListener('click',e=>{if(e.target.closest('[data-unblock]')||e.target.closest('.pt-resize'))return;openDP(Number(el.dataset.id))});
  });
  // Remove time block
  container.querySelectorAll('[data-unblock]').forEach(el=>el.addEventListener('click',async e=>{
    e.stopPropagation();
    await api.put('/api/tasks/'+Number(el.dataset.unblock),{time_block_start:null,time_block_end:null});
    refreshFn();
  }));
  // Resize handle — drag to extend/shrink
  container.querySelectorAll('.pt-resize').forEach(handle=>{
    handle.addEventListener('mousedown',e=>{
      e.preventDefault();e.stopPropagation();
      const taskEl=handle.closest('.planner-task');
      const taskId=Number(taskEl.dataset.id);
      const origDur=Number(taskEl.dataset.dur);
      const startTime=taskEl.dataset.start;
      const startParsed=_tlParseHHMM(startTime);
      const startMin=startParsed.h*60+startParsed.m;
      const startY=e.clientY;
      taskEl.classList.add('resizing');
      const onMove=ev=>{
        const dy=ev.clientY-startY;
        const durDelta=Math.round(dy/(TL_HOUR_PX/60)/15)*15;
        const newDur=Math.max(15,origDur+durDelta);
        taskEl.style.height=Math.max(newDur*(TL_HOUR_PX/60),18)+'px';
        const endMin=startMin+newDur;
        taskEl.querySelector('.pt-time').textContent=startTime+'–'+_tlFmtMin(endMin);
      };
      const onUp=async ev=>{
        document.removeEventListener('mousemove',onMove);
        document.removeEventListener('mouseup',onUp);
        taskEl.classList.remove('resizing');
        const dy=ev.clientY-startY;
        const durDelta=Math.round(dy/(TL_HOUR_PX/60)/15)*15;
        const newDur=Math.max(15,origDur+durDelta);
        const endMin=startMin+newDur;
        await api.put('/api/tasks/'+taskId,{time_block_end:_tlFmtMin(endMin)});
        refreshFn();
      };
      document.addEventListener('mousemove',onMove);
      document.addEventListener('mouseup',onUp);
    });
  });
}

// Swatch builder
function buildSwatches(containerId, hiddenId, active){
  const c=$(containerId);if(!c)return;
  c.innerHTML=COLORS.map(cl=>`<div class="sw ${cl===active?'sel':''}" data-c="${cl}" style="background:${cl}" title="${cl}" aria-label="Color ${cl}"></div>`).join('');
  c.querySelectorAll('.sw').forEach(s=>s.addEventListener('click',()=>{
    c.querySelectorAll('.sw').forEach(x=>x.classList.remove('sel'));
    s.classList.add('sel');
    $(hiddenId).value=s.dataset.c;
  }));
}

let areas=[],goals=[],tasks=[],allTags=[];
let currentView='myday',activeAreaId=null,activeGoalId=null,goalTab='list';
// Restore last view from localStorage
{const lv=localStorage.getItem('lf-lastView');if(lv&&['myday','all','board','calendar','overdue','dashboard','weekly','matrix','logbook','tags','focushistory','templates','settings','habits','planner','taskplanner','inbox','review','notes','timeanalytics','rules','tasks','focus','goals','areas','search'].includes(lv))currentView=lv}
let calY,calM;{const n=new Date();calY=n.getFullYear();calM=n.getMonth()}
let calMode=localStorage.getItem('lf-calMode')||'month';
let editingId=null;
const expandedTasks=new Set();

// ─── SETTINGS STATE ───
let appSettings={defaultView:'myday',theme:'midnight',focusDuration:'25',shortBreak:'5',longBreak:'15',weekStart:'0',defaultPriority:'0',showCompleted:'true',confirmDelete:'true',dateFormat:'relative',autoMyDay:'false',pinnedAreas:'[]'};
async function loadSettings(){
  try{appSettings=await api.get('/api/settings');if(window.Store)Store.setSettings(appSettings)}catch(e){console.error('Failed to load settings:',e)}
}
async function saveSetting(key,value){
  appSettings[key]=String(value);
  try{await api.put('/api/settings',{[key]:String(value)})}catch(e){console.error('Failed to save setting:',e)}
}
// Configurable label helpers
function SL(status){try{const m=JSON.parse(appSettings.statusLabels||'{}');return m[status]||{todo:'To Do',doing:'In Progress',done:'Done'}[status]||status}catch{return{todo:'To Do',doing:'In Progress',done:'Done'}[status]||status}}
function PLbl(p){try{const m=JSON.parse(appSettings.priorityLabels||'{}');return m[String(p)]||['None','Normal','High','Critical'][p]||''}catch{return['None','Normal','High','Critical'][p]||''}}
function PClr(p){try{const m=JSON.parse(appSettings.priorityColors||'{}');return m[String(p)]||['#64748B','#3B82F6','#F59E0B','#EF4444'][p]||'#64748B'}catch{return['#64748B','#3B82F6','#F59E0B','#EF4444'][p]||'#64748B'}}
function getPinnedAreaIds(){try{return JSON.parse(appSettings.pinnedAreas||'[]').map(Number).filter(Number.isInteger)}catch{return[]}}
function isAreaPinned(areaId){return getPinnedAreaIds().includes(Number(areaId))}
async function togglePinnedArea(areaId){
  const numericId=Number(areaId);if(!Number.isInteger(numericId))return;
  const current=getPinnedAreaIds();
  const next=current.includes(numericId)?current.filter(id=>id!==numericId):[...current,numericId];
  await saveSetting('pinnedAreas',JSON.stringify(next));
  renderAreas();
}

// ─── SAVED FILTERS + HABITS STATE ───
let savedFilters=[],activeFilterId=null,activeFilterName='';
let activeFilterParams={};
async function loadSavedFilters(){
  try{
    savedFilters=await api.get('/api/filters');
    renderSFList();
  }catch(e){}
}
function renderSFList(){
  const list=$('sf-list');
  list.innerHTML=savedFilters.map(f=>`<div class="sf-item ${activeFilterId===f.id?'active':''}" data-fid="${f.id}" title="${esc(f.name)}"><span class="sf-icon">${esc(f.icon)}</span><span>${esc(f.name)}</span><span class="sf-badge" data-fid="${f.id}"></span><span class="material-icons-round sf-del" data-fid="${f.id}" title="Delete">close</span></div>`).join('');
  list.querySelectorAll('.sf-item').forEach(el=>el.addEventListener('click',e=>{
    if(e.target.closest('.sf-del')){
      const fid=Number(e.target.dataset.fid);
      if(confirm('Delete this saved filter?')){api.del('/api/filters/'+fid).then(()=>loadSavedFilters())}
      return;
    }
    const f=savedFilters.find(x=>x.id===Number(el.dataset.fid));if(!f)return;
    activeFilterId=f.id;activeFilterName=f.name;activeFilterParams=JSON.parse(f.filters);
    currentView='filter';
    document.querySelectorAll('.ni,.ai,.sf-item').forEach(n=>n.classList.remove('active'));
    el.classList.add('active');closeMobileSb();render();
  }));
  // Load badge counts for saved filters
  api.get('/api/filters/counts').then(counts=>{
    counts.forEach(c=>{
      const badge=list.querySelector(`.sf-badge[data-fid="${c.id}"]`);
      if(badge)badge.textContent=c.count||'';
    });
  }).catch(()=>{});
}

// Smart list handlers
let activeSmartFilter=null;
let activeListId=null,activeListName='',userLists=[],allUsers=[];
async function loadUserLists(){
  try{userLists=await api.get('/api/lists');renderSBLists()}catch(e){}
}
async function loadAllUsers(){
  try{allUsers=await api.get('/api/users')}catch(e){allUsers=[]}
}
function renderSBLists(){
  const el=$('sb-list-items');if(!el)return;
  const parents=userLists.filter(l=>!l.parent_id);
  el.innerHTML=parents.map(l=>{
    const subs=userLists.filter(s=>s.parent_id===l.id);
    const lIcon=l.icon||'📋';
    let html=`<div class="sf-item${l.id===activeListId?' active':''}" data-lid="${l.id}" title="${esc(l.name)}"><span class="sf-icon">${esc(lIcon)}</span><span>${esc(l.name)}</span><span class="sf-badge">${l.item_count?((l.checked_count||0)+'/'+l.item_count):''}</span><button class="sf-menu material-icons-round" data-lid="${l.id}" title="Options">more_vert</button></div>`;
    subs.forEach(s=>{
      const sIcon=s.icon||'📋';
      html+=`<div class="sf-item${s.id===activeListId?' active':''}" data-lid="${s.id}" title="${esc(s.name)}" style="padding-left:28px;font-size:12px"><span class="sf-icon" style="font-size:12px">${esc(sIcon)}</span><span>${esc(s.name)}</span><span class="sf-badge">${s.item_count?((s.checked_count||0)+'/'+s.item_count):''}</span></div>`;
    });
    return html;
  }).join('');
  el.querySelectorAll('.sf-item').forEach(it=>it.addEventListener('click',e=>{
    if(e.target.classList.contains('sf-menu'))return;
    const lid=Number(it.dataset.lid);activeListId=lid;
    const lst=userLists.find(x=>x.id===lid);activeListName=lst?lst.name:'List';
    currentView='listdetail';
    document.querySelectorAll('.ni,.ai,.sf-item').forEach(n=>n.classList.remove('active'));
    it.classList.add('active');closeMobileSb();render();
  }));
  // List context menus in sidebar
  el.querySelectorAll('.sf-menu').forEach(btn=>btn.addEventListener('click',e=>{
    e.stopPropagation();
    const lid=Number(btn.dataset.lid);const lst=userLists.find(x=>x.id===lid);if(!lst)return;
    document.querySelectorAll('.ctx-menu').forEach(m=>m.remove());
    const menu=document.createElement('div');menu.className='ctx-menu';menu.setAttribute('role','menu');
    menu.innerHTML=`
      <div class="ctx-item" role="menuitem" tabindex="0" data-act="edit"><span class="material-icons-round">edit</span>Edit</div>
      <div class="ctx-item" role="menuitem" tabindex="0" data-act="duplicate"><span class="material-icons-round">content_copy</span>Duplicate</div>
      <div class="ctx-item" role="menuitem" tabindex="0" data-act="uncheck"><span class="material-icons-round">restart_alt</span>Uncheck All</div>
      <div class="ctx-item ctx-danger" role="menuitem" tabindex="0" data-act="delete"><span class="material-icons-round">delete</span>Delete</div>`;
    const rect=btn.getBoundingClientRect();
    document.body.appendChild(menu);
    const mw=menu.offsetWidth,mh=menu.offsetHeight;
    menu.style.left=Math.min(rect.right,window.innerWidth-mw-8)+'px';
    menu.style.top=Math.min(rect.bottom,window.innerHeight-mh-8)+'px';
    const closeMenu=ev=>{if(!menu.contains(ev.target)){menu.remove();document.removeEventListener('click',closeMenu)}};
    setTimeout(()=>document.addEventListener('click',closeMenu),0);
    menu.querySelector('[data-act="edit"]').addEventListener('click',()=>{menu.remove();openListModal(lst)});
    menu.querySelector('[data-act="duplicate"]').addEventListener('click',async()=>{
      menu.remove();
      try{const r=await api.post('/api/lists/'+lid+'/duplicate');if(r.error){showToast(r.error);return}
      await loadUserLists();activeListId=r.id;activeListName=r.name;currentView='listdetail';render();
      showToast('List duplicated')}catch(e){showToast('Failed to duplicate list')}
    });
    menu.querySelector('[data-act="uncheck"]').addEventListener('click',async()=>{
      menu.remove();try{const r=await api.post('/api/lists/'+lid+'/uncheck-all');if(r.error){showToast(r.error);return}
      await loadUserLists();render();showToast('All items unchecked')}catch(e){showToast('Failed to uncheck items')}
    });
    menu.querySelector('[data-act="delete"]').addEventListener('click',async()=>{
      menu.remove();if(!confirm('Delete "'+lst.name+'" and all its items?'))return;
      await api.del('/api/lists/'+lid);if(lid===activeListId){activeListId=null;currentView='lists'}
      await loadUserLists();render();showToast('List deleted');
    });
  }));
}
document.querySelectorAll('#smart-list .sf-item').forEach(el=>el.addEventListener('click',()=>{
  activeSmartFilter=el.dataset.smart;
  currentView='smartlist';activeAreaId=null;activeGoalId=null;
  document.querySelectorAll('.ni,.ai,.sf-item').forEach(n=>n.classList.remove('active'));
  el.classList.add('active');closeMobileSb();render();
}));
async function loadSmartCounts(){
  try{
    const [stale,qw,blocked]=await Promise.all([
      api.get('/api/filters/smart/stale'),
      api.get('/api/filters/smart/quickwins'),
      api.get('/api/filters/smart/blocked')
    ]);
    $('smart-stale-cnt').textContent=stale.length||'';
    $('smart-qw-cnt').textContent=qw.length||'';
    $('smart-blocked-cnt').textContent=blocked.length||'';
  }catch(e){}
}

// Sidebar nav
document.querySelectorAll('.ni').forEach(el=>el.addEventListener('click',()=>{
  currentView=el.dataset.view;activeAreaId=null;activeGoalId=null;
  document.querySelectorAll('.ni,.ai').forEach(n=>n.classList.remove('active'));
  el.classList.add('active');closeMobileSb();render();
}));
// Collapsible sidebar sections
document.querySelectorAll('.sb-toggle').forEach(tgl=>{
  const sec=tgl.dataset.sec;
  const el=document.getElementById('sb-'+sec);
  const arrow=tgl.querySelector('.sb-arrow');
  const key='lf-sb-'+sec;
  if(localStorage.getItem(key)==='0'){el.classList.add('collapsed');arrow.style.transform='rotate(-90deg)'}
  tgl.addEventListener('click',()=>{
    const isOpen=!el.classList.contains('collapsed');
    el.classList.toggle('collapsed');
    arrow.style.transform=isOpen?'rotate(-90deg)':'';
    localStorage.setItem(key,isOpen?'0':'1');
  });
});

async function loadAreas(){areas=await api.get('/api/areas');renderAreas()}
async function loadTags(){allTags=await api.get('/api/tags')}

function renderAreas(){
  const el=$('area-list');
  const pinnedAreaIds=getPinnedAreaIds();
  const sortedAreas=[...areas].sort((left,right)=>{
    const leftPinned=pinnedAreaIds.includes(left.id)?0:1;
    const rightPinned=pinnedAreaIds.includes(right.id)?0:1;
    if(leftPinned!==rightPinned)return leftPinned-rightPinned;
    return (left.position||0)-(right.position||0)||left.id-right.id;
  });
  el.innerHTML=sortedAreas.map(a=>{
    const pct=a.total_tasks?Math.round(a.done_tasks/a.total_tasks*100):0;
    const pinned=pinnedAreaIds.includes(a.id);
    return`<div class="ai ${a.id===activeAreaId?'active':''}" data-id="${a.id}" title="${esc(a.name)}">
    <span class="ai-icon" style="font-size:15px">${esc(a.icon)}</span><span class="an">${esc(a.name)}</span>
    <button class="ai-pin material-icons-round${pinned?' is-pinned':''}" data-id="${a.id}" title="${pinned?'Unpin area':'Pin area'}">${pinned?'keep':'keep_off'}</button>
    ${a.total_tasks?`<span class="ac" title="${a.done_tasks}/${a.total_tasks} done (${pct}%)">${a.pending_tasks||0}</span>`:`<span class="ac">0</span>`}
    <button class="ai-menu material-icons-round" data-id="${a.id}" title="Options">more_vert</button>
  </div>`}).join('');
  el.querySelectorAll('.ai-pin').forEach(btn=>btn.addEventListener('click',async e=>{
    e.stopPropagation();
    await togglePinnedArea(btn.dataset.id);
  }));
  el.querySelectorAll('.ai').forEach(item=>item.addEventListener('click',e=>{
    if(e.target.classList.contains('ai-menu')||e.target.classList.contains('ai-pin'))return;
    activeAreaId=Number(item.dataset.id);activeGoalId=null;currentView='area';
    document.querySelectorAll('.ni,.ai').forEach(n=>n.classList.remove('active'));item.classList.add('active');closeMobileSb();render();
  }));
  // Three-dot context menu on each area
  el.querySelectorAll('.ai-menu').forEach(btn=>btn.addEventListener('click',e=>{
    e.stopPropagation();
    const aid=Number(btn.dataset.id);const area=areas.find(a=>a.id===aid);if(!area)return;
    // Remove any existing context menu
    document.querySelectorAll('.ctx-menu').forEach(m=>m.remove());
    const menu=document.createElement('div');menu.className='ctx-menu';menu.setAttribute('role','menu');
    menu.innerHTML=`
      <div class="ctx-item" role="menuitem" tabindex="0" data-act="edit"><span class="material-icons-round">edit</span>Edit Area</div>
      <div class="ctx-item" role="menuitem" tabindex="0" data-act="archive"><span class="material-icons-round">archive</span>Archive</div>
      <div class="ctx-item ctx-danger" role="menuitem" tabindex="0" data-act="delete"><span class="material-icons-round">delete</span>Delete</div>`;
    const rect=btn.getBoundingClientRect();
    document.body.appendChild(menu);
    const mw=menu.offsetWidth,mh=menu.offsetHeight;
    menu.style.left=Math.min(rect.right,window.innerWidth-mw-8)+'px';
    menu.style.top=Math.min(rect.bottom,window.innerHeight-mh-8)+'px';
    // Close on outside click
    const closeMenu=ev=>{if(!menu.contains(ev.target)){menu.remove();document.removeEventListener('click',closeMenu)}};
    setTimeout(()=>document.addEventListener('click',closeMenu),0);
    menu.querySelector('[data-act="edit"]').addEventListener('click',()=>{
      menu.remove();openAreaModal(area);
    });
    menu.querySelector('[data-act="archive"]').addEventListener('click',async()=>{
      menu.remove();
      await api.put('/api/areas/'+aid+'/archive');
      if(aid===activeAreaId){activeAreaId=null;currentView='myday'}
      await loadAreas();render();
      showToast('Area archived — "'+area.name+'"',async()=>{
        await api.put('/api/areas/'+aid+'/unarchive');await loadAreas();render();
      });
    });
    menu.querySelector('[data-act="delete"]').addEventListener('click',async()=>{
      menu.remove();
      if(!confirm('Delete "'+area.name+'" and all its goals/tasks? This cannot be undone.'))return;
      const aGoals=await api.get('/api/areas/'+aid+'/goals');
      const aTaskSets=await Promise.all(aGoals.map(g=>api.get('/api/goals/'+g.id+'/tasks')));
      await api.del('/api/areas/'+aid);
      if(aid===activeAreaId){activeAreaId=null;currentView='myday'}
      await loadAreas();render();
      showToast('Area deleted — "'+area.name+'"', async()=>{
        const ra=await api.post('/api/areas',{name:area.name,icon:area.icon,color:area.color});
        for(let i=0;i<aGoals.length;i++){
          const g=aGoals[i];
          const rg=await api.post('/api/areas/'+ra.id+'/goals',{title:g.title,description:g.description||'',due_date:g.due_date||null,color:g.color||'#6C63FF'});
          for(const t of aTaskSets[i]){
            await api.post('/api/goals/'+rg.id+'/tasks',{title:t.title,notes:t.notes||'',status:t.status,priority:t.priority,due_date:t.due_date||null,my_day:t.my_day?1:0,recurring:t.recurring||null});
          }
        }
        await loadAreas();render();
      });
    });
  }));
}

async function render(){
  $('vt').style.display=(currentView==='goal')?'flex':'none';
  hideMultiSelectBar();selectedIds.clear();msMode=false;document.body.classList.remove('ms-mode');
  // Clean up scoped event listeners from previous render
  if(window.Events)Events.cleanupAll();
  // Show loading state for slow networks
  const ct=$('ct');if(ct&&!ct.innerHTML.trim())ct.classList.add('loading');
  // Persist last view
  if(!['area','goal','filter','smartlist','help','lists','listdetail'].includes(currentView))localStorage.setItem('lf-lastView',currentView);
  try{
  if(currentView==='myday')await renderMyDay();
  else if(currentView==='tasks')await renderTasksHub();
  else if(currentView==='focus')await renderFocusHub();
  else if(currentView==='all')await renderAll();
  else if(currentView==='board')await renderGlobalBoard();
  else if(currentView==='calendar')await renderCal();
  else if(currentView==='overdue')await renderOverdue();
  else if(currentView==='dashboard')await renderDashboard();
  else if(currentView==='weekly')await renderWeekly();
  else if(currentView==='matrix')await renderMatrix();
  else if(currentView==='logbook')await renderLogbook();
  else if(currentView==='tags')await renderTags();
  else if(currentView==='focushistory')await renderFocusHistory();
  else if(currentView==='templates')await renderTemplates();
  else if(currentView==='settings')await renderSettings();
  else if(currentView==='habits')await renderHabits();
  else if(currentView==='planner')await renderPlanner();
  else if(currentView==='taskplanner')await renderTaskPlanner();
  else if(currentView==='upcoming')await renderUpcoming();
  else if(currentView==='inbox')await renderInbox();
  else if(currentView==='review')await renderWeeklyReview();
  else if(currentView==='notes')await renderNotes();
  else if(currentView==='timeanalytics')await renderTimeAnalytics();
  else if(currentView==='rules')await renderRules();
  else if(currentView==='problems')await renderProblemsView($('ct'));
  else if(currentView==='goals')await renderGoalsView($('ct'));
  else if(currentView==='areas')await renderAreasView($('ct'));
  else if(currentView==='search')await renderSearchView($('ct'));
  else if(currentView==='reports')await renderReports();
  else if(currentView==='help')renderHelp();
  else if(currentView==='changelog')renderChangelog();
  else if(currentView==='lists')await renderLists();
  else if(currentView==='listdetail')await renderListDetail();
  else if(currentView==='smartlist')await renderSmartList();
  else if(currentView==='filter')await renderSavedFilter();
  else if(currentView==='area')await renderArea();
  else if(currentView==='goal')await renderGoal();
  }catch(err){
    console.error('[LifeFlow] Render error ('+currentView+'):', err);
    if(typeof showToast==='function')showToast('Something went wrong loading this view','error');
  }
  // Remove loading state
  if(ct)ct.classList.remove('loading');
  updateBC();
}

function updateBC(){
  const bc=$('bc'),pt=$('pt');let html='';
  if(currentView==='myday'){pt.textContent='Today';bc.innerHTML=''}
  else if(currentView==='tasks'){pt.textContent='Tasks';bc.innerHTML=''}
  else if(currentView==='focus'){pt.textContent='Focus';bc.innerHTML=''}
  else if(currentView==='all'){pt.textContent='All Tasks';bc.innerHTML=''}
  else if(currentView==='board'){pt.textContent='Board';bc.innerHTML=''}
  else if(currentView==='calendar'){pt.textContent='Calendar';bc.innerHTML=''}
  else if(currentView==='overdue'){pt.textContent='Overdue';bc.innerHTML=''}
  else if(currentView==='logbook'){pt.textContent='Activity Log';bc.innerHTML=''}
  else if(currentView==='weekly'){pt.textContent='Weekly Plan';bc.innerHTML=''}
  else if(currentView==='matrix'){pt.textContent='Eisenhower Matrix';bc.innerHTML=''}
  else if(currentView==='dashboard'){pt.textContent='Dashboard';bc.innerHTML=''}
  else if(currentView==='tags'){pt.textContent='Tag Manager';bc.innerHTML=''}
  else if(currentView==='focushistory'){pt.textContent='Focus History';bc.innerHTML=''}
  else if(currentView==='templates'){pt.textContent='Templates';bc.innerHTML=''}
  else if(currentView==='planner'){pt.textContent='Day Planner';bc.innerHTML=''}
  else if(currentView==='taskplanner'){pt.textContent='Task Planner';bc.innerHTML=''}
  else if(currentView==='settings'){pt.textContent='Settings';bc.innerHTML='<button class=\"settings-home-btn\" id=\"settings-home\"><span class=\"material-icons-round\" style=\"font-size:18px\">arrow_back</span>Home</button>'}
  else if(currentView==='habits'){pt.textContent='Habits';bc.innerHTML=''}
  else if(currentView==='inbox'){pt.textContent='Inbox';bc.innerHTML=''}
  else if(currentView==='review'){pt.textContent='Weekly Review';bc.innerHTML=''}
  else if(currentView==='notes'){pt.textContent='Notes';bc.innerHTML=''}
  else if(currentView==='timeanalytics'){pt.textContent='Time Analytics';bc.innerHTML=''}
  else if(currentView==='rules'){pt.textContent='Automations';bc.innerHTML=''}
  else if(currentView==='problems'){pt.textContent='Problems';bc.innerHTML=''}
  else if(currentView==='goals'){pt.textContent='Goals';bc.innerHTML=''}
  else if(currentView==='areas'){pt.textContent='Life Areas';bc.innerHTML=''}
  else if(currentView==='search'){pt.textContent='Search';bc.innerHTML=''}
  else if(currentView==='reports'){pt.textContent='Reports';bc.innerHTML=''}
  else if(currentView==='help'){pt.textContent='Help & Guide';bc.innerHTML=''}
  else if(currentView==='changelog'){pt.textContent='Changelog';bc.innerHTML=''}
  else if(currentView==='lists'){pt.textContent='Lists';bc.innerHTML=''}
  else if(currentView==='listdetail'){
    pt.textContent=activeListName||'List';
    const activeList=userLists.find(x=>x.id===activeListId);
    const parent=activeList&&activeList.parent_id?userLists.find(x=>x.id===activeList.parent_id):null;
    if(parent){
      bc.innerHTML=`<span data-go="lists" style="cursor:pointer;color:var(--brand)">Lists</span><span class="sep">›</span><span data-go-list="${parent.id}" style="cursor:pointer;color:var(--brand)">${esc(parent.icon)} ${esc(parent.name)}</span><span class="sep">›</span><span>${esc(activeListName||'')}</span>`;
    } else {
      bc.innerHTML=`<span data-go="lists" style="cursor:pointer;color:var(--brand)">Lists</span><span class="sep">›</span><span>${esc(activeListName||'')}</span>`;
    }
  }
  else if(currentView==='smartlist'){
    const names={stale:'Stale Tasks',quickwins:'Quick Wins',blocked:'Blocked'};
    pt.textContent=names[activeSmartFilter]||'Smart List';bc.innerHTML='';
  }
  else if(currentView==='filter'){pt.textContent=activeFilterName||'Saved Filter';bc.innerHTML=''}
  else if(currentView==='area'){
    const a=areas.find(x=>x.id===activeAreaId);
    pt.textContent=a?`${a.icon} ${a.name}`:'';
    bc.innerHTML=`<span data-go="myday">Home</span><span class="sep">›</span><span>${esc(a?a.name:'')}</span>`;
  }else if(currentView==='goal'){
    const a=areas.find(x=>x.id===activeAreaId),g=goals.find(x=>x.id===activeGoalId);
    pt.textContent=g?g.title:'';
    bc.innerHTML=`<span data-go="myday">Home</span><span class="sep">›</span><span data-go="area">${esc(a?a.icon+' '+a.name:'')}</span><span class="sep">›</span><span>${esc(g?g.title:'')}</span>`;
  }
  bc.querySelectorAll('span[data-go]').forEach(s=>{s.style.cursor='pointer';s.addEventListener('click',()=>{
    if(s.dataset.go==='myday'){currentView='myday';activeAreaId=null;activeGoalId=null}
    else if(s.dataset.go==='area'){currentView='area';activeGoalId=null}
    else if(s.dataset.go==='lists'){currentView='lists';activeListId=null}
    document.querySelectorAll('.ni,.ai').forEach(n=>n.classList.remove('active'));render();
  })});
  bc.querySelectorAll('span[data-go-list]').forEach(s=>{s.style.cursor='pointer';s.addEventListener('click',()=>{
    const lid=Number(s.dataset.goList);
    const lst=userLists.find(x=>x.id===lid);
    activeListId=lid;activeListName=lst?lst.name:'List';currentView='listdetail';
    document.querySelectorAll('.ni,.ai,.sf-item').forEach(n=>n.classList.remove('active'));render();
  })});
  // Settings home button
  $('settings-home')?.addEventListener('click',()=>go('myday'));
}

// ─── MY DAY ───
let todayTab=localStorage.getItem('todayTab')||'list';
let completionCount=0;
function getGreeting(){const hr=new Date().getHours();if(hr<12)return 'Good morning';if(hr<17)return 'Good afternoon';return 'Good evening'}
function streakEmoji(n){if(n>=30)return '⚡';if(n>=14)return '🔥🔥';if(n>=7)return '🔥';if(n>=3)return '🌱';return ''}
function progressRingSvg(pct,r=18,stroke=4){const c=2*Math.PI*r;const off=c-(pct/100)*c;return `<svg width="${(r+stroke)*2}" height="${(r+stroke)*2}" style="vertical-align:middle"><circle cx="${r+stroke}" cy="${r+stroke}" r="${r}" fill="none" stroke="var(--brd)" stroke-width="${stroke}"/><circle cx="${r+stroke}" cy="${r+stroke}" r="${r}" fill="none" stroke="var(--ok)" stroke-width="${stroke}" stroke-dasharray="${c}" stroke-dashoffset="${off}" stroke-linecap="round" transform="rotate(-90 ${r+stroke} ${r+stroke})" style="transition:stroke-dashoffset .5s ease"/><text x="${r+stroke}" y="${r+stroke}" text-anchor="middle" dominant-baseline="central" font-size="10" font-weight="600" fill="var(--tx)">${pct}%</text></svg>`}
async function renderMyDay(){return renderToday()}
async function renderToday(){
  const c=$('ct');
  const ds=new Date().toLocaleDateString('en-US',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  // Parallel fetch: my-day tasks, overdue, stats, streaks, habits, balance
  const [t,overdue,stats,streakData,habits,balance]=await Promise.all([
    api.get('/api/tasks/my-day'),
    api.get('/api/tasks/overdue'),
    api.get('/api/stats'),
    api.get('/api/stats/streaks'),
    api.get('/api/habits').catch(()=>[]),
    api.get('/api/stats/balance').catch(()=>({areas:[],dominant:null,lowest:null}))
  ]);
  let gamification={xp_total:0,level:1,daily_goal:5,daily_done:0,weekly_goal:25,weekly_done:0};
  try{gamification=await api.get('/api/gamification/stats')}catch(e){}
  $('myday-badge').textContent=t.filter(x=>x.status!=='done').length;
  const pct=stats.total?Math.round(stats.done/stats.total*100):0;
  const sEmoji=streakEmoji(streakData.streak||0);
  // Daily quote (show once per day if enabled)
  let quoteHtml='';
  const quoteKey='lf-quote-'+_toDateStr(new Date());
  if(appSettings.dailyQuote==='true'&&!sessionStorage.getItem(quoteKey)){
    try{
      const q=await api.get('/api/features/daily-quote');
      if(q.enabled&&q.text){
        sessionStorage.setItem(quoteKey,'1');
        quoteHtml=`<div class="daily-quote-card" id="daily-quote-card">
          <button class="dq-dismiss" title="Dismiss"><span class="material-icons-round" style="font-size:16px">close</span></button>
          <div class="dq-icon">🌿</div>
          <blockquote class="dq-text">${esc(q.text)}</blockquote>
          <cite class="dq-author">— ${esc(q.author)}</cite>
        </div>`;
      }
    }catch(_){}
  }
  // Greeting
  let h=quoteHtml;
  h+=`<div style="font-size:15px;font-weight:600;margin-bottom:4px">${getGreeting()}</div>`;
  h+=`<div style="font-size:13px;color:var(--tx2);margin-bottom:10px">${ds} · ${t.filter(x=>x.status!=='done').length} tasks today</div>`;
  // Stats bar with progress ring
  if(todayTab!=='focus'){
  h+=`<div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;align-items:center">
    <div class="today-stat">${progressRingSvg(pct)}</div>
    <div class="today-stat"><span class="material-icons-round" style="font-size:14px;color:var(--ok)">check_circle</span>${stats.done||0}/${stats.total||0} done</div>
    <div class="today-stat"><span class="material-icons-round" style="font-size:14px;color:var(--brand)">timer</span>${stats.focusMinutes||0}min focus</div>
    <div class="today-stat"><span class="material-icons-round" style="font-size:14px;color:var(--warn)">local_fire_department</span>${sEmoji?sEmoji+' ':''}${streakData.streak||0} streak</div>
    ${overdue.length?`<div class="today-stat"><span class="material-icons-round" style="font-size:14px;color:var(--err)">warning</span>${overdue.length} overdue</div>`:''}
    <div class="today-stat"><span class="material-icons-round" style="font-size:14px;color:var(--brand)">military_tech</span>Lv${gamification.level} · ${gamification.xp_total}XP</div>
    <div class="today-stat" title="Daily: ${gamification.daily_done}/${gamification.daily_goal}  Weekly: ${gamification.weekly_done}/${gamification.weekly_goal}"><span class="material-icons-round" style="font-size:14px;color:${gamification.daily_done>=gamification.daily_goal?'var(--ok)':'var(--txd)'}">emoji_events</span>${gamification.daily_done}/${gamification.daily_goal} daily</div>
  </div>`;
  }
  // Tab toggle
  h+=`<div style="display:flex;gap:4px;margin-bottom:14px;border-bottom:1px solid var(--brd);padding-bottom:8px">
    <button class="btn-c today-tab${todayTab==='list'?' active':''}" data-ttab="list" style="font-size:12px;padding:6px 14px;${todayTab==='list'?'background:var(--brand);color:#fff;border-color:var(--brand)':''}">
      <span class="material-icons-round" style="font-size:14px;vertical-align:middle;margin-right:4px">list</span>List</button>
    <button class="btn-c today-tab${todayTab==='focus'?' active':''}" data-ttab="focus" style="font-size:12px;padding:6px 14px;${todayTab==='focus'?'background:var(--brand);color:#fff;border-color:var(--brand)':''}">
      <span class="material-icons-round" style="font-size:14px;vertical-align:middle;margin-right:4px">center_focus_strong</span>Focus</button>
    <button class="btn-c today-tab${todayTab==='timeline'?' active':''}" data-ttab="timeline" style="font-size:12px;padding:6px 14px;${todayTab==='timeline'?'background:var(--brand);color:#fff;border-color:var(--brand)':''}">
      <span class="material-icons-round" style="font-size:14px;vertical-align:middle;margin-right:4px">schedule</span>Timeline</button>
    <span style="flex:1"></span>
    <button class="btn-c ai-btn" id="ai-plan-day" title="AI: Plan my day" style="font-size:11px;padding:5px 10px;border-color:var(--brand)">
      <span class="material-icons-round" style="font-size:14px;vertical-align:middle;margin-right:3px;color:var(--brand)">smart_toy</span>Plan Day</button>
    <button class="btn-c ai-btn" id="ai-next-task" title="AI: What should I do next?" style="font-size:11px;padding:5px 10px;border-color:var(--brand)">
      <span class="material-icons-round" style="font-size:14px;vertical-align:middle;margin-right:3px;color:var(--brand)">play_arrow</span>Next</button>
  </div>`;

  if(todayTab==='list'){
    h+=hintCard('cmd-palette','keyboard','Press Ctrl+K to open the command palette — search tasks, navigate, and more');
    // Balance alert (max once per day)
    if(balance.dominant){
      const balKey='balance-alert-'+_toDateStr(new Date());
      if(!localStorage.getItem(balKey)){
        localStorage.setItem(balKey,'1');
        h+=`<div class="balance-alert"><span class="material-icons-round" style="font-size:16px;color:var(--warn)">balance</span><span>${esc(balance.dominant.name)} ${balance.dominant.pct}%${balance.lowest?' · '+esc(balance.lowest.name)+' '+balance.lowest.pct+'%':''} — Consider balancing your areas</span><span class="material-icons-round balance-dismiss" style="font-size:14px;cursor:pointer;color:var(--txd);margin-left:auto">close</span></div>`;
      }
    }
    const pending=t.filter(x=>x.status!=='done');
    if(!pending.length&&!overdue.length){
      // "All done!" celebration
      const habDone=habits.filter(x=>x.completed).length;
      h+=`<div class="all-done-card"><span class="material-icons-round" style="font-size:48px;color:var(--ok)">celebration</span><h3 style="margin:8px 0 4px">All done! 🎉</h3>
        <div style="font-size:13px;color:var(--txd);margin-bottom:12px">${stats.done||0} tasks · ${stats.focusMinutes||0}min focus · ${habDone}/${habits.length} habits</div></div>`;
      h+=todayHabitsStrip(habits);
      c.innerHTML=h;wireHints();wireTodayTabs(c);wireTodayHabits(c);wireBalanceDismiss(c);
      await showBriefing();return;
    }
    if(!t.length&&!overdue.length){
      h+=todayHabitsStrip(habits);
      c.innerHTML=h;wireHints();wireTodayTabs(c);wireTodayHabits(c);wireBalanceDismiss(c);
      await showBriefing();return;
    }
    // Overdue section
    if(overdue.length){
      h+=`<div class="sl" style="color:var(--err)"><span class="material-icons-round" style="font-size:14px;vertical-align:middle">warning</span> Overdue <span class="c">${overdue.length}</span></div>`;
      overdue.forEach(tk=>h+=tcHtml(tk,true));
    }
    const p=t.filter(x=>x.status!=='done'),d=t.filter(x=>x.status==='done');
    if(p.length){h+=`<div class="sl">To Do <span class="c">${p.length}</span></div>`;p.forEach(tk=>h+=tcHtml(tk,true))}
    if(d.length&&appSettings.showCompleted!=='false'){
      const doneExpanded=sessionStorage.getItem('today-done-expanded')==='1';
      h+=`<div class="sl today-done-toggle" style="color:var(--ok);cursor:pointer;user-select:none"><span class="material-icons-round" style="font-size:14px;vertical-align:middle;transition:transform .2s">${doneExpanded?'expand_more':'chevron_right'}</span> Done <span class="c">${d.length}</span></div>`;
      h+=`<div class="today-done-list" style="${doneExpanded?'':'display:none'}">`;
      d.forEach(tk=>h+=tcHtml(tk,true));
      h+=`</div>`;
    }
    // Smart My Day suggestions drawer
    if(p.length<3){
      try{
        const suggested=await api.get('/api/tasks/suggestions');
        if(suggested.length){
          h+=`<div class="sl" style="margin-top:12px"><span class="material-icons-round" style="font-size:14px;vertical-align:middle;color:var(--brand)">lightbulb</span> Suggested for Today <span class="c">${suggested.length}</span></div>`;
          suggested.forEach(tk=>{
            const reasons = (tk.reasons||[]).join(', ');
            h+=`<div class="suggestion-card" style="display:flex;align-items:center;gap:8px;padding:8px 12px;margin-bottom:4px;border-radius:var(--rs);background:var(--bg-s);font-size:13px">
              <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escA(reasons)}">${esc(tk.title)}</span>
              ${tk.due_date?`<span style="font-size:11px;color:var(--txd)">${fmtDue(tk.due_date)}</span>`:''}
              <span style="font-size:10px;color:var(--brand);font-weight:600">${tk.score}pt</span>
              <button class="btn-c add-myday-btn" data-id="${tk.id}" style="font-size:11px;padding:6px 8px" title="Add to My Day">
                <span class="material-icons-round" style="font-size:14px">add</span>My Day</button>
            </div>`;
          });
        }
      }catch(e){}
    }
  }else if(todayTab==='focus'){
    // Focus mode — minimal task list
    const p=t.filter(x=>x.status!=='done');
    if(overdue.length){
      h+=`<div class="sl" style="color:var(--err)"><span class="material-icons-round" style="font-size:14px;vertical-align:middle">warning</span> Overdue <span class="c">${overdue.length}</span></div>`;
      overdue.forEach(tk=>h+=tcMinHtml(tk));
    }
    if(p.length){
      p.forEach(tk=>h+=tcMinHtml(tk));
    }
    const doneCount=t.filter(x=>x.status==='done').length;
    if(doneCount){
      h+=`<div style="text-align:center;padding:12px;color:var(--txd);font-size:12px">✓ ${doneCount} completed today</div>`;
    }
    if(!p.length&&!overdue.length){
      h+=`<div class="all-done-card"><span class="material-icons-round" style="font-size:48px;color:var(--ok)">celebration</span><h3 style="margin:8px 0 4px">All done! 🎉</h3></div>`;
    }
  }else{
    // Timeline tab — inline planner with absolute positioning
    const planDate=_toDateStr(new Date());
    let planData={scheduled:[],unscheduled:[]};
    try{planData=await api.get('/api/planner/'+planDate)}catch(e){}
    const myDayUnscheduled=t.filter(tk=>!tk.time_block_start&&tk.status!=='done');
    const allUnsched=[...planData.unscheduled,...myDayUnscheduled.filter(u=>!planData.unscheduled.find(x=>x.id===u.id))];
    h+=`<div class="planner-wrap">`;
    h+=_tlBuildGrid(planData.scheduled,{showNowLine:true});
    h+=`<div class="planner-sidebar"><div class="planner-unscheduled"><h4>Unscheduled (${allUnsched.length})</h4>`;
    if(!allUnsched.length)h+=`<div style="text-align:center;padding:12px;color:var(--txd);font-size:12px">Drag tasks to time slots</div>`;
    allUnsched.forEach(u=>{
      h+=`<div class="planner-task-unsched" draggable="true" data-id="${u.id}" style="border-left-color:${escA(u.goal_color||'var(--brand)')};background:${escA(u.goal_color||'var(--brand)')}15"><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(u.title)}</span></div>`;
    });
    h+=`</div></div></div>`;
  }
  // Daily micro-review banner (after 6pm, dismissible) — not in focus mode
  if(todayTab!=='focus'){
  const _drHour=new Date().getHours();
  const _drKey='daily-review-'+_toDateStr(new Date());
  if(_drHour>=18&&!localStorage.getItem(_drKey)){
    const doneCount=t.filter(x=>x.status==='done').length;
    h+=`<div class="daily-review-banner" style="margin-top:14px;padding:12px 16px;border-radius:var(--rs);background:var(--bg-s);border:1px solid var(--brd);display:flex;align-items:center;gap:10px">
      <span class="material-icons-round" style="font-size:20px;color:var(--brand)">nights_stay</span>
      <span style="flex:1;font-size:13px">How was your day? You completed <strong>${doneCount}</strong> task${doneCount!==1?'s':''}.</span>
      <button class="btn-c dr-open-btn" style="font-size:12px;padding:6px 12px">Reflect</button>
      <span class="material-icons-round dr-dismiss" style="font-size:14px;cursor:pointer;color:var(--txd)">close</span>
    </div>`;
  }
  // Habits strip
  h+=todayHabitsStrip(habits);
  }
  c.innerHTML=h;attachTE();wireHints();wireTodayTabs(c);wireTodayHabits(c);wireBalanceDismiss(c);
  // Done section collapse/expand toggle
  c.querySelectorAll('.today-done-toggle').forEach(el=>el.addEventListener('click',()=>{
    const list=c.querySelector('.today-done-list');if(!list)return;
    const icon=el.querySelector('.material-icons-round');
    const isOpen=list.style.display!=='none';
    list.style.display=isOpen?'none':'';
    icon.textContent=isOpen?'chevron_right':'expand_more';
    sessionStorage.setItem('today-done-expanded',isOpen?'0':'1');
  }));
  // Daily review banner handlers
  c.querySelectorAll('.dr-dismiss').forEach(el=>el.addEventListener('click',()=>{
    localStorage.setItem('daily-review-'+_toDateStr(new Date()),'1');
    el.closest('.daily-review-banner').remove();
  }));
  c.querySelectorAll('.dr-open-btn').forEach(btn=>btn.addEventListener('click',async()=>{
    const todayStr=_toDateStr(new Date());
    const note=prompt('Quick reflection on your day:');
    if(note==null)return;
    await api.post('/api/reviews/daily',{date:todayStr,note});
    localStorage.setItem('daily-review-'+todayStr,'1');
    btn.closest('.daily-review-banner').remove();
    showToast('Daily review saved');
  }));
  // "What's Next?" — Add to My Day buttons
  c.querySelectorAll('.add-myday-btn').forEach(btn=>btn.addEventListener('click',async()=>{
    await api.put('/api/tasks/'+btn.dataset.id,{my_day:1});renderToday();
  }));
  // Timeline drag&drop
  if(todayTab==='timeline'){
    _tlWireEvents(c,_toDateStr(new Date()),renderToday);
    attachTouchWeeklyDnD();
  }
}
function todayHabitsStrip(habits){
  if(!habits||!habits.length)return '';
  const today=_toDateStr(new Date());
  let h=`<div style="margin-top:16px;border-top:1px solid var(--brd);padding-top:12px"><div class="sl" style="margin-bottom:8px">Habits</div><div style="display:flex;gap:8px;flex-wrap:wrap">`;
  habits.forEach(hab=>{
    const done=hab.logged_today||false;
    h+=`<button class="btn-c today-hab${done?' done':''}" data-habid="${hab.id}" style="font-size:12px;padding:6px 12px;border-radius:16px;${done?'background:var(--ok);color:#fff;border-color:var(--ok)':''}">
      ${esc(hab.icon||'⚡')} ${esc(hab.name)}${done?' ✓':''}</button>`;
  });
  h+=`</div></div>`;
  return h;
}
function wireTodayTabs(c){
  c.querySelectorAll('.today-tab').forEach(btn=>btn.addEventListener('click',()=>{todayTab=btn.dataset.ttab;localStorage.setItem('todayTab',todayTab);renderToday()}));
  // AI buttons
  $('ai-plan-day')?.addEventListener('click',async()=>{
    const btn=$('ai-plan-day');
    if(btn)btn.disabled=true;
    try{
      const r=await api.post('/api/ai/plan-day',{});
      if(r.data)showAiPlanModal(r.data);
      else showToast('No plan generated','info');
    }catch(e){showToast(e.message||'AI unavailable','error')}
    finally{if(btn)btn.disabled=false}
  });
  $('ai-next-task')?.addEventListener('click',async()=>{
    const btn=$('ai-next-task');
    if(btn)btn.disabled=true;
    try{
      const r=await api.post('/api/ai/next-task',{});
      if(r.data?.task_id){
        showToast(`Next: ${esc(r.data.reason||'Focus on your highest-priority task')}`,'ok',6000);
        openDP(r.data.task_id);
      }else if(r.data?.reason){
        showToast(r.data.reason,'ok',4000);
      }else{showToast('No suggestions available','info')}
    }catch(e){showToast(e.message||'AI unavailable','error')}
    finally{if(btn)btn.disabled=false}
  });
}
function wireTodayHabits(c){
  c.querySelectorAll('.today-hab').forEach(btn=>btn.addEventListener('click',async()=>{
    const hid=Number(btn.dataset.habid);
    if(btn.classList.contains('done')){await api.del('/api/habits/'+hid+'/log')}
    else{await api.post('/api/habits/'+hid+'/log',{})}
    renderToday();
  }));
}
function wireBalanceDismiss(c){
  c.querySelectorAll('.balance-dismiss').forEach(el=>el.addEventListener('click',()=>{el.closest('.balance-alert').remove()}));
  const dqCard=c.querySelector('.dq-dismiss');
  if(dqCard) dqCard.addEventListener('click',()=>{dqCard.closest('.daily-quote-card').remove()});
}

// ─── TASKS HUB (List / Board / Calendar tab strip) ───
let _tasksTab=localStorage.getItem('lf-tasksTab')||'list';
async function renderTasksHub(){
  const c=$('ct');
  const tabs=[{id:'list',label:'List',icon:'list'},{id:'board',label:'Board',icon:'view_kanban'},{id:'calendar',label:'Calendar',icon:'calendar_month'},{id:'table',label:'Table',icon:'table_chart'},{id:'gantt',label:'Gantt',icon:'view_timeline'}];
  let h='<div class="tasks-hub-tabs" style="display:flex;gap:4px;margin-bottom:14px;border-bottom:1px solid var(--brd);padding-bottom:8px">';
  tabs.forEach(t=>{
    const act=_tasksTab===t.id;
    h+=`<button class="btn-c th-tab${act?' active':''}" data-thtab="${t.id}" style="font-size:12px;padding:6px 14px;border-radius:var(--rs);${act?'background:var(--brand);color:#fff;border-color:var(--brand)':''}"><span class="material-icons-round" style="font-size:14px;vertical-align:middle;margin-right:4px">${t.icon}</span>${t.label}</button>`;
  });
  h+='</div><div id="tasks-hub-content"></div>';
  c.innerHTML=h;
  // Render active tab content into sub-container
  const sub=document.getElementById('tasks-hub-content');
  if(_tasksTab==='list')await renderAll(sub);
  else if(_tasksTab==='board')await renderGlobalBoard(sub);
  else if(_tasksTab==='calendar')await renderCal(sub);
  else if(_tasksTab==='table')await renderTable(sub);
  else if(_tasksTab==='gantt')await renderGantt(sub);
  // Wire tabs
  c.querySelectorAll('.th-tab').forEach(btn=>btn.addEventListener('click',()=>{
    _tasksTab=btn.dataset.thtab;localStorage.setItem('lf-tasksTab',_tasksTab);renderTasksHub();
  }));
}

// ─── GANTT CHART MVP ───
async function renderGantt(ct){
  // Compute date range: 2 weeks before and 4 weeks after today
  const today=new Date();
  const start=new Date(today);start.setDate(start.getDate()-14);
  const end=new Date(today);end.setDate(end.getDate()+28);
  const fmt=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const data=await api.get(`/api/tasks/timeline?start=${fmt(start)}&end=${fmt(end)}`);
  const tasks=data.tasks||[];
  // Layout constants
  const dayW=40,rowH=32,headerH=44,taskListW=220,padTop=8;
  const totalDays=Math.ceil((end-start)/(86400000))+1;
  const svgW=totalDays*dayW;
  const svgH=headerH+tasks.length*rowH+padTop;
  // Group tasks by area
  const areaMap={};tasks.forEach(t=>{const k=t.area_name||'No Area';(areaMap[k]=areaMap[k]||[]).push(t)});
  const groupedTasks=[];
  Object.keys(areaMap).sort().forEach(area=>{groupedTasks.push({type:'header',area});areaMap[area].forEach(t=>groupedTasks.push({type:'task',task:t}))});
  const totalRows=groupedTasks.length;
  const totalH=headerH+totalRows*rowH+padTop;
  // Build HTML
  let h=`<div class="gantt-wrap" style="display:flex;height:calc(100vh - 200px);overflow:hidden;border:1px solid var(--brd);border-radius:var(--rs)">`;
  // Left panel: task list
  h+=`<div class="gantt-tasks" style="width:${taskListW}px;overflow-y:auto;border-right:1px solid var(--brd);flex-shrink:0">`;
  h+=`<div style="height:${headerH}px;padding:8px 12px;border-bottom:1px solid var(--brd);font-size:12px;font-weight:600;color:var(--txd);display:flex;align-items:flex-end">Tasks</div>`;
  groupedTasks.forEach((r,i)=>{
    const y=headerH+i*rowH;
    if(r.type==='header'){
      h+=`<div style="height:${rowH}px;padding:0 12px;display:flex;align-items:center;background:var(--bg2);font-size:11px;font-weight:600;color:var(--txd)">▾ ${esc(r.area)}</div>`;
    } else {
      const t=r.task;
      const priColor=t.priority>=3?'var(--err)':t.priority>=2?'var(--warn)':'';
      h+=`<div class="gantt-task-label" data-gtid="${t.id}" style="height:${rowH}px;padding:0 12px;display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;overflow:hidden;border-bottom:1px solid var(--brd)" title="${escA(t.title)}">`;
      if(t.status==='done')h+=`<span class="material-icons-round" style="font-size:14px;color:var(--ok)">check_circle</span>`;
      else h+=`<span class="material-icons-round" style="font-size:14px;color:var(--txd)">radio_button_unchecked</span>`;
      h+=`<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;${priColor?'color:'+priColor:''}">${esc(t.title)}</span></div>`;
    }
  });
  h+=`</div>`;
  // Right panel: SVG timeline
  h+=`<div class="gantt-timeline" style="flex:1;overflow:auto;position:relative">`;
  h+=`<svg width="${svgW}" height="${totalH}" xmlns="http://www.w3.org/2000/svg" style="font-family:Inter,sans-serif">`;
  // Day headers
  for(let i=0;i<totalDays;i++){
    const d=new Date(start);d.setDate(d.getDate()+i);
    const x=i*dayW;
    const isWeekend=d.getDay()===0||d.getDay()===6;
    const isToday=fmt(d)===fmt(today);
    // Weekend background
    if(isWeekend)h+=`<rect x="${x}" y="0" width="${dayW}" height="${totalH}" fill="var(--bg2)" opacity="0.5"/>`;
    // Day separator line
    h+=`<line x1="${x}" y1="${headerH}" x2="${x}" y2="${totalH}" stroke="var(--brd)" stroke-width="0.5"/>`;
    // Day label
    const dayLabel=d.toLocaleDateString('en-US',{weekday:'short'});
    const dateLabel=d.getDate();
    const monthLabel=d.getDate()===1||i===0?d.toLocaleDateString('en-US',{month:'short'})+' ':'';
    h+=`<text x="${x+dayW/2}" y="16" text-anchor="middle" font-size="10" fill="${isToday?'var(--brand)':'var(--txd)'}" font-weight="${isToday?'700':'400'}">${monthLabel}${dateLabel}</text>`;
    h+=`<text x="${x+dayW/2}" y="30" text-anchor="middle" font-size="9" fill="${isToday?'var(--brand)':'var(--txd)'}">${dayLabel}</text>`;
  }
  // Header separator
  h+=`<line x1="0" y1="${headerH}" x2="${svgW}" y2="${headerH}" stroke="var(--brd)" stroke-width="1"/>`;
  // Task bars
  groupedTasks.forEach((r,i)=>{
    const y=headerH+i*rowH+padTop;
    if(r.type==='task'){
      const t=r.task;
      const dueDate=new Date(t.due_date+'T00:00:00');
      const dayOffset=Math.floor((dueDate-start)/(86400000));
      const estDays=t.estimated_minutes?Math.max(1,Math.ceil(t.estimated_minutes/480)):1; // 8h workday
      const barX=dayOffset*dayW+2;
      const barW=Math.max(estDays*dayW-4,dayW-4);
      const barY=y+4;
      const barH=rowH-12;
      const color=t.goal_color||'var(--brand)';
      const opacity=t.status==='done'?'0.4':'1';
      // Bar
      h+=`<rect class="gantt-bar" data-gbid="${t.id}" data-due="${escA(t.due_date||'')}" x="${barX}" y="${barY}" width="${barW}" height="${barH}" rx="4" fill="${color}" opacity="${opacity}" tabindex="0" role="button" aria-label="${escA(t.title)} due ${escA(t.due_date||'undated')}" style="cursor:grab"/>`;
      // Progress fill if subtasks
      if(t.subtask_total>0){
        const pct=t.subtask_done/t.subtask_total;
        if(pct>0){
          h+=`<rect x="${barX}" y="${barY}" width="${Math.round(barW*pct)}" height="${barH}" rx="4" fill="${color}" opacity="${Number(opacity)*0.6}" style="pointer-events:none"/>`;
        }
      }
      // Title text on bar if wide enough
      if(barW>60){
        h+=`<text x="${barX+6}" y="${barY+barH/2+4}" font-size="10" fill="#fff" style="pointer-events:none" clip-path="url(#clip-${t.id})">${esc(t.title.substring(0,20))}</text>`;
      }
    }
  });
  // Today marker
  const todayOffset=Math.floor((today-start)/(86400000));
  const todayX=todayOffset*dayW+dayW/2;
  h+=`<line x1="${todayX}" y1="${headerH}" x2="${todayX}" y2="${totalH}" stroke="var(--err)" stroke-width="2" stroke-dasharray="4,4" opacity="0.7"/>`;
  h+=`</svg></div></div>`;
  ct.innerHTML=h;
  // Wire click on task labels
  ct.querySelectorAll('.gantt-task-label').forEach(el=>el.addEventListener('click',()=>{
    const tid=Number(el.dataset.gtid);if(tid)openDP(tid);
  }));
  const shiftTaskDueDate=async(taskId,baseDate,deltaDays)=>{
    if(!taskId||!baseDate||!deltaDays)return;
    const nextDateObj=_parseDate(baseDate);
    nextDateObj.setDate(nextDateObj.getDate()+deltaDays);
    const nextDate=fmt(nextDateObj);
    await api.put('/api/tasks/'+taskId,{due_date:nextDate});
    renderGantt(ct);
  };
  // Wire click, drag, and keyboard on bars
  ct.querySelectorAll('.gantt-bar').forEach(el=>{
    let dragStartX=0,dragDeltaDays=0,isDragging=false,baseDate='';
    el.addEventListener('click',()=>{
      if(isDragging)return;
      const tid=Number(el.dataset.gbid);if(tid)openDP(tid);
    });
    el.addEventListener('keydown',async e=>{
      const tid=Number(el.dataset.gbid);const due=el.dataset.due;
      if(!tid||!due)return;
      if(e.key==='ArrowLeft'){e.preventDefault();await shiftTaskDueDate(tid,due,-1)}
      else if(e.key==='ArrowRight'){e.preventDefault();await shiftTaskDueDate(tid,due,1)}
      else if(e.key==='Enter'||e.key===' '){e.preventDefault();openDP(tid)}
    });
    el.addEventListener('mousedown',e=>{
      dragStartX=e.clientX;baseDate=el.dataset.due||'';dragDeltaDays=0;isDragging=false;
      el.classList.add('is-active');
      const onMove=moveEvent=>{
        const nextDelta=Math.round((moveEvent.clientX-dragStartX)/dayW);
        if(nextDelta!==0){isDragging=true;dragDeltaDays=nextDelta;el.classList.add('is-dragging')}
      };
      const onUp=async()=>{
        window.removeEventListener('mousemove',onMove);
        window.removeEventListener('mouseup',onUp);
        el.classList.remove('is-active','is-dragging');
        const tid=Number(el.dataset.gbid);
        if(isDragging&&dragDeltaDays&&tid&&baseDate){await shiftTaskDueDate(tid,baseDate,dragDeltaDays)}
        setTimeout(()=>{isDragging=false},0);
      };
      window.addEventListener('mousemove',onMove);
      window.addEventListener('mouseup',onUp,{once:true});
    });
  });
  // Sync scroll between task list and timeline
  const tl=ct.querySelector('.gantt-timeline');
  const tsList=ct.querySelector('.gantt-tasks');
  if(tl&&tsList){
    tl.addEventListener('scroll',()=>{tsList.scrollTop=tl.scrollTop});
    tsList.addEventListener('scroll',()=>{tl.scrollTop=tsList.scrollTop});
  }
  // Scroll to today
  if(tl){tl.scrollLeft=Math.max(0,todayX-tl.clientWidth/2)}
}

// ─── TABLE VIEW ───
let _tvSort={col:'due_date',dir:'asc'},_tvGroup='none',_tvStatus='all',_tvAreaId='',_tvPage=0;
async function renderTable(ct){
  const limit=100;
  const qs=`sort_by=${_tvSort.col}&sort_dir=${_tvSort.dir}&group_by=${_tvGroup}&limit=${limit}&offset=${_tvPage*limit}${_tvStatus!=='all'?'&status='+_tvStatus:''}${_tvAreaId?'&area_id='+_tvAreaId:''}`;
  const data=await api.get('/api/tasks/table?'+qs);
  const cols=[
    {key:'title',label:'Title',sortable:true,flex:true},
    {key:'area',label:'Area',sortable:true,w:'100px'},
    {key:'goal_title',label:'Goal',sortable:false,w:'120px'},
    {key:'due_date',label:'Due',sortable:true,w:'90px'},
    {key:'priority',label:'Priority',sortable:true,w:'80px'},
    {key:'status',label:'Status',sortable:true,w:'75px'},
    {key:'tags',label:'Tags',sortable:false,w:'100px'},
    {key:'estimated_minutes',label:'Est.',sortable:true,w:'50px'},
    {key:'actual_minutes',label:'Act.',sortable:true,w:'50px'}
  ];
  const priLabels=['—','Normal','High','Critical'];
  const priColors=['var(--txd)','var(--tx)','var(--warn)','var(--err)'];
  // Filters bar
  let h='<div class="tv-filters" style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;align-items:center">';
  h+=`<select class="tv-status-filter" style="padding:6px 10px;border-radius:var(--rs);border:1px solid var(--brd);background:var(--bg2);color:var(--tx);font-size:12px">`;
  ['all','todo','doing','done'].forEach(s=>h+=`<option value="${s}"${_tvStatus===s?' selected':''}>${s==='all'?'All Statuses':s.charAt(0).toUpperCase()+s.slice(1)}</option>`);
  h+='</select>';
  h+=`<select class="tv-group-filter" style="padding:6px 10px;border-radius:var(--rs);border:1px solid var(--brd);background:var(--bg2);color:var(--tx);font-size:12px">`;
  [['none','No Grouping'],['area','Group by Area'],['goal','Group by Goal'],['status','Group by Status'],['priority','Group by Priority']].forEach(([v,l])=>h+=`<option value="${v}"${_tvGroup===v?' selected':''}>${l}</option>`);
  h+='</select>';
  h+=`<span style="font-size:12px;color:var(--txd);margin-left:auto">${data.total} task${data.total!==1?'s':''}</span>`;
  h+='</div>';
  // Groups
  if(_tvGroup!=='none'&&data.groups&&data.groups.length){
    h+='<div class="tv-groups" style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap">';
    data.groups.forEach(g=>h+=`<span style="font-size:11px;padding:4px 8px;border-radius:var(--rs);background:var(--bg2);color:var(--txd)">${esc(String(g.name))} (${g.count})</span>`);
    h+='</div>';
  }
  // Table
  h+='<div class="tv-wrap" style="overflow-x:auto"><table class="tv-table" style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr>';
  cols.forEach(c=>{
    const isSorted=_tvSort.col===c.key;
    const arrow=isSorted?(_tvSort.dir==='asc'?' ↑':' ↓'):'';
    const cursor=c.sortable?'cursor:pointer':'';
    const w=c.flex?'':'width:'+c.w+';min-width:'+c.w;
    h+=`<th class="tv-th${c.sortable?' tv-sortable':''}" data-tvcol="${c.key}" style="text-align:left;padding:8px 6px;border-bottom:2px solid var(--brd);font-weight:600;color:var(--txd);${cursor};${w};white-space:nowrap">${c.label}${arrow}</th>`;
  });
  h+='</tr></thead><tbody>';
  if(!data.tasks.length){
    h+=`<tr><td colspan="${cols.length}" style="padding:32px;text-align:center;color:var(--txd)">No tasks found</td></tr>`;
  }
  data.tasks.forEach((t,i)=>{
    const bg=i%2===0?'':'background:var(--bg2)';
    const overdue=t.due_date&&t.due_date<_toDateStr(new Date())&&t.status!=='done';
    h+=`<tr class="tv-row" data-tvid="${t.id}" style="border-bottom:1px solid var(--brd);${bg};cursor:pointer">`;
    // Title
    h+=`<td style="padding:8px 6px;font-weight:500;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.title)}</td>`;
    // Area
    h+=`<td style="padding:8px 6px;font-size:12px;color:var(--txd)">${t.area_icon||''} ${esc(t.area_name||'')}</td>`;
    // Goal
    h+=`<td style="padding:8px 6px;font-size:12px"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${t.goal_color||'var(--txd)'};margin-right:4px;vertical-align:middle"></span>${esc(t.goal_title||'')}</td>`;
    // Due
    h+=`<td style="padding:8px 6px;font-size:12px;${overdue?'color:var(--err);font-weight:600':''}">${t.due_date?fmtDue(t.due_date):'—'}</td>`;
    // Priority
    h+=`<td style="padding:8px 6px;font-size:12px;color:${priColors[t.priority||0]}">${priLabels[t.priority||0]}</td>`;
    // Status
    const stBg=t.status==='done'?'var(--ok)':t.status==='doing'?'var(--brand)':'var(--txd)';
    h+=`<td style="padding:8px 6px"><span style="font-size:10px;padding:2px 6px;border-radius:var(--rs);background:${stBg};color:#fff">${t.status}</span></td>`;
    // Tags
    h+=`<td style="padding:8px 6px">${(t.tags||[]).map(tg=>`<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${tg.color||'var(--txd)'};margin-right:2px" title="${escA(tg.name)}"></span>`).join('')}</td>`;
    // Est./Act.
    h+=`<td style="padding:8px 6px;font-size:12px;color:var(--txd)">${t.estimated_minutes||'—'}</td>`;
    h+=`<td style="padding:8px 6px;font-size:12px;color:var(--txd)">${t.actual_minutes||'—'}</td>`;
    h+='</tr>';
  });
  h+='</tbody></table></div>';
  // Pagination
  if(data.total>limit){
    const totalPages=Math.ceil(data.total/limit);
    h+=`<div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;font-size:12px;color:var(--txd)">`;
    h+=`<span>Showing ${_tvPage*limit+1}–${Math.min((_tvPage+1)*limit,data.total)} of ${data.total}</span>`;
    h+=`<div style="display:flex;gap:4px">`;
    if(_tvPage>0)h+=`<button class="btn-c tv-prev" style="padding:8px 10px;font-size:12px">← Prev</button>`;
    if(_tvPage<totalPages-1)h+=`<button class="btn-c tv-next" style="padding:8px 10px;font-size:12px">Next →</button>`;
    h+='</div></div>';
  }
  ct.innerHTML=h;
  // Wire events
  ct.querySelectorAll('.tv-sortable').forEach(th=>th.addEventListener('click',()=>{
    const col=th.dataset.tvcol;
    if(_tvSort.col===col)_tvSort.dir=_tvSort.dir==='asc'?'desc':'asc';
    else{_tvSort.col=col;_tvSort.dir='asc';}
    _tvPage=0;renderTasksHub();
  }));
  ct.querySelectorAll('.tv-row').forEach(row=>row.addEventListener('click',()=>{
    const tid=Number(row.dataset.tvid);if(tid)openDP(tid);
  }));
  const statusSel=ct.querySelector('.tv-status-filter');
  if(statusSel)statusSel.addEventListener('change',()=>{_tvStatus=statusSel.value;_tvPage=0;renderTasksHub();});
  const groupSel=ct.querySelector('.tv-group-filter');
  if(groupSel)groupSel.addEventListener('change',()=>{_tvGroup=groupSel.value;_tvPage=0;renderTasksHub();});
  const prevBtn=ct.querySelector('.tv-prev');if(prevBtn)prevBtn.addEventListener('click',e=>{e.stopPropagation();_tvPage--;renderTasksHub();});
  const nextBtn=ct.querySelector('.tv-next');if(nextBtn)nextBtn.addEventListener('click',e=>{e.stopPropagation();_tvPage++;renderTasksHub();});
}

// ─── FOCUS HUB ───
async function renderFocusHub(){
  const c=$('ct');
  const tabs=[{id:'timer',label:'Timer',icon:'timer'},{id:'history',label:'History',icon:'history'},{id:'analytics',label:'Analytics',icon:'analytics'}];
  let _focusTab=window._focusHubTab||'timer';
  let h='<div class="focus-hub-tabs" style="display:flex;gap:4px;margin-bottom:14px;border-bottom:1px solid var(--brd);padding-bottom:8px">';
  tabs.forEach(t=>{
    const act=_focusTab===t.id;
    h+=`<button class="btn-c fh-tab${act?' active':''}" data-fhtab="${t.id}" style="font-size:12px;padding:6px 14px;border-radius:var(--rs);${act?'background:var(--brand);color:#fff;border-color:var(--brand)':''}"><span class="material-icons-round" style="font-size:14px;vertical-align:middle;margin-right:4px">${t.icon}</span>${t.label}</button>`;
  });
  h+='</div><div id="focus-hub-content"></div>';
  c.innerHTML=h;
  const sub=document.getElementById('focus-hub-content');
  if(_focusTab==='timer'){
    const [stats,allTasks]=await Promise.all([api.get('/api/focus/stats'),api.get('/api/tasks/all')]);
    // Sort: priority DESC → due_date ASC (nulls last) → staleness (oldest created first)
    const pending=allTasks.filter(x=>x.status!=='done').sort((a,b)=>{
      if((b.priority||0)!==(a.priority||0))return(b.priority||0)-(a.priority||0);
      if(a.due_date&&b.due_date)return a.due_date.localeCompare(b.due_date);
      if(a.due_date&&!b.due_date)return-1;
      if(!a.due_date&&b.due_date)return 1;
      return(a.created_at||'').localeCompare(b.created_at||'');
    });
    const todayMin=stats.todayMinutes||0;
    const todaySess=stats.todaySessions||0;
    // Stats bar
    let h2=`<div class="fh-stats">
      <div class="fh-stat"><span class="material-icons-round">timer</span><strong>${todayMin}</strong>min</div>
      <div class="fh-stat"><span class="material-icons-round">bolt</span><strong>${todaySess}</strong>session${todaySess!==1?'s':''}</div>
      <div class="fh-stat"><span class="material-icons-round">check_circle</span><strong>${stats.todayCompleted||0}</strong>steps</div>
    </div>`;
    if(!pending.length){
      h2+=`<div style="text-align:center;padding:40px 20px;color:var(--txd)"><span class="material-icons-round" style="font-size:48px;display:block;margin-bottom:8px;opacity:.4">celebration</span>All tasks done! Add more tasks to start a focus session.</div>`;
    } else {
      const topTask=pending[0];
      const topIsDue=topTask.due_date&&(()=>{const dd=_parseDate(topTask.due_date);dd.setHours(23,59,59);return dd<=new Date(Date.now()+86400000)})();
      const topIsStale=topTask.created_at&&(Date.now()-new Date(topTask.created_at).getTime())/(1000*60*60*24)>=3;
      const nudge=topIsDue?'Your most urgent task is due soon — start now!':topIsStale?'Your top task has been waiting — small progress beats none.':'Pick a task and start a focused session.';
      h2+=`<div style="font-size:12px;color:var(--brand);margin:12px 0 4px;font-style:italic">${nudge}</div>`;
      h2+=`<h3 style="font-size:13px;font-weight:600;margin:4px 0 8px;color:var(--tx2)">Pick a task to focus on</h3>`;
      h2+=`<div class="fh-task-list">`;
      pending.slice(0,12).forEach(t=>{
        const stDone=t.subtask_done||0,stTotal=t.subtask_total||0;
        const stPct=stTotal>0?Math.round(stDone/stTotal*100):0;
        const hasSubs=stTotal>0;
        const goalCtx=t.area_icon&&t.goal_title?`${t.area_icon} ${esc(t.goal_title)}`:t.goal_title?esc(t.goal_title):'';
        h2+=`<div class="fh-task-card" data-tid="${t.id}">
          <div class="fh-task-main">
            <div style="flex:1;min-width:0">
              <span class="fh-task-title">${esc(t.title)}</span>
              ${goalCtx?`<div class="fh-task-ctx">${goalCtx}</div>`:''}
            </div>
            <button class="fh-task-go" title="Start focus"><span class="material-icons-round">play_arrow</span></button>
          </div>
          ${hasSubs?`<div class="fh-task-subs"><div class="fh-sub-bar"><div class="fh-sub-fill" style="width:${stPct}%"></div></div><span class="fh-sub-label">${stDone}/${stTotal}</span></div>`:''}
        </div>`;
      });
      h2+=`</div>`;
      if(pending.length>12)h2+=`<div style="font-size:11px;color:var(--txd);text-align:center;margin-top:8px">+${pending.length-12} more tasks</div>`;
    }
    sub.innerHTML=h2;
    sub.querySelectorAll('.fh-task-card').forEach(card=>{
      card.querySelector('.fh-task-go')?.addEventListener('click',e=>{e.stopPropagation();startFocusTimer(Number(card.dataset.tid))});
      card.addEventListener('click',()=>startFocusTimer(Number(card.dataset.tid)));
    });
  } else if(_focusTab==='history'){
    await renderFocusHistory(sub);
  } else if(_focusTab==='analytics'){
    await renderTimeAnalytics(sub);
  }
  c.querySelectorAll('.fh-tab').forEach(btn=>btn.addEventListener('click',()=>{
    window._focusHubTab=btn.dataset.fhtab;renderFocusHub();
  }));
}

// ─── ALL ───
async function renderAll(target){
  const t=await api.get('/api/tasks/all');
  const c=target||$('ct');
  if(!t.length){c.innerHTML=emptyS('checklist','No tasks yet','Create a life area, add a goal, then add tasks',
    `<button class="btn-s" data-action="quick-capture"><span class="material-icons-round" style="font-size:14px">add</span>Quick Add</button>
     <button class="btn-c" data-action="go-inbox">Open Inbox</button>`);wireActions(c);return}
  const p=t.filter(x=>x.status!=='done'),d=t.filter(x=>x.status==='done');
  let h=hintCard('multi-select','check_box','Tip: Click the checkbox on any task, then use the bulk toolbar to update many tasks at once');
  if(p.length){h+=`<div class="sl">Active <span class="c">${p.length}</span></div>`;p.forEach(tk=>h+=tcHtml(tk,true))}
  if(d.length&&appSettings.showCompleted!=='false'){h+=`<div class="sl" style="color:var(--ok)">Completed <span class="c">${d.length}</span></div>`;d.forEach(tk=>h+=tcHtml(tk,true))}
  c.innerHTML=h;attachTE();wireHints();
}

// ─── GLOBAL BOARD ───
let gbFilters={area:'',priority:'',tag:''};
async function renderGlobalBoard(target){
  let qs=[];
  if(gbFilters.area)qs.push('area_id='+gbFilters.area);
  if(gbFilters.priority)qs.push('priority='+gbFilters.priority);
  if(gbFilters.tag)qs.push('tag_id='+gbFilters.tag);
  const url='/api/tasks/board'+(qs.length?'?'+qs.join('&'):'');
  const t=await api.get(url);
  const c=target||$('ct');
  const todo=t.filter(x=>x.status==='todo'),doing=t.filter(x=>x.status==='doing'),done=t.filter(x=>x.status==='done');
  let fh=`<div class="fb">`;
  fh+=`<span class="fb-label">Filter:</span>`;
  fh+=`<select id="gb-area"><option value="">All Areas</option>${areas.map(a=>`<option value="${a.id}" ${gbFilters.area==a.id?'selected':''}>${esc(a.icon)} ${esc(a.name)}</option>`).join('')}</select>`;
  fh+=`<select id="gb-pri"><option value="">All Priorities</option><option value="3" ${gbFilters.priority==='3'?'selected':''}>Critical</option><option value="2" ${gbFilters.priority==='2'?'selected':''}>High</option><option value="1" ${gbFilters.priority==='1'?'selected':''}>Normal</option><option value="0" ${gbFilters.priority==='0'?'selected':''}>None</option></select>`;
  fh+=`<select id="gb-tag"><option value="">All Tags</option>${allTags.map(tg=>`<option value="${tg.id}" ${gbFilters.tag==tg.id?'selected':''}>${esc(tg.name)}</option>`).join('')}</select>`;
  fh+=`</div>`;
  let h=fh+`<div class="board" style="min-height:calc(100vh - 200px)">`;
  h+=`<div class="bcol" data-s="todo" style="flex:1;max-width:none"><div class="bch"><span style="color:var(--tx2)">●</span>${SL('todo')}<span class="c">${todo.length}</span></div><div class="bcb" data-s="todo">${todo.map(x=>tcHtml(x,true)).join('')}</div></div>`;
  h+=`<div class="bcol" data-s="doing" style="flex:1;max-width:none"><div class="bch"><span style="color:var(--brand)">●</span>${SL('doing')}<span class="c">${doing.length}</span></div><div class="bcb" data-s="doing">${doing.map(x=>tcHtml(x,true)).join('')}</div></div>`;
  h+=`<div class="bcol" data-s="done" style="flex:1;max-width:none"><div class="bch"><span style="color:var(--ok)">●</span>${SL('done')}<span class="c">${done.length}</span></div><div class="bcb" data-s="done">${done.map(x=>tcHtml(x,true)).join('')}</div></div>`;
  h+=`</div>`;
  c.innerHTML=h;
  attachTE();
  attachGBD();
  $('gb-area').addEventListener('change',e=>{gbFilters.area=e.target.value;renderGlobalBoard()});
  $('gb-pri').addEventListener('change',e=>{gbFilters.priority=e.target.value;renderGlobalBoard()});
  $('gb-tag').addEventListener('change',e=>{gbFilters.tag=e.target.value;renderGlobalBoard()});
}
function attachGBD(){
  document.querySelectorAll('.tc').forEach(card=>{
    card.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain',card.dataset.id);card.style.opacity='.4'});
    card.addEventListener('dragend',()=>{card.style.opacity='1'});
  });
  document.querySelectorAll('.bcb').forEach(col=>{
    col.addEventListener('dragover',e=>{e.preventDefault();col.parentElement.style.borderColor='var(--brand)'});
    col.addEventListener('dragleave',()=>{col.parentElement.style.borderColor=''});
    col.addEventListener('drop',async e=>{e.preventDefault();col.parentElement.style.borderColor='';
      const id=Number(e.dataTransfer.getData('text/plain'));
      await api.put('/api/tasks/'+id,{status:col.dataset.s});await loadAreas();renderGlobalBoard()});
  });
}

// ─── AREA (Goals) ───
async function renderArea(){
  if(!activeAreaId)return;
  goals=await api.get('/api/areas/'+activeAreaId+'/goals');
  const c=$('ct');
  const goalOpts=goals.map(g=>`<option value="${g.id}">${esc(g.title)}</option>`).join('');
  let h=`<div class="qa"><input type="text" id="gi" placeholder="Add a new goal..."><button id="gab"><span class="material-icons-round" style="font-size:15px">add</span>Add Goal</button></div>`;
  h+=`<div class="qa qa-area-task"><select id="area-task-goal" ${goals.length?'':'disabled'}><option value="">${goals.length?'Choose a goal':'Create a goal first'}</option>${goalOpts}</select><input type="text" id="area-task-input" placeholder="Add a task directly from this area..." ${goals.length?'':'disabled'}><button id="area-task-add" ${goals.length?'':'disabled'}><span class="material-icons-round" style="font-size:15px">add_task</span>Add Task</button></div>`;
  if(!goals.length){h+=emptyS('flag','No goals yet','What do you want to achieve?');c.innerHTML=h;attachGA();return}
  const ac=goals.filter(g=>g.status==='active'),co=goals.filter(g=>g.status==='completed'),ar=goals.filter(g=>g.status==='archived');
  // Load milestones for all goals
  const msMap={};
  for(const g of goals){try{msMap[g.id]=await api.get('/api/goals/'+g.id+'/milestones')}catch(e){msMap[g.id]=[]}}
  if(ac.length){h+=`<div class="sl">Active Goals <span class="c">${ac.length}</span></div><div class="gg">`;
    ac.forEach(g=>{const pct=g.progress_pct||0; const atRisk=g.overdue_count>0&&g.days_until_due!==null&&g.days_until_due<7;
      h+=`<div class="gc${atRisk?' goal-at-risk':''}" data-id="${g.id}" style="border-left-color:${escA(g.color)}">
        <div class="ga"><button class="material-icons-round eg" data-id="${g.id}" title="Edit">edit</button><button class="material-icons-round ag" data-id="${g.id}" title="Archive">archive</button><button class="material-icons-round dg" data-id="${g.id}" title="Delete">delete_outline</button></div>
        <div class="gt">${esc(g.title)}</div>${g.description?`<div class="gd">${esc(g.description)}</div>`:''}
        <div class="gp"><div class="gpb" style="width:${pct}%;background:${escA(g.color)}"></div></div>
        <div class="gm"><span>${g.done_tasks}/${g.total_tasks} tasks · ${pct}%</span>${g.overdue_count?`<span class="goal-overdue">${g.overdue_count} overdue</span>`:''}${g.due_date?`<span>${g.days_until_due!==null&&g.days_until_due<0?`<span class="goal-overdue">Overdue by ${Math.abs(g.days_until_due)}d</span>`:`📅 ${fmtDue(g.due_date)}`}</span>`:''}</div>
        ${(msMap[g.id]||[]).length?`<div style="margin-top:6px;padding-top:6px;border-top:1px solid var(--brd)">${msMap[g.id].map(m=>`<div class="ms-item ${m.done?'done':''}" data-mid="${m.id}"><div class="ms-check ${m.done?'done':''}" data-mid="${m.id}"><span class="material-icons-round">${m.done?'check':''}</span></div><span>${esc(m.title)}</span><span class="material-icons-round ms-del" data-mid="${m.id}">close</span></div>`).join('')}<div style="margin-top:4px"><input type="text" class="ms-add-input" data-gid="${g.id}" placeholder="+ Add milestone..." style="border:none;background:none;font-size:11px;color:var(--txd);outline:none;padding:0;width:100%"></div></div>`:''}
        <button class="btn-c area-task-pick" data-gid="${g.id}" style="margin-top:8px;font-size:11px;padding:4px 8px">Add Task Here</button>
      </div>`});h+=`</div>`}
  if(co.length){h+=`<div class="sl">Completed <span class="c">${co.length}</span></div><div class="gg">`;
    co.forEach(g=>h+=`<div class="gc" data-id="${g.id}" style="border-left-color:var(--ok);opacity:.6"><div class="ga"><button class="material-icons-round ag" data-id="${g.id}" title="Archive">archive</button></div><div class="gt" style="text-decoration:line-through">${esc(g.title)}</div><div class="gm"><span>${g.total_tasks} done</span></div></div>`);h+=`</div>`}
  if(ar.length){h+=`<div class="sl" style="cursor:pointer" id="arch-toggle">Archived <span class="c">${ar.length}</span> <span class="material-icons-round" style="font-size:16px;vertical-align:middle" id="arch-arrow">expand_more</span></div><div class="gg" id="arch-section" style="display:none">`;
    ar.forEach(g=>h+=`<div class="gc" data-id="${g.id}" style="border-left-color:var(--tx2);opacity:.5">
      <div class="ga"><button class="material-icons-round ug" data-id="${g.id}" title="Unarchive">unarchive</button><button class="material-icons-round dg" data-id="${g.id}" title="Delete">delete_outline</button></div>
      <div class="gt">${esc(g.title)}</div><div class="gm"><span>${g.total_tasks||0} tasks</span></div>
    </div>`);h+=`</div>`}
  c.innerHTML=h;attachGA();
  const areaTaskGoal=$('area-task-goal');
  const areaTaskInput=$('area-task-input');
  const areaTaskAdd=$('area-task-add');
  const submitAreaTask=async()=>{
    const title=areaTaskInput?.value.trim();
    const goalId=Number(areaTaskGoal?.value);
    if(!title||!Number.isInteger(goalId))return;
    const dp=Number(appSettings.defaultPriority)||0;const md=appSettings.autoMyDay==='true'?1:0;
    await api.post('/api/goals/'+goalId+'/tasks',{title,priority:dp,my_day:md});
    areaTaskInput.value='';
    await loadAreas();
    renderArea();
  };
  areaTaskAdd?.addEventListener('click',submitAreaTask);
  areaTaskInput?.addEventListener('keydown',e=>{if(e.key==='Enter')submitAreaTask()});
  c.querySelectorAll('.area-task-pick').forEach(btn=>btn.addEventListener('click',e=>{
    e.stopPropagation();
    if(areaTaskGoal)areaTaskGoal.value=String(btn.dataset.gid);
    areaTaskInput?.focus();
  }));
  // Milestone events
  c.querySelectorAll('.ms-check').forEach(el=>el.addEventListener('click',async e=>{
    e.stopPropagation();const mid=Number(el.dataset.mid);
    const isDone=el.classList.contains('done');
    await api.put('/api/milestones/'+mid,{done:isDone?0:1});render();
  }));
  c.querySelectorAll('.ms-del').forEach(el=>el.addEventListener('click',async e=>{
    e.stopPropagation();await api.del('/api/milestones/'+Number(el.dataset.mid));render();
  }));
  c.querySelectorAll('.ms-add-input').forEach(inp=>inp.addEventListener('keydown',async e=>{
    if(e.key!=='Enter')return;e.stopPropagation();
    const title=inp.value.trim();if(!title)return;
    await api.post('/api/goals/'+inp.dataset.gid+'/milestones',{title});inp.value='';render();
  }));
  c.querySelectorAll('.gc').forEach(card=>card.addEventListener('click',e=>{if(e.target.closest('.ga')||e.target.closest('.ms-check')||e.target.closest('.ms-del')||e.target.closest('.ms-add-input'))return;activeGoalId=Number(card.dataset.id);currentView='goal';render()}));
  c.querySelectorAll('.eg').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();openGM(Number(b.dataset.id))}));
  c.querySelectorAll('.dg').forEach(b=>b.addEventListener('click',async e=>{
    e.stopPropagation();const gid=Number(b.dataset.id);
    const g=goals.find(x=>x.id===gid);if(!g)return;
    // Snapshot tasks for undo
    const gTasks=await api.get('/api/goals/'+gid+'/tasks');
    await api.del('/api/goals/'+gid);
    await loadAreas();render();
    showToast('Goal deleted — "'+g.title+'"', async()=>{
      const rg=await api.post('/api/areas/'+activeAreaId+'/goals',{title:g.title,description:g.description||'',due_date:g.due_date||null,color:g.color||'#6C63FF'});
      for(const t of gTasks){
        await api.post('/api/goals/'+rg.id+'/tasks',{title:t.title,notes:t.notes||'',status:t.status,priority:t.priority,due_date:t.due_date||null,my_day:t.my_day?1:0,recurring:t.recurring||null});
      }
      await loadAreas();render();
    });
    await loadAreas();render();
  }));
  // Archive goal
  c.querySelectorAll('.ag').forEach(b=>b.addEventListener('click',async e=>{
    e.stopPropagation();const gid=Number(b.dataset.id);
    await api.put('/api/goals/'+gid,{status:'archived'});showToast('Goal archived');await loadAreas();render();
  }));
  // Unarchive goal
  c.querySelectorAll('.ug').forEach(b=>b.addEventListener('click',async e=>{
    e.stopPropagation();const gid=Number(b.dataset.id);
    await api.put('/api/goals/'+gid,{status:'active'});showToast('Goal restored');await loadAreas();render();
  }));
  // Toggle archived section
  const archToggle=$('arch-toggle');
  if(archToggle)archToggle.addEventListener('click',()=>{
    const sec=$('arch-section'),arr=$('arch-arrow');
    if(sec.style.display==='none'){sec.style.display='';arr.textContent='expand_less'}
    else{sec.style.display='none';arr.textContent='expand_more'}
  });
}
function attachGA(){
  const i=$('gi'),b=$('gab');if(!i||!b)return;
  const add=async()=>{const t=i.value.trim();if(!t||!activeAreaId)return;await api.post('/api/areas/'+activeAreaId+'/goals',{title:t});i.value='';await loadAreas();render()};
  b.addEventListener('click',add);i.addEventListener('keydown',e=>{if(e.key==='Enter')add()});
}

// ─── GOAL (Tasks) ───
async function renderGoal(){
  if(!activeGoalId)return;
  tasks=await api.get('/api/goals/'+activeGoalId+'/tasks');
  const c=$('ct');
  let h=`<div class="qa"><input type="text" id="ti" placeholder="Add a task..."><button id="tab"><span class="material-icons-round" style="font-size:15px">add</span>Add</button><button class="btn-c" id="ai-decompose" title="AI: Break down this goal into tasks" style="font-size:11px;padding:5px 10px;border-color:var(--brand)"><span class="material-icons-round" style="font-size:14px;vertical-align:middle;margin-right:3px;color:var(--brand)">smart_toy</span>Decompose</button></div>`;
  if(goalTab==='board')h+=renderBoard();else h+=renderTL();
  c.innerHTML=h;attachTA();attachTE();
  if(goalTab==='board')attachBD();
  document.querySelectorAll('.vt-btn').forEach(t=>{t.addEventListener('click',()=>{goalTab=t.dataset.tab;document.querySelectorAll('.vt-btn').forEach(x=>x.classList.remove('active'));t.classList.add('active');renderGoal()})});
  // AI Decompose
  $('ai-decompose')?.addEventListener('click',async()=>{
    const btn=$('ai-decompose');
    if(btn){btn.disabled=true;btn.innerHTML='<span class="material-icons-round" style="font-size:14px;vertical-align:middle;animation:spin 1s linear infinite">sync</span> Thinking...';}
    try{
      const r=await api.post('/api/ai/decompose',{goal_id:activeGoalId});
      showAiDecomposeModal(r,activeGoalId);
    }catch(e){showToast(e.message||'AI unavailable','error')}
    finally{if(btn){btn.disabled=false;btn.innerHTML='<span class="material-icons-round" style="font-size:14px;vertical-align:middle;margin-right:3px;color:var(--brand)">smart_toy</span>Decompose';}}
  });
}
function renderTL(){
  if(!tasks.length)return emptyS('task_alt','No tasks yet','Add your first action');
  const todo=tasks.filter(t=>t.status==='todo'),doing=tasks.filter(t=>t.status==='doing'),done=tasks.filter(t=>t.status==='done');
  let h='';
  if(doing.length){h+=`<div class="sl" style="color:var(--brand)">In Progress <span class="c">${doing.length}</span></div>`;doing.forEach(t=>h+=tcHtml(t))}
  if(todo.length){h+=`<div class="sl">${SL('todo')} <span class="c">${todo.length}</span></div>`;todo.forEach(t=>h+=tcHtml(t))}
  if(done.length){h+=`<div class="sl" style="color:var(--ok)">${SL('done')} <span class="c">${done.length}</span></div>`;done.forEach(t=>h+=tcHtml(t))}
  return h;
}
function renderBoard(){
  const todo=tasks.filter(t=>t.status==='todo'),doing=tasks.filter(t=>t.status==='doing'),done=tasks.filter(t=>t.status==='done');
  return`<div class="board">
    <div class="bcol" data-s="todo"><div class="bch"><span style="color:var(--tx2)">●</span>${SL('todo')}<span class="c">${todo.length}</span></div><div class="bcb" data-s="todo">${todo.map(t=>tcHtml(t)).join('')}</div></div>
    <div class="bcol" data-s="doing"><div class="bch"><span style="color:var(--brand)">●</span>${SL('doing')}<span class="c">${doing.length}</span></div><div class="bcb" data-s="doing">${doing.map(t=>tcHtml(t)).join('')}</div></div>
    <div class="bcol" data-s="done"><div class="bch"><span style="color:var(--ok)">●</span>${SL('done')}<span class="c">${done.length}</span></div><div class="bcb" data-s="done">${done.map(t=>tcHtml(t)).join('')}</div></div>
  </div>`;
}

// ─── CALENDAR ───
async function renderCal(target){
  const c=target||$('ct');
  const ws=Number(appSettings.weekStart)||0;
  const todayStr=_toDateStr(new Date());
  const modes=[
    {id:'day',label:'Day',icon:'view_day'},
    {id:'3day',label:'3 Day',icon:'view_column'},
    {id:'workweek',label:'Work Week',icon:'work'},
    {id:'week',label:'Week',icon:'view_week'},
    {id:'month',label:'Month',icon:'calendar_month'}
  ];

  // Calculate date range based on mode
  let dateLabel='',dates=[];
  const refDate=new Date(calY,calM,new Date().getDate());
  // Use a stored calDay for day-level navigation
  if(!window._calDay)window._calDay=_toDateStr(new Date());

  if(calMode==='day'){
    dates=[window._calDay];
    const d=_parseDate(window._calDay);
    dateLabel=d.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'});
  }else if(calMode==='3day'){
    const base=_parseDate(window._calDay);
    for(let i=0;i<3;i++){const d=new Date(base);d.setDate(base.getDate()+i);dates.push(_toDateStr(d))}
    dateLabel=_parseDate(dates[0]).toLocaleDateString('en-US',{month:'short',day:'numeric'})+' – '+_parseDate(dates[2]).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  }else if(calMode==='workweek'){
    const base=_parseDate(window._calDay);const dow=base.getDay()||7;
    const mon=new Date(base);mon.setDate(base.getDate()-(dow-1));
    for(let i=0;i<5;i++){const d=new Date(mon);d.setDate(mon.getDate()+i);dates.push(_toDateStr(d))}
    dateLabel=_parseDate(dates[0]).toLocaleDateString('en-US',{month:'short',day:'numeric'})+' – '+_parseDate(dates[4]).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  }else if(calMode==='week'){
    const base=_parseDate(window._calDay);const dow=(base.getDay()-ws+7)%7;
    const start=new Date(base);start.setDate(base.getDate()-dow);
    for(let i=0;i<7;i++){const d=new Date(start);d.setDate(start.getDate()+i);dates.push(_toDateStr(d))}
    dateLabel=_parseDate(dates[0]).toLocaleDateString('en-US',{month:'short',day:'numeric'})+' – '+_parseDate(dates[6]).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  }

  // MONTH VIEW — existing behavior
  if(calMode==='month'){
    const f=new Date(calY,calM,1),l=new Date(calY,calM+1,0);
    const sd=new Date(f);while(sd.getDay()!==ws)sd.setDate(sd.getDate()-1);
    const ed=new Date(l);while(ed.getDay()!==(ws+6)%7)ed.setDate(ed.getDate()+1);
    const ss=_toDateStr(sd),es=_toDateStr(ed);
    const ct2=await api.get(`/api/tasks/calendar?start=${ss}&end=${es}`);
    const bd={};ct2.forEach(t=>{if(!bd[t.due_date])bd[t.due_date]=[];bd[t.due_date].push(t)});
    const mn=f.toLocaleDateString('en-US',{month:'long',year:'numeric'});
    const isCurrentMonth=calY===new Date().getFullYear()&&calM===new Date().getMonth();
    const isMobileAgenda=window.innerWidth<600;
    if(isMobileAgenda){
      let h=`<div class="ch">
        <button class="material-icons-round" id="cp">chevron_left</button><span class="ctt">${mn}</span><button class="material-icons-round" id="cn">chevron_right</button>
        ${!isCurrentMonth?'<button id="cal-today" class="cal-view-btn">Today</button>':''}
        <span style="flex:1"></span>
        <div class="cal-view-bar">${modes.map(m=>`<button class="cal-view-btn${calMode===m.id?' active':''}" data-mode="${m.id}">${m.label}</button>`).join('')}</div>
      </div><div class="cal-agenda">`;
      const scan=new Date(f);
      while(scan<=l){
        const ds=_toDateStr(scan);
        const dt=bd[ds]||[];
        const dayLabel=scan.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
        h+=`<div class="cal-agenda-day ${ds===todayStr?'today':''}" data-date="${ds}">
          <div class="cal-agenda-head"><strong>${dayLabel}</strong><button class="cal-quick-add" data-date="${ds}" title="Quick add task">+</button></div>`;
        if(dt.length){
          dt.slice(0,6).forEach(t=>{
            const pri=Math.max(0,Math.min(3,Number(t.priority)||0));
            h+=`<span class="ctd p${pri}${t.status==='done'?' done':''}" data-id="${t.id}" title="${escA(t.title)}">${esc(t.title.substring(0,28))}</span>`;
          });
        }else{
          h+='<div class="cal-agenda-empty">No tasks</div>';
        }
        h+='</div>';
        scan.setDate(scan.getDate()+1);
      }
      h+='</div>';
      c.innerHTML=h;
      $('cp').addEventListener('click',()=>{calM--;if(calM<0){calM=11;calY--}renderCal()});
      $('cn').addEventListener('click',()=>{calM++;if(calM>11){calM=0;calY++}renderCal()});
      if(!isCurrentMonth&&$('cal-today'))$('cal-today').addEventListener('click',()=>{calM=new Date().getMonth();calY=new Date().getFullYear();window._calDay=_toDateStr(new Date());renderCal()});
      c.querySelectorAll('.ctd[data-id]').forEach(el=>el.addEventListener('click',e=>{e.stopPropagation();openDP(Number(el.dataset.id))}));
      c.querySelectorAll('.cal-agenda-day[data-date]').forEach(day=>day.addEventListener('click',e=>{if(e.target.closest('.ctd')||e.target.closest('.cal-quick-add'))return;window._calDay=day.dataset.date;calMode='day';localStorage.setItem('lf-calMode','day');renderCal();}));
      c.querySelectorAll('.cal-quick-add[data-date]').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();seedQuickCaptureForDate(btn.dataset.date)}));
      c.querySelectorAll('.cal-view-btn').forEach(btn=>btn.addEventListener('click',()=>{calMode=btn.dataset.mode;localStorage.setItem('lf-calMode',calMode);renderCal()}));
      return;
    }
    let h=`<div class="ch">
      <button class="material-icons-round" id="cp">chevron_left</button><span class="ctt">${mn}</span><button class="material-icons-round" id="cn">chevron_right</button>
      ${!isCurrentMonth?'<button id="cal-today" class="cal-view-btn">Today</button>':''}
      <span style="flex:1"></span>
      <div class="cal-view-bar">${modes.map(m=>`<button class="cal-view-btn${calMode===m.id?' active':''}" data-mode="${m.id}">${m.label}</button>`).join('')}</div>
    </div><div class="cg">`;
    const dayNames=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    for(let i=0;i<7;i++)h+=`<div class="cdh">${dayNames[(ws+i)%7]}</div>`;
    const cur=new Date(sd);while(cur<=ed){
      const ds=_toDateStr(cur);const dt=bd[ds]||[];
      h+=`<div class="cc ${ds===todayStr?'today':''} ${cur.getMonth()!==calM?'om':''}" data-date="${ds}"><div class="cd">${cur.getDate()}</div><button class="cal-quick-add" data-date="${ds}" title="Quick add task">+</button>`;
      dt.slice(0,3).forEach(t=>{
        const pri=Math.max(0,Math.min(3,Number(t.priority)||0));
        h+=`<span class="ctd p${pri}${t.status==='done'?' done':''}" data-id="${t.id}" title="${escA(t.title)}">${esc(t.title.substring(0,18))}</span>`;
      });
      if(dt.length>3)h+=`<span style="font-size:10px;color:var(--txd)">+${dt.length-3}</span>`;
      h+=`</div>`;cur.setDate(cur.getDate()+1);}
    h+=`</div>`;c.innerHTML=h;
    $('cp').addEventListener('click',()=>{calM--;if(calM<0){calM=11;calY--}renderCal()});
    $('cn').addEventListener('click',()=>{calM++;if(calM>11){calM=0;calY++}renderCal()});
    if(!isCurrentMonth&&$('cal-today'))$('cal-today').addEventListener('click',()=>{calM=new Date().getMonth();calY=new Date().getFullYear();window._calDay=_toDateStr(new Date());renderCal()});
    c.querySelectorAll('.ctd[data-id]').forEach(el=>el.addEventListener('click',e=>{e.stopPropagation();openDP(Number(el.dataset.id))}));
    c.querySelectorAll('.cc[data-date]').forEach(cell=>{
      cell.addEventListener('dblclick',e=>{
        if(e.target.closest('.ctd'))return;
        seedQuickCaptureForDate(cell.dataset.date);
      });
      cell.addEventListener('click',e=>{
        if(e.target.closest('.ctd')||e.target.closest('.cal-quick-add'))return;
        // Click a day cell to switch to day view for that date
        window._calDay=cell.dataset.date;calMode='day';localStorage.setItem('lf-calMode','day');renderCal();
      });
    });
    c.querySelectorAll('.cal-quick-add[data-date]').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();seedQuickCaptureForDate(btn.dataset.date)}));
    c.querySelectorAll('.cal-view-btn').forEach(btn=>btn.addEventListener('click',()=>{calMode=btn.dataset.mode;localStorage.setItem('lf-calMode',calMode);renderCal()}));
    return;
  }

  // DAY / MULTI-DAY TIMELINE VIEWS
  const allDatesStr=dates.join(',');
  const rangeStart=dates[0],rangeEnd=dates[dates.length-1];
  // Fetch tasks for the date range
  let allTasks=[];
  try{
    const calTasks=await api.get(`/api/tasks/calendar?start=${rangeStart}&end=${rangeEnd}`);
    allTasks=calTasks;
  }catch(e){}

  // Header
  let h=`<div class="ch">
    <button class="material-icons-round" id="cp">chevron_left</button><span class="ctt">${dateLabel}</span><button class="material-icons-round" id="cn">chevron_right</button>
    <button id="cal-today" class="cal-view-btn">Today</button>
    <span style="flex:1"></span>
    <div class="cal-view-bar">${modes.map(m=>`<button class="cal-view-btn${calMode===m.id?' active':''}" data-mode="${m.id}">${m.label}</button>`).join('')}</div>
  </div>`;

  // Multi-column timeline
  const isSingleDay=dates.length===1;
  h+=`<div style="display:flex;height:calc(100vh - 120px);border:1px solid var(--brd);border-radius:var(--r);overflow:hidden">`;
  // Hour labels column
  h+=`<div style="flex-shrink:0;width:56px;overflow-y:auto;border-right:1px solid var(--brd)" id="cal-hour-labels">`;
  for(let hr=TL_START_HR;hr<=TL_END_HR;hr++){
    const label=hr<12?(hr+' AM'):hr===12?'12 PM':((hr-12)+' PM');
    h+=`<div style="height:${TL_HOUR_PX}px;font-size:11px;font-weight:500;color:var(--txd);padding:4px 8px;text-align:right;border-bottom:1px solid var(--brd);box-sizing:border-box">${label}</div>`;
  }
  h+=`</div>`;
  // Day columns
  h+=`<div style="flex:1;display:flex;overflow-y:auto;overflow-x:auto" id="cal-cols-wrap">`;
  const dayNamesShort=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  dates.forEach(ds=>{
    const dayTasks=allTasks.filter(t=>t.due_date===ds&&t.time_block_start);
    const isToday=ds===todayStr;
    const dd=_parseDate(ds);
    const headerTxt=isSingleDay?'':`<div class="cal-day-header ${isToday?'today':''}"><div class="cal-day-num">${dd.getDate()}</div>${dayNamesShort[dd.getDay()]}</div>`;
    const laid=_tlLayoutColumns(dayTasks);
    const totalHeight=(TL_END_HR-TL_START_HR)*TL_HOUR_PX;
    h+=`<div class="cal-day-col" data-date="${ds}">${headerTxt}`;
    h+=`<div style="position:relative;min-height:${totalHeight}px">`;
    // Hour grid lines
    for(let hr=TL_START_HR;hr<=TL_END_HR;hr++){
      const hKey=String(hr).padStart(2,'0');
      h+=`<div class="planner-hour-body" data-hour="${hKey}" data-col="${ds}" style="position:absolute;top:${(hr-TL_START_HR)*TL_HOUR_PX}px;left:0;right:0;height:${TL_HOUR_PX}px;border-bottom:1px solid var(--brd);box-sizing:border-box"></div>`;
    }
    // Task blocks
    laid.forEach(t=>h+=_tlTaskHtml(t));
    // Now line
    if(isToday){
      const now=new Date();const nowH=now.getHours(),nowM=now.getMinutes();
      if(nowH>=TL_START_HR&&nowH<=TL_END_HR){
        const nowY=_tlMinToY(nowH,nowM);
        h+=`<div style="position:absolute;top:${nowY}px;left:0;right:0;height:2px;background:var(--err);z-index:5;pointer-events:none"></div>`;
      }
    }
    // Unscheduled tasks at bottom
    const unscheduled=allTasks.filter(t=>t.due_date===ds&&!t.time_block_start&&t.status!=='done');
    if(unscheduled.length){
      h+=`<div style="position:absolute;top:${totalHeight+4}px;left:4px;right:4px">`;
      unscheduled.forEach(t=>{
        h+=`<div class="planner-task-unsched" draggable="true" data-id="${t.id}" style="border-left-color:${escA(t.goal_color||'var(--brand)')};background:${escA(t.goal_color||'var(--brand)')}15;font-size:10px;padding:3px 6px">
          <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.title)}</span></div>`;
      });
      h+=`</div>`;
    }
    h+=`</div></div>`;
  });
  h+=`</div></div>`;
  c.innerHTML=h;

  // Sync hour labels scroll with columns scroll
  const colsWrap=c.querySelector('#cal-cols-wrap');
  const hourLabels=c.querySelector('#cal-hour-labels');
  if(colsWrap&&hourLabels){
    colsWrap.addEventListener('scroll',()=>{hourLabels.scrollTop=colsWrap.scrollTop});
    hourLabels.addEventListener('scroll',()=>{colsWrap.scrollTop=hourLabels.scrollTop});
  }

  // Navigation
  const step=calMode==='day'?1:calMode==='3day'?3:7;
  $('cp').addEventListener('click',()=>{const d=_parseDate(window._calDay);d.setDate(d.getDate()-step);window._calDay=_toDateStr(d);calY=d.getFullYear();calM=d.getMonth();renderCal()});
  $('cn').addEventListener('click',()=>{const d=_parseDate(window._calDay);d.setDate(d.getDate()+step);window._calDay=_toDateStr(d);calY=d.getFullYear();calM=d.getMonth();renderCal()});
  $('cal-today')?.addEventListener('click',()=>{window._calDay=_toDateStr(new Date());calY=new Date().getFullYear();calM=new Date().getMonth();renderCal()});
  c.querySelectorAll('.cal-view-btn').forEach(btn=>btn.addEventListener('click',()=>{calMode=btn.dataset.mode;localStorage.setItem('lf-calMode',calMode);renderCal()}));

  // Wire timeline events for each day column
  dates.forEach(ds=>{
    _tlWireEvents(c,ds,renderCal);
  });

  // Scroll to ~8am on load
  if(colsWrap){const scrollTo=(8-TL_START_HR)*TL_HOUR_PX;colsWrap.scrollTop=scrollTo;hourLabels.scrollTop=scrollTo}
}

// ─── Focus mode minimal task card ───
function tcMinHtml(t){
  const cls=['tc','tc-min'];
  if(t.status==='done')cls.push('done');
  if(t.priority===3)cls.push('p3');else if(t.priority===2)cls.push('p2');else if(t.priority===1)cls.push('p1');
  return `<div class="${cls.join(' ')}" data-id="${t.id}">
    <div class="tk" data-id="${t.id}" role="checkbox" tabindex="0" aria-checked="${t.status==='done'}" aria-label="Complete task"><span class="material-icons-round">check</span></div>
    <span class="tc-min-title">${esc(t.title)}</span>
  </div>`;
}

// ─── Task card HTML ───
function tcHtml(t,ctx){
  const cls=['tc'];if(t.status==='done')cls.push('done');
  if(t.priority===3)cls.push('p3');else if(t.priority===2)cls.push('p2');else if(t.priority===1)cls.push('p1');
  let meta='';
  if(t.starred)meta+=`<span class="star-badge">⭐</span>`;
  if(t.start_date)meta+=`<span><span class="material-icons-round">play_arrow</span>${fmtDue(t.start_date)}</span>`;
  if(t.due_date){const o=isOD(t.due_date)&&t.status!=='done';const tm=t.due_time?(' '+new Date('2000-01-01T'+t.due_time).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})):'';meta+=`<span class="${o?'od':''}"><span class="material-icons-round">event</span>${fmtDue(t.due_date)}${tm}</span>`}
  if(t.priority>0)meta+=`<span style="color:${PC[t.priority]}">${PL[t.priority]}</span>`;
  if(t.assigned_to_user_id&&t.assignee_name){const isMe=currentUser&&t.assigned_to_user_id===currentUser.id;meta+=`<span class="asg-badge">👤 ${isMe?'You':esc(t.assignee_name)}</span>`}else if(t.assigned_to)meta+=`<span>👤 ${esc(t.assigned_to)}</span>`;
  if(t.recurring)meta+=`<span>🔁 ${esc(t.recurring)}</span>`;
  if(t.blocked_by&&t.blocked_by.some(b=>b.status!=='done'))meta+=`<span class="blocked-indicator"><span class="material-icons-round" style="font-size:12px">lock</span>Blocked</span>`;
  if(t.my_day&&currentView!=='myday')meta+=`<span>☀️</span>`;
  if(t.estimated_minutes)meta+=`<span class="time-est"><span class="material-icons-round" style="font-size:10px">schedule</span>${t.estimated_minutes}m${t.actual_minutes?` / ${t.actual_minutes}m`:''}</span>`;
  if(t.tags&&t.tags.length)t.tags.forEach(tg=>meta+=`<span class="tag" style="background:${escA(tg.color)}">${esc(tg.name)}</span>`);
  if(t.list_id&&t.list_name)meta+=`<span class="task-list-badge" style="background:${escA(t.list_color||'#2563EB')}20;color:${escA(t.list_color||'#2563EB')}">${esc(t.list_icon||'📋')} ${esc(t.list_name)}</span>`;
  if(ctx){meta+=`<span class="tag" style="background:${escA(t.goal_color||'var(--brand)')}">${esc(t.goal_title||'')}</span>`;
    if(t.area_icon)meta+=`<span>${esc(t.area_icon)} ${esc(t.area_name||'')}</span>`}
  let stBar='';
  if(t.subtask_total>0)stBar=`<div class="st-bar"><span>${t.subtask_done}/${t.subtask_total}</span><div class="st-track"><div class="st-fill" style="width:${Math.round(t.subtask_done/t.subtask_total*100)}%"></div></div></div>`;
  let stList='';
  if(t.subtasks&&t.subtasks.length){
    const expanded=expandedTasks.has(t.id);
    stList=`<div class="tc-expand ${expanded?'open':''}" data-tid="${t.id}"><span class="material-icons-round">chevron_right</span>${t.subtasks.length} subtask${t.subtasks.length>1?'s':''}</div>`;
    stList+=`<div class="tc-subs ${expanded?'open':''}" data-tid="${t.id}">`+t.subtasks.map(s=>`<div class="tc-sub ${s.done?'tc-sub-done':''}">
      <div class="stk" data-sid="${s.id}"><span class="material-icons-round">check</span></div>
      <span class="stx-inline">${esc(s.title)}</span>${s.note?`<span class="material-icons-round" style="font-size:11px;color:var(--txd);margin-left:2px" title="${escA(s.note)}">sticky_note_2</span>`:''}
    </div>`).join('')+`</div>`
  }
  const nextPri=(t.priority+1)%4;
  return`<div class="${cls.join(' ')} ${selectedIds.has(t.id)?'selected':''}" data-id="${t.id}" draggable="true" tabindex="0">
    <div class="ms-chk" data-id="${t.id}"></div>
    <div class="tk" data-id="${t.id}" role="checkbox" tabindex="0" aria-checked="${t.status==='done'}" aria-label="Complete task"><span class="material-icons-round">check</span></div>
    <div class="tb2"><div class="tt">${esc(t.title)}</div>${meta?`<div class="tm">${meta}</div>`:''}${stBar}${stList}</div>
    <div class="ta" style="position:relative"><span class="material-icons-round star-toggle ${t.starred?'active':''}" data-id="${t.id}" title="${t.starred?'Unstar':'Star'}">${t.starred?'star':'star_outline'}</span>${currentView!=='myday'?`<span class="material-icons-round myday-toggle ${t.my_day?'active':''}" data-id="${t.id}" title="${t.my_day?'Remove from My Day':'Add to My Day'}">${t.my_day?'wb_sunny':'light_mode'}</span>`:''}<button class="material-icons-round snz-btn" data-id="${t.id}" title="Reschedule">schedule</button><button class="material-icons-round ft-start" data-id="${t.id}" title="Focus timer">timer</button><button class="material-icons-round et" data-id="${t.id}">edit</button><button class="material-icons-round dt" data-id="${t.id}">delete_outline</button></div>
    <div class="qa-row"><button class="qa-btn qa-star ${t.starred?'active':''}" data-id="${t.id}" title="${t.starred?'Unstar':'Star'} task"><span class="material-icons-round">${t.starred?'star':'star_outline'}</span></button><button class="qa-btn qa-pri pri-${t.priority}" data-id="${t.id}" data-next="${nextPri}" title="Cycle priority (${PL[t.priority]||'None'}→${PL[nextPri]||'None'})"><span class="material-icons-round">flag</span></button><button class="qa-btn qa-date" data-id="${t.id}" title="Set due date"><span class="material-icons-round">event</span></button><button class="qa-btn qa-myday" data-id="${t.id}" title="${t.my_day?'Remove from':'Add to'} My Day"><span class="material-icons-round">${t.my_day?'wb_sunny':'light_mode'}</span></button>${t.recurring?`<button class="qa-btn qa-skip" data-id="${t.id}" title="Skip occurrence"><span class="material-icons-round">skip_next</span></button>`:''}<button class="qa-btn qa-edit" data-id="${t.id}" title="Edit"><span class="material-icons-round">edit</span></button></div>
  </div>`;
}

function attachTA(){
  const i=$('ti'),b=$('tab');if(!i||!b)return;
  const add=async()=>{const t=i.value.trim();if(!t||!activeGoalId)return;const dp=Number(appSettings.defaultPriority)||0;const md=appSettings.autoMyDay==='true'?1:0;await api.post('/api/goals/'+activeGoalId+'/tasks',{title:t,priority:dp,my_day:md});i.value='';await loadAreas();renderGoal()};
  b.addEventListener('click',add);i.addEventListener('keydown',e=>{if(e.key==='Enter')add()});
}
function attachTE(){
  document.querySelectorAll('.tk').forEach(el=>el.addEventListener('click',async e=>{
    e.stopPropagation();const id=Number(el.dataset.id);
    let tk=tasks.find(t=>t.id===id);if(!tk){const a=await api.get('/api/tasks/all');tk=a.find(t=>t.id===id)}
    if(!tk)return;
    const newSt=tk.status==='done'?'todo':'done';
    // Completion animation
    if(newSt==='done'){
      const card=el.closest('.tc');
      if(card)card.classList.add('tc-completing');
      completionCount++;
      if(completionCount%5===0)fireConfetti();
    }
    await api.put('/api/tasks/'+id,{status:newSt});
    if(newSt==='done'){
      showToast('Task completed'+(tk.recurring?' · Next '+tk.recurring+' task created':''), async()=>{
        await api.put('/api/tasks/'+id,{status:'todo'});await loadAreas();render();loadOverdueBadge();
      });
      // Check if goal is now 100% complete
      if(tk.goal_id){
        try{const gt=await api.get('/api/goals/'+tk.goal_id+'/tasks');
        const allDone=gt.length>0&&gt.every(t=>t.status==='done'||(t.id===id));
        if(allDone){fireConfetti();showToast('🎉 Goal complete!')}
        }catch{}
      }
    }
    await loadAreas();render();loadOverdueBadge();
  }));
  document.querySelectorAll('.et').forEach(el=>el.addEventListener('click',e=>{e.stopPropagation();openDP(Number(el.dataset.id))}));
  document.querySelectorAll('.dt').forEach(el=>el.addEventListener('click',async e=>{
    e.stopPropagation();const id=Number(el.dataset.id);
    if(appSettings.confirmDelete==='true'&&!confirm('Delete this task?'))return;
    // Fetch task data first for undo
    let tk; try{ const r=await fetch('/api/tasks/'+id); tk=await r.json(); }catch{}
    await api.del('/api/tasks/'+id);
    showToast('Task deleted', tk ? async()=>{
      await api.post('/api/goals/'+tk.goal_id+'/tasks',{title:tk.title,note:tk.note,priority:tk.priority,due_date:tk.due_date,recurring:tk.recurring,assigned_to:tk.assigned_to,my_day:tk.my_day});
      await loadAreas();render();loadOverdueBadge();showToast('Task restored');
    } : null);
    await loadAreas();render();loadOverdueBadge();
  }));
  // Star toggle
  document.querySelectorAll('.star-toggle').forEach(el=>el.addEventListener('click',async e=>{
    e.stopPropagation();const id=Number(el.dataset.id);
    const isActive=el.classList.contains('active');
    await api.put('/api/tasks/'+id,{starred:isActive?0:1});
    showToast(isActive?'Unstarred':'Starred');
    await loadAreas();render();
  }));
  // Quick star (qa-row)
  document.querySelectorAll('.qa-star').forEach(el=>el.addEventListener('click',async e=>{
    e.stopPropagation();const id=Number(el.dataset.id);
    const isActive=el.classList.contains('active');
    await api.put('/api/tasks/'+id,{starred:isActive?0:1});
    showToast(isActive?'Unstarred':'Starred');
    await loadAreas();render();
  }));
  // My Day quick toggle
  document.querySelectorAll('.myday-toggle').forEach(el=>el.addEventListener('click',async e=>{
    e.stopPropagation();const id=Number(el.dataset.id);
    const isActive=el.classList.contains('active');
    await api.put('/api/tasks/'+id,{my_day:isActive?0:1});
    showToast(isActive?'Removed from My Day':'Added to My Day');
    await loadAreas();render();loadOverdueBadge();
  }));
  // Quick Reschedule (snooze)
  document.querySelectorAll('.snz-btn').forEach(el=>el.addEventListener('click',e=>{
    e.stopPropagation();
    // Close any open snooze dropdown
    document.querySelectorAll('.snooze-dd').forEach(d=>d.remove());
    const ta=el.closest('.ta');
    const dd=document.createElement('div');dd.className='snooze-dd';dd.setAttribute('role','menu');
    const today=new Date();
    const fmt=d=>{const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),dy=String(d.getDate()).padStart(2,'0');return y+'-'+m+'-'+dy};
    const tom=new Date(today);tom.setDate(tom.getDate()+1);
    const nextMon=new Date(today);nextMon.setDate(nextMon.getDate()+((8-nextMon.getDay())%7||7));
    const nextWk=new Date(today);nextWk.setDate(nextWk.getDate()+7);
    const opts=[
      {label:'Today',icon:'wb_sunny',date:fmt(today)},
      {label:'Tomorrow',icon:'skip_next',date:fmt(tom)},
      {label:'Next Monday',icon:'event',date:fmt(nextMon)},
      {label:'Next Week',icon:'date_range',date:fmt(nextWk)},
      {label:'No Date',icon:'block',date:null}
    ];
    dd.innerHTML=opts.map(o=>`<div class="snz-opt" role="menuitem" tabindex="0" data-date="${o.date||''}"><span class="material-icons-round" style="font-size:14px">${o.icon}</span>${o.label}</div>`).join('');
    ta.appendChild(dd);
    // Keyboard navigation for snooze dropdown
    const snzItems=[...dd.querySelectorAll('.snz-opt')];let snzIdx=-1;
    dd.addEventListener('keydown',ev=>{
      if(ev.key==='ArrowDown'){ev.preventDefault();snzIdx=Math.min(snzIdx+1,snzItems.length-1);snzItems[snzIdx]?.focus()}
      else if(ev.key==='ArrowUp'){ev.preventDefault();snzIdx=Math.max(snzIdx-1,0);snzItems[snzIdx]?.focus()}
      else if(ev.key==='Enter'&&snzIdx>=0){ev.preventDefault();snzItems[snzIdx]?.click()}
      else if(ev.key==='Escape'){dd.remove()}
    });
    snzItems[0]?.focus();
    dd.querySelectorAll('.snz-opt').forEach(opt=>opt.addEventListener('click',async ev=>{
      ev.stopPropagation();const id=Number(el.dataset.id);
      const date=opt.dataset.date||null;
      await api.put('/api/tasks/'+id,{due_date:date});
      dd.remove();showToast('Rescheduled');await loadAreas();render();loadOverdueBadge();
    }));
    // Close on outside click
    setTimeout(()=>document.addEventListener('click',function closer(){dd.remove();document.removeEventListener('click',closer)},{once:false}),10);
  }));
  // Inline subtask circle checks
  document.querySelectorAll('.stk').forEach(el=>el.addEventListener('click',async e=>{
    e.stopPropagation();const sid=Number(el.dataset.sid);
    const isDone=el.closest('.tc-sub').classList.contains('tc-sub-done');
    await api.put('/api/subtasks/'+sid,{done:isDone?0:1});await loadAreas();render();
  }));
  // Expand/collapse subtasks
  document.querySelectorAll('.tc-expand').forEach(el=>el.addEventListener('click',e=>{
    e.stopPropagation();const tid=Number(el.dataset.tid);
    if(expandedTasks.has(tid))expandedTasks.delete(tid);else expandedTasks.add(tid);
    el.classList.toggle('open');
    const subs=el.parentElement.querySelector(`.tc-subs[data-tid="${tid}"]`);
    if(subs)subs.classList.toggle('open');
  }));
  // Click card to open detail
  document.querySelectorAll('.tc').forEach(card=>card.addEventListener('click',e=>{
    if(e.target.closest('.tk,.ta,.tc-subs,.tc-expand,.tt[contenteditable]'))return;openDP(Number(card.dataset.id));
  }));
  // Task context menu (right-click)
  document.querySelectorAll('.tc').forEach(card=>card.addEventListener('contextmenu',e=>{
    e.preventDefault();e.stopPropagation();
    const id=Number(card.dataset.id);if(!id)return;
    document.querySelectorAll('.ctx-menu').forEach(m=>m.remove());
    const menu=document.createElement('div');menu.className='ctx-menu task-ctx-menu';menu.setAttribute('role','menu');
    const fmt=d=>{const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),dy=String(d.getDate()).padStart(2,'0');return y+'-'+m+'-'+dy};
    const today=new Date();const tom=new Date(today);tom.setDate(tom.getDate()+1);
    const nextWk=new Date(today);nextWk.setDate(nextWk.getDate()+7);
    const nextMo=new Date(today);nextMo.setMonth(nextMo.getMonth()+1);
    menu.innerHTML=`
      <div class="ctx-item" data-act="today"><span class="material-icons-round">wb_sunny</span>Due Today</div>
      <div class="ctx-item" data-act="tomorrow"><span class="material-icons-round">skip_next</span>Due Tomorrow</div>
      <div class="ctx-item" data-act="nextweek"><span class="material-icons-round">date_range</span>Due Next Week</div>
      <div class="ctx-item" data-act="nextmonth"><span class="material-icons-round">event</span>Due Next Month</div>
      <div style="border-top:1px solid var(--brd);margin:4px 0"></div>
      <div class="ctx-item" data-act="p3"><span class="material-icons-round" style="color:var(--err)">flag</span>P3 Urgent</div>
      <div class="ctx-item" data-act="p2"><span class="material-icons-round" style="color:var(--warn)">flag</span>P2 High</div>
      <div class="ctx-item" data-act="p1"><span class="material-icons-round" style="color:var(--brand)">flag</span>P1 Medium</div>
      <div class="ctx-item" data-act="p0"><span class="material-icons-round" style="color:var(--txd)">outlined_flag</span>P0 None</div>
      <div style="border-top:1px solid var(--brd);margin:4px 0"></div>
      <div class="ctx-item" data-act="myday"><span class="material-icons-round">light_mode</span>Toggle My Day</div>
      <div class="ctx-item" data-act="duplicate"><span class="material-icons-round">content_copy</span>Duplicate</div>
      <div class="ctx-item" data-act="focus"><span class="material-icons-round">timer</span>Start Focus</div>
      <div style="border-top:1px solid var(--brd);margin:4px 0"></div>
      <div class="ctx-item ctx-danger" data-act="delete"><span class="material-icons-round">delete</span>Delete</div>`;
    document.body.appendChild(menu);
    const mw=menu.offsetWidth,mh=menu.offsetHeight;
    menu.style.left=Math.min(e.clientX,window.innerWidth-mw-8)+'px';
    menu.style.top=Math.min(e.clientY,window.innerHeight-mh-8)+'px';
    const closeMenu=ev=>{if(!menu.contains(ev.target)){menu.remove();document.removeEventListener('click',closeMenu)}};
    setTimeout(()=>document.addEventListener('click',closeMenu),0);
    const act=async a=>{
      menu.remove();
      if(a==='today')await api.put('/api/tasks/'+id,{due_date:fmt(today)});
      else if(a==='tomorrow')await api.put('/api/tasks/'+id,{due_date:fmt(tom)});
      else if(a==='nextweek')await api.put('/api/tasks/'+id,{due_date:fmt(nextWk)});
      else if(a==='nextmonth')await api.put('/api/tasks/'+id,{due_date:fmt(nextMo)});
      else if(a.startsWith('p'))await api.put('/api/tasks/'+id,{priority:Number(a[1])});
      else if(a==='myday'){const allT=await api.get('/api/tasks/all');const tk=allT.find(t=>t.id===id);if(tk)await api.put('/api/tasks/'+id,{my_day:tk.my_day?0:1})}
      else if(a==='duplicate'){const tk=await api.get('/api/tasks/'+id);if(tk)await api.post('/api/goals/'+tk.goal_id+'/tasks',{title:tk.title+' (copy)',note:tk.note,priority:tk.priority,due_date:tk.due_date})}
      else if(a==='focus'){startFocusTimer(id);return}
      else if(a==='delete'){if(appSettings.confirmDelete==='true'&&!confirm('Delete this task?'))return;await api.del('/api/tasks/'+id)}
      showToast(a==='delete'?'Task deleted':'Updated');await loadAreas();render();loadOverdueBadge();
    };
    menu.querySelectorAll('.ctx-item').forEach(it=>it.addEventListener('click',()=>act(it.dataset.act)));
  }));
  // Inline title editing
  document.querySelectorAll('.tt').forEach(ttEl=>{
    ttEl.addEventListener('dblclick',e=>{
      e.stopPropagation();
      const card=ttEl.closest('.tc');if(!card)return;
      const id=Number(card.dataset.id);
      ttEl.setAttribute('contenteditable','true');
      ttEl.focus();
      // Select all text
      const range=document.createRange();range.selectNodeContents(ttEl);
      const sel=window.getSelection();sel.removeAllRanges();sel.addRange(range);
      const save=async()=>{
        ttEl.removeAttribute('contenteditable');
        const newTitle=ttEl.textContent.trim();
        if(newTitle&&newTitle!==ttEl.dataset.orig){
          await api.put('/api/tasks/'+id,{title:newTitle});
          await loadAreas();
        }
      };
      ttEl.dataset.orig=ttEl.textContent;
      ttEl.addEventListener('blur',save,{once:true});
      ttEl.addEventListener('keydown',ke=>{
        if(ke.key==='Enter'){ke.preventDefault();ttEl.blur()}
        if(ke.key==='Escape'){ttEl.textContent=ttEl.dataset.orig;ttEl.blur()}
      });
    });
  });
  // Focus timer buttons
  document.querySelectorAll('.ft-start').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();startFocusTimer(Number(b.dataset.id))}));
  // Multi-select checkboxes
  document.querySelectorAll('.ms-chk').forEach(ck=>ck.addEventListener('click',e=>{
    e.stopPropagation();const id=Number(ck.dataset.id);
    if(selectedIds.has(id))selectedIds.delete(id);else selectedIds.add(id);
    ck.closest('.tc').classList.toggle('selected');
    updateMultiSelectBar();
  }));
  // Drag-and-drop reorder in list views
  attachDragReorder();
  // Quick action: cycle priority
  document.querySelectorAll('.qa-pri').forEach(b=>b.addEventListener('click',async e=>{
    e.stopPropagation();const id=Number(b.dataset.id);const next=Number(b.dataset.next);
    await api.put('/api/tasks/'+id,{priority:next});
    showToast('Priority → '+(PL[next]||'None'));await loadAreas();render();loadOverdueBadge();
  }));
  // Quick action: inline date picker
  document.querySelectorAll('.qa-date').forEach(b=>b.addEventListener('click',e=>{
    e.stopPropagation();
    document.querySelectorAll('.qa-dd').forEach(d=>d.remove());
    const card=b.closest('.tc');
    const dd=document.createElement('div');dd.className='qa-dd';dd.setAttribute('role','menu');
    const today=new Date();
    const fmt=d=>{const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),dy=String(d.getDate()).padStart(2,'0');return y+'-'+m+'-'+dy};
    const tom=new Date(today);tom.setDate(tom.getDate()+1);
    const nextMon=new Date(today);nextMon.setDate(nextMon.getDate()+((8-nextMon.getDay())%7||7));
    const nextWk=new Date(today);nextWk.setDate(nextWk.getDate()+7);
    dd.innerHTML=[
      {l:'Today',d:fmt(today)},{l:'Tomorrow',d:fmt(tom)},{l:'Next Monday',d:fmt(nextMon)},{l:'+1 Week',d:fmt(nextWk)},{l:'No Date',d:''}
    ].map(o=>`<div class="qa-opt" role="menuitem" tabindex="0" data-date="${o.d}">${o.l}</div>`).join('');
    b.parentElement.appendChild(dd);
    // Keyboard navigation for date picker dropdown
    const qaItems=[...dd.querySelectorAll('.qa-opt')];let qaIdx=-1;
    dd.addEventListener('keydown',ev=>{
      if(ev.key==='ArrowDown'){ev.preventDefault();qaIdx=Math.min(qaIdx+1,qaItems.length-1);qaItems[qaIdx]?.focus()}
      else if(ev.key==='ArrowUp'){ev.preventDefault();qaIdx=Math.max(qaIdx-1,0);qaItems[qaIdx]?.focus()}
      else if(ev.key==='Enter'&&qaIdx>=0){ev.preventDefault();qaItems[qaIdx]?.click()}
      else if(ev.key==='Escape'){dd.remove()}
    });
    qaItems[0]?.focus();
    dd.querySelectorAll('.qa-opt').forEach(opt=>opt.addEventListener('click',async ev=>{
      ev.stopPropagation();const id=Number(b.dataset.id);
      await api.put('/api/tasks/'+id,{due_date:opt.dataset.date||null});
      dd.remove();showToast('Due date updated');await loadAreas();render();loadOverdueBadge();
    }));
    setTimeout(()=>document.addEventListener('click',function closer(){dd.remove();document.removeEventListener('click',closer)},{once:false}),10);
  }));
  // Quick action: my day toggle
  document.querySelectorAll('.qa-myday').forEach(b=>b.addEventListener('click',async e=>{
    e.stopPropagation();const id=Number(b.dataset.id);
    const card=b.closest('.tc');const allT=await api.get('/api/tasks/all');
    const tk=allT.find(t=>t.id===id);if(!tk)return;
    await api.put('/api/tasks/'+id,{my_day:tk.my_day?0:1});
    showToast(tk.my_day?'Removed from My Day':'Added to My Day');await loadAreas();render();loadOverdueBadge();
  }));
  // Quick action: skip recurring
  document.querySelectorAll('.qa-skip').forEach(b=>b.addEventListener('click',async e=>{
    e.stopPropagation();const id=Number(b.dataset.id);
    await api.post('/api/tasks/'+id+'/skip');
    showToast('Occurrence skipped');await loadAreas();render();loadOverdueBadge();
  }));
  document.querySelectorAll('.qa-edit').forEach(b=>b.addEventListener('click',e=>{
    e.stopPropagation();openDP(Number(b.dataset.id));
  }));
}

// ─── TOUCH DRAG-AND-DROP POLYFILL ───
// HTML5 DnD doesn't fire touch events on iOS/Android. This provides a touch-based fallback.
const touchDnD={
  _dragEl:null,_ghost:null,_startX:0,_startY:0,_moved:false,_longPress:null,
  _onDrop:null,_containerSel:null,_itemSel:null,

  attach(containerSel,itemSel,onDropFn){
    if(!('ontouchstart' in window))return; // Only needed on touch devices
    this._containerSel=containerSel;this._itemSel=itemSel;this._onDrop=onDropFn;
    document.addEventListener('touchstart',this._handleStart.bind(this),{passive:false});
    document.addEventListener('touchmove',this._handleMove.bind(this),{passive:false});
    document.addEventListener('touchend',this._handleEnd.bind(this),{passive:false});
  },

  _handleStart(e){
    const item=e.target.closest(this._itemSel);
    if(!item||!item.dataset.id||msMode)return;
    // Long-press detection (200ms) to distinguish from scroll
    this._startX=e.touches[0].clientX;this._startY=e.touches[0].clientY;this._moved=false;
    this._longPress=setTimeout(()=>{
      this._dragEl=item;item.classList.add('dragging');
      this._ghost=item.cloneNode(true);
      this._ghost.style.cssText='position:fixed;pointer-events:none;z-index:10000;opacity:0.8;width:'+item.offsetWidth+'px;transform:rotate(2deg);transition:none;';
      document.body.appendChild(this._ghost);
      this._positionGhost(e.touches[0]);
      if(navigator.vibrate)navigator.vibrate(30);
    },200);
  },

  _handleMove(e){
    const dx=Math.abs(e.touches[0].clientX-this._startX);
    const dy=Math.abs(e.touches[0].clientY-this._startY);
    if(!this._dragEl&&(dx>8||dy>8)){clearTimeout(this._longPress);this._longPress=null;return}
    if(!this._dragEl)return;
    e.preventDefault(); // Prevent scroll while dragging
    this._moved=true;
    this._positionGhost(e.touches[0]);
    // Highlight drop target
    const target=this._getDropTarget(e.touches[0]);
    document.querySelectorAll('.drag-over,.drag-target').forEach(c=>{c.classList.remove('drag-over');c.classList.remove('drag-target')});
    if(target){
      target.classList.add(target.matches(this._itemSel)?'drag-over':'drag-target');
      // Auto-scroll if near edges
      const ct=$('ct');if(ct){
        const rect=ct.getBoundingClientRect();
        if(e.touches[0].clientY<rect.top+40)ct.scrollTop-=8;
        if(e.touches[0].clientY>rect.bottom-40)ct.scrollTop+=8;
      }
    }
  },

  _handleEnd(e){
    clearTimeout(this._longPress);this._longPress=null;
    if(!this._dragEl){return}
    if(this._ghost){this._ghost.remove();this._ghost=null}
    this._dragEl.classList.remove('dragging');
    document.querySelectorAll('.drag-over,.drag-target').forEach(c=>{c.classList.remove('drag-over');c.classList.remove('drag-target')});
    if(this._moved){
      const touch=e.changedTouches[0];
      const target=this._getDropTarget(touch);
      if(target&&this._onDrop){this._onDrop(this._dragEl,target)}
    }
    this._dragEl=null;this._moved=false;
  },

  _positionGhost(touch){
    if(!this._ghost)return;
    this._ghost.style.left=(touch.clientX-30)+'px';
    this._ghost.style.top=(touch.clientY-20)+'px';
  },

  _getDropTarget(touch){
    if(this._ghost)this._ghost.style.display='none';
    const el=document.elementFromPoint(touch.clientX,touch.clientY);
    if(this._ghost)this._ghost.style.display='';
    if(!el)return null;
    // Check if target is a draggable item or a container
    return el.closest(this._itemSel)||el.closest(this._containerSel);
  }
};

// Attach touch DnD for task list reorder
function attachTouchDragReorder(){
  touchDnD.attach('.ct','[draggable].tc',async(dragEl,dropEl)=>{
    const fromId=Number(dragEl.dataset.id);
    const toId=Number(dropEl.dataset.id);
    if(!fromId||!toId||fromId===toId)return;
    const allCards=[...document.querySelectorAll('.tc[data-id]')];
    const ids=allCards.map(c=>Number(c.dataset.id));
    const fromIdx=ids.indexOf(fromId),toIdx=ids.indexOf(toId);
    if(fromIdx<0||toIdx<0)return;
    ids.splice(fromIdx,1);ids.splice(toIdx,0,fromId);
    const items=ids.map((id,i)=>({id,position:i}));
    await api.put('/api/tasks/reorder',{items});
    await loadAreas();render();
  });
}

// Attach touch DnD for weekly planner
function attachTouchWeeklyDnD(){
  if(!('ontouchstart' in window))return;
  let dragEl=null,ghost=null,startX=0,startY=0,longPress=null,moved=false;
  document.querySelectorAll('.wp-tc,.planner-task').forEach(card=>{
    card.addEventListener('touchstart',e=>{
      startX=e.touches[0].clientX;startY=e.touches[0].clientY;moved=false;
      longPress=setTimeout(()=>{
        dragEl=card;card.classList.add('dragging');
        ghost=card.cloneNode(true);
        ghost.style.cssText='position:fixed;pointer-events:none;z-index:10000;opacity:0.8;width:'+card.offsetWidth+'px;transform:rotate(2deg);';
        document.body.appendChild(ghost);
        if(navigator.vibrate)navigator.vibrate(30);
      },200);
    },{passive:false});
    card.addEventListener('touchmove',e=>{
      const dx=Math.abs(e.touches[0].clientX-startX);
      const dy=Math.abs(e.touches[0].clientY-startY);
      if(!dragEl&&(dx>8||dy>8)){clearTimeout(longPress);return}
      if(!dragEl)return;
      e.preventDefault();moved=true;
      if(ghost){ghost.style.left=(e.touches[0].clientX-30)+'px';ghost.style.top=(e.touches[0].clientY-20)+'px'}
      document.querySelectorAll('.drag-target').forEach(c=>c.classList.remove('drag-target'));
      if(ghost)ghost.style.display='none';
      const el=document.elementFromPoint(e.touches[0].clientX,e.touches[0].clientY);
      if(ghost)ghost.style.display='';
      const col=el?.closest('.wp-day,.wp-un,.planner-hour-tasks,.bcb');
      if(col)col.classList.add('drag-target');
    },{passive:false});
    card.addEventListener('touchend',async e=>{
      clearTimeout(longPress);
      if(!dragEl){return}
      if(ghost){ghost.remove();ghost=null}
      dragEl.classList.remove('dragging');
      document.querySelectorAll('.drag-target').forEach(c=>c.classList.remove('drag-target'));
      if(moved){
        const touch=e.changedTouches[0];
        const el=document.elementFromPoint(touch.clientX,touch.clientY);
        const col=el?.closest('.wp-day,.wp-un');
        const hourSlot=el?.closest('.planner-hour-tasks');
        const boardCol=el?.closest('.bcb');
        const taskId=Number(dragEl.dataset.id);
        if(col&&taskId){
          const newDate=col.dataset.date||null;
          await api.put('/api/tasks/'+taskId,{due_date:newDate});
          if(typeof renderWeekly==='function')await renderWeekly();
          else{await loadAreas();render()}
        }else if(hourSlot&&taskId){
          const hour=hourSlot.dataset.hour;
          const endHr=String(Number(hour)+1).padStart(2,'0');
          await api.put('/api/tasks/'+taskId,{due_date:_toDateStr(new Date()),time_block_start:hour+':00',time_block_end:endHr+':00'});
          if(typeof renderToday==='function')renderToday();
        }else if(boardCol&&taskId){
          await api.put('/api/tasks/'+taskId,{status:boardCol.dataset.s});
          await loadAreas();render();
        }
      }
      dragEl=null;moved=false;
    },{passive:false});
  });
}

// ─── DRAG REORDER ───
function attachDragReorder(){
  let dragId=null;
  document.querySelectorAll('.tc[draggable]').forEach(card=>{
    card.addEventListener('dragstart',e=>{
      if(msMode)return e.preventDefault();
      dragId=Number(card.dataset.id);card.classList.add('dragging');
      e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',String(dragId));
    });
    card.addEventListener('dragend',()=>{card.classList.remove('dragging');document.querySelectorAll('.tc.drag-over').forEach(c=>c.classList.remove('drag-over'))});
    card.addEventListener('dragover',e=>{
      e.preventDefault();e.dataTransfer.dropEffect='move';
      document.querySelectorAll('.tc.drag-over').forEach(c=>c.classList.remove('drag-over'));
      card.classList.add('drag-over');
    });
    card.addEventListener('dragleave',()=>card.classList.remove('drag-over'));
    card.addEventListener('drop',async e=>{
      e.preventDefault();card.classList.remove('drag-over');
      const fromId=Number(e.dataTransfer.getData('text/plain'));
      const toId=Number(card.dataset.id);
      if(fromId===toId||!fromId||!toId)return;
      // Collect current order from DOM, reinsert
      const allCards=[...document.querySelectorAll('.tc[data-id]')];
      const ids=allCards.map(c=>Number(c.dataset.id));
      const fromIdx=ids.indexOf(fromId),toIdx=ids.indexOf(toId);
      if(fromIdx<0||toIdx<0)return;
      ids.splice(fromIdx,1);ids.splice(toIdx,0,fromId);
      const items=ids.map((id,i)=>({id,position:i}));
      await api.put('/api/tasks/reorder',{items});
      await loadAreas();render();
    });
  });
  // Also attach touch reorder on each render
  attachTouchDragReorder();
}

// ─── MULTI-SELECT ───
let selectedIds=new Set(),msMode=false;
function toggleMultiSelect(){
  msMode=!msMode;
  document.body.classList.toggle('ms-mode',msMode);
  if(!msMode){selectedIds.clear();document.querySelectorAll('.tc.selected').forEach(c=>c.classList.remove('selected'));hideMultiSelectBar()}
}
function hideMultiSelectBar(){const b=document.getElementById('ms-bar');if(b)b.style.display='none'}
function attachBD(){
  document.querySelectorAll('.tc').forEach(card=>{
    card.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain',card.dataset.id);card.style.opacity='.4'});
    card.addEventListener('dragend',()=>{card.style.opacity='1'});
  });
  document.querySelectorAll('.bcb').forEach(col=>{
    col.addEventListener('dragover',e=>{e.preventDefault();col.parentElement.style.borderColor='var(--brand)'});
    col.addEventListener('dragleave',()=>{col.parentElement.style.borderColor=''});
    col.addEventListener('drop',async e=>{e.preventDefault();col.parentElement.style.borderColor='';
      const id=Number(e.dataTransfer.getData('text/plain'));
      await api.put('/api/tasks/'+id,{status:col.dataset.s});await loadAreas();renderGoal()});
  });
  // Touch drag support for board
  attachTouchWeeklyDnD();
}

// ─── WEEKLY PLANNING ───
async function renderWeekly(){
  const allT=await api.get('/api/tasks/all');
  const c=$('ct');
  // Get Mon-Sun of current week
  const today=new Date();today.setHours(0,0,0,0);
  const dow=today.getDay()||7;// Mon=1
  const mon=new Date(today);mon.setDate(today.getDate()-(dow-1));
  const days=[];for(let i=0;i<7;i++){const d=new Date(mon);d.setDate(mon.getDate()+i);days.push(d)}
  const dayStrs=days.map(d=>{const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),dd=String(d.getDate()).padStart(2,'0');return`${y}-${m}-${dd}`});
  const todayStr=dayStrs.find((_,i)=>days[i].toDateString()===today.toDateString());
  // Bucket tasks
  const unscheduled=allT.filter(t=>t.status!=='done'&&!t.due_date);
  const byDay={};dayStrs.forEach(d=>byDay[d]=[]);
  allT.filter(t=>t.status!=='done').forEach(t=>{if(t.due_date&&byDay[t.due_date]!==undefined)byDay[t.due_date].push(t)});
  const dayNames=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  let h=`<div class="wp">`;
  h+=`<div class="wp-un" data-date=""><div class="wp-h">Unscheduled <span style="font-size:10px;color:var(--txd)">(${unscheduled.length})</span></div>`;
  unscheduled.forEach(t=>h+=wpCard(t));
  h+=`</div>`;
  days.forEach((d,i)=>{
    const ds=dayStrs[i],isToday=ds===todayStr;
    const ts=byDay[ds]||[];
    h+=`<div class="wp-day ${isToday?'today':''}" data-date="${ds}">
      <div class="wp-dh"><span class="wp-dn">${d.getDate()}</span>${dayNames[i]}<span class="wp-cnt">${ts.length}</span></div>`;
    ts.forEach(t=>h+=wpCard(t));
    h+=`</div>`;
  });
  h+=`</div>`;
  c.innerHTML=h;
  // Drag between days
  document.querySelectorAll('.wp-tc').forEach(card=>{
    card.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain',card.dataset.id);card.style.opacity='.4'});
    card.addEventListener('dragend',()=>{card.style.opacity='1'});
    card.addEventListener('click',()=>openDP(Number(card.dataset.id)));
  });
  document.querySelectorAll('.wp-day,.wp-un').forEach(col=>{
    col.addEventListener('dragover',e=>{e.preventDefault();col.classList.add('drag-target')});
    col.addEventListener('dragleave',()=>col.classList.remove('drag-target'));
    col.addEventListener('drop',async e=>{
      e.preventDefault();col.classList.remove('drag-target');
      const id=Number(e.dataTransfer.getData('text/plain'));
      const newDate=col.dataset.date||null;
      await api.put('/api/tasks/'+id,{due_date:newDate});
      await loadAreas();await renderWeekly();
    });
  });
  // Touch drag support for mobile
  attachTouchWeeklyDnD();
}
function wpCard(t){
  const cls=['wp-tc'];if(t.status==='done')cls.push('done');
  if(t.priority===3)cls.push('p3');else if(t.priority===2)cls.push('p2');else if(t.priority===1)cls.push('p1');
  let meta='';
  if(t.priority>0)meta+=`<span style="color:${PC[t.priority]}">${PL[t.priority]}</span>`;
  if(t.tags&&t.tags.length)t.tags.forEach(tg=>meta+=`<span class="tag" style="background:${escA(tg.color)};font-size:10px;padding:2px 6px">${esc(tg.name)}</span>`);
  meta+=`<span style="color:var(--txd)">${esc(t.goal_title||'')}</span>`;
  return`<div class="${cls.join(' ')}" data-id="${t.id}" draggable="true"><div class="wp-tt">${esc(t.title)}</div><div class="wp-tm">${meta}</div></div>`;
}

// ─── EISENHOWER MATRIX ───
async function renderMatrix(){
  const allT=await api.get('/api/tasks/all');
  const active=allT.filter(t=>t.status!=='done');
  const c=$('ct');
  // Q1: Urgent+Important (p3 or p2+overdue), Q2: Important (p2+not overdue or p3+far due)
  // Q3: Urgent (p1+overdue or p0+overdue), Q4: Neither (p0 or p1 not overdue)
  // Simpler: importance = priority >= 2, urgency = overdue or due within 3 days
  const isUrgent=t=>{if(!t.due_date)return false;const df=Math.round((_parseDate(t.due_date)-new Date(new Date().toDateString()))/864e5);return df<=2};
  const isImportant=t=>t.priority>=2;
  const q1=active.filter(t=>isUrgent(t)&&isImportant(t));
  const q2=active.filter(t=>!isUrgent(t)&&isImportant(t));
  const q3=active.filter(t=>isUrgent(t)&&!isImportant(t));
  const q4=active.filter(t=>!isUrgent(t)&&!isImportant(t));
  let h=`<div class="em-labels"><span>Urgent</span><span>Not Urgent</span></div>`;
  h+=`<div class="em-wrap"><div class="em-side"><span>Not Important</span><span style="margin-top:auto">Important</span></div>`;
  h+=`<div class="em-grid" style="flex:1">`;
  h+=emQuadrant('em-q1','🔥 Do First','Urgent & Important',q1);
  h+=emQuadrant('em-q2','📋 Schedule','Important, Not Urgent',q2);
  h+=emQuadrant('em-q3','👤 Delegate','Urgent, Not Important',q3);
  h+=emQuadrant('em-q4','🗑️ Eliminate','Neither',q4);
  h+=`</div></div>`;
  c.innerHTML=h;
  c.querySelectorAll('.tc').forEach(card=>card.addEventListener('click',e=>{if(!e.target.closest('.tk'))openDP(Number(card.dataset.id))}));
  c.querySelectorAll('.tk').forEach(el=>el.addEventListener('click',async e=>{
    e.stopPropagation();const id=Number(el.dataset.id);
    await api.put('/api/tasks/'+id,{status:'done'});
    showToast('Task completed');await loadAreas();renderMatrix();loadOverdueBadge();
  }));
}
function emQuadrant(cls,title,sub,tasks){
  let h=`<div class="em-q ${cls}"><div class="em-h">${title}<span class="em-cnt">${tasks.length}</span></div><div style="font-size:10px;color:var(--txd);margin-bottom:8px">${sub}</div>`;
  tasks.forEach(t=>{
    const isDone=t.status==='done';
    h+=`<div class="tc ${isDone?'done':''}" data-id="${t.id}" style="margin-bottom:4px">
      <div class="tk" data-id="${t.id}"><span class="material-icons-round">check</span></div>
      <div class="tb2"><div class="tt">${esc(t.title)}</div><div class="tm">${t.due_date?'<span'+(isOD(t.due_date)?' class="od"':'')+'><span class="material-icons-round">event</span>'+fmtDue(t.due_date)+'</span>':''}${t.priority>0?'<span style="color:'+PC[t.priority]+'">'+PL[t.priority]+'</span>':''}<span class="tag" style="background:${escA(t.goal_color||'var(--brand)')}">${esc(t.goal_title||'')}</span></div></div>
    </div>`;
  });
  h+=`</div>`;return h;
}

// ─── CONFETTI ───
function fireConfetti(){
  const wrap=document.createElement('div');wrap.className='confetti-wrap';
  const colors=['#D50000','#F6BF26','#33B679','#039BE5','#7986CB','#8E24AA','#F4511E','#0B8043'];
  for(let i=0;i<80;i++){
    const p=document.createElement('div');p.className='confetti-piece';
    p.style.left=Math.random()*100+'%';
    p.style.top=-10-Math.random()*20+'px';
    p.style.background=colors[Math.floor(Math.random()*colors.length)];
    p.style.animationDelay=Math.random()*1.5+'s';
    p.style.transform='rotate('+Math.random()*360+'deg)';
    const sz=4+Math.random()*8;p.style.width=sz+'px';p.style.height=sz+'px';
    if(Math.random()>.5)p.style.borderRadius='50%';
    wrap.appendChild(p);
  }
  document.body.appendChild(wrap);
  setTimeout(()=>wrap.remove(),4000);
}

// ─── DETAIL PANEL ───
let dpTask=null,dpTags=[],dpSubtasks=[];
async function openDP(id){
  let tk=tasks.find(t=>t.id===id);
  if(!tk){const a=await api.get('/api/tasks/all');tk=a.find(t=>t.id===id)}
  if(!tk)return;
  dpTask=tk;dpTags=(tk.tags||[]).map(t=>t.id);dpSubtasks=tk.subtasks||[];
  $('dp-title').textContent='Edit Task';
  renderDPBody();
  $('dp').classList.add('open');
}
function renderDPBody(){
  const t=dpTask;
  let h=`<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><label style="flex:1;margin:0">Title</label><span class="material-icons-round dp-star-toggle" id="dp-star" style="cursor:pointer;font-size:22px;color:${t.starred?'var(--warn,#f59e0b)':'var(--txd)'}" title="${t.starred?'Unstar':'Star'}">${t.starred?'star':'star_outline'}</span></div><input type="text" id="dp-ttl" value="${escA(t.title)}">
    <label>Notes</label><textarea id="dp-note">${esc(t.note||'')}</textarea>
    <div id="dp-note-preview" class="md-note" style="display:none;padding:8px 10px;background:var(--bg-c);border:1px solid var(--brd);border-radius:var(--rs);margin:-6px 0 10px;max-height:200px;overflow-y:auto"></div>
    <div class="dp-row"><div><label>Start Date</label><input type="date" id="dp-start" value="${t.start_date||''}"></div>
    <div><label>Due Date</label><div style="display:flex;gap:6px"><input type="date" id="dp-due" value="${t.due_date||''}" style="flex:1"><input type="time" id="dp-time" value="${t.due_time||''}" style="width:100px"></div></div></div>
    <div class="dp-row"><div><label>Priority</label><select id="dp-pri"><option value="0" ${t.priority===0?'selected':''}>None</option><option value="1" ${t.priority===1?'selected':''}>Normal</option><option value="2" ${t.priority===2?'selected':''}>High</option><option value="3" ${t.priority===3?'selected':''}>Critical</option></select></div>
    <div><label>Assigned To</label><select id="dp-asg-user"><option value="">Unassigned</option></select></div></div>
    <div><label>Recurring</label><select id="dp-rec"><option value="">None</option><option value="daily" ${t.recurring==='daily'?'selected':''}>Daily</option><option value="weekdays" ${t.recurring==='weekdays'?'selected':''}>Weekdays</option><option value="weekly" ${t.recurring==='weekly'?'selected':''}>Weekly</option><option value="biweekly" ${t.recurring==='biweekly'?'selected':''}>Every 2 Weeks</option><option value="monthly" ${t.recurring==='monthly'?'selected':''}>Monthly</option><option value="yearly" ${t.recurring==='yearly'?'selected':''}>Yearly</option><option value="custom" ${t.recurring&&/^every-\d+-(days|weeks)$/.test(t.recurring)?'selected':''}>Custom…</option></select><div id="dp-rec-custom" style="display:${t.recurring&&/^every-\d+-(days|weeks)$/.test(t.recurring)&&t.recurring!=='every-2-weeks'?'flex':'none'};gap:6px;margin-top:4px;align-items:center"><span style="font-size:11px">Every</span><input type="number" id="dp-rec-n" min="1" max="365" style="width:60px" value="${(t.recurring?.match(/^every-(\d+)/)||[])[1]||'3'}"><select id="dp-rec-unit" style="width:80px"><option value="days" ${t.recurring?.endsWith('-days')?'selected':''}>Days</option><option value="weeks" ${t.recurring?.endsWith('-weeks')?'selected':''}>Weeks</option></select></div><div id="dp-rec-preview" style="display:${t.recurring?'block':'none'};margin-top:6px;padding:6px 8px;background:var(--bg-c);border-radius:4px;font-size:10px;color:var(--tx2)"><span class="material-icons-round" style="font-size:12px;vertical-align:middle">repeat</span> <span id="dp-rec-txt">${esc(t.recurring||'')} </span></div></div>
    <div><label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin-bottom:10px"><input type="checkbox" id="dp-md" ${t.my_day?'checked':''} style="width:auto;margin:0">Add to My Day</label></div>
    <div class="dp-row"><div><label>Estimated (min)</label><input type="number" id="dp-est" min="0" value="${t.estimated_minutes||''}" placeholder="e.g. 30"></div>
    <div><label>Actual (min)</label><input type="number" id="dp-act" min="0" value="${t.actual_minutes||''}" placeholder="0"></div></div>
    <label>Linked List</label><select id="dp-list"><option value="">None</option></select>
    <label>Tags</label><div class="tg-wrap" id="tg-wrap"><div class="tgi" id="tgi"></div></div>
    <label>Subtasks</label><div class="sta"><input type="text" id="st-input" placeholder="Add subtask..."><button id="st-add">Add</button></div><div class="stl" id="stl"></div>
    <label>Dependencies</label><div id="dp-deps"></div>
    <label>Comments</label><div class="sta"><input type="text" id="cmt-input" placeholder="Add a comment... (use @name to mention)"><button id="cmt-add">Post</button></div><div id="dp-comments"></div>
    <label>Attachments</label><div id="dp-attachments"></div><div class="sta"><input type="file" id="att-input" accept="image/*,.pdf,.txt,.json,.csv,.md"><button id="att-upload">Upload</button></div>
    <label>Custom Fields</label><div id="dp-cf"></div>
    <label>Activity</label><div id="dp-activity" style="font-size:11px;color:var(--txd)">Loading...</div>`;
  $('dp-body').innerHTML=h;
  enhanceTaskEditUI();
  // Populate list picker
  const dpListSel=$('dp-list');
  dpListSel.innerHTML='<option value="">None</option>'+userLists.filter(l=>!l.parent_id).map(l=>{
    const subs=userLists.filter(s=>s.parent_id===l.id);
    let opts=`<option value="${l.id}"${t.list_id===l.id?' selected':''}>${esc(l.icon)} ${esc(l.name)}</option>`;
    subs.forEach(s=>{opts+=`<option value="${s.id}"${t.list_id===s.id?' selected':''}>&nbsp;&nbsp;↳ ${esc(s.icon)} ${esc(s.name)}</option>`});
    return opts;
  }).join('');
  // Populate user picker
  const dpAsgUser=$('dp-asg-user');
  if(dpAsgUser){
    dpAsgUser.innerHTML='<option value="">Unassigned</option>'+allUsers.map(u=>
      `<option value="${u.id}"${t.assigned_to_user_id===u.id?' selected':''}>${esc(u.display_name||u.email)}</option>`
    ).join('');
  }
  renderTagInput();
  renderSubtasks();
  renderDeps();
  renderComments();
  renderDPCustomFields();
  renderDPAttachments();
  $('st-add').addEventListener('click',addSubtask);
  $('st-input').addEventListener('keydown',e=>{if(e.key==='Enter')addSubtask()});
  $('cmt-add').addEventListener('click',addComment);
  $('cmt-input').addEventListener('keydown',e=>{if(e.key==='Enter')addComment()});
  $('att-upload')?.addEventListener('click',uploadAttachment);
  // Custom recurring toggle + preview
  $('dp-rec').addEventListener('change',()=>{
    const v=$('dp-rec').value;
    $('dp-rec-custom').style.display=v==='custom'?'flex':'none';
    $('dp-rec-preview').style.display=v?'block':'none';
    const labels={daily:'Repeats every day',weekdays:'Repeats Mon–Fri',weekly:'Repeats every week',biweekly:'Repeats every 2 weeks','every-2-weeks':'Repeats every 2 weeks',monthly:'Repeats every month',yearly:'Repeats every year',custom:'Custom interval'};
    $('dp-rec-txt').textContent=labels[v]||v;
  });
  // Markdown preview toggle
  const noteEl=$('dp-note'),prevEl=$('dp-note-preview');
  noteEl.rows=6;
  noteEl.classList.add('dp-note-editor');
  const titleEl=$('dp-ttl');
  const titleHint=document.createElement('div');
  titleHint.id='dp-title-hint';
  titleHint.className='dp-hint';
  titleEl.insertAdjacentElement('afterend',titleHint);
  const validateTitleLive=()=>{
    const v=titleEl.value.trim();
    if(!v){
      titleEl.classList.add('inp-err');
      titleEl.setAttribute('aria-invalid','true');
      titleHint.textContent='Title is required';
      return false;
    }
    if(v.length>255){
      titleEl.classList.add('inp-err');
      titleEl.setAttribute('aria-invalid','true');
      titleHint.textContent='Title must be 255 characters or fewer';
      return false;
    }
    titleEl.classList.remove('inp-err');
    titleEl.setAttribute('aria-invalid','false');
    titleHint.textContent='';
    return true;
  };
  titleEl.addEventListener('input',validateTitleLive);
  validateTitleLive();
  function updateNotePrev(){const v=noteEl.value.trim();if(v){prevEl.innerHTML=renderMd(v);prevEl.style.display='block'}else{prevEl.style.display='none'}}
  noteEl.addEventListener('blur',updateNotePrev);
  if(t.note)updateNotePrev();
  // Star toggle in detail panel
  $('dp-star').addEventListener('click',async()=>{
    dpTask.starred=dpTask.starred?0:1;
    $('dp-star').textContent=dpTask.starred?'star':'star_outline';
    $('dp-star').style.color=dpTask.starred?'var(--warn,#f59e0b)':'var(--txd)';
    $('dp-star').title=dpTask.starred?'Unstar':'Star';
  });
  // Activity feed
  renderDPActivity();
}

function enhanceTaskEditUI(){
  const body=$('dp-body');
  if(!body)return;
  const groups=[
    {id:'dp-ttl',title:'Core Details'},
    {id:'dp-start',title:'Schedule & Priority'},
    {id:'dp-est',title:'Effort & Organization'},
    {id:'st-input',title:'Execution Breakdown'},
    {id:'dep-search',title:'Dependencies'},
    {id:'cmt-input',title:'Collaboration'},
    {id:'att-input',title:'Files & Custom Fields'}
  ];
  groups.forEach(g=>{
    const field=$(g.id);
    if(!field)return;
    const markerId='dp-group-marker-'+g.id;
    if($(markerId))return;
    let anchor=field;
    if(anchor.previousElementSibling&&anchor.previousElementSibling.tagName==='LABEL')anchor=anchor.previousElementSibling;
    const marker=document.createElement('div');
    marker.id=markerId;
    marker.className='dp-group-title';
    marker.textContent=g.title;
    body.insertBefore(marker,anchor);
  });
}
async function renderDPActivity(){
  const el=$('dp-activity');if(!el||!dpTask)return;
  try{
    const acts=await api.get('/api/tasks/'+dpTask.id+'/activity');
    if(!acts.length){el.innerHTML='<div style="padding:4px 0">No activity recorded yet</div>';return}
    const actionLabels={task_created:'Created',task_updated:'Updated',task_deleted:'Deleted',task_completed:'Completed'};
    el.innerHTML=acts.map(a=>{
      const d=new Date(a.created_at+'Z');
      const when=d.toLocaleDateString('en-US',{month:'short',day:'numeric'})+' '+d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
      const label=actionLabels[a.action]||a.action;
      return `<div style="display:flex;gap:8px;padding:3px 0;border-bottom:1px solid var(--brd)"><span style="color:var(--tx)">${esc(label)}</span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(a.detail||'')}</span><span style="flex-shrink:0">${when}</span></div>`;
    }).join('');
  }catch(e){el.innerHTML='<div style="padding:4px 0">Could not load activity</div>'}
}
async function renderComments(){
  const el=$('dp-comments');if(!el||!dpTask)return;
  try{
    const comments=await api.get('/api/tasks/'+dpTask.id+'/comments');
    if(!comments.length){el.innerHTML='<div style="font-size:11px;color:var(--txd);padding:4px 0">No comments yet</div>';return}
    el.innerHTML=comments.map(c=>{
      const d=new Date(c.created_at);
      const when=d.toLocaleDateString('en-US',{month:'short',day:'numeric'})+' '+d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
      return `<div class="dp-comment"><div style="flex:1;min-width:0;overflow:hidden">${esc(c.text).replace(/@([a-zA-Z0-9_.]+)/g,'<span style="color:var(--brand);font-weight:600">@$1</span>')}</div><span class="dp-comment-time">${when}</span><span class="material-icons-round dp-comment-del" data-cid="${c.id}">close</span></div>`;
    }).join('');
    el.querySelectorAll('.dp-comment-del').forEach(b=>b.addEventListener('click',async()=>{
      await api.del('/api/tasks/'+dpTask.id+'/comments/'+b.dataset.cid);renderComments();
    }));
  }catch(e){el.innerHTML=''}
}
async function addComment(){
  const inp=$('cmt-input');if(!inp)return;
  const text=inp.value.trim();if(!text||!dpTask)return;
  await api.post('/api/tasks/'+dpTask.id+'/comments',{text});
  inp.value='';renderComments();
}
async function renderDPAttachments(){
  const el=$('dp-attachments');if(!el||!dpTask)return;
  try{
    const atts=await api.get('/api/tasks/'+dpTask.id+'/attachments');
    if(!atts.length){el.innerHTML='<div style="font-size:11px;color:var(--txd);padding:4px 0">No attachments</div>';return}
    el.innerHTML=atts.map(a=>{
      const isImg=/^image\//.test(a.mime_type);
      const sizeKB=Math.round(a.size_bytes/1024);
      return `<div class="dp-attachment" style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid var(--brd)">
        <span class="material-icons-round" style="font-size:16px;color:var(--txd)">${isImg?'image':'attach_file'}</span>
        <span style="flex:1;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(a.original_name)}</span>
        <span style="font-size:10px;color:var(--txd)">${sizeKB}KB</span>
        <span class="material-icons-round att-del" data-aid="${a.id}" style="font-size:14px;color:var(--err);cursor:pointer" title="Delete">close</span>
      </div>`;
    }).join('');
    el.querySelectorAll('.att-del').forEach(b=>b.addEventListener('click',async()=>{
      await api.del('/api/tasks/'+dpTask.id+'/attachments/'+b.dataset.aid);renderDPAttachments();
    }));
  }catch(e){el.innerHTML=''}
}
async function uploadAttachment(){
  const inp=$('att-input');if(!inp||!inp.files.length||!dpTask)return;
  const file=inp.files[0];
  if(file.size>10*1024*1024){showToast('File too large (max 10 MB)','error');return}
  try{
    const resp=await fetch('/api/tasks/'+dpTask.id+'/attachments',{
      method:'POST',headers:{'x-filename':file.name,'x-mime-type':file.type,'content-type':'application/octet-stream'},
      body:file,credentials:'include'
    });
    if(!resp.ok){const e=await resp.json();showToast(e.error||'Upload failed','error');return}
    inp.value='';renderDPAttachments();showToast('File attached');
  }catch(e){showToast('Upload failed','error')}
}
async function renderDPCustomFields(){
  const el=$('dp-cf');if(!el||!dpTask)return;
  try{
    const [defs,vals]=await Promise.all([api.get('/api/custom-fields'),api.get('/api/tasks/'+dpTask.id+'/custom-fields')]);
    if(!defs.length){el.innerHTML='<div style="font-size:11px;color:var(--txd);padding:4px 0">No custom fields defined — add them in Settings</div>';return}
    const valMap={};vals.forEach(v=>{valMap[v.field_id]=v.value});
    let h='<div style="display:flex;flex-direction:column;gap:6px">';
    defs.forEach(d=>{
      const val=valMap[d.id]||'';
      h+=`<div style="display:flex;align-items:center;gap:8px"><span style="font-size:12px;color:var(--txd);width:80px;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escA(d.name)}">${esc(d.name)}</span>`;
      if(d.field_type==='text')h+=`<input type="text" class="cf-val" data-cfid="${d.id}" value="${escA(val)}" style="flex:1;padding:4px 8px;border:1px solid var(--brd);border-radius:var(--rs);background:var(--bg2);color:var(--tx);font-size:12px" maxlength="500">`;
      else if(d.field_type==='number')h+=`<input type="number" class="cf-val" data-cfid="${d.id}" value="${escA(val)}" style="flex:1;padding:4px 8px;border:1px solid var(--brd);border-radius:var(--rs);background:var(--bg2);color:var(--tx);font-size:12px">`;
      else if(d.field_type==='date')h+=`<input type="date" class="cf-val" data-cfid="${d.id}" value="${escA(val)}" style="flex:1;padding:4px 8px;border:1px solid var(--brd);border-radius:var(--rs);background:var(--bg2);color:var(--tx);font-size:12px">`;
      else if(d.field_type==='select'){
        const opts=d.options?JSON.parse(d.options):[];
        h+=`<select class="cf-val" data-cfid="${d.id}" style="flex:1;padding:4px 8px;border:1px solid var(--brd);border-radius:var(--rs);background:var(--bg2);color:var(--tx);font-size:12px"><option value="">—</option>${opts.map(o=>`<option value="${escA(o)}"${val===o?' selected':''}>${esc(o)}</option>`).join('')}</select>`;
      }
      h+='</div>';
    });
    h+='</div>';
    el.innerHTML=h;
    // Auto-save on blur/change
    el.querySelectorAll('.cf-val').forEach(inp=>{
      const ev=inp.tagName==='SELECT'?'change':'blur';
      inp.addEventListener(ev,async()=>{
        try{await api.put('/api/tasks/'+dpTask.id+'/custom-fields',{fields:[{field_id:Number(inp.dataset.cfid),value:inp.value||null}]});}catch(e){showToast(e.message||'Error','error')}
      });
    });
  }catch(e){el.innerHTML=''}
}
function renderTagInput(){
  const wrap=$('tgi');
  let h='';
  dpTags.forEach(tid=>{const tg=allTags.find(t=>t.id===tid);if(tg)h+=`<span class="tag" style="background:${escA(tg.color)}">${esc(tg.name)}<span class="rx" data-id="${tid}">×</span></span>`});
  h+=`<input type="text" id="tg-in" placeholder="Type tag..."><div class="tdd" id="tdd"></div>`;
  wrap.innerHTML=h;
  const inp=document.getElementById('tg-in');
  inp.addEventListener('focus',()=>{wrap.classList.add('focus');showTagDD('')});
  inp.addEventListener('blur',()=>setTimeout(()=>wrap.classList.remove('focus'),150));
  inp.addEventListener('input',()=>showTagDD(inp.value));
  inp.addEventListener('keydown',async e=>{
    if(e.key==='Enter'&&inp.value.trim()){
      e.preventDefault();const name=inp.value.trim().toLowerCase();
      let tg=allTags.find(t=>t.name===name);
      if(!tg){tg=await api.post('/api/tags',{name,color:COLORS[allTags.length%COLORS.length]});await loadTags()}
      if(!dpTags.includes(tg.id)){dpTags.push(tg.id);renderTagInput()}
      inp.value='';
    }
  });
  wrap.querySelectorAll('.rx').forEach(x=>x.addEventListener('click',()=>{dpTags=dpTags.filter(id=>id!==Number(x.dataset.id));renderTagInput()}));
}
function showTagDD(q){
  const dd=$('tdd');if(!dd)return;
  const filtered=allTags.filter(t=>!dpTags.includes(t.id)&&(!q||t.name.includes(q.toLowerCase())));
  dd.innerHTML=filtered.map(t=>`<div class="tdd-item" data-id="${t.id}"><span class="tag" style="background:${escA(t.color)}">${esc(t.name)}</span></div>`).join('');
  if(q&&!allTags.find(t=>t.name===q.toLowerCase()))dd.innerHTML+=`<div class="tdd-item tdd-new" data-name="${escA(q)}">+ Create "${esc(q)}"</div>`;
  dd.querySelectorAll('.tdd-item').forEach(item=>item.addEventListener('mousedown',async e=>{
    e.preventDefault();
    if(item.dataset.id){dpTags.push(Number(item.dataset.id));renderTagInput();}
    else if(item.dataset.name){const tg=await api.post('/api/tags',{name:item.dataset.name,color:COLORS[allTags.length%COLORS.length]});await loadTags();dpTags.push(tg.id);renderTagInput();}
  }));
}
function renderSubtasks(){
  const el=$('stl');
  // Build tree structure for nested subtasks
  const roots=dpSubtasks.filter(s=>!s.parent_id);
  const childMap={};
  dpSubtasks.forEach(s=>{if(s.parent_id){if(!childMap[s.parent_id])childMap[s.parent_id]=[];childMap[s.parent_id].push(s)}});
  function renderSubNode(s,depth){
    const indent=depth*24;
    const i=dpSubtasks.indexOf(s);
    let h=`<div class="sti ${s.done?'stdone':''}" data-id="${s.id}" data-idx="${i}" draggable="true" style="display:flex;align-items:center;gap:7px;padding:5px 0;padding-left:${indent}px">
    <span class="st-handle material-icons-round" style="cursor:grab;font-size:14px;color:var(--txd);flex-shrink:0">drag_indicator</span>
    <div class="stk" data-id="${s.id}" style="width:16px;height:16px;border-radius:50%;border:2px solid ${s.done?'var(--ok)':'var(--ck-bd,var(--txd))'};background:${s.done?'var(--ok)':'var(--ck-bg,transparent)'};cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0">
      <span class="material-icons-round" style="font-size:10px;color:#fff;display:${s.done?'block':'none'}">check</span>
    </div>
    <span class="stx">${esc(s.title)}</span>
    ${depth<2?`<button class="st-nest material-icons-round" data-id="${s.id}" title="Add nested subtask" style="font-size:14px;color:var(--txd);cursor:pointer;border:none;background:none;padding:0">subdirectory_arrow_right</button>`:''}
    <button class="stde material-icons-round" data-id="${s.id}">close</button>
  </div>
  <div class="stn" data-id="${s.id}" contenteditable="true" title="Click to add note" style="font-size:10px;color:var(--txd);margin:0 0 4px ${28+indent}px;padding:2px 4px;border-radius:3px;outline:none;font-style:italic;min-height:14px;border:1px solid transparent;cursor:text" onfocus="this.style.borderColor='var(--brd)'" onblur="this.style.borderColor='transparent'">${esc(s.note||'')}</div>`;
    const children=childMap[s.id]||[];
    children.forEach(c=>{h+=renderSubNode(c,depth+1)});
    return h;
  }
  el.innerHTML=roots.map(s=>renderSubNode(s,0)).join('');
  if(!dpSubtasks.length) el.innerHTML='';
  // Drag reorder
  let dragIdx=null;
  el.querySelectorAll('.sti[draggable]').forEach(row=>{
    row.addEventListener('dragstart',e=>{dragIdx=Number(row.dataset.idx);row.classList.add('dragging-sub');e.dataTransfer.effectAllowed='move'});
    row.addEventListener('dragend',()=>{row.classList.remove('dragging-sub');el.querySelectorAll('.sti').forEach(r=>r.classList.remove('drag-over-sub'))});
    row.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='move';el.querySelectorAll('.sti').forEach(r=>r.classList.remove('drag-over-sub'));row.classList.add('drag-over-sub')});
    row.addEventListener('drop',async e=>{e.preventDefault();const toIdx=Number(row.dataset.idx);if(dragIdx===null||dragIdx===toIdx)return;
      const [moved]=dpSubtasks.splice(dragIdx,1);dpSubtasks.splice(toIdx,0,moved);
      renderSubtasks();
      await api.put('/api/subtasks/reorder',{items:dpSubtasks.map((s,i)=>({id:s.id,position:i}))});
    });
  });
  el.querySelectorAll('.stk').forEach(ck=>ck.addEventListener('click',async()=>{
    const sid=Number(ck.dataset.id);const s=dpSubtasks.find(x=>x.id===sid);
    if(!s)return;await api.put('/api/subtasks/'+sid,{done:s.done?0:1});
    s.done=s.done?0:1;renderSubtasks();
  }));
  el.querySelectorAll('.stde').forEach(b=>b.addEventListener('click',async()=>{
    await api.del('/api/subtasks/'+b.dataset.id);dpSubtasks=dpSubtasks.filter(s=>s.id!==Number(b.dataset.id));renderSubtasks();
  }));
  el.querySelectorAll('.stn').forEach(n=>n.addEventListener('blur',async()=>{
    const sid=Number(n.dataset.id);const note=n.textContent.trim();
    await api.put('/api/subtasks/'+sid,{note});
    const s=dpSubtasks.find(x=>x.id===sid);if(s)s.note=note;
  }));
  // Nested subtask buttons
  el.querySelectorAll('.st-nest').forEach(btn=>btn.addEventListener('click',async()=>{
    const parentId=Number(btn.dataset.id);
    const title=prompt('Nested subtask title:');
    if(!title||!title.trim()||!dpTask)return;
    const s=await api.post('/api/tasks/'+dpTask.id+'/subtasks',{title:title.trim(),parent_id:parentId});
    dpSubtasks.push(s);renderSubtasks();
  }));
}
async function addSubtask(){
  const inp=$('st-input');const t=inp.value.trim();if(!t||!dpTask)return;
  const s=await api.post('/api/tasks/'+dpTask.id+'/subtasks',{title:t});
  dpSubtasks.push(s);inp.value='';renderSubtasks();
}

// ─── DEPENDENCIES ───
let dpDeps=[];
async function renderDeps(){
  const el=$('dp-deps');if(!el||!dpTask)return;
  try{const r=await api.get('/api/tasks/'+dpTask.id+'/deps');dpDeps=r.blockedBy||[]}catch{dpDeps=[]}
  let h='<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px">';
  dpDeps.forEach(d=>h+=`<span class="dep-chip ${d.status==='done'?'done':''}" data-id="${d.id}">${esc(d.title)}<span class="dep-x" data-id="${d.id}">×</span></span>`);
  h+='</div>';
  h+=`<div style="position:relative"><input type="text" id="dep-search" placeholder="Search tasks to add as dependency..." style="font-size:12px"><div id="dep-dd" style="position:absolute;top:100%;left:0;right:0;background:var(--bg-s);border:1px solid var(--brd);border-radius:var(--rs);max-height:150px;overflow-y:auto;display:none;z-index:5"></div></div>`;
  el.innerHTML=h;
  el.querySelectorAll('.dep-x').forEach(x=>x.addEventListener('click',async()=>{
    const bid=Number(x.dataset.id);dpDeps=dpDeps.filter(d=>d.id!==bid);
    await api.put('/api/tasks/'+dpTask.id+'/deps',{blockedByIds:dpDeps.map(d=>d.id)});
    renderDeps();
  }));
  let depTimer=null;
  const depInp=$('dep-search'),depDD=$('dep-dd');
  depInp.addEventListener('input',()=>{clearTimeout(depTimer);depTimer=setTimeout(async()=>{
    const q=depInp.value.trim();if(!q){depDD.style.display='none';return}
    const r=await api.get('/api/tasks/search?q='+encodeURIComponent(q));
    const filtered=r.filter(t=>t.id!==dpTask.id&&!dpDeps.some(d=>d.id===t.id));
    if(!filtered.length){depDD.innerHTML='<div style="padding:8px;font-size:11px;color:var(--txd)">No matches</div>';depDD.style.display='block';return}
    depDD.innerHTML=filtered.slice(0,8).map(t=>`<div class="dep-opt" data-id="${t.id}" style="padding:6px 10px;cursor:pointer;font-size:12px;border-bottom:1px solid var(--brd)">${esc(t.title)}<span style="font-size:10px;color:var(--txd);margin-left:6px">${esc(t.goal_title||'')}</span></div>`).join('');
    depDD.style.display='block';
    depDD.querySelectorAll('.dep-opt').forEach(opt=>opt.addEventListener('click',async()=>{
      dpDeps.push({id:Number(opt.dataset.id),title:opt.textContent,status:'todo'});
      await api.put('/api/tasks/'+dpTask.id+'/deps',{blockedByIds:dpDeps.map(d=>d.id)});
      depInp.value='';depDD.style.display='none';renderDeps();
    }));
  },250)});
  depInp.addEventListener('blur',()=>setTimeout(()=>{depDD.style.display='none'},200));
}

$('dp-close').addEventListener('click',()=>$('dp').classList.remove('open'));
$('dp-cancel').addEventListener('click',()=>$('dp').classList.remove('open'));
$('dp-save').addEventListener('click',async()=>{
  const dpTitleVal=$('dp-ttl').value.trim();
  if(!dpTitleVal){showToast('Task title cannot be empty');$('dp-ttl').classList.add('inp-err');$('dp-ttl').focus();return;}
  if(dpTitleVal.length>255){showToast('Task title is too long (max 255 chars)');$('dp-ttl').classList.add('inp-err');$('dp-ttl').focus();return;}
  $('dp-ttl').classList.remove('inp-err');
  let rec=$('dp-rec').value||null;
  if(rec==='custom'){const n=parseInt($('dp-rec-n').value)||3;const u=$('dp-rec-unit').value;rec='every-'+n+'-'+u}
  await api.put('/api/tasks/'+dpTask.id,{
    title:$('dp-ttl').value, note:$('dp-note').value, due_date:$('dp-due').value||null,
    due_time:$('dp-time').value||null, start_date:$('dp-start').value||null,
    priority:Number($('dp-pri').value), assigned_to_user_id:$('dp-asg-user').value?Number($('dp-asg-user').value):null,
    recurring:rec, my_day:$('dp-md').checked, starred:dpTask.starred?1:0,
    estimated_minutes:Number($('dp-est').value)||null, actual_minutes:Number($('dp-act').value)||0,
    list_id:$('dp-list').value?Number($('dp-list').value):null
  });
  await api.put('/api/tasks/'+dpTask.id+'/tags',{tagIds:dpTags});
  $('dp').classList.remove('open');showToast('Task saved');await loadAreas();render();loadBellReminders();
});

// ─── AREA MODAL ───
let _editAreaId=null;
function openAreaModal(area){
  if(area){
    _editAreaId=area.id;$('am-t').textContent='Edit Life Area';
    $('am-name').value=area.name;$('am-icon').value=area.icon||'📋';$('am-color').value=area.color||'#2563EB';
    buildSwatches('am-sw','am-color',area.color||'#2563EB');
    $('am-save').textContent='Save';
  }else{
    _editAreaId=null;$('am-t').textContent='New Life Area';
    $('am-name').value='';$('am-icon').value='📋';$('am-color').value='#2563EB';
    buildSwatches('am-sw','am-color','#2563EB');
    $('am-save').textContent='Create';
  }
  $('am').classList.add('active');$('am-name').focus();clearFieldError('am-name');$('am-err-banner').classList.remove('show');
}
$('add-area-btn').addEventListener('click',(e)=>{e.stopPropagation();openAreaModal()});
$('am-cancel').addEventListener('click',()=>$('am').classList.remove('active'));
$('am-save').addEventListener('click',async()=>{
  if(!validateField('am-name',{required:true,maxlength:100,requiredMsg:'Please enter an area name'}))return;
  const n=$('am-name').value.trim();
  const data={name:n,icon:$('am-icon').value||'📋',color:$('am-color').value};
  try{
    let res;
    if(_editAreaId){res=await api.put('/api/areas/'+_editAreaId,data)}
    else{res=await api.post('/api/areas',data)}
    if(res&&res.error){$('am-err-msg').textContent=res.error;$('am-err-banner').classList.add('show');return}
    $('am-err-banner').classList.remove('show');
    $('am').classList.remove('active');await loadAreas();render();
  }catch(e){
    $('am-err-msg').textContent='Network error — please try again.';
    $('am-err-banner').classList.add('show');
  }
});

function openGM(id){
  if(id){editingId=id;const g=goals.find(x=>x.id===id);if(!g)return;$('gm-t').textContent='Edit Goal';$('gm-title').value=g.title;$('gm-desc').value=g.description||'';$('gm-due').value=g.due_date||'';$('gm-color').value=g.color||'#6C63FF';buildSwatches('gm-sw','gm-color',g.color||'#6C63FF');}
  else{editingId=null;$('gm-t').textContent='New Goal';$('gm-title').value='';$('gm-desc').value='';$('gm-due').value='';$('gm-color').value='#6C63FF';buildSwatches('gm-sw','gm-color','#6C63FF');}
  $('gm').classList.add('active');$('gm-title').focus();$('gm-err-banner')?.classList.remove('show');
}
$('gm-cancel').addEventListener('click',()=>$('gm').classList.remove('active'));
$('gm-save').addEventListener('click',async()=>{if(!validateField('gm-title',{required:true,maxlength:200,requiredMsg:'Please enter a goal title'}))return;const t=$('gm-title').value.trim();
  const d={title:t,description:$('gm-desc').value,due_date:$('gm-due').value||null,color:$('gm-color').value};
  if(editingId)await api.put('/api/goals/'+editingId,d);else await api.post('/api/areas/'+activeAreaId+'/goals',d);
  $('gm').classList.remove('active');await loadAreas();render()});

document.querySelectorAll('.mo').forEach(o=>o.addEventListener('click',e=>{if(e.target===o)o.classList.remove('active')}));
function emptyS(i,t,s,actions){let h=`<div class="empty"><span class="material-icons-round">${i}</span><p>${t}</p><p style="font-size:11px">${s}</p>`;if(actions)h+=`<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;justify-content:center">${actions}</div>`;h+=`</div>`;return h}

function hintCard(key,icon,text){
  if(localStorage.getItem('lf-hint-'+key))return'';
  return`<div class="hint-card" data-hint="${key}"><span class="material-icons-round">${icon}</span><span>${text}</span><span class="material-icons-round hint-dismiss" data-hint="${key}" title="Dismiss">close</span></div>`;
}
function wireHints(){
  document.querySelectorAll('.hint-dismiss').forEach(btn=>btn.addEventListener('click',e=>{
    e.stopPropagation();const k=btn.dataset.hint;
    localStorage.setItem('lf-hint-'+k,'1');
    btn.closest('.hint-card').remove();
  }));
}

// ─── THEMES ───
const THEMES=[
  {id:'midnight',label:'Midnight',dot:'#0F172A'},
  {id:'charcoal',label:'Charcoal',dot:'#27272A'},
  {id:'nord',label:'Nord',dot:'#3B4252'},
  {id:'ocean',label:'Ocean',dot:'#0D2137'},
  {id:'forest',label:'Forest',dot:'#14291A'},
  {id:'rose',label:'Rose',dot:'#2A1520'},
  {id:'sunset',label:'Sunset',dot:'#261B33'},
  {id:'light',label:'Light',dot:'#F8FAFC'}
];
function initThemes(){
  const saved=localStorage.getItem('lf-theme')||'midnight';
  document.documentElement.setAttribute('data-theme',saved);
  const tp=$('tp');
  if(!tp)return;
  tp.innerHTML=THEMES.map(t=>`<div class="tp-dot ${t.id===saved?'active':''}" data-t="${t.id}" title="${t.label}" tabindex="0" role="button" aria-label="Theme: ${t.label}" style="background:${t.dot}${t.id==='light'?';border:1px solid #CBD5E1':''}"></div>`).join('');
  tp.querySelectorAll('.tp-dot').forEach(d=>{
    function activate(){
    const tid=d.dataset.t;localStorage.setItem('lf-theme',tid);localStorage.setItem('lf-theme-explicit','true');
    document.documentElement.setAttribute('data-theme',tid);
    document.documentElement.removeAttribute('data-theme-auto');
    tp.querySelectorAll('.tp-dot').forEach(x=>x.classList.remove('active'));d.classList.add('active');
    }
    d.addEventListener('click',activate);
    d.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();activate()}});
  });
}
initThemes();

// ─── TOAST SYSTEM ───
function showToast(msg, undoFn, duration=5000) {
  const wrap = $('toast-wrap');
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span class="t-msg">${esc(msg)}</span>${undoFn ? '<span class="t-undo">Undo</span>' : ''}`;
  wrap.appendChild(el);
  let timer = setTimeout(() => removeToast(el), duration);
  if (undoFn) {
    el.querySelector('.t-undo').addEventListener('click', () => {
      clearTimeout(timer);
      undoFn();
      removeToast(el);
    });
  }
}
function removeToast(el) {
  el.classList.add('fading');
  setTimeout(() => el.remove(), 200);
}

// ─── AI MODALS ───
function showAiPlanModal(plan){
  const ov=document.createElement('div');
  ov.className='ov active';
  ov.id='ai-plan-ov';
  let h=`<div class="modal" style="max-width:520px;max-height:80vh;overflow-y:auto">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">
      <span class="material-icons-round" style="font-size:22px;color:var(--brand)">smart_toy</span>
      <h3 style="margin:0;font-size:16px">AI Daily Plan</h3>
      <span style="flex:1"></span><button class="btn-c ai-modal-close"><span class="material-icons-round">close</span></button>
    </div>`;
  if(plan.summary)h+=`<div style="padding:10px 14px;background:var(--sf);border-radius:var(--rs);margin-bottom:12px;font-size:13px">${esc(plan.summary)}</div>`;
  if(plan.estimated_hours)h+=`<div style="font-size:11px;color:var(--txd);margin-bottom:10px">Estimated: ${plan.estimated_hours}h</div>`;
  if(plan.plan?.length){
    h+=`<div style="display:flex;flex-direction:column;gap:6px">`;
    plan.plan.forEach((p,i)=>{
      h+=`<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--bg-c);border-radius:var(--rs);border-left:3px solid ${p.energy_level==='high'?'var(--err)':p.energy_level==='medium'?'var(--warn)':'var(--ok)'}">
        <span style="font-size:11px;color:var(--txd);font-weight:600;min-width:18px">${i+1}</span>
        ${p.suggested_time?`<span class="ai-time" style="font-size:11px;font-weight:500;color:var(--brand);min-width:42px">${esc(p.suggested_time)}</span>`:''}
        <div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" data-tid="${p.task_id}">${esc(p.reason||'Task #'+p.task_id)}</div>
        ${p.energy_level?`<div style="font-size:10px;color:var(--txd)">Energy: ${p.energy_level}</div>`:''}</div>
      </div>`;
    });
    h+=`</div>`;
  }
  if(plan.deferred?.length){
    h+=`<div style="margin-top:12px"><div style="font-size:12px;font-weight:600;margin-bottom:6px;color:var(--txd)">Suggested to defer:</div>`;
    plan.deferred.forEach(d=>{
      h+=`<div style="font-size:11px;color:var(--txd);padding:4px 0">${esc(d.reason)}${d.suggested_date?' → '+d.suggested_date:''}</div>`;
    });
    h+=`</div>`;
  }
  h+=`<div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end">
    <button class="btn-c ai-modal-close" style="font-size:12px;padding:8px 16px">Close</button>
    <button class="btn-s ai-plan-accept" style="font-size:12px;padding:8px 16px"><span class="material-icons-round" style="font-size:14px;vertical-align:middle;margin-right:4px">check</span>Looks good!</button>
  </div></div>`;
  ov.innerHTML=h;
  document.body.appendChild(ov);
  ov.querySelectorAll('.ai-modal-close').forEach(b=>b.addEventListener('click',()=>ov.remove()));
  ov.querySelector('.ai-plan-accept')?.addEventListener('click',async()=>{
    try{await api.post('/api/ai/accept',{feature:'daily_plan'})}catch{}
    showToast('Plan accepted! Time to execute.','ok');
    ov.remove();
  });
  ov.addEventListener('click',e=>{if(e.target===ov)ov.remove()});
}

function showAiDecomposeModal(result,goalId){
  const ov=document.createElement('div');
  ov.className='ov active';
  ov.id='ai-decompose-ov';
  const data=result.data||result;
  let h=`<div class="modal" style="max-width:560px;max-height:80vh;overflow-y:auto">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">
      <span class="material-icons-round" style="font-size:22px;color:var(--brand)">account_tree</span>
      <h3 style="margin:0;font-size:16px">Goal Decomposition</h3>
      <span style="flex:1"></span><button class="btn-c ai-modal-close"><span class="material-icons-round">close</span></button>
    </div>`;
  if(data.notes)h+=`<div style="padding:10px 14px;background:var(--sf);border-radius:var(--rs);margin-bottom:12px;font-size:12px;color:var(--txd)">${esc(data.notes)}</div>`;
  if(data.estimated_total_hours)h+=`<div style="font-size:11px;color:var(--txd);margin-bottom:10px">Est. total: ${data.estimated_total_hours}h</div>`;
  if(data.milestones?.length){
    data.milestones.forEach((m,mi)=>{
      h+=`<div style="margin-bottom:12px"><div style="font-weight:600;font-size:13px;margin-bottom:6px;display:flex;align-items:center;gap:6px">
        <span style="background:var(--brand);color:#fff;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;flex-shrink:0">${mi+1}</span>${esc(m.title)}</div>`;
      if(m.tasks?.length){
        m.tasks.forEach(t=>{
          h+=`<div style="margin-left:26px;padding:4px 0;font-size:12px;display:flex;align-items:center;gap:6px">
            <input type="checkbox" class="ai-task-check" data-mi="${mi}" data-title="${escA(t.title)}" checked style="margin:0">
            <span>${esc(t.title)}</span>
            ${t.estimated_minutes?`<span style="color:var(--txd);font-size:10px">${t.estimated_minutes}min</span>`:''}
            ${t.priority?`<span style="font-size:10px;padding:1px 4px;border-radius:3px;background:${t.priority>=3?'var(--err)':t.priority>=2?'var(--warn)':'var(--ok)'};color:#fff">P${t.priority}</span>`:''}
          </div>`;
          if(t.subtasks?.length){
            t.subtasks.forEach(s=>{
              h+=`<div style="margin-left:52px;padding:2px 0;font-size:11px;color:var(--txd)">• ${esc(s)}</div>`;
            });
          }
        });
      }
      h+=`</div>`;
    });
  }
  h+=`<div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end">
    <button class="btn-c ai-modal-close" style="font-size:12px;padding:8px 16px">Cancel</button>
    <button class="btn-s ai-decompose-apply" style="font-size:12px;padding:8px 16px"><span class="material-icons-round" style="font-size:14px;vertical-align:middle;margin-right:4px">add_task</span>Create Tasks</button>
  </div></div>`;
  ov.innerHTML=h;
  document.body.appendChild(ov);
  ov.querySelectorAll('.ai-modal-close').forEach(b=>b.addEventListener('click',()=>ov.remove()));
  ov.addEventListener('click',e=>{if(e.target===ov)ov.remove()});
  ov.querySelector('.ai-decompose-apply')?.addEventListener('click',async()=>{
    const checked=ov.querySelectorAll('.ai-task-check:checked');
    let created=0;
    for(const cb of checked){
      try{
        await api.post(`/api/goals/${goalId}/tasks`,{title:cb.dataset.title,status:'todo'});
        created++;
      }catch{}
    }
    try{await api.post('/api/ai/accept',{feature:'decompose'})}catch{}
    showToast(`Created ${created} tasks from AI plan`,'ok');
    ov.remove();
    render();
  });
}

function showAiReviewModal(result){
  const ov=document.createElement('div');
  ov.className='ov active';
  ov.id='ai-review-ov';
  const data=result.data||result;
  let h=`<div class="modal" style="max-width:520px;max-height:80vh;overflow-y:auto">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">
      <span class="material-icons-round" style="font-size:22px;color:var(--brand)">rate_review</span>
      <h3 style="margin:0;font-size:16px">AI Weekly Review</h3>
      <span style="flex:1"></span><button class="btn-c ai-modal-close"><span class="material-icons-round">close</span></button>
    </div>`;
  if(data.wins?.length){
    h+=`<div style="margin-bottom:12px"><div style="font-size:12px;font-weight:600;margin-bottom:6px;color:var(--ok)">🎉 Wins</div>`;
    data.wins.forEach(w=>{h+=`<div style="font-size:12px;padding:4px 0">${esc(w)}</div>`});
    h+=`</div>`;
  }
  if(data.patterns?.length){
    h+=`<div style="margin-bottom:12px"><div style="font-size:12px;font-weight:600;margin-bottom:6px">📊 Patterns</div>`;
    data.patterns.forEach(p=>{h+=`<div style="font-size:12px;padding:4px 0;color:var(--txd)">${esc(p)}</div>`});
    h+=`</div>`;
  }
  if(data.balanceAlert){
    h+=`<div style="padding:10px;background:var(--warn-bg,rgba(255,152,0,.1));border-radius:var(--rs);margin-bottom:12px;font-size:12px">⚠️ ${esc(data.balanceAlert)}</div>`;
  }
  if(data.reflectionQuestions?.length){
    h+=`<div style="margin-bottom:12px"><div style="font-size:12px;font-weight:600;margin-bottom:6px">🤔 Reflect</div>`;
    data.reflectionQuestions.forEach(q=>{h+=`<div style="font-size:12px;padding:4px 0;font-style:italic;color:var(--txd)">${esc(q)}</div>`});
    h+=`</div>`;
  }
  if(data.nextWeekFocus){
    h+=`<div style="padding:10px;background:var(--sf);border-radius:var(--rs);margin-bottom:12px;font-size:12px"><strong>Focus next week:</strong> ${esc(data.nextWeekFocus)}</div>`;
  }
  if(data.motivationalNote){
    h+=`<div style="font-size:12px;color:var(--txd);font-style:italic;margin-bottom:12px">${esc(data.motivationalNote)}</div>`;
  }
  h+=`<div style="display:flex;gap:8px;justify-content:flex-end">
    <button class="btn-c ai-modal-close" style="font-size:12px;padding:8px 16px">Close</button>
  </div></div>`;
  ov.innerHTML=h;
  document.body.appendChild(ov);
  ov.querySelectorAll('.ai-modal-close').forEach(b=>b.addEventListener('click',()=>ov.remove()));
  ov.addEventListener('click',e=>{if(e.target===ov)ov.remove()});
}

function showAiYearReviewModal(data){
  const ov=document.createElement('div');
  ov.className='ov active';
  let h=`<div class="modal" style="max-width:560px;max-height:85vh;overflow-y:auto">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">
      <span class="material-icons-round" style="font-size:22px;color:var(--brand)">auto_awesome</span>
      <h3 style="margin:0;font-size:16px">${data.headline||'Your Year in Review'}</h3>
      <span style="flex:1"></span><button class="btn-c ai-modal-close"><span class="material-icons-round">close</span></button>
    </div>`;
  if(data.growthStory)h+=`<div style="padding:12px 14px;background:var(--sf);border-radius:var(--rs);margin-bottom:14px;font-size:13px;line-height:1.5">${esc(data.growthStory)}</div>`;
  // Stats grid
  h+=`<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px">`;
  const statsMap={tasksCompleted:'Tasks Done',goalsAchieved:'Goals Hit',focusHours:'Focus Hours',streakRecord:'Best Streak',habitLogs:'Habit Logs'};
  const ts=data.totalStats||{};
  Object.entries(statsMap).forEach(([k,l])=>{
    if(ts[k]!=null)h+=`<div style="text-align:center;padding:10px;background:var(--bg-c);border-radius:var(--rs)"><div style="font-size:20px;font-weight:700;color:var(--brand)">${typeof ts[k]==='number'?ts[k].toLocaleString():ts[k]}</div><div style="font-size:10px;color:var(--txd)">${l}</div></div>`;
  });
  h+=`</div>`;
  if(data.topAreas?.length){
    h+=`<div style="margin-bottom:12px"><div style="font-size:12px;font-weight:600;margin-bottom:6px">Top Areas</div>`;
    data.topAreas.forEach(a=>{h+=`<div style="font-size:12px;padding:4px 0">${esc(a.name)} — ${a.percentage}% — ${esc(a.insight||'')}</div>`});
    h+=`</div>`;
  }
  if(data.achievements?.length){
    h+=`<div style="margin-bottom:12px"><div style="font-size:12px;font-weight:600;margin-bottom:6px">🏆 Achievements</div>`;
    data.achievements.forEach(a=>{h+=`<div style="font-size:12px;padding:3px 0">${esc(a)}</div>`});
    h+=`</div>`;
  }
  if(data.funFacts?.length){
    h+=`<div style="margin-bottom:12px"><div style="font-size:12px;font-weight:600;margin-bottom:6px">🎲 Fun Facts</div>`;
    data.funFacts.forEach(f=>{h+=`<div style="font-size:12px;padding:3px 0;color:var(--txd)">${esc(f)}</div>`});
    h+=`</div>`;
  }
  if(data.nextYearSuggestion)h+=`<div style="padding:10px;background:var(--sf);border-radius:var(--rs);font-size:12px"><strong>Next year:</strong> ${esc(data.nextYearSuggestion)}</div>`;
  h+=`<div style="margin-top:14px;text-align:right"><button class="btn-c ai-modal-close" style="font-size:12px;padding:8px 16px">Close</button></div></div>`;
  ov.innerHTML=h;
  document.body.appendChild(ov);
  ov.querySelectorAll('.ai-modal-close').forEach(b=>b.addEventListener('click',()=>ov.remove()));
  ov.addEventListener('click',e=>{if(e.target===ov)ov.remove()});
}

// ─── WIRE DATA-ACTION BUTTONS ───
function wireActions(container){
  (container||document).querySelectorAll('[data-action]').forEach(b=>{
    const a=b.dataset.action;
    if(a==='quick-capture')b.addEventListener('click',()=>openQuickCapture());
    else if(a==='go-inbox')b.addEventListener('click',()=>go('inbox'));
    else if(a==='go-dashboard')b.addEventListener('click',()=>go('dashboard'));
    else if(a==='click-new-rule')b.addEventListener('click',()=>document.getElementById('new-rule-btn')?.click());
    else if(a==='start-tour')b.addEventListener('click',()=>startTour());
    else if(a==='show-shortcuts')b.addEventListener('click',()=>$('kb-ov').classList.add('active'));
    else if(a==='reset-onboarding')b.addEventListener('click',()=>{localStorage.removeItem('lf-onboarded');localStorage.removeItem('lf-tour-done');showToast('Onboarding reset — refresh to see it again')});
  });
}

// ─── HAMBURGER (Mobile) ───
$('ham').addEventListener('click', () => { $('sb').classList.toggle('open'); $('sb-ov').classList.toggle('open'); });
$('sb-ov').addEventListener('click', () => { $('sb').classList.remove('open'); $('sb-ov').classList.remove('open'); });
// Close sidebar on nav click (mobile)
function closeMobileSb() { $('sb').classList.remove('open'); $('sb-ov').classList.remove('open'); }

// ─── SIDEBAR COLLAPSE (desktop icon rail) ───
$('sb-home').addEventListener('click', (e) => {
  if(e.target.closest('.sb-collapse-btn')) return;
  currentView='myday';activeAreaId=null;activeGoalId=null;
  document.querySelectorAll('.ni,.ai,.sf-item').forEach(n=>n.classList.remove('active'));
  const todayItem=document.querySelector('.ni[data-view="myday"]');if(todayItem)todayItem.classList.add('active');
  closeMobileSb();render();
});
function toggleSidebarCollapse(){
  const sb=$('sb');
  if(window.innerWidth<=768) return;
  sb.classList.toggle('collapsed');
  localStorage.setItem('lf-sb-collapsed',sb.classList.contains('collapsed')?'1':'0');
}
$('sb-collapse').addEventListener('click', (e) => { e.stopPropagation(); toggleSidebarCollapse(); });
// Restore collapsed state
if(localStorage.getItem('lf-sb-collapsed')==='1' && window.innerWidth>768){ $('sb').classList.add('collapsed'); }
// Keyboard shortcut: Ctrl+B / Cmd+B to toggle sidebar
document.addEventListener('keydown', (e) => {
  if((e.metaKey||e.ctrlKey) && e.key==='b'){
    e.preventDefault(); toggleSidebarCollapse();
  }
});

// Boot
Promise.all([loadSettings(),loadAreas(),loadTags(),loadSavedFilters(),loadSmartCounts(),loadUserLists(),loadAllUsers()]).then(()=>{
  // Apply settings on load (skip if embedded in parent SPA — parent controls theme)
  if(appSettings.theme && window.self === window.top){
    document.documentElement.setAttribute('data-theme',appSettings.theme);
    localStorage.setItem('lf-theme',appSettings.theme);
  }
  if(appSettings.defaultView&&!localStorage.getItem('lf-onboarded-skip-default')){
    currentView=appSettings.defaultView;
    document.querySelectorAll('.ni,.ai').forEach(n=>n.classList.remove('active'));
    document.querySelector(`.ni[data-view="${appSettings.defaultView}"]`)?.classList.add('active');
  }
  render();loadOverdueBadge();loadBellReminders();initServiceWorker();requestNotificationPermission();
  // iOS keyboard detection — toggle body class for CSS positioning fixes
  if(/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.userAgent.includes('Mac')&&'ontouchend' in document)){
    const vv=window.visualViewport;
    if(vv){
      vv.addEventListener('resize',()=>{
        const kbOpen=vv.height<window.innerHeight*0.75;
        document.body.classList.toggle('keyboard-open',kbOpen);
      });
    }
  }
  // Prefers-color-scheme: auto-set theme if user hasn't explicitly chosen one (skip in iframe)
  if(!localStorage.getItem('lf-theme-explicit') && window.self === window.top){
    document.documentElement.setAttribute('data-theme-auto','true');
  }
  // Check for first-time user onboarding
  if(!localStorage.getItem('lf-onboarded')&&!areas.length){$('onb-ov').classList.add('active')}
});

// ─── SERVICE WORKER ───
async function initServiceWorker(){
  if(!('serviceWorker' in navigator)){
    console.warn('Service Worker not supported — offline mode unavailable');
    return;
  }
  try{
    const reg=await navigator.serviceWorker.register('sw.js',{scope:'.'});
    // Listen for messages from SW (e.g., notification click with taskId)
    navigator.serviceWorker.addEventListener('message',e=>{
      if(e.data?.action==='openTask'&&e.data?.taskId){openDP(e.data.taskId)}
      if(e.data?.type==='sw-update-available'){
        showToast('🔄 App update available — refresh to get the latest version',()=>{
          if(reg.waiting)reg.waiting.postMessage({type:'skip-waiting'});
          window.location.reload();
        },10000);
      }
    });
    // Monitor SW state for failures
    if(reg.installing){
      reg.installing.addEventListener('statechange',function(){
        if(this.state==='redundant'){
          console.error('SW install failed (redundant)');
          showToast('⚠️ Offline mode failed to activate');
        }
      });
    }
    // Set up periodic sync for reminders (syncs every 60 min if app closed)
    if('periodicSync' in reg){try{await reg.periodicSync.register('lifeflow-sync-reminders',{minInterval:60*60*1000})}catch(e){}}
  }catch(err){
    console.error('SW registration failed:',err);
    showToast('⚠️ Offline mode unavailable — '+err.message);
  }
}

// ─── NOTIFICATION PERMISSION ───
async function requestNotificationPermission(){
  if(!('Notification' in window)||Notification.permission==='denied')return;
  if(Notification.permission==='granted'){scheduleNotifications();return}
  // Show toast suggesting permission
  const asked=localStorage.getItem('lf-notification-asked');
  if(asked)return;
  showToast('💬 Enable notifications to never miss a deadline',async()=>{
    localStorage.setItem('lf-notification-asked','true');
    const perm=await Notification.requestPermission();
    if(perm==='granted'){showToast('✅ Notifications enabled!');scheduleNotifications()}
  },8000);
  localStorage.setItem('lf-notification-asked','true');
}

// Send reminders via Notification API
async function scheduleNotifications(){
  try{
    const r=await api.get('/api/reminders');
    const tasks=[...(r.overdue||[]),...(r.today||[])];
    if(!tasks.length)return;
    // Show summary notification if not already shown (use timestamp to avoid duplicates)
    const lastNotif=localStorage.getItem('lf-last-notif-time');
    const now=Date.now();
    if(lastNotif&&now-parseInt(lastNotif)<300000)return; // Only once per 5 min
    const count=tasks.length;
    if('serviceWorker' in navigator&&navigator.serviceWorker.controller){
      navigator.serviceWorker.controller.postMessage({
        type:'show-notification',
        notification:{title:'LifeFlow Reminders',body:`${count} task${count>1?'s':''} due`,tag:'reminders'}
      });
    }
    localStorage.setItem('lf-last-notif-time',String(now));
  }catch(err){console.error('Notification schedule error:',err)}
}
// Call scheduleNotifications every 5 min when window is focused
if('Notification' in window&&Notification.permission==='granted'){
  setInterval(scheduleNotifications,5*60*1000);
  window.addEventListener('focus',scheduleNotifications);
}

// ─── ONBOARDING WIZARD ───
(function initOnboarding(){
  let onbAreaId=null,onbGoalId=null;
  const ov=$('onb-ov');

  function showStep(n){
    ov.querySelectorAll('.onb-step').forEach(s=>s.style.display='none');
    ov.querySelector('.onb-step-'+n).style.display='block';
  }

  $('onb-next-1').addEventListener('click',()=>showStep(2));

  $('onb-next-2').addEventListener('click',async()=>{
    const name=$('onb-area-input').value.trim();
    if(!name){$('onb-area-input').style.borderColor='var(--err)';return}
    const icon=$('onb-area-icon').value;
    const color=COLORS[Math.floor(Math.random()*COLORS.length)];
    try{
      const area=await api.post('/api/areas',{name,icon,color});
      onbAreaId=area.id;
      await loadAreas();render();
      showStep(3);
    }catch(e){showToast('Failed to create area')}
  });

  $('onb-skip-2').addEventListener('click',()=>{
    localStorage.setItem('lf-onboarded','true');
    ov.classList.remove('active');
  });

  $('onb-next-3').addEventListener('click',async()=>{
    const title=$('onb-goal-input').value.trim();
    if(!title){$('onb-goal-input').style.borderColor='var(--err)';return}
    if(!onbAreaId){showToast('Please create an area first');showStep(2);return}
    try{
      const goal=await api.post('/api/areas/'+onbAreaId+'/goals',{title,description:'',color:COLORS[0]});
      onbGoalId=goal.id;
      showStep(4);
    }catch(e){showToast('Failed to create goal')}
  });

  $('onb-skip-3').addEventListener('click',()=>{
    localStorage.setItem('lf-onboarded','true');
    ov.classList.remove('active');
    loadAreas().then(render);
  });

  $('onb-next-4').addEventListener('click',async()=>{
    const title=$('onb-task-input').value.trim();
    if(!title){$('onb-task-input').style.borderColor='var(--err)';return}
    if(!onbGoalId){showToast('Please add a goal first');showStep(3);return}
    const priority=Number($('onb-task-priority').value);
    const due=$('onb-task-due').value||null;
    try{
      await api.post('/api/goals/'+onbGoalId+'/tasks',{title,priority,due_date:due,status:'todo',my_day:1});
      localStorage.setItem('lf-onboarded','true');
      ov.classList.remove('active');
      await loadAreas();render();
      showToast('🎉 Welcome to LifeFlow! Your first task is ready.');
      // Start interactive tour after a brief pause
      setTimeout(()=>{if(!localStorage.getItem('lf-tour-done'))startTour()},800);
    }catch(e){showToast('Failed to create task')}
  });
})();

// ─── INTERACTIVE TOUR ───
(function initTour(){
  const ov=$('tour-ov'),backdrop=$('tour-backdrop'),spotlight=$('tour-spotlight'),tooltip=$('tour-tooltip');
  const titleEl=$('tour-title'),descEl=$('tour-desc'),dotsEl=$('tour-dots'),progressEl=$('tour-progress'),nextBtn=$('tour-next'),skipBtn=$('tour-skip');
  let step=0,steps=[];

  const tourSteps=[
    {sel:'.sb-brand',title:'LifeFlow',icon:'home',desc:'This is your home base. The sidebar gives you quick access to every view and feature in the app.',pos:'right'},
    {sel:'.ni[data-view="myday"]',title:'Today View',icon:'wb_sunny',desc:'Your daily command center. See tasks due today and ones you\'ve added to "My Day". Start every morning here.',pos:'right'},
    {sel:'.ni[data-view="inbox"]',title:'Inbox',icon:'inbox',desc:'Quick-capture tasks without organizing. Triage them later into the right life areas and goals.',pos:'right'},
    {sel:'[data-sec="exec"]',title:'Execution',icon:'play_circle',desc:'This group has your active views — Board, Calendar, Day Planner, and Focus Timer. Click to expand and see them all.',pos:'right'},
    {sel:'[data-sec="plan"]',title:'Planning',icon:'event_note',desc:'Planning tools — Upcoming tasks, the Eisenhower Matrix for prioritization, and Weekly Planning view.',pos:'right'},
    {sel:'[data-sec="reflect"]',title:'Reflection',icon:'auto_graph',desc:'Track your progress with the Dashboard, Activity Log, Focus History, Habits, and Weekly Review.',pos:'right'},
    {sel:'#add-area-btn',title:'Life Areas',icon:'category',desc:'Organize your life into areas like Work, Health, and Personal. Click the + icon to create your first area.',pos:'right'},
    {sel:'#sr-inp',title:'Search & Commands',icon:'search',desc:'Press Ctrl+K to search tasks instantly. Type > for the command palette — switch themes, export data, and more.',pos:'bottom'},
    {sel:'#sb-settings-btn',title:'Settings',icon:'settings',desc:'Customize LifeFlow — choose from 8 themes, set your default view, configure task behavior, and manage backups.',pos:'right'},
    {sel:'#sb-reports-btn',title:'Reports',icon:'assessment',desc:'Track your productivity with dashboards, activity logs, focus stats, and habit streaks.',pos:'right'}
  ];

  function endTour(){
    ov.classList.remove('active');
    localStorage.setItem('lf-tour-done','true');
    showToast('🎓 Tour complete! Press ? any time for keyboard shortcuts, or visit Help & Guide for more.');
  }

  function positionTooltip(rect,pos){
    const tt=tooltip;const pad=12;
    tt.style.left='';tt.style.right='';tt.style.top='';tt.style.bottom='';
    if(pos==='right'){
      tt.style.left=Math.min(rect.right+pad,window.innerWidth-340)+'px';
      tt.style.top=Math.max(rect.top,8)+'px';
    }else if(pos==='bottom'){
      tt.style.left=Math.max(rect.left,8)+'px';
      tt.style.top=(rect.bottom+pad)+'px';
    }else if(pos==='left'){
      tt.style.left=Math.max(rect.left-340,8)+'px';
      tt.style.top=Math.max(rect.top,8)+'px';
    }else{
      tt.style.left=Math.max(rect.left,8)+'px';
      tt.style.top=Math.max(rect.top-180,8)+'px';
    }
  }

  function showStep(idx){
    step=idx;
    const s=steps[step];
    const el=document.querySelector(s.sel);
    if(!el){step++;if(step<steps.length)showStep(step);else endTour();return}
    const rect=el.getBoundingClientRect();
    const sp=spotlight;
    sp.style.left=(rect.left-6)+'px';sp.style.top=(rect.top-6)+'px';
    sp.style.width=(rect.width+12)+'px';sp.style.height=(rect.height+12)+'px';
    titleEl.innerHTML=`<span class="material-icons-round">${s.icon}</span>${s.title}`;
    descEl.textContent=s.desc;
    progressEl.style.width=((step+1)/steps.length*100)+'%';
    // Dots
    dotsEl.innerHTML=steps.map((_,i)=>`<div class="tour-dot${i===step?' active':''}"></div>`).join('');
    // Button text
    nextBtn.textContent=step===steps.length-1?'Finish ✓':'Next →';
    positionTooltip(rect,s.pos);
    tooltip.style.animation='none';tooltip.offsetHeight;tooltip.style.animation='slideUp .3s ease-out';
  }

  window.startTour=function(){
    // Build the active steps list (only elements that exist)
    steps=tourSteps.filter(s=>document.querySelector(s.sel));
    if(!steps.length){showToast('Nothing to tour — try expanding the sidebar');return}
    // Ensure sidebar is visible on mobile
    const sb=$('sb');if(sb&&!sb.classList.contains('open')&&window.innerWidth<768)sb.classList.add('open');
    step=0;
    ov.classList.add('active');
    showStep(0);
  };

  nextBtn.addEventListener('click',()=>{
    if(step<steps.length-1){showStep(step+1)}else{endTour()}
  });
  skipBtn.addEventListener('click',endTour);
  backdrop.addEventListener('click',endTour);
})();

// ─── NOTIFICATION BELL ───
function getDismissedReminders(){
  const today=_toDateStr(new Date());
  const storedDate=localStorage.getItem('lf-dismissed-date');
  if(storedDate!==today){localStorage.setItem('lf-dismissed-reminders','[]');localStorage.setItem('lf-dismissed-date',today);return[]}
  try{return JSON.parse(localStorage.getItem('lf-dismissed-reminders')||'[]')}catch{return[]}
}
function dismissReminder(taskId){
  const dismissed=getDismissedReminders();
  if(!dismissed.includes(taskId)){dismissed.push(taskId);localStorage.setItem('lf-dismissed-reminders',JSON.stringify(dismissed))}
}
function clearAllReminders(taskIds){
  const dismissed=getDismissedReminders();
  const merged=[...new Set([...dismissed,...taskIds])];
  localStorage.setItem('lf-dismissed-reminders',JSON.stringify(merged));
}
async function loadBellReminders(){
  try{
    const r=await api.get('/api/reminders');
    const dismissed=getDismissedReminders();
    const filterDismissed=arr=>arr.filter(t=>!dismissed.includes(t.id));
    const overdue=filterDismissed(r.overdue||[]);
    const today=filterDismissed(r.today||[]);
    const upcoming=filterDismissed(r.upcoming||[]);
    const total=overdue.length+today.length+upcoming.length;
    const badge=$('bell-badge');
    badge.textContent=total;badge.dataset.c=total;
    const dd=$('bell-dd');
    let h='<div class="bell-header"><span>Reminders</span>';
    if(total)h+='<button class="bell-clear-all" id="bell-clear-all">Clear all</button>';
    h+='</div>';
    if(!total){h+='<div class="bell-empty"><span class="material-icons-round" style="font-size:32px;opacity:.3;display:block;margin-bottom:6px">check_circle</span>All clear! No upcoming deadlines</div>';dd.innerHTML=h;return}
    if(overdue.length){h+=`<div class="bell-sec" style="color:var(--err)">Overdue (${overdue.length})</div>`;
      overdue.forEach(t=>h+=bellItem(t,'od'))}
    if(today.length){h+=`<div class="bell-sec" style="color:var(--warn)">Due Today (${today.length})</div>`;
      today.forEach(t=>h+=bellItem(t,'today'))}
    if(upcoming.length){h+=`<div class="bell-sec">Coming Up (${upcoming.length})</div>`;
      upcoming.forEach(t=>h+=bellItem(t,'soon'))}
    dd.innerHTML=h;
    dd.querySelectorAll('.bell-item').forEach(it=>it.addEventListener('click',e=>{if(e.target.closest('.bell-item-dismiss'))return;dd.classList.remove('open');openDP(Number(it.dataset.id))}));
    dd.querySelectorAll('.bell-item-dismiss').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();dismissReminder(Number(btn.dataset.id));loadBellReminders()}));
    const clearBtn=$('bell-clear-all');
    if(clearBtn)clearBtn.addEventListener('click',e=>{e.stopPropagation();const allIds=[...overdue,...today,...upcoming].map(t=>t.id);clearAllReminders(allIds);loadBellReminders()});
  }catch{}
}
function bellItem(t,type){
  const icon=type==='od'?'error':'event';
  const color=type==='od'?'var(--err)':type==='today'?'var(--warn)':'var(--txd)';
  return`<div class="bell-item" data-id="${t.id}"><span class="material-icons-round" style="font-size:16px;color:${color}">${icon}</span><span>${esc(t.title)}</span><span class="bell-due">${fmtDue(t.due_date)}</span><button class="bell-item-dismiss" data-id="${t.id}" aria-label="Dismiss" title="Dismiss">&times;</button></div>`;
}
$('bell-btn').addEventListener('click',e=>{e.stopPropagation();$('bell-dd').classList.toggle('open');loadBellReminders()});
document.addEventListener('click',e=>{if(!e.target.closest('#bell-wrap'))$('bell-dd').classList.remove('open')});
$('tb-search-btn').addEventListener('click',()=>openSearch());
// Refresh bell every 60 seconds
setInterval(loadBellReminders,60000);

// ─── SEARCH + COMMAND PALETTE ───
let srTimer=null,srIdx=-1,cpMode=false;
const CP_COMMANDS=[
  {id:'go-myday',label:'Go to Today',icon:'wb_sunny',key:'1',action:()=>{closeSearch();go('myday')}},
  {id:'go-all',label:'Go to All Tasks',icon:'list',key:'2',action:()=>{closeSearch();go('all')}},
  {id:'go-board',label:'Go to Board',icon:'view_kanban',key:'3',action:()=>{closeSearch();go('board')}},
  {id:'go-calendar',label:'Go to Calendar',icon:'calendar_month',key:'4',action:()=>{closeSearch();go('calendar')}},
  {id:'go-dashboard',label:'Go to Dashboard',icon:'dashboard',key:'5',action:()=>{closeSearch();go('dashboard')}},
  {id:'go-weekly',label:'Go to Weekly Plan',icon:'view_week',key:'6',action:()=>{closeSearch();go('weekly')}},
  {id:'go-matrix',label:'Go to Eisenhower Matrix',icon:'grid_view',key:'7',action:()=>{closeSearch();go('matrix')}},
  {id:'go-logbook',label:'Go to Activity Log',icon:'history',key:'8',action:()=>{closeSearch();go('logbook')}},
  {id:'go-settings',label:'Go to Settings',icon:'settings',key:'',action:()=>{closeSearch();go('settings')}},
  {id:'go-templates',label:'Go to Templates',icon:'content_copy',key:'',action:()=>{closeSearch();go('templates')}},
  {id:'go-tags',label:'Go to Tag Manager',icon:'label',key:'9',action:()=>{closeSearch();go('tags')}},
  {id:'add-task',label:'Quick Add Task',icon:'add_circle',key:'N',action:()=>{closeSearch();openQuickCapture()}},
  {id:'daily-review',label:'Start Daily Review',icon:'self_improvement',key:'',action:()=>{closeSearch();openDailyReview()}},
  {id:'focus-timer',label:'Start Focus Timer',icon:'timer',key:'',action:()=>{closeSearch();const t=tasks.find(x=>x.status!=='done');if(t)startFocusTimer(t.id)}},
  {id:'toggle-theme',label:'Switch Theme',icon:'palette',key:'',action:()=>{closeSearch();go('settings')}},
  {id:'export-data',label:'Export Data (JSON)',icon:'download',key:'',action:async()=>{closeSearch();go('settings');setTimeout(()=>$('set-export')?.click(),200)}},
  {id:'multi-select',label:'Toggle Multi-Select Mode',icon:'checklist',key:'M',action:()=>{closeSearch();toggleMultiSelect()}},
  {id:'shortcuts',label:'Show Keyboard Shortcuts',icon:'keyboard',key:'?',action:()=>{closeSearch();$('kb-ov').classList.add('active')}},
  {id:'go-inbox',label:'Go to Inbox',icon:'inbox',key:'',action:()=>{closeSearch();go('inbox')}},
  {id:'go-notes',label:'Go to Notes',icon:'note',key:'',action:()=>{closeSearch();go('notes')}},
  {id:'go-habits',label:'Go to Habits',icon:'repeat',key:'',action:()=>{closeSearch();go('habits')}},
  {id:'go-analytics',label:'Go to Time Analytics',icon:'analytics',key:'',action:()=>{closeSearch();go('timeanalytics')}},
  {id:'go-rules',label:'Go to Automations',icon:'auto_fix_high',key:'',action:()=>{closeSearch();go('rules')}},
  {id:'go-review',label:'Go to Weekly Review',icon:'rate_review',key:'',action:()=>{closeSearch();go('review')}},
  {id:'go-planner',label:'Go to Day Planner',icon:'view_timeline',key:'',action:()=>{closeSearch();go('planner')}},
  {id:'smart-stale',label:'View Stale Tasks',icon:'hourglass_empty',key:'',action:()=>{closeSearch();activeSmartFilter='stale';currentView='smartlist';render()}},
  {id:'smart-quickwins',label:'View Quick Wins',icon:'bolt',key:'',action:()=>{closeSearch();activeSmartFilter='quickwins';currentView='smartlist';render()}},
  {id:'smart-blocked',label:'View Blocked Tasks',icon:'lock',key:'',action:()=>{closeSearch();activeSmartFilter='blocked';currentView='smartlist';render()}},
  {id:'plan-day',label:'Plan My Day (Briefing)',icon:'wb_sunny',key:'',action:()=>{closeSearch();currentView='myday';render()}},
  {id:'export-ical',label:'Export to Calendar (iCal)',icon:'calendar_month',key:'',action:()=>{closeSearch();window.open('/api/export/ical','_blank')}},
  {id:'smart-plan',label:'Smart Plan My Day',icon:'auto_awesome',key:'',action:async()=>{closeSearch();const r=await api.get('/api/planner/smart');if(r.suggested?.length){for(const t of r.suggested)await api.put('/api/tasks/'+t.id,{my_day:1});showToast(r.suggested.length+' tasks added to My Day');go('myday')}else{showToast('No suggestions available')}}},
];
function openSearch(commandMode){
  cpMode=!!commandMode;
  $('sr-ov').classList.add('active');
  $('sr-inp').value=cpMode?'>':'';
  $('sr-inp').focus();srIdx=-1;
  if(cpMode){renderCommands('')}
  else{$('sr-results').innerHTML='<div class="sr-empty">Type to search · Press <b>&gt;</b> for commands</div>'}
}
function closeSearch(){$('sr-ov').classList.remove('active');cpMode=false}
$('sr-ov').addEventListener('click',e=>{if(e.target===$('sr-ov'))closeSearch()});
function renderCommands(filter){
  const f=filter.toLowerCase();
  const cmds=f?CP_COMMANDS.filter(c=>c.label.toLowerCase().includes(f)):CP_COMMANDS;
  if(!cmds.length){$('sr-results').innerHTML='<div class="sr-empty">No matching commands</div>';srIdx=-1;return}
  $('sr-results').innerHTML='<div class="cp-mode-label"><span class="material-icons-round">terminal</span>Commands</div>'+
    cmds.map((c,i)=>`<div class="sr-item" role="option" data-cmd="${c.id}"><span class="material-icons-round cp-icon">${c.icon}</span><div class="sr-ti">${esc(c.label)}</div>${c.key?'<span class="cp-key">'+esc(c.key)+'</span>':''}</div>`).join('');
  srIdx=-1;
  $('sr-results').querySelectorAll('.sr-item').forEach(it=>it.addEventListener('click',()=>{
    const cmd=CP_COMMANDS.find(c=>c.id===it.dataset.cmd);if(cmd)cmd.action();
  }));
}
function runSearch(){
  clearTimeout(srTimer);
  srTimer=setTimeout(async()=>{
    const raw=$('sr-inp').value;
    // Command palette mode
    if(raw.startsWith('>')){cpMode=true;renderCommands(raw.slice(1).trim());return}
    cpMode=false;
    // Quick create mode with /
    if(raw.startsWith('/')){
      const text=raw.slice(1).trim();
      if(!text){$('sr-results').innerHTML='<div class="sr-empty">Type a task to create: <b>/Buy groceries #shopping !high due:friday</b></div>';srIdx=-1;return}
      try{
        const parsed=await api.post('/api/tasks/parse',{text});
        let preview=`<div class="cp-task-preview"><div class="cp-tp-title">${esc(parsed.title||text)}</div><div class="cp-tp-meta">`;
        if(parsed.priority>0)preview+=`<span style="color:${PC[parsed.priority]}">${PL[parsed.priority]}</span> `;
        if(parsed.due_date)preview+=`📅 ${fmtDue(parsed.due_date)} `;
        if(parsed.tags&&parsed.tags.length)parsed.tags.forEach(tg=>preview+=`<span class="tag" style="background:var(--brand)">${esc(tg)}</span> `);
        preview+=`</div></div>`;
        preview+=`<div class="cp-create" id="cp-quick-create"><span class="material-icons-round" style="font-size:16px">add_circle</span>Create task · <b>Enter</b></div>`;
        $('sr-results').innerHTML=preview;srIdx=-1;
        $('cp-quick-create').addEventListener('click',async()=>{
          await createFromPalette(text);
        });
      }catch{
        $('sr-results').innerHTML=`<div class="cp-create" id="cp-quick-create"><span class="material-icons-round" style="font-size:16px">add_circle</span>Create "${esc(text)}" · <b>Enter</b></div>`;
        $('cp-quick-create').addEventListener('click',async()=>{await createFromPalette(text)});
      }
      return;
    }
    const q=raw.trim();
    const areaId=$('sr-area').value;const goalId=$('sr-goal').value;const status=$('sr-status').value;
    if(!q&&!areaId&&!goalId&&!status){$('sr-results').innerHTML='<div class="sr-empty">Type to search · <b>&gt;</b> commands · <b>/</b> quick create</div>';srIdx=-1;return}
    // Unified search: tasks + notes/goals/comments/inbox
    const hasFilters=areaId||goalId||status;
    let taskResults=[];let globalResults=[];
    if(hasFilters||q){let url='/api/tasks/search?q='+encodeURIComponent(q);
      if(areaId)url+='&area_id='+areaId;if(goalId)url+='&goal_id='+goalId;if(status)url+='&status='+status;
      taskResults=await api.get(url)}
    if(q&&!hasFilters){try{const gs=await api.get('/api/search?q='+encodeURIComponent(q));
      globalResults=(gs.results||[]).filter(r=>r.type!=='task')}catch{}}
    if(!taskResults.length&&!globalResults.length){$('sr-results').innerHTML='<div class="sr-empty">No results'+(q?' for "'+esc(q)+'"':'')+'</div>';srIdx=-1;return}
    let html='';
    if(globalResults.length){
      const typeIcons={note:'note',goal:'flag',comment:'comment',inbox:'inbox'};
      html+='<div class="cp-mode-label"><span class="material-icons-round">search</span>Other Results</div>';
      html+=globalResults.slice(0,5).map(r=>`<div class="sr-item sr-global" role="option" data-type="${r.type}" data-id="${r.source_id}">
        <span class="material-icons-round cp-icon">${typeIcons[r.type]||'article'}</span>
        <div><div class="sr-ti">${r.title||r.snippet||'Untitled'}</div>
        <div class="sr-mt">${r.type}${r.context?' · '+esc(r.context):''}</div></div></div>`).join('')}
    if(taskResults.length){if(globalResults.length)html+='<div class="cp-mode-label"><span class="material-icons-round">task_alt</span>Tasks</div>';
    const r=taskResults;
    html+=r.map((t,i)=>{
      const od=isOD(t.due_date)&&t.status!=='done';
      return`<div class="sr-item ${i===srIdx?'sel':''}" role="option" data-id="${t.id}">
        <div class="tk" style="width:14px;height:14px;border-width:1.5px;${t.status==='done'?'background:var(--ok);border-color:var(--ok)':''}"><span class="material-icons-round" style="font-size:9px;${t.status==='done'?'display:block':'display:none'}">check</span></div>
        <div class="sr-ti">${esc(t.title)}</div>
        <div class="sr-mt">${esc(t.area_icon||'')} ${esc(t.area_name||'')} › ${esc(t.goal_title||'')}${t.due_date?' · '+(od?'<span style="color:var(--err)">':'')+fmtDue(t.due_date)+(od?'</span>':''):''}</div>
      </div>`}).join('');
    srIdx=-1;
    }
    $('sr-results').innerHTML=html;
    $('sr-results').querySelectorAll('.sr-item:not(.sr-global)').forEach(it=>it.addEventListener('click',()=>{closeSearch();openDP(Number(it.dataset.id))}));
    $('sr-results').querySelectorAll('.sr-global').forEach(it=>it.addEventListener('click',()=>{
      const type=it.dataset.type;closeSearch();
      if(type==='note')go('notes');else if(type==='goal'&&activeAreaId)go('area');
      else if(type==='inbox')go('inbox');else go('all');
    }));
  },200);
}
$('sr-inp').addEventListener('input',runSearch);
$('sr-area').addEventListener('change',runSearch);
$('sr-goal').addEventListener('change',runSearch);
$('sr-status').addEventListener('change',runSearch);
$('sr-inp').addEventListener('keydown',async e=>{
  const items=$('sr-results').querySelectorAll('.sr-item');
  if(e.key==='ArrowDown'){e.preventDefault();srIdx=Math.min(srIdx+1,items.length-1);items.forEach((it,i)=>it.classList.toggle('sel',i===srIdx));items[srIdx]?.scrollIntoView({block:'nearest'})}
  else if(e.key==='ArrowUp'){e.preventDefault();srIdx=Math.max(srIdx-1,0);items.forEach((it,i)=>it.classList.toggle('sel',i===srIdx));items[srIdx]?.scrollIntoView({block:'nearest'})}
  else if(e.key==='Enter'){
    if($('sr-inp').value.startsWith('/')){e.preventDefault();await createFromPalette($('sr-inp').value.slice(1).trim());return}
    if(srIdx>=0&&items[srIdx]){
      if(cpMode){const cmd=CP_COMMANDS.find(c=>c.id===items[srIdx].dataset.cmd);if(cmd)cmd.action()}
      else{closeSearch();openDP(Number(items[srIdx].dataset.id))}
    }
  }
  else if(e.key==='Escape')closeSearch();
});

// ─── CREATE FROM COMMAND PALETTE ───
async function createFromPalette(text){
  if(!text)return;
  try{
    const parsed=await api.post('/api/tasks/parse',{text});
    // Find first goal to assign to
    const allGoals=await api.get('/api/goals');
    const goalId=parsed.goal_id||allGoals[0]?.id;
    if(!goalId){showToast('Create a goal first');closeSearch();return}
    await api.post('/api/goals/'+goalId+'/tasks',{
      title:parsed.title||text,
      priority:parsed.priority||0,
      due_date:parsed.due_date||null,
      my_day:parsed.my_day?1:0,
      tagIds:parsed.tag_ids||[]
    });
    closeSearch();showToast('Task created!');await loadAreas();render();loadOverdueBadge();
  }catch{
    // Fallback: create with raw text
    const allGoals=await api.get('/api/goals');
    if(!allGoals.length){showToast('Create a goal first');closeSearch();return}
    await api.post('/api/goals/'+allGoals[0].id+'/tasks',{title:text});
    closeSearch();showToast('Task created!');await loadAreas();render();loadOverdueBadge();
  }
}

// ─── QUICK CAPTURE ───
let allGoals=[];
async function openQuickCapture(){
  allGoals=await api.get('/api/goals');
  const sel=$('qc-goal');
  sel.innerHTML=allGoals.map(g=>`<option value="${g.id}">${esc(g.area_icon)} ${esc(g.area_name)} › ${esc(g.title)}</option>`).join('');
  if(!allGoals.length)sel.innerHTML='<option value="">No goals yet — create one first</option>';
  // Populate list picker
  const listSel=$('qc-list');
  listSel.innerHTML='<option value="">None</option>'+userLists.filter(l=>!l.parent_id).map(l=>{
    const subs=userLists.filter(s=>s.parent_id===l.id);
    let opts=`<option value="${l.id}">${esc(l.icon)} ${esc(l.name)}</option>`;
    subs.forEach(s=>{opts+=`<option value="${s.id}">&nbsp;&nbsp;↳ ${esc(s.icon)} ${esc(s.name)}</option>`});
    return opts;
  }).join('');
  $('qc-title').value='';$('qc-pri').value='0';$('qc-due').value='';$('qc-myday').checked=false;$('qc-list').value='';
  $('qc-ov').classList.add('active');$('qc-title').focus();
}
function closeQC(){$('qc-ov').classList.remove('active')}
$('qc-ov').addEventListener('click',e=>{if(e.target===$('qc-ov'))closeQC()});
$('qc-cancel').addEventListener('click',closeQC);
$('qc-save').addEventListener('click',saveQC);
$('qc-title').addEventListener('keydown',e=>{if(e.key==='Enter')saveQC()});
// NLP live preview on quick capture input
let nlpTimer=null,nlpParsed=null;
$('qc-title').addEventListener('input',()=>{
  clearTimeout(nlpTimer);
  const v=$('qc-title').value.trim();
  if(!v){$('qc-nlp-preview').innerHTML='';nlpParsed=null;return}
  nlpTimer=setTimeout(async()=>{
    try{
      const r=await api.post('/api/tasks/parse',{text:v});
      nlpParsed=r;
      let parts=[];
      if(r.due_date)parts.push('📅 '+r.due_date);
      if(r.priority>0)parts.push(['','⚪ Normal','🟡 High','🔴 Critical'][r.priority]);
      if(r.tags&&r.tags.length)parts.push(r.tags.map(t=>'#'+t).join(' '));
      if(r.my_day)parts.push('☀️ My Day');
      $('qc-nlp-preview').innerHTML=parts.length?'<span style="color:var(--txd);font-size:11px">→ '+esc(r.title)+'</span> '+parts.map(p=>'<span style="font-size:10px;background:var(--bg-c);padding:2px 6px;border-radius:8px;border:1px solid var(--brd)">'+p+'</span>').join(' '):'';
    }catch{nlpParsed=null;$('qc-nlp-preview').innerHTML=''}
  },300);
});
async function saveQC(){
  const goalId=Number($('qc-goal').value);
  if(!goalId)return;
  if(!validateField('qc-title',{required:true,maxlength:200,requiredMsg:'Please enter a task title'}))return;
  let title=$('qc-title').value.trim();
  // Use NLP parsed values as defaults, allow manual overrides
  let pri=Number($('qc-pri').value), due=$('qc-due').value||null, myday=$('qc-myday').checked;
  let tagIds=[];
  if(nlpParsed){
    title=nlpParsed.title||title;
    if(!Number($('qc-pri').value)&&nlpParsed.priority)pri=nlpParsed.priority;
    if(!$('qc-due').value&&nlpParsed.due_date)due=nlpParsed.due_date;
    if(nlpParsed.my_day)myday=true;
    // Resolve tags
    if(nlpParsed.tags&&nlpParsed.tags.length){
      for(const tn of nlpParsed.tags){
        let tg=allTags.find(t=>t.name===tn.toLowerCase());
        if(!tg){tg=await api.post('/api/tags',{name:tn.toLowerCase(),color:COLORS[allTags.length%COLORS.length]});await loadTags()}
        tagIds.push(tg.id);
      }
    }
  }
  const task=await api.post('/api/goals/'+goalId+'/tasks',{title,priority:pri,due_date:due,my_day:myday,list_id:$('qc-list').value?Number($('qc-list').value):null});
  if(tagIds.length)await api.put('/api/tasks/'+task.id+'/tags',{tagIds});
  nlpParsed=null;$('qc-nlp-preview').innerHTML='';
  closeQC();showToast('Task added');await loadAreas();render();loadOverdueBadge();
}
$('fab-btn').addEventListener('click',openQuickCapture);

// ─── OVERDUE ───
async function loadOverdueBadge(){
  const r=await api.get('/api/tasks/overdue');
  const badge=$('overdue-badge');
  badge.textContent=r.length;
  badge.style.display=r.length?'inline-block':'none';
  // Inbox badge
  const inbox=await api.get('/api/inbox');
  $('inbox-badge').textContent=inbox.length;
  $('inbox-badge').style.color=inbox.length?'var(--brand)':'';
}
async function renderOverdue(){
  const t=await api.get('/api/tasks/overdue');
  const c=$('ct');
  if(!t.length){c.innerHTML=emptyS('check_circle','All caught up!','No overdue tasks — you\'re on track');return}
  let h=`<div style="font-size:13px;color:var(--err);margin-bottom:14px;display:flex;align-items:center;gap:6px"><span class="material-icons-round" style="font-size:16px">warning</span>${t.length} task${t.length>1?'s':''} overdue</div>`;
  t.forEach(tk=>h+=tcHtml(tk,true));
  c.innerHTML=h;attachTE();
}

// ─── DASHBOARD ───
async function renderDashboard(){
  const [s,streakData,trends]=await Promise.all([api.get('/api/stats'),api.get('/api/stats/streaks'),api.get('/api/stats/trends')]);
  const c=$('ct');
  const pct=s.total?Math.round(s.done/s.total*100):0;
  let h=`<div class="streak-cards">
    <div class="streak-card"><div class="s-num">🔥 ${streakData.streak}</div><div class="s-label">Day Streak</div></div>
    <div class="streak-card"><div class="s-num">🏆 ${streakData.bestStreak}</div><div class="s-label">Best Streak</div></div>
    <div class="streak-card"><div class="s-num" style="color:var(--brand)">${s.thisWeek}</div><div class="s-label">This Week</div></div>
    <div class="streak-card"><div class="s-num" style="color:var(--warn)">${s.dueToday}</div><div class="s-label">Due Today</div></div>
  </div>`;
  // AI action bar
  h+=`<div style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap">
    <button class="btn-c ai-btn" id="ai-cognitive-load" style="font-size:11px;padding:5px 10px;border-color:var(--brand)"><span class="material-icons-round" style="font-size:14px;vertical-align:middle;margin-right:3px;color:var(--brand)">psychology</span>Cognitive Load</button>
    <button class="btn-c ai-btn" id="ai-life-balance" style="font-size:11px;padding:5px 10px;border-color:var(--brand)"><span class="material-icons-round" style="font-size:14px;vertical-align:middle;margin-right:3px;color:var(--brand)">donut_large</span>Life Balance</button>
    <button class="btn-c ai-btn" id="ai-year-review" style="font-size:11px;padding:5px 10px;border-color:var(--brand)"><span class="material-icons-round" style="font-size:14px;vertical-align:middle;margin-right:3px;color:var(--brand)">auto_awesome</span>Year Review</button>
  </div>`;
  h+=`<div class="ds-grid">
    <div class="ds-card clickable" data-go="all"><div class="ds-num">${s.total}</div><div class="ds-label">Total Tasks</div></div>
    <div class="ds-card clickable" data-go="logbook"><div class="ds-num" style="color:var(--ok)">${s.done}</div><div class="ds-label">Completed</div></div>
    <div class="ds-card clickable" data-go="overdue"><div class="ds-num" style="color:var(--err)">${s.overdue}</div><div class="ds-label">Overdue</div></div>
    <div class="ds-card clickable" data-go="myday"><div class="ds-num" style="color:var(--warn)">${s.dueToday}</div><div class="ds-label">Due Today</div></div>
    <div class="ds-card"><div class="ds-num" style="color:var(--brand)">${pct}%</div><div class="ds-label">Completion Rate</div></div>
  </div>`;
  // Productivity Trends chart
  if(trends&&trends.length){
    const maxT=Math.max(...trends.map(t=>t.completed),1);
    h+=`<div class="sl" style="margin-top:18px">Productivity Trends<span class="c">Last 8 weeks</span></div>`;
    h+=`<div class="trend-bar">`;
    trends.forEach(t=>{
      const pct=Math.round(t.completed/maxT*100);
      const wk=new Date(t.week_start);
      const label=(wk.getMonth()+1)+'/'+wk.getDate();
      h+=`<div class="trend-col"><div class="trend-fill" style="height:${pct}%"></div><div class="trend-label">${label}</div><div class="trend-val">${t.completed}</div></div>`;
    });
    h+=`</div>`;
  }
  h+=`<div class="hm-wrap"><div class="sl">Activity Heatmap<span class="c">365 days</span></div>`;
  h+=buildHeatmap(streakData.heatmap);
  h+=`</div>`;
  h+=`<div style="margin-bottom:22px;margin-top:18px"><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px"><span style="font-weight:600">Overall Progress</span><span style="color:var(--txd)">${s.done} / ${s.total}</span></div>
    <div style="height:10px;background:var(--bg-c);border:1px solid var(--brd);border-radius:5px;overflow:hidden"><div style="height:100%;width:${pct}%;background:var(--ok);border-radius:5px;transition:width .3s"></div></div></div>`;
  h+=`<div class="sl">By Life Area</div>`;
  s.byArea.forEach(a=>{
    const ap=a.total?Math.round(a.done/a.total*100):0;
    h+=`<div class="ds-area"><span style="font-size:20px">${esc(a.icon)}</span>
      <div class="ds-ainfo"><div class="ds-aname">${esc(a.name)}</div><div class="ds-aprog"><div class="ds-apbar" style="width:${ap}%;background:${escA(a.color)}"></div></div>
      <div class="ds-ameta">${a.done||0}/${a.total||0} tasks \u00b7 ${ap}%</div></div></div>`;
  });
  h+=`<div class="sl" style="margin-top:18px">By Priority</div><div style="display:flex;gap:8px;flex-wrap:wrap">`;
  const pNames=['None','Normal','High','Critical'];const pColors=['var(--txd)','var(--brand)','var(--warn)','var(--err)'];
  s.byPriority.forEach(p=>{
    h+=`<div style="background:var(--bg-c);border:1px solid var(--brd);border-radius:var(--rs);padding:10px 16px;flex:1;min-width:100px;text-align:center">
      <div style="font-size:18px;font-weight:700;color:${pColors[p.priority]}">${p.total||0}</div>
      <div style="font-size:10px;color:var(--txd)">${pNames[p.priority]}</div></div>`;
  });
  h+=`</div>`;
  if(s.recentDone&&s.recentDone.length){
    h+=`<div class="sl" style="margin-top:18px">Recently Completed</div>`;
    s.recentDone.forEach(t=>{
      const ago=t.completed_at?timeAgo(t.completed_at):'';
      h+=`<div style="display:flex;align-items:center;gap:8px;padding:6px 0;font-size:12px;border-bottom:1px solid var(--brd)">
        <span class="material-icons-round" style="font-size:16px;color:var(--ok)">check_circle</span>
        <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.title)}</span><span style="font-size:10px;color:var(--txd);flex-shrink:0">${esc(t.goal_title)} \u00b7 ${ago}</span></div>`;
    });
  }
  c.innerHTML=h;
  c.querySelectorAll('.ds-card.clickable').forEach(card=>card.addEventListener('click',()=>{go(card.dataset.go)}));
  c.querySelectorAll('.ds-area').forEach(el=>{el.addEventListener('click',()=>{
    const a=areas.find(x=>x.name===el.querySelector('.ds-aname')?.textContent);
    if(a){activeAreaId=a.id;activeGoalId=null;currentView='area';document.querySelectorAll('.ni,.ai').forEach(n=>n.classList.remove('active'));render()}
  })});
  // AI Dashboard buttons
  $('ai-cognitive-load')?.addEventListener('click',async()=>{
    const btn=$('ai-cognitive-load');
    if(btn)btn.disabled=true;
    try{
      const r=await api.post('/api/ai/cognitive-load',{});
      const d=r.data||r;
      const colors={light:'var(--ok)',moderate:'var(--brand)',heavy:'var(--warn)',overloaded:'var(--err)'};
      const msg=`Load: ${d.level||'?'} (${d.score||'?'}/10)${d.suggestions?.length?' — '+d.suggestions[0]:''}`;
      showToast(msg,null,8000);
    }catch(e){showToast(e.message||'AI unavailable','error')}
    finally{if(btn)btn.disabled=false}
  });
  $('ai-life-balance')?.addEventListener('click',async()=>{
    const btn=$('ai-life-balance');
    if(btn)btn.disabled=true;
    try{
      const r=await api.post('/api/ai/life-balance',{});
      const d=r.data||r;
      let msg=d.commentary||'';
      if(d.neglectedAreas?.length)msg+=` Neglected: ${d.neglectedAreas.map(a=>a.name).join(', ')}.`;
      showToast(msg||'Analysis complete',null,8000);
    }catch(e){showToast(e.message||'AI unavailable','error')}
    finally{if(btn)btn.disabled=false}
  });
  $('ai-year-review')?.addEventListener('click',async()=>{
    const btn=$('ai-year-review');
    if(btn){btn.disabled=true;btn.innerHTML='<span class="material-icons-round" style="font-size:14px;vertical-align:middle;animation:spin 1s linear infinite">sync</span> Generating...';}
    try{
      const r=await api.post('/api/ai/year-in-review',{year:new Date().getFullYear()});
      showAiYearReviewModal(r.data||r);
    }catch(e){showToast(e.message||'AI unavailable','error')}
    finally{if(btn){btn.disabled=false;btn.innerHTML='<span class="material-icons-round" style="font-size:14px;vertical-align:middle;margin-right:3px">auto_awesome</span>Year Review';}}
  });
}
function timeAgo(iso){const d=new Date(iso),n=Date.now(),s=Math.floor((n-d)/1e3);if(s<60)return'just now';if(s<3600)return Math.floor(s/60)+'m ago';if(s<86400)return Math.floor(s/3600)+'h ago';return Math.floor(s/86400)+'d ago'}

function buildHeatmap(data){
  const map={};data.forEach(d=>map[d.day]=d.count);
  const today=new Date();today.setHours(0,0,0,0);
  let h=`<div class="hm-grid">`;
  for(let i=364;i>=0;i--){
    const d=new Date(today);d.setDate(today.getDate()-i);
    const ds=_toDateStr(d);
    const cnt=map[ds]||0;
    let lvl='';if(cnt>=4)lvl='l4';else if(cnt>=3)lvl='l3';else if(cnt>=2)lvl='l2';else if(cnt>=1)lvl='l1';
    h+=`<div class="hm-cell ${lvl}" title="${ds}: ${cnt} task${cnt!==1?'s':''}"></div>`;
  }
  h+=`</div><div class="hm-legend">Less <div class="hm-cell" style="display:inline-block"></div><div class="hm-cell l1" style="display:inline-block"></div><div class="hm-cell l2" style="display:inline-block"></div><div class="hm-cell l3" style="display:inline-block"></div><div class="hm-cell l4" style="display:inline-block"></div> More</div>`;
  return h;
}

async function renderLogbook(){
  const c=$('ct');
  const r=await api.get('/api/activity?limit=100');
  if(!r.items||!r.items.length){c.innerHTML=emptyS('history','No completed tasks yet','Complete a task and it will appear here');return}
  // Group by day
  const groups={};
  r.items.forEach(t=>{
    const day=t.completed_at?t.completed_at.slice(0,10):'unknown';
    if(!groups[day])groups[day]=[];groups[day].push(t);
  });
  let h=`<div style="font-size:13px;color:var(--tx2);margin-bottom:16px">${r.total} task${r.total!==1?'s':''} completed</div>`;
  Object.entries(groups).forEach(([day,items])=>{
    const d=_parseDate(day);
    const label=fmtDue(day)||d.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'});
    h+=`<div class="al-day"><div class="al-dh">${label}<span class="al-c">${items.length}</span></div>`;
    items.forEach(t=>{
      const time=t.completed_at?new Date(t.completed_at).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}):'';
      h+=`<div class="al-item" data-id="${t.id}">
        <span class="material-icons-round" style="font-size:18px;color:var(--ok)">check_circle</span>
        <span class="al-t">${esc(t.title)}</span>
        <span class="al-meta">${esc(t.area_icon||'')} ${esc(t.area_name||'')} › ${esc(t.goal_title||'')}</span>
        <span class="al-time">${time}</span>
      </div>`;
    });
    h+=`</div>`;
  });
  c.innerHTML=h;
  c.querySelectorAll('.al-item').forEach(el=>el.addEventListener('click',()=>openDP(Number(el.dataset.id))));
}

// ─── FOCUS TIMER / POMODORO ───
let ftTask=null,ftInterval=null,ftRemaining=25*60,ftTotal=25*60,ftRunning=false,ftMode='focus',ftElapsed=0;
let ftSessionId=null,ftPlanSteps=[],ftActiveSteps=[],ftRating=0,ftScheduleTimer=null;
let ftWorker=null,ftUseWorker=false;
let ftTechnique='pomodoro'; // current selected technique
const FT_MODES={focus:{label:'Focus Time',dur:25*60},short:{label:'Short Break',dur:5*60},long:{label:'Long Break',dur:15*60}};

// Technique definitions
const FT_TECHNIQUES={
  pomodoro:{id:'pomodoro',icon:'🍅',name:'Pomodoro',desc:'Work in focused bursts with short breaks between.',tag:'Best for most tasks',dur:25,short:5,long:15,hasBreaks:true,skipPlan:false},
  deep:{id:'deep',icon:'🧠',name:'Deep Work',desc:'One long uninterrupted block for complex or creative tasks.',tag:'Complex & creative work',dur:60,short:0,long:0,hasBreaks:false,skipPlan:false},
  quick:{id:'quick',icon:'⚡',name:'Quick Start',desc:'Just 5 minutes — beat procrastination. Extend if you keep going.',tag:'Tasks you\'ve been avoiding',dur:5,short:0,long:0,hasBreaks:false,skipPlan:true},
  timebox:{id:'timebox',icon:'⏱️',name:'Timebox',desc:'Set your own duration. Great when you know how long you need.',tag:'You decide the time',dur:0,short:0,long:0,hasBreaks:false,skipPlan:false}
};

function requestFocusNotificationPermission(){
  if(typeof Notification==='undefined')return;
  if(Notification.permission==='default')Notification.requestPermission().catch(()=>{});
}

function playFocusCompletionChime(){
  try{
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC)return;
    const ctx=new AC();
    const now=ctx.currentTime;
    const notes=[880,1046.5,1318.5];
    notes.forEach((freq,i)=>{
      const osc=ctx.createOscillator();
      const gain=ctx.createGain();
      osc.type='sine';
      osc.frequency.value=freq;
      gain.gain.setValueAtTime(0.0001,now+i*0.12);
      gain.gain.exponentialRampToValueAtTime(0.12,now+i*0.12+0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001,now+i*0.12+0.11);
      osc.connect(gain);gain.connect(ctx.destination);
      osc.start(now+i*0.12);osc.stop(now+i*0.12+0.12);
    });
    setTimeout(()=>ctx.close().catch(()=>{}),700);
  }catch(e){}
}

function notifyFocusCompletion(){
  if(typeof Notification==='undefined')return;
  if(Notification.permission==='granted'&&ftTask){
    try{new Notification('Focus session complete',{body:ftTask.title,icon:'/manifest.json'})}catch(e){}
  }
}

function teardownFocusWorker(){
  if(ftWorker){
    try{ftWorker.postMessage({cmd:'stop'})}catch(e){}
    try{ftWorker.terminate()}catch(e){}
  }
  ftWorker=null;
  ftUseWorker=false;
}

function handleFocusTimerComplete(){
  clearInterval(ftInterval);
  teardownFocusWorker();
  ftRunning=false;
  playFocusCompletionChime();
  notifyFocusCompletion();
  if(ftMode==='focus'&&ftTask){
    if(ftTechnique==='quick'){
      $('ft-extend-bar').style.display='';
      $('ft-toggle').textContent='Start';
      $('ft-label').textContent='Time\'s up! Keep going?';
      updateFTDisplay();
      return;
    }
    api.put('/api/focus/'+ftSessionId+'/end',{duration_sec:ftElapsed});
    showReflection();
    return;
  }
  ftMode='focus';
  ftTotal=FT_MODES.focus.dur;
  ftRemaining=ftTotal;
  $('ft-label').textContent=FT_MODES.focus.label;
  $('ft-toggle').textContent='Start';
  $('ft-mode').textContent='Short Break';
  showToast('Break over! Ready to focus?');
}

function ensureFocusWorker(){
  if(typeof Worker==='undefined')return false;
  if(ftWorker)return true;
  try{
    ftWorker=new Worker('/timer-worker.js');
    ftUseWorker=true;
    ftWorker.onmessage=(event)=>{
      const msg=event.data||{};
      if(msg.type==='tick'){
        ftElapsed=Math.max(0,Math.floor((msg.elapsed||0)/1000));
        ftRemaining=Math.max(0,Math.ceil((msg.remaining||0)/1000));
        updateFTDisplay();
      }else if(msg.type==='complete'){
        ftRemaining=0;
        updateFTDisplay();
        handleFocusTimerComplete();
      }
    };
    ftWorker.onerror=()=>{
      const wasRunning=ftRunning;
      teardownFocusWorker();
      showToast('Timer worker unavailable. Using standard timer.');
      if(wasRunning){
        ftInterval=setInterval(()=>{
          ftRemaining--;ftElapsed++;
          if(ftRemaining<=0){
            handleFocusTimerComplete();
            return;
          }
          updateFTDisplay();
        },1000);
      }
    };
    return true;
  }catch(e){
    teardownFocusWorker();
    return false;
  }
}

// Remember last technique per area
function getLastTechnique(areaId){
  try{const v=localStorage.getItem('ft_tech_'+areaId);if(v&&FT_TECHNIQUES[v])return v}catch(e){}
  return null;
}
function saveLastTechnique(areaId,tech){
  try{localStorage.setItem('ft_tech_'+areaId,tech)}catch(e){}
}

function startFocusTimer(taskId){
  applySettingsToTimer();
  let tk=tasks.find(t=>t.id===taskId);
  if(!tk||!tk.subtasks){
    // Fetch full task with subtasks from individual endpoint
    api.get('/api/tasks/'+taskId).then(t=>{ftTask=t;showTechniquePicker()}).catch(()=>{});
    return;
  }
  ftTask=tk;showTechniquePicker();
}

// Technique picker screen
function showTechniquePicker(){
  if(!ftTask)return;
  ftTechnique=null;
  $('ft-pick-task').textContent=ftTask.title;

  // Determine smart default — last used for this area, or suggest quick for stale tasks
  const areaId=ftTask.area_id||ftTask.goal_id||0;
  let recommended=getLastTechnique(areaId)||'pomodoro';
  // If task is stale (created 3+ days ago, never done), suggest quick start
  if(ftTask.created_at){
    const age=(Date.now()-new Date(ftTask.created_at).getTime())/(1000*60*60*24);
    if(age>=3&&ftTask.status==='todo')recommended='quick';
  }

  const grid=$('ft-tech-grid');
  grid.innerHTML=Object.values(FT_TECHNIQUES).map(t=>{
    const isRec=t.id===recommended;
    return `<div class="ft-tech-card${isRec?' recommended':''}" data-tech="${t.id}">
      <div class="ft-tech-icon">${t.icon}</div>
      <div class="ft-tech-name">${t.name}${t.dur?` <span style="opacity:.5;font-weight:400;font-size:11px">${t.dur}min</span>`:''}</div>
      <div class="ft-tech-desc">${t.desc}</div>
      <span class="ft-tech-tag">${isRec?'✦ Suggested':t.tag}</span>
    </div>`;
  }).join('');

  // Contextual why-suggested hint
  let pickHint='Pick a technique to get started';
  const lastTech=getLastTechnique(areaId);
  if(recommended==='quick'){
    const age=ftTask.created_at?Math.floor((Date.now()-new Date(ftTask.created_at).getTime())/(1000*60*60*24)):0;
    pickHint=age>=3?`This task has been waiting ${age} days — a quick 5-min start beats procrastination!`:'This task has been waiting — try Quick Start!';
  } else if(lastTech&&lastTech===recommended){
    pickHint=`You used ${FT_TECHNIQUES[lastTech].name} last time for this area.`;
  }
  $('ft-pick-hint').textContent=pickHint;

  // Render subtasks if available
  const subsEl=$('ft-pick-subs');
  if(ftTask.subtasks&&ftTask.subtasks.length){
    subsEl.style.display='';
    subsEl.innerHTML=`<div style="font-size:11px;color:var(--txd);margin-bottom:4px">Subtasks</div>`+ftTask.subtasks.map(s=>
      `<div class="ft-pick-sub${s.done?' done':''}" data-sid="${s.id}"><div class="ft-pick-sub-chk">${s.done?'✓':''}</div><span class="ft-pick-sub-text">${esc(s.title)}</span></div>`
    ).join('');
    subsEl.querySelectorAll('.ft-pick-sub').forEach(el=>el.addEventListener('click',async()=>{
      const sid=Number(el.dataset.sid);
      const sub=ftTask.subtasks.find(x=>x.id===sid);
      if(!sub)return;
      const newDone=sub.done?0:1;
      await api.put('/api/subtasks/'+sid,{done:newDone});
      sub.done=newDone;
      el.classList.toggle('done',!!newDone);
      el.querySelector('.ft-pick-sub-chk').textContent=newDone?'✓':'';
    }));
  } else {
    subsEl.style.display='none';
    subsEl.innerHTML='';
  }

  grid.querySelectorAll('.ft-tech-card').forEach(card=>{
    card.addEventListener('click',()=>{
      const tech=card.dataset.tech;
      ftTechnique=tech;
      const aId=ftTask.area_id||ftTask.goal_id||0;
      saveLastTechnique(aId,tech);

      const t=FT_TECHNIQUES[tech];
      // Apply technique-specific timer config
      if(tech==='pomodoro'){
        applySettingsToTimer(); // use user's custom pomodoro settings
      } else if(tech==='deep'){
        FT_MODES.focus.dur=t.dur*60;FT_MODES.short.dur=0;FT_MODES.long.dur=0;
      } else if(tech==='quick'){
        FT_MODES.focus.dur=t.dur*60;FT_MODES.short.dur=0;FT_MODES.long.dur=0;
      } else if(tech==='timebox'){
        // Will be set by user in plan phase
        FT_MODES.focus.dur=30*60;FT_MODES.short.dur=0;FT_MODES.long.dur=0;
      }

      if(t.skipPlan){
        // Quick Start: skip planning, go straight to timer
        quickStartSession();
      } else {
        showFocusPlan();
      }
    });
  });

  $('ft-pick').style.display='';
  $('ft-plan').style.display='none';
  $('ft-timer').style.display='none';
  $('ft-reflect').style.display='none';
  $('ft-ov').classList.add('active');
}

$('ft-pick-cancel').addEventListener('click',()=>{
  ftTask=null;$('ft-ov').classList.remove('active');
});

// Quick Start: create session immediately and start 5-min timer
async function quickStartSession(){
  if(!ftTask)return;
  const sess=await api.post('/api/focus',{task_id:ftTask.id,duration_sec:0,type:'quick'});
  ftSessionId=sess.id;
  ftActiveSteps=[];
  // Auto-populate steps from subtasks (but don't require planning)
  if(ftTask.subtasks&&ftTask.subtasks.length){
    const steps=ftTask.subtasks.filter(s=>!s.done).map(s=>s.title);
    if(steps.length)ftActiveSteps=await api.post('/api/focus/'+sess.id+'/steps',{steps});
  }
  showFocusUI();
}

// Pre-session planning panel
function showFocusPlan(){
  if(!ftTask)return;
  ftPlanSteps=[];ftRating=0;ftSessionId=null;
  $('ft-plan-task').textContent=ftTask.title;
  $('ft-intention').value='';
  $('ft-step-input').value='';
  $('ft-reflection').value='';
  $('ft-schedule-row').style.display='none';
  document.querySelectorAll('.ft-when').forEach(b=>b.classList.remove('active'));
  $('ft-when-now').classList.add('active');
  // Set default schedule time to next hour
  const now=new Date();now.setHours(now.getHours()+1,0,0,0);
  $('ft-schedule-time').value=_toDateStr(now)+'T'+String(now.getHours()).padStart(2,'0')+':00';
  // Auto-populate steps from subtasks
  if(ftTask.subtasks&&ftTask.subtasks.length){
    ftPlanSteps=ftTask.subtasks.filter(s=>!s.done).map(s=>s.title);
  }
  renderPlanSteps();

  // Show technique badge and timebox duration input
  const tech=FT_TECHNIQUES[ftTechnique]||FT_TECHNIQUES.pomodoro;
  const badge=$('ft-plan-technique');
  if(badge){
    badge.innerHTML=`<span style="font-size:16px;vertical-align:middle">${tech.icon}</span> ${tech.name}${tech.dur?' <span style="opacity:.5">(${tech.dur}min)</span>':''} <span style="font-size:10px;opacity:.4">↺ change</span>`;
    badge.onclick=()=>showTechniquePicker();
  }
  const tbRow=$('ft-timebox-row');
  if(tbRow)tbRow.style.display=ftTechnique==='timebox'?'':'none';
  const tbInput=$('ft-timebox-dur');
  if(tbInput)tbInput.value='30';

  $('ft-pick').style.display='none';
  $('ft-plan').style.display='';
  $('ft-timer').style.display='none';
  $('ft-reflect').style.display='none';
  $('ft-ov').classList.add('active');
}

function renderPlanSteps(){
  const c=$('ft-plan-steps');
  if(!ftPlanSteps.length){c.innerHTML='<div style="font-size:11px;color:rgba(255,255,255,.3);padding:4px 6px">No steps yet — add some or skip</div>';return}
  c.innerHTML=ftPlanSteps.map((s,i)=>`<div class="ft-plan-step"><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s)}</span><span class="ft-plan-step-rm material-icons-round" data-i="${i}">close</span></div>`).join('');
  c.querySelectorAll('.ft-plan-step-rm').forEach(b=>b.addEventListener('click',()=>{ftPlanSteps.splice(Number(b.dataset.i),1);renderPlanSteps()}));
}

$('ft-step-add').addEventListener('click',()=>{
  const v=$('ft-step-input').value.trim();if(!v)return;
  ftPlanSteps.push(v);$('ft-step-input').value='';renderPlanSteps();
});
$('ft-step-input').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('ft-step-add').click()}});

// Schedule toggle
document.querySelectorAll('.ft-when').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('.ft-when').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  $('ft-schedule-row').style.display=b.dataset.when==='later'?'':'none';
  $('ft-plan-go').textContent=b.dataset.when==='later'?'Schedule':'Begin Focus';
}));

$('ft-plan-cancel').addEventListener('click',()=>{
  ftTask=null;$('ft-ov').classList.remove('active');
});

// Begin focus or schedule
$('ft-plan-go').addEventListener('click',async()=>{
  if(!ftTask)return;
  const isSchedule=document.querySelector('.ft-when.active')?.dataset.when==='later';
  const intention=$('ft-intention').value.trim();
  const scheduledAt=isSchedule?$('ft-schedule-time').value:null;

  const sessType=ftTechnique||'pomodoro';
  // Apply timebox duration if applicable
  if(sessType==='timebox'){
    const dur=parseInt($('ft-timebox-dur').value)||30;
    FT_MODES.focus.dur=Math.max(5,Math.min(180,dur))*60;
  }

  if(isSchedule&&scheduledAt){
    // Create session with scheduled_at, don't start timer
    const sess=await api.post('/api/focus',{task_id:ftTask.id,duration_sec:0,type:sessType,scheduled_at:scheduledAt});
    ftSessionId=sess.id;
    if(intention||ftPlanSteps.length){
      await api.post('/api/focus/'+sess.id+'/meta',{intention,steps_planned:ftPlanSteps.length,strategy:sessType});
    }
    if(ftPlanSteps.length){
      await api.post('/api/focus/'+sess.id+'/steps',{steps:ftPlanSteps});
    }
    // Set browser notification
    const schedDate=new Date(scheduledAt);
    const delay=schedDate.getTime()-Date.now();
    if(delay>0){
      if(Notification.permission==='default')Notification.requestPermission();
      ftScheduleTimer=setTimeout(()=>{
        if(Notification.permission==='granted'){
          new Notification('Time to focus!',{body:ftTask.title,icon:'/manifest.json'});
        }
        showToast('Scheduled focus session: '+ftTask.title);
      },delay);
    }
    showToast('Focus session scheduled for '+schedDate.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}));
    ftTask=null;$('ft-ov').classList.remove('active');
    return;
  }

  // Start immediately — create session
  const sess=await api.post('/api/focus',{task_id:ftTask.id,duration_sec:0,type:sessType});
  ftSessionId=sess.id;
  if(intention||ftPlanSteps.length){
    await api.post('/api/focus/'+sess.id+'/meta',{intention,steps_planned:ftPlanSteps.length,strategy:sessType});
  }
  if(ftPlanSteps.length){
    ftActiveSteps=await api.post('/api/focus/'+sess.id+'/steps',{steps:ftPlanSteps});
  } else {
    ftActiveSteps=[];
  }
  showFocusUI();
});

function showFocusUI(){
  if(!ftTask)return;
  teardownFocusWorker();
  ftMode='focus';ftTotal=FT_MODES.focus.dur;ftRemaining=ftTotal;ftRunning=false;ftElapsed=0;
  requestFocusNotificationPermission();
  $('ft-task').textContent=ftTask.title;
  const tech=FT_TECHNIQUES[ftTechnique]||FT_TECHNIQUES.pomodoro;
  $('ft-label').textContent=ftTechnique==='deep'?'Deep Focus':ftTechnique==='quick'?'Quick Start — 5min':ftTechnique==='timebox'?'Timebox':FT_MODES.focus.label;
  $('ft-toggle').textContent='Start';
  // Show break mode button only for pomodoro
  $('ft-mode').style.display=tech.hasBreaks?'':'none';
  $('ft-mode').textContent='Short Break';
  // Hide extend bar initially
  $('ft-extend-bar').style.display='none';
  renderFTSteps();
  updateFTDisplay();
  $('ft-pick').style.display='none';
  $('ft-plan').style.display='none';
  $('ft-timer').style.display='';
  $('ft-reflect').style.display='none';
}

function renderFTSteps(){
  const c=$('ft-steps');
  if(!ftActiveSteps||!ftActiveSteps.length){c.innerHTML='';return}
  c.innerHTML=ftActiveSteps.map(s=>`<div class="ft-step-item ${s.done?'done':''}" data-sid="${s.id}"><div class="ft-step-chk">${s.done?'✓':''}</div><span>${esc(s.text)}</span></div>`).join('');
  c.querySelectorAll('.ft-step-item').forEach(el=>el.addEventListener('click',async()=>{
    const sid=Number(el.dataset.sid);
    const updated=await api.put('/api/focus/steps/'+sid);
    const idx=ftActiveSteps.findIndex(s=>s.id===sid);
    if(idx>=0)ftActiveSteps[idx]=updated;
    renderFTSteps();
  }));
}

function updateFTDisplay(){
  const m=Math.floor(ftRemaining/60),s=ftRemaining%60;
  $('ft-display').textContent=String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
  const pct=ftTotal>0?(ftTotal-ftRemaining)/ftTotal:0;
  $('ft-arc').setAttribute('stroke-dashoffset',String(628.32*(1-pct)));
  $('ft-arc').setAttribute('stroke',ftMode==='focus'?'var(--brand)':'var(--ok)');
}
$('ft-toggle').addEventListener('click',()=>{
  if(ftRunning){
    if(ftUseWorker&&ftWorker)ftWorker.postMessage({cmd:'pause'});
    else clearInterval(ftInterval);
    ftRunning=false;
    $('ft-toggle').textContent='Resume';
  } else {
    ftRunning=true;$('ft-toggle').textContent='Pause';
    if(ensureFocusWorker()){
      if(ftElapsed>0)ftWorker.postMessage({cmd:'resume'});
      else ftWorker.postMessage({cmd:'start',duration:ftRemaining*1000});
      return;
    }
    ftInterval=setInterval(()=>{
      ftRemaining--;ftElapsed++;
      if(ftRemaining<=0){
        handleFocusTimerComplete();
        return;
      }
      updateFTDisplay();
    },1000);
  }
});
$('ft-mode').addEventListener('click',()=>{
  clearInterval(ftInterval);teardownFocusWorker();ftRunning=false;
  if(ftMode==='focus'){
    ftMode='short';ftTotal=FT_MODES.short.dur;$('ft-mode').textContent='Long Break';
  } else if(ftMode==='short'){
    ftMode='long';ftTotal=FT_MODES.long.dur;$('ft-mode').textContent='Focus (25m)';
  } else {
    ftMode='focus';ftTotal=FT_MODES.focus.dur;$('ft-mode').textContent='Short Break';
  }
  ftRemaining=ftTotal;$('ft-label').textContent=FT_MODES[ftMode].label;$('ft-toggle').textContent='Start';
  updateFTDisplay();
});
$('ft-stop').addEventListener('click',()=>{
  clearInterval(ftInterval);
  teardownFocusWorker();
  if(ftMode==='focus'&&ftElapsed>30&&ftTask&&ftSessionId){
    api.put('/api/focus/'+ftSessionId+'/end',{duration_sec:ftElapsed});
    showReflection();
    return;
  }
  ftRunning=false;ftElapsed=0;ftTask=null;ftSessionId=null;ftActiveSteps=[];
  $('ft-ov').classList.remove('active');
});

// Quick Start extend bar handlers
$('ft-extend-bar').querySelectorAll('[data-extend]').forEach(btn=>btn.addEventListener('click',()=>{
  const val=btn.dataset.extend;
  if(val==='done'){
    // End session and reflect
    $('ft-extend-bar').style.display='none';
    api.put('/api/focus/'+ftSessionId+'/end',{duration_sec:ftElapsed});
    showReflection();
  } else {
    // Extend by N minutes
    const mins=parseInt(val);
    ftTotal=mins*60;ftRemaining=mins*60;
    $('ft-extend-bar').style.display='none';
    $('ft-label').textContent='Quick Start — +'+mins+'min';
    updateFTDisplay();
    // Auto-start the extended timer
    ftRunning=true;$('ft-toggle').textContent='Pause';
    ftInterval=setInterval(()=>{
      ftRemaining--;ftElapsed++;
      if(ftRemaining<=0){
        clearInterval(ftInterval);ftRunning=false;
        $('ft-extend-bar').style.display='';
        $('ft-toggle').textContent='Start';
        $('ft-label').textContent='Time\'s up! Keep going?';
      }
      updateFTDisplay();
    },1000);
  }
}));

// Post-session reflection
function showReflection(){
  const mins=Math.floor(ftElapsed/60);
  const completed=ftActiveSteps.filter(s=>s.done).length;
  const total=ftActiveSteps.length;
  const tech=FT_TECHNIQUES[ftTechnique]||FT_TECHNIQUES.pomodoro;
  $('ft-reflect-title').textContent=ftTechnique==='quick'?'Nice start!':ftTechnique==='deep'?'Deep session done!':'Session Complete!';
  $('ft-reflect-summary').textContent=tech.icon+' '+mins+'m focused'+(total?' · '+completed+'/'+total+' steps done':'');
  ftRating=0;
  document.querySelectorAll('.ft-rate').forEach(b=>b.classList.remove('active'));
  $('ft-reflection').value='';
  $('ft-plan').style.display='none';
  $('ft-timer').style.display='none';
  $('ft-reflect').style.display='';
  showToast('Focus session complete! '+mins+'m logged');
  // Gentle reflection nudge — update Done button to hint at rating
  updateReflectDoneLabel();
}

function updateReflectDoneLabel(){
  const btn=$('ft-reflect-done');
  if(ftRating>0){btn.textContent='Done';btn.style.opacity='1'}
  else{btn.textContent='Skip Reflection';btn.style.opacity='.7'}
}

document.querySelectorAll('.ft-rate').forEach(b=>b.addEventListener('click',()=>{
  ftRating=Number(b.dataset.rate);
  document.querySelectorAll('.ft-rate').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  updateReflectDoneLabel();
}));

$('ft-reflect-done').addEventListener('click',async()=>{
  if(ftSessionId){
    const completed=ftActiveSteps.filter(s=>s.done).length;
    await api.post('/api/focus/'+ftSessionId+'/meta',{
      reflection:$('ft-reflection').value.trim()||null,
      focus_rating:ftRating,
      steps_completed:completed
    });
  }
  ftRunning=false;ftElapsed=0;ftTask=null;ftSessionId=null;ftActiveSteps=[];
  $('ft-ov').classList.remove('active');
  if(currentView==='focus')renderFocusHistory();
});

$('ft-reflect-continue').addEventListener('click',async()=>{
  if(ftSessionId&&ftRating){
    const completed=ftActiveSteps.filter(s=>s.done).length;
    await api.post('/api/focus/'+ftSessionId+'/meta',{
      reflection:$('ft-reflection').value.trim()||null,
      focus_rating:ftRating,
      steps_completed:completed
    });
  }
  // Start break (pomodoro) or new focus round
  ftElapsed=0;
  const tech=FT_TECHNIQUES[ftTechnique]||FT_TECHNIQUES.pomodoro;
  if(tech.hasBreaks){
    ftMode='short';ftTotal=FT_MODES.short.dur;ftRemaining=ftTotal;
    $('ft-label').textContent=FT_MODES.short.label;
    $('ft-toggle').textContent='Start Break';
    $('ft-mode').textContent='Focus (25m)';
  } else {
    // Non-pomodoro: go straight back to focus
    ftMode='focus';ftTotal=FT_MODES.focus.dur;ftRemaining=ftTotal;
    $('ft-label').textContent=ftTechnique==='deep'?'Deep Focus':ftTechnique==='quick'?'Quick Start — 5min':'Timebox';
    $('ft-toggle').textContent='Start';
    $('ft-mode').style.display='none';
  }
  $('ft-plan').style.display='none';
  $('ft-timer').style.display='';
  $('ft-reflect').style.display='none';
  // Create new session for next focus round
  if(ftTask){
    const sessType=ftTechnique||'pomodoro';
    const sess=await api.post('/api/focus',{task_id:ftTask.id,duration_sec:0,type:sessType});
    ftSessionId=sess.id;
  }
  updateFTDisplay();
});

// ─── MARKDOWN NOTE RENDERER ───
function renderMd(text){
  if(!text)return'';
  let h=esc(text);
  h=h.replace(/```([\s\S]*?)```/g,(m,c)=>'<pre><code>'+c.trim()+'</code></pre>');
  h=h.replace(/`([^`]+)`/g,'<code>$1</code>');
  h=h.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');
  h=h.replace(/\*(.+?)\*/g,'<em>$1</em>');
  h=h.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,(m,label,url)=>{
    try{const u=new URL(url);if(u.protocol!=='http:'&&u.protocol!=='https:')return esc(label);return'<a href="'+escA(url)+'" target="_blank" rel="noopener">'+label+'</a>'}catch(e){return esc(label)}
  });
  h=h.replace(/^### (.+)$/gm,'<h3>$1</h3>');
  h=h.replace(/^## (.+)$/gm,'<h2>$1</h2>');
  h=h.replace(/^# (.+)$/gm,'<h1>$1</h1>');
  h=h.replace(/^&gt; (.+)$/gm,'<blockquote>$1</blockquote>');
  h=h.replace(/^- (.+)$/gm,'<li>$1</li>');
  h=h.replace(/(<li>[\s\S]*?<\/li>)/g,m=>'<ul>'+m+'</ul>');
  h=h.replace(/\n/g,'<br>');
  return h;
}

// ─── EXPORT ───
$('export-btn')?.addEventListener('click',async()=>{
  const a=document.createElement('a');
  a.href='/api/export';a.download='lifeflow-export.json';
  document.body.appendChild(a);a.click();document.body.removeChild(a);
});

// ─── IMPORT ───
$('import-btn')?.addEventListener('click',()=>$('import-file').click());
$('import-file').addEventListener('change',async e=>{
  const file=e.target.files[0];if(!file)return;
  try{
    const text=await file.text();
    const data=JSON.parse(text);
    if(!data.areas||!data.goals||!data.tasks){showToast('Invalid file: missing areas, goals, or tasks');return}
    if(!confirm(`Import ${data.areas.length} areas, ${data.goals.length} goals, ${data.tasks.length} tasks? This will REPLACE all current data.`))return;
    const r=await api.post('/api/import',data);
    if(r.ok){showToast('Import successful!');await loadAreas();await loadTags();render()}
    else showToast('Import failed: '+(r.error||'Unknown error'));
  }catch(err){showToast('Import failed: '+err.message)}
  $('import-file').value='';
});

// ─── TAG MANAGEMENT VIEW ───
async function renderTags(){
  const tags=await api.get('/api/tags/stats');
  const c=$('ct');
  let h=`<div class="qa"><input type="text" id="new-tag-name" placeholder="New tag name..."><button id="new-tag-btn"><span class="material-icons-round" style="font-size:15px">add</span>Add Tag</button></div>`;
  if(!tags.length){h+=emptyS('label','No tags yet','Create tags to categorize tasks');c.innerHTML=h;attachNewTag();return}
  h+=`<div style="display:grid;gap:8px;margin-top:8px">`;
  tags.forEach(t=>{
    h+=`<div class="tc" style="cursor:default;padding:10px 12px;display:flex;align-items:center;gap:10px" data-tag-id="${t.id}">
      <div class="swatch-pick" data-tid="${t.id}" style="width:22px;height:22px;border-radius:50%;cursor:pointer;flex-shrink:0;border:2.5px solid ${escA(t.color)};background:transparent;display:flex;align-items:center;justify-content:center" title="Change color"><div style="width:10px;height:10px;border-radius:50%;background:${escA(t.color)}"></div></div>
      <input type="text" class="tag-name-inp" data-tid="${t.id}" value="${escA(t.name)}" style="flex:1;border:1px solid var(--brd);border-radius:6px;padding:5px 10px;font-size:13px;background:var(--bg-c);color:var(--tx)">
      <span style="font-size:11px;color:var(--tx2);white-space:nowrap">${t.usage_count} task${t.usage_count!==1?'s':''}</span>
      <button class="material-icons-round tag-save" data-tid="${t.id}" style="font-size:18px;color:var(--brand);cursor:pointer;border:none;background:none" title="Save">check</button>
      <button class="material-icons-round tag-del" data-tid="${t.id}" style="font-size:18px;color:var(--err);cursor:pointer;border:none;background:none" title="Delete">delete_outline</button>
    </div>`;
  });
  h+=`</div>`;
  // Color picker popover
  h+=`<div id="tag-color-picker" style="display:none;position:fixed;z-index:200;background:var(--crd);border:1px solid var(--bd);border-radius:8px;padding:8px;box-shadow:0 4px 12px rgba(0,0,0,.15)">
    <div style="display:flex;gap:4px;flex-wrap:wrap;max-width:160px">${COLORS.map(cl=>`<div class="sw tcp-sw" data-c="${cl}" tabindex="0" role="button" aria-label="Color ${cl}" style="background:${cl};cursor:pointer"></div>`).join('')}</div>
  </div>`;
  c.innerHTML=h;
  attachNewTag();
  let pickingTagId=null;
  // Color picker
  c.querySelectorAll('.swatch-pick').forEach(sw=>sw.addEventListener('click',e=>{
    e.stopPropagation();
    pickingTagId=Number(sw.dataset.tid);
    const picker=$('tag-color-picker');
    const rect=sw.getBoundingClientRect();
    picker.style.left=rect.right+8+'px';picker.style.top=rect.top+'px';picker.style.display='block';
  }));
  document.querySelectorAll('.tcp-sw').forEach(sw=>{
    async function pickColor(){
    if(!pickingTagId)return;
    await api.put('/api/tags/'+pickingTagId,{color:sw.dataset.c});
    $('tag-color-picker').style.display='none';pickingTagId=null;renderTags();
    }
    sw.addEventListener('click',pickColor);
    sw.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();pickColor()}});
  });
  document.addEventListener('click',e=>{if(!e.target.closest('#tag-color-picker')&&!e.target.classList.contains('swatch-pick'))$('tag-color-picker').style.display='none'},{once:false});
  // Save name
  c.querySelectorAll('.tag-save').forEach(btn=>btn.addEventListener('click',async()=>{
    const tid=Number(btn.dataset.tid);
    const inp=c.querySelector(`.tag-name-inp[data-tid="${tid}"]`);
    if(!inp)return;
    const r=await api.put('/api/tags/'+tid,{name:inp.value});
    if(r.error){showToast(r.error)}else{showToast('Tag updated');await loadTags();renderTags()}
  }));
  // Delete
  c.querySelectorAll('.tag-del').forEach(btn=>btn.addEventListener('click',async()=>{
    const tid=Number(btn.dataset.tid);
    if(!confirm('Delete this tag?'))return;
    await api.del('/api/tags/'+tid);showToast('Tag deleted');await loadTags();renderTags();
  }));
  // Enter key to save
  c.querySelectorAll('.tag-name-inp').forEach(inp=>inp.addEventListener('keydown',e=>{
    if(e.key==='Enter'){c.querySelector(`.tag-save[data-tid="${inp.dataset.tid}"]`)?.click()}
  }));
}
function attachNewTag(){
  const inp=$('new-tag-name'),btn=$('new-tag-btn');if(!inp||!btn)return;
  const add=async()=>{const n=inp.value.trim();if(!n)return;await api.post('/api/tags',{name:n});inp.value='';await loadTags();renderTags()};
  btn.addEventListener('click',add);inp.addEventListener('keydown',e=>{if(e.key==='Enter')add()});
}

// ─── FOCUS SESSION HISTORY VIEW ───
async function renderFocusHistory(target){
  const [hist,stats]=await Promise.all([api.get('/api/focus/history'),api.get('/api/focus/stats')]);
  const c=target||$('ct');
  let h='';
  // Stats bar
  h+=`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:16px">
    <div class="tc" style="padding:14px;text-align:center"><div style="font-size:24px;font-weight:700;color:var(--brand)">${Math.floor(stats.today/60)}m</div><div style="font-size:11px;color:var(--tx2)">Today</div></div>
    <div class="tc" style="padding:14px;text-align:center"><div style="font-size:24px;font-weight:700;color:var(--brand)">${Math.floor(stats.week/60)}m</div><div style="font-size:11px;color:var(--tx2)">This Week</div></div>
    <div class="tc" style="padding:14px;text-align:center"><div style="font-size:24px;font-weight:700;color:var(--brand)">${stats.sessions}</div><div style="font-size:11px;color:var(--tx2)">Sessions Today</div></div>
  </div>`;
  // Daily chart (last 14 days)
  if(hist.daily&&hist.daily.length){
    const maxSec=Math.max(...hist.daily.map(d=>d.total_sec),1);
    h+=`<div class="sl">Last 14 Days</div>`;
    h+=`<div style="display:flex;align-items:flex-end;gap:4px;height:100px;margin-bottom:16px;padding:8px;background:var(--crd);border-radius:8px">`;
    // Fill in missing days
    const days=[];const now=new Date();
    for(let i=13;i>=0;i--){const d=new Date(now);d.setDate(d.getDate()-i);days.push(_toDateStr(d))}
    days.forEach(day=>{
      const entry=hist.daily.find(d=>d.day===day);
      const sec=entry?entry.total_sec:0;
      const pct=Math.max(2,sec/maxSec*100);
      const lbl=_parseDate(day).toLocaleDateString('en-US',{weekday:'short'});
      h+=`<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px">
        <div style="width:100%;background:${sec>0?'var(--brand)':'var(--bd)'};border-radius:3px;height:${pct}%;min-height:2px" title="${Math.floor(sec/60)}m on ${day}"></div>
        <span style="font-size:9px;color:var(--tx2)">${lbl.slice(0,2)}</span>
      </div>`;
    });
    h+=`</div>`;
  }
  // Top tasks this week
  if(stats.byTask&&stats.byTask.length){
    h+=`<div class="sl">Top Tasks This Week</div>`;
    stats.byTask.forEach(t=>{
      h+=`<div class="tc" style="padding:8px 12px;margin-bottom:4px;display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:13px">${esc(t.title)}</span>
        <span style="font-size:12px;color:var(--tx2)">${Math.floor(t.total_sec/60)}m · ${t.sessions} session${t.sessions!==1?'s':''}</span>
      </div>`;
    });
  }
  // Session list
  h+=`<div class="sl" style="margin-top:12px">Recent Sessions</div>`;
  if(!hist.items||!hist.items.length){h+=emptyS('timer','No focus sessions','Use the Pomodoro timer to track focus')}
  else{hist.items.forEach(s=>{
    const dt=new Date(s.started_at);
    h+=`<div class="tc" style="padding:8px 12px;margin-bottom:4px;display:flex;justify-content:space-between;align-items:center">
      <div style="min-width:0;overflow:hidden"><span style="font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block">${esc(s.task_title)}</span><br><span style="font-size:11px;color:var(--tx2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block">${esc(s.area_name)} → ${esc(s.goal_title)}</span></div>
      <div style="text-align:right;flex-shrink:0"><span style="font-size:13px;font-weight:500">${Math.floor(s.duration_sec/60)}m</span><br><span style="font-size:11px;color:var(--tx2)">${dt.toLocaleDateString('en-US',{month:'short',day:'numeric'})} ${dt.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}</span></div>
    </div>`;
  })}
  c.innerHTML=h;
}

// ─── TEMPLATES ───
async function renderTemplates(){
  const tmpls=await api.get('/api/templates');
  const c=$('ct');
  let h='<div class="tmpl-grid">';
  // "Create new" card
  h+=`<div class="tmpl-card" id="tmpl-new" style="border-style:dashed;display:flex;align-items:center;justify-content:center;min-height:140px;flex-direction:column;gap:8px;opacity:.6">
    <span class="material-icons-round" style="font-size:36px;color:var(--brand)">add_circle_outline</span>
    <span style="font-size:13px;font-weight:500">Create Template</span>
  </div>`;
  tmpls.forEach(t=>{
    h+=`<div class="tmpl-card" data-tid="${t.id}">
      <div class="tmpl-head"><span class="tmpl-icon">${esc(t.icon)}</span><span class="tmpl-name">${esc(t.name)}</span><button class="tmpl-del material-icons-round" data-tid="${t.id}" title="Delete">delete_outline</button></div>
      ${t.description?`<div class="tmpl-desc">${esc(t.description)}</div>`:''}
      <div class="tmpl-tasks">${t.tasks.map(tk=>`<span>${esc(tk.title)}</span>`).join('')}</div>
    </div>`;
  });
  h+='</div>';
  c.innerHTML=h;
  // Create new template
  $('tmpl-new').addEventListener('click',openNewTemplateForm);
  // Click to apply
  c.querySelectorAll('.tmpl-card[data-tid]').forEach(card=>{
    card.addEventListener('click',e=>{
      if(e.target.closest('.tmpl-del'))return;
      openApplyTemplate(Number(card.dataset.tid),tmpls.find(t=>t.id===Number(card.dataset.tid)));
    });
  });
  // Delete template
  c.querySelectorAll('.tmpl-del').forEach(btn=>{
    btn.addEventListener('click',async e=>{
      e.stopPropagation();
      if(!confirm('Delete this template?'))return;
      await api.del('/api/templates/'+btn.dataset.tid);
      renderTemplates();
    });
  });
}

function openNewTemplateForm(){
  const ov=$('tmpl-apply-ov'),box=$('tmpl-apply-box');
  let h=`<h3>Create Template</h3>
    <div style="margin:12px 0"><label style="font-size:11px;color:var(--txd);display:block;margin-bottom:3px">Template Name</label>
    <input type="text" id="tmpl-f-name" placeholder="e.g., Sprint Planning" style="width:100%;padding:8px 10px;border:1px solid var(--brd);border-radius:6px;background:var(--bg);color:var(--tx);font-size:13px;box-sizing:border-box"></div>
    <div style="margin-bottom:12px"><label style="font-size:11px;color:var(--txd);display:block;margin-bottom:3px">Description</label>
    <input type="text" id="tmpl-f-desc" placeholder="Optional description" style="width:100%;padding:8px 10px;border:1px solid var(--brd);border-radius:6px;background:var(--bg);color:var(--tx);font-size:13px;box-sizing:border-box"></div>
    <div style="margin-bottom:12px"><label style="font-size:11px;color:var(--txd);display:block;margin-bottom:3px">Icon</label>
    <select id="tmpl-f-icon" style="padding:8px 10px;border:1px solid var(--brd);border-radius:6px;background:var(--bg);color:var(--tx);font-size:13px"><option value="📋">📋</option><option value="🏃">🏃</option><option value="📅">📅</option><option value="🐛">🐛</option><option value="✍️">✍️</option><option value="🚀">🚀</option><option value="🔧">🔧</option><option value="📊">📊</option><option value="🎯">🎯</option><option value="💡">💡</option></select></div>
    <div style="margin-bottom:12px"><label style="font-size:11px;color:var(--txd);display:block;margin-bottom:3px">Tasks (one per line)</label>
    <textarea id="tmpl-f-tasks" rows="6" placeholder="Task 1\nTask 2\nTask 3" style="width:100%;padding:8px 10px;border:1px solid var(--brd);border-radius:6px;background:var(--bg);color:var(--tx);font-size:12px;font-family:inherit;resize:vertical;box-sizing:border-box"></textarea></div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button class="btn-c" id="tmpl-f-cancel" style="padding:8px 16px;border-radius:6px;border:1px solid var(--brd);cursor:pointer;font-family:inherit">Cancel</button>
      <button class="btn-s" id="tmpl-f-save" style="padding:8px 16px;border-radius:6px;border:none;cursor:pointer;font-family:inherit">Create Template</button>
    </div>`;
  box.innerHTML=h;ov.classList.add('active');
  $('tmpl-f-cancel').addEventListener('click',()=>ov.classList.remove('active'));
  ov.addEventListener('click',e=>{if(e.target===ov)ov.classList.remove('active')});
  $('tmpl-f-save').addEventListener('click',async()=>{
    const name=$('tmpl-f-name').value.trim();
    const lines=$('tmpl-f-tasks').value.split('\n').map(l=>l.trim()).filter(Boolean);
    if(!name){showToast('Template name required');return}
    if(!lines.length){showToast('At least one task required');return}
    await api.post('/api/templates',{name,description:$('tmpl-f-desc').value.trim(),icon:$('tmpl-f-icon').value,tasks:lines.map(l=>({title:l,priority:0,subtasks:[]}))});
    ov.classList.remove('active');
    renderTemplates();showToast('Template created!');
  });
}

function openApplyTemplate(tid,tmpl){
  const ov=$('tmpl-apply-ov'),box=$('tmpl-apply-box');
  // Load goals first
  loadAreasWithGoals().then(()=>{
  let h=`<h3>${esc(tmpl.icon)} ${esc(tmpl.name)}</h3>
    <p style="color:var(--tx2);font-size:12px;margin-bottom:12px">${tmpl.tasks.length} tasks will be created</p>
    <div style="margin-bottom:12px"><label style="font-size:11px;color:var(--txd);display:block;margin-bottom:3px">Select Goal</label>
    <select id="tmpl-a-goal" style="width:100%;padding:8px 10px;border:1px solid var(--brd);border-radius:6px;background:var(--bg);color:var(--tx);font-size:13px;box-sizing:border-box">`;
  areas.forEach(a=>{
    const aGoals=(a.goals||[]);
    aGoals.forEach(g=>{h+=`<option value="${g.id}">${esc(a.icon)} ${esc(a.name)} › ${esc(g.title)}</option>`});
  });
  h+=`</select></div>
    <div style="max-height:200px;overflow-y:auto;margin-bottom:12px;background:var(--bg-c);border-radius:6px;padding:8px">`;
  tmpl.tasks.forEach(t=>{
    h+=`<div style="font-size:12px;padding:4px 0;display:flex;align-items:center;gap:6px"><span class="material-icons-round" style="font-size:14px;color:var(--txd)">task_alt</span>${esc(t.title)}${t.subtasks?.length?` <span style="color:var(--txd);font-size:10px">(${t.subtasks.length} subtasks)</span>`:''}</div>`;
  });
  h+=`</div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button class="btn-c" id="tmpl-a-cancel" style="padding:8px 16px;border-radius:6px;border:1px solid var(--brd);cursor:pointer;font-family:inherit">Cancel</button>
      <button class="btn-s" id="tmpl-a-apply" style="padding:8px 16px;border-radius:6px;border:none;cursor:pointer;font-family:inherit">Apply Template</button>
    </div>`;
  box.innerHTML=h;ov.classList.add('active');
  $('tmpl-a-cancel').addEventListener('click',()=>ov.classList.remove('active'));
  ov.addEventListener('click',e=>{if(e.target===ov)ov.classList.remove('active')});
  $('tmpl-a-apply').addEventListener('click',async()=>{
    const goalId=Number($('tmpl-a-goal').value);
    if(!goalId){showToast('Select a goal');return}
    const r=await api.post('/api/templates/'+tid+'/apply',{goalId});
    ov.classList.remove('active');
    showToast(`✅ Created ${r.created.length} tasks from template`);
    await loadAreas();render();
  });
  });
}
// Populate goals for template apply dropdown  
async function loadAreasWithGoals(){
  for(const a of areas){
    a.goals=await api.get('/api/areas/'+a.id+'/goals');
  }
}

// ─── VIM NAVIGATION ───
let vimIdx=-1;
function getVisibleCards(){return Array.from(document.querySelectorAll('#ct .tc[data-id]'))}
function vimHighlight(idx){
  const cards=getVisibleCards();
  cards.forEach(c=>c.classList.remove('vim-focus'));
  if(idx>=0&&idx<cards.length){
    cards[idx].classList.add('vim-focus');
    cards[idx].scrollIntoView({block:'nearest',behavior:'smooth'});
  }
}
function vimMove(delta){
  const cards=getVisibleCards();
  if(!cards.length)return;
  vimIdx=Math.max(0,Math.min(cards.length-1,vimIdx+delta));
  vimHighlight(vimIdx);
}

// ─── CUSTOM FIELDS SETTINGS ───
async function renderAiSettings(c, tabsHtml, wireSettingsTabs){
  const settings=await api.get('/api/ai/settings');
  const status=await api.get('/api/ai/status');
  let stats=null;
  try{stats=await api.get('/api/ai/stats')}catch{}
  const providers=[{v:'openai',l:'OpenAI'},{v:'anthropic',l:'Anthropic'},{v:'ollama',l:'Ollama (Local)'},{v:'custom',l:'Custom (OpenAI-compatible)'}];
  const defaultUrls={openai:'https://api.openai.com/v1',anthropic:'https://api.anthropic.com/v1',ollama:'',custom:''};
  const ollamaPlaceholder='http://your-ollama-host:11434';
  const defaultModels={openai:'gpt-4o-mini',anthropic:'claude-sonnet-4-20250514',ollama:'llama3:8b',custom:''};
  let h=tabsHtml+`<div class="settings-grid">
  <section class="settings-section"><h3><span class="material-icons-round" style="font-size:18px;vertical-align:middle;margin-right:6px">smart_toy</span>AI Configuration</h3>
  <p style="font-size:12px;color:var(--txd);margin-bottom:12px">Configure your AI provider. All AI calls use YOUR API key — no data sent to LifeFlow servers.</p>
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;padding:10px 14px;border-radius:var(--rs);background:${status.configured?'var(--ok-bg,rgba(76,175,80,.1))':'var(--warn-bg,rgba(255,152,0,.1))'}">
    <span class="material-icons-round" style="font-size:18px;color:${status.configured?'var(--ok,#4caf50)':'var(--warn,#ff9800)'}">${status.configured?'check_circle':'warning'}</span>
    <span style="font-size:12px;font-weight:500">${status.configured?`Connected: ${esc(status.provider)} / ${esc(status.model)}`:'AI not configured — set provider and API key below'}</span>
  </div>
  <div style="display:flex;flex-direction:column;gap:12px">
    <div><label style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--txd);display:block;margin-bottom:4px">Provider</label>
    <select id="ai-provider" class="inp" style="font-size:13px">${providers.map(p=>`<option value="${p.v}"${settings.ai_provider===p.v?' selected':''}>${p.l}</option>`).join('')}</select></div>
    <div><label style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--txd);display:block;margin-bottom:4px">Base URL</label>
    <input type="text" id="ai-base-url" class="inp" value="${escA(settings.ai_base_url||defaultUrls[settings.ai_provider||'openai']||'')}" placeholder="https://api.openai.com/v1" style="font-size:13px"></div>
    <div><label style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--txd);display:block;margin-bottom:4px">Model</label>
    <input type="text" id="ai-model" class="inp" value="${escA(settings.ai_model||defaultModels[settings.ai_provider||'openai']||'')}" placeholder="gpt-4o-mini" style="font-size:13px"></div>
    <div><label style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--txd);display:block;margin-bottom:4px">API Key ${settings.has_api_key?'<span style="color:var(--ok,#4caf50);font-weight:400;text-transform:none">(saved)</span>':''}</label>
    <div style="display:flex;gap:6px"><input type="password" id="ai-api-key" class="inp" placeholder="${settings.has_api_key?'••••••••••••':'Enter your API key'}" style="font-size:13px;flex:1">
    ${settings.has_api_key?'<button class="btn-c" id="ai-key-del" title="Remove key" style="color:var(--dn);padding:6px"><span class="material-icons-round" style="font-size:16px">delete</span></button>':''}</div></div>
    <div style="display:flex;gap:8px;margin-top:4px">
      <button class="btn-s" id="ai-save" style="font-size:12px;padding:8px 16px"><span class="material-icons-round" style="font-size:14px;vertical-align:middle;margin-right:4px">save</span>Save Settings</button>
      <button class="btn-c" id="ai-test" style="font-size:12px;padding:8px 14px"><span class="material-icons-round" style="font-size:14px;vertical-align:middle;margin-right:4px">speed</span>Test Connection</button>
    </div>
    <div id="ai-test-result" style="font-size:12px;display:none;padding:8px 12px;border-radius:var(--rs);margin-top:4px"></div>
  </div></section>

  <section class="settings-section"><h3>Privacy & Transparency</h3>
  <p style="font-size:12px;color:var(--txd);margin-bottom:12px">Control what data is sent to AI and how interactions are logged.</p>
  <div style="display:flex;flex-direction:column;gap:12px">
    <div><label style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--txd);display:block;margin-bottom:4px">Transparency Mode</label>
    <select id="ai-transparency" class="inp" style="font-size:13px">
      <option value="always"${(settings.ai_transparency_mode||'always')==='always'?' selected':''}>Always show pre-flight (recommended)</option>
      <option value="trust"${settings.ai_transparency_mode==='trust'?' selected':''}>Trust mode — skip confirmations</option>
      <option value="off"${settings.ai_transparency_mode==='off'?' selected':''}>Off — no pre-flight prompts</option>
    </select></div>
    <div><label style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--txd);display:block;margin-bottom:4px">Data Minimization</label>
    <select id="ai-minimization" class="inp" style="font-size:13px">
      <option value="strict"${settings.ai_data_minimization==='strict'?' selected':''}>Strict — titles only, no notes or descriptions</option>
      <option value="standard"${(settings.ai_data_minimization||'standard')==='standard'?' selected':''}>Standard — titles + short descriptions</option>
      <option value="full"${settings.ai_data_minimization==='full'?' selected':''}>Full — include all task details</option>
    </select></div>
  </div></section>

  <section class="settings-section"><h3>AI Capabilities</h3>
  <p style="font-size:12px;color:var(--txd);margin-bottom:10px">Features available with your current provider.</p>
  <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px">
    ${[{k:'functionCalling',l:'Function Calling',i:'functions'},{k:'streaming',l:'Streaming',i:'stream'},{k:'embeddings',l:'Embeddings',i:'hub'},{k:'maxTokens',l:'Max Tokens',i:'data_array'}].map(cap=>{
      const val=status.capabilities?.[cap.k];
      const supported=typeof val==='boolean'?val:!!val;
      return `<div style="padding:8px 10px;border-radius:var(--rs);background:var(--sf);display:flex;align-items:center;gap:8px">
        <span class="material-icons-round" style="font-size:16px;color:${supported?'var(--ok,#4caf50)':'var(--txd)'}">${supported?'check_circle':'cancel'}</span>
        <div><div style="font-size:12px;font-weight:500">${cap.l}</div>
        ${cap.k==='maxTokens'?`<div style="font-size:10px;color:var(--txd)">${(val||0).toLocaleString()} tokens</div>`:`<div style="font-size:10px;color:var(--txd)">${supported?'Supported':'Not available'}</div>`}</div>
      </div>`;
    }).join('')}
  </div></section>

  ${stats?`<section class="settings-section"><h3>Usage Stats</h3>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px">
    <div style="text-align:center;padding:12px;background:var(--sf);border-radius:var(--rs)"><div style="font-size:20px;font-weight:700">${stats.total_calls||0}</div><div style="font-size:10px;color:var(--txd)">Total Calls</div></div>
    <div style="text-align:center;padding:12px;background:var(--sf);border-radius:var(--rs)"><div style="font-size:20px;font-weight:700">${((stats.total_tokens||0)/1000).toFixed(1)}k</div><div style="font-size:10px;color:var(--txd)">Tokens Used</div></div>
    <div style="text-align:center;padding:12px;background:var(--sf);border-radius:var(--rs)"><div style="font-size:20px;font-weight:700">${stats.total_calls?Math.round((stats.accepted_count||0)/stats.total_calls*100):0}%</div><div style="font-size:10px;color:var(--txd)">Accepted</div></div>
  </div>
  ${stats.byFeature?.length?`<div style="font-size:11px"><strong>By Feature:</strong> ${stats.byFeature.map(f=>`${f.feature} (${f.count})`).join(', ')}</div>`:''}</section>`:''}

  <section class="settings-section"><h3>AI Features Overview</h3>
  <p style="font-size:12px;color:var(--txd);margin-bottom:10px">Available AI-powered features throughout LifeFlow.</p>
  <div style="display:flex;flex-direction:column;gap:6px;font-size:12px">
    ${[
      {i:'edit_note',l:'Smart Capture',d:'AI-enhanced natural language task input'},
      {i:'route',l:'Smart Routing',d:'Auto-classify tasks into goals and tags'},
      {i:'account_tree',l:'Goal Decomposition',d:'Break goals into structured task plans'},
      {i:'today',l:'Daily Planner',d:'AI-optimized daily task scheduling'},
      {i:'play_arrow',l:'Next Task',d:'One-tap "what should I do now?" decision'},
      {i:'rate_review',l:'Review Copilot',d:'AI-generated weekly review insights'},
      {i:'auto_awesome',l:'Year in Review',d:'Spotify Wrapped-style annual summary'},
      {i:'psychology',l:'Cognitive Load',d:'Monitor and manage mental load'},
      {i:'notifications_active',l:'Accountability',d:'Gentle nudges based on your plan'},
      {i:'spa',l:'Habit Coach',d:'Evidence-based habit formation advice'},
      {i:'donut_large',l:'Life Balance',d:'Cross-area balance analysis and suggestions'},
      {i:'auto_fix_high',l:'Automation Builder',d:'Create automations from plain English'},
      {i:'search',l:'Semantic Search',d:'Find related tasks by meaning, not just keywords'},
    ].map(f=>`<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:var(--rs);background:var(--sf)">
      <span class="material-icons-round" style="font-size:16px;color:var(--brand)">${f.i}</span>
      <div style="flex:1"><span style="font-weight:500">${f.l}</span> — <span style="color:var(--txd)">${f.d}</span></div>
      <span class="material-icons-round" style="font-size:14px;color:${status.configured?'var(--ok,#4caf50)':'var(--txd)'}">${status.configured?'check_circle':'lock'}</span>
    </div>`).join('')}
  </div></section>
  </div>`;
  c.innerHTML=h;
  wireSettingsTabs();

  // Wire provider change → update defaults
  const provSel=$('ai-provider');
  provSel?.addEventListener('change',()=>{
    const p=provSel.value;
    const urlInp=$('ai-base-url');
    const modInp=$('ai-model');
    if(urlInp&&(!urlInp.value||Object.values(defaultUrls).includes(urlInp.value)))urlInp.value=defaultUrls[p]||'';
    if(modInp&&(!modInp.value||Object.values(defaultModels).includes(modInp.value)))modInp.value=defaultModels[p]||'';
  });

  // Save settings
  $('ai-save')?.addEventListener('click',async()=>{
    const body={
      ai_provider:$('ai-provider')?.value,
      ai_base_url:$('ai-base-url')?.value,
      ai_model:$('ai-model')?.value,
      ai_transparency_mode:$('ai-transparency')?.value,
      ai_data_minimization:$('ai-minimization')?.value,
    };
    // Save API key if entered
    const keyInp=$('ai-api-key');
    if(keyInp?.value){
      try{await api.post('/api/ai/key',{api_key:keyInp.value})}catch(e){showToast(e.message||'Failed to save key','error');return}
    }
    try{
      await api.post('/api/ai/settings',body);
      showToast('AI settings saved','ok');
      renderSettings();
    }catch(e){showToast(e.message||'Failed to save','error')}
  });

  // Delete key
  $('ai-key-del')?.addEventListener('click',async()=>{
    if(!confirm('Remove your AI API key?'))return;
    try{await api.del('/api/ai/key');showToast('API key removed','ok');renderSettings()}catch(e){showToast('Failed','error')}
  });

  // Test connection
  $('ai-test')?.addEventListener('click',async()=>{
    const rd=$('ai-test-result');
    if(!rd)return;
    rd.style.display='block';
    rd.innerHTML='<span class="material-icons-round" style="font-size:14px;vertical-align:middle;animation:spin 1s linear infinite">sync</span> Testing...';
    rd.style.background='var(--sf)';
    try{
      // Save settings first so test uses latest config
      const body={ai_provider:$('ai-provider')?.value,ai_base_url:$('ai-base-url')?.value,ai_model:$('ai-model')?.value};
      const keyInp=$('ai-api-key');
      if(keyInp?.value)await api.post('/api/ai/key',{api_key:keyInp.value});
      await api.post('/api/ai/settings',body);
      const r=await api.post('/api/ai/test',{});
      if(r.ok){
        rd.innerHTML=`<span class="material-icons-round" style="font-size:14px;vertical-align:middle;color:var(--ok,#4caf50)">check_circle</span> Connected! Latency: ${r.latency}ms — ${esc(r.model)}`;
        rd.style.background='var(--ok-bg,rgba(76,175,80,.1))';
      }else{
        rd.innerHTML=`<span class="material-icons-round" style="font-size:14px;vertical-align:middle;color:var(--dn)">error</span> Failed: ${esc(r.error||'Unknown error')}`;
        rd.style.background='var(--dn-bg,rgba(244,67,54,.1))';
      }
    }catch(e){
      rd.innerHTML=`<span class="material-icons-round" style="font-size:14px;vertical-align:middle;color:var(--dn)">error</span> ${esc(e.message||'Connection failed')}`;
      rd.style.background='var(--dn-bg,rgba(244,67,54,.1))';
    }
  });
}

async function renderCustomFieldsSettings(c, tabsHtml, wireSettingsTabs){
  const fields=await api.get('/api/custom-fields');
  const TYPES=[{v:'text',l:'Text'},{v:'number',l:'Number'},{v:'date',l:'Date'},{v:'select',l:'Select'}];
  let h=tabsHtml+`<div class="settings-grid"><section class="settings-section"><h3>Custom Fields</h3>
  <p style="font-size:12px;color:var(--txd);margin-bottom:12px">Define custom fields that appear on all tasks.</p>`;
  if(fields.length){
    h+=`<div id="cf-list" style="display:flex;flex-direction:column;gap:6px">`;
    fields.forEach(f=>{
      const opts=f.options?JSON.parse(f.options):[];
      h+=`<div class="cf-row" data-cfid="${f.id}" style="display:flex;align-items:center;gap:8px;padding:8px;border:1px solid var(--brd);border-radius:var(--rs);background:var(--bg2)">
        <span style="font-size:13px;font-weight:500;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(f.name)}</span>
        <span style="font-size:11px;padding:2px 6px;border-radius:var(--rs);background:var(--brand);color:#fff">${f.field_type}</span>
        ${f.field_type==='select'?`<span style="font-size:11px;color:var(--txd)">${opts.join(', ')}</span>`:''}
        <label style="font-size:11px;color:var(--txd);display:flex;align-items:center;gap:3px"><input type="checkbox" class="cf-card-toggle" data-cfid="${f.id}" ${f.show_in_card?'checked':''}> Card</label>
        <button class="btn-c cf-del" data-cfid="${f.id}" title="Delete" style="color:var(--dn)"><span class="material-icons-round" style="font-size:16px">delete</span></button>
      </div>`;
    });
    h+=`</div>`;
  } else {
    h+=`<div style="padding:16px;text-align:center;color:var(--txd);font-size:12px">No custom fields defined yet.</div>`;
  }
  h+=`<div style="margin-top:12px;border-top:1px solid var(--brd);padding-top:12px">
    <h4 style="font-size:13px;margin-bottom:8px">Add Field</h4>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
      <div><label style="font-size:11px;color:var(--txd)">Name</label><input type="text" id="cf-new-name" style="display:block;padding:6px 10px;border:1px solid var(--brd);border-radius:var(--rs);background:var(--bg2);color:var(--tx);font-size:13px;width:150px" placeholder="Field name"></div>
      <div><label style="font-size:11px;color:var(--txd)">Type</label><select id="cf-new-type" style="display:block;padding:6px 10px;border:1px solid var(--brd);border-radius:var(--rs);background:var(--bg2);color:var(--tx);font-size:13px">${TYPES.map(t=>`<option value="${t.v}">${t.l}</option>`).join('')}</select></div>
      <div id="cf-new-opts-wrap" style="display:none"><label style="font-size:11px;color:var(--txd)">Options (comma-separated)</label><input type="text" id="cf-new-opts" style="display:block;padding:6px 10px;border:1px solid var(--brd);border-radius:var(--rs);background:var(--bg2);color:var(--tx);font-size:13px;width:200px" placeholder="Low, Medium, High"></div>
      <button class="btn-s" id="cf-add-btn" style="padding:6px 14px;font-size:12px">+ Add</button>
    </div>
  </div>`;
  h+=`</section></div>`;
  c.innerHTML=h;
  wireSettingsTabs();
  // Show/hide options input for select type
  const typeSelect=$('cf-new-type');
  const optsWrap=$('cf-new-opts-wrap');
  typeSelect?.addEventListener('change',()=>{optsWrap.style.display=typeSelect.value==='select'?'':'none';});
  // Add field
  $('cf-add-btn')?.addEventListener('click',async()=>{
    const name=$('cf-new-name')?.value?.trim();
    const field_type=typeSelect?.value;
    if(!name)return showToast('Name required','error');
    const body={name,field_type};
    if(field_type==='select'){
      const raw=$('cf-new-opts')?.value||'';
      body.options=raw.split(',').map(s=>s.trim()).filter(Boolean);
      if(!body.options.length)return showToast('Options required for select type','error');
    }
    try{await api.post('/api/custom-fields',body);renderSettings();}catch(e){showToast(e.message||'Error','error');}
  });
  // Delete
  c.querySelectorAll('.cf-del').forEach(btn=>btn.addEventListener('click',async()=>{
    if(!confirm('Delete this custom field and all its values?'))return;
    await api.del('/api/custom-fields/'+btn.dataset.cfid);renderSettings();showToast('Field deleted');
  }));
  // Toggle show_in_card
  c.querySelectorAll('.cf-card-toggle').forEach(cb=>cb.addEventListener('change',async()=>{
    await api.put('/api/custom-fields/'+cb.dataset.cfid,{show_in_card:cb.checked});
  }));
}

// ─── SETTINGS PAGE ───
async function renderSettings(){
  await loadSettings();
  const c=$('ct');
  // Settings tabs
  const settingsTabDefs=[
    {id:'general',label:'General',icon:'tune',g:1},
    {id:'taskdefaults',label:'Task Defaults',icon:'checklist',g:1},
    {id:'appearance',label:'Appearance',icon:'palette',g:2},
    {id:'areas',label:'Life Areas',icon:'category',g:3},
    {id:'listconfig',label:'Lists',icon:'format_list_bulleted',g:3},
    {id:'tags',label:'Tags',icon:'label',g:3},
    {id:'templates',label:'Templates',icon:'content_copy',g:4},
    {id:'automations',label:'Automations',icon:'auto_fix_high',g:4},
    {id:'customfields',label:'Custom Fields',icon:'edit_note',g:4},
    {id:'ai',label:'AI',icon:'smart_toy',g:5},
    {id:'badges',label:'Badges',icon:'emoji_events',g:6},
    {id:'data',label:'Data',icon:'storage',g:7},
    {id:'shortcuts',label:'Shortcuts',icon:'keyboard',g:7}
  ];
  if(!window._settingsTab)window._settingsTab='general';
  let tabsHtml=`<input type="text" class="settings-search" id="settings-filter" placeholder="Search settings..." value="${esc(window._settingsFilter||'')}">`;
  tabsHtml+=`<div class="settings-tabs" role="tablist">`;
  let lastG=0;
  settingsTabDefs.forEach(t=>{
    if(lastG&&t.g!==lastG)tabsHtml+=`<span class="tab-sep" aria-hidden="true"></span>`;
    lastG=t.g;
    const isActive=window._settingsTab===t.id;
    tabsHtml+=`<button class="btn-c settings-tab${isActive?' active':''}" role="tab" aria-selected="${isActive}" id="stab-${t.id}" data-stab="${t.id}" style="font-size:12px;padding:6px 12px;border-radius:var(--rs);white-space:nowrap;flex-shrink:0;${isActive?'background:var(--brand);color:#fff;border-color:var(--brand)':''}"><span class="material-icons-round" style="font-size:14px;vertical-align:middle;margin-right:4px">${t.icon}</span>${t.label}</button>`;
  });
  tabsHtml+=`</div>`;

  function wireSettingsTabs(){
    c.querySelectorAll('.settings-tab').forEach(btn=>btn.addEventListener('click',()=>{window._settingsTab=btn.dataset.stab;renderSettings()}));
    const _sf=$('settings-filter');
    if(_sf){
      _sf.addEventListener('input',()=>{
        const q=_sf.value.toLowerCase().trim();window._settingsFilter=q;
        const tabDefs=[{id:'general',label:'General'},{id:'taskdefaults',label:'Task Defaults'},{id:'appearance',label:'Appearance Theme'},{id:'areas',label:'Life Areas'},{id:'listconfig',label:'Lists Grocery Categories'},{id:'tags',label:'Tags'},{id:'templates',label:'Templates'},{id:'automations',label:'Automations Rules'},{id:'customfields',label:'Custom Fields'},{id:'ai',label:'AI Artificial Intelligence Provider Model'},{id:'badges',label:'Badges Achievements'},{id:'data',label:'Data Export Import Reset'},{id:'shortcuts',label:'Shortcuts Keyboard'}];
        c.querySelectorAll('.settings-tab').forEach(btn=>{
          const def=tabDefs.find(d=>d.id===btn.dataset.stab);
          btn.style.display=(!q||def&&def.label.toLowerCase().includes(q))?'':'none';
        });
        c.querySelectorAll('.tab-sep').forEach(s=>{s.style.display=q?'none':''});
      });
      _sf.focus();_sf.setSelectionRange(_sf.value.length,_sf.value.length);
    }
  }

  if(window._settingsTab==='tags'){
    await renderTags();
    c.insertAdjacentHTML('afterbegin',tabsHtml);
    wireSettingsTabs();
    return;
  }
  if(window._settingsTab==='templates'){
    await renderTemplates();
    c.insertAdjacentHTML('afterbegin',tabsHtml);
    wireSettingsTabs();
    return;
  }
  if(window._settingsTab==='automations'){
    await renderRules();
    c.insertAdjacentHTML('afterbegin',tabsHtml);
    wireSettingsTabs();
    return;
  }
  if(window._settingsTab==='customfields'){
    await renderCustomFieldsSettings(c, tabsHtml, wireSettingsTabs);
    return;
  }
  if(window._settingsTab==='ai'){
    await renderAiSettings(c, tabsHtml, wireSettingsTabs);
    return;
  }
  if(window._settingsTab==='areas'){
    const allAreas=await api.get('/api/areas?include_archived=1');
    const active=allAreas.filter(a=>!a.archived);
    const archived=allAreas.filter(a=>a.archived);
    let h=tabsHtml+`<div class="settings-grid"><section class="settings-section"><h3>Life Areas</h3>
    <p style="font-size:12px;color:var(--txd);margin-bottom:12px">Manage your life areas. Drag to reorder, archive to hide without deleting.</p>
    <div id="sa-list">`;
    active.forEach((a,i)=>{
      h+=`<div class="sa-row" data-aid="${a.id}" draggable="true">
        <span class="material-icons-round sa-grip" style="font-size:16px;color:var(--txd);cursor:grab">drag_indicator</span>
        <span style="font-size:20px">${esc(a.icon)}</span>
        <span style="flex:1;font-size:13px;font-weight:500;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(a.name)}</span>
        <span class="sa-color" style="width:16px;height:16px;border-radius:50%;border:2.5px solid ${escA(a.color)};background:transparent"></span>
        <button class="btn-c sa-move-up" data-aid="${a.id}" title="Move up"${i===0?' disabled':''}><span class="material-icons-round" style="font-size:16px">arrow_upward</span></button>
        <button class="btn-c sa-move-dn" data-aid="${a.id}" title="Move down"${i===active.length-1?' disabled':''}><span class="material-icons-round" style="font-size:16px">arrow_downward</span></button>
        <button class="btn-c sa-edit" data-aid="${a.id}" title="Edit"><span class="material-icons-round" style="font-size:16px">edit</span></button>
        <button class="btn-c sa-archive" data-aid="${a.id}" title="Archive"><span class="material-icons-round" style="font-size:16px">archive</span></button>
        <button class="btn-c sa-del" data-aid="${a.id}" title="Delete" style="color:var(--dn)"><span class="material-icons-round" style="font-size:16px">delete</span></button>
      </div>`;
    });
    h+=`</div><button class="btn-s" id="sa-add" style="margin-top:10px;font-size:12px;padding:8px 14px">+ Add Area</button></section>`;
    h+=`<section class="settings-section"><h3>Archived</h3>`;
    if(archived.length){
      h+=`<div>`;
      archived.forEach(a=>{
        h+=`<div class="sa-row archived" data-aid="${a.id}">
          <span style="font-size:20px;opacity:.5">${esc(a.icon)}</span>
          <span style="flex:1;font-size:13px;color:var(--txd);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(a.name)}</span>
          <button class="btn-c sa-unarchive" data-aid="${a.id}" title="Unarchive"><span class="material-icons-round" style="font-size:16px">unarchive</span></button>
          <button class="btn-c sa-del" data-aid="${a.id}" title="Delete permanently" style="color:var(--dn)"><span class="material-icons-round" style="font-size:16px">delete_forever</span></button>
        </div>`;
      });
      h+=`</div>`;
    } else {
      h+=`<div style="padding:16px;text-align:center;color:var(--txd);font-size:12px"><span class="material-icons-round" style="font-size:28px;display:block;margin-bottom:6px;opacity:.4">inventory_2</span>No archived areas. Use the <span class="material-icons-round" style="font-size:13px;vertical-align:middle">archive</span> button on an area to archive it.</div>`;
    }
    h+=`</section>`;
    h+=`</div>`;
    c.innerHTML=h;
    wireSettingsTabs();
    // Wire area actions
    $('sa-add')?.addEventListener('click',()=>{openAreaModal();setTimeout(()=>{const check=setInterval(()=>{if(!$('am').classList.contains('active')){clearInterval(check);renderSettings()}},300)},100)});
    c.querySelectorAll('.sa-edit').forEach(btn=>btn.addEventListener('click',()=>{
      const a=allAreas.find(x=>x.id===Number(btn.dataset.aid));
      if(a){openAreaModal(a);setTimeout(()=>{const check=setInterval(()=>{if(!$('am').classList.contains('active')){clearInterval(check);renderSettings()}},300)},100)}
    }));
    c.querySelectorAll('.sa-archive').forEach(btn=>btn.addEventListener('click',async()=>{
      await api.put('/api/areas/'+btn.dataset.aid+'/archive');await loadAreas();renderSettings();showToast('Area archived');
    }));
    c.querySelectorAll('.sa-unarchive').forEach(btn=>btn.addEventListener('click',async()=>{
      await api.put('/api/areas/'+btn.dataset.aid+'/unarchive');await loadAreas();renderSettings();showToast('Area restored');
    }));
    c.querySelectorAll('.sa-del').forEach(btn=>btn.addEventListener('click',async()=>{
      const a=allAreas.find(x=>x.id===Number(btn.dataset.aid));
      if(!confirm('Delete "'+a.name+'" and all its goals and tasks?'))return;
      await api.del('/api/areas/'+btn.dataset.aid);await loadAreas();renderSettings();showToast('Area deleted');
    }));
    // Up/down reorder buttons (touch-friendly alternative to drag)
    c.querySelectorAll('.sa-move-up,.sa-move-dn').forEach(btn=>btn.addEventListener('click',async()=>{
      const rows=Array.from(c.querySelectorAll('#sa-list .sa-row'));
      const ids=rows.map(r=>Number(r.dataset.aid));
      const aid=Number(btn.dataset.aid);const idx=ids.indexOf(aid);
      const isUp=btn.classList.contains('sa-move-up');
      if(isUp&&idx>0){ids.splice(idx,1);ids.splice(idx-1,0,aid)}
      else if(!isUp&&idx<ids.length-1){ids.splice(idx,1);ids.splice(idx+1,0,aid)}
      else return;
      await api.put('/api/areas/reorder',ids.map((id,i)=>({id,position:i})));
      await loadAreas();renderSettings();
    }));
    // Drag & drop reorder
    let dragAid=null;
    c.querySelectorAll('#sa-list .sa-row').forEach(row=>{
      row.addEventListener('dragstart',e=>{dragAid=Number(row.dataset.aid);row.style.opacity='.5'});
      row.addEventListener('dragend',()=>{row.style.opacity='1'});
      row.addEventListener('dragover',e=>{e.preventDefault();row.style.borderTop='2px solid var(--brand)'});
      row.addEventListener('dragleave',()=>{row.style.borderTop=''});
      row.addEventListener('drop',async e=>{
        e.preventDefault();row.style.borderTop='';
        const targetAid=Number(row.dataset.aid);if(dragAid===targetAid)return;
        const rows=Array.from(c.querySelectorAll('#sa-list .sa-row'));
        const ids=rows.map(r=>Number(r.dataset.aid));
        const fromIdx=ids.indexOf(dragAid);const toIdx=ids.indexOf(targetAid);
        ids.splice(fromIdx,1);ids.splice(toIdx,0,dragAid);
        await api.put('/api/areas/reorder',ids.map((id,i)=>({id,position:i})));
        await loadAreas();renderSettings();
      });
    });
    return;
  }

  const themes=[['midnight','Midnight'],['ocean','Ocean'],['forest','Forest'],['sunset','Sunset'],['lavender','Lavender'],['nord','Nord']];
  const views=[['myday','Today'],['upcoming','Upcoming'],['calendar','Calendar'],['areas','Areas']];
  const priorities=[['0','None'],['1','Normal'],['2','High'],['3','Critical']];
  const dateFormats=[['relative','Relative (Today, Tomorrow)'],['iso','ISO (2026-03-20)'],['us','US (Mar 20, 2026)'],['eu','EU (20/03/2026)']];
  const weekDays=[['0','Sunday'],['1','Monday']];

  function selOpts(opts,cur){return opts.map(([v,l])=>`<option value="${v}"${String(cur)===String(v)?' selected':''}>${esc(l)}</option>`).join('')}
  function tog(key,cur){return `<label class="set-toggle"><input type="checkbox" data-key="${key}" ${cur==='true'?'checked':''}><span class="slider"></span></label>`}

  let content='';
  if(window._settingsTab==='general'){
    content=`<div class="settings-grid">
  <section class="settings-section">
    <h3>General</h3>
    <div class="set-row"><label>Default View</label><select data-key="defaultView">${selOpts(views,appSettings.defaultView)}</select></div>
    <div class="set-row"><label>Date Format</label><select data-key="dateFormat">${selOpts(dateFormats,appSettings.dateFormat)}</select></div>
    <div class="set-row"><label>Week Starts On</label><select data-key="weekStart">${selOpts(weekDays,appSettings.weekStart)}</select></div>
  </section>
  <section class="settings-section">
    <h3>Focus Timer</h3>
    <div class="set-row"><label>Focus Duration (min)</label><input type="number" min="1" max="120" data-key="focusDuration" value="${esc(appSettings.focusDuration)}"></div>
    <div class="set-row"><label>Short Break (min)</label><input type="number" min="1" max="30" data-key="shortBreak" value="${esc(appSettings.shortBreak)}"></div>
    <div class="set-row"><label>Long Break (min)</label><input type="number" min="1" max="60" data-key="longBreak" value="${esc(appSettings.longBreak)}"></div>
  </section>
  <section class="settings-section">
    <h3>Tasks</h3>
    <div class="set-row"><label>Default Priority</label><select data-key="defaultPriority">${selOpts(priorities,appSettings.defaultPriority)}</select></div>
    <div class="set-row"><label>Auto-add to Today</label>${tog('autoMyDay',appSettings.autoMyDay)}</div>
    <div class="set-row"><label>Show Completed Tasks</label>${tog('showCompleted',appSettings.showCompleted)}</div>
    <div class="set-row"><label>Confirm Before Delete</label>${tog('confirmDelete',appSettings.confirmDelete)}</div>
    <div class="set-row"><label>Daily Motivation Quote</label>${tog('dailyQuote',appSettings.dailyQuote)}</div>
  </section>
</div>`;
  } else if(window._settingsTab==='taskdefaults'){
    // Parse current label settings
    let sl={todo:'To Do',doing:'In Progress',done:'Done'};
    try{sl=JSON.parse(appSettings.statusLabels||'{}')}catch{}
    let pl={'0':'None','1':'Normal','2':'High','3':'Critical'};
    try{pl=JSON.parse(appSettings.priorityLabels||'{}')}catch{}
    let pc={'0':'#64748B','1':'#3B82F6','2':'#F59E0B','3':'#EF4444'};
    try{pc=JSON.parse(appSettings.priorityColors||'{}')}catch{}
    const staleDays=appSettings.smartFilterStale||'7';
    const qwMin=appSettings.smartFilterQuickWin||'15';

    content=`<div class="settings-grid">
  <section class="settings-section">
    <h3>Custom Status Labels</h3>
    <p style="font-size:11px;color:var(--txd);margin-bottom:8px">Rename statuses shown on board columns and task cards. Internal values stay the same.</p>
    <div class="set-row"><label>To Do</label><input type="text" id="sl-todo" value="${esc(sl.todo)}" style="width:140px;padding:6px 8px;border:1px solid var(--brd);border-radius:var(--rs);background:var(--bg-c);color:var(--tx);font-size:13px"></div>
    <div class="set-row"><label>In Progress</label><input type="text" id="sl-doing" value="${esc(sl.doing)}" style="width:140px;padding:6px 8px;border:1px solid var(--brd);border-radius:var(--rs);background:var(--bg-c);color:var(--tx);font-size:13px"></div>
    <div class="set-row"><label>Done</label><input type="text" id="sl-done" value="${esc(sl.done)}" style="width:140px;padding:6px 8px;border:1px solid var(--brd);border-radius:var(--rs);background:var(--bg-c);color:var(--tx);font-size:13px"></div>
    <div style="margin-top:8px;text-align:right"><button class="btn-s" id="sl-save" style="font-size:12px;padding:6px 14px">Save Labels</button></div>
  </section>
  <section class="settings-section">
    <h3>Custom Priority Labels &amp; Colors</h3>
    <p style="font-size:11px;color:var(--txd);margin-bottom:8px">Rename priorities and customize their colors.</p>
    <div class="set-row"><label>None</label><input type="text" id="pl-0" value="${esc(pl['0'])}" style="width:100px;padding:6px 8px;border:1px solid var(--brd);border-radius:var(--rs);background:var(--bg-c);color:var(--tx);font-size:13px"><label class="color-pick" style="--swatch:${pc['0']}"><input type="color" id="pc-0" value="${pc['0']}"></label></div>
    <div class="set-row"><label>Normal</label><input type="text" id="pl-1" value="${esc(pl['1'])}" style="width:100px;padding:6px 8px;border:1px solid var(--brd);border-radius:var(--rs);background:var(--bg-c);color:var(--tx);font-size:13px"><label class="color-pick" style="--swatch:${pc['1']}"><input type="color" id="pc-1" value="${pc['1']}"></label></div>
    <div class="set-row"><label>High</label><input type="text" id="pl-2" value="${esc(pl['2'])}" style="width:100px;padding:6px 8px;border:1px solid var(--brd);border-radius:var(--rs);background:var(--bg-c);color:var(--tx);font-size:13px"><label class="color-pick" style="--swatch:${pc['2']}"><input type="color" id="pc-2" value="${pc['2']}"></label></div>
    <div class="set-row"><label>Critical</label><input type="text" id="pl-3" value="${esc(pl['3'])}" style="width:100px;padding:6px 8px;border:1px solid var(--brd);border-radius:var(--rs);background:var(--bg-c);color:var(--tx);font-size:13px"><label class="color-pick" style="--swatch:${pc['3']}"><input type="color" id="pc-3" value="${pc['3']}"></label></div>
    <div style="margin-top:8px;text-align:right"><button class="btn-s" id="pl-save" style="font-size:12px;padding:6px 14px">Save Priorities</button></div>
  </section>
  <section class="settings-section">
    <h3>Smart Filter Thresholds</h3>
    <p style="font-size:11px;color:var(--txd);margin-bottom:8px">Configure when tasks appear in smart filters.</p>
    <div class="set-row"><label>Stale threshold (days)</label><select data-key="smartFilterStale">${[3,5,7,14,30].map(d=>`<option value="${d}"${String(staleDays)===String(d)?' selected':''}>${d} days</option>`).join('')}</select></div>
    <div class="set-row"><label>Quick Win max (minutes)</label><select data-key="smartFilterQuickWin">${[5,10,15,30,60].map(m=>`<option value="${m}"${String(qwMin)===String(m)?' selected':''}>${m} min</option>`).join('')}</select></div>
  </section>
</div>`;
  } else if(window._settingsTab==='listconfig'){
    // Grocery category editor
    let cats=[];
    try{const raw=await api.get('/api/lists/categories/configured');cats=Array.isArray(raw)?raw:[]}catch{}
    content=`<div class="settings-grid"><section class="settings-section">
    <h3>Grocery Categories</h3>
    <p style="font-size:11px;color:var(--txd);margin-bottom:8px">Customize categories for grocery lists. Drag to reorder.</p>
    <div id="gc-list">`;
    cats.forEach((cat,i)=>{
      content+=`<div class="gc-row" draggable="true" data-gci="${i}" style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-bottom:1px solid var(--brd)">
        <span class="material-icons-round" style="font-size:14px;color:var(--txd);cursor:grab">drag_indicator</span>
        <input type="text" class="gc-input" value="${esc(cat)}" style="flex:1;padding:4px 8px;border:1px solid var(--brd);border-radius:var(--rs);background:var(--bg-c);color:var(--tx);font-size:13px">
        <button class="gc-up" data-gci="${i}" style="background:none;border:none;cursor:pointer;color:var(--txd);padding:2px"${i===0?' disabled':''}><span class="material-icons-round" style="font-size:16px">arrow_upward</span></button>
        <button class="gc-dn" data-gci="${i}" style="background:none;border:none;cursor:pointer;color:var(--txd);padding:2px"${i===cats.length-1?' disabled':''}><span class="material-icons-round" style="font-size:16px">arrow_downward</span></button>
        <button class="gc-del" data-gci="${i}" style="background:none;border:none;cursor:pointer;color:var(--dn);font-size:16px"><span class="material-icons-round" style="font-size:16px">close</span></button>
      </div>`;
    });
    content+=`</div>
    <div style="margin-top:8px;display:flex;gap:8px">
      <button class="btn-c" id="gc-add" style="font-size:12px;padding:6px 12px">+ Add Category</button>
      <button class="btn-s" id="gc-save" style="font-size:12px;padding:6px 14px;margin-left:auto">Save Categories</button>
    </div></section></div>`;
  } else if(window._settingsTab==='appearance'){
    const themeColors={midnight:'#2563EB',charcoal:'#8B5CF6',forest:'#00E676',ocean:'#29B6F6',rose:'#FF4081',light:'#2563EB',nord:'#88C0D0',sunset:'#FF7043'};
    content=`<div class="settings-grid"><section class="settings-section"><h3>Theme</h3>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px">`;
    [['midnight','Midnight'],['charcoal','Charcoal'],['forest','Forest'],['ocean','Ocean'],['rose','Rose'],['light','Light'],['nord','Nord'],['sunset','Sunset']].forEach(([id,name])=>{
      const isActive=(appSettings.theme||localStorage.getItem('lf-theme')||'midnight')===id;
      content+=`<div class="theme-card${isActive?' active':''}" data-theme="${id}" style="padding:12px;background:var(--bg-c);border:2px solid ${isActive?'var(--brand)':'var(--brd)'};border-radius:var(--rs);cursor:pointer;text-align:center;transition:all .15s">
        <div style="width:24px;height:24px;border-radius:50%;background:${themeColors[id]||'var(--brand)'};margin:0 auto 6px"></div>
        <div style="font-size:12px;font-weight:${isActive?'600':'400'}">${name}</div>
      </div>`;
    });
    content+=`</div></section></div>`;
  } else if(window._settingsTab==='badges'){
    const badgeDefs=[
      {type:'first-10-tasks',icon:'🏆',name:'First 10 Tasks',desc:'Complete 10 tasks'},
      {type:'first-focus',icon:'🎯',name:'Focus Starter',desc:'Complete your first focus session'},
      {type:'streak-7',icon:'🔥',name:'7-Day Streak',desc:'Complete tasks 7 days in a row'},
      {type:'streak-30',icon:'⚡',name:'30-Day Streak',desc:'Complete tasks 30 days in a row'},
      {type:'century',icon:'💯',name:'Century',desc:'Complete 100 tasks'},
      {type:'all-areas-active',icon:'🌟',name:'All Areas Active',desc:'Activity in every life area within 7 days'}
    ];
    let earned=[];
    try{const badges=await api.get('/api/badges');earned=badges.map(b=>b.type)}catch{}
    const _now=Date.now();
    if(!window._lastBadgeCheck||_now-window._lastBadgeCheck>60000){
      window._lastBadgeCheck=_now;
      try{const check=await api.post('/api/badges/check',{});if(check.earned&&check.earned.length){earned.push(...check.earned);check.earned.forEach(b=>{const def=badgeDefs.find(d=>d.type===b);if(def)showToast('🏆 Badge earned: '+def.name+'!')})}}catch{}
    }
    content=`<div class="settings-grid"><section class="settings-section">
    <h3>Achievement Badges</h3>
    <p style="font-size:12px;color:var(--txd);margin-bottom:16px">${earned.length} of ${badgeDefs.length} badges earned</p>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px">`;
    badgeDefs.forEach(b=>{
      const has=earned.includes(b.type);
      content+=`<div style="padding:16px;background:${has?'var(--bg-s)':'var(--bg-c)'};border:2px solid ${has?'var(--brand)':'var(--brd)'};border-radius:var(--r);text-align:center;opacity:${has?1:.5}">
        <div style="font-size:32px;margin-bottom:6px">${b.icon}</div>
        <div style="font-size:13px;font-weight:600;margin-bottom:2px">${b.name}</div>
        <div style="font-size:11px;color:var(--txd)">${b.desc}</div>
        ${has?'<div style="font-size:10px;color:var(--ok);margin-top:4px">✓ Earned</div>':''}
      </div>`;
    });
    content+=`</div></section></div>`;
  } else if(window._settingsTab==='data'){
    content+=`<div class="settings-grid"><section class="settings-section"><h3>Data</h3>
    <div class="set-row"><label class="set-label">Export</label><button class="set-btn" id="set-export">Export All Data (JSON)</button></div>
    <div class="set-row"><label class="set-label">Import</label><button class="set-btn" id="set-import">Import Data</button><input type="file" id="import-file" accept=".json" style="display:none"></div>
    <div class="set-row"><button class="set-btn danger" id="set-reset">Reset All Settings</button></div>
    </section></div>`;
  } else if(window._settingsTab==='shortcuts'){
    content=`<div class="settings-grid"><section class="settings-section"><h3>Keyboard Shortcuts</h3><p style="font-size:12px;color:var(--tx-s);margin-bottom:12px">Click a key binding to reassign. Press Escape to cancel.</p>`;
    const labels={'search':'Search / Command Palette','quick-add':'Quick Add Task','help':'Show Shortcuts Help','today':'Today','all-tasks':'All Tasks','board':'Board','calendar':'Calendar','dashboard':'Dashboard','weekly':'Weekly Plan','matrix':'Matrix','logbook':'Activity Log','tags-view':'Tags','focus-history':'Focus History','multi-select':'Multi-select Mode','daily-review':'Daily Review','vim-down':'Move Down (Vim)','vim-up':'Move Up (Vim)','vim-complete':'Complete Task (Vim)','vim-open':'Open Task (Vim)'};
    Object.keys(labels).forEach(action=>{
      const bound=_shortcutMap[action]||DEFAULT_SHORTCUTS[action];
      const isCustom=_shortcutMap[action]&&_shortcutMap[action]!==DEFAULT_SHORTCUTS[action];
      content+=`<div class="kb-row" style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--brd)"><span style="font-size:13px">${labels[action]}</span><span class="kb-rebind" data-action="${action}" style="cursor:pointer;font-size:11px;padding:2px 8px;background:var(--bg-c);border:1px solid ${isCustom?'var(--brand)':'var(--brd)'};border-radius:4px;font-family:monospace;min-width:50px;text-align:center">${esc(bound)}</span></div>`;
    });
    content+=`<div style="margin-top:12px"><button class="set-btn" id="set-reset-shortcuts" style="font-size:12px">Reset to Defaults</button></div>`;
    content+=`</section></div>`;
  }

  c.innerHTML=tabsHtml+`<div role="tabpanel" aria-labelledby="stab-${window._settingsTab}">`+content+`</div>`;

  // Wire tab clicks + search filter
  wireSettingsTabs();

  // Auto-save on change for selects and number inputs
  c.querySelectorAll('select[data-key], input[type="number"][data-key]').forEach(el=>{
    el.addEventListener('change',async()=>{
      await saveSetting(el.dataset.key,el.value);
      if(el.dataset.key==='theme'){
        document.documentElement.setAttribute('data-theme',el.value);
        localStorage.setItem('lf-theme',el.value);
      }
      applySettingsToTimer();
      showSavedIndicator(el);
    });
  });
  // Toggle switches
  c.querySelectorAll('.set-toggle input[data-key]').forEach(el=>{
    el.addEventListener('change',async()=>{
      await saveSetting(el.dataset.key,el.checked?'true':'false');
      showSavedIndicator(el.closest('.set-toggle'));
    });
  });
  // Theme cards
  c.querySelectorAll('.theme-card').forEach(card=>card.addEventListener('click',async()=>{
    const theme=card.dataset.theme;
    document.documentElement.setAttribute('data-theme',theme);
    localStorage.setItem('lf-theme',theme);localStorage.setItem('lf-theme-explicit','true');
    document.documentElement.removeAttribute('data-theme-auto');
    await saveSetting('theme',theme);
    renderSettings();
  }));
  // Status labels save
  $('sl-save')?.addEventListener('click',async()=>{
    const labels={todo:$('sl-todo').value.trim()||'To Do',doing:$('sl-doing').value.trim()||'In Progress',done:$('sl-done').value.trim()||'Done'};
    await saveSetting('statusLabels',JSON.stringify(labels));showToast('Status labels saved');
  });
  // Auto-save status labels on input (debounced)
  let _slTimer;
  ['sl-todo','sl-doing','sl-done'].forEach(id=>{
    $(id)?.addEventListener('input',()=>{clearTimeout(_slTimer);_slTimer=setTimeout(async()=>{
      const labels={todo:$('sl-todo')?.value.trim()||'To Do',doing:$('sl-doing')?.value.trim()||'In Progress',done:$('sl-done')?.value.trim()||'Done'};
      await saveSetting('statusLabels',JSON.stringify(labels));showSavedIndicator($('sl-todo')?.parentElement);
    },800)});
  });
  // Priority labels+colors save
  $('pl-save')?.addEventListener('click',async()=>{
    const labels={'0':$('pl-0').value.trim()||'None','1':$('pl-1').value.trim()||'Normal','2':$('pl-2').value.trim()||'High','3':$('pl-3').value.trim()||'Critical'};
    const colors={'0':$('pc-0').value,'1':$('pc-1').value,'2':$('pc-2').value,'3':$('pc-3').value};
    await saveSetting('priorityLabels',JSON.stringify(labels));
    await saveSetting('priorityColors',JSON.stringify(colors));
    showToast('Priority settings saved');
  });
  // Auto-save priority labels/colors (debounced)
  let _plTimer;
  ['pl-0','pl-1','pl-2','pl-3','pc-0','pc-1','pc-2','pc-3'].forEach(id=>{
    $(id)?.addEventListener('input',()=>{clearTimeout(_plTimer);_plTimer=setTimeout(async()=>{
      const labels={'0':$('pl-0')?.value.trim()||'None','1':$('pl-1')?.value.trim()||'Normal','2':$('pl-2')?.value.trim()||'High','3':$('pl-3')?.value.trim()||'Critical'};
      const colors={'0':$('pc-0')?.value||'#64748B','1':$('pc-1')?.value||'#3B82F6','2':$('pc-2')?.value||'#F59E0B','3':$('pc-3')?.value||'#EF4444'};
      await saveSetting('priorityLabels',JSON.stringify(labels));
      await saveSetting('priorityColors',JSON.stringify(colors));
      showSavedIndicator($('pl-0')?.parentElement);
    },800)});
  });
  // Grocery category editor
  $('gc-add')?.addEventListener('click',()=>{
    const list=document.getElementById('gc-list');
    const i=list.children.length;
    const row=document.createElement('div');row.className='gc-row';row.style.cssText='display:flex;align-items:center;gap:8px;padding:6px 8px;border-bottom:1px solid var(--brd)';
    row.innerHTML=`<span class="material-icons-round" style="font-size:14px;color:var(--txd)">drag_indicator</span>
      <input type="text" class="gc-input" value="" placeholder="New category" style="flex:1;padding:4px 8px;border:1px solid var(--brd);border-radius:var(--rs);background:var(--bg-c);color:var(--tx);font-size:13px">
      <button class="gc-del" style="background:none;border:none;cursor:pointer;color:var(--dn);font-size:16px"><span class="material-icons-round" style="font-size:16px">close</span></button>`;
    row.querySelector('.gc-del').addEventListener('click',()=>row.remove());
    list.appendChild(row);
    row.querySelector('.gc-input').focus();
  });
  c.querySelectorAll('.gc-del').forEach(btn=>btn.addEventListener('click',()=>btn.closest('.gc-row').remove()));
  // Grocery up/down reorder
  c.querySelectorAll('.gc-up,.gc-dn').forEach(btn=>btn.addEventListener('click',()=>{
    const row=btn.closest('.gc-row');const list=row.parentElement;
    if(btn.classList.contains('gc-up')&&row.previousElementSibling)list.insertBefore(row,row.previousElementSibling);
    else if(btn.classList.contains('gc-dn')&&row.nextElementSibling)list.insertBefore(row.nextElementSibling,row);
  }));
  $('gc-save')?.addEventListener('click',async()=>{
    const inputs=Array.from(document.querySelectorAll('#gc-list .gc-input'));
    const cats=inputs.map(i=>i.value.trim()).filter(Boolean);
    await saveSetting('groceryCategories',JSON.stringify(cats));showToast('Categories saved');
  });
  // Export
  $('set-export')?.addEventListener('click',async()=>{
    try{
      const data={areas:await api.get('/api/areas'),settings:appSettings};
      for(const a of data.areas){a.goals=await api.get('/api/areas/'+a.id+'/goals');for(const g of a.goals){g.tasks=await api.get('/api/goals/'+g.id+'/tasks')}}
      const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');a.href=url;a.download='lifeflow-export-'+_toDateStr(new Date())+'.json';a.click();
      URL.revokeObjectURL(url);showToast('Data exported!');
    }catch(e){showToast('Export failed')}
  });
  // Import
  $('set-import')?.addEventListener('click',()=>$('import-file').click());
  // Shortcut rebinding
  c.querySelectorAll('.kb-rebind').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const action=btn.dataset.action;
      btn.textContent='Press key...';btn.style.borderColor='var(--brand)';
      const handler=ev=>{
        ev.preventDefault();ev.stopPropagation();
        if(ev.key==='Escape'){btn.textContent=_shortcutMap[action]||DEFAULT_SHORTCUTS[action];btn.style.borderColor='var(--brd)';document.removeEventListener('keydown',handler,true);return}
        const combo=_keyStr(ev);
        // Conflict detection
        const conflict=Object.entries(_shortcutMap).find(([a,k])=>a!==action&&k===combo);
        if(conflict){showToast(`"${combo}" already used by ${conflict[0]}`);return}
        _shortcutMap[action]=combo;_saveShortcuts();
        document.removeEventListener('keydown',handler,true);
        renderSettings();showToast(`Shortcut updated: ${combo}`);
      };
      document.addEventListener('keydown',handler,true);
    });
  });
  $('set-reset-shortcuts')?.addEventListener('click',()=>{
    _shortcutMap={...DEFAULT_SHORTCUTS};_saveShortcuts();renderSettings();showToast('Shortcuts reset to defaults');
  });
  // Reset
  $('set-reset')?.addEventListener('click',async()=>{
    if(!confirm('Reset all settings to defaults?'))return;
    try{appSettings=await api.post('/api/settings/reset',{});renderSettings();showToast('Settings reset to defaults')}catch(e){showToast('Reset failed')}
  });
}
function showSavedIndicator(el){
  const ind=document.createElement('span');ind.className='set-saved';ind.textContent='Saved ✓';
  el.parentElement.appendChild(ind);
  setTimeout(()=>ind.remove(),1500);
}
function applySettingsToTimer(){
  const fd=Number(appSettings.focusDuration)||25,sb=Number(appSettings.shortBreak)||5,lb=Number(appSettings.longBreak)||15;
  FT_MODES.focus.dur=fd*60;FT_MODES.short.dur=sb*60;FT_MODES.long.dur=lb*60;
}

// ─── LISTS VIEW ───
const LIST_TYPE_ICONS={checklist:'✅',grocery:'🛒',notes:'📝'};

function openListModal(editList){
  const isEdit=!!editList;
  $('lm-t').textContent=isEdit?'Edit List':'New List';
  $('lm-save').textContent=isEdit?'Save':'Create';
  $('lm-name').value=isEdit?editList.name:'';
  $('lm-icon').value=isEdit?(editList.icon||'📋'):'📋';
  $('lm-color').value=isEdit?(editList.color||'#2563EB'):'#2563EB';
  $('lm-edit-id').value=isEdit?editList.id:'';
  $('lm-parent').value='';
  buildSwatches('lm-sw','lm-color',isEdit?(editList.color||'#2563EB'):'#2563EB');
  // Type selector
  const selType=isEdit?editList.type:'checklist';
  document.querySelectorAll('.lm-type').forEach(t=>{
    t.classList.toggle('sel',t.dataset.type===selType);
    t.style.borderColor=t.dataset.type===selType?'var(--brand)':'var(--brd)';
  });
  if(isEdit){document.querySelectorAll('.lm-type').forEach(t=>{t.style.pointerEvents='none';t.style.opacity='.6'})}
  else{document.querySelectorAll('.lm-type').forEach(t=>{t.style.pointerEvents='';t.style.opacity=''})}
  // Area dropdown
  const asel=$('lm-area');
  asel.innerHTML='<option value="">None</option>'+areas.map(a=>`<option value="${a.id}"${isEdit&&editList.area_id===a.id?' selected':''}>${esc(a.icon)} ${esc(a.name)}</option>`).join('');
  // Templates
  const tplDiv=$('lm-tpl');
  if(isEdit){tplDiv.style.display='none'}else{
    tplDiv.style.display='';
    api.get('/api/lists/templates').then(tpls=>{
      // Group templates by category (order preserved from API response)
      const groups={};
      tpls.forEach(t=>{(groups[t.category||'Other']=groups[t.category||'Other']||[]).push(t)});
      let html='';
      for(const[cat,items]of Object.entries(groups)){
        html+=`<div style="font-size:10px;color:var(--txd);margin-top:6px;margin-bottom:2px;text-transform:uppercase;letter-spacing:0.5px">${esc(cat)}</div>`;
        html+=`<div style="display:flex;gap:6px;flex-wrap:wrap">`;
        items.forEach(t=>{html+=`<button class="btn-c lm-tpl-btn" data-tid="${escA(t.id)}" style="font-size:11px;padding:4px 10px">${esc(t.icon)} ${esc(t.name)}</button>`});
        html+=`</div>`;
      }
      $('lm-tpl-list').innerHTML=html;
      $('lm-tpl-list').querySelectorAll('.lm-tpl-btn').forEach(b=>b.addEventListener('click',async()=>{
        const r=await api.post('/api/lists/from-template',{template_id:b.dataset.tid});
        $('lm').classList.remove('active');
        await loadUserLists();activeListId=r.id;activeListName=r.name;currentView='listdetail';render();
      }));
    }).catch(()=>{});
  }
  $('lm').classList.add('active');$('lm-name').focus();$('lm-err-banner')?.classList.remove('show');
}

// Type selector clicks
document.querySelectorAll('.lm-type').forEach(t=>t.addEventListener('click',()=>{
  document.querySelectorAll('.lm-type').forEach(x=>{x.classList.remove('sel');x.style.borderColor='var(--brd)'});
  t.classList.add('sel');t.style.borderColor='var(--brand)';
  // Set default icon based on type
  const icons={checklist:'📋',grocery:'🛒',notes:'📝',tracker:'📊'};
  $('lm-icon').value=icons[t.dataset.type]||'📋';
}));
$('lm-cancel').addEventListener('click',()=>$('lm').classList.remove('active'));
$('lm-save').addEventListener('click',async()=>{
  if(!validateField('lm-name',{required:true,maxlength:100,requiredMsg:'Please enter a list name'}))return;
  const name=$('lm-name').value.trim();
  const type=document.querySelector('.lm-type.sel')?.dataset.type||'checklist';
  const icon=$('lm-icon').value||'📋';
  const color=$('lm-color').value;
  const area_id=$('lm-area').value?Number($('lm-area').value):null;
  const editId=$('lm-edit-id').value;
  const parent_id=$('lm-parent').value?Number($('lm-parent').value):null;
  if(editId){
    await api.put('/api/lists/'+editId,{name,icon,color,area_id});
  }else{
    const r=await api.post('/api/lists',{name,type,icon,color,area_id,parent_id});
    activeListId=r.id;activeListName=r.name;
  }
  $('lm').classList.remove('active');
  await loadUserLists();
  if(!editId){currentView='listdetail';}
  render();
});

async function renderLists(){
  const c=$('ct');
  let lists=[];
  try{lists=await api.get('/api/lists');userLists=lists;renderSBLists()}catch(e){}
  const parents=lists.filter(l=>!l.parent_id);
  let h=`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px"><h2 style="margin:0">Lists</h2><button class="btn-s" id="lists-add-btn">+ New List</button></div>`;
  if(!lists.length){
    h+=emptyS('list','No lists yet','Create a checklist, grocery list, or notes list to get started',
      `<button class="btn-s" id="lists-empty-add">+ New List</button>`);
    c.innerHTML=h;
    $('lists-add-btn').addEventListener('click',()=>openListModal());
    $('lists-empty-add')?.addEventListener('click',()=>openListModal());
    return;
  }
  h+=`<div class="list-grid">`;
  parents.forEach(l=>{
    const pct=l.item_count?Math.round((l.checked_count||0)/l.item_count*100):0;
    const typeLabel=l.type==='grocery'?'Grocery':l.type==='notes'?'Notes':'Checklist';
    const subs=lists.filter(s=>s.parent_id===l.id);
    h+=`<div class="list-card" data-lid="${l.id}">
      <div class="list-card-head">
        <span class="list-card-icon" style="background:${escA(l.color||'#2563EB')}20;color:${escA(l.color||'#2563EB')}">${esc(l.icon||'📋')}</span>
        <div style="flex:1;min-width:0"><div class="list-card-name">${esc(l.name)}</div>
        <div class="list-card-type">${typeLabel}${subs.length?' · '+subs.length+' sub-list'+(subs.length>1?'s':''):''}</div></div>
        ${l.share_token?'<span class="list-share-badge" title="Shared"><span class="material-icons-round" style="font-size:14px">link</span></span>':''}
      </div>
      ${l.item_count?`<div class="list-card-progress"><div style="flex:1;height:4px;background:var(--brd);border-radius:2px"><div style="height:100%;width:${pct}%;background:${escA(l.color||'#2563EB')};border-radius:2px"></div></div><span class="list-card-meta">${l.checked_count||0}/${l.item_count}</span></div>`:''}
      ${subs.length?`<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px">${subs.map(s=>`<span class="sub-list-chip" data-lid="${s.id}" title="${esc(s.name)}">${esc(s.icon)} ${esc(s.name)}</span>`).join('')}</div>`:''}
    </div>`;
  });
  h+=`</div>`;
  c.innerHTML=h;
  $('lists-add-btn').addEventListener('click',()=>openListModal());
  c.querySelectorAll('.list-card').forEach(card=>card.addEventListener('click',e=>{
    // If clicked on a sub-list chip, navigate to that sub-list instead
    const chip=e.target.closest('.sub-list-chip');
    if(chip){
      e.stopPropagation();
      const lid=Number(chip.dataset.lid);
      const lst=lists.find(x=>x.id===lid);
      activeListId=lid;activeListName=lst?lst.name:'List';currentView='listdetail';
      document.querySelectorAll('.ni,.ai,.sf-item').forEach(n=>n.classList.remove('active'));
      render();
      return;
    }
    const lid=Number(card.dataset.lid);
    const lst=lists.find(x=>x.id===lid);
    activeListId=lid;activeListName=lst?lst.name:'List';currentView='listdetail';
    document.querySelectorAll('.ni,.ai,.sf-item').forEach(n=>n.classList.remove('active'));
    render();
  }));
}

// Track list UI state (hide checked, collapsed sections)
let _listHideChecked=false, _listCollapsed={};

function _renderItemMeta(i){
  const m=i.metadata?JSON.parse(i.metadata):{};
  let out='';
  if(m.price)out+=`<span class="li-meta-price">$${esc(String(m.price))}</span>`;
  if(m.rating)out+=`<span class="li-meta-rating">${'★'.repeat(m.rating)+'☆'.repeat(5-m.rating)}</span>`;
  if(m.url)out+=`<a class="li-meta-url" href="${escA(m.url)}" target="_blank" rel="noopener"><span class="material-icons-round" style="font-size:12px">link</span></a>`;
  return out;
}

async function renderListDetail(){
  const c=$('ct');
  if(!activeListId){currentView='lists';render();return}
  let list,items=[];
  try{[list,items]=await Promise.all([
    api.get('/api/lists').then(ls=>ls.find(x=>x.id===activeListId)),
    api.get('/api/lists/'+activeListId+'/items')
  ])}catch(e){c.innerHTML='<p>Error loading list</p>';return}
  if(!list){currentView='lists';render();return}
  activeListName=list.name;
  const isGrocery=list.type==='grocery',isNotes=list.type==='notes',isTracker=list.type==='tracker';
  const isBoard=(list.view_mode==='board')||isTracker;
  const checkedCnt=items.filter(i=>i.checked).length;
  const totalCnt=items.length;
  const pct=totalCnt?Math.round(checkedCnt/totalCnt*100):0;

  // Filter items if hide-checked is on
  const visibleItems=_listHideChecked?items.filter(i=>!i.checked):items;

  let h=`<div class="list-detail-head">
    <span style="font-size:28px">${esc(list.icon||'📋')}</span>
    <div style="flex:1;min-width:0;overflow:hidden"><h2 style="margin:0">${esc(list.name)}</h2><span style="font-size:11px;color:var(--txd)">${isGrocery?'Grocery List':isNotes?'Notes':isTracker?'Tracker':'Checklist'} · ${totalCnt} item${totalCnt!==1?'s':''}</span></div>
    <div class="list-detail-actions">
      ${isTracker?`<button class="btn-c${isBoard?' active':''}" id="ld-view-toggle" title="Toggle board/list view"><span class="material-icons-round" style="font-size:16px">${isBoard?'view_kanban':'view_list'}</span></button>`:''}
      ${isGrocery?`<button class="btn-c" id="ld-shop" title="Shop mode" style="font-weight:600;font-size:12px"><span class="material-icons-round" style="font-size:16px">shopping_cart</span> Shop</button>`:''}
      ${!isNotes?`<button class="btn-c${_listHideChecked?' active':''}" id="ld-hide-checked" title="${_listHideChecked?'Show checked':'Hide checked'}"><span class="material-icons-round" style="font-size:16px">${_listHideChecked?'visibility_off':'visibility'}</span></button>`:''} 
      <button class="btn-c" id="ld-print" title="Print list"><span class="material-icons-round" style="font-size:16px">print</span></button>
      <button class="btn-c" id="ld-edit" title="Edit list"><span class="material-icons-round" style="font-size:16px">edit</span></button>
      <button class="btn-c" id="ld-dup" title="Duplicate list"><span class="material-icons-round" style="font-size:16px">content_copy</span></button>
      <button class="btn-c" id="ld-uncheck" title="Uncheck all items"><span class="material-icons-round" style="font-size:16px">restart_alt</span></button>
      <button class="btn-c" id="ld-share" title="Share"><span class="material-icons-round" style="font-size:16px">${list.share_token?'link':'link_off'}</span></button>
      <button class="btn-c" id="ld-del" title="Delete list" style="color:var(--dn)"><span class="material-icons-round" style="font-size:16px">delete</span></button>
    </div>
  </div>`;

  // Progress bar
  if(!isNotes && totalCnt > 0){
    h+=`<div class="li-progress-bar" style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
      <div style="flex:1;height:6px;background:var(--brd);border-radius:3px;overflow:hidden"><div style="height:100%;width:${pct}%;background:${pct===100?'var(--ok)':escA(list.color||'#2563EB')};border-radius:3px;transition:width .3s"></div></div>
      <span style="font-size:12px;color:var(--tx2);white-space:nowrap">${checkedCnt}/${totalCnt} (${pct}%)</span>
    </div>`;
  }

  // Share pill
  if(list.share_token){
    const shareUrl=location.origin+'/share/'+list.share_token;
    h+=`<div class="share-pill shared"><span class="material-icons-round" style="font-size:14px">link</span> Shared · <span class="share-url-box" title="Click to copy">${escA(shareUrl)}</span> <button class="btn-c" id="ld-copy-link" style="font-size:10px;padding:2px 8px">Copy</button> <button class="btn-c" id="ld-unshare" style="font-size:10px;padding:2px 8px;color:var(--dn)">Stop sharing</button></div>`;
  }

  // Clear checked button
  if(!isNotes && checkedCnt>0 && !_listHideChecked){
    h+=`<div style="margin:8px 0"><button class="btn-c" id="ld-clear-checked" style="font-size:11px"><span class="material-icons-round" style="font-size:14px;vertical-align:middle">cleaning_services</span> Clear ${checkedCnt} checked</button></div>`;
  }

  // Hidden count indicator
  if(_listHideChecked && checkedCnt>0){
    h+=`<div style="margin:4px 0 8px;font-size:11px;color:var(--txd);font-style:italic">${checkedCnt} checked item${checkedCnt>1?'s':''} hidden</div>`;
  }

  // ─── Render items by section ───
  if(isBoard && !isGrocery){
    // ─── Board / Kanban view ───
    const cols=list.board_columns?JSON.parse(list.board_columns):['Want','In Progress','Done'];
    h+=`<div class="li-board">`;
    cols.forEach(col=>{
      const colItems=items.filter(i=>(i.status||cols[0])===col);
      h+=`<div class="li-board-col" data-col="${escA(col)}">
        <div class="li-board-col-head"><span>${esc(col)}</span><span class="li-board-col-count">${colItems.length}</span></div>`;
      colItems.forEach(i=>{
        const meta=i.metadata?JSON.parse(i.metadata):{};
        h+=`<div class="li-board-card" data-iid="${i.id}" draggable="true">
          <span class="li-board-card-title">${esc(i.title)}</span>
          ${meta.price?`<span class="li-meta-price">$${esc(String(meta.price))}</span>`:''}
          ${meta.rating?`<span class="li-meta-rating">${'★'.repeat(meta.rating)+'☆'.repeat(5-meta.rating)}</span>`:''}
          ${meta.url?`<a class="li-meta-url" href="${escA(meta.url)}" target="_blank" rel="noopener"><span class="material-icons-round" style="font-size:12px">link</span></a>`:''}
          ${i.note?`<span class="li-board-card-note">${esc(i.note).substring(0,60)}${i.note.length>60?'...':''}</span>`:''}
          <button class="li-del" data-iid="${i.id}"><span class="material-icons-round">close</span></button>
        </div>`;
      });
      h+=`<button class="li-board-add" data-col="${escA(col)}" style="font-size:11px"><span class="material-icons-round" style="font-size:14px">add</span> Add</button>`;
      h+=`</div>`;
    });
    h+=`</div>`;
  } else if(!visibleItems.length){
    h+=`<div class="li-empty"><span class="material-icons-round" style="font-size:36px;opacity:.3">${isGrocery?'shopping_cart':isNotes?'note':'checklist'}</span><p>${_listHideChecked?'All items are checked! Toggle visibility to see them.':'No items yet. Add your first one below.'}</p></div>`;
  } else if(isNotes){
    visibleItems.forEach(i=>{
      h+=`<div class="li-item" data-iid="${i.id}" style="flex-direction:column;align-items:stretch">
        <div style="display:flex;align-items:center;gap:8px">
          <span class="li-title" style="font-weight:600">${esc(i.title)}</span>
          <button class="li-del" data-iid="${i.id}" style="opacity:1"><span class="material-icons-round">close</span></button>
        </div>
        ${i.note?`<div class="li-note-content">${esc(i.note)}</div>`:''}
      </div>`;
    });
  } else {
    // Group items by category/section
    const sections={};
    visibleItems.forEach(i=>{const s=i.category||'';if(!sections[s])sections[s]=[];sections[s].push(i)});
    const sectionNames=Object.keys(sections);
    const hasSections=sectionNames.length>1||(sectionNames.length===1&&sectionNames[0]!=='');

    if(isGrocery){
      // Grocery: ordered by GROCERY_CATEGORIES
      const catOrder=['Produce','Bakery','Dairy','Meat & Seafood','Frozen','Pantry','Beverages','Snacks','Household','Personal Care','Other'];
      // Ensure all sections are listed even if not in standard order
      const allSections=[...new Set([...catOrder,...sectionNames])];
      allSections.forEach(cat=>{
        if(!sections[cat])return;
        const sItems=sections[cat];
        const sDone=sItems.filter(x=>x.checked).length;
        const collapsed=_listCollapsed[activeListId+'_'+cat];
        h+=`<div class="li-section-header" data-sec="${escA(cat)}">
          <span class="material-icons-round li-section-arrow">${collapsed?'chevron_right':'expand_more'}</span>
          <span class="li-section-name">${esc(cat||'Uncategorized')}</span>
          <span class="li-section-count">${sDone}/${sItems.length}</span>
          <div class="li-section-progress"><div class="li-section-progress-fill" style="width:${sItems.length?Math.round(sDone/sItems.length*100):0}%;background:${escA(list.color||'#2563EB')}"></div></div>
        </div>`;
        if(!collapsed){
          sItems.forEach(i=>{
            h+=`<div class="li-item${i.checked?' checked':''}" data-iid="${i.id}">
              <button class="li-check${i.checked?' done':''}" data-iid="${i.id}"><span class="material-icons-round">${i.checked?'check_box':'check_box_outline_blank'}</span></button>
              <span class="li-title" data-iid="${i.id}">${esc(i.title)}</span>
              ${i.quantity?`<span class="li-qty">${esc(i.quantity)}</span>`:''}
              <button class="li-edit-btn" data-iid="${i.id}" title="Edit item"><span class="material-icons-round">edit</span></button>
              <button class="li-del" data-iid="${i.id}"><span class="material-icons-round">close</span></button>
            </div>`;
          });
        }
      });
    } else if(hasSections){
      // Non-grocery with sections (user-created categories)
      sectionNames.forEach(sec=>{
        const sItems=sections[sec];
        const sDone=sItems.filter(x=>x.checked).length;
        const secKey=activeListId+'_'+(sec||'_none');
        const collapsed=_listCollapsed[secKey];
        h+=`<div class="li-section-header" data-sec="${escA(sec)}">
          <span class="material-icons-round li-section-arrow">${collapsed?'chevron_right':'expand_more'}</span>
          <span class="li-section-name">${esc(sec||'Uncategorized')}</span>
          <span class="li-section-count">${sDone}/${sItems.length}</span>
          <div class="li-section-progress"><div class="li-section-progress-fill" style="width:${sItems.length?Math.round(sDone/sItems.length*100):0}%;background:${escA(list.color||'#2563EB')}"></div></div>
        </div>`;
        if(!collapsed){
          sItems.forEach(i=>{
            h+=`<div class="li-item${i.checked?' checked':''}" data-iid="${i.id}">
              <button class="li-check${i.checked?' done':''}" data-iid="${i.id}"><span class="material-icons-round">${i.checked?'check_box':'check_box_outline_blank'}</span></button>
              <span class="li-title" data-iid="${i.id}">${esc(i.title)}</span>
              <button class="li-edit-btn" data-iid="${i.id}" title="Edit item"><span class="material-icons-round">edit</span></button>
              <button class="li-del" data-iid="${i.id}"><span class="material-icons-round">close</span></button>
            </div>`;
          });
        }
      });
    } else {
      // Flat list (no sections)
      visibleItems.forEach(i=>{
        h+=`<div class="li-item${i.checked?' checked':''}" data-iid="${i.id}">
          <button class="li-check${i.checked?' done':''}" data-iid="${i.id}"><span class="material-icons-round">${i.checked?'check_box':'check_box_outline_blank'}</span></button>
          <span class="li-title" data-iid="${i.id}">${esc(i.title)}</span>
          ${_renderItemMeta(i)}
          <button class="li-edit-btn" data-iid="${i.id}" title="Edit item"><span class="material-icons-round">edit</span></button>
          <button class="li-del" data-iid="${i.id}"><span class="material-icons-round">close</span></button>
        </div>`;
      });
    }
  }

  // Add bar with section selector
  const availSections=isGrocery?['Produce','Bakery','Dairy','Meat & Seafood','Frozen','Pantry','Beverages','Snacks','Household','Personal Care','Other']:
    [...new Set(items.map(i=>i.category).filter(Boolean))];
  h+=`<div class="li-add-bar">
    <input type="text" id="ld-add-input" placeholder="${isGrocery?'Add item... (e.g. Milk x2)':isNotes?'Add note title...':'Add item...'}" style="flex:1">
    ${!isNotes&&availSections.length?`<select id="ld-add-cat" style="width:120px;font-size:11px"><option value="">No section</option>${availSections.map(c=>'<option value="'+escA(c)+'">'+esc(c)+'</option>').join('')}</select>`:''}
    <button class="btn-s" id="ld-add-btn" style="white-space:nowrap">+ Add</button>
  </div>`;

  // Add section button (non-grocery, non-notes)
  if(!isGrocery && !isNotes){
    h+=`<div style="padding:8px 16px"><button class="btn-c" id="ld-add-section" style="font-size:11px"><span class="material-icons-round" style="font-size:14px;vertical-align:middle">add</span> Add Section</button></div>`;
  }
  // Sub-lists section (only for top-level lists)
  if(!list.parent_id){
    const subs=userLists.filter(s=>s.parent_id===list.id);
    h+=`<div class="sub-list-section"><h4><span class="material-icons-round" style="font-size:16px;color:var(--brand)">folder</span> Sub-lists <span style="font-size:11px;font-weight:400;color:var(--txd)">(${subs.length})</span></h4>`;
    if(subs.length){
      h+=`<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">`;
      subs.forEach(s=>{
        h+=`<div class="sub-list-chip" data-slid="${s.id}" style="padding:8px 14px"><span style="font-size:16px">${esc(s.icon)}</span><span>${esc(s.name)}</span><span style="font-size:10px;color:var(--txd)">${s.item_count||0} items</span></div>`;
      });
      h+=`</div>`;
    }
    h+=`<button class="btn-c" id="ld-add-sublist" style="font-size:12px"><span class="material-icons-round" style="font-size:14px;vertical-align:middle">add</span> Add Sub-list</button></div>`;
  } else {
    // Show parent breadcrumb for sub-lists
    const parent=userLists.find(p=>p.id===list.parent_id);
    if(parent){
      h+=`<div style="margin-top:10px;font-size:11px;color:var(--txd)">Sub-list of <span class="ld-parent-link" data-pid="${parent.id}" style="color:var(--brand);cursor:pointer;text-decoration:underline">${esc(parent.icon)} ${esc(parent.name)}</span></div>`;
    }
  }
  c.innerHTML=h;
  // Event handlers — new Phase 1 buttons
  $('ld-hide-checked')?.addEventListener('click',()=>{_listHideChecked=!_listHideChecked;render()});
  $('ld-print')?.addEventListener('click',()=>{document.body.classList.add('print-list');window.print();document.body.classList.remove('print-list')});
  c.querySelectorAll('.li-section-header').forEach(el=>el.addEventListener('click',()=>{
    const sec=el.dataset.sec;
    const key=activeListId+'_'+(sec||'_none');
    _listCollapsed[key]=!_listCollapsed[key];render();
  }));
  $('ld-add-section')?.addEventListener('click',()=>{
    const name=prompt('Section name:');
    if(!name||!name.trim())return;
    // Check if section already exists
    const existing=[...new Set(items.map(i=>i.category).filter(Boolean))];
    if(existing.includes(name.trim())){showToast('Section already exists');return}
    // Add a placeholder item in that section
    api.post('/api/lists/'+list.id+'/items',{title:'New item',category:name.trim()}).then(()=>{loadUserLists();render()});
  });
  $('ld-shop')?.addEventListener('click',()=>openShopMode(list.id));
  // Phase 3: View toggle + board handlers
  $('ld-view-toggle')?.addEventListener('click',async()=>{
    const newMode=isBoard?'list':'board';
    await api.put('/api/lists/'+list.id,{view_mode:newMode});
    await loadUserLists();render();
  });
  // Board: add item to column
  c.querySelectorAll('.li-board-add').forEach(btn=>btn.addEventListener('click',async()=>{
    const col=btn.dataset.col;
    const title=prompt('Item title:');
    if(!title||!title.trim())return;
    await api.post('/api/lists/'+list.id+'/items',{title:title.trim(),status:col});
    await loadUserLists();render();
  }));
  // Board: drag-and-drop between columns
  c.querySelectorAll('.li-board-card[draggable]').forEach(card=>{
    card.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain',card.dataset.iid);e.dataTransfer.effectAllowed='move'});
  });
  c.querySelectorAll('.li-board-col').forEach(col=>{
    col.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='move';col.classList.add('drag-over')});
    col.addEventListener('dragleave',()=>col.classList.remove('drag-over'));
    col.addEventListener('drop',async e=>{
      e.preventDefault();col.classList.remove('drag-over');
      const iid=Number(e.dataTransfer.getData('text/plain'));
      const newStatus=col.dataset.col;
      if(!iid||!newStatus)return;
      await api.put('/api/lists/'+list.id+'/items/'+iid,{status:newStatus});
      await loadUserLists();render();
    });
  });
  // Event handlers — original
  $('ld-edit')?.addEventListener('click',()=>openListModal(list));
  $('ld-dup')?.addEventListener('click',async()=>{
    try{const r=await api.post('/api/lists/'+list.id+'/duplicate');if(r.error){showToast(r.error);return}
    await loadUserLists();activeListId=r.id;activeListName=r.name;render();showToast('List duplicated')}catch(e){showToast('Failed to duplicate list')}
  });
  $('ld-uncheck')?.addEventListener('click',async()=>{
    try{const r=await api.post('/api/lists/'+list.id+'/uncheck-all');if(r.error){showToast(r.error);return}
    if(r.unchecked===0){showToast('No checked items');return}
    await loadUserLists();render();showToast(r.unchecked+' item'+(r.unchecked>1?'s':'')+' unchecked')}catch(e){showToast('Failed to uncheck items')}
  });
  $('ld-del')?.addEventListener('click',async()=>{
    if(!confirm('Delete "'+list.name+'" and all its items?'))return;
    await api.del('/api/lists/'+list.id);
    activeListId=null;currentView='lists';await loadUserLists();render();
  });
  $('ld-share')?.addEventListener('click',async()=>{
    if(list.share_token){
      if(!confirm('Stop sharing this list?'))return;
      await api.del('/api/lists/'+list.id+'/share');
    }else{
      await api.post('/api/lists/'+list.id+'/share');
    }
    await loadUserLists();render();
  });
  $('ld-copy-link')?.addEventListener('click',()=>{
    const url=location.origin+'/share/'+list.share_token;
    navigator.clipboard.writeText(url).then(()=>{
      $('ld-copy-link').textContent='Copied!';setTimeout(()=>{$('ld-copy-link').textContent='Copy'},1500);
    });
  });
  $('ld-unshare')?.addEventListener('click',async()=>{
    await api.del('/api/lists/'+list.id+'/share');await loadUserLists();render();
  });
  $('ld-clear-checked')?.addEventListener('click',async()=>{
    await api.post('/api/lists/'+list.id+'/clear-checked');await loadUserLists();render();
  });
  // Check/uncheck
  c.querySelectorAll('.li-check').forEach(btn=>btn.addEventListener('click',async()=>{
    const iid=Number(btn.dataset.iid);
    const item=items.find(x=>x.id===iid);
    if(!item)return;
    await api.put('/api/lists/'+list.id+'/items/'+iid,{checked:item.checked?0:1});
    await loadUserLists();render();
  }));
  // Delete item
  c.querySelectorAll('.li-del').forEach(btn=>btn.addEventListener('click',async(e)=>{
    e.stopPropagation();
    const iid=Number(btn.dataset.iid);
    await api.del('/api/lists/'+list.id+'/items/'+iid);
    await loadUserLists();render();
  }));
  // ─── Inline title edit on double-click ───
  c.querySelectorAll('.li-title[data-iid]').forEach(span=>span.addEventListener('dblclick',e=>{
    e.stopPropagation();
    const iid=Number(span.dataset.iid);
    const item=items.find(x=>x.id===iid);
    if(!item||span.querySelector('input'))return;
    const orig=item.title;
    const inp=document.createElement('input');
    inp.type='text';inp.className='li-edit-input';inp.value=orig;
    span.textContent='';span.appendChild(inp);inp.focus();inp.select();
    let saved=false;
    async function save(){
      if(saved)return;saved=true;
      const val=inp.value.trim();
      if(!val||val===orig){span.textContent=orig;return}
      span.textContent=val; // optimistic
      try{await api.put('/api/lists/'+list.id+'/items/'+iid,{title:val})}catch{span.textContent=orig}
    }
    inp.addEventListener('blur',save);
    inp.addEventListener('keydown',ev=>{
      if(ev.key==='Enter'){ev.preventDefault();inp.blur()}
      if(ev.key==='Escape'){saved=true;span.textContent=orig}
    });
  }));
  // ─── Metadata editor (pencil icon) ───
  c.querySelectorAll('.li-edit-btn').forEach(btn=>btn.addEventListener('click',e=>{
    e.stopPropagation();
    const iid=Number(btn.dataset.iid);
    const item=items.find(x=>x.id===iid);
    if(!item)return;
    const row=btn.closest('.li-item');
    // Toggle: close if already open
    const existing=row.nextElementSibling;
    if(existing&&existing.classList.contains('li-meta-expand')){existing.remove();return}
    // Close any other open editors
    c.querySelectorAll('.li-meta-expand').forEach(el=>el.remove());
    const meta=item.metadata?JSON.parse(item.metadata):{};
    const ed=document.createElement('div');
    ed.className='li-meta-expand';
    ed.innerHTML=`
      <label>Title<input type="text" class="me-title" value="${escA(item.title)}" maxlength="200"></label>
      <label>Quantity<input type="text" class="me-qty" value="${escA(item.quantity||'')}"></label>
      <label>Category<input type="text" class="me-cat" value="${escA(item.category||'')}"></label>
      <label>Note<textarea class="me-note">${esc(item.note||'')}</textarea></label>
      <label>Price<input type="number" class="me-price" value="${meta.price||''}" step="0.01" min="0"></label>
      <label>URL<input type="url" class="me-url" value="${escA(meta.url||'')}"></label>
      <label>Rating (1-5)<input type="number" class="me-rating" value="${meta.rating||''}" min="1" max="5"></label>
      <div class="li-meta-actions">
        <button class="btn-cancel">Cancel</button>
        <button class="btn-save">Save</button>
      </div>`;
    row.after(ed);
    ed.querySelector('.btn-cancel').addEventListener('click',()=>ed.remove());
    ed.addEventListener('keydown',ev=>{if(ev.key==='Escape')ed.remove()});
    ed.querySelector('.btn-save').addEventListener('click',async()=>{
      const title=ed.querySelector('.me-title').value.trim();
      if(!title){showToast('Title is required');return}
      const payload={
        title,
        quantity:ed.querySelector('.me-qty').value.trim()||null,
        category:ed.querySelector('.me-cat').value.trim()||null,
        note:ed.querySelector('.me-note').value||null
      };
      const price=ed.querySelector('.me-price').value;
      const url=ed.querySelector('.me-url').value.trim();
      const rating=ed.querySelector('.me-rating').value;
      const newMeta={};
      if(price)newMeta.price=Number(price);
      if(url)newMeta.url=url;
      if(rating)newMeta.rating=Number(rating);
      if(Object.keys(newMeta).length)payload.metadata=newMeta;
      else payload.metadata=null;
      try{
        await api.put('/api/lists/'+list.id+'/items/'+iid,payload);
        await loadUserLists();render();
        showToast('Item updated');
      }catch{showToast('Failed to update item')}
    });
    ed.querySelector('.me-title').focus();
  }));
  // Add item
  async function addItem(){
    const inp=$('ld-add-input');
    let title=inp.value.trim();
    if(!title)return;
    const payload={title};
    if(isGrocery){
      // Parse quantity: "Milk x2" or "2x Milk" or "Milk (2)"
      const qm=title.match(/^(.+?)\s+x(\d+)$/i)||title.match(/^(\d+)x\s+(.+)$/i);
      if(qm){
        payload.title=qm[2]&&/^\d+$/.test(qm[1])?qm[2].trim():qm[1].trim();
        payload.quantity=qm[2]&&/^\d+$/.test(qm[1])?qm[1]:qm[2];
      }
      const catSel=$('ld-add-cat');
      if(catSel&&catSel.value)payload.category=catSel.value;
    } else if(!isNotes){
      const catSel=$('ld-add-cat');
      if(catSel&&catSel.value)payload.category=catSel.value;
    }
    if(isNotes)payload.note='';
    await api.post('/api/lists/'+list.id+'/items',payload);
    inp.value='';
    await loadUserLists();render();
  }
  $('ld-add-btn')?.addEventListener('click',addItem);
  $('ld-add-input')?.addEventListener('keydown',e=>{if(e.key==='Enter')addItem()});
  $('ld-add-input')?.focus();
  // Sub-list event handlers
  $('ld-add-sublist')?.addEventListener('click',()=>{
    openListModal();
    // Pre-fill parent_id in the modal (set after modal opens)
    setTimeout(()=>{
      if(!$('lm-parent'))return;
      $('lm-parent').value=String(list.id);
    },50);
  });
  c.querySelectorAll('.sub-list-chip[data-slid]').forEach(chip=>chip.addEventListener('click',()=>{
    const slid=Number(chip.dataset.slid);
    const sl=userLists.find(x=>x.id===slid);
    activeListId=slid;activeListName=sl?sl.name:'Sub-list';currentView='listdetail';
    document.querySelectorAll('.ni,.ai,.sf-item').forEach(n=>n.classList.remove('active'));
    render();
  }));
  c.querySelectorAll('.ld-parent-link').forEach(el=>el.addEventListener('click',()=>{
    const pid=Number(el.dataset.pid);
    const pl=userLists.find(x=>x.id===pid);
    activeListId=pid;activeListName=pl?pl.name:'List';currentView='listdetail';
    document.querySelectorAll('.ni,.ai,.sf-item').forEach(n=>n.classList.remove('active'));
    render();
  }));
  // Update breadcrumb
  updateBC();
}

// ─── SHOP MODE (Grocery full-screen) ───
let _shopCatIdx=0;
async function openShopMode(listId){
  let list,items=[];
  try{[list,items]=await Promise.all([
    api.get('/api/lists').then(ls=>ls.find(x=>x.id===listId)),
    api.get('/api/lists/'+listId+'/items')
  ])}catch(e){showToast('Failed to load list');return}
  if(!list)return;

  const catOrder=['Produce','Bakery','Dairy','Meat & Seafood','Frozen','Pantry','Beverages','Snacks','Household','Personal Care','Other'];
  const cats={};
  items.forEach(i=>{const c=i.category||'Other';if(!cats[c])cats[c]=[];cats[c].push(i)});
  const activeCats=catOrder.filter(c=>cats[c]&&cats[c].length);
  if(!activeCats.length){showToast('No items to shop');return}
  if(_shopCatIdx>=activeCats.length)_shopCatIdx=0;

  const allChecked=items.filter(i=>i.checked).length;
  const allTotal=items.length;
  const allPct=allTotal?Math.round(allChecked/allTotal*100):0;

  // Create overlay
  let ov=document.querySelector('.shop-ov');
  if(!ov){ov=document.createElement('div');ov.className='shop-ov';document.body.appendChild(ov)}

  function renderShop(){
    const cat=activeCats[_shopCatIdx];
    const cItems=cats[cat]||[];
    const unchecked=cItems.filter(x=>!x.checked);
    const checked=cItems.filter(x=>x.checked);
    const cDone=checked.length;
    const cTotal=cItems.length;

    let h=`<div class="shop-head">
      <button class="shop-close" id="shop-close"><span class="material-icons-round">close</span></button>
      <div class="shop-title">${esc(list.icon||'🛒')} ${esc(list.name)}</div>
    </div>`;

    // Category pills
    h+=`<div class="shop-cats">`;
    activeCats.forEach((c,i)=>{
      const done=cats[c].filter(x=>x.checked).length;
      const total=cats[c].length;
      const allDone=done===total;
      h+=`<button class="shop-cat-pill${i===_shopCatIdx?' active':''}${allDone?' all-done':''}" data-ci="${i}">
        ${esc(c)} <span class="shop-cat-count">${done}/${total}</span>
      </button>`;
    });
    h+=`</div>`;

    // Category header
    h+=`<div class="shop-cat-name">${esc(cat)} <span>${cDone}/${cTotal}</span></div>`;

    // Items (unchecked first, then checked)
    h+=`<div class="shop-items">`;
    if(!unchecked.length&&!checked.length){
      h+=`<div class="shop-empty">All done in this category!</div>`;
    }
    unchecked.forEach(i=>{
      h+=`<div class="shop-item" data-iid="${i.id}">
        <span class="material-icons-round shop-item-icon">check_box_outline_blank</span>
        <span class="shop-item-title">${esc(i.title)}</span>
        ${i.quantity?`<span class="shop-item-qty">${esc(i.quantity)}</span>`:''}
      </div>`;
    });
    if(checked.length){
      h+=`<div class="shop-checked-divider">Checked (${checked.length})</div>`;
      checked.forEach(i=>{
        h+=`<div class="shop-item checked" data-iid="${i.id}">
          <span class="material-icons-round shop-item-icon">check_box</span>
          <span class="shop-item-title">${esc(i.title)}</span>
          ${i.quantity?`<span class="shop-item-qty">${esc(i.quantity)}</span>`:''}
        </div>`;
      });
    }
    h+=`</div>`;

    // Nav + progress
    h+=`<div class="shop-footer">
      <button class="shop-nav-btn" id="shop-prev" ${_shopCatIdx===0?'disabled':''}><span class="material-icons-round">chevron_left</span> ${_shopCatIdx>0?esc(activeCats[_shopCatIdx-1]):''}</button>
      <div class="shop-progress"><div class="shop-progress-fill" style="width:${allPct}%"></div></div>
      <span class="shop-progress-text">${allChecked}/${allTotal}</span>
      <button class="shop-nav-btn" id="shop-next" ${_shopCatIdx>=activeCats.length-1?'disabled':''}>${_shopCatIdx<activeCats.length-1?esc(activeCats[_shopCatIdx+1]):''} <span class="material-icons-round">chevron_right</span></button>
    </div>`;

    ov.innerHTML=h;

    // Event handlers
    ov.querySelector('#shop-close').addEventListener('click',()=>{ov.remove();render()});
    ov.querySelectorAll('.shop-cat-pill').forEach(p=>p.addEventListener('click',()=>{
      _shopCatIdx=Number(p.dataset.ci);renderShop();
    }));
    ov.querySelector('#shop-prev')?.addEventListener('click',()=>{if(_shopCatIdx>0){_shopCatIdx--;renderShop()}});
    ov.querySelector('#shop-next')?.addEventListener('click',()=>{if(_shopCatIdx<activeCats.length-1){_shopCatIdx++;renderShop()}});

    // Check/uncheck items
    ov.querySelectorAll('.shop-item').forEach(el=>el.addEventListener('click',async()=>{
      const iid=Number(el.dataset.iid);
      const item=items.find(x=>x.id===iid);
      if(!item)return;
      const newChecked=item.checked?0:1;
      await api.put('/api/lists/'+listId+'/items/'+iid,{checked:newChecked});
      // Update local state
      item.checked=newChecked;
      // Recalculate cats
      Object.keys(cats).forEach(k=>cats[k]=[]);
      items.forEach(i=>{const c=i.category||'Other';if(!cats[c])cats[c]=[];cats[c].push(i)});
      renderShop();
    }));

    // Swipe support
    let touchStartX=0;
    ov.querySelector('.shop-items')?.addEventListener('touchstart',e=>{touchStartX=e.touches[0].clientX},{passive:true});
    ov.querySelector('.shop-items')?.addEventListener('touchend',e=>{
      const dx=e.changedTouches[0].clientX-touchStartX;
      if(Math.abs(dx)>60){
        if(dx<0&&_shopCatIdx<activeCats.length-1){_shopCatIdx++;renderShop()}
        else if(dx>0&&_shopCatIdx>0){_shopCatIdx--;renderShop()}
      }
    },{passive:true});

    // Escape to close
    const escHandler=e=>{if(e.key==='Escape'){ov.remove();render();document.removeEventListener('keydown',escHandler)}};
    document.addEventListener('keydown',escHandler);
  }
  renderShop();
}

// ─── HABITS VIEW ───
async function renderHabits(){
  const mc=$('ct');
  let habits=[];
  try{habits=await api.get('/api/habits')}catch(e){}
  let h=`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px"><h2 style="margin:0">Habits</h2><button class="btn-s" id="hab-add-btn">+ New Habit</button></div>`;
  // Add form (hidden initially)
  const areaOpts=areas.map(a=>`<option value="${a.id}">${esc(a.icon||'')} ${esc(a.name)}</option>`).join('');
  h+=`<div id="hab-form" style="display:none;padding:20px;background:var(--bg-c);border:1px solid var(--brd);border-radius:var(--r);margin-bottom:16px">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px">
      <span class="material-icons-round" style="font-size:18px;color:var(--brand)">add_circle</span>
      <span style="font-size:14px;font-weight:600">New Habit</span>
    </div>
    <div style="display:flex;gap:10px;align-items:end;margin-bottom:14px">
      <div style="flex-shrink:0">
        <label style="font-size:11px;color:var(--tx2);display:block;margin-bottom:4px">Icon</label>
        <div style="display:flex;gap:4px;align-items:center">
          <input type="text" id="hab-icon" value="💪" style="width:48px;padding:8px;border-radius:var(--rs);border:1px solid var(--brd);background:var(--bg-s);color:var(--tx);font-size:18px;text-align:center;font-family:inherit">
          <div id="hab-emoji-picks" style="display:flex;gap:2px"></div>
        </div>
      </div>
      <div style="flex:1;min-width:0">
        <label style="font-size:11px;color:var(--tx2);display:block;margin-bottom:4px">Habit name</label>
        <input type="text" id="hab-name" placeholder="e.g. Exercise, Read, Meditate..." maxlength="100" autocomplete="off" style="width:100%;padding:8px 12px;border-radius:var(--rs);border:1px solid var(--brd);background:var(--bg-s);color:var(--tx);font-size:13px;font-family:inherit">
      </div>
      <div style="flex-shrink:0">
        <label style="font-size:11px;color:var(--tx2);display:block;margin-bottom:4px">Color</label>
        <div style="width:36px;height:36px;border-radius:var(--rs);overflow:hidden;border:1px solid var(--brd);position:relative">
          <input type="color" id="hab-color" value="#6C63FF" style="position:absolute;inset:-4px;width:calc(100% + 8px);height:calc(100% + 8px);border:none;cursor:pointer;background:none">
        </div>
      </div>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:end;margin-bottom:16px">
      <div>
        <label style="font-size:11px;color:var(--tx2);display:block;margin-bottom:4px">Frequency</label>
        <select id="hab-freq" style="padding:8px 10px;border-radius:var(--rs);border:1px solid var(--brd);background:var(--bg-s);color:var(--tx);font-size:13px;font-family:inherit;cursor:pointer"><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select>
      </div>
      <div>
        <label id="hab-target-label" style="font-size:11px;color:var(--tx2);display:block;margin-bottom:4px">Times per day</label>
        <input type="number" id="hab-target" value="1" min="1" max="99" style="width:80px;padding:8px 10px;border-radius:var(--rs);border:1px solid var(--brd);background:var(--bg-s);color:var(--tx);font-size:13px;font-family:inherit">
      </div>
      <div>
        <label style="font-size:11px;color:var(--tx2);display:block;margin-bottom:4px">Area</label>
        <select id="hab-area" style="padding:8px 10px;border-radius:var(--rs);border:1px solid var(--brd);background:var(--bg-s);color:var(--tx);font-size:13px;font-family:inherit;cursor:pointer"><option value="">None</option>${areaOpts}</select>
      </div>
      <div id="hab-time-wrap">
        <label style="font-size:11px;color:var(--tx2);display:block;margin-bottom:4px">Preferred time</label>
        <input type="time" id="hab-time" style="padding:8px 10px;border-radius:var(--rs);border:1px solid var(--brd);background:var(--bg-s);color:var(--tx);font-size:13px;font-family:inherit">
      </div>
    </div>
    <div id="hab-day-picker" style="display:none;margin-bottom:16px">
      <label style="font-size:11px;color:var(--tx2);display:block;margin-bottom:6px" id="hab-day-label">Select days</label>
      <div id="hab-weekdays" style="display:none;gap:6px;flex-wrap:wrap">
        ${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=>`<button type="button" class="hab-day-btn" data-day="${d.toLowerCase()}" style="padding:6px 10px;border-radius:var(--rs);border:1px solid var(--brd);background:var(--bg-s);color:var(--tx);font-size:12px;cursor:pointer;transition:all .15s;font-family:inherit">${d}</button>`).join('')}
      </div>
      <div id="hab-monthdays" style="display:none;grid-template-columns:repeat(7,1fr);gap:4px;max-width:280px">
        ${Array.from({length:31},(_,i)=>i+1).map(d=>`<button type="button" class="hab-mday-btn" data-day="${d}" style="padding:4px;border-radius:var(--rs);border:1px solid var(--brd);background:var(--bg-s);color:var(--tx);font-size:11px;cursor:pointer;transition:all .15s;font-family:inherit;text-align:center">${d}</button>`).join('')}
      </div>
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end;padding-top:12px;border-top:1px solid var(--brd)">
      <button class="btn-c" id="hab-cancel">Cancel</button>
      <button class="btn-s" id="hab-save">Create Habit</button>
    </div>
  </div>`;
  if(!habits.length){
    h+=`<div style="text-align:center;padding:40px;color:var(--txd)"><span class="material-icons-round" style="font-size:48px;opacity:.3">repeat</span><p>No habits yet. Create your first habit to start tracking!</p></div>`;
  }else{
    h+=`<div class="habit-grid">`;
    for(const hab of habits){
      const pct=hab.target>0?Math.min(100,Math.round((hab.todayCount||0)/hab.target*100)):0;
      h+=`<div class="habit-card" data-hid="${hab.id}">
        <div class="hc-head"><span style="font-size:24px">${esc(hab.icon||'⭐')}</span><span class="hc-name">${esc(hab.name)}</span>${hab.preferred_time?`<span style="font-size:10px;color:var(--txd);margin-left:auto;white-space:nowrap">⏰ ${hab.preferred_time.replace(/^0/,'').replace(/^(\d+):(\d+)$/,(m,h,mi)=>Number(h)>=12?(Number(h)===12?12:Number(h)-12)+':'+mi+' PM':((Number(h)||12)+':'+mi+' AM'))}</span>`:''}
          <span class="hc-streak" style="background:${escA(hab.color||'#6C63FF')}20;color:${escA(hab.color||'#6C63FF')}">${streakEmoji(hab.streak||0)} ${hab.streak||0}${hab.total_completions?' · '+hab.total_completions+' total':''}</span></div>
        ${Array.isArray(hab.schedule_days)&&hab.schedule_days.length?`<div style="display:flex;gap:3px;flex-wrap:wrap;margin:4px 0">${hab.schedule_days.map(d=>`<span style="font-size:9px;padding:1px 5px;border-radius:4px;background:${escA(hab.color||'#6C63FF')}15;color:${escA(hab.color||'#6C63FF')};border:1px solid ${escA(hab.color||'#6C63FF')}30">${esc(String(d))}</span>`).join('')}</div>`:''}
        <div style="display:flex;align-items:center;gap:10px;margin:8px 0">
          <div class="habit-bar" style="flex:1"><div class="habit-bar-fill" style="width:${pct}%;background:${escA(hab.color||'#6C63FF')}"></div></div>
          <span style="font-size:11px;color:var(--txd)">${hab.todayCount||0}/${hab.target}</span>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div class="habit-week" id="hw-${hab.id}"></div>
          <button class="habit-check ${hab.completed?'done':''}" data-hid="${hab.id}" style="--hc:${escA(hab.color||'#6C63FF')}"><span class="material-icons-round">check</span></button>
        </div>
        <div style="display:flex;gap:4px;margin-top:6px;align-items:center;overflow:hidden">${hab.area_name?`<span style="font-size:10px;color:var(--txd);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(hab.area_icon||'')} ${esc(hab.area_name)}</span><span style="flex:1"></span>`:''}<button class="btn-c" style="font-size:10px;padding:2px 8px;flex-shrink:0" data-edit="${hab.id}">Edit</button><button class="btn-c" style="font-size:10px;padding:2px 8px;color:var(--dn);flex-shrink:0" data-del="${hab.id}">Delete</button><button class="btn-c ai-hab-coach" style="font-size:10px;padding:2px 8px;color:var(--brand);flex-shrink:0" data-hid="${hab.id}" title="AI Habit Coach"><span class="material-icons-round" style="font-size:12px;vertical-align:middle">smart_toy</span></button></div>
      </div>`;
    }
    h+=`</div>`;
  }
  mc.innerHTML=h;
  // Load heatmaps for each habit (last 7 days)
  for(const hab of habits){
    try{
      const hm=await api.get('/api/habits/'+hab.id+'/heatmap');
      const el=document.getElementById('hw-'+hab.id);if(!el)continue;
      const today=new Date();
      let dots='';
      for(let i=6;i>=0;i--){
        const d=new Date(today);d.setDate(d.getDate()-i);
        const ds=_toDateStr(d);
        const entry=hm.find(x=>x.date===ds);
        const count=entry?entry.count:0;
        const dayLbl=['S','M','T','W','T','F','S'][d.getDay()];
        dots+=`<div class="hw-day${count>0?' filled':''}" title="${ds}: ${count}" style="${count>0?'background:'+escA(hab.color||'#6C63FF'):''}">${dayLbl}</div>`;
      }
      el.innerHTML=dots;
    }catch(e){}
  }
  // Event handlers
  document.getElementById('hab-add-btn')?.addEventListener('click',()=>{$('hab-form').style.display='block'});
  document.getElementById('hab-cancel')?.addEventListener('click',()=>{$('hab-form').style.display='none'});
  // Dynamic target label based on frequency + show/hide day picker
  document.getElementById('hab-freq')?.addEventListener('change',(e)=>{
    const labels={daily:'Times per day',weekly:'Times per week',monthly:'Times per month',yearly:'Times per year'};
    const tl=document.getElementById('hab-target-label');if(tl)tl.textContent=labels[e.target.value]||'Target';
    const picker=$('hab-day-picker'),wd=$('hab-weekdays'),md=$('hab-monthdays');
    if(e.target.value==='weekly'){picker.style.display='block';wd.style.display='flex';md.style.display='none';$('hab-day-label').textContent='Select days of the week';}
    else if(e.target.value==='monthly'){picker.style.display='block';wd.style.display='none';md.style.display='grid';$('hab-day-label').textContent='Select days of the month';}
    else{picker.style.display='none';wd.style.display='none';md.style.display='none';}
    const tw=$('hab-time-wrap');if(tw)tw.style.display=e.target.value==='yearly'?'none':'block';
  });
  // Emoji quick-picks
  const emojiPicks=['💪','🏃','📚','🧘','💧','🎯','✍️','🥗','😴','🎵'];
  const ep=document.getElementById('hab-emoji-picks');
  if(ep){ep.innerHTML=emojiPicks.map(e=>`<span class="hab-emoji-pick" style="cursor:pointer;font-size:16px;padding:4px;border-radius:6px;transition:background .1s" title="${e}">${e}</span>`).join('');ep.querySelectorAll('.hab-emoji-pick').forEach(s=>s.addEventListener('click',()=>{$('hab-icon').value=s.textContent.trim()}));}
  ep?.querySelectorAll('.hab-emoji-pick').forEach(s=>{s.addEventListener('mouseenter',()=>s.style.background='var(--bg-h)');s.addEventListener('mouseleave',()=>s.style.background='none')});
  // Day picker toggle buttons
  const toggleDayBtn=(btn,color)=>{const on=btn.dataset.selected==='1';if(on){btn.dataset.selected='0';btn.style.background='var(--bg-s)';btn.style.color='var(--tx)';btn.style.borderColor='var(--brd)';}else{btn.dataset.selected='1';btn.style.background=color||'#6C63FF';btn.style.color='#fff';btn.style.borderColor=color||'#6C63FF';}};
  document.querySelectorAll('.hab-day-btn').forEach(b=>b.addEventListener('click',()=>toggleDayBtn(b,$('hab-color')?.value)));
  document.querySelectorAll('.hab-mday-btn').forEach(b=>b.addEventListener('click',()=>toggleDayBtn(b,$('hab-color')?.value)));
  const getSelectedDays=()=>{const freq=$('hab-freq').value;if(freq==='weekly')return[...document.querySelectorAll('.hab-day-btn[data-selected="1"]')].map(b=>b.dataset.day);if(freq==='monthly')return[...document.querySelectorAll('.hab-mday-btn[data-selected="1"]')].map(b=>Number(b.dataset.day));return null;};
  document.getElementById('hab-save')?.addEventListener('click',async()=>{
    const name=$('hab-name').value.trim();
    if(!name){$('hab-name').classList.add('inp-err');$('hab-name').focus();showToast('Please enter a habit name');return;}
    if(name.length>100){$('hab-name').classList.add('inp-err');$('hab-name').focus();showToast('Habit name too long (max 100 characters)');return;}
    $('hab-name').classList.remove('inp-err');
    const areaVal=$('hab-area').value;const areaId=areaVal?Number(areaVal):null;
    const sd=getSelectedDays();
    const body={name,icon:$('hab-icon').value,color:$('hab-color').value,target:Number($('hab-target').value)||1,frequency:$('hab-freq').value,area_id:areaId};
    if(sd&&sd.length)body.schedule_days=sd;
    const timeVal=$('hab-time').value;if(timeVal)body.preferred_time=timeVal;
    await api.post('/api/habits',body);
    showToast('Habit created!');renderHabits();
  });
  // Check buttons (log/unlog)
  mc.querySelectorAll('.habit-check').forEach(btn=>btn.addEventListener('click',async()=>{
    const hid=Number(btn.dataset.hid);
    if(btn.classList.contains('done')){await api.del('/api/habits/'+hid+'/log')}
    else{await api.post('/api/habits/'+hid+'/log',{})}
    renderHabits();
  }));
  // Delete
  mc.querySelectorAll('[data-del]').forEach(btn=>btn.addEventListener('click',async()=>{
    if(!confirm('Delete this habit?'))return;
    const hid=Number(btn.dataset.del);
    const hab=habits.find(x=>x.id===hid);
    await api.del('/api/habits/'+hid);
    renderHabits();
    showToast('Habit deleted'+(hab?' — "'+hab.name+'"':''),async()=>{
      if(!hab)return;
      await api.post('/api/habits',{name:hab.name,icon:hab.icon,color:hab.color,target:hab.target,frequency:hab.frequency,area_id:hab.area_id||null});
      renderHabits();
    });
  }));
  // Edit (inline toggle - reuse form)
  mc.querySelectorAll('[data-edit]').forEach(btn=>btn.addEventListener('click',async()=>{
    const hab=habits.find(x=>x.id===Number(btn.dataset.edit));if(!hab)return;
    $('hab-form').style.display='block';
    $('hab-name').value=hab.name;$('hab-icon').value=hab.icon||'⭐';
    $('hab-color').value=hab.color||'#6C63FF';$('hab-target').value=hab.target||1;
    $('hab-freq').value=hab.frequency||'daily';$('hab-area').value=hab.area_id||'';
    $('hab-time').value=hab.preferred_time||'';
    // Show day picker and pre-select days for edit
    const picker=$('hab-day-picker'),wd=$('hab-weekdays'),md=$('hab-monthdays');
    document.querySelectorAll('.hab-day-btn,.hab-mday-btn').forEach(b=>{b.dataset.selected='0';b.style.background='var(--bg-s)';b.style.color='var(--tx)';b.style.borderColor='var(--brd)';});
    if(hab.frequency==='weekly'){picker.style.display='block';wd.style.display='flex';md.style.display='none';$('hab-day-label').textContent='Select days of the week';if(Array.isArray(hab.schedule_days))hab.schedule_days.forEach(d=>{const b=document.querySelector(`.hab-day-btn[data-day="${d}"]`);if(b){b.dataset.selected='1';b.style.background=hab.color||'#6C63FF';b.style.color='#fff';b.style.borderColor=hab.color||'#6C63FF';}});}
    else if(hab.frequency==='monthly'){picker.style.display='block';wd.style.display='none';md.style.display='grid';$('hab-day-label').textContent='Select days of the month';if(Array.isArray(hab.schedule_days))hab.schedule_days.forEach(d=>{const b=document.querySelector(`.hab-mday-btn[data-day="${d}"]`);if(b){b.dataset.selected='1';b.style.background=hab.color||'#6C63FF';b.style.color='#fff';b.style.borderColor=hab.color||'#6C63FF';}});}
    else{picker.style.display='none';wd.style.display='none';md.style.display='none';}
    // Replace save handler for edit
    const saveBtn=$('hab-save');const newBtn=saveBtn.cloneNode(true);saveBtn.parentNode.replaceChild(newBtn,saveBtn);
    newBtn.textContent='Update';
    newBtn.addEventListener('click',async()=>{
      const editName=$('hab-name').value.trim();
      if(!editName){$('hab-name').classList.add('inp-err');$('hab-name').focus();showToast('Please enter a habit name');return;}
      if(editName.length>100){$('hab-name').classList.add('inp-err');$('hab-name').focus();showToast('Habit name too long (max 100)');return;}
      $('hab-name').classList.remove('inp-err');
      const eAreaVal=$('hab-area').value;const eAreaId=eAreaVal?Number(eAreaVal):null;
      const sd=getSelectedDays();
      const body={name:$('hab-name').value.trim(),icon:$('hab-icon').value,color:$('hab-color').value,target:Number($('hab-target').value)||1,frequency:$('hab-freq').value,area_id:eAreaId};
      if(sd&&sd.length)body.schedule_days=sd;else if($('hab-freq').value==='weekly'||$('hab-freq').value==='monthly')body.schedule_days=[];
      const eTimeVal=$('hab-time').value;body.preferred_time=eTimeVal||null;
      await api.put('/api/habits/'+hab.id,body);
      showToast('Habit updated');renderHabits();
    });
  }));
  // AI Habit Coach
  mc.querySelectorAll('.ai-hab-coach').forEach(btn=>btn.addEventListener('click',async()=>{
    btn.disabled=true;
    try{
      const r=await api.post('/api/ai/habit-coach',{habit_id:Number(btn.dataset.hid)});
      const d=r.data||r;
      let msg='';
      if(d.stackSuggestion)msg+=d.stackSuggestion+' ';
      if(d.tipsForSuccess?.length)msg+=d.tipsForSuccess[0]+' ';
      if(d.difficultyPrediction)msg+=`(Difficulty: ${d.difficultyPrediction})`;
      showToast(msg||'AI coaching tip generated',null,8000);
    }catch(e){showToast(e.message||'AI unavailable','error')}
    finally{btn.disabled=false}
  }));
  // Card click opens habit detail modal
  mc.querySelectorAll('.habit-card').forEach(card=>card.addEventListener('click',(e)=>{
    if(e.target.closest('.habit-check')||e.target.closest('[data-edit]')||e.target.closest('[data-del]')||e.target.closest('.ai-hab-coach'))return;
    const hid=Number(card.dataset.hid);
    const hab=habits.find(x=>x.id===hid);
    if(hab)openHabitDetail(hab);
  }));
}

// ─── HABIT DETAIL MODAL ───
let _hdmHabit=null;
let _hdmTab='heatmap';

async function openHabitDetail(habit){
  _hdmHabit=habit;
  _hdmTab='heatmap';
  const modal=$('hdm');
  // Header
  $('hdm-title-row').innerHTML=`<span class="hdm-icon">${esc(habit.icon||'⭐')}</span><span class="hdm-name">${esc(habit.name)}</span><span class="hdm-badge" style="background:${escA(habit.color||'#6C63FF')}">${esc(habit.frequency||'daily')}</span>`;
  // Tabs
  _renderHDMTabs();
  // Body content
  await _renderHDMBody();
  // Open
  modal.classList.add('open');
  // Close handlers
  const closeBtn=$('hdm-close');
  const closeFn=()=>{modal.classList.remove('open');_hdmHabit=null;};
  closeBtn.onclick=closeFn;
  // Escape key
  const escHandler=(e)=>{if(e.key==='Escape'&&modal.classList.contains('open')){closeFn();document.removeEventListener('keydown',escHandler);}};
  document.addEventListener('keydown',escHandler);
}

function _renderHDMTabs(){
  const tabs=['heatmap','stats','edit','history'];
  const labels={heatmap:'Heatmap',stats:'Stats',edit:'Edit',history:'History'};
  const icons={heatmap:'grid_on',stats:'insights',edit:'edit',history:'history'};
  $('hdm-tabs').innerHTML=tabs.map(t=>
    `<button class="hdm-tab${_hdmTab===t?' active':''}" data-tab="${t}"><span class="material-icons-round" style="font-size:14px;vertical-align:middle;margin-right:4px">${icons[t]}</span>${labels[t]}</button>`
  ).join('');
  $('hdm-tabs').querySelectorAll('.hdm-tab').forEach(btn=>btn.addEventListener('click',async()=>{
    _hdmTab=btn.dataset.tab;
    _renderHDMTabs();
    await _renderHDMBody();
  }));
}

async function _renderHDMBody(){
  const body=$('hdm-body');
  const habit=_hdmHabit;
  if(!habit){body.innerHTML='';return;}
  if(_hdmTab==='heatmap')await _renderHDMHeatmap(body,habit);
  else if(_hdmTab==='stats')await _renderHDMStats(body,habit);
  else if(_hdmTab==='edit')_renderHDMEdit(body,habit);
  else if(_hdmTab==='history')await _renderHDMHistory(body,habit);
}

async function _renderHDMHeatmap(body,habit){
  let heatmapData=[];
  try{heatmapData=await api.get('/api/habits/'+habit.id+'/heatmap')}catch(e){}
  const logMap={};
  heatmapData.forEach(e=>{logMap[e.date]=e.count;});
  const today=new Date();
  let h=`<div style="margin-bottom:12px;font-size:12px;color:var(--txd)">Last 90 days</div>`;
  h+=`<div class="habit-heatmap-grid">`;
  for(let i=89;i>=0;i--){
    const d=new Date(today);d.setDate(d.getDate()-i);
    const ds=_toDateStr(d);
    const count=logMap[ds]||0;
    const lvl=count===0?'':count>=habit.target*2?'l4':count>=habit.target?'l3':count>=Math.ceil(habit.target/2)?'l2':'l1';
    const dayNames=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    h+=`<div class="heatmap-cell ${lvl}" data-date="${ds}" title="${dayNames[d.getDay()]} ${ds}: ${count}x" style="${lvl?'--hm-l1:'+escA(habit.color||'#22C55E')+'40;--hm-l2:'+escA(habit.color||'#22C55E')+'80;--hm-l3:'+escA(habit.color||'#22C55E')+'BF;--hm-l4:'+escA(habit.color||'#22C55E')+'':''}"></div>`;
  }
  h+=`</div>`;
  h+=`<div style="display:flex;align-items:center;gap:8px;margin-top:12px;font-size:10px;color:var(--txd)"><span>Less</span>`;
  h+=`<div style="display:flex;gap:3px">`;
  h+=`<div style="width:12px;height:12px;border-radius:2px;background:var(--bg-h)"></div>`;
  for(const l of['40','80','BF','']){
    h+=`<div style="width:12px;height:12px;border-radius:2px;background:${escA(habit.color||'#22C55E')}${l}"></div>`;
  }
  h+=`</div><span>More</span></div>`;
  body.innerHTML=h;
}

async function _renderHDMStats(body,habit){
  let habits=[];
  try{habits=await api.get('/api/habits')}catch(e){}
  const h=habits.find(x=>x.id===habit.id)||habit;
  let heatmapData=[];
  try{heatmapData=await api.get('/api/habits/'+habit.id+'/heatmap')}catch(e){}
  const totalCompletions=h.total_completions||heatmapData.reduce((s,e)=>s+e.count,0);
  const streak=h.streak||0;
  // Calculate best day of week
  const dayTotals=[0,0,0,0,0,0,0];
  heatmapData.forEach(e=>{const d=new Date(e.date+'T12:00:00');dayTotals[d.getDay()]+=e.count;});
  const dayNames=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const bestDayIdx=dayTotals.indexOf(Math.max(...dayTotals));
  const worstDayIdx=dayTotals.indexOf(Math.min(...dayTotals));
  const completionRate=heatmapData.length>0?Math.round(heatmapData.filter(e=>e.count>=habit.target).length/90*100):0;
  let html=`<div class="habit-stats">
    <div class="habit-stat-card"><div class="stat-val" style="color:${escA(habit.color||'#22C55E')}">${streak}</div><div class="stat-lbl">Current Streak</div></div>
    <div class="habit-stat-card"><div class="stat-val">${totalCompletions}</div><div class="stat-lbl">Total Completions</div></div>
    <div class="habit-stat-card"><div class="stat-val">${completionRate}%</div><div class="stat-lbl">Completion Rate (90d)</div></div>
    <div class="habit-stat-card"><div class="stat-val">${dayNames[bestDayIdx]?dayNames[bestDayIdx].slice(0,3):'-'}</div><div class="stat-lbl">Best Day</div></div>
  </div>`;
  html+=`<div style="margin-top:16px;padding:12px;background:var(--bg-c);border:1px solid var(--brd);border-radius:var(--r);font-size:12px;color:var(--tx2)"><strong>Worst Day:</strong> ${dayNames[worstDayIdx]||'-'} &middot; <strong>Target:</strong> ${habit.target}x/${habit.frequency||'daily'}</div>`;
  body.innerHTML=html;
}

function _renderHDMEdit(body,habit){
  const areaOpts=areas.map(a=>`<option value="${a.id}"${habit.area_id===a.id?' selected':''}>${esc(a.icon||'')} ${esc(a.name)}</option>`).join('');
  let h=`<div style="display:flex;flex-direction:column;gap:12px">
    <div><label style="font-size:11px;color:var(--tx2);display:block;margin-bottom:4px">Icon</label>
    <input type="text" id="hdm-edit-icon" value="${escA(habit.icon||'⭐')}" style="width:48px;padding:8px;border-radius:var(--rs);border:1px solid var(--brd);background:var(--bg-c);color:var(--tx);font-size:18px;text-align:center;font-family:inherit"></div>
    <div><label style="font-size:11px;color:var(--tx2);display:block;margin-bottom:4px">Habit Name</label>
    <input type="text" id="hdm-edit-name" value="${escA(habit.name)}" maxlength="100" style="width:100%;padding:8px 12px;border-radius:var(--rs);border:1px solid var(--brd);background:var(--bg-c);color:var(--tx);font-size:13px;font-family:inherit"></div>
    <div><label style="font-size:11px;color:var(--tx2);display:block;margin-bottom:4px">Color</label>
    <div style="display:flex;align-items:center;gap:8px"><div style="width:36px;height:36px;border-radius:var(--rs);overflow:hidden;border:1px solid var(--brd);position:relative"><input type="color" id="hdm-edit-color" value="${escA(habit.color||'#6C63FF')}" style="position:absolute;inset:-4px;width:calc(100% + 8px);height:calc(100% + 8px);border:none;cursor:pointer;background:none"></div><span id="hdm-color-hex" style="font-size:11px;color:var(--txd)">${esc(habit.color||'#6C63FF')}</span></div></div>
    <div><label style="font-size:11px;color:var(--tx2);display:block;margin-bottom:4px">Frequency</label>
    <select id="hdm-edit-freq" style="width:100%;padding:8px 10px;border-radius:var(--rs);border:1px solid var(--brd);background:var(--bg-c);color:var(--tx);font-size:13px;font-family:inherit"><option value="daily"${habit.frequency==='daily'?' selected':''}>Daily</option><option value="weekly"${habit.frequency==='weekly'?' selected':''}>Weekly</option><option value="monthly"${habit.frequency==='monthly'?' selected':''}>Monthly</option><option value="yearly"${habit.frequency==='yearly'?' selected':''}>Yearly</option></select></div>
    <div><label style="font-size:11px;color:var(--tx2);display:block;margin-bottom:4px">Target</label>
    <input type="number" id="hdm-edit-target" value="${habit.target||1}" min="1" max="99" style="width:100px;padding:8px 10px;border-radius:var(--rs);border:1px solid var(--brd);background:var(--bg-c);color:var(--tx);font-size:13px;font-family:inherit"></div>
    <div><label style="font-size:11px;color:var(--tx2);display:block;margin-bottom:4px">Area</label>
    <select id="hdm-edit-area" style="width:100%;padding:8px 10px;border-radius:var(--rs);border:1px solid var(--brd);background:var(--bg-c);color:var(--tx);font-size:13px;font-family:inherit"><option value="">None</option>${areaOpts}</select></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;padding-top:12px;border-top:1px solid var(--brd)">
      <button class="btn-s" id="hdm-edit-save">Save Changes</button>
    </div>
  </div>`;
  body.innerHTML=h;
  $('hdm-edit-color')?.addEventListener('input',(e)=>{const hex=$('hdm-color-hex');if(hex)hex.textContent=e.target.value;});
  $('hdm-edit-save')?.addEventListener('click',async()=>{
    const name=$('hdm-edit-name').value.trim();
    if(!name){showToast('Please enter a habit name');return;}
    const editBody={
      name,
      icon:$('hdm-edit-icon').value,
      color:$('hdm-edit-color').value,
      frequency:$('hdm-edit-freq').value,
      target:Number($('hdm-edit-target').value)||1,
      area_id:$('hdm-edit-area').value?Number($('hdm-edit-area').value):null
    };
    try{
      const updated=await api.put('/api/habits/'+habit.id,editBody);
      _hdmHabit={...habit,...updated};
      $('hdm-title-row').innerHTML=`<span class="hdm-icon">${esc(_hdmHabit.icon||'⭐')}</span><span class="hdm-name">${esc(_hdmHabit.name)}</span><span class="hdm-badge" style="background:${escA(_hdmHabit.color||'#6C63FF')}">${esc(_hdmHabit.frequency||'daily')}</span>`;
      showToast('Habit updated');
      renderHabits();
    }catch(e){showToast(e.message||'Error saving habit')}
  });
}

async function _renderHDMHistory(body,habit){
  let logs=[];
  try{logs=await api.get('/api/habits/'+habit.id+'/heatmap')}catch(e){}
  logs.sort((a,b)=>b.date.localeCompare(a.date));
  const recent=logs.slice(0,30);
  if(!recent.length){body.innerHTML=`<div style="text-align:center;padding:20px;color:var(--txd)">No log entries yet</div>`;return;}
  let h='';
  for(const entry of recent){
    const d=new Date(entry.date+'T12:00:00');
    const dayNames=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const monthNames=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const label=`${dayNames[d.getDay()]}, ${monthNames[d.getMonth()]} ${d.getDate()}`;
    h+=`<div class="habit-history-item" data-date="${escA(entry.date)}">
      <span class="hhi-date">${esc(label)}</span>
      <span class="hhi-count">${entry.count}x</span>
      <span class="hhi-undo" data-undo="${escA(entry.date)}" title="Undo this entry">undo</span>
    </div>`;
  }
  body.innerHTML=h;
  body.querySelectorAll('.hhi-undo').forEach(btn=>btn.addEventListener('click',async()=>{
    const date=btn.dataset.undo;
    try{
      await api.del('/api/habits/'+habit.id+'/log',{date});
      showToast('Log entry undone');
      await _renderHDMHistory(body,habit);
      renderHabits();
    }catch(e){showToast(e.message||'Error undoing log')}
  }));
}

// ─── SAVED FILTER VIEW ───
async function renderSavedFilter(){
  const mc=$('ct');
  const params=activeFilterParams||{};
  let h=`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px"><h2 style="margin:0">${esc(activeFilterName||'Filter')}</h2><button class="btn-c" id="fb-edit-btn">Edit Filter</button></div>`;
  // Filter builder (hidden by default if activeFilterId is set)
  h+=`<div id="fb-builder" style="display:${activeFilterId?'none':'block'};padding:12px;background:var(--bg-c);border:1px solid var(--brd);border-radius:var(--rs);margin-bottom:16px">
    <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:end">
      <div class="fb-row"><label style="font-size:11px">Area</label><select id="fb-area"><option value="">Any</option>${areas.map(a=>`<option value="${a.id}" ${params.area_id==a.id?'selected':''}>${esc(a.icon)} ${esc(a.name)}</option>`).join('')}</select></div>
      <div class="fb-row"><label style="font-size:11px">Priority</label><select id="fb-pri"><option value="">Any</option><option value="1" ${params.priority=='1'?'selected':''}>Normal</option><option value="2" ${params.priority=='2'?'selected':''}>High</option><option value="3" ${params.priority=='3'?'selected':''}>Critical</option></select></div>
      <div class="fb-row"><label style="font-size:11px">Status</label><select id="fb-status"><option value="">Any</option><option value="todo" ${params.status==='todo'?'selected':''}>To Do</option><option value="in-progress" ${params.status==='in-progress'?'selected':''}>In Progress</option><option value="done" ${params.status==='done'?'selected':''}>Done</option></select></div>
      <div class="fb-row"><label style="font-size:11px">Due</label><select id="fb-due"><option value="">Any</option><option value="today" ${params.due==='today'?'selected':''}>Today</option><option value="week" ${params.due==='week'?'selected':''}>This Week</option><option value="overdue" ${params.due==='overdue'?'selected':''}>Overdue</option><option value="none" ${params.due==='none'?'selected':''}>No Date</option></select></div>
      <div class="fb-row"><label style="font-size:11px">Tag</label><select id="fb-tag"><option value="">Any</option>${allTags.map(t=>`<option value="${t.id}" ${params.tag_id==t.id?'selected':''}>${esc(t.name)}</option>`).join('')}</select></div>
      <div class="fb-row"><label style="font-size:11px;display:flex;align-items:center;gap:4px"><input type="checkbox" id="fb-myday" ${params.my_day?'checked':''} style="width:auto;margin:0">My Day only</label></div>
    </div>
    <div class="fb-save-row" style="margin-top:10px;display:flex;gap:8px;align-items:center">
      <button class="btn-s" id="fb-apply">Apply</button>
      <input type="text" id="fb-name" placeholder="Filter name..." value="${escA(activeFilterName||'')}" style="flex:1;max-width:200px">
      <input type="text" id="fb-icon" value="${escA(params._icon||'🔍')}" style="width:40px;text-align:center">
      <button class="btn-c" id="fb-saveas">${activeFilterId?'Update':'Save'}</button>
    </div>
  </div>`;
  h+=`<div id="fb-results"><div style="text-align:center;padding:20px;color:var(--txd)">Loading...</div></div>`;
  mc.innerHTML=h;
  // Execute filter
  async function execFilter(){
    const p={};
    const area=$('fb-area').value;if(area)p.area_id=area;
    const pri=$('fb-pri').value;if(pri)p.priority=pri;
    const st=$('fb-status').value;if(st)p.status=st;
    const due=$('fb-due').value;if(due)p.due=due;
    const tag=$('fb-tag').value;if(tag)p.tag_id=tag;
    if($('fb-myday').checked)p.my_day='1';
    const qs=new URLSearchParams(p).toString();
    try{
      const tasks=await api.get('/api/filters/execute'+(qs?'?'+qs:''));
      if(!tasks.length){$('fb-results').innerHTML='<div style="text-align:center;padding:20px;color:var(--txd)">No tasks match this filter</div>';return}
      $('fb-results').innerHTML=`<div style="margin-bottom:8px;font-size:12px;color:var(--txd)">${tasks.length} task${tasks.length!==1?'s':''}</div>`+tasks.map(t=>tcHtml(t,true)).join('');
      attachTE();attachBD();
    }catch(e){$('fb-results').innerHTML='<div style="color:var(--dn)">Error loading results</div>'}
  }
  await execFilter();
  // Event handlers
  $('fb-apply').addEventListener('click',async()=>{
    activeFilterParams=gatherFilterParams();await execFilter();
  });
  $('fb-edit-btn').addEventListener('click',()=>{
    const fb=$('fb-builder');fb.style.display=fb.style.display==='none'?'block':'none';
  });
  $('fb-saveas').addEventListener('click',async()=>{
    const name=$('fb-name').value.trim()||'Untitled Filter';
    const icon=$('fb-icon').value||'🔍';
    const filters=gatherFilterParams();
    if(activeFilterId){
      await api.put('/api/filters/'+activeFilterId,{name,icon,filters});
      activeFilterName=name;
    }else{
      const f=await api.post('/api/filters',{name,icon,filters});
      activeFilterId=f.id;activeFilterName=name;
    }
    await loadSavedFilters();showToast('Filter saved!');render();
  });
  function gatherFilterParams(){
    const p={};
    const area=$('fb-area').value;if(area)p.area_id=area;
    const pri=$('fb-pri').value;if(pri)p.priority=pri;
    const st=$('fb-status').value;if(st)p.status=st;
    const due=$('fb-due').value;if(due)p.due=due;
    const tag=$('fb-tag').value;if(tag)p.tag_id=tag;
    if($('fb-myday').checked)p.my_day='1';
    p._icon=$('fb-icon').value||'🔍';
    return p;
  }
}

// ─── DAY PLANNER VIEW ───
let plannerDate = _toDateStr(new Date());
async function renderPlanner(){
  const mc=$('ct');
  const d=_parseDate(plannerDate);
  const dayLabel=d.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'});
  const isToday=plannerDate===_toDateStr(new Date());
  let data={scheduled:[],unscheduled:[]};
  try{data=await api.get('/api/planner/'+plannerDate)}catch(e){}
  let myDayTasks=[];
  try{myDayTasks=(await api.get('/api/tasks/my-day')).filter(t=>!t.time_block_start&&t.status!=='done')}catch(e){}
  const allUnscheduled=[...data.unscheduled,...myDayTasks.filter(t=>!data.unscheduled.find(u=>u.id===t.id))];

  let h=`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
    <div style="display:flex;align-items:center;gap:8px">
      <button class="btn-c" id="pl-prev" style="padding:4px"><span class="material-icons-round" style="font-size:20px">chevron_left</span></button>
      <h2 style="margin:0;font-size:16px">${dayLabel}</h2>
      <button class="btn-c" id="pl-next" style="padding:4px"><span class="material-icons-round" style="font-size:20px">chevron_right</span></button>
      ${!isToday?'<button class="btn-c" id="pl-today" style="font-size:11px;padding:4px 10px">Today</button>':''}
    </div>
  </div>`;
  h+=`<div class="planner-wrap">`;
  h+=_tlBuildGrid(data.scheduled,{showNowLine:isToday});
  h+=`<div class="planner-sidebar"><div class="planner-unscheduled"><h4>Unscheduled (${allUnscheduled.length})</h4>`;
  if(!allUnscheduled.length)h+=`<div style="text-align:center;padding:12px;color:var(--txd);font-size:12px">No tasks for this day</div>`;
  allUnscheduled.forEach(t=>{
    h+=`<div class="planner-task-unsched" draggable="true" data-id="${t.id}" style="border-left-color:${escA(t.goal_color||'var(--brand)')};background:${escA(t.goal_color||'var(--brand)')}15">
      <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.title)}</span>
    </div>`;
  });
  h+=`</div></div></div>`;
  mc.innerHTML=h;

  $('pl-prev')?.addEventListener('click',()=>{const nd=_parseDate(plannerDate);nd.setDate(nd.getDate()-1);plannerDate=_toDateStr(nd);render()});
  $('pl-next')?.addEventListener('click',()=>{const nd=_parseDate(plannerDate);nd.setDate(nd.getDate()+1);plannerDate=_toDateStr(nd);render()});
  $('pl-today')?.addEventListener('click',()=>{plannerDate=_toDateStr(new Date());render()});
  _tlWireEvents(mc,plannerDate,renderPlanner);
}

async function renderTaskPlanner(){
  const c=$('ct');
  const data=await api.get('/api/tasks/planner');
  const areasTree=data.areas||[];
  let h=`<div class="task-planner-shell">`;
  h+=`<div class="task-planner-toolbar"><div><div class="task-planner-title">Hierarchy Planner</div><div class="task-planner-copy">Review work by area, move tasks between goals, and jump straight into task details.</div></div><div class="task-planner-actions"><select id="planner-target-goal"><option value="">Move selected to…</option>`;
  areasTree.forEach(area=>{
    (area.goals||[]).forEach(goal=>{h+=`<option value="${goal.id}">${esc(area.name)} / ${esc(goal.title)}</option>`});
  });
  h+=`</select><button class="btn-s" id="planner-move-btn" disabled>Move Selected</button></div></div>`;
  if(!areasTree.length){c.innerHTML=h+emptyS('account_tree','No planning structure yet','Create areas, goals, and tasks to use the planner')+'</div>';return}
  areasTree.forEach(area=>{
    const totalTasks=(area.goals||[]).reduce((sum,goal)=>sum+(goal.tasks||[]).length,0);
    h+=`<section class="planner-area"><header class="planner-area-head"><div><span class="planner-area-icon">${esc(area.icon||'•')}</span><span class="planner-area-name">${esc(area.name)}</span></div><span class="planner-area-meta">${totalTasks} tasks</span></header>`;
    (area.goals||[]).forEach(goal=>{
      h+=`<div class="planner-goal"><div class="planner-goal-head"><div class="planner-goal-title"><span class="planner-goal-dot" style="background:${escA(goal.color||'#2563EB')}"></span>${esc(goal.title)}</div><span class="planner-goal-meta">${(goal.tasks||[]).length} tasks</span></div>`;
      if(!(goal.tasks||[]).length){h+=`<div class="planner-empty">No tasks in this goal</div>`}
      (goal.tasks||[]).forEach(task=>{
        h+=`<div class="planner-task-row"><label class="planner-task-main"><input type="checkbox" class="planner-task-check" value="${task.id}"><button class="planner-task-open" data-tid="${task.id}">${esc(task.title)}</button></label><div class="planner-task-meta"><span>${esc(task.status)}</span><span>${task.due_date?esc(fmtDue(task.due_date)):'No due date'}</span><span>${task.subtask_total?task.subtask_done+'/'+task.subtask_total+' subtasks':'No subtasks'}</span></div></div>`;
      });
      h+=`</div>`;
    });
    h+=`</section>`;
  });
  h+=`</div>`;
  c.innerHTML=h;
  const moveBtn=$('planner-move-btn');
  const targetGoal=$('planner-target-goal');
  const syncMoveState=()=>{
    const checked=c.querySelectorAll('.planner-task-check:checked').length;
    if(moveBtn)moveBtn.disabled=!(checked&&targetGoal?.value);
  };
  c.querySelectorAll('.planner-task-check').forEach(input=>input.addEventListener('change',syncMoveState));
  targetGoal?.addEventListener('change',syncMoveState);
  moveBtn?.addEventListener('click',async()=>{
    const selected=[...c.querySelectorAll('.planner-task-check:checked')].map(el=>Number(el.value)).filter(Number.isInteger);
    const targetGoalId=Number(targetGoal.value);
    if(!selected.length||!Number.isInteger(targetGoalId))return;
    await api.post('/api/tasks/batch-move',{task_ids:selected,target_goal_id:targetGoalId});
    showToast('Tasks moved');
    renderTaskPlanner();
  });
  c.querySelectorAll('.planner-task-open').forEach(btn=>btn.addEventListener('click',()=>openDP(Number(btn.dataset.tid))));
}

// ─── UPCOMING VIEW ───
async function renderUpcoming(){
  const mc=$('ct');
  const days=30;
  let data={overdue:[],upcoming:[],undated:[]};
  try{data=await api.get('/api/tasks/upcoming?days='+days)}catch(e){}
  let h=`<h2 style="margin:0 0 4px;font-size:18px"><span class="material-icons-round" style="font-size:20px;vertical-align:middle;margin-right:6px;color:var(--brand)">upcoming</span>Upcoming</h2>`;
  h+=`<div style="font-size:13px;color:var(--txd);margin-bottom:14px">Next ${days} days · ${data.overdue.length+data.upcoming.length} tasks</div>`;

  // Overdue
  if(data.overdue.length){
    h+=`<div class="sl" style="color:var(--err)"><span class="material-icons-round" style="font-size:14px;vertical-align:middle">warning</span> Overdue <span class="c">${data.overdue.length}</span></div>`;
    data.overdue.forEach(tk=>h+=tcHtml(tk,true));
  }

  // Group upcoming by date
  const groups={};
  data.upcoming.forEach(tk=>{
    const d=tk.due_date||'undated';
    if(!groups[d])groups[d]=[];
    groups[d].push(tk);
  });

  const today=_toDateStr(new Date());
  const tomorrow=_toDateStr(new Date(Date.now()+86400000));
  Object.keys(groups).sort().forEach(date=>{
    const tks=groups[date];
    let label=date;
    if(date===today)label='Today';
    else if(date===tomorrow)label='Tomorrow';
    else{
      const d=_parseDate(date);
      label=d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
    }
    h+=`<div class="sl">${esc(label)} <span class="c">${tks.length}</span></div>`;
    tks.forEach(tk=>h+=tcHtml(tk,true));
  });

  // Undated
  if(data.undated.length){
    h+=`<div class="sl" style="color:var(--txd)"><span class="material-icons-round" style="font-size:14px;vertical-align:middle">event_busy</span> No Date <span class="c">${data.undated.length}</span></div>`;
    data.undated.forEach(tk=>h+=tcHtml(tk,true));
  }

  mc.innerHTML=h;attachTE();
}

// ─── DAILY REVIEW ───
let drStep=1,drData={},drPickedIds=new Set();
async function openDailyReview(){
  drStep=1;drPickedIds=new Set();
  // Load all needed data
  const [stats,myDay,overdue,allTasks]=await Promise.all([
    api.get('/api/stats'),api.get('/api/tasks/my-day'),api.get('/api/tasks/overdue'),api.get('/api/tasks/all')
  ]);
  drData={
    stats,myDay,overdue,allTasks,
    backlog:allTasks.filter(t=>t.status!=='done'&&!t.my_day),
    reflection:{goal:'',estimatedMinutes:'',mood:'steady',energy:'medium',note:'',rating:0}
  };
  // Greeting
  const h=new Date().getHours();
  const greet=h<12?'Good morning':h<17?'Good afternoon':'Good evening';
  $('dr-greeting').textContent=greet+' ☀️';
  $('dr-date').textContent=new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'});
  renderDR();
  $('dr-ov').classList.add('active');
}
function closeDR(){$('dr-ov').classList.remove('active')}
function renderDR(){
  // Update step tabs
  document.querySelectorAll('.dr-step').forEach(s=>{
    const n=Number(s.dataset.step);
    s.classList.toggle('active',n===drStep);
    s.classList.toggle('done',n<drStep);
  });
  const body=$('dr-body');
  const prog=$('dr-progress-bar');
  if(prog)prog.style.width=(Math.round((drStep/3)*100))+'%';
  if(drStep===1)renderDRStep1(body);
  else if(drStep===2)renderDRStep2(body);
  else if(drStep===3)renderDRStep3(body);
  $('dr-next').textContent=drStep===3?'Done ✓':'Next →';
}
function renderDRStep1(body){
  const {stats}=drData;
  const yesterday=stats.recentDone.filter(t=>{
    if(!t.completed_at)return false;
    const d=new Date(t.completed_at);const y=new Date();y.setDate(y.getDate()-1);
    return d.toDateString()===y.toDateString();
  });
  let h=`<div class="dr-section"><h3><span class="material-icons-round" style="color:var(--ok)">check_circle</span>Yesterday's Accomplishments</h3>`;
  if(yesterday.length){
    yesterday.forEach(t=>h+=`<div class="dr-task" style="opacity:.8"><span class="material-icons-round" style="color:var(--ok)">done</span><span>${esc(t.title)}</span><span style="font-size:10px;color:var(--txd);margin-left:auto">${esc(t.goal_title||'')}</span></div>`);
  }else{h+=`<p style="font-size:12px;color:var(--txd);padding:8px">No completed tasks yesterday. Fresh start today!</p>`}
  h+=`</div>`;
  h+=`<div class="dr-section"><h3><span class="material-icons-round" style="color:var(--brand)">insights</span>Weekly Snapshot</h3>`;
  h+=`<div class="dr-stat">
    <div class="dr-stat-card"><div class="num">${stats.thisWeek}</div><div class="lab">Done this week</div></div>
    <div class="dr-stat-card"><div class="num">${stats.overdue}</div><div class="lab" style="color:${stats.overdue?'var(--err)':''}">Overdue</div></div>
    <div class="dr-stat-card"><div class="num">${stats.dueToday}</div><div class="lab">Due today</div></div>
  </div></div>`;
  body.innerHTML=h;
}
function renderDRStep2(body){
  const {myDay,overdue}=drData;
  const todayTasks=myDay.filter(t=>t.status!=='done');
  const overdueTasks=overdue.filter(t=>t.status!=='done');
  let h='';
  if(overdueTasks.length){
    h+=`<div class="dr-section"><h3><span class="material-icons-round" style="color:var(--err)">warning</span>Overdue (${overdueTasks.length})</h3>`;
    overdueTasks.forEach(t=>{
      h+=`<div class="dr-task" data-id="${t.id}"><span class="material-icons-round" style="color:var(--err)">event_busy</span><span>${esc(t.title)}</span><span style="font-size:10px;color:var(--err);margin-left:auto">${fmtDue(t.due_date)}</span></div>`;
    });
    h+=`</div>`;
  }
  h+=`<div class="dr-section"><h3><span class="material-icons-round" style="color:var(--brand)">wb_sunny</span>Today's Plan (${todayTasks.length} tasks)</h3>`;
  if(todayTasks.length){
    todayTasks.forEach(t=>{
      const od=t.due_date&&isOD(t.due_date);
      h+=`<div class="dr-task" data-id="${t.id}"><span class="material-icons-round">${t.priority>=2?'priority_high':'task_alt'}</span><span>${esc(t.title)}</span>${t.due_date?'<span style="font-size:10px;color:'+(od?'var(--err)':'var(--txd)')+';margin-left:auto">'+fmtDue(t.due_date)+'</span>':''}</div>`;
    });
  }else{h+=`<p style="font-size:12px;color:var(--txd);padding:8px">No tasks planned for today yet. Pick some from backlog →</p>`}
  h+=`<div class="dr-section"><h3><span class="material-icons-round" style="color:var(--brand)">flag</span>Today's Focus Plan</h3>
    <label style="display:block;font-size:11px;color:var(--txd);margin-bottom:4px">Main goal for today</label>
    <input id="dr-goal" type="text" value="${escA(drData.reflection?.goal||'')}" placeholder="What must be true by end of day?" style="width:100%;padding:10px 12px;border-radius:var(--rs);border:1px solid var(--brd);background:var(--bg-c);color:var(--tx);font-size:12px">
    <label style="display:block;font-size:11px;color:var(--txd);margin:8px 0 4px">Planned focus minutes</label>
    <input id="dr-mins" type="number" min="0" max="720" value="${escA(drData.reflection?.estimatedMinutes||'')}" placeholder="120" style="width:100%;padding:10px 12px;border-radius:var(--rs);border:1px solid var(--brd);background:var(--bg-c);color:var(--tx);font-size:12px">
  </div>`;
  h+=`</div>`;
  body.innerHTML=h;
  $('dr-goal')?.addEventListener('input',e=>{drData.reflection.goal=e.target.value});
  $('dr-mins')?.addEventListener('input',e=>{drData.reflection.estimatedMinutes=e.target.value});
  body.querySelectorAll('.dr-task[data-id]').forEach(el=>el.addEventListener('click',()=>openDP(Number(el.dataset.id))));
}
function renderDRStep3(body){
  const {backlog}=drData;
  const high=backlog.filter(t=>t.priority>=2);
  const rest=backlog.filter(t=>t.priority<2).slice(0,15);
  let h=`<div class="dr-section"><h3><span class="material-icons-round" style="color:var(--brand)">playlist_add</span>Pick tasks for today</h3>
    <p style="font-size:11px;color:var(--txd);margin:-4px 0 10px">Click to add to My Day</p>`;
  if(high.length){
    h+=`<div style="font-size:10px;font-weight:600;color:var(--txd);margin-bottom:4px;text-transform:uppercase">High Priority</div>`;
    high.forEach(t=>{
      h+=`<div class="dr-task ${drPickedIds.has(t.id)?'selected':''}" data-pick="${t.id}"><span class="material-icons-round">${drPickedIds.has(t.id)?'check_circle':'radio_button_unchecked'}</span><span>${esc(t.title)}</span><span style="font-size:10px;color:${PC[t.priority]};margin-left:auto">${PL[t.priority]}</span></div>`;
    });
  }
  if(rest.length){
    h+=`<div style="font-size:10px;font-weight:600;color:var(--txd);margin:10px 0 4px;text-transform:uppercase">Backlog</div>`;
    rest.forEach(t=>{
      h+=`<div class="dr-task ${drPickedIds.has(t.id)?'selected':''}" data-pick="${t.id}"><span class="material-icons-round">${drPickedIds.has(t.id)?'check_circle':'radio_button_unchecked'}</span><span>${esc(t.title)}</span>${t.due_date?'<span style="font-size:10px;color:var(--txd);margin-left:auto">'+fmtDue(t.due_date)+'</span>':''}</div>`;
    });
  }
  if(!high.length&&!rest.length){h+=`<p style="font-size:12px;color:var(--txd);padding:8px">Backlog is empty — great job!</p>`}
  h+=`</div>`;
  h+=`<div class="dr-section"><h3><span class="material-icons-round" style="color:var(--brand)">tune</span>Priorities Check-in</h3>
    <div class="dr-priority-grid">
      <label>Mood
        <select id="dr-mood"><option value="low" ${drData.reflection?.mood==='low'?'selected':''}>Low</option><option value="steady" ${drData.reflection?.mood!=='high'&&drData.reflection?.mood!=='low'?'selected':''}>Steady</option><option value="high" ${drData.reflection?.mood==='high'?'selected':''}>High</option></select>
      </label>
      <label>Energy
        <select id="dr-energy"><option value="low" ${drData.reflection?.energy==='low'?'selected':''}>Low</option><option value="medium" ${drData.reflection?.energy!=='high'&&drData.reflection?.energy!=='low'?'selected':''}>Medium</option><option value="high" ${drData.reflection?.energy==='high'?'selected':''}>High</option></select>
      </label>
    </div>
    <label style="display:block;font-size:11px;color:var(--txd);margin:8px 0 4px">Reflection note</label>
    <textarea id="dr-note" rows="3" style="width:100%;padding:10px 12px;border-radius:var(--rs);border:1px solid var(--brd);background:var(--bg-c);color:var(--tx);font-size:12px;resize:vertical">${esc(drData.reflection?.note||'')}</textarea>
    <label style="display:block;font-size:11px;color:var(--txd);margin:8px 0 4px">Day rating</label>
    <div id="dr-rating" class="dr-rating">${[1,2,3,4,5].map(n=>`<button class="dr-rate${n<=(drData.reflection?.rating||0)?' active':''}" data-rate="${n}" type="button">★</button>`).join('')}</div>
  </div>`;
  if(drPickedIds.size)h+=`<div style="font-size:11px;color:var(--brand);font-weight:600;padding:6px 0">${drPickedIds.size} task${drPickedIds.size>1?'s':''} selected for today</div>`;
  body.innerHTML=h;
  $('dr-mood')?.addEventListener('change',e=>{drData.reflection.mood=e.target.value});
  $('dr-energy')?.addEventListener('change',e=>{drData.reflection.energy=e.target.value});
  $('dr-note')?.addEventListener('input',e=>{drData.reflection.note=e.target.value});
  body.querySelectorAll('.dr-rate').forEach(btn=>btn.addEventListener('click',()=>{
    drData.reflection.rating=Number(btn.dataset.rate);
    body.querySelectorAll('.dr-rate').forEach(b=>b.classList.toggle('active',Number(b.dataset.rate)<=drData.reflection.rating));
  }));
  body.querySelectorAll('.dr-task[data-pick]').forEach(el=>el.addEventListener('click',()=>{
    const id=Number(el.dataset.pick);
    if(drPickedIds.has(id))drPickedIds.delete(id);else drPickedIds.add(id);
    renderDR();
  }));
}
$('dr-btn')?.addEventListener('click',openDailyReview);
// Sidebar bottom buttons
$('sb-settings-btn')?.addEventListener('click',()=>go('settings'));
$('sb-reports-btn')?.addEventListener('click',()=>go('reports'));
$('sb-help-btn')?.addEventListener('click',()=>go('help'));
$('sb-changelog-btn')?.addEventListener('click',()=>go('changelog'));
$('sb-new-list')?.addEventListener('click',()=>openListModal());
$('dr-ov').addEventListener('click',e=>{if(e.target===$('dr-ov'))closeDR()});
$('dr-skip').addEventListener('click',closeDR);
$('dr-next').addEventListener('click',async()=>{
  if(drStep<3){drStep++;renderDR();return}
  // Step 3 done — add picked tasks to My Day
  for(const id of drPickedIds){
    await api.put('/api/tasks/'+id,{my_day:true});
  }
  closeDR();
  try{
    const noteParts=[];
    if(drData.reflection.goal)noteParts.push('Goal: '+drData.reflection.goal);
    if(drData.reflection.estimatedMinutes)noteParts.push('Planned minutes: '+drData.reflection.estimatedMinutes);
    noteParts.push('Mood: '+(drData.reflection.mood||'steady'));
    noteParts.push('Energy: '+(drData.reflection.energy||'medium'));
    if(drData.reflection.note)noteParts.push(drData.reflection.note);
    await api.post('/api/reviews/daily',{
      date:_toDateStr(new Date()),
      note:noteParts.join('\n'),
      completed_count:drData.stats?.done||0
    });
  }catch(e){}
  if(drPickedIds.size)showToast(drPickedIds.size+' task'+(drPickedIds.size>1?'s':'')+' added to My Day');
  await loadAreas();render();loadOverdueBadge();
});
document.querySelectorAll('.dr-step').forEach(s=>s.addEventListener('click',()=>{
  const n=Number(s.dataset.step);if(n>=1&&n<=3){drStep=n;renderDR()}
}));

// ─── INBOX VIEW ───
async function renderInbox(){
  const items=await api.get('/api/inbox');
  const c=$('ct');
  if(!items.length){c.innerHTML=emptyS('inbox','Inbox is empty','Capture quick thoughts with the + button below');
    c.innerHTML+=`<div style="text-align:center;margin-top:16px"><button class="ib-add-btn" style="padding:8px 20px;background:var(--brand);color:#fff;border:none;border-radius:var(--rs);cursor:pointer;font-size:13px"><span class="material-icons-round" style="font-size:14px;vertical-align:middle;margin-right:4px">add</span>Quick Capture</button></div>`;
    c.querySelector('.ib-add-btn').addEventListener('click',inboxQuickAdd);return}
  let h=`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px"><span style="font-size:13px;color:var(--txd)">${items.length} item${items.length!==1?'s':''} to triage</span>
    <button class="ib-add-btn" style="padding:8px 12px;background:var(--brand);color:#fff;border:none;border-radius:var(--rs);cursor:pointer;font-size:12px"><span class="material-icons-round" style="font-size:13px;vertical-align:middle;margin-right:3px">add</span>Capture</button></div>`;
  items.forEach(it=>{
    h+=`<div class="inbox-item" data-id="${it.id}"><div style="flex:1;min-width:0;overflow:hidden">
      <div class="inbox-title">${esc(it.title)}</div>
      ${it.note?`<div class="inbox-meta">${esc(it.note)}</div>`:''}
      <div class="inbox-meta">${timeAgo(it.created_at)}</div>
    </div><div class="inbox-actions">
      <button class="ib-link material-icons-round" data-id="${it.id}" title="Link to existing task">link</button>
      <button class="ib-triage material-icons-round" data-id="${it.id}" title="Triage to goal">move_to_inbox</button>
      <button class="ib-del material-icons-round" data-id="${it.id}" title="Delete">delete</button>
    </div></div>`;
  });
  c.innerHTML=h;
  c.querySelector('.ib-add-btn').addEventListener('click',inboxQuickAdd);
  c.querySelectorAll('.ib-del').forEach(b=>b.addEventListener('click',async e=>{
    e.stopPropagation();await api.del('/api/inbox/'+b.dataset.id);showToast('Deleted');renderInbox();loadOverdueBadge();
  }));
  c.querySelectorAll('.ib-link').forEach(b=>b.addEventListener('click',async e=>{
    e.stopPropagation();showLinkToTaskModal(Number(b.dataset.id),items.find(i=>i.id===Number(b.dataset.id)));
  }));
  c.querySelectorAll('.ib-triage').forEach(b=>b.addEventListener('click',async e=>{
    e.stopPropagation();showTriageModal(Number(b.dataset.id));
  }));
}
async function inboxQuickAdd(){
  const title=prompt('Quick capture:');
  if(!title||!title.trim())return;
  await api.post('/api/inbox',{title:title.trim()});
  showToast('Captured');renderInbox();loadOverdueBadge();
}
async function showLinkToTaskModal(inboxId,item){
  const m=document.createElement('div');m.className='triage-modal';
  m.setAttribute('role','dialog');m.setAttribute('aria-modal','true');m.setAttribute('aria-label','Link to Existing Task');
  const _close=()=>{if(m._removeTrap)m._removeTrap();m.remove();_popFocus();_unlockBody()};
  m.innerHTML=`<div class="triage-box"><h3 style="margin:0 0 12px;font-size:14px">Link to Existing Task</h3>
    <input type="text" id="link-task-search" placeholder="Search tasks..." style="width:100%;padding:8px 10px;border:1px solid var(--brd);border-radius:var(--rs);background:var(--bg-c);color:var(--tx);font-size:13px;box-sizing:border-box">
    <div id="link-task-results" style="max-height:200px;overflow-y:auto;margin-top:8px"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
      <button id="link-cancel" style="padding:6px 14px;background:none;border:1px solid var(--brd);border-radius:var(--rs);cursor:pointer;color:var(--tx)">Cancel</button>
    </div></div>`;
  document.body.appendChild(m);
  m.querySelector('#link-cancel').addEventListener('click',_close);
  m.addEventListener('click',e=>{if(e.target===m)_close()});
  let searchTimer;
  m.querySelector('#link-task-search').addEventListener('input',e=>{
    clearTimeout(searchTimer);
    searchTimer=setTimeout(async()=>{
      const q=e.target.value.trim();
      const rd=m.querySelector('#link-task-results');
      if(!q){rd.innerHTML='';return}
      const tasks=await api.get('/api/tasks/search?q='+encodeURIComponent(q));
      if(!tasks.length){rd.innerHTML='<div style="padding:8px;font-size:12px;color:var(--txd)">No tasks found</div>';return}
      rd.innerHTML=tasks.slice(0,10).map(t=>`<div class="link-task-row" data-tid="${t.id}" style="padding:8px;cursor:pointer;border-radius:var(--rs);font-size:13px;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--brd)">
        <span class="material-icons-round" style="font-size:16px;color:var(--txd)">task_alt</span>
        <div style="flex:1;min-width:0;overflow:hidden"><div>${esc(t.title)}</div><div style="font-size:11px;color:var(--txd)">${t.area_name?esc(t.area_icon+' '+t.area_name+' → '+t.goal_title):''}</div></div>
      </div>`).join('');
      rd.querySelectorAll('.link-task-row').forEach(row=>row.addEventListener('click',async()=>{
        const tid=Number(row.dataset.tid);
        await api.post('/api/tasks/'+tid+'/subtasks',{title:item.title});
        await api.del('/api/inbox/'+inboxId);
        m.remove();_popFocus();_unlockBody();showToast('Linked as subtask');renderInbox();loadOverdueBadge();
      }));
    },300);
  });
  m.querySelector('#link-task-search').focus();
}
async function showTriageModal(inboxId){
  const m=document.createElement('div');m.className='triage-modal';
  m.setAttribute('role','dialog');m.setAttribute('aria-modal','true');m.setAttribute('aria-label','Triage to Goal');
  const _close=()=>{if(m._removeTrap)m._removeTrap();m.remove();_popFocus();_unlockBody()};
  let goalOpts='<option value="">Select a goal...</option>';
  areas.forEach(a=>{
    const goals=allGoals.filter(g=>g.area_id===a.id&&g.status==='active');
    if(goals.length){goalOpts+=`<optgroup label="${esc(a.icon+' '+a.name)}">${goals.map(g=>`<option value="${g.id}">${esc(g.title)}</option>`).join('')}</optgroup>`}
  });
  m.innerHTML=`<div class="triage-box"><h3 style="margin:0 0 12px;font-size:14px">Triage to Goal</h3>
    <p style="font-size:11px;color:var(--txd);margin:0 0 10px">Move this inbox item to a goal to turn it into a task</p>
    <select id="triage-goal">${goalOpts}</select>
    <input type="date" id="triage-date" placeholder="Due date (optional)">
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
      <button id="triage-cancel" style="padding:6px 14px;background:none;border:1px solid var(--brd);border-radius:var(--rs);cursor:pointer;color:var(--tx)">Cancel</button>
      <button id="triage-ok" style="padding:6px 14px;background:var(--brand);color:#fff;border:none;border-radius:var(--rs);cursor:pointer">Move</button>
    </div></div>`;
  document.body.appendChild(m);
  m.querySelector('#triage-cancel').addEventListener('click',_close);
  m.addEventListener('click',e=>{if(e.target===m)_close()});
  m.querySelector('#triage-ok').addEventListener('click',async()=>{
    const gid=Number(m.querySelector('#triage-goal').value);
    if(!gid){showToast('Select a goal');return}
    const dd=m.querySelector('#triage-date').value||null;
    await api.post('/api/inbox/'+inboxId+'/triage',{goal_id:gid,due_date:dd});
    _close();showToast('Moved to goal');await loadAreas();renderInbox();loadOverdueBadge();
  });
}

// ─── NOTES VIEW ───
let activeNoteId=null;
async function renderNotes(){
  const c=$('ct');const notes=await api.get('/api/notes');
  if(activeNoteId){
    const note=notes.find(n=>n.id===activeNoteId);
    if(note)return renderNoteEditor(note);
    activeNoteId=null;
  }
  let h=`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
    <span style="font-size:13px;color:var(--txd)">${notes.length} note${notes.length!==1?'s':''}</span>
    <button id="new-note-btn" style="padding:8px 12px;background:var(--brand);color:#fff;border:none;border-radius:var(--rs);cursor:pointer;font-size:12px"><span class="material-icons-round" style="font-size:13px;vertical-align:middle;margin-right:3px">add</span>New Note</button></div>`;
  if(!notes.length){h+=emptyS('note','No notes yet','Create a note to capture ideas and reference material')}
  notes.forEach(n=>{
    const goalLabel=n.goal_id?allGoals.find(g=>g.id===n.goal_id)?.title||'':'';
    h+=`<div class="note-card" data-id="${n.id}"><h4>${esc(n.title)}</h4>
      <p>${esc(n.content.slice(0,120))}</p>
      <div style="display:flex;justify-content:space-between;margin-top:6px"><span style="font-size:10px;color:var(--txd)">${timeAgo(n.updated_at)}</span>
      ${goalLabel?`<span style="font-size:10px;color:var(--brand)">${esc(goalLabel)}</span>`:''}</div></div>`;
  });
  c.innerHTML=h;
  c.querySelector('#new-note-btn')?.addEventListener('click',async()=>{
    const r=await api.post('/api/notes',{title:'Untitled Note'});
    activeNoteId=r.id;renderNotes();
  });
  c.querySelectorAll('.note-card').forEach(card=>card.addEventListener('click',()=>{
    activeNoteId=Number(card.dataset.id);renderNotes();
  }));
}
async function renderNoteEditor(note){
  const c=$('ct');
  let goalOpts='<option value="">No goal</option>';
  areas.forEach(a=>{
    const goals=allGoals.filter(g=>g.area_id===a.id);
    if(goals.length){goalOpts+=`<optgroup label="${esc(a.icon+' '+a.name)}">${goals.map(g=>`<option value="${g.id}" ${g.id===note.goal_id?'selected':''}>${esc(g.title)}</option>`).join('')}</optgroup>`}
  });
  c.innerHTML=`<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px">
    <button id="note-back" class="material-icons-round" style="background:none;border:none;cursor:pointer;color:var(--tx2);font-size:18px">arrow_back</button>
    <input id="note-title" value="${escA(note.title)}" style="flex:1;font-size:16px;font-weight:600;border:none;background:none;color:var(--tx);outline:none;padding:4px 0">
    <select id="note-goal" style="padding:4px 8px;font-size:11px;border:1px solid var(--brd);border-radius:var(--rs);background:var(--bg-c);color:var(--tx)">${goalOpts}</select>
    <button id="note-del" class="material-icons-round" style="background:none;border:none;cursor:pointer;color:var(--err);font-size:18px">delete</button>
  </div>
  <div class="note-editor"><textarea id="note-content">${esc(note.content)}</textarea></div>`;
  $('note-back').addEventListener('click',()=>{activeNoteId=null;renderNotes()});
  $('note-del').addEventListener('click',async()=>{
    if(!confirm('Delete this note?'))return;
    await api.del('/api/notes/'+note.id);activeNoteId=null;showToast('Deleted');renderNotes();
  });
  let saveTimer;
  const autoSave=()=>{clearTimeout(saveTimer);saveTimer=setTimeout(async()=>{
    await api.put('/api/notes/'+note.id,{
      title:$('note-title').value.trim()||'Untitled',
      content:$('note-content').value,
      goal_id:Number($('note-goal').value)||null
    });
  },600)};
  $('note-title').addEventListener('input',autoSave);
  $('note-content').addEventListener('input',autoSave);
  $('note-goal').addEventListener('change',autoSave);
}

// ─── WEEKLY REVIEW VIEW (3-step guided flow) ───
async function renderWeeklyReview(){
  const c=$('ct');const data=await api.get('/api/reviews/current');
  const existing=data.existingReview;
  if(!window._rvStep)window._rvStep=1;
  const step=window._rvStep;

  // Step indicator
  let h=`<div style="font-size:13px;color:var(--txd);margin-bottom:10px">Week of ${data.weekStart} &mdash; ${data.weekEnd}</div>`;
  h+=`<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px">
    <div class="review-stat"><span class="material-icons-round" style="font-size:14px;color:var(--ok)">check_circle</span>${data.tasksCompletedCount} completed</div>
    <div class="review-stat"><span class="material-icons-round" style="font-size:14px;color:var(--brand)">add_circle</span>${data.tasksCreatedCount} created</div>
    <div class="review-stat"><span class="material-icons-round" style="font-size:14px;color:var(--warn)">event_available</span>${data.activeDays} active days</div>
    <div class="review-stat"><span class="material-icons-round" style="font-size:14px;color:var(--err)">warning</span>${data.overdueTasks.length} overdue</div>
  </div>`;
  // Step bar
  h+=`<div class="rv-steps" style="display:flex;gap:6px;margin-bottom:18px">`;
  ['Area Check-in','Triage','Reflect & Rate'].forEach((lbl,i)=>{
    const n=i+1;const act=n===step;const done=n<step;
    h+=`<div class="rv-step-pip${act?' active':''}${done?' done':''}" data-rvstep="${n}" style="flex:1;text-align:center;padding:8px;border-radius:var(--rs);font-size:12px;cursor:pointer;background:${act?'var(--brand)':done?'rgba(34,197,94,.15)':'var(--bg-c)'};color:${act?'#fff':done?'var(--ok)':'var(--txd)'};border:1px solid ${act?'var(--brand)':done?'rgba(34,197,94,.3)':'var(--brd)'}"><span class="material-icons-round" style="font-size:14px;vertical-align:middle;margin-right:4px">${done?'check_circle':n===1?'category':n===2?'inbox':'edit_note'}</span>${lbl}</div>`;
  });
  h+=`</div>`;

  if(step===1){
    // Step 1: Area Check-in with completion bars
    h+=`<div class="review-section"><h3><span class="material-icons-round" style="font-size:16px;color:var(--brand)">category</span>Area Check-in</h3>
    <p style="font-size:12px;color:var(--txd);margin-bottom:12px">How did each life area progress this week?</p>`;
    if(data.areaStats&&data.areaStats.length){
      data.areaStats.forEach(a=>{
        const total=a.completed+a.pending;const pct=total?Math.round(a.completed/total*100):0;
        h+=`<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--brd)">
          <span style="font-size:20px;width:28px;text-align:center">${esc(a.icon)}</span>
          <span style="flex:1;font-size:13px;font-weight:500;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(a.name)}</span>
          <div style="width:120px;height:6px;background:var(--bg-c);border-radius:3px;overflow:hidden"><div style="width:${pct}%;height:100%;background:${escA(a.color)};border-radius:3px"></div></div>
          <span style="font-size:11px;color:var(--txd);width:60px;text-align:right">${a.completed}/${total}</span>
        </div>`;
      });
    } else {
      h+=`<p style="font-size:13px;color:var(--txd)">No areas set up yet.</p>`;
    }
    h+=`<div style="margin-top:16px;text-align:right"><button class="btn-s rv-next" style="padding:8px 20px;font-size:13px">Next: Triage →</button></div></div>`;
  } else if(step===2){
    // Step 2: Inbox + Overdue Triage
    h+=`<div class="review-section"><h3><span class="material-icons-round" style="font-size:16px;color:var(--warn)">inbox</span>Triage</h3>
    <p style="font-size:12px;color:var(--txd);margin-bottom:12px">Review unprocessed inbox items and overdue tasks.</p>`;
    if(data.inboxCount>0){
      h+=`<div style="padding:10px 14px;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.2);border-radius:var(--rs);margin-bottom:12px;font-size:13px;display:flex;align-items:center;gap:8px">
        <span class="material-icons-round" style="font-size:18px;color:var(--warn)">inbox</span>
        <span>${data.inboxCount} unprocessed inbox item${data.inboxCount>1?'s':''}</span>
        <button class="btn-c rv-go-inbox" style="margin-left:auto;font-size:11px;padding:4px 10px">Go to Inbox</button>
      </div>`;
    }
    if(data.overdueTasks.length){
      h+=`<h4 style="font-size:13px;margin:12px 0 6px;color:var(--err)">Overdue (${data.overdueTasks.length})</h4><ul class="review-list">`;
      data.overdueTasks.slice(0,15).forEach(t=>{
        h+=`<li><span class="material-icons-round" style="font-size:14px;color:var(--err)">radio_button_unchecked</span><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.title)}</span><span style="font-size:10px;color:var(--txd);flex-shrink:0">${t.due_date}</span></li>`;
      });
      h+=`</ul>`;
    }
    if(data.completedTasks.length){
      h+=`<h4 style="font-size:13px;margin:16px 0 6px;color:var(--ok)">Completed This Week (${data.completedTasks.length})</h4><ul class="review-list">`;
      data.completedTasks.slice(0,15).forEach(t=>{
        h+=`<li><span class="material-icons-round" style="font-size:14px;color:var(--ok)">check</span><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.title)}</span><span style="font-size:10px;color:var(--txd);flex-shrink:0">${t.goal_title?esc(t.goal_title):''}</span></li>`;
      });
      h+=`</ul>`;
    }
    if(!data.overdueTasks.length&&!data.inboxCount){
      h+=`<p style="font-size:13px;color:var(--ok)">✓ All clear — no overdue tasks or inbox items!</p>`;
    }
    h+=`<div style="margin-top:16px;display:flex;justify-content:space-between">
      <button class="btn-c rv-prev" style="font-size:13px;padding:8px 20px">← Back</button>
      <button class="btn-s rv-next" style="font-size:13px;padding:8px 20px">Next: Reflect →</button>
    </div></div>`;
  } else {
    // Step 3: Reflection + priorities + star rating
    const existingRating=existing?existing.rating:null;
    h+=`<div class="review-section"><h3><span class="material-icons-round" style="font-size:16px;color:var(--brand)">edit_note</span>Reflection</h3>
    <label style="font-size:12px;color:var(--txd);display:block;margin-bottom:4px">Rate your week</label>
    <div class="rv-rating" id="rv-rating" style="display:flex;gap:6px;margin-bottom:14px">`;
    for(let i=1;i<=5;i++){
      const filled=existingRating&&i<=existingRating;
      h+=`<button class="rv-star" data-star="${i}" style="font-size:24px;background:none;border:none;cursor:pointer;color:${filled?'var(--warn)':'var(--txd)'};padding:2px">★</button>`;
    }
    h+=`</div>
    <label style="font-size:12px;color:var(--txd);display:block;margin-bottom:4px">Top accomplishments (one per line)</label>
    <textarea class="review-textarea" id="rv-acc" rows="3">${existing?JSON.parse(existing.top_accomplishments||'[]').join('\n'):''}</textarea>
    <label style="font-size:12px;color:var(--txd);display:block;margin:8px 0 4px">Reflection &amp; learnings</label>
    <textarea class="review-textarea" id="rv-refl" rows="3">${existing?esc(existing.reflection||''):''}</textarea>
    <label style="font-size:12px;color:var(--txd);display:block;margin:8px 0 4px">Next week priorities (one per line)</label>
    <textarea class="review-textarea" id="rv-next" rows="3">${existing?JSON.parse(existing.next_week_priorities||'[]').join('\n'):''}</textarea>
    <div style="margin-top:16px;display:flex;justify-content:space-between">
      <button class="btn-c rv-prev" style="font-size:13px;padding:8px 20px">← Back</button>
      <div style="display:flex;gap:8px">
        <button class="btn-c" id="ai-review" style="font-size:12px;padding:8px 14px;border-color:var(--brand)"><span class="material-icons-round" style="font-size:14px;vertical-align:middle;margin-right:3px;color:var(--brand)">smart_toy</span>AI Insights</button>
        <button id="rv-save" class="btn-s" style="padding:8px 20px;font-size:13px">${existing?'Update Review':'Save Review'}</button>
      </div>
    </div></div>`;
  }

  // Past reviews
  if(step===3){
    const pastReviews=await api.get('/api/reviews');
    if(pastReviews.length>0){
      h+=`<div class="review-section" style="margin-top:24px"><h3><span class="material-icons-round" style="font-size:16px">history</span>Past Reviews</h3>`;
      pastReviews.forEach(r=>{
        const stars=r.rating?'★'.repeat(r.rating)+'☆'.repeat(5-r.rating):'—';
        h+=`<div style="padding:8px 12px;background:var(--bg-c);border:1px solid var(--brd);border-radius:var(--rs);margin-bottom:6px;font-size:12px;display:flex;justify-content:space-between;align-items:center">
          <span>Week of ${r.week_start}</span><span style="color:var(--warn)">${stars}</span><span>${r.tasks_completed} done / ${r.tasks_created} created</span></div>`;
      });
      h+=`</div>`;
    }
  }

  c.innerHTML=h;

  // Wire step navigation — use renderReports() when inside reports view to preserve tab bar
  const _rvRender=currentView==='reports'?renderReports:renderWeeklyReview;
  c.querySelectorAll('.rv-step-pip').forEach(el=>el.addEventListener('click',()=>{window._rvStep=Number(el.dataset.rvstep);_rvRender()}));
  c.querySelectorAll('.rv-next').forEach(el=>el.addEventListener('click',()=>{window._rvStep=Math.min(3,step+1);_rvRender()}));
  c.querySelectorAll('.rv-prev').forEach(el=>el.addEventListener('click',()=>{window._rvStep=Math.max(1,step-1);_rvRender()}));
  c.querySelector('.rv-go-inbox')?.addEventListener('click',()=>{currentView='inbox';render()});

  // Star rating
  let selectedRating=existing?existing.rating:0;
  c.querySelectorAll('.rv-star').forEach(btn=>{
    btn.addEventListener('click',()=>{
      selectedRating=Number(btn.dataset.star);
      c.querySelectorAll('.rv-star').forEach(s=>{s.style.color=Number(s.dataset.star)<=selectedRating?'var(--warn)':'var(--txd)'});
    });
  });

  // Save
  $('rv-save')?.addEventListener('click',async()=>{
    const acc=$('rv-acc').value.split('\n').map(s=>s.trim()).filter(Boolean);
    const refl=$('rv-refl').value;
    const next=$('rv-next').value.split('\n').map(s=>s.trim()).filter(Boolean);
    await api.post('/api/reviews',{week_start:data.weekStart,top_accomplishments:acc,reflection:refl,next_week_priorities:next,rating:selectedRating||null});
    showToast('Review saved');_rvRender();
  });

  // AI Review Copilot
  $('ai-review')?.addEventListener('click',async()=>{
    const btn=$('ai-review');
    if(btn){btn.disabled=true;btn.innerHTML='<span class="material-icons-round" style="font-size:14px;vertical-align:middle;animation:spin 1s linear infinite">sync</span> Analyzing...';}
    try{
      const r=await api.post('/api/ai/review-week',{});
      showAiReviewModal(r);
    }catch(e){showToast(e.message||'AI unavailable','error')}
    finally{if(btn){btn.disabled=false;btn.innerHTML='<span class="material-icons-round" style="font-size:14px;vertical-align:middle;margin-right:3px;color:var(--brand)">smart_toy</span>AI Insights';}}
  });
}

// ─── TIME ANALYTICS VIEW ───
async function renderTimeAnalytics(target){
  const c=target||$('ct');const data=await api.get('/api/stats/time-analytics');
  let h='';
  // Estimation accuracy summary
  if(data.accuracy&&data.accuracy.total>0){
    const pct=data.accuracy.avg_ratio?Math.round(data.accuracy.avg_ratio*100):0;
    const onTime=data.accuracy.on_time||0;const over=data.accuracy.over||0;
    h+=`<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px">
      <div class="review-stat"><span class="material-icons-round" style="font-size:14px;color:var(--ok)">timer</span>${data.accuracy.total} tracked tasks</div>
      <div class="review-stat"><span class="material-icons-round" style="font-size:14px;color:var(--brand)">speed</span>${pct}% avg accuracy</div>
      <div class="review-stat" style="color:var(--ok)">${onTime} on time</div>
      <div class="review-stat" style="color:var(--err)">${over} over estimate</div>
    </div>`;
  }
  h+=`<div class="ta-grid">`;
  // Time by area
  h+=`<div class="ta-card"><h4><span class="material-icons-round" style="font-size:14px">pie_chart</span>Time by Area</h4>`;
  if(data.byArea.length){
    const maxA=Math.max(...data.byArea.map(a=>a.total_actual||0),1);
    data.byArea.forEach(a=>{
      const est=a.total_estimated||0;const act=a.total_actual||0;
      h+=`<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:12px">
        <span style="width:20px">${esc(a.icon)}</span><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(a.name)}</span>
        <span style="color:var(--txd)">${act}m actual</span>
        ${est?`<span style="color:var(--brand);font-size:10px">(est: ${est}m)</span>`:''}
        <div style="width:60px;height:6px;background:var(--brd);border-radius:3px;overflow:hidden"><div style="width:${Math.round(act/maxA*100)}%;height:100%;background:${escA(a.color)};border-radius:3px"></div></div>
      </div>`;
    });
  } else h+=`<div style="font-size:12px;color:var(--txd)">No tracked data yet</div>`;
  h+=`</div>`;
  // Completion by hour
  h+=`<div class="ta-card"><h4><span class="material-icons-round" style="font-size:14px">schedule</span>Productivity by Hour</h4>`;
  if(data.byHour.length){
    const maxH=Math.max(...data.byHour.map(h=>h.count),1);
    const hours=Array(24).fill(0);data.byHour.forEach(h=>hours[h.hour]=h.count);
    h+=`<div class="ta-bar-h">`;
    for(let i=6;i<23;i++){
      const pct=Math.round(hours[i]/maxH*100);
      h+=`<div style="flex:1;display:flex;flex-direction:column;align-items:center;height:100%;justify-content:flex-end">
        <div class="ta-bar-v" style="height:${pct}%;background:${hours[i]?'var(--brand)':'var(--brd)'}"></div>
        <div class="ta-bar-label">${i}</div></div>`;
    }
    h+=`</div>`;
  } else h+=`<div style="font-size:12px;color:var(--txd)">Complete tasks to see patterns</div>`;
  h+=`</div>`;
  // Weekly velocity
  h+=`<div class="ta-card"><h4><span class="material-icons-round" style="font-size:14px">trending_up</span>Weekly Velocity</h4>`;
  if(data.weeklyVelocity.length){
    const maxW=Math.max(...data.weeklyVelocity.map(w=>w.count),1);
    h+=`<div class="ta-bar-h">`;
    data.weeklyVelocity.forEach(w=>{
      const pct=Math.round(w.count/maxW*100);
      h+=`<div style="flex:1;display:flex;flex-direction:column;align-items:center;height:100%;justify-content:flex-end">
        <div class="ta-bar-v" style="height:${pct}%;background:var(--ok)"></div>
        <div class="ta-bar-label">${w.week.slice(-3)}</div>
        <div style="font-size:8px;font-weight:600">${w.count}</div></div>`;
    });
    h+=`</div>`;
  } else h+=`<div style="font-size:12px;color:var(--txd)">Complete tasks to see velocity</div>`;
  h+=`</div>`;
  // Accuracy trend placeholder
  h+=`<div class="ta-card"><h4><span class="material-icons-round" style="font-size:14px">target</span>Estimation Tips</h4>`;
  if(data.accuracy&&data.accuracy.avg_ratio){
    const r=data.accuracy.avg_ratio;
    if(r>1.3)h+=`<p style="font-size:12px;margin:0;color:var(--warn)">You tend to <b>underestimate</b> tasks. Try adding 30% buffer to your estimates.</p>`;
    else if(r<0.7)h+=`<p style="font-size:12px;margin:0;color:var(--brand)">You tend to <b>overestimate</b> tasks. Your estimates have room to tighten up.</p>`;
    else h+=`<p style="font-size:12px;margin:0;color:var(--ok)">Your estimates are pretty accurate! Keep it up.</p>`;
  } else h+=`<p style="font-size:12px;margin:0;color:var(--txd)">Add time estimates and track actuals to get personalized tips.</p>`;
  h+=`</div></div>`;
  c.innerHTML=h;
}

// ─── AUTOMATION RULES VIEW ───
let _autoConsts=null;  // cached constants from /api/rules/constants
async function _getAutoConsts(){
  if(!_autoConsts)_autoConsts=await api.get('/api/rules/constants');
  return _autoConsts;
}
async function renderRules(){
  const c=$('ct');const rules=await api.get('/api/rules');
  const consts=await _getAutoConsts();
  let h=`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px">
    <span style="font-size:13px;color:var(--txd)">${rules.length} rule${rules.length!==1?'s':''}</span>
    <div style="display:flex;gap:6px">
      <button id="auto-templates-btn" class="btn-s" style="font-size:11px"><span class="material-icons-round" style="font-size:13px;vertical-align:middle;margin-right:2px">auto_awesome</span>Templates</button>
      <button id="auto-log-btn" class="btn-s" style="font-size:11px"><span class="material-icons-round" style="font-size:13px;vertical-align:middle;margin-right:2px">history</span>Log</button>
      <button id="ai-build-rule" class="btn-s" style="font-size:11px;border-color:var(--brand);background:transparent;color:var(--brand)"><span class="material-icons-round" style="font-size:13px;vertical-align:middle;margin-right:2px">smart_toy</span>AI Build</button>
      <button id="new-rule-btn" style="padding:8px 12px;background:var(--brand);color:#fff;border:none;border-radius:var(--rs);cursor:pointer;font-size:12px"><span class="material-icons-round" style="font-size:13px;vertical-align:middle;margin-right:3px">add</span>New Rule</button>
    </div></div>`;
  // Suggestions banner
  try{const sugg=await api.get('/api/rules/suggestions');if(sugg.length>0){
    h+=`<div class="auto-suggestions" style="margin-bottom:14px;padding:10px;border:1px solid var(--brand);border-radius:var(--rs);background:color-mix(in srgb,var(--brand) 8%,var(--bg))">
      <div style="font-size:11px;font-weight:600;margin-bottom:6px;color:var(--brand)"><span class="material-icons-round" style="font-size:14px;vertical-align:middle">tips_and_updates</span> Suggestions</div>`;
    sugg.forEach(s=>{h+=`<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;font-size:12px">
      <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--tx)">${esc(s.reason||s.template_id)}</span>
      <button class="btn-s auto-dismiss-sugg" data-id="${s.id}" style="font-size:10px">Dismiss</button></div>`;});
    h+=`</div>`;
  }}catch{}
  if(!rules.length)h+=emptyS('auto_fix_high','No automation rules','Create rules to automate your workflow — e.g. auto-add overdue tasks to My Day, create follow-up tasks, and more.',
    `<button class="btn-s" data-action="click-new-rule"><span class="material-icons-round" style="font-size:14px">add</span>Create Rule</button>
     <button class="btn-s" id="empty-templates-btn" style="margin-left:6px"><span class="material-icons-round" style="font-size:14px">auto_awesome</span>Browse Templates</button>`);
  rules.forEach(r=>{
    const tl=(consts.trigger_labels||{})[r.trigger_type]||r.trigger_type;
    // Build actions summary
    let actionsArr;
    try{actionsArr=r.actions?JSON.parse(r.actions):null;}catch{actionsArr=null;}
    let actionSummary='';
    if(actionsArr&&actionsArr.length>0){
      actionSummary=actionsArr.map(a=>(consts.action_labels||{})[a.type]||a.type).join(' → ');
    }else{
      actionSummary=(consts.action_labels||{})[r.action_type]||r.action_type;
    }
    // Conditions summary
    let condSummary='';
    try{
      const conds=r.conditions?JSON.parse(r.conditions):null;
      if(conds&&conds.rules&&conds.rules.length){
        condSummary=`<div style="font-size:10px;color:var(--txd);margin-top:2px">${conds.rules.length} condition${conds.rules.length>1?'s':''} (${conds.logic||'AND'})</div>`;
      }
    }catch{}
    // Stats
    const stats=[];
    if(r.fire_count>0)stats.push(`${r.fire_count} run${r.fire_count!==1?'s':''}`);
    if(r.last_fired_at)stats.push(`last: ${fmtDue(r.last_fired_at.slice(0,10))}`);
    h+=`<div class="rule-card" data-rule-id="${r.id}">
      <button class="rule-toggle ${r.enabled?'on':'off'}" data-id="${r.id}" data-enabled="${r.enabled}" title="${r.enabled?'Disable':'Enable'}"></button>
      <div style="flex:1;min-width:0;overflow:hidden;cursor:pointer" class="rule-edit-area" data-id="${r.id}">
        <div class="rule-name">${esc(r.name)}</div>
        <div class="rule-meta">${esc(tl)} → ${esc(actionSummary)}</div>
        ${condSummary}
        ${r.description?`<div style="font-size:10px;color:var(--txd);margin-top:2px">${esc(r.description)}</div>`:''}
        ${stats.length?`<div style="font-size:10px;color:var(--txd);margin-top:2px">${stats.join(' · ')}</div>`:''}
      </div>
      <div style="display:flex;gap:2px;align-items:center">
        <button class="material-icons-round rule-test" data-id="${r.id}" style="background:none;border:none;cursor:pointer;color:var(--txd);font-size:16px" title="Test rule">play_arrow</button>
        <button class="material-icons-round rule-del" data-id="${r.id}" style="background:none;border:none;cursor:pointer;color:var(--txd);font-size:16px" title="Delete">delete</button>
      </div>
    </div>`;
  });
  c.innerHTML=h;wireActions(c);
  c.querySelector('#new-rule-btn')?.addEventListener('click',()=>showRuleModal());
  c.querySelector('#auto-templates-btn')?.addEventListener('click',showTemplateGallery);
  c.querySelector('#auto-log-btn')?.addEventListener('click',showAutomationLog);
  c.querySelector('#ai-build-rule')?.addEventListener('click',()=>{
    const desc=prompt('Describe the automation you want in plain English:\n(e.g., "When I complete a task tagged #work, add it to my weekly report")');
    if(!desc)return;
    const btn=c.querySelector('#ai-build-rule');
    if(btn){btn.disabled=true;btn.innerHTML='<span class="material-icons-round" style="font-size:13px;vertical-align:middle;animation:spin 1s linear infinite">sync</span>';}
    api.post('/api/ai/build-automation',{description:desc}).then(r=>{
      const d=r.data||r;
      if(d.trigger_type){
        showToast(`AI created rule: "${esc(d.name||desc)}" — review and save it`,'ok',6000);
        showRuleModal({name:d.name||'',description:d.description||'',trigger_type:d.trigger_type,trigger_config:JSON.stringify(d.trigger_config||{}),conditions:JSON.stringify(d.conditions||[]),actions:JSON.stringify(d.actions||[]),enabled:1});
      }else showToast('Could not build automation','error');
    }).catch(e=>showToast(e.message||'AI unavailable','error'))
    .finally(()=>{if(btn){btn.disabled=false;btn.innerHTML='<span class="material-icons-round" style="font-size:13px;vertical-align:middle;margin-right:2px">smart_toy</span>AI Build';}});
  });
  c.querySelector('#empty-templates-btn')?.addEventListener('click',showTemplateGallery);
  c.querySelectorAll('.rule-toggle').forEach(btn=>btn.addEventListener('click',async()=>{
    const id=Number(btn.dataset.id);const cur=btn.dataset.enabled==='1';
    await api.put('/api/rules/'+id,{enabled:cur?0:1});renderRules();
  }));
  c.querySelectorAll('.rule-edit-area').forEach(el=>el.addEventListener('click',async()=>{
    const id=Number(el.dataset.id);const rule=rules.find(r=>r.id===id);if(rule)showRuleModal(rule);
  }));
  c.querySelectorAll('.rule-test').forEach(btn=>btn.addEventListener('click',async()=>{
    const id=Number(btn.dataset.id);
    try{const res=await api.post('/api/rules/'+id+'/test',{});
      showToast(`Test: ${res.count} task${res.count!==1?'s':''} would match`);
    }catch(e){showToast('Test failed: '+e.message);}
  }));
  c.querySelectorAll('.rule-del').forEach(btn=>btn.addEventListener('click',async()=>{
    if(!confirm('Delete this rule?'))return;
    await api.delete('/api/rules/'+btn.dataset.id);showToast('Rule deleted');renderRules();
  }));
  c.querySelectorAll('.auto-dismiss-sugg').forEach(btn=>btn.addEventListener('click',async()=>{
    await api.post('/api/rules/suggestions/'+btn.dataset.id+'/dismiss',{});renderRules();
  }));
}

// ─── RULE BUILDER MODAL ───
async function showRuleModal(editRule){
  const consts=await _getAutoConsts();
  const isEdit=!!editRule;
  let existingActions=null,existingConditions=null;
  if(isEdit){
    try{existingActions=editRule.actions?JSON.parse(editRule.actions):null;}catch{}
    try{existingConditions=editRule.conditions?JSON.parse(editRule.conditions):null;}catch{}
  }
  const m=document.createElement('div');m.className='triage-modal';
  m.setAttribute('role','dialog');m.setAttribute('aria-modal','true');m.setAttribute('aria-label',isEdit?'Edit Automation Rule':'New Automation Rule');
  const _close=()=>{if(m._removeTrap)m._removeTrap();m.remove();_popFocus();_unlockBody()};

  // Group triggers
  const triggerGroups=[
    {label:'Task',types:['task_completed','task_created','task_updated','task_overdue','task_due_today','task_due_soon','task_stale']},
    {label:'Goal',types:['goal_progress','goal_all_tasks_done']},
    {label:'Habit',types:['habit_logged','habit_streak','habit_missed']},
    {label:'Focus',types:['focus_completed','focus_streak']},
    {label:'Schedule',types:['schedule_daily','schedule_weekly','schedule_monthly']},
    {label:'Review',types:['daily_review_saved','weekly_review_saved']},
  ];

  let triggerOpts='';
  triggerGroups.forEach(g=>{
    triggerOpts+=`<optgroup label="${g.label}">`;
    g.types.forEach(t=>{
      if(consts.trigger_types.includes(t)){
        triggerOpts+=`<option value="${t}"${isEdit&&editRule.trigger_type===t?' selected':''}>${consts.trigger_labels[t]||t}</option>`;
      }
    });
    triggerOpts+=`</optgroup>`;
  });

  m.innerHTML=`<div class="triage-box" style="width:520px;max-height:85vh;overflow-y:auto">
    <h3 style="margin:0 0 12px;font-size:14px">${isEdit?'Edit':'New'} Automation Rule</h3>
    <input type="text" id="rule-name" placeholder="Rule name" value="${isEdit?escA(editRule.name):''}" style="margin-bottom:6px">
    <input type="text" id="rule-desc" placeholder="Description (optional)" value="${isEdit?escA(editRule.description||''):''}" style="margin-bottom:10px;font-size:11px">

    <label style="font-size:11px;color:var(--txd);font-weight:600">When...</label>
    <select id="rule-trigger" style="margin-bottom:6px">${triggerOpts}</select>
    <div id="rule-trigger-config" style="margin-bottom:10px"></div>

    <div id="rule-conditions-section" style="margin-bottom:10px">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <label style="font-size:11px;color:var(--txd);font-weight:600">Only if... (conditions)</label>
        <button id="add-condition-btn" class="btn-s" style="font-size:10px"><span class="material-icons-round" style="font-size:12px">add</span>Add</button>
      </div>
      <select id="cond-logic" style="width:70px;font-size:10px;margin:4px 0"><option value="AND"${existingConditions?.logic==='OR'?'':' selected'}>ALL</option><option value="OR"${existingConditions?.logic==='OR'?' selected':''}>ANY</option></select>
      <div id="conditions-list"></div>
    </div>

    <label style="font-size:11px;color:var(--txd);font-weight:600">Then do...</label>
    <div id="actions-list" style="margin-bottom:6px"></div>
    <button id="add-action-btn" class="btn-s" style="font-size:10px;margin-bottom:10px"><span class="material-icons-round" style="font-size:12px">add</span>Add Action</button>

    <div id="rule-preview" style="padding:8px;background:var(--sf);border-radius:var(--rs);font-size:11px;color:var(--txd);margin-bottom:10px"></div>

    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button id="rule-cancel" style="padding:6px 14px;background:none;border:1px solid var(--brd);border-radius:var(--rs);cursor:pointer;color:var(--tx)">Cancel</button>
      <button id="rule-save" style="padding:6px 14px;background:var(--brand);color:#fff;border:none;border-radius:var(--rs);cursor:pointer">${isEdit?'Save':'Create'}</button>
    </div></div>`;
  document.body.appendChild(m);

  // ─── Trigger Config ───
  function renderTriggerConfig(){
    const tt=$('rule-trigger').value;const box=$('rule-trigger-config');
    let tc={};if(isEdit){try{tc=JSON.parse(editRule.trigger_config||'{}');}catch{}}
    let html='';
    if(tt.startsWith('task_')||tt==='goal_progress'||tt==='goal_all_tasks_done'){
      html+=`<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px">`;
      // Area filter
      html+=`<select id="tc-area" style="font-size:11px;flex:1"><option value="">Any area</option>`;
      (consts.areas||[]).forEach(a=>{html+=`<option value="${a.id}"${tc.area_id==a.id?' selected':''}>${esc(a.name)}</option>`;});
      html+=`</select>`;
      // Goal filter
      html+=`<select id="tc-goal" style="font-size:11px;flex:1"><option value="">Any goal</option>`;
      (consts.goals||[]).forEach(g=>{html+=`<option value="${g.id}"${tc.goal_id==g.id?' selected':''}>${esc(g.title)}</option>`;});
      html+=`</select>`;
      // Priority filter
      html+=`<select id="tc-priority" style="font-size:11px;flex:1"><option value="">Any priority</option>
        <option value="0"${tc.priority==='0'||tc.priority===0?' selected':''}>None</option>
        <option value="1"${tc.priority==='1'||tc.priority===1?' selected':''}>Normal</option>
        <option value="2"${tc.priority==='2'||tc.priority===2?' selected':''}>High</option>
        <option value="3"${tc.priority==='3'||tc.priority===3?' selected':''}>Critical</option></select>`;
      html+=`</div>`;
      // Tag filter
      html+=`<div style="margin-top:4px"><select id="tc-tag" style="font-size:11px"><option value="">Any tag</option>`;
      (consts.tags||[]).forEach(t=>{html+=`<option value="${t.name}"${tc.tag===t.name?' selected':''}>${esc(t.name)}</option>`;});
      html+=`</select></div>`;
    }
    if(tt==='goal_progress'){
      html+=`<div style="margin-top:4px"><label style="font-size:10px;color:var(--txd)">Progress threshold (%)</label>
        <input type="number" id="tc-threshold" min="1" max="100" value="${tc.threshold||75}" style="width:60px;font-size:11px"></div>`;
    }
    if(tt.startsWith('schedule_')){
      html+=`<div style="margin-top:4px">`;
      html+=`<label style="font-size:10px;color:var(--txd)">Time (HH:MM)</label>
        <input type="time" id="tc-time" value="${tc.time||'09:00'}" style="font-size:11px">`;
      if(tt==='schedule_weekly'){
        html+=`<label style="font-size:10px;color:var(--txd);margin-left:8px">Day</label>
          <select id="tc-day" style="font-size:11px">`;
        ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].forEach((d,i)=>{html+=`<option value="${i+1}"${tc.day_of_week==i+1?' selected':''}>${d}</option>`;});
        html+=`</select>`;
      }
      if(tt==='schedule_monthly'){
        html+=`<label style="font-size:10px;color:var(--txd);margin-left:8px">Day of month</label>
          <input type="number" id="tc-dom" min="1" max="28" value="${tc.day_of_month||1}" style="width:50px;font-size:11px">`;
      }
      html+=`</div>`;
    }
    if(tt==='habit_logged'||tt==='habit_streak'||tt==='habit_missed'){
      html+=`<div style="margin-top:4px"><select id="tc-habit" style="font-size:11px"><option value="">Any habit</option>`;
      (consts.habits||[]).forEach(h=>{html+=`<option value="${h.id}"${tc.habit_id==h.id?' selected':''}>${esc(h.name)}</option>`;});
      html+=`</select></div>`;
      if(tt==='habit_streak'){
        html+=`<div style="margin-top:4px"><label style="font-size:10px;color:var(--txd)">Streak threshold</label>
          <input type="number" id="tc-streak" min="1" value="${tc.streak_threshold||7}" style="width:50px;font-size:11px"></div>`;
      }
    }
    box.innerHTML=html;
  }

  // ─── Conditions Builder ───
  let conditions=existingConditions?[...existingConditions.rules||[]]:[]; 
  function renderConditions(){
    const list=$('conditions-list');
    if(!conditions.length){list.innerHTML='<div style="font-size:10px;color:var(--txd);padding:4px">No conditions — rule applies to all matching events</div>';return;}
    let html='';
    conditions.forEach((cond,i)=>{
      html+=`<div class="cond-row" style="display:flex;gap:4px;align-items:center;margin-bottom:4px">
        <select class="cond-field" data-i="${i}" style="font-size:10px;flex:1">
          <option value="priority"${cond.field==='priority'?' selected':''}>Priority</option>
          <option value="status"${cond.field==='status'?' selected':''}>Status</option>
          <option value="area_id"${cond.field==='area_id'?' selected':''}>Area</option>
          <option value="goal_id"${cond.field==='goal_id'?' selected':''}>Goal</option>
          <option value="has_tag"${cond.field==='has_tag'?' selected':''}>Has tag</option>
          <option value="title_contains"${cond.field==='title_contains'?' selected':''}>Title contains</option>
          <option value="due_date"${cond.field==='due_date'?' selected':''}>Due date</option>
          <option value="estimated_minutes"${cond.field==='estimated_minutes'?' selected':''}>Est. minutes</option>
          <option value="days_overdue"${cond.field==='days_overdue'?' selected':''}>Days overdue</option>
        </select>
        <select class="cond-op" data-i="${i}" style="font-size:10px;width:60px">
          <option value="eq"${cond.op==='eq'?' selected':''}>=</option>
          <option value="neq"${cond.op==='neq'?' selected':''}>≠</option>
          <option value="gt"${cond.op==='gt'?' selected':''}>&gt;</option>
          <option value="lt"${cond.op==='lt'?' selected':''}>&lt;</option>
          <option value="gte"${cond.op==='gte'?' selected':''}>≥</option>
          <option value="lte"${cond.op==='lte'?' selected':''}>≤</option>
          <option value="contains"${cond.op==='contains'?' selected':''}>contains</option>
          <option value="in"${cond.op==='in'?' selected':''}>in</option>
        </select>
        <input type="text" class="cond-val" data-i="${i}" value="${escA(String(cond.value||''))}" style="font-size:10px;flex:1" placeholder="value">
        <button class="material-icons-round cond-del" data-i="${i}" style="background:none;border:none;cursor:pointer;color:var(--txd);font-size:14px">close</button>
      </div>`;
    });
    list.innerHTML=html;
    list.querySelectorAll('.cond-field,.cond-op').forEach(sel=>sel.addEventListener('change',syncConditions));
    list.querySelectorAll('.cond-val').forEach(inp=>inp.addEventListener('input',syncConditions));
    list.querySelectorAll('.cond-del').forEach(btn=>btn.addEventListener('click',()=>{conditions.splice(Number(btn.dataset.i),1);renderConditions();updatePreview();}));
  }
  function syncConditions(){
    document.querySelectorAll('.cond-row').forEach((row,i)=>{
      conditions[i]={
        field:row.querySelector('.cond-field').value,
        op:row.querySelector('.cond-op').value,
        value:row.querySelector('.cond-val').value
      };
    });
    updatePreview();
  }
  $('add-condition-btn').addEventListener('click',()=>{conditions.push({field:'priority',op:'gte',value:'2'});renderConditions();updatePreview();});

  // ─── Actions Builder ───
  let actions=existingActions||[{type:isEdit?editRule.action_type:'add_to_myday',config:isEdit?(()=>{try{return JSON.parse(editRule.action_config||'{}');}catch{return{};}})():{}}];
  function renderActions(){
    const list=$('actions-list');let html='';
    actions.forEach((act,i)=>{
      html+=`<div class="action-row" style="border:1px solid var(--brd);border-radius:var(--rs);padding:6px;margin-bottom:4px">
        <div style="display:flex;gap:4px;align-items:center;margin-bottom:4px">
          <span style="font-size:10px;color:var(--txd);font-weight:600">${i+1}.</span>
          <select class="action-type" data-i="${i}" style="font-size:11px;flex:1">`;
      // Group action options
      const actionGroups=[
        {label:'Task',types:['add_to_myday','remove_from_myday','set_priority','set_status','set_due_date','add_tag','move_to_goal','create_followup','add_subtasks','apply_template']},
        {label:'Habit',types:['log_habit','create_habit_task']},
        {label:'Notify',types:['send_notification','send_toast']},
        {label:'Organize',types:['move_to_inbox','archive_goal','create_review_prompt']},
      ];
      actionGroups.forEach(g=>{
        html+=`<optgroup label="${g.label}">`;
        g.types.forEach(t=>{
          if(consts.action_types.includes(t))html+=`<option value="${t}"${act.type===t?' selected':''}>${consts.action_labels[t]||t}</option>`;
        });
        html+=`</optgroup>`;
      });
      html+=`</select>`;
      if(actions.length>1)html+=`<button class="material-icons-round action-del" data-i="${i}" style="background:none;border:none;cursor:pointer;color:var(--txd);font-size:14px">close</button>`;
      html+=`</div><div class="action-config" data-i="${i}"></div></div>`;
    });
    list.innerHTML=html;
    // Render config for each action
    list.querySelectorAll('.action-type').forEach(sel=>{
      sel.addEventListener('change',()=>{
        const i=Number(sel.dataset.i);actions[i].type=sel.value;actions[i].config={};renderActionConfig(i);updatePreview();
      });
    });
    list.querySelectorAll('.action-del').forEach(btn=>btn.addEventListener('click',()=>{actions.splice(Number(btn.dataset.i),1);renderActions();updatePreview();}));
    actions.forEach((_,i)=>renderActionConfig(i));
  }
  function renderActionConfig(i){
    const act=actions[i];const cfg=act.config||{};
    const box=document.querySelectorAll('.action-config[data-i="'+i+'"]')[0];if(!box)return;
    let html='';
    switch(act.type){
      case'set_priority':html=`<select class="ac-val" data-i="${i}" data-key="priority" style="font-size:11px">
        <option value="0"${cfg.priority===0?' selected':''}>None</option><option value="1"${cfg.priority===1?' selected':''}>Normal</option>
        <option value="2"${cfg.priority===2?' selected':''}>High</option><option value="3"${cfg.priority===3?' selected':''}>Critical</option></select>`;break;
      case'set_status':html=`<select class="ac-val" data-i="${i}" data-key="status" style="font-size:11px">
        <option value="todo"${cfg.status==='todo'?' selected':''}>Todo</option><option value="doing"${cfg.status==='doing'?' selected':''}>Doing</option>
        <option value="done"${cfg.status==='done'?' selected':''}>Done</option></select>`;break;
      case'set_due_date':html=`<select class="ac-val" data-i="${i}" data-key="relative" style="font-size:11px">
        <option value="today"${cfg.relative==='today'?' selected':''}>Today</option><option value="tomorrow"${cfg.relative==='tomorrow'?' selected':''}>Tomorrow</option>
        <option value="+3days"${cfg.relative==='+3days'?' selected':''}>In 3 days</option><option value="+7days"${cfg.relative==='+7days'?' selected':''}>In 7 days</option></select>`;break;
      case'add_tag':html=`<select class="ac-val" data-i="${i}" data-key="tag_name" style="font-size:11px"><option value="">Select tag</option>`;
        (consts.tags||[]).forEach(t=>{html+=`<option value="${esc(t.name)}"${cfg.tag_name===t.name?' selected':''}>${esc(t.name)}</option>`;});
        html+=`</select>`;break;
      case'move_to_goal':html=`<select class="ac-val" data-i="${i}" data-key="goal_id" style="font-size:11px"><option value="">Select goal</option>`;
        (consts.goals||[]).forEach(g=>{html+=`<option value="${g.id}"${cfg.goal_id==g.id?' selected':''}>${esc(g.title)}</option>`;});
        html+=`</select>`;break;
      case'create_followup':html=`<input type="text" class="ac-val" data-i="${i}" data-key="title" placeholder="Follow-up title (use {{task.title}} for interpolation)" value="${escA(cfg.title||'')}" style="font-size:11px;width:100%">`;break;
      case'add_subtasks':html=`<textarea class="ac-val" data-i="${i}" data-key="subtasks" placeholder="One subtask per line" style="font-size:11px;width:100%;height:50px">${esc(cfg.subtasks||'')}</textarea>`;break;
      case'apply_template':html=`<select class="ac-val" data-i="${i}" data-key="template_id" style="font-size:11px"><option value="">Select template</option>`;
        (consts.templates||[]).forEach(t=>{html+=`<option value="${t.id}"${cfg.template_id==t.id?' selected':''}>${esc(t.name)}</option>`;});
        html+=`</select>`;break;
      case'log_habit':html=`<select class="ac-val" data-i="${i}" data-key="habit_id" style="font-size:11px"><option value="">Select habit</option>`;
        (consts.habits||[]).forEach(h=>{html+=`<option value="${h.id}"${cfg.habit_id==h.id?' selected':''}>${esc(h.name)}</option>`;});
        html+=`</select>`;break;
      case'create_habit_task':html=`<select class="ac-val" data-i="${i}" data-key="habit_id" style="font-size:11px"><option value="">Select habit</option>`;
        (consts.habits||[]).forEach(h=>{html+=`<option value="${h.id}"${cfg.habit_id==h.id?' selected':''}>${esc(h.name)}</option>`;});
        html+=`</select><select class="ac-val" data-i="${i}" data-key="goal_id" style="font-size:11px;margin-top:4px"><option value="">Select goal</option>`;
        (consts.goals||[]).forEach(g=>{html+=`<option value="${g.id}"${cfg.goal_id==g.id?' selected':''}>${esc(g.title)}</option>`;});
        html+=`</select>`;break;
      case'send_notification':case'send_toast':
        html=`<input type="text" class="ac-val" data-i="${i}" data-key="message" placeholder="Message (use {{task.title}} etc)" value="${escA(cfg.message||'')}" style="font-size:11px;width:100%">`;break;
      case'create_review_prompt':
        html=`<input type="text" class="ac-val" data-i="${i}" data-key="note" placeholder="Review note text" value="${escA(cfg.note||'')}" style="font-size:11px;width:100%">`;break;
    }
    box.innerHTML=html;
    box.querySelectorAll('.ac-val').forEach(el=>{
      el.addEventListener('change',()=>syncActionConfigs());
      el.addEventListener('input',()=>syncActionConfigs());
    });
  }
  function syncActionConfigs(){
    document.querySelectorAll('.action-row').forEach((row,i)=>{
      if(!actions[i])return;
      const vals=row.querySelectorAll('.ac-val');
      const cfg={};
      vals.forEach(v=>{
        const key=v.dataset.key;let val=v.value;
        if(v.tagName==='SELECT'&&!isNaN(Number(val))&&val!=='')val=Number(val);
        if(key)cfg[key]=val;
      });
      actions[i].config=cfg;
    });
    updatePreview();
  }
  $('add-action-btn').addEventListener('click',()=>{
    if(actions.length>=10){showToast('Max 10 actions');return;}
    actions.push({type:'send_toast',config:{message:''}});renderActions();updatePreview();
  });

  // ─── Natural Language Preview ───
  function updatePreview(){
    const tt=$('rule-trigger').value;const tl=(consts.trigger_labels||{})[tt]||tt;
    let text=tl;
    // Add condition summary
    if(conditions.length){
      const logic=$('cond-logic').value;
      const condTexts=conditions.map(c=>`${c.field} ${c.op} ${c.value}`);
      text+=`, ${logic==='OR'?'if any':'only if'}: ${condTexts.join(logic==='OR'?' or ':' and ')}`;
    }
    text+=' → ';
    text+=actions.map(a=>{
      const al=(consts.action_labels||{})[a.type]||a.type;
      const cfg=a.config||{};
      if(a.type==='set_priority')return al+' to '+['None','Normal','High','Critical'][cfg.priority||0];
      if(a.type==='create_followup'&&cfg.title)return al+': "'+cfg.title+'"';
      if(a.type==='send_toast'&&cfg.message)return al+': "'+cfg.message+'"';
      return al;
    }).join(', then ');
    $('rule-preview').textContent=text;
  }

  // ─── Initial render ───
  $('rule-trigger').addEventListener('change',()=>{renderTriggerConfig();updatePreview();});
  renderTriggerConfig();renderConditions();renderActions();updatePreview();
  $('cond-logic').addEventListener('change',updatePreview);

  // ─── Save ───
  $('rule-cancel').addEventListener('click',_close);
  m.addEventListener('click',e=>{if(e.target===m)_close()});
  $('rule-save').addEventListener('click',async()=>{
    const name=$('rule-name').value.trim();if(!name){showToast('Name required');return;}
    const trigger_type=$('rule-trigger').value;
    const description=$('rule-desc').value.trim();
    // Build trigger config from UI
    const trigger_config={};
    const tcArea=document.getElementById('tc-area');if(tcArea&&tcArea.value)trigger_config.area_id=Number(tcArea.value);
    const tcGoal=document.getElementById('tc-goal');if(tcGoal&&tcGoal.value)trigger_config.goal_id=Number(tcGoal.value);
    const tcPri=document.getElementById('tc-priority');if(tcPri&&tcPri.value!=='')trigger_config.priority=Number(tcPri.value);
    const tcTag=document.getElementById('tc-tag');if(tcTag&&tcTag.value)trigger_config.tag=tcTag.value;
    const tcHabit=document.getElementById('tc-habit');if(tcHabit&&tcHabit.value)trigger_config.habit_id=Number(tcHabit.value);
    const tcTime=document.getElementById('tc-time');if(tcTime)trigger_config.time=tcTime.value;
    const tcDay=document.getElementById('tc-day');if(tcDay)trigger_config.day_of_week=Number(tcDay.value);
    const tcDom=document.getElementById('tc-dom');if(tcDom)trigger_config.day_of_month=Number(tcDom.value);
    const tcThresh=document.getElementById('tc-threshold');if(tcThresh)trigger_config.threshold=Number(tcThresh.value);
    const tcStreak=document.getElementById('tc-streak');if(tcStreak)trigger_config.streak_threshold=Number(tcStreak.value);
    // Build conditions
    syncConditions();
    const condObj=conditions.length?{logic:$('cond-logic').value,rules:conditions}:null;
    // Build actions
    syncActionConfigs();
    const body={name,trigger_type,trigger_config,description,conditions:condObj,actions};
    try{
      if(isEdit){await api.put('/api/rules/'+editRule.id,body);showToast('Rule updated');}
      else{await api.post('/api/rules',body);showToast('Rule created');}
      _close();_autoConsts=null;renderRules();
    }catch(e){showToast('Error: '+e.message);}
  });
}

// ─── TEMPLATE GALLERY MODAL ───
async function showTemplateGallery(){
  const templates=await api.get('/api/rules/templates');
  const consts=await _getAutoConsts();
  const m=document.createElement('div');m.className='triage-modal';
  m.setAttribute('role','dialog');m.setAttribute('aria-modal','true');m.setAttribute('aria-label','Automation Templates');
  const _close=()=>{if(m._removeTrap)m._removeTrap();m.remove();_popFocus();_unlockBody()};
  const catMap={};
  templates.forEach(t=>{const c=t.category||'Other';if(!catMap[c])catMap[c]=[];catMap[c].push(t);});
  let html=`<div class="triage-box" style="width:560px;max-height:85vh;overflow-y:auto">
    <h3 style="margin:0 0 12px;font-size:14px">Automation Templates</h3>
    <p style="font-size:11px;color:var(--txd);margin:0 0 12px">Pre-built rules you can install with one click. Customize after installing.</p>`;
  for(const[cat,tmpls]of Object.entries(catMap)){
    html+=`<div class="rule-meta" style="font-size:11px;font-weight:600;margin:10px 0 6px">${esc(cat)}</div>`;
    tmpls.forEach(t=>{
      const tl=(consts.trigger_labels||{})[t.trigger_type]||t.trigger_type;
      let actArr;try{actArr=JSON.parse(t.actions||'[]');}catch{actArr=[];}
      const actSummary=actArr.map(a=>(consts.action_labels||{})[a.type]||a.type).join(', ');
      html+=`<div class="rule-card" style="cursor:default">
        <div style="flex:1;min-width:0">
          <div class="rule-name">${esc(t.name)}</div>
          <div class="rule-meta">${esc(tl)} → ${esc(actSummary)}</div>
          ${t.description?`<div style="font-size:10px;color:var(--txd);margin-top:2px">${esc(t.description)}</div>`:''}
        </div>
        <button class="btn-s tmpl-install" data-id="${t.id}" style="font-size:11px;white-space:nowrap">Install</button>
      </div>`;
    });
  }
  html+=`<div style="display:flex;justify-content:flex-end;margin-top:12px">
    <button id="tmpl-close" style="padding:6px 14px;background:none;border:1px solid var(--brd);border-radius:var(--rs);cursor:pointer;color:var(--tx)">Close</button></div></div>`;
  m.innerHTML=html;
  document.body.appendChild(m);
  $('tmpl-close')?.addEventListener('click',_close);
  m.addEventListener('click',e=>{if(e.target===m)_close()});
  m.querySelectorAll('.tmpl-install').forEach(btn=>btn.addEventListener('click',async()=>{
    try{await api.post('/api/rules/templates/'+btn.dataset.id+'/install',{});showToast('Template installed');_close();renderRules();}
    catch(e){showToast('Install failed: '+e.message);}
  }));
}

// ─── AUTOMATION LOG MODAL ───
async function showAutomationLog(){
  const m=document.createElement('div');m.className='triage-modal';
  m.setAttribute('role','dialog');m.setAttribute('aria-modal','true');m.setAttribute('aria-label','Automation Log');
  const _close=()=>{if(m._removeTrap)m._removeTrap();m.remove();_popFocus();_unlockBody()};
  let offset=0;const limit=20;
  async function loadPage(){
    const res=await api.get('/api/rules/log?limit='+limit+'&offset='+offset);
    let html=`<div class="triage-box" style="width:560px;max-height:85vh;overflow-y:auto">
      <h3 style="margin:0 0 12px;font-size:14px">Automation Log <span style="font-size:11px;color:var(--txd)">(${res.total} entries)</span></h3>`;
    if(!res.logs.length)html+=`<div style="font-size:12px;color:var(--txd);padding:20px;text-align:center">No automation executions yet</div>`;
    res.logs.forEach(l=>{
      const status=l.status==='success'?'✓':'✗';
      const color=l.status==='success'?'var(--green,#4caf50)':'var(--red,#f44336)';
      html+=`<div style="display:flex;gap:8px;align-items:flex-start;padding:6px 0;border-bottom:1px solid var(--brd);font-size:11px">
        <span style="color:${color};font-weight:bold;min-width:14px">${status}</span>
        <div style="flex:1;min-width:0">
          <div class="rule-name" style="font-weight:500">${esc(l.rule_name||'Rule #'+l.rule_id)}</div>
          <div style="color:var(--txd)">${esc(l.trigger_type)} → ${esc(l.action_type)}${l.error?` — <span style="color:var(--red,#f44336)">${esc(l.error)}</span>`:''}</div>
        </div>
        <span style="color:var(--txd);white-space:nowrap;font-size:10px">${fmtDue(l.created_at?.slice(0,10)||'')}</span>
      </div>`;
    });
    // Pagination
    html+=`<div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px">
      <div style="display:flex;gap:6px">`;
    if(offset>0)html+=`<button class="btn-s" id="log-prev">← Prev</button>`;
    if(offset+limit<res.total)html+=`<button class="btn-s" id="log-next">Next →</button>`;
    html+=`</div><button id="log-close" style="padding:6px 14px;background:none;border:1px solid var(--brd);border-radius:var(--rs);cursor:pointer;color:var(--tx)">Close</button></div></div>`;
    m.innerHTML=html;
    document.getElementById('log-close')?.addEventListener('click',_close);
    document.getElementById('log-prev')?.addEventListener('click',()=>{offset=Math.max(0,offset-limit);loadPage();});
    document.getElementById('log-next')?.addEventListener('click',()=>{offset+=limit;loadPage();});
    m.addEventListener('click',e=>{if(e.target===m)_close()});
  }
  document.body.appendChild(m);
  await loadPage();
}

// ─── GLOBAL UNDO SYSTEM ───
const undoStack=[];
function pushUndo(label,undoFn){
  undoStack.push({label,fn:undoFn,ts:Date.now()});
  if(undoStack.length>20)undoStack.shift();
  showUndoToast(label);
}
function showUndoToast(label){
  document.querySelectorAll('.undo-toast').forEach(t=>t.remove());
  const t=document.createElement('div');t.className='undo-toast';
  t.innerHTML=`<span>${esc(label)}</span><button>Undo</button>`;
  document.body.appendChild(t);
  const btn=t.querySelector('button');
  btn.addEventListener('click',async()=>{
    const action=undoStack.pop();
    if(action&&action.fn){await action.fn();await loadAreas();render();loadOverdueBadge()}
    t.remove();
  });
  setTimeout(()=>t.remove(),5000);
}

// ─── REPORTS VIEW (Phase D — consolidates analytics/review views) ───
let reportsTab='overview';

async function renderHabitAnalytics(){
  const c=$('ct');
  const data=await api.get('/api/stats/habits');
  const overall=data.overall||{};
  const habits=data.habits||[];
  let h=`<div class="habit-analytics-shell"><div class="habit-analytics-summary">`;
  const cards=[
    ['Active Habits',overall.totalHabits||0],
    ['30d Completion',String(overall.avgCompletion30||0)+'%'],
    ['90d Completion',String(overall.avgCompletion90||0)+'%'],
    ['Logs Recorded',overall.totalLogs||0]
  ];
  cards.forEach(([label,value])=>{h+=`<div class="habit-stat-card"><div class="habit-stat-label">${label}</div><div class="habit-stat-value">${value}</div></div>`});
  h+=`</div>`;
  if(data.bestDay||data.worstDay){h+=`<div class="habit-weekday-strip">${data.bestDay?`<span>Best day: <strong>${esc(data.bestDay.day)}</strong></span>`:''}${data.worstDay?`<span>Quietest day: <strong>${esc(data.worstDay.day)}</strong></span>`:''}</div>`}
  if(!habits.length){c.innerHTML=h+emptyS('repeat','No habit analytics yet','Create a habit and log progress to unlock the review dashboard')+'</div>';return}
  h+=`<div class="habit-analytics-list">`;
  habits.forEach(habit=>{
    const spark=(habit.sparkline_30||[]).map(entry=>`<span class="habit-spark-bar" style="height:${Math.max(6,Math.min(32,(entry.count||0)*8))}px;background:${escA(habit.color||'#2563EB')}"></span>`).join('');
    h+=`<article class="habit-analytics-card"><div class="habit-analytics-head"><div><div class="habit-analytics-name">${esc(habit.icon||'⭐')} ${esc(habit.name)}</div><div class="habit-analytics-sub">${habit.area_name?esc(habit.area_name)+' · ':''}${esc(habit.frequency||'daily')}</div></div><div class="habit-analytics-pill" style="color:${escA(habit.color||'#2563EB')};border-color:${escA(habit.color||'#2563EB')}40">${habit.streak}d streak</div></div><div class="habit-analytics-metrics"><span>30d ${habit.completion_rate_30}%</span><span>90d ${habit.completion_rate_90}%</span><span>Best ${habit.best_streak}d</span></div><div class="habit-sparkline">${spark}</div></article>`;
  });
  h+=`</div></div>`;
  c.innerHTML=h;
}
// ─── HELP & GUIDE VIEW ───
function renderHelp(){
  const c=$('ct');
  const features=[
    {icon:'wb_sunny',color:'#f59e0b',title:'Today View',desc:'See tasks due today and tasks you\'ve added to "My Day". Plan your daily priorities at a glance.',tip:'Press 1 to jump here'},
    {icon:'inbox',color:'#6366f1',title:'Inbox',desc:'Quick-capture tasks without organizing. Triage them later into life areas and goals.',tip:'A safe landing spot for new ideas'},
    {icon:'view_kanban',color:'#10b981',title:'Board View',desc:'Drag-and-drop Kanban board. Move tasks between Todo, In Progress, and Done columns.',tip:'Press 3 to open Board'},
    {icon:'calendar_month',color:'#3b82f6',title:'Calendar',desc:'Visualize tasks on a monthly calendar. Click any date to see what\'s due.',tip:'Press 4 to open Calendar'},
    {icon:'grid_view',color:'#ef4444',title:'Eisenhower Matrix',desc:'Prioritize using the Urgent/Important matrix. Four quadrants help you focus on what matters.',tip:'Press 7 to open Matrix'},
    {icon:'view_week',color:'#8b5cf6',title:'Weekly Plan',desc:'Plan your week ahead. Distribute tasks across days for balanced workloads.',tip:'Press 6 to open Weekly'},
    {icon:'dashboard',color:'#ec4899',title:'Dashboard',desc:'Overview of your productivity: completion rates, streaks, activity charts, and more.',tip:'Press 5 for Dashboard'},
    {icon:'repeat',color:'#14b8a6',title:'Habits',desc:'Track recurring habits with streaks and completion grids. Build consistency.',tip:'Find under Reports'},
    {icon:'timer',color:'#f97316',title:'Focus Timer',desc:'Built-in Pomodoro timer. Start a focus session on any task to track deep work time.',tip:'Click the timer icon on any task'},
    {icon:'description',color:'#06b6d4',title:'Notes',desc:'A personal notebook. Write thoughts, meeting notes, or ideas with Markdown support.',tip:'Accessible from sidebar'},
    {icon:'science',color:'#a855f7',title:'Templates',desc:'Save task structures as templates. Apply them to quickly create recurring projects.',tip:'Great for repeating workflows'},
    {icon:'auto_awesome',color:'#eab308',title:'Automations',desc:'Create rules that run automatically — like auto-assigning priorities or moving tasks.',tip:'Set it and forget it'}
  ];
  let h=`<div style="margin-bottom:20px;padding:20px;background:linear-gradient(135deg,var(--brand),var(--brand-h));border-radius:var(--r);color:white">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
      <span class="material-icons-round" style="font-size:32px">school</span>
      <div><h2 style="font-size:18px;font-weight:700;margin:0;color:white">Welcome to LifeFlow</h2>
      <p style="font-size:12px;opacity:.85;margin-top:2px">Your personal task manager — fast, local, and private</p></div>
    </div>
    <div class="help-actions" style="margin-top:12px">
      <button class="primary" data-action="start-tour"><span class="material-icons-round">explore</span>Take the Tour</button>
      <button style="background:rgba(255,255,255,.15);border-color:rgba(255,255,255,.3);color:white" data-action="show-shortcuts"><span class="material-icons-round">keyboard</span>Keyboard Shortcuts</button>
    </div>
  </div>`;

  // Getting Started
  h+=`<div class="help-section">
    <h2><span class="material-icons-round">rocket_launch</span>Getting Started</h2>
    <p class="help-desc">Follow these steps to organize your life in LifeFlow</p>
    <div class="help-getting-started">
      <div class="help-step"><div class="help-step-num">1</div><div class="help-step-body"><h4>Create Life Areas</h4><p>Organize by categories like Work, Health, or Personal. Click <strong>+</strong> next to "Life Areas" in the sidebar.</p></div></div>
      <div class="help-step"><div class="help-step-num">2</div><div class="help-step-body"><h4>Set Goals</h4><p>Within each area, create goals you want to achieve. Goals give your tasks purpose and direction.</p></div></div>
      <div class="help-step"><div class="help-step-num">3</div><div class="help-step-body"><h4>Add Tasks</h4><p>Press <strong>N</strong> from any view to quick-add a task, or use the + button. Set priorities, due dates, and tags.</p></div></div>
      <div class="help-step"><div class="help-step-num">4</div><div class="help-step-body"><h4>Plan Your Day</h4><p>Open the <strong>Today</strong> view each morning. Add tasks to "My Day" and use the Focus Timer for deep work sessions.</p></div></div>
      <div class="help-step"><div class="help-step-num">5</div><div class="help-step-body"><h4>Review & Reflect</h4><p>Use the <strong>Weekly Review</strong> and <strong>Dashboard</strong> to track your progress and adjust your approach.</p></div></div>
    </div>
  </div>`;

  // Features
  h+=`<div class="help-section">
    <h2><span class="material-icons-round">apps</span>Features</h2>
    <p class="help-desc">Everything LifeFlow offers to keep you productive</p>
    <div class="help-grid">`;
  features.forEach(f=>{
    h+=`<div class="help-card">
      <div class="hc-icon" style="background:${f.color}20;color:${f.color}"><span class="material-icons-round">${f.icon}</span></div>
      <h3>${f.title}</h3>
      <p>${f.desc}</p>
      <div class="hc-tip"><span class="material-icons-round">lightbulb</span>${f.tip}</div>
    </div>`;
  });
  h+=`</div></div>`;

  // Keyboard Shortcuts
  h+=`<div class="help-section">
    <h2><span class="material-icons-round">keyboard</span>Keyboard Shortcuts</h2>
    <p class="help-desc">Navigate like a pro — LifeFlow supports Vim-style keys too</p>
    <div class="help-shortcuts">`;
  const shortcuts=[
    ['Search / Command Palette','Ctrl+K'],['Quick add task','N'],['Today view','1'],['All Tasks','2'],
    ['Board','3'],['Calendar','4'],['Dashboard','5'],['Weekly Plan','6'],['Matrix','7'],['Activity Log','8'],
    ['Multi-select','M'],['Daily Review','R'],['Vim: Move down/up','J / K'],['Vim: Complete task','X'],
    ['Vim: Open task','Enter'],['Vim: First/Last','gg / G'],['Close overlay','Esc'],['This help','?']
  ];
  shortcuts.forEach(([label,key])=>{
    h+=`<div class="help-sc-row"><span>${label}</span><span class="help-key">${key}</span></div>`;
  });
  h+=`</div></div>`;

  // Tips & Tricks
  h+=`<div class="help-section">
    <h2><span class="material-icons-round">tips_and_updates</span>Tips & Tricks</h2>
    <p class="help-desc">Get more out of LifeFlow with these power-user tips</p>
    <div class="help-grid" style="grid-template-columns:repeat(auto-fill,minmax(250px,1fr))">
      <div class="help-card"><div class="hc-icon" style="background:#6366f120;color:#6366f1"><span class="material-icons-round">search</span></div><h3>Command Palette</h3><p>Press <strong>Ctrl+K</strong> then type <strong>&gt;</strong> to access commands like theme switching, export, and more.</p></div>
      <div class="help-card"><div class="hc-icon" style="background:#10b98120;color:#10b981"><span class="material-icons-round">drag_indicator</span></div><h3>Drag & Drop</h3><p>On the Board view, drag tasks between columns to change their status instantly.</p></div>
      <div class="help-card"><div class="hc-icon" style="background:#f59e0b20;color:#f59e0b"><span class="material-icons-round">checklist</span></div><h3>Multi-Select</h3><p>Press <strong>M</strong> to enter multi-select mode. Check multiple tasks, then bulk-complete or bulk-delete them.</p></div>
      <div class="help-card"><div class="hc-icon" style="background:#ef444420;color:#ef4444"><span class="material-icons-round">backup</span></div><h3>Backup & Export</h3><p>Go to <strong>Settings</strong> to export your data as JSON or create a backup. Everything stays on your machine.</p></div>
      <div class="help-card"><div class="hc-icon" style="background:#8b5cf620;color:#8b5cf6"><span class="material-icons-round">palette</span></div><h3>Themes</h3><p>Choose from 8 themes in Settings — from dark Midnight and Nord to the bright Light theme.</p></div>
      <div class="help-card"><div class="hc-icon" style="background:#ec489920;color:#ec4899"><span class="material-icons-round">notification_important</span></div><h3>Notifications</h3><p>Enable browser notifications to get reminders for overdue tasks and upcoming deadlines.</p></div>
    </div>
  </div>`;

  // Reset onboarding
  h+=`<div class="help-section" style="margin-top:32px;padding-top:20px;border-top:1px solid var(--brd)">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
      <div><h2 style="margin-bottom:2px"><span class="material-icons-round">restart_alt</span>Reset Onboarding</h2>
      <p class="help-desc" style="margin-bottom:0">Re-run the setup wizard and interactive tour as if you were a new user</p></div>
      <button class="btn-c" style="font-size:12px;padding:8px 16px;display:flex;align-items:center;gap:6px" data-action="reset-onboarding"><span class="material-icons-round" style="font-size:16px">refresh</span>Reset</button>
    </div>
  </div>`;

  c.innerHTML=h;wireActions(c);
}

async function renderReports(){
  const c=$('ct');
  const tabs=[
    {id:'overview',label:'Overview',icon:'dashboard'},
    {id:'activity',label:'Activity',icon:'history'},
    {id:'habits',label:'Habits',icon:'repeat'},
    {id:'focus',label:'Focus',icon:'timer'},
    {id:'analytics',label:'Analytics',icon:'analytics'},
    {id:'reviews',label:'Reviews',icon:'rate_review'},
    {id:'notes',label:'Notes',icon:'note'}
  ];
  let tabsHtml=`<div class="reports-tabs" style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:16px;border-bottom:1px solid var(--brd);padding-bottom:8px">`;
  tabs.forEach(t=>{
    const isActive=reportsTab===t.id;
    tabsHtml+=`<button class="btn-c reports-tab${isActive?' active':''}" data-rtab="${t.id}" style="font-size:12px;padding:6px 12px;border-radius:var(--rs);${isActive?'background:var(--brand);color:#fff;border-color:var(--brand)':''}"><span class="material-icons-round" style="font-size:14px;vertical-align:middle;margin-right:4px">${t.icon}</span>${t.label}</button>`;
  });
  tabsHtml+=`</div>`;
  // Render the sub-view directly into ct (each render function writes to $('ct'))
  const subRenders={overview:renderDashboard,activity:renderLogbook,habits:renderHabitAnalytics,focus:renderFocusHistory,analytics:renderTimeAnalytics,reviews:renderWeeklyReview,notes:renderNotes};
  const fn=subRenders[reportsTab]||renderDashboard;
  await fn();
  // Prepend tabs bar above the rendered content
  c.insertAdjacentHTML('afterbegin',tabsHtml);
  // Wire tab clicks
  c.querySelectorAll('.reports-tab').forEach(btn=>btn.addEventListener('click',()=>{
    reportsTab=btn.dataset.rtab;renderReports();
  }));
}

// ─── SMART LIST VIEW ───
async function renderSmartList(){
  const c=$('ct');
  const tasks=await api.get('/api/filters/smart/'+activeSmartFilter);
  const names={stale:'Stale Tasks',quickwins:'Quick Wins',blocked:'Blocked'};
  const descs={stale:'Tasks with no activity for 7+ days',quickwins:'Tasks ≤15 min, not blocked',blocked:'Tasks waiting on dependencies'};
  let h=`<div style="font-size:13px;color:var(--tx2);margin-bottom:14px">${descs[activeSmartFilter]||''} · ${tasks.length} task${tasks.length!==1?'s':''}</div>`;
  if(!tasks.length){h+=emptyS('filter_list','No tasks','Nothing matches this smart filter right now');c.innerHTML=h;return}
  tasks.forEach(t=>h+=tcHtml(t,true));
  c.innerHTML=h;attachTE();attachBD();
}

// ─── DAILY BRIEFING ───
async function showBriefing(){
  const suggest=await api.get('/api/planner/suggest');
  const c=$('ct');
  let h=`<div style="font-size:13px;color:var(--tx2);margin-bottom:14px">${new Date().toLocaleDateString('en-US',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</div>`;
  h+=`<div class="briefing-card"><h3><span class="material-icons-round" style="font-size:18px;color:var(--brand)">wb_sunny</span>Plan Your Day</h3>`;
  const sections=[
    {key:'overdue',label:'Overdue',icon:'warning',reason:'overdue',forced:true},
    {key:'dueToday',label:'Due Today',icon:'today',reason:'due today',forced:true},
    {key:'highPriority',label:'High Priority',icon:'flag',reason:'high priority'},
    {key:'upcoming',label:'Coming Up (3 days)',icon:'upcoming',reason:'due soon'}
  ];
  let anyItems=false;
  for(const sec of sections){
    const items=suggest[sec.key];
    if(!items||!items.length)continue;
    anyItems=true;
    h+=`<div class="briefing-sec"><h4><span class="material-icons-round" style="font-size:12px">${sec.icon}</span>${sec.label} (${items.length})</h4>`;
    items.forEach(t=>{
      h+=`<div class="briefing-item"><input type="checkbox" data-id="${t.id}" ${sec.forced?'checked disabled':'checked'}><span>${esc(t.title)}</span><span class="bi-reason">${sec.reason}</span></div>`;
    });
    h+=`</div>`;
  }
  if(!anyItems){
    h+=`<p style="color:var(--txd);font-size:13px;margin:8px 0">Nothing urgent! Pick tasks you want to focus on today.</p>`;
  }
  h+=`<div class="briefing-start"><button class="btn-s" id="briefing-go"><span class="material-icons-round" style="font-size:14px">play_arrow</span>Start My Day</button><span style="font-size:11px;color:var(--txd)">Selected tasks will be added to My Day</span></div></div>`;
  c.innerHTML=h;
  $('briefing-go').addEventListener('click',async()=>{
    const checked=[...c.querySelectorAll('.briefing-item input[type=checkbox]:checked')].map(cb=>Number(cb.dataset.id)).filter(Boolean);
    if(checked.length){
      await api.post('/api/tasks/bulk-myday',{ids:checked});
      showToast(checked.length+' tasks added to My Day');
    }
    await loadAreas();render();loadOverdueBadge();
  });
}

// ─── CHANGELOG VIEW ───
function renderChangelog(){
  const c=$('ct');
  const versions=[
    {v:'0.1.0',date:'2025-07-18',theme:'Hello World',items:['Landing page with feature showcase','User-facing changelog (this view)','PWA manifest polish + meta tags','Bug bash: full regression pass','Performance audit']},
    {v:'0.0.18',date:'2025-07-18',theme:'Advanced Power',items:['Custom recurring patterns (JSON config: specific-days, endDate, endAfter)','Keyboard shortcut rebinding in Settings → Shortcuts','Shareable weekly summary card (canvas → PNG)','Shareable focus card (canvas → PNG)','Achievement badges gallery in Settings → Badges']},
    {v:'0.0.17',date:'2025-07-18',theme:'Everyone Welcome',items:['Mobile bottom tab bar (5 tabs)','Skip-to-content link for screen readers','ARIA labels on all icon-only buttons','Focus trapping in modals','prefers-reduced-motion support','Demo mode with sample data']},
    {v:'0.0.16',date:'2025-07-17',theme:'Make It Yours',items:['Enhanced recurring engine (biweekly, weekdays, JSON patterns)','Save-as-template from goals and lists','Achievement badges system (6 badge types)','Demo mode (start + reset)','Default view per life area','Onboarding settings and user persona']},
    {v:'0.0.15',date:'2025-07-17',theme:'Find Everything',items:['Universal search with Ctrl+K command palette','Quick capture overlay (N key)','Saved filters and smart lists','Tag management','Template CRUD + apply','Automation rules engine']},
    {v:'0.0.14',date:'2025-07-17',theme:'Feel the Progress',items:['Dashboard with charts (completion, streaks, areas)','Weekly review flow','Activity log / logbook','Focus session history','Time analytics','Reports view']}
  ];
  let h=`<div style="max-width:640px;margin:0 auto">`;
  h+=`<p style="font-size:13px;color:var(--tx-s);margin-bottom:24px">What's new in LifeFlow — version history and highlights.</p>`;
  versions.forEach(ver=>{
    h+=`<div style="margin-bottom:28px;padding:20px;background:var(--bg-s);border:1px solid var(--brd);border-radius:var(--r)">`;
    h+=`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <span style="font-weight:700;font-size:16px">v${esc(ver.v)} — ${esc(ver.theme)}</span>
      <span style="font-size:11px;color:var(--tx-s)">${esc(ver.date)}</span></div>`;
    h+=`<ul style="margin:0;padding-left:20px;font-size:13px;color:var(--tx-s);line-height:1.8">`;
    ver.items.forEach(item=>{h+=`<li>${esc(item)}</li>`});
    h+=`</ul></div>`;
  });
  h+=`</div>`;
  c.innerHTML=h;
}

// ─── ENHANCED MULTI-SELECT BAR ───
function updateMultiSelectBar(){
  if(selectedIds.size===0){hideMultiSelectBar();return}
  let bar=document.getElementById('ms-bar');
  if(!bar){
    bar=document.createElement('div');bar.className='ms-bar';bar.id='ms-bar';
    bar.innerHTML=`<span class="ms-cnt"></span>
      <button id="ms-done"><span class="material-icons-round" style="font-size:15px">check_circle</span>Complete</button>
      <button id="ms-pri"><span class="material-icons-round" style="font-size:15px">flag</span>Priority</button>
      <button id="ms-due"><span class="material-icons-round" style="font-size:15px">event</span>Due Date</button>
      <button id="ms-myday"><span class="material-icons-round" style="font-size:15px">wb_sunny</span>My Day</button>
      <button id="ms-move"><span class="material-icons-round" style="font-size:15px">drive_file_move</span>Move</button>
      <button id="ms-tag"><span class="material-icons-round" style="font-size:15px">label</span>Tag</button>
      <button class="ms-del" id="ms-del"><span class="material-icons-round" style="font-size:15px">delete_outline</span>Delete</button>
      <button id="ms-clear"><span class="material-icons-round" style="font-size:15px">close</span>Clear</button>`;
    document.body.appendChild(bar);
    document.getElementById('ms-done').addEventListener('click',async()=>{
      await api.put('/api/tasks/bulk',{ids:[...selectedIds],changes:{status:'done'}});
      showToast(selectedIds.size+' tasks completed');selectedIds.clear();hideMultiSelectBar();await loadAreas();render();loadOverdueBadge();
    });
    document.getElementById('ms-del').addEventListener('click',async()=>{
      if(!confirm('Delete '+selectedIds.size+' tasks?'))return;
      for(const id of selectedIds)await api.del('/api/tasks/'+id);
      showToast(selectedIds.size+' tasks deleted');selectedIds.clear();hideMultiSelectBar();await loadAreas();render();loadOverdueBadge();
    });
    document.getElementById('ms-pri').addEventListener('click',async()=>{
      const p=prompt('Set priority (0=None, 1=Normal, 2=High, 3=Critical):','2');
      if(p===null)return;const pn=Number(p);if(![0,1,2,3].includes(pn))return;
      await api.put('/api/tasks/bulk',{ids:[...selectedIds],changes:{priority:pn}});
      showToast(selectedIds.size+' tasks updated');selectedIds.clear();hideMultiSelectBar();await loadAreas();render();
    });
    document.getElementById('ms-due').addEventListener('click',async()=>{
      const d=prompt('Set due date (YYYY-MM-DD or "today"/"tomorrow"/"none"):','today');
      if(d===null)return;
      let date=d;
      if(d==='today')date=_toDateStr(new Date());
      else if(d==='tomorrow'){const t=new Date();t.setDate(t.getDate()+1);date=_toDateStr(t)}
      else if(d==='none')date=null;
      await api.put('/api/tasks/bulk',{ids:[...selectedIds],changes:{due_date:date}});
      showToast(selectedIds.size+' tasks rescheduled');selectedIds.clear();hideMultiSelectBar();await loadAreas();render();loadOverdueBadge();
    });
    document.getElementById('ms-myday').addEventListener('click',async()=>{
      await api.post('/api/tasks/bulk-myday',{ids:[...selectedIds]});
      showToast(selectedIds.size+' added to My Day');selectedIds.clear();hideMultiSelectBar();await loadAreas();render();
    });
    document.getElementById('ms-move').addEventListener('click',async()=>{
      // Show goal picker dropdown
      const allGoals=await api.get('/api/goals');
      let dd=bar.querySelector('.ms-move-dd');if(dd)dd.remove();
      dd=document.createElement('div');dd.className='ms-move-dd';
      dd.innerHTML=allGoals.map(g=>`<div class="ms-mv-item" data-gid="${g.id}"><span style="color:${escA(g.color||'var(--brand)')}">●</span>${esc(g.title)}</div>`).join('');
      bar.appendChild(dd);
      dd.querySelectorAll('.ms-mv-item').forEach(it=>it.addEventListener('click',async()=>{
        await api.put('/api/tasks/bulk',{ids:[...selectedIds],changes:{goal_id:Number(it.dataset.gid)}});
        showToast(selectedIds.size+' tasks moved');selectedIds.clear();hideMultiSelectBar();dd.remove();await loadAreas();render();
      }));
      setTimeout(()=>document.addEventListener('click',function closer(ev){if(!dd.contains(ev.target)){dd.remove();document.removeEventListener('click',closer)}},{once:false}),10);
    });
    document.getElementById('ms-tag').addEventListener('click',async()=>{
      if(!allTags.length){showToast('No tags yet');return}
      const tagList=allTags.map(t=>t.name).join(', ');
      const name=prompt('Tag name to add ('+tagList+'):');
      if(!name)return;
      const tag=allTags.find(t=>t.name.toLowerCase()===name.trim().toLowerCase());
      if(!tag){showToast('Tag not found');return}
      await api.put('/api/tasks/bulk',{ids:[...selectedIds],changes:{add_tag_id:tag.id}});
      showToast(selectedIds.size+' tasks tagged');selectedIds.clear();hideMultiSelectBar();await loadAreas();render();
    });
    document.getElementById('ms-clear').addEventListener('click',()=>{selectedIds.clear();document.querySelectorAll('.tc.selected').forEach(c=>c.classList.remove('selected'));hideMultiSelectBar()});
  }
  bar.querySelector('.ms-cnt').textContent=selectedIds.size+' selected';
  bar.style.display='flex';
}

// ─── KEYBOARD SHORTCUTS ───
$('kb-btn')?.addEventListener('click',()=>$('kb-ov').classList.add('active'));
$('kb-ov').addEventListener('click',e=>{if(e.target===$('kb-ov'))$('kb-ov').classList.remove('active')});
document.addEventListener('keydown',e=>{
  // Skip if typing in input/textarea/select or contenteditable
  const tag=e.target.tagName;const ce=e.target.isContentEditable;
  if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||ce)return;
  if(_matchShortcut('search',e)){e.preventDefault();openSearch();return}
  if(e.key==='Escape'){
    if($('ft-ov').classList.contains('active')){
      if($('ft-reflect').style.display!=='none'){$('ft-reflect-done').click();return}
      if($('ft-timer').style.display!=='none'){$('ft-stop').click();return}
      $('ft-plan-cancel').click();return
    }
    if($('dr-ov').classList.contains('active')){closeDR();return}
    if($('sr-ov').classList.contains('active')){closeSearch();return}
    if($('qc-ov').classList.contains('active')){closeQC();return}
    if($('kb-ov').classList.contains('active')){$('kb-ov').classList.remove('active');return}
    if($('tmpl-apply-ov').classList.contains('active')){$('tmpl-apply-ov').classList.remove('active');return}
    if($('tour-ov').classList.contains('active')){$('tour-ov').classList.remove('active');return}
    if($('onb-ov').classList.contains('active')){$('onb-ov').classList.remove('active');return}
    // Close dynamic triage/rule modals
    const tm=document.querySelector('.triage-modal');
    if(tm){if(tm._removeTrap)tm._removeTrap();tm.remove();_popFocus();_unlockBody();return}
    // Close area/goal/list modals
    if($('am').classList.contains('active')){$('am').classList.remove('active');return}
    if($('gm').classList.contains('active')){$('gm').classList.remove('active');return}
    if($('lm').classList.contains('active')){$('lm').classList.remove('active');return}
    if($('dp').classList.contains('open')){$('dp').classList.remove('open');return}
    return;
  }
  // Don't trigger shortcuts when overlays are open
  if($('sr-ov').classList.contains('active')||$('qc-ov').classList.contains('active')||$('kb-ov').classList.contains('active')||$('dr-ov').classList.contains('active'))return;
  if(_matchShortcut('quick-add',e)){openQuickCapture();return}
  if(_matchShortcut('help',e)){$('kb-ov').classList.add('active');return}
  if(_matchShortcut('today',e)){go('myday');return}
  if(_matchShortcut('all-tasks',e)){go('all');return}
  if(_matchShortcut('board',e)){go('board');return}
  if(_matchShortcut('calendar',e)){go('calendar');return}
  if(_matchShortcut('dashboard',e)){go('dashboard');return}
  if(_matchShortcut('weekly',e)){go('weekly');return}
  if(_matchShortcut('matrix',e)){go('matrix');return}
  if(_matchShortcut('logbook',e)){go('logbook');return}
  if(e.key==='b'&&!e.ctrlKey&&!e.metaKey&&!e.altKey){$('bell-dd').classList.toggle('open');loadBellReminders();return}
  if(_matchShortcut('tags-view',e)){go('tags');return}
  if(_matchShortcut('focus-history',e)){go('focushistory');return}
  if(_matchShortcut('multi-select',e)){toggleMultiSelect();return}
  if(_matchShortcut('daily-review',e)){openDailyReview();return}
  // Vim navigation
  if(_matchShortcut('vim-down',e)){e.preventDefault();vimMove(1);return}
  if(_matchShortcut('vim-up',e)&&!e.ctrlKey&&!e.metaKey){e.preventDefault();vimMove(-1);return}
  if(e.key==='G'&&e.shiftKey){const cards=getVisibleCards();if(cards.length){vimIdx=cards.length-1;vimHighlight(vimIdx)}return}
  if(e.key==='g'){
    if(!window._vimG){window._vimG=true;setTimeout(()=>{window._vimG=false},400);return}
    window._vimG=false;vimIdx=0;vimHighlight(0);return;
  }
  if(_matchShortcut('vim-complete',e)){
    const cards=getVisibleCards();
    if(vimIdx>=0&&vimIdx<cards.length){
      const tk=cards[vimIdx].querySelector('.tk');
      if(tk)tk.click();
    }
    return;
  }
  if(_matchShortcut('vim-open',e)){
    const cards=getVisibleCards();
    if(vimIdx>=0&&vimIdx<cards.length){
      const id=Number(cards[vimIdx].dataset.id);
      if(id)openDP(id);
    }
    return;
  }
  if(e.key==='f'||e.key==='F'){
    if(currentView==='myday'){todayTab=todayTab==='focus'?'list':'focus';localStorage.setItem('todayTab',todayTab);renderToday()}
    return;
  }
});
// Also handle Ctrl+K when in inputs
document.addEventListener('keydown',e=>{if(e.key==='k'&&(e.ctrlKey||e.metaKey)){e.preventDefault();openSearch()}});

function go(view){currentView=view;activeAreaId=null;activeGoalId=null;vimIdx=-1;
  document.querySelectorAll('.ni,.ai').forEach(n=>n.classList.remove('active'));
  document.querySelector(`.ni[data-view="${view}"]`)?.classList.add('active');
  // Update mobile bottom bar
  document.querySelectorAll('.mb-tab').forEach(t=>t.classList.toggle('active',t.dataset.view===view));
  render();
}

// ─── MOBILE BOTTOM BAR ───
document.querySelectorAll('.mb-tab').forEach(tab=>{
  tab.addEventListener('click',()=>go(tab.dataset.view));
});

// ─── FOCUS TRAP UTILITY FOR MODALS ───
function trapFocus(container){
  const focusable=container.querySelectorAll('button,input,select,textarea,[tabindex]:not([tabindex="-1"])');
  if(!focusable.length)return;
  const first=focusable[0],last=focusable[focusable.length-1];
  function handler(e){
    if(e.key!=='Tab')return;
    if(e.shiftKey){if(document.activeElement===first){e.preventDefault();last.focus()}}
    else{if(document.activeElement===last){e.preventDefault();first.focus()}}
  }
  container.addEventListener('keydown',handler);
  first.focus();
  return ()=>container.removeEventListener('keydown',handler);
}

// Auto-trap focus in open modals + scroll-lock + focus save/restore
const modalObserver=new MutationObserver(()=>{
  ['am','gm','lm','sr-ov','qc-ov','kb-ov','ft-ov','tour-ov','onb-ov','tmpl-apply-ov','dr-ov'].forEach(id=>{
    const el=document.getElementById(id);
    if(el&&el.classList.contains('active')&&!el._focusTrapped){
      _pushFocus();_lockBody();
      el._focusTrapped=true;
      el._removeTrap=trapFocus(el);
    }else if(el&&!el.classList.contains('active')&&el._focusTrapped){
      if(el._removeTrap)el._removeTrap();
      el._focusTrapped=false;
      _popFocus();_unlockBody();
    }
  });
  // Also trap focus on dynamic triage modals
  document.querySelectorAll('.triage-modal').forEach(tm=>{
    if(!tm._focusTrapped){
      _pushFocus();_lockBody();
      tm._focusTrapped=true;
      tm._removeTrap=trapFocus(tm);
    }
  });
});
modalObserver.observe(document.body,{subtree:true,attributes:true,attributeFilter:['class']});

// ─── SHAREABLE SUMMARY CARD (canvas → PNG) ───
function generateShareCard(title, lines, accentColor){
  const canvas=document.createElement('canvas');
  canvas.width=600;canvas.height=400;
  const ctx=canvas.getContext('2d');
  // Background
  ctx.fillStyle='#1E293B';ctx.fillRect(0,0,600,400);
  // Accent bar
  ctx.fillStyle=accentColor||'#2563EB';ctx.fillRect(0,0,600,6);
  // Title
  ctx.fillStyle='#F1F5F9';ctx.font='bold 22px Inter,sans-serif';ctx.fillText(title,32,50);
  // Lines
  ctx.font='14px Inter,sans-serif';ctx.fillStyle='#94A3B8';
  lines.forEach((line,i)=>{ctx.fillText(line,32,90+i*28)});
  // Branding
  ctx.fillStyle='#64748B';ctx.font='11px Inter,sans-serif';ctx.fillText('Generated by LifeFlow',32,380);
  return canvas;
}

async function shareWeeklySummary(){
  try{
    const stats=await api.get('/api/stats');
    const lines=[
      `Tasks completed this week: ${stats.completed_this_week||0}`,
      `Tasks created: ${stats.created_this_week||0}`,
      `Streak: ${stats.streak_days||0} days`,
      `Focus sessions: ${stats.focus_sessions_week||0}`,
      `Total focus time: ${Math.round((stats.focus_minutes_week||0))}min`
    ];
    const canvas=generateShareCard('Weekly Summary — '+new Date().toLocaleDateString(),lines,'#22C55E');
    canvas.toBlob(blob=>{
      if(navigator.share&&navigator.canShare){
        const file=new File([blob],'lifeflow-weekly.png',{type:'image/png'});
        navigator.share({title:'LifeFlow Weekly Summary',files:[file]}).catch(()=>{});
      }else{
        const url=URL.createObjectURL(blob);
        const a=document.createElement('a');a.href=url;a.download='lifeflow-weekly-'+_toDateStr(new Date())+'.png';a.click();
        URL.revokeObjectURL(url);showToast('Summary card downloaded!');
      }
    },'image/png');
  }catch(e){showToast('Failed to generate summary')}
}

function shareFocusCard(taskTitle, minutes){
  const lines=[
    `Focused for ${minutes} minutes`,
    `on: ${taskTitle}`,
    new Date().toLocaleDateString('en-US',{weekday:'long',day:'numeric',month:'long',year:'numeric'})
  ];
  const canvas=generateShareCard('Focus Session Complete',lines,'#F59E0B');
  canvas.toBlob(blob=>{
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download='lifeflow-focus.png';a.click();
    URL.revokeObjectURL(url);showToast('Focus card downloaded!');
  },'image/png');
}
