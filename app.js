// ============================================================
//  Verlobungs-Planer – App-Logik
//  Speichert wahlweise in Firebase Firestore (gemeinsamer,
//  synchronisierter Zugriff) oder als Fallback im localStorage.
// ============================================================

const LS_DATA_KEY = 'verlobungsplaner-data';
const LS_CODE_KEY = 'verlobungsplaner-code';

const emptyState = () => ({
  eventDate: '',
  todos: [],   // {id, text, done, assignee, due}
  budget: [],  // {id, category, planned, actual}
  dates: [],   // {id, title, date}
  notes: [],   // {id, title, text, updatedAt}
});

let state = emptyState();
let mode = 'local';          // 'local' | 'cloud'
let saveDoc = null;          // im Cloud-Modus: Funktion zum Speichern
let saveTimer = null;
let applyingRemote = false;
let todoFilter = 'all';     // all | Ghayth | Nour | other – nur lokal, nicht synchronisiert
let editingNoteId = null;   // Notiz, die gerade bearbeitet wird

const $ = (id) => document.getElementById(id);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const euro = (n) => (Number(n) || 0).toLocaleString('en-IE', { style: 'currency', currency: 'EUR' });

function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

// ---------- Speichern ----------

function persist() {
  if (mode === 'cloud') {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveDoc && saveDoc(state), 350);
  } else {
    localStorage.setItem(LS_DATA_KEY, JSON.stringify(state));
  }
}

function update(mutator) {
  mutator(state);
  persist();
  renderAll();
}

// ---------- Initialisierung ----------

async function init() {
  const cfg = window.FIREBASE_CONFIG;
  if (cfg && cfg.apiKey && cfg.projectId) {
    try {
      await initCloud(cfg);
      return;
    } catch (err) {
      console.error('Firebase-Start fehlgeschlagen, nutze lokalen Modus:', err);
      $('sync-status').textContent = '⚠️ Firebase error – local mode';
    }
  }
  initLocal();
}

function initLocal() {
  mode = 'local';
  try {
    const saved = localStorage.getItem(LS_DATA_KEY);
    if (saved) state = { ...emptyState(), ...JSON.parse(saved) };
  } catch { /* beschädigte Daten ignorieren */ }
  $('local-banner').classList.remove('hidden');
  $('sync-status').textContent = '💾 Stored in this browser only';
  $('plan-code-label').textContent = 'local mode';
  startApp();
}

async function initCloud(cfg) {
  const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
  const { getAuth, signInAnonymously } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');
  const { getFirestore, doc, getDoc, setDoc, onSnapshot } =
    await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');

  const app = initializeApp(cfg);
  await signInAnonymously(getAuth(app));
  const db = getFirestore(app);

  // Gemeinsamen Plan-Code abfragen (einmal pro Gerät)
  let code = localStorage.getItem(LS_CODE_KEY);
  if (!code) {
    code = await askForCode();
    localStorage.setItem(LS_CODE_KEY, code);
  }

  const ref = doc(db, 'planners', code);
  const snap = await getDoc(ref);
  if (!snap.exists()) await setDoc(ref, emptyState());

  saveDoc = (data) => setDoc(ref, data).catch((err) => {
    console.error('Speichern fehlgeschlagen:', err);
    $('sync-status').textContent = '⚠️ Saving failed – check your connection';
  });

  onSnapshot(ref, (s) => {
    if (s.metadata.hasPendingWrites) return; // eigene, noch nicht bestätigte Änderung
    if (!s.exists()) return;
    applyingRemote = true;
    state = { ...emptyState(), ...s.data() };
    renderAll();
    applyingRemote = false;
    $('sync-status').textContent = '☁️ Synced – you both see the same data';
  });

  mode = 'cloud';
  $('sync-status').textContent = '☁️ Connected';
  $('plan-code-label').textContent = `Plan code: ${code}`;
  startApp();
}

function askForCode() {
  return new Promise((resolve) => {
    const screen = $('code-screen');
    screen.classList.remove('hidden');
    const submit = () => {
      const code = $('code-input').value.trim().toLowerCase().replace(/\s+/g, '-');
      if (!code) return;
      screen.classList.add('hidden');
      resolve(code);
    };
    $('code-join').addEventListener('click', submit);
    $('code-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    $('code-input').focus();
  });
}

function startApp() {
  $('app').classList.remove('hidden');
  bindTabs();
  bindForms();
  renderAll();
  setInterval(renderCountdown, 1000);
}

// ---------- Tabs ----------

function bindTabs() {
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.tab-panel').forEach((p) =>
        p.classList.toggle('active', p.id === `tab-${btn.dataset.tab}`));
    });
  });
}

