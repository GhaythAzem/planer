// ============================================================
//  Verlobungs-Planer – App-Logik
//  Speichert wahlweise in Firebase Firestore (gemeinsamer,
//  synchronisierter Zugriff) oder als Fallback im localStorage.
// ============================================================

const LS_DATA_KEY = 'verlobungsplaner-data';
const LS_CODE_KEY = 'verlobungsplaner-code';

const emptyState = () => ({
  eventDate: '',
  todos: [],   // {id, text, done, category}
  guests: [],  // {id, name, persons, status: offen|zugesagt|abgesagt}
  budget: [],  // {id, category, planned, actual}
  dates: [],   // {id, title, date}
  notes: [],   // {id, title, text, updatedAt}
});

let state = emptyState();
let mode = 'local';          // 'local' | 'cloud'
let saveDoc = null;          // im Cloud-Modus: Funktion zum Speichern
let saveTimer = null;
let applyingRemote = false;

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
  $('todo-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = $('todo-input').value.trim();
    if (!text) return;
    update((s) => s.todos.push({ id: uid(), text, done: false, category: $('todo-category').value }));
    $('todo-input').value = '';
    $('todo-input').focus();
  });

  $('guest-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('guest-name').value.trim();
    if (!name) return;
    const persons = Math.max(1, parseInt($('guest-persons').value, 10) || 1);
    update((s) => s.guests.push({ id: uid(), name, persons, status: 'offen' }));
    $('guest-name').value = '';
    $('guest-persons').value = '1';
    $('guest-name').focus();
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
  renderGuests();
  renderBudget();
  renderDates();
  renderNotes();
  renderCountdown();
}

function renderTodos() {
  const list = $('todo-list');
  list.innerHTML = '';
  const todos = state.todos;
  $('todo-empty').classList.toggle('hidden', todos.length > 0);

  const done = todos.filter((t) => t.done).length;
  $('todo-progress').style.width = todos.length ? `${(done / todos.length) * 100}%` : '0';
  $('todo-progress-text').textContent = todos.length ? `${done} of ${todos.length} done` : 'No tasks yet';

  for (const t of todos) {
    const li = document.createElement('li');
    li.className = t.done ? 'done' : '';
    li.innerHTML = `
      <input type="checkbox" ${t.done ? 'checked' : ''} aria-label="done">
      <span class="item-text" dir="auto">${escapeHtml(t.text)}</span>
      ${t.category ? `<span class="chip">${escapeHtml(t.category)}</span>` : ''}
      <button class="btn-icon" title="Delete">🗑️</button>`;
    li.querySelector('input').addEventListener('change', () =>
      update((s) => { const x = s.todos.find((i) => i.id === t.id); if (x) x.done = !x.done; }));
    li.querySelector('.btn-icon').addEventListener('click', () =>
      update((s) => { s.todos = s.todos.filter((i) => i.id !== t.id); }));
    list.appendChild(li);
  }
}

const GUEST_STATUS = { offen: '❔ open', zugesagt: '✅ confirmed', abgesagt: '❌ declined' };
const GUEST_NEXT = { offen: 'zugesagt', zugesagt: 'abgesagt', abgesagt: 'offen' };

function renderGuests() {
  const list = $('guest-list');
  list.innerHTML = '';
  const guests = state.guests;
  $('guest-empty').classList.toggle('hidden', guests.length > 0);

  const invited = guests.reduce((n, g) => n + (Number(g.persons) || 1), 0);
  const confirmed = guests.filter((g) => g.status === 'zugesagt')
    .reduce((n, g) => n + (Number(g.persons) || 1), 0);
  $('guest-summary').innerHTML = `
    <div class="summary-card"><div class="num">${guests.length}</div><div class="lbl">Invitations</div></div>
    <div class="summary-card"><div class="num">${invited}</div><div class="lbl">Total people</div></div>
    <div class="summary-card"><div class="num">${confirmed}</div><div class="lbl">People confirmed</div></div>`;

  for (const g of guests) {
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="item-text" dir="auto">${escapeHtml(g.name)}</span>
      <span class="chip chip-gold">${Number(g.persons) || 1} ppl</span>
      <button class="status-btn ${g.status}" title="Change status">${GUEST_STATUS[g.status] || g.status}</button>
      <button class="btn-icon" title="Delete">🗑️</button>`;
    li.querySelector('.status-btn').addEventListener('click', () =>
      update((s) => { const x = s.guests.find((i) => i.id === g.id); if (x) x.status = GUEST_NEXT[x.status] || 'offen'; }));
    li.querySelector('.btn-icon').addEventListener('click', () =>
      update((s) => { s.guests = s.guests.filter((i) => i.id !== g.id); }));
    list.appendChild(li);
  }
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

function renderDates() {
  if (document.activeElement !== $('event-date')) $('event-date').value = state.eventDate || '';

  const list = $('date-list');
  list.innerHTML = '';
  const dates = [...state.dates].sort((a, b) => a.date.localeCompare(b.date));
  $('date-empty').classList.toggle('hidden', dates.length > 0);

  const today = new Date().toISOString().slice(0, 10);
  for (const d of dates) {
    const li = document.createElement('li');
    li.className = d.date < today ? 'date-past' : '';
    const nice = new Date(`${d.date}T00:00`).toLocaleDateString('en-GB', {
      weekday: 'short', day: '2-digit', month: 'long', year: 'numeric',
    });
    li.innerHTML = `
      <span class="date-when">📅 ${nice}</span>
      <span class="item-text" dir="auto">${escapeHtml(d.title)}</span>
      <button class="btn-icon" title="Delete">🗑️</button>`;
    li.querySelector('.btn-icon').addEventListener('click', () =>
      update((s) => { s.dates = s.dates.filter((i) => i.id !== d.id); }));
    list.appendChild(li);
  }
}

function renderNotes() {
  const grid = $('note-list');
  grid.innerHTML = '';
  $('note-empty').classList.toggle('hidden', state.notes.length > 0);

  for (const n of state.notes) {
    const card = document.createElement('div');
    card.className = 'note-card';
    card.innerHTML = `
      <h4 dir="auto">${escapeHtml(n.title)}</h4>
      <p dir="auto">${escapeHtml(n.text)}</p>
      <div class="note-actions"><button class="btn-icon" title="Delete">🗑️</button></div>`;
    card.querySelector('.btn-icon').addEventListener('click', () =>
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
