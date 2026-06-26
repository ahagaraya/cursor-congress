const ROLE_LABELS = {
  critic: 'Критик',
  architect: 'Архитектор',
  pragmatist: 'Прагматик',
  'tech-lead': 'Техлид',
  developer: 'Разработчик',
  lawyer: 'Юрист',
  security: 'Безопасность',
  cybersec: 'Кибербезопасность',
  researcher: 'Исследователь',
  assistant: 'Ассистент',
  chair: 'Председатель',
  system: 'Система',
};

let currentSlug = null;
let lastEventCount = 0;

const $sessions = document.getElementById('session-list');
const $messages = document.getElementById('messages');
const $title = document.getElementById('chat-title');
const $phase = document.getElementById('chat-phase');
const $briefPanel = document.getElementById('brief-panel');
const $briefText = document.getElementById('brief-text');
const $statusDot = document.getElementById('status-dot');
const $statusText = document.getElementById('status-text');
const $banner = document.getElementById('congress-banner');
const $bannerText = document.getElementById('congress-banner-text');
const $bannerPhase = document.getElementById('congress-banner-phase');

const PHASE_LABELS = {
  setup: 'настройка',
  triage: 'триаж',
  intake: 'intake',
  brief: 'brief',
  r1: 'раунд 1',
  optional_r1: 'эксперты',
  research: 'исследование',
  merge: 'слияние',
  swarm_init: 'swarm init',
  swarm: 'swarm',
  proposal: 'proposal',
  editor: 'редактор',
  assistant: 'ассистент',
  validate: 'валидация',
  complete: 'завершено',
};

function updateActiveBanner(active) {
  if (!active?.active || active.phase === 'complete') {
    $banner.classList.add('hidden');
    return;
  }
  $banner.classList.remove('hidden');
  const phase = PHASE_LABELS[active.phase] || active.phase;
  const mode = active.mode === 'lite' ? 'lite' : active.mode === 'full' ? 'full' : '';
  $bannerText.textContent = `Congress работает · ${active.slug}`;
  $bannerPhase.textContent = `${phase}${mode ? ` · ${mode}` : ''}`;
  if (active.slug && active.slug !== currentSlug) {
    selectSession(active.slug);
  }
}

async function loadActive() {
  try {
    const res = await fetch('/api/active');
    const data = await res.json();
    updateActiveBanner(data);
  } catch {}
}

function fmtTime(ts) {
  try {
    return new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return '';
  }
}