// ---------- Formulare ----------

function bindForms() {
  // Bei „Other …“ ein Freitext-Feld für den Namen einblenden
  $('todo-assignee').addEventListener('change', () => {
    const other = $('todo-assignee').value === 'other';
    $('todo-assignee-name').classList.toggle('hidden', !other);
    if (other) $('todo-assignee-name').focus();
  });

  $('todo-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = $('todo-input').value.trim();
    if (!text) return;
    let assignee = $('todo-assignee').value;
    if (assignee === 'other') assignee = $('todo-assignee-name').value.trim();
    update((s) => s.todos.push({ id: uid(), text, done: false, assignee, due: $('todo-due').value }));
    $('todo-input').value = '';
    $('todo-due').value = '';
    $('todo-input').focus();
  });

  document.querySelectorAll('#todo-filter .filter-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      todoFilter = chip.dataset.filter;
      document.querySelectorAll('#todo-filter .filter-chip').forEach((c) =>
        c.classList.toggle('active', c === chip));
      renderTodos();
    });
  });

  $('budget-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const category = $('budget-category').value.trim();
    if (!category) return;
    update((s) => s.budget.push({
      id: uid(),
      category,
      planned: Number($('budget-planned').value) || 0,
      actual: Number($('budget-actual').value) || 0,
    }));
    $('budget-form').reset();
    $('budget-category').focus();
  });

  $('date-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const title = $('date-title').value.trim();
    const date = $('date-when').value;
    if (!title || !date) return;
    update((s) => s.dates.push({ id: uid(), title, date }));
    $('date-form').reset();
    $('date-title').focus();
  });

  $('note-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const title = $('note-title').value.trim();
    if (!title) return;
    update((s) => s.notes.unshift({
      id: uid(), title, text: $('note-text').value.trim(), updatedAt: new Date().toISOString(),
    }));
    $('note-form').reset();
    $('note-title').focus();
  });

  $('event-date').addEventListener('change', () => {
    update((s) => { s.eventDate = $('event-date').value; });
  });
}

// ---------- Rendern ----------

function renderAll() {
  renderTodos();
  renderBudget();
  renderTimeline();
  renderNotes();
  renderCountdown();
}

function renderTodos() {
  const list = $('todo-list');
  list.innerHTML = '';
  const todos = state.todos;

  const done = todos.filter((t) => t.done).length;
  $('todo-progress').style.width = todos.length ? `${(done / todos.length) * 100}%` : '0';
  $('todo-progress-text').textContent = todos.length ? `${done} of ${todos.length} done` : 'No tasks yet';

  const today = new Date().toISOString().slice(0, 10);
  const visible = todos.filter((t) => {
    if (todoFilter === 'all') return true;
    if (todoFilter === 'other') return t.assignee !== 'Ghayth' && t.assignee !== 'Nour';
    return t.assignee === todoFilter;
  });

  for (const t of visible) {
    const overdue = !t.done && t.due && t.due < today;
    const li = document.createElement('li');
    li.className = (t.done ? 'done' : '') + (overdue ? ' overdue' : '');
    const chipClass = t.assignee === 'Ghayth' ? 'chip chip-gold' : t.assignee === 'Nour' ? 'chip' : 'chip chip-neutral';
    li.innerHTML = `
      <input type="checkbox" ${t.done ? 'checked' : ''} aria-label="done">
      <span class="item-text" dir="auto">${escapeHtml(t.text)}</span>
      ${t.due ? `<span class="due-label${overdue ? ' due-overdue' : ''}">${overdue ? '⚠️ ' : '📅 '}${shortDate(t.due)}</span>` : ''}
      ${t.assignee ? `<span class="${chipClass}" dir="auto">${escapeHtml(t.assignee)}</span>` : ''}
      <button class="btn-icon" title="Delete">🗑️</button>`;
    li.querySelector('input').addEventListener('change', () =>
      update((s) => { const x = s.todos.find((i) => i.id === t.id); if (x) x.done = !x.done; }));
    li.querySelector('.btn-icon').addEventListener('click', () =>
      update((s) => { s.todos = s.todos.filter((i) => i.id !== t.id); }));
    list.appendChild(li);
  }

  $('todo-empty').textContent = todos.length
    ? 'Nothing here for this filter.'
    : 'No tasks yet – add your first one! 🌸';
  $('todo-empty').classList.toggle('hidden', visible.length > 0);
}

