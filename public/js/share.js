const token = location.pathname.split('/').pop();
const esc = s => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };
const escA = s => String(s).replace(/[&"'<>]/g, m => ({ '&': '&amp;', '"': '&quot;', "'": '&#39;', '<': '&lt;', '>': '&gt;' })[m]);

async function load() {
  const app = document.getElementById('app');
  try {
    const r = await fetch('/api/shared/' + encodeURIComponent(token));
    if (!r.ok) throw new Error(r.status);
    const data = await r.json();
    renderList(data);
  } catch (e) {
    app.innerHTML = '<div class="err"><h2>List not found</h2><p>This shared link may have expired or been revoked.</p></div>';
  }
}

function renderList(data) {
  const app = document.getElementById('app');
  const list = data.list;
  const items = data.items || [];
  const isGrocery = list.type === 'grocery';
  const isNotes = list.type === 'notes';
  const typeLabel = isGrocery ? 'Grocery List' : isNotes ? 'Notes' : 'Checklist';

  let h = '<div class="head">';
  h += '<span class="icon">' + esc(list.icon || '📋') + '</span>';
  h += '<h1>' + esc(list.name) + '</h1>';
  h += '<div class="type">' + typeLabel + ' · ' + items.length + ' item' + (items.length !== 1 ? 's' : '') + '</div>';
  h += '</div>';

  if (!items.length) {
    h += '<div class="items"><div class="empty"><span class="material-icons-round">' + (isGrocery ? 'shopping_cart' : isNotes ? 'note' : 'checklist') + '</span><p>No items yet</p></div></div>';
  } else if (isGrocery) {
    const cats = {};
    items.forEach(i => { const c = i.category || 'Other'; if (!cats[c]) cats[c] = []; cats[c].push(i); });
    const order = ['Produce','Bakery','Dairy','Meat & Seafood','Frozen','Pantry','Beverages','Snacks','Household','Personal Care','Other'];
    h += '<div class="items">';
    order.forEach(cat => {
      if (!cats[cat]) return;
      h += '<div class="cat-hdr">' + esc(cat) + '</div>';
      cats[cat].forEach(i => {
        h += '<div class="item' + (i.checked ? ' checked' : '') + '" data-iid="' + i.id + '">';
        h += '<button class="chk' + (i.checked ? ' done' : '') + '" data-iid="' + i.id + '"><span class="material-icons-round">' + (i.checked ? 'check_box' : 'check_box_outline_blank') + '</span></button>';
        h += '<span class="title">' + esc(i.title) + '</span>';
        if (i.quantity) h += '<span class="qty">' + esc(i.quantity) + '</span>';
        h += '</div>';
      });
    });
    h += '</div>';
  } else if (isNotes) {
    h += '<div class="items">';
    items.forEach(i => {
      h += '<div class="item" style="flex-direction:column;align-items:stretch">';
      h += '<span class="title" style="font-weight:600">' + esc(i.title) + '</span>';
      if (i.note) h += '<div class="note-content">' + esc(i.note) + '</div>';
      h += '</div>';
    });
    h += '</div>';
  } else {
    h += '<div class="items">';
    items.forEach(i => {
      h += '<div class="item' + (i.checked ? ' checked' : '') + '" data-iid="' + i.id + '">';
      h += '<button class="chk' + (i.checked ? ' done' : '') + '" data-iid="' + i.id + '"><span class="material-icons-round">' + (i.checked ? 'check_box' : 'check_box_outline_blank') + '</span></button>';
      h += '<span class="title">' + esc(i.title) + '</span>';
      h += '</div>';
    });
    h += '</div>';
  }

  const checked = items.filter(i => i.checked).length;
  if (items.length && !isNotes) {
    h += '<div class="count">' + checked + '/' + items.length + ' done</div>';
  }

  // Add bar (not for notes type on shared)
  if (!isNotes) {
    h += '<div class="add-bar"><input type="text" id="add-inp" placeholder="Add item..."><button id="add-btn">Add</button></div>';
  }

  app.innerHTML = h;

  // Toggle checked
  if (!isNotes) {
    app.querySelectorAll('.chk').forEach(btn => btn.addEventListener('click', async () => {
      const iid = btn.dataset.iid;
      const item = items.find(x => x.id === Number(iid));
      if (!item) return;
      try {
        await fetch('/api/shared/' + encodeURIComponent(token) + '/items/' + iid, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ checked: item.checked ? 0 : 1 })
        });
        load();
      } catch (e) {}
    }));
  }

  // Add item
  const addBtn = document.getElementById('add-btn');
  const addInp = document.getElementById('add-inp');
  if (addBtn && addInp) {
    async function addItem() {
      const title = addInp.value.trim();
      if (!title) return;
      try {
        await fetch('/api/shared/' + encodeURIComponent(token) + '/items', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title })
        });
        addInp.value = '';
        load();
      } catch (e) {}
    }
    addBtn.addEventListener('click', addItem);
    addInp.addEventListener('keydown', e => { if (e.key === 'Enter') addItem(); });
  }
}

load();