function renderMessage(ev) {
  const div = document.createElement('div');

  if (ev.type === 'phase') {
    div.className = 'msg phase';
    div.innerHTML = `<div class="msg-bubble">Фаза <strong>${ev.phase}</strong> · ${ev.wave || ''} · ${ev.status || ''}</div>`;
    return div;
  }

  if (ev.type === 'intake') {
    div.className = 'msg intake';
    div.innerHTML = `<div class="msg-bubble">📋 Intake: ${escapeHtml(ev.text || '')}</div>`;
    return div;
  }

  if (ev.type === 'research') {
    div.className = 'msg research';
    const role = ev.role || 'researcher';
    div.innerHTML = `
      <div class="msg-meta"><span class="role-badge role-${role}">${ROLE_LABELS[role] || role}</span><span class="msg-time">${fmtTime(ev.ts)}</span></div>
      <div class="msg-bubble"><div class="msg-text">🔍 ${escapeHtml(ev.text || '')}</div></div>`;
    return div;
  }

  if (ev.type === 'route') {
    const from = ev.role || 'system';
    const toLabel = (ev.reply_to || [])
      .map((r) => ROLE_LABELS[r] || r)
      .join(', ');
    div.className = 'msg route';
    div.innerHTML = `
      <div class="msg-meta">
        <span class="role-badge role-${from}">${ROLE_LABELS[from] || from}</span>
        <span class="msg-wave">→ ${escapeHtml(toLabel)}</span>
        <span class="msg-time">${fmtTime(ev.ts)}</span>
      </div>
      <div class="msg-bubble"><div class="msg-text">🔀 ${escapeHtml(ev.text || '')}</div></div>`;
    return div;
  }

  if (ev.type === 'system') {
    div.className = 'msg system';
    div.innerHTML = `<div class="msg-bubble">${escapeHtml(ev.text || '')}</div>`;
    return div;
  }

  if (ev.type === 'chair') {
    div.className = 'msg chair';
    div.innerHTML = `
      <div class="msg-meta"><span class="role-badge role-chair">${ROLE_LABELS.chair}</span><span class="msg-time">${fmtTime(ev.ts)}</span></div>
      <div class="msg-bubble"><div class="msg-text">${escapeHtml(ev.text || '')}</div></div>`;
    return div;
  }

  const role = ev.role || 'system';
  const label = ROLE_LABELS[role] || role;
  const replyHint = ev.reply_to?.length
    ? ` → ${ev.reply_to.map((r) => ROLE_LABELS[r] || r).join(', ')}`
    : '';

  div.className = `msg ${ev.reply_to?.length ? 'reply' : ''}`;
  div.innerHTML = `
    <div class="msg-meta">
      <span class="role-badge role-${role}">${label}</span>
      ${ev.wave ? `<span class="msg-wave">${ev.wave}</span>` : ''}
      ${ev.round ? `<span class="muted">R${ev.round}</span>` : ''}
      <span class="msg-time">${fmtTime(ev.ts)}${replyHint}</span>
    </div>
    <div class="msg-bubble"><div class="msg-text">${escapeHtml(ev.text || '')}</div></div>`;
  return div;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function loadSessions() {
  const res = await fetch('/api/sessions');
  const sessions = await res.json();
  $sessions.innerHTML = sessions
    .map(
      (s) => `
    <li>
      <button type="button" data-slug="${s.slug}" class="${s.slug === currentSlug ? 'active' : ''}">
        ${escapeHtml(s.title)}
        <span class="slug">${escapeHtml(s.slug)}</span>
        <span class="phase-badge">${escapeHtml(s.phase)}</span>
      </button>
    </li>`
    )
    .join('');

  $sessions.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => selectSession(btn.dataset.slug));
  });

  if (!currentSlug && sessions.length) selectSession(sessions[0].slug);
}

async function loadEvents() {
  if (!currentSlug) return;
  const res = await fetch(`/api/sessions/${encodeURIComponent(currentSlug)}/events`);
  const events = await res.json();
  if (events.length === lastEventCount) return;
  lastEventCount = events.length;

  $messages.innerHTML = '';
  if (!events.length) {
    $messages.innerHTML = '<div class="msg system"><div class="msg-bubble">Ожидание событий… Запустите /congress и оркестратор будет писать в events.jsonl</div></div>';
    return;
  }
  for (const ev of events) {
    $messages.appendChild(renderMessage(ev));
  }
  $messages.scrollTop = $messages.scrollHeight;
}

async function loadBrief() {
  if (!currentSlug) return;
  const res = await fetch(`/api/sessions/${encodeURIComponent(currentSlug)}/brief`);
  const text = await res.text();
  if (text.trim()) {
    $briefPanel.classList.remove('hidden');
    $briefText.textContent = text;
  }
}

function selectSession(slug) {
  currentSlug = slug;
  lastEventCount = 0;
  $title.textContent = slug;
  $phase.textContent = '';
  loadSessions();
  loadEvents();
  loadBrief();
  fetch('/api/sessions')
    .then((r) => r.json())
    .then((list) => {
      const s = list.find((x) => x.slug === slug);
      if (s) {
        $title.textContent = s.title;
        $phase.textContent = `Фаза: ${s.phase}`;
      }
    });
}

function connectSSE() {
  const es = new EventSource('/api/events/stream');
  es.onopen = () => {
    $statusDot.classList.add('live');
    $statusText.textContent = 'live';
  };
  es.onmessage = (ev) => {
    loadSessions();
    if (currentSlug) loadEvents();
    try {
      const data = JSON.parse(ev.data);
      if (data.type === 'active') loadActive();
    } catch {}
  };
  es.onerror = () => {
    $statusDot.classList.remove('live');
    $statusText.textContent = 'переподключение…';
  };
}

document.getElementById('btn-refresh').addEventListener('click', () => {
  lastEventCount = 0;
  loadEvents();
  loadSessions();
});

loadSessions();
loadActive();
connectSSE();
setInterval(() => {
  if (currentSlug) loadEvents();
}, 3000);
setInterval(loadActive, 2000);
