// Claude Session Manager — local web app to overview & manage all Claude Code sessions.
// No external dependencies. Run: node server.js  ->  http://localhost:4317
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const { exec } = require('child_process');

let PORT = process.env.PORT || 4317; // may be overridden by settings before listen
const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const SESSIONS_DIR = path.join(CLAUDE_DIR, 'sessions');
const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects');
const STATE_FILE = path.join(CLAUDE_DIR, 'session-manager-state.json'); // our own sidecar
const CONFIG_FILE = path.join(CLAUDE_DIR, 'session-manager-config.json');
const LANG_DIR = path.join(__dirname, 'lang');

// Terminal launch templates per platform. {cwd} and {id} get substituted.
const TERMINAL_PRESETS = {
  win32: {
    powershell: `start "" powershell -NoExit -Command "Set-Location -LiteralPath '{cwd}'; claude --resume {id}"`,
    cmd: `start "" cmd /k "cd /d \"{cwd}\" && claude --resume {id}"`,
    'windows-terminal': `wt -d "{cwd}" powershell -NoExit -Command "claude --resume {id}"`,
  },
  darwin: {
    terminal: `osascript -e 'tell application "Terminal" to do script "cd \\"{cwd}\\" && claude --resume {id}"' -e 'tell application "Terminal" to activate'`,
    iterm: `osascript -e 'tell application "iTerm" to tell current window to create tab with default profile' -e 'tell application "iTerm" to tell current session of current window to write text "cd \\"{cwd}\\" && claude --resume {id}"'`,
  },
  linux: {
    'gnome-terminal': `gnome-terminal --working-directory="{cwd}" -- bash -c "claude --resume {id}; exec bash"`,
    konsole: `konsole --workdir "{cwd}" -e bash -c "claude --resume {id}; exec bash"`,
    xterm: `xterm -e bash -c "cd '{cwd}'; claude --resume {id}; exec bash"`,
  },
};
const DEFAULT_TERMINAL = { win32: 'powershell', darwin: 'terminal', linux: 'gnome-terminal' };

// Declarative settings schema — drives both defaults and the (schema-generated) settings UI.
// Adding a setting here = it appears in the UI and in settings.json. (Precursor to a plugin
// "contributes.configuration" model.)
// Labels/groups/options are i18n KEYS resolved client-side against lang/<code>.json.
const SETTINGS_SCHEMA = [
  { group: 'group.general', items: [
    { key: 'language', type: 'select', label: 'set.language', options: [], default: 'en' },
    { key: 'theme', type: 'select', label: 'set.theme',
      options: [{ v: 'hell', l: 'opt.light' }, { v: 'dunkel', l: 'opt.dark' }], default: 'hell' },
    { key: 'defaultView', type: 'select', label: 'set.defaultView',
      options: [{ v: 'list', l: 'opt.list' }, { v: 'timeline', l: 'opt.timeline' }, { v: 'board', l: 'opt.board' }], default: 'list' },
    { key: 'refreshSeconds', type: 'number', label: 'set.refresh', default: 5, min: 2, max: 300 },
    { key: 'port', type: 'number', label: 'set.port', default: 4317, min: 1, max: 65535 },
  ]},
  { group: 'group.kanban', items: [
    { key: 'columns', type: 'list', label: 'set.columns',
      default: ['New', 'In progress', 'Waiting', 'Done', 'Archive'] },
  ]},
  { group: 'group.terminal', items: [
    { key: 'terminal', type: 'terminal', label: 'set.terminal' },
  ]},
];

function scanLanguages() {
  let files = [];
  try { files = fs.readdirSync(LANG_DIR).filter(f => f.endsWith('.json')); } catch {}
  return files.map(f => {
    const code = f.replace(/\.json$/, '');
    const d = safeReadJson(path.join(LANG_DIR, f), {});
    return { code, name: d._name || code };
  });
}
// schema with the language item's options filled from available language files
function buildSchema() {
  const langs = scanLanguages();
  return SETTINGS_SCHEMA.map(g => ({
    group: g.group,
    items: g.items.map(it => it.key === 'language'
      ? Object.assign({}, it, { options: langs.map(l => ({ v: l.code, l: l.name })) })
      : it),
  }));
}