function shortDate(iso) {
  return new Date(`${iso}T00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function renderBudget() {
  const body = $('budget-body');
  body.innerHTML = '';
  const items = state.budget;
  $('budget-table').classList.toggle('hidden', items.length === 0);
  $('budget-empty').classList.toggle('hidden', items.length > 0);

  let totalPlanned = 0;
  let totalActual = 0;

  for (const b of items) {
    totalPlanned += Number(b.planned) || 0;
    totalActual += Number(b.actual) || 0;
    const diff = (Number(b.actual) || 0) - (Number(b.planned) || 0);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td dir="auto">${escapeHtml(b.category)}</td>
      <td><input type="number" min="0" step="0.01" value="${Number(b.planned) || 0}" data-field="planned"></td>
      <td><input type="number" min="0" step="0.01" value="${Number(b.actual) || 0}" data-field="actual"></td>
      <td class="${diff > 0 ? 'diff-over' : diff < 0 ? 'diff-under' : ''}">${diff > 0 ? '+' : ''}${euro(diff)}</td>
      <td><button class="btn-icon" title="Delete">🗑️</button></td>`;
    tr.querySelectorAll('input').forEach((inp) => {
      inp.addEventListener('change', () =>
        update((s) => {
          const x = s.budget.find((i) => i.id === b.id);
          if (x) x[inp.dataset.field] = Number(inp.value) || 0;
        }));
    });
    tr.querySelector('.btn-icon').addEventListener('click', () =>
      update((s) => { s.budget = s.budget.filter((i) => i.id !== b.id); }));
    body.appendChild(tr);
  }

  const totalDiff = totalActual - totalPlanned;
  $('budget-foot').innerHTML = items.length ? `
    <tr>
      <td>Total</td>
      <td>${euro(totalPlanned)}</td>
      <td>${euro(totalActual)}</td>
      <td class="${totalDiff > 0 ? 'diff-over' : totalDiff < 0 ? 'diff-under' : ''}">${totalDiff > 0 ? '+' : ''}${euro(totalDiff)}</td>
      <td></td>
    </tr>` : '';

  $('budget-summary').innerHTML = `
    <div class="summary-card"><div class="num">${euro(totalPlanned)}</div><div class="lbl">Planned</div></div>
    <div class="summary-card"><div class="num">${euro(totalActual)}</div><div class="lbl">Spent</div></div>
    <div class="summary-card ${totalDiff > 0 ? 'over' : 'under'}">
      <div class="num">${totalDiff > 0 ? '+' : ''}${euro(totalDiff)}</div>
      <div class="lbl">${totalDiff > 0 ? 'over budget' : 'under budget'}</div>
    </div>`;
}

