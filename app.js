const STORAGE_KEY = 'ma-achalti-v1';
const SHORTCUTS_KEY = 'ma-achalti-shortcuts-v1';
const GOAL = 1100;

const $ = (id) => document.getElementById(id);
let state = loadState();
let editingId = null;

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function extractCalories(text) {
  const source = String(text || '');
  const explicit = source.match(/(\d+(?:[.,]\d+)?)\s*(?:קלוריות|קלוריה|קל׳|קק"ל)/u);
  if (explicit) return Math.round(Number(explicit[1].replace(',', '.')));
  const trailing = source.match(/(?:[-–—·,:]\s*|\s)(\d+(?:[.,]\d+)?)\s*$/u);
  if (trailing) return Math.round(Number(trailing[1].replace(',', '.')));
  return null;
}

function makeShortcut(text, existingCalories = null) {
  const fullText = String(text || '').trim();
  const calories = Number.isFinite(Number(existingCalories))
    ? Math.round(Number(existingCalories))
    : extractCalories(fullText);
  const label = fullText
    .replace(/\s*[-–—·,:]?\s*\d+(?:[.,]\d+)?\s*(?:קלוריות|קלוריה|קל׳|קק"ל)?\s*$/u, '')
    .replace(/\s+/g, ' ')
    .trim() || fullText;
  return { label, text: fullText, calories };
}

function normalizeShortcuts(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value
    .map(item => {
      if (typeof item === 'string') return makeShortcut(item);
      if (item && typeof item === 'object') {
        const text = String(item.text || '').trim();
        if (!text) return null;
        const shortcut = makeShortcut(text, item.calories);
        shortcut.label = String(item.label || shortcut.label).trim() || shortcut.label;
        return shortcut;
      }
      return null;
    })
    .filter(Boolean)
    .filter(item => {
      if (seen.has(item.text)) return false;
      seen.add(item.text);
      return true;
    })
    .slice(0, 6);
}

function loadShortcuts(legacyParsed = null) {
  try {
    const saved = JSON.parse(localStorage.getItem(SHORTCUTS_KEY));
    const normalized = normalizeShortcuts(saved);
    if (normalized.length) return normalized;
  } catch (_) {}

  const legacy = normalizeShortcuts(legacyParsed?.shortcuts);
  if (legacy.length) {
    localStorage.setItem(SHORTCUTS_KEY, JSON.stringify(legacy));
    return legacy;
  }

  const defaults = [makeShortcut('קפה קר'), makeShortcut('קפה חם')];
  localStorage.setItem(SHORTCUTS_KEY, JSON.stringify(defaults));
  return defaults;
}

function defaultState(shortcuts = loadShortcuts()) {
  return {
    date: todayKey(),
    items: [],
    consumed: 0,
    updatedAt: null,
    shortcuts
  };
}

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    const shortcuts = loadShortcuts(parsed);

    if (!parsed || parsed.date !== todayKey()) {
      return defaultState(shortcuts);
    }

    return {
      date: parsed.date,
      items: Array.isArray(parsed.items) ? parsed.items : [],
      consumed: Number.isFinite(Number(parsed.consumed)) ? Number(parsed.consumed) : 0,
      updatedAt: parsed.updatedAt || null,
      shortcuts
    };
  } catch (_) {
    return defaultState();
  }
}

function saveState() {
  const dailyState = {
    date: state.date,
    items: state.items,
    consumed: state.consumed,
    updatedAt: state.updatedAt
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(dailyState));
  localStorage.setItem(SHORTCUTS_KEY, JSON.stringify(state.shortcuts));
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

function pickDotClass(text) {
  const classes = ['dot-lavender','dot-orange','dot-blue','dot-green','dot-yellow','dot-pink'];
  return classes[Math.abs(hashCode(text)) % classes.length];
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
    const isShortcut = state.shortcuts.some(shortcut => shortcut.text === item.text);
    row.innerHTML = `
      <div class="food-dot-wrap" aria-hidden="true"><div class="food-dot ${pickDotClass(item.text)}"></div></div>
      <div class="food-text"></div>
      <div class="food-meta">
        <time class="food-time">${item.time}</time>
        <button class="star-btn ${isShortcut ? 'active' : ''}" type="button" aria-label="${isShortcut ? 'להסיר מהקיצורים' : 'להוסיף לקיצורים'}">${isShortcut ? '★' : '☆'}</button>
        <button class="repeat-btn" type="button" aria-label="להוסיף עוד אחד">+1</button>
      </div>
    `;
    row.querySelector('.food-text').textContent = item.text;
    row.querySelector('.star-btn').addEventListener('click', (event) => {
      event.stopPropagation();
      toggleShortcut(item.text);
    });
    row.querySelector('.repeat-btn').addEventListener('click', (event) => {
      event.stopPropagation();
      duplicateItem(item.id);
    });
    row.addEventListener('click', () => openEdit(item.id));
    list.appendChild(row);
  });
  $('emptyState').hidden = state.items.length > 0;
  renderShortcuts();

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

function renderShortcuts() {
  const list = $('shortcutsList');
  list.innerHTML = '';
  $('shortcutsCount').textContent = `${state.shortcuts.length}/6`;
  if (!state.shortcuts.length) {
    const empty = document.createElement('div');
    empty.className = 'shortcuts-empty';
    empty.textContent = 'לחצי על ☆ ליד פריט כדי להוסיף קיצור';
    list.appendChild(empty);
    return;
  }
  state.shortcuts.forEach(shortcut => {
    const chip = document.createElement('div');
    chip.className = 'shortcut-chip';
    const main = document.createElement('button');
    main.className = 'shortcut-main';
    main.type = 'button';
    main.textContent = shortcut.label;
    main.title = shortcut.calories !== null ? `${shortcut.text} — ${shortcut.calories} קלוריות` : shortcut.text;
    main.setAttribute('aria-label', shortcut.calories !== null ? `${shortcut.label}, ${shortcut.calories} קלוריות` : shortcut.label);
    main.addEventListener('click', () => addQuickItem(shortcut));
    const remove = document.createElement('button');
    remove.className = 'shortcut-remove';
    remove.type = 'button';
    remove.setAttribute('aria-label', `להסיר את ${shortcut.label} מהקיצורים`);
    remove.textContent = '×';
    remove.addEventListener('click', () => removeShortcut(shortcut.text));
    chip.append(main, remove);
    list.appendChild(chip);
  });
}

function toggleShortcut(text) {
  const existing = state.shortcuts.find(shortcut => shortcut.text === text);
  if (existing) {
    removeShortcut(text);
    return;
  }
  if (state.shortcuts.length >= 6) {
    toast('יש כבר 6 קיצורים — תורידי אחד קודם');
    return;
  }
  const shortcut = makeShortcut(text);
  state.shortcuts.push(shortcut);
  saveState();
  render();
  if (shortcut.calories !== null) toast(`נוסף לקיצורים עם ${shortcut.calories} קלוריות ★`);
  else toast('נוסף לקיצורים בלי חישוב קלוריות ★');
}

function removeShortcut(text) {
  state.shortcuts = state.shortcuts.filter(shortcut => shortcut.text !== text);
  saveState();
  render();
  toast('הוסר מהקיצורים');
}

function addQuickItem(shortcut) {
  state.items.push({ id: `${Date.now()}-quick`, text: shortcut.text, time: formatTime() });
  if (shortcut.calories !== null && Number.isFinite(Number(shortcut.calories))) {
    state.consumed += Math.round(Number(shortcut.calories));
    state.updatedAt = formatTime();
  }
  saveState();
  render();
  if (shortcut.calories !== null) toast(`${shortcut.label} נוסף · +${shortcut.calories} קלוריות`);
  else toast(`${shortcut.label} נוסף בלי עדכון קלוריות`);
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

function duplicateItem(id) {
  const item = state.items.find(x => x.id === id);
  if (!item) return;
  state.items.push({
    id: `${Date.now()}-repeat`,
    text: item.text,
    time: formatTime()
  });
  saveState();
  render();
  toast('נוסף עוד אחד ✨');
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
