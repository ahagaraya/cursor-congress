#!/usr/bin/env node
/**
 * Congress live chat UI — http://localhost:3747
 * Watches congress/sessions/.../deliberation/events.jsonl
 */
import { createServer } from 'http';
import { readFileSync, readdirSync, statSync, existsSync, watch } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SESSIONS = join(ROOT, 'sessions');
const ACTIVE_PATH = join(ROOT, '.active-session.json');
const PORT = Number(process.env.CONGRESS_PORT) || 3747;

const watchers = new Map();

function readActive() {
  if (!existsSync(ACTIVE_PATH)) return { active: false };
  try {
    return JSON.parse(readFileSync(ACTIVE_PATH, 'utf8'));
  } catch {
    return { active: false };
  }
}

function listSessions() {
  if (!existsSync(SESSIONS)) return [];
  return readdirSync(SESSIONS)
    .filter((name) => {
      try {
        return statSync(join(SESSIONS, name)).isDirectory() && !name.startsWith('_');
      } catch {
        return false;
      }
    })
    .map((slug) => {
      const base = join(SESSIONS, slug);
      let title = slug;
      try {
        const brief = readFileSync(join(base, 'BRIEF.md'), 'utf8');
        const m = brief.match(/^## Question\s*\n+(.+)/m);
        if (m) title = m[1].trim().slice(0, 120);
      } catch {}
      let phase = 'idle';
      try {
        const st = JSON.parse(readFileSync(join(base, 'deliberation', 'state.json'), 'utf8'));
        phase = st.phase || phase;
        if (st.mode === 'swarm') phase = `swarm:${st.wave || phase}`;
      } catch {}
      return { slug, title, phase };
    })
    .sort((a, b) => b.slug.localeCompare(a.slug));
}

function readEvents(slug) {
  const path = join(SESSIONS, slug, 'deliberation', 'events.jsonl');
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line, i) => {
      try {
        return { id: i, ...JSON.parse(line) };
      } catch {
        return { id: i, type: 'system', ts: new Date().toISOString(), text: line };
      }
    });
}

function readBrief(slug) {
  try {
    return readFileSync(join(SESSIONS, slug, 'BRIEF.md'), 'utf8');
  } catch {
    return '';
  }
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

function safeSlug(slug) {
  if (!SLUG_RE.test(slug)) return null;
  return slug;
}

const sseClients = new Set();

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/api/sessions') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(listSessions()));
    return;
  }

  if (url.pathname === '/api/active') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(readActive()));
    return;
  }

  const eventsMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/events$/);
  if (eventsMatch) {
    const slug = safeSlug(eventsMatch[1]);
    if (!slug) { res.writeHead(400); res.end('Invalid slug'); return; }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(readEvents(slug)));
    return;
  }

  const briefMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/brief$/);
  if (briefMatch) {
    const slug = safeSlug(briefMatch[1]);
    if (!slug) { res.writeHead(400); res.end('Invalid slug'); return; }
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(readBrief(slug));
    return;
  }

  const graphMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/swarm-graph$/);
  if (graphMatch) {
    const slug = safeSlug(graphMatch[1]);
    if (!slug) { res.writeHead(400); res.end('Invalid slug'); return; }
    const graphPath = join(SESSIONS, slug, 'deliberation', 'swarm', 'graph.json');
    let graph = { nodes: [], edges: [] };
    try {
      graph = JSON.parse(readFileSync(graphPath, 'utf8'));
    } catch {}
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(graph));
    return;
  }

  if (url.pathname === '/api/events/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write(': connected\n\n');
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  let file = url.pathname === '/' ? '/index.html' : url.pathname;
  const staticPath = resolve(join(__dirname, file.replace(/^\//, '')));
  if (!staticPath.startsWith(resolve(__dirname)) || !existsSync(staticPath) || !statSync(staticPath).isFile()) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  const ext = staticPath.split('.').pop();
  const types = { html: 'text/html', css: 'text/css', js: 'application/javascript', svg: 'image/svg+xml' };
  res.writeHead(200, { 'Content-Type': (types[ext] || 'text/plain') + '; charset=utf-8' });
  res.end(readFileSync(staticPath));
  return;
});

function broadcastSession(slug) {
  const payload = `data: ${JSON.stringify({ slug, ts: Date.now() })}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {}
  }
}

function watchSession(slug) {
  if (watchers.has(slug)) return;
  const eventsPath = join(SESSIONS, slug, 'deliberation', 'events.jsonl');
  const dir = join(SESSIONS, slug, 'deliberation');
  const swarmDir = join(dir, 'swarm');
  if (!existsSync(dir)) return;
  const onChange = () => broadcastSession(slug);
  try {
    const w = watch(dir, onChange);
    watchers.set(slug, w);
    if (existsSync(swarmDir)) {
      watch(swarmDir, onChange);
    }
  } catch {}
}

function watchAllSessions() {
  if (!existsSync(SESSIONS)) return;
  for (const slug of readdirSync(SESSIONS)) {
    watchSession(slug);
  }
  try {
    watch(SESSIONS, (_, name) => {
      if (name) watchSession(name);
    });
  } catch {}
}

function broadcastActive() {
  const payload = `data: ${JSON.stringify({ type: 'active', ts: Date.now() })}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {}
  }
}

function watchActiveFile() {
  if (!existsSync(ACTIVE_PATH)) {
    try {
      watch(ROOT, (_, name) => {
        if (name === '.active-session.json') watchActiveFile();
      });
    } catch {}
    return;
  }
  try {
    watch(ACTIVE_PATH, () => broadcastActive());
  } catch {}
}

watchAllSessions();
watchActiveFile();

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Congress UI → http://127.0.0.1:${PORT}`);
  console.log(`Sessions dir: ${SESSIONS}`);
});
