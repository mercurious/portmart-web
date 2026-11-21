// The engine as the handheld page sees it (portmart docs/WEB-XMB-DOSSIER.md §4 A, §17). device/Portmart.sh's
// bridge binds window.portmartEngine(json) in pages it opened; it runs allowlisted engine argv and answers with
// `portmartengine` DOM events: {id, line} per output line, then {id, exit} or {id, rejected}.
// The line protocol is portmart's CONTRACT (@step/@progress/@error/@done/@log); parseEvent mirrors
// ui/data.py parse_event, so the page and the TUI read the engine the same way.

export const BINDING = 'portmartEngine';
export const EVENT = 'portmartengine';

// The capability check: the handheld context exists only where the bridge bound the engine.
export function binding(win = globalThis) {
  return typeof win[BINDING] === 'function' ? win[BINDING] : null;
}

export function parseEvent(line) {
  line = line.replace(/\r$/, '');
  if (!line.startsWith('@')) return line.trim() ? { kind: 'log', text: line } : null;
  const sp = line.indexOf(' ');
  const kind = sp < 0 ? line.slice(1) : line.slice(1, sp);
  const rest = sp < 0 ? '' : line.slice(sp + 1);
  const part = (s) => { const i = s.indexOf(' '); return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 1)]; };
  if (kind === 'step') {
    const [key, r] = part(rest);
    const [state, text] = part(r);
    return { kind, key, state, text };
  }
  if (kind === 'progress') {
    const p = rest.split(/\s+/);
    const done = Number.parseInt(p[1], 10), total = Number.parseInt(p[2], 10);
    return Number.isNaN(done) || Number.isNaN(total) ? null : { kind, key: p[0], done, total };
  }
  if (kind === 'done') { const [what, value] = part(rest); return { kind, what, value }; }
  if (kind === 'error') { const [key, msg] = part(rest); return { kind, key, msg }; }
  if (kind === 'log') return { kind, text: rest };
  if (kind === 'auth') {                          // @auth <user_code> <verification_uri> <expires_in> (R12)
    const p = rest.split(/\s+/);
    const expires = Number.parseInt(p[2], 10);
    return p.length < 3 || Number.isNaN(expires) ? null : { kind, code: p[0], uri: p[1], expires };
  }
  return null;
}

// Engine errors in words a player understands; exit codes per CONTRACT R5 (ui/data.py friendly_error).
export function friendlyError(key, msg, rc) {
  if (key === 'lock' || rc === 4) return "another install is running; try again when it ends";
  if (key === 'cancel' || rc === 130) return 'cancelled; nothing was changed';
  if (rc === 3) return msg || "portmart can't install apps on this device yet";
  return msg || `engine exited with ${rc}`;
}

export class Engine {
  constructor(bind, target = globalThis) {
    this.bind = bind;
    this.seq = 0;
    this.jobs = new Map();
    target.addEventListener(EVENT, (e) => this.#on(e.detail || {}));
  }

  #on(d) {
    const j = this.jobs.get(d.id);
    if (!j) return;
    if ('line' in d) {
      j.lines.push(d.line);
      const ev = parseEvent(d.line);
      if (ev) {
        if (ev.kind === 'error' && !j.error) j.error = ev;
        j.onEvent && j.onEvent(ev);
      }
      return;
    }
    this.jobs.delete(d.id);
    const exit = d.rejected ? null : d.exit;
    const err = d.rejected ? 'portmart refused that request' : exit === 0 ? null
      : friendlyError(j.error && j.error.key, j.error && j.error.msg, exit);
    j.resolve({ exit, rejected: d.rejected || null, lines: j.lines, error: err });
  }

  // Runs argv; onEvent gets each parsed event. Returns { id, done: Promise<{exit, rejected, lines, error}>, cancel }.
  run(argv, onEvent) {
    const id = ++this.seq;
    let resolve;
    const done = new Promise((r) => { resolve = r; });
    this.jobs.set(id, { lines: [], onEvent, resolve, error: null });
    this.bind(JSON.stringify({ op: 'run', id, argv }));
    return { id, done, cancel: () => this.bind(JSON.stringify({ op: 'cancel', id })) };
  }

  // `list` (or `list --cached`): the engine's state per app, by id. Throws with a friendly message on failure.
  async list(cached = false) {
    const r = await this.run(cached ? ['list', '--cached'] : ['list']).done;
    if (r.exit !== 0) throw new Error(r.error);
    const rows = JSON.parse(r.lines.filter((l) => !l.startsWith('@')).join('\n'));
    return Object.fromEntries(rows.map((x) => [x.id, x]));
  }

  // The page is up: the launcher stops waiting for it (portmart CONTRACT R13).
  hello() { this.bind(JSON.stringify({ op: 'hello' })); }

  // Close the browser store: back to EmulationStation, or with next = 'tui' to the terminal store instead.
  exit(next) { this.bind(JSON.stringify(next ? { op: 'exit', next } : { op: 'exit' })); }
}