function settingsDefaults() {
  const d = {};
  for (const g of SETTINGS_SCHEMA) for (const it of g.items) {
    if (it.type === 'terminal') { d.terminal = DEFAULT_TERMINAL[process.platform] || 'custom'; d.customCommand = ''; }
    else d[it.key] = Array.isArray(it.default) ? it.default.slice() : it.default;
  }
  return d;
}
function loadSettings() {
  return Object.assign(settingsDefaults(), safeReadJson(CONFIG_FILE, {}));
}
function resolveTerminalCmd(cwd, id) {
  const cfg = loadSettings();
  const presets = TERMINAL_PRESETS[process.platform] || {};
  let tmpl = (cfg.terminal === 'custom') ? cfg.customCommand
           : (presets[cfg.terminal] || presets[DEFAULT_TERMINAL[process.platform]]);
  if (!tmpl) return null;
  return tmpl.split('{cwd}').join(cwd).split('{id}').join(id);
}

// ---------- helpers ----------
function safeReadJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

// Claude Code encodes a session's cwd into its project-dir name by replacing : \ /  with '-'.
// Used to pick the AUTHORITATIVE cwd from a transcript (ignoring sub-agent/Task cwds).
function encPath(cwd) { return cwd.replace(/[:\\/]/g, '-'); }

// Read first `headBytes` and last `tailBytes` of a (possibly huge) file as text.
function readHeadTail(file, headBytes = 65536, tailBytes = 262144) {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    if (size <= headBytes + tailBytes) {
      const buf = Buffer.alloc(size);
      fs.readSync(fd, buf, 0, size, 0);
      return { head: buf.toString('utf8'), tail: '' };
    }
    const head = Buffer.alloc(headBytes);
    fs.readSync(fd, head, 0, headBytes, 0);
    const tail = Buffer.alloc(tailBytes);
    fs.readSync(fd, tail, 0, tailBytes, size - tailBytes);
    return { head: head.toString('utf8'), tail: tail.toString('utf8') };
  } finally {
    fs.closeSync(fd);
  }
}

function extractText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map(c => (c && typeof c === 'object' ? (c.text || '') : '')).join(' ').trim();
  }
  return '';
}

// Parse a transcript .jsonl into compact metadata.
// dirName = the project-dir name this file lives in (authoritative cwd source).
function parseTranscript(file, dirName) {
  const meta = {
    cwd: null, firstCwd: null, matchedCwd: null, gitBranch: null, version: null,
    customTitle: null, aiTitle: null, lastPrompt: null,
    firstUserPrompt: null, firstTs: null, lastTs: null,
  };
  let content;
  try { content = readHeadTail(file); } catch { return meta; }
  const scan = (text, isHead) => {
    const lines = text.split('\n');
    for (const line of lines) {
      const s = line.trim();
      if (!s || s[0] !== '{') continue;
      let d; try { d = JSON.parse(s); } catch { continue; }
      switch (d.type) {
        case 'custom-title': if (d.customTitle) meta.customTitle = d.customTitle; break;
        case 'ai-title': if (d.aiTitle) meta.aiTitle = d.aiTitle; break;
        case 'last-prompt': if (d.lastPrompt) meta.lastPrompt = d.lastPrompt; break;
        case 'user':
        case 'assistant':
          if (d.cwd) {
            if (!meta.firstCwd) meta.firstCwd = d.cwd;
            if (!meta.matchedCwd && dirName && encPath(d.cwd).toLowerCase() === dirName.toLowerCase()) meta.matchedCwd = d.cwd;
            meta.cwd = d.cwd; // last-seen fallback
          }
          if (d.gitBranch) meta.gitBranch = d.gitBranch;
          if (d.version) meta.version = d.version;
          if (d.timestamp) { if (!meta.firstTs) meta.firstTs = d.timestamp; meta.lastTs = d.timestamp; }
          if (d.type === 'user' && isHead && !meta.firstUserPrompt) {
            const t = extractText(d.message && d.message.content);
            if (t && !t.startsWith('<') && t.length > 1) meta.firstUserPrompt = t.slice(0, 240);
          }
          break;
      }
    }
  };
  scan(content.head, true);
  if (content.tail) scan(content.tail, false);
  // authoritative cwd: the one matching the project dir, else first-seen, else last-seen
  meta.cwd = meta.matchedCwd || meta.firstCwd || meta.cwd;
  return meta;
}

// Set of alive PIDs on this machine (Windows: tasklist).
function getAlivePids() {
  return new Promise(resolve => {
    if (process.platform !== 'win32') {
      exec('ps -e -o pid=', (e, out) => {
        if (e) return resolve(null);
        resolve(new Set(out.split('\n').map(l => l.trim()).filter(Boolean)));
      });
      return;
    }
    exec('tasklist /FO CSV /NH', { maxBuffer: 8 * 1024 * 1024 }, (e, out) => {
      if (e) return resolve(null);
      const pids = new Set();
      for (const line of out.split('\n')) {
        const m = line.match(/^"[^"]*","(\d+)"/);
        if (m) pids.add(m[1]);
      }
      resolve(pids);
    });
  });
}