function relativeDay(iso, today) {
  const days = Math.round((new Date(`${iso}T00:00`) - new Date(`${today}T00:00`)) / 86400000);
  if (days === 0) return 'today 💛';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

function renderTimeline() {
  if (document.activeElement !== $('event-date')) $('event-date').value = state.eventDate || '';

  const box = $('timeline');
  box.innerHTML = '';
  const today = new Date().toISOString().slice(0, 10);

  // Termine + Aufgaben mit Fälligkeit + Verlobungstag zu einer Zeitleiste mischen
  const entries = [
    ...state.dates.map((d) => ({ kind: 'event', id: d.id, date: d.date, title: d.title })),
    ...state.todos.filter((t) => t.due).map((t) => ({
      kind: 'task', id: t.id, date: t.due, title: t.text, done: t.done, assignee: t.assignee,
    })),
  ];
  if (state.eventDate) {
    entries.push({ kind: 'milestone', date: state.eventDate.slice(0, 10), title: 'Our engagement!' });
  }
  entries.sort((a, b) => a.date.localeCompare(b.date));
  $('date-empty').classList.toggle('hidden', entries.length > 0);

  for (const e of entries) {
    const past = e.date < today;
    const item = document.createElement('div');
    item.className = `tl-item tl-${e.kind}${past ? ' tl-past' : ''}${e.done ? ' tl-done' : ''}`;
    const nice = new Date(`${e.date}T00:00`).toLocaleDateString('en-GB', {
      weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
    });
    const marker = e.kind === 'milestone' ? '💍' : (past || e.done) ? '✓' : '';
    const overdueTask = e.kind === 'task' && past && !e.done;
    item.innerHTML = `
      <div class="tl-marker">${marker}</div>
      <div class="tl-content">
        <div class="tl-date">${nice} · <span class="tl-rel${overdueTask ? ' due-overdue' : ''}">${overdueTask ? '⚠️ overdue' : relativeDay(e.date, today)}</span></div>
        <div class="tl-title">
          <span class="item-text" dir="auto">${escapeHtml(e.title)}</span>
          ${e.kind === 'task' ? `<span class="chip chip-neutral">task${e.assignee ? ` · ${escapeHtml(e.assignee)}` : ''}</span>` : ''}
          ${e.kind === 'event' ? '<button class="btn-icon" title="Delete">🗑️</button>' : ''}
        </div>
      </div>`;
    if (e.kind === 'event') {
      item.querySelector('.btn-icon').addEventListener('click', () =>
        update((s) => { s.dates = s.dates.filter((i) => i.id !== e.id); }));
    }
    box.appendChild(item);
  }
}

function renderNotes() {
  const grid = $('note-list');
  grid.innerHTML = '';
  $('note-empty').classList.toggle('hidden', state.notes.length > 0);

  for (const n of state.notes) {
    const card = document.createElement('div');
    card.className = 'note-card';

    if (editingNoteId === n.id) {
      // Bearbeitungsmodus: Titel + Text direkt in der Karte ändern
      card.innerHTML = `
        <input type="text" class="note-edit-title" dir="auto" value="${escapeHtml(n.title)}">
        <textarea class="note-edit-text" dir="auto" rows="4">${escapeHtml(n.text)}</textarea>
        <div class="note-actions">
          <button class="btn btn-small btn-secondary" data-act="cancel">Cancel</button>
          <button class="btn btn-small btn-primary" data-act="save">Save</button>
        </div>`;
      card.querySelector('[data-act=save]').addEventListener('click', () => {
        const title = card.querySelector('.note-edit-title').value.trim();
        const text = card.querySelector('.note-edit-text').value.trim();
        if (!title) return;
        editingNoteId = null;
        update((s) => {
          const x = s.notes.find((i) => i.id === n.id);
          if (x) { x.title = title; x.text = text; x.updatedAt = new Date().toISOString(); }
        });
      });
      card.querySelector('[data-act=cancel]').addEventListener('click', () => {
        editingNoteId = null;
        renderNotes();
      });
      grid.appendChild(card);
      card.querySelector('.note-edit-title').focus();
      continue;
    }

    card.innerHTML = `
      <h4 dir="auto">${escapeHtml(n.title)}</h4>
      <p dir="auto">${escapeHtml(n.text)}</p>
      <div class="note-actions">
        <button class="btn-icon" data-act="edit" title="Edit">✏️</button>
        <button class="btn-icon" data-act="delete" title="Delete">🗑️</button>
      </div>`;
    card.querySelector('[data-act=edit]').addEventListener('click', () => {
      editingNoteId = n.id;
      renderNotes();
    });
    card.querySelector('[data-act=delete]').addEventListener('click', () =>
      update((s) => { s.notes = s.notes.filter((i) => i.id !== n.id); }));
    grid.appendChild(card);
  }
}

function renderCountdown() {
  const hint = $('countdown-hint');
  const done = $('countdown-done');
  const box = $('countdown');

  if (!state.eventDate) {
    box.classList.add('hidden');
    done.classList.add('hidden');
    hint.classList.remove('hidden');
    return;
  }

  const diff = new Date(state.eventDate).getTime() - Date.now();
  hint.classList.add('hidden');

  if (diff <= 0) {
    box.classList.add('hidden');
    done.classList.remove('hidden');
    return;
  }

  done.classList.add('hidden');
  box.classList.remove('hidden');
  $('cd-days').textContent = Math.floor(diff / 86400000);
  $('cd-hours').textContent = Math.floor(diff / 3600000) % 24;
  $('cd-mins').textContent = Math.floor(diff / 60000) % 60;
  $('cd-secs').textContent = Math.floor(diff / 1000) % 60;
}

init();
