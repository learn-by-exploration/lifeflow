// ─── LifeFlow Utility Functions ───
// Pure helper functions used across the entire frontend.

export const COLORS = ['#D50000','#E67C73','#F4511E','#F6BF26','#33B679','#0B8043','#039BE5','#3F51B5','#7986CB','#8E24AA','#616161','#795548'];

export const $ = id => document.getElementById(id);

export function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

export function escA(s) {
  return String(s).replace(/[&"'<>]/g, m => ({ '&': '&amp;', '"': '&quot;', "'": '&#39;', '<': '&lt;', '>': '&gt;' })[m]);
}

// Parse "YYYY-MM-DD" as local midnight (avoids timezone shift)
export function parseDate(d) {
  const [y, m, day] = d.split('-');
  return new Date(Number(y), Number(m) - 1, Number(day));
}

// Format a Date to "YYYY-MM-DD" in local timezone
export function toDateStr(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// Check if a date string is overdue
export function isOD(d) {
  if (!d) return false;
  const dt = parseDate(d), td = new Date();
  td.setHours(0, 0, 0, 0);
  return dt < td;
}

// Priority labels and colors
export const PL = ['', 'Normal', 'High', 'Critical'];
export const PC = ['', 'var(--brand)', 'var(--warn)', 'var(--err)'];

// Format due date with configurable format (accepts settings object)
export function fmtDue(d, settings = {}) {
  if (!d) return '';
  const dt = parseDate(d), td = new Date();
  td.setHours(0, 0, 0, 0);
  const df = Math.round((dt - td) / 864e5);
  const fmt = settings.dateFormat || 'relative';
  if (fmt === 'relative') {
    if (df === 0) return 'Today';
    if (df === 1) return 'Tomorrow';
    if (df === -1) return 'Yesterday';
    if (df === -2) return '2 days ago';
    if (df > 1 && df <= 6) return 'in ' + df + ' days';
    if (df < -1 && df >= -7) return Math.abs(df) + 'd overdue';
    if (df === 7) return 'Next week';
    const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    if (df > 1 && df <= 13) return 'Next ' + wd[dt.getDay()];
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  if (fmt === 'iso') return d;
  if (fmt === 'us') return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  if (fmt === 'eu') {
    const dd = String(dt.getDate()).padStart(2, '0'), mm = String(dt.getMonth() + 1).padStart(2, '0');
    return dd + '/' + mm + '/' + dt.getFullYear();
  }
  return d;
}

// Lightweight markdown to HTML renderer (call esc() on input first)
export function renderMd(text) {
  if (!text) return '';
  let s = esc(text);
  s = s.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  s = s.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  s = s.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
  s = s.replace(/`(.+?)`/g, '<code>$1</code>');
  s = s.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  s = s.replace(/^- (.+)$/gm, '<li>$1</li>');
  s = s.replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>');
  s = s.replace(/\n/g, '<br>');
  return s;
}

// Relative time formatter (e.g., "2 hours ago")
export function timeAgo(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const sec = Math.floor((now - d) / 1000);
  if (sec < 60) return 'just now';
  if (sec < 3600) return Math.floor(sec / 60) + 'm ago';
  if (sec < 86400) return Math.floor(sec / 3600) + 'h ago';
  if (sec < 604800) return Math.floor(sec / 86400) + 'd ago';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Form validation helper
export function validateField(inputId, rules) {
  const el = $(inputId);
  if (!el) return true;
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

export function clearFieldError(inputId) {
  const el = $(inputId);
  if (!el) return;
  el.classList.remove('inp-err');
  const errEl = document.getElementById(inputId + '-err');
  if (errEl) { errEl.textContent = ''; errEl.classList.remove('visible'); }
}