async function scanSessions() {
  // 1) live session files (by PID)
  const live = {}; // sessionId -> liveInfo
  let liveFiles = [];
  try { liveFiles = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json')); } catch {}
  const alivePids = await getAlivePids();
  for (const f of liveFiles) {
    const d = safeReadJson(path.join(SESSIONS_DIR, f), null);
    if (!d || !d.sessionId) continue;
    const pid = String(d.pid);
    const alive = alivePids ? alivePids.has(pid) : null;
    live[d.sessionId] = {
      pid: d.pid, alive, cwd: d.cwd, startedAt: d.startedAt,
      entrypoint: d.entrypoint, version: d.version,
      liveStatus: d.status || null, updatedAt: d.updatedAt || null,
    };
  }

  // 2) transcripts
  const sessions = {};
  let projDirs = [];
  try { projDirs = fs.readdirSync(PROJECTS_DIR); } catch {}
  for (const dir of projDirs) {
    const full = path.join(PROJECTS_DIR, dir);
    let files = [];
    try { files = fs.readdirSync(full).filter(f => f.endsWith('.jsonl')); } catch { continue; }
    for (const f of files) {
      const file = path.join(full, f);
      const sessionId = f.replace(/\.jsonl$/, '');
      let st; try { st = fs.statSync(file); } catch { continue; }
      const meta = parseTranscript(file, dir);
      sessions[sessionId] = {
        sessionId,
        title: meta.customTitle || meta.aiTitle || meta.firstUserPrompt || '(ohne Titel)',
        customTitle: meta.customTitle, aiTitle: meta.aiTitle,
        cwd: meta.cwd, gitBranch: meta.gitBranch, version: meta.version,
        lastPrompt: meta.lastPrompt || meta.firstUserPrompt,
        firstUserPrompt: meta.firstUserPrompt,
        sizeBytes: st.size,
        mtime: st.mtimeMs,
        firstTs: meta.firstTs, lastTs: meta.lastTs,
      };
    }
  }

  // 3) merge live info (include live-only sessions too)
  for (const [id, l] of Object.entries(live)) {
    if (!sessions[id]) {
      sessions[id] = { sessionId: id, title: '(laufende Session)', cwd: l.cwd, sizeBytes: 0, mtime: l.updatedAt || l.startedAt };
    }
    const s = sessions[id];
    s.live = l;
    if (!s.cwd) s.cwd = l.cwd;
    // derive lastActivity
    s.lastActivity = Math.max(s.mtime || 0, l.updatedAt || 0, l.startedAt || 0);
  }
  for (const s of Object.values(sessions)) {
    if (!s.lastActivity) s.lastActivity = s.mtime || 0;
    // live status: green=alive&recent, yellow=alive&stale(>30min idle), black=not running
    if (s.live && s.live.alive) {
      const idleMs = Date.now() - (s.lastActivity || 0);
      s.status = idleMs > 30 * 60 * 1000 ? 'idle' : 'running';
    } else if (s.live && s.live.alive === false) {
      s.status = 'closed';
    } else {
      s.status = 'closed';
    }
    s.project = s.cwd ? s.cwd.split(/[\\/]/).filter(Boolean).pop() : '?';
  }

  return Object.values(sessions).sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0));
}

// Locate the transcript file for a sessionId.
function findTranscript(id) {
  let projDirs = [];
  try { projDirs = fs.readdirSync(PROJECTS_DIR); } catch { return null; }
  for (const dir of projDirs) {
    const f = path.join(PROJECTS_DIR, dir, id + '.jsonl');
    if (fs.existsSync(f)) return f;
  }
  return null;
}

