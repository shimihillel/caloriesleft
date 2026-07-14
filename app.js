const STORAGE_KEY = 'ma-achalti-v1';
const GOAL = 1100;

const $ = (id) => document.getElementById(id);
let state = loadState();
let editingId = null;

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function defaultState() {
  return { date: todayKey(), items: [], consumed: 0, updatedAt: null };
}

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!parsed || parsed.date !== todayKey()) return defaultState();
    return {
      date: parsed.date,
      items: Array.isArray(parsed.items) ? parsed.items : [],
      consumed: Number.isFinite(Number(parsed.consumed)) ? Number(parsed.consumed) : 0,
      updatedAt: parsed.updatedAt || null
    };
  } catch (_) {
    return defaultState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function setTheme() {
  const hour = new Date().getHours();
  document.body.classList.toggle('evening', hour >= 19 || hour < 6);
  const theme = document.body.classList.contains('evening') ? '#0b1030' : '#fff8e8';
  document.querySelector('meta[name="theme-color"]').setAttribute('content', theme);
}

function formatTime(value = new Date()) {
  return new Intl.DateTimeFormat('he-IL', {hour:'2-digit', minute:'2-digit', hour12:false}).format(value);
}

function formatDate() {
  return new Intl.DateTimeFormat('he-IL', {weekday:'long', day:'numeric', month:'numeric'}).format(new Date());
}

function pickEmoji(text) {
  const s = text.toLowerCase();
  if (s.includes('קפה')) return '🥤';
  if (s.includes('פריכ')) return '🍘';
  if (s.includes('קוטג') || s.includes('גבינה')) return '🥣';
  if (s.includes('משמש') || s.includes('אפרסק')) return '🍑';
  if (s.includes('טורט') || s.includes('פיתה') || s.includes('סנדו')) return '🌯';
  if (s.includes('סלט') || s.includes('ירק') || s.includes('שרי')) return '🥗';
  if (s.includes('שוקולד') || s.includes('חטיף') || s.includes('קורני')) return '🍫';
  if (s.includes('אבטיח')) return '🍉';
  if (s.includes('ביצה')) return '🍳';
  if (s.includes('יוגורט')) return '🥛';
  return ['🍓','🍋','🥨','🫐','🍪'][Math.abs(hashCode(text)) % 5];
}

function hashCode(str) {
  let h = 0;
  for (let i=0; i<str.length; i++) h = ((h<<5)-h)+str.charCodeAt(i) | 0;
  return h;
}

function render() {
  const remaining = GOAL - state.consumed;
  $('remainingNumber').textContent = remaining.toLocaleString('he-IL');
  $('consumedNumber').textContent = state.consumed.toLocaleString('he-IL');
  $('goalNumber').textContent = GOAL.toLocaleString('he-IL');

  const list = $('foodList');
  list.innerHTML = '';
  state.items.forEach(item => {
    const row = document.createElement('article');
    row.className = 'food-item';
    row.dataset.id = item.id;
    row.innerHTML = `
      <div class="food-emoji" aria-hidden="true">${pickEmoji(item.text)}</div>
      <div class="food-text"></div>
      <time class="food-time">${item.time}</time>
    `;
    row.querySelector('.food-text').textContent = item.text;
    row.addEventListener('click', () => openEdit(item.id));
    list.appendChild(row);
  });
  $('emptyState').hidden = state.items.length > 0;

  const segments = $('segments');
  segments.innerHTML = '';
  const fraction = Math.max(0, state.consumed / GOAL);
  const filled = Math.min(10, Math.ceil(fraction * 10));
  for (let i=0; i<10; i++) {
    const seg = document.createElement('span');
    seg.className = 'segment';
    if (i < filled) seg.classList.add(state.consumed > GOAL ? 'over' : 'filled');
    segments.appendChild(seg);
  }

  $('lastUpdate').textContent = state.updatedAt
    ? `עודכן לאחרונה ב־${state.updatedAt}`
    : 'עוד לא עודכן היום';

  if (state.consumed > GOAL) {
    $('remainingNumber').textContent = `−${Math.abs(remaining).toLocaleString('he-IL')}`;
  }
}

function addItems() {
  const raw = $('foodInput').value;
  const lines = raw.split(/\n+/).map(x => x.trim()).filter(Boolean);
  if (!lines.length) return toast('כתבי לפחות שורה אחת');
  const now = formatTime();
  lines.forEach((text, index) => {
    state.items.push({
      id: `${Date.now()}-${index}`,
      text,
      time: now
    });
  });
  $('foodInput').value = '';
  saveState();
  render();
  toast(lines.length === 1 ? 'נוסף ✨' : `נוספו ${lines.length} שורות ✨`);
}

async function copyDay() {
  if (!state.items.length) return toast('עוד אין מה להעתיק');
  const text = `${formatDate()}\n\n${state.items.map(x => x.text).join('\n')}`;
  try {
    await navigator.clipboard.writeText(text);
  } catch (_) {
    const temp = document.createElement('textarea');
    temp.value = text;
    document.body.appendChild(temp);
    temp.select();
    document.execCommand('copy');
    temp.remove();
  }
  toast('הועתק לגוגז 💜');
}

function openModal(id) {
  $(id).hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  $(id).hidden = true;
  document.body.style.overflow = '';
}

function openUpdate() {
  $('calorieInput').value = state.consumed || '';
  openModal('updateModal');
  setTimeout(() => $('calorieInput').focus(), 100);
}

function saveCalories() {
  const value = Number($('calorieInput').value);
  if (!Number.isFinite(value) || value < 0) return toast('צריך מספר תקין');
  state.consumed = Math.round(value);
  state.updatedAt = formatTime();
  saveState();
  render();
  closeModal('updateModal');
  toast('עודכן 💫');
}

function openEdit(id) {
  const item = state.items.find(x => x.id === id);
  if (!item) return;
  editingId = id;
  $('editInput').value = item.text;
  openModal('editModal');
  setTimeout(() => $('editInput').focus(), 100);
}

function saveEdit() {
  const text = $('editInput').value.trim();
  if (!text) return toast('השורה לא יכולה להיות ריקה');
  const item = state.items.find(x => x.id === editingId);
  if (!item) return;
  item.text = text;
  saveState();
  render();
  closeModal('editModal');
  toast('נשמר');
}

function deleteItem() {
  state.items = state.items.filter(x => x.id !== editingId);
  saveState();
  render();
  closeModal('editModal');
  toast('נמחק');
}

function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 1900);
}

$('addBtn').addEventListener('click', addItems);
$('copyBtn').addEventListener('click', copyDay);
$('updateBtn').addEventListener('click', openUpdate);
$('saveCaloriesBtn').addEventListener('click', saveCalories);
$('saveEditBtn').addEventListener('click', saveEdit);
$('deleteItemBtn').addEventListener('click', deleteItem);

document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.close));
});
document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) closeModal(backdrop.id);
  });
});

$('calorieInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') saveCalories();
});

setTheme();
render();
setInterval(setTheme, 60_000);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));
}