// Full parse of a single session (on demand): summary, prompt history, images.
function sessionDetail(id) {
  return new Promise(resolve => {
    const file = findTranscript(id);
    if (!file) return resolve({ error: 'Session-Datei nicht gefunden' });
    const out = {
      sessionId: id, file, messageCount: 0, userCount: 0, assistantCount: 0,
      prompts: [], images: [], firstTs: null, lastTs: null,
      cwd: null, gitBranch: null, customTitle: null, aiTitle: null,
    };
    const MAX_IMAGES = 12;
    const rl = readline.createInterface({ input: fs.createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
    rl.on('line', line => {
      const s = line.trim();
      if (!s || s[0] !== '{') return;
      let d; try { d = JSON.parse(s); } catch { return; }
      if (d.type === 'custom-title' && d.customTitle) out.customTitle = d.customTitle;
      if (d.type === 'ai-title' && d.aiTitle) out.aiTitle = d.aiTitle;
      if (d.type !== 'user' && d.type !== 'assistant') return;
      if (d.cwd) out.cwd = d.cwd;
      if (d.gitBranch) out.gitBranch = d.gitBranch;
      if (d.timestamp) { if (!out.firstTs) out.firstTs = d.timestamp; out.lastTs = d.timestamp; }
      out.messageCount++;
      if (d.type === 'user') out.userCount++; else out.assistantCount++;
      const content = d.message && d.message.content;
      if (Array.isArray(content)) {
        for (const c of content) {
          if (!c || typeof c !== 'object') continue;
          if (c.type === 'image' && c.source && c.source.data && out.images.length < MAX_IMAGES) {
            out.images.push('data:' + (c.source.media_type || 'image/png') + ';base64,' + c.source.data);
          }
        }
      }
      if (d.type === 'user') {
        const t = extractText(content);
        if (t && !t.startsWith('<') && !t.startsWith('[') && t.length > 1) {
          out.prompts.push({ ts: d.timestamp || null, text: t.slice(0, 600) });
        }
      }
    });
    rl.on('close', () => {
      out.goal = out.prompts.length ? out.prompts[0].text : null;
      out.lastPrompt = out.prompts.length ? out.prompts[out.prompts.length - 1].text : null;
      resolve(out);
    });
    rl.on('error', () => resolve(out));
  });
}

// First image of a session (for project tiles). Caps bytes read; caches by mtime.
const thumbCache = {};
function sessionThumb(id) {
  return new Promise(resolve => {
    const file = findTranscript(id);
    if (!file) return resolve(null);
    let st; try { st = fs.statSync(file); } catch { return resolve(null); }
    const c = thumbCache[id];
    if (c && c.mtime === st.mtimeMs) return resolve(c.image);
    let done = false;
    const stream = fs.createReadStream(file, { encoding: 'utf8', start: 0, end: 15 * 1024 * 1024 });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    const finish = img => {
      if (done) return; done = true;
      thumbCache[id] = { mtime: st.mtimeMs, image: img };
      try { rl.close(); stream.destroy(); } catch {}
      resolve(img);
    };
    rl.on('line', line => {
      if (done || line.indexOf('"type":"image"') < 0) return;
      try {
        const d = JSON.parse(line.trim());
        const content = d.message && d.message.content;
        if (Array.isArray(content)) for (const x of content)
          if (x && x.type === 'image' && x.source && x.source.data)
            return finish('data:' + (x.source.media_type || 'image/png') + ';base64,' + x.source.data);
      } catch {}
    });
    rl.on('close', () => finish(null));
    rl.on('error', () => finish(null));
  });
}

// Prompt markers per session for the Gantt timeline. Caches by mtime.
const markerCache = {};
function sessionMarkers(id, file, mtime) {
  return new Promise(resolve => {
    const c = markerCache[id];
    if (c && c.mtime === mtime) return resolve(c);
    const o = { sessionId: id, mtime, firstTs: null, lastTs: null, prompts: [], msgCount: 0 };
    const rl = readline.createInterface({ input: fs.createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
    rl.on('line', line => {
      const s = line.trim();
      if (!s || s[0] !== '{') return;
      let d; try { d = JSON.parse(s); } catch { return; }
      if (d.type !== 'user' && d.type !== 'assistant') return;
      o.msgCount++;
      const t = d.timestamp ? Date.parse(d.timestamp) : null;
      if (t) { if (!o.firstTs) o.firstTs = t; o.lastTs = t; }
      if (d.type === 'user' && t) {
        const tx = extractText(d.message && d.message.content);
        if (tx && !tx.startsWith('<') && !tx.startsWith('[') && tx.length > 1)
          o.prompts.push({ t, text: tx.slice(0, 110) });
      }
    });
    rl.on('close', () => { markerCache[id] = o; resolve(o); });
    rl.on('error', () => resolve(o));
  });
}
async function timelineData() {
  const res = [];
  let projDirs = [];
  try { projDirs = fs.readdirSync(PROJECTS_DIR); } catch {}
  for (const dir of projDirs) {
    let files = [];
    try { files = fs.readdirSync(path.join(PROJECTS_DIR, dir)).filter(f => f.endsWith('.jsonl')); } catch { continue; }
    for (const f of files) {
      const file = path.join(PROJECTS_DIR, dir, f);
      let st; try { st = fs.statSync(file); } catch { continue; }
      res.push(await sessionMarkers(f.replace(/\.jsonl$/, ''), file, st.mtimeMs));
    }
  }
  return res;
}

// ---------- http ----------
function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise(resolve => {
    let b = ''; req.on('data', c => (b += c)); req.on('end', () => { try { resolve(JSON.parse(b)); } catch { resolve({}); } });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (url.pathname === '/') {
      return send(res, 200, fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8'), 'text/html; charset=utf-8');
    }
    if (url.pathname.startsWith('/lang/')) {
      const name = path.basename(url.pathname);
      if (!/^[a-z0-9_-]+\.json$/i.test(name)) return send(res, 400, { error: 'bad name' });
      const file = path.join(LANG_DIR, name);
      if (!fs.existsSync(file)) return send(res, 404, { error: 'not found' });
      return send(res, 200, fs.readFileSync(file, 'utf8'), 'application/json; charset=utf-8');
    }
    if (url.pathname === '/api/sessions') {
      const sessions = await scanSessions();
      const state = safeReadJson(STATE_FILE, {});
      let htmlVersion = 0;
      try { htmlVersion = fs.statSync(path.join(__dirname, 'index.html')).mtimeMs; } catch {}
      return send(res, 200, { sessions, state, scannedAt: Date.now(), htmlVersion });
    }
    if (url.pathname === '/api/session') {
      const id = url.searchParams.get('id');
      if (!id) return send(res, 400, { error: 'id fehlt' });
      return send(res, 200, await sessionDetail(id));
    }
    if (url.pathname === '/api/thumb') {
      const id = url.searchParams.get('id');
      if (!id) return send(res, 400, { error: 'id fehlt' });
      return send(res, 200, { image: await sessionThumb(id) });
    }
    if (url.pathname === '/api/timeline') {
      return send(res, 200, { markers: await timelineData() });
    }
    if (url.pathname === '/api/state' && req.method === 'POST') {
      const body = await readBody(req); // { sessionId, patch: {column?, notes?, archived?} }
      const state = safeReadJson(STATE_FILE, {});
      if (body.sessionId) {
        state[body.sessionId] = Object.assign({}, state[body.sessionId], body.patch || {});
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
      }
      return send(res, 200, { ok: true, state });
    }
    if (url.pathname === '/api/open-folder' && req.method === 'POST') {
      const { cwd } = await readBody(req);
      if (!cwd) return send(res, 400, { ok: false, error: 'cwd fehlt' });
      if (process.platform === 'win32') exec(`start "" "${cwd}"`, { shell: 'cmd.exe' }, () => {});
      else if (process.platform === 'darwin') exec(`open "${cwd}"`, () => {});
      else exec(`xdg-open "${cwd}"`, () => {});
      return send(res, 200, { ok: true });
    }
    if (url.pathname === '/api/settings') {
      if (req.method === 'POST') {
        const body = await readBody(req);
        const cur = safeReadJson(CONFIG_FILE, {});
        const next = Object.assign(cur, body || {});
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2));
        return send(res, 200, { ok: true, values: loadSettings() });
      }
      return send(res, 200, {
        schema: buildSchema(),
        values: loadSettings(),
        languages: scanLanguages(),
        platform: process.platform,
        terminalPresets: Object.keys(TERMINAL_PRESETS[process.platform] || {}),
        terminalTemplates: TERMINAL_PRESETS[process.platform] || {},
      });
    }
    if (url.pathname === '/api/resume' && req.method === 'POST') {
      const { sessionId, cwd } = await readBody(req);
      if (!sessionId || !cwd) return send(res, 400, { ok: false, error: 'sessionId/cwd fehlt' });
      const cmd = resolveTerminalCmd(cwd, sessionId);
      if (!cmd) return send(res, 500, { ok: false, error: 'Kein Terminal konfiguriert' });
      exec(cmd, process.platform === 'win32' ? { shell: 'cmd.exe' } : {}, e => { if (e) console.error('resume:', e.message); });
      return send(res, 200, { ok: true });
    }
    send(res, 404, { error: 'not found' });
  } catch (e) {
    send(res, 500, { error: String(e && e.stack || e) });
  }
});

PORT = process.env.PORT || loadSettings().port || PORT;
server.listen(PORT, () => {
  console.log(`Claude Session Manager -> http://localhost:${PORT}`);
  console.log(`Scanning: ${CLAUDE_DIR}`);
});
