// The portmart.app XMB: one build, two contexts (portmart PRODUCT.md, DESIGN.md).
//   web     desktop or phone: the catalog as a showcase, plus the installer line
//   device  the handheld, in a page device/Portmart.sh opened: Get / Update / Remove through the engine
// The context is a capability check (engine.js binding()), never the user agent.
//
// Axes: Up/Down = categories, Left/Right = titles. Enter/A = primary, Space/Y = info, Esc/B = back (cancels a
// running job), X = remove (device; asks first; on an OFFLINE app it retries), [ ]/L1 R1 = media.
// Touch: swipes are the D-pad, tap = A on the focused title, long-press = info.
import { createAtmosphere } from './atmosphere.js';
import { load, rows } from './catalog.js';
import { binding, Engine } from './engine.js';
import { OMP, SUNSET, bigRows, bigWidth, cartColor, grad, logoRows, pixelCanvas, CART } from './glyphs.js';
import { fit as fitGrid, layout, fitTitle } from './layout.js';

const CAT = {
  portmart: { label: 'PORTMART', accent: OMP },
  installed: { label: 'INSTALLED', accent: ['#4ade80', '#00dbe4', '#9362f4'] },
  play: { label: 'PLAY', accent: SUNSET },
  studio: { label: 'STUDIO', accent: OMP },
  chat: { label: 'CHAT', accent: ['#00dbe4', '#4ade80', '#9362f4'] },
  media: { label: 'MEDIA', accent: ['#ff4fd8', '#ffb000', '#e752d3'] },
  net: { label: 'NET', accent: ['#00dbe4', '#5aa9ff', '#9362f4'] },
  system: { label: 'SYSTEM', accent: ['#d4c090', '#ff5a6e', '#9362f4'] },
};
const TAGS = {
  ai: ['AI', 'ai'], mic: ['MIC', 'need'], gpu: ['GPU', 'rt'], online: ['ONLINE', 'net'], lan: ['LAN', 'net'],
  account: ['ACCOUNT', 'need'], touch: ['TOUCH', 'gen'], roms: ['ROMS', 'need'], coop: ['CO-OP', 'gen'],
  charger: ['CHARGER', 'need'], size: ['LARGE', 'size'], ram12: ['12 GB RAM', 'size'], ram8: ['8 GB RAM', 'size'],
};
const NEEDS = { mic: 'mic', charger: 'charger', account: 'account', roms: 'your ROMs', lan: 'LAN server', ram12: '12 GB RAM', ram8: '8 GB RAM', online: 'Wi-Fi' };
const INSTALL = { sh: 'curl -fsSL https://portmart.app/get | bash', ps: 'irm https://portmart.app/get.ps1 | iex' };

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function wrap(s, w) {
  const out = []; let line = '';
  for (let word of (s || '').split(/\s+/)) {
    if (!word) continue;
    while (word.length > w) { if (line) { out.push(line); line = ''; } out.push(word.slice(0, w)); word = word.slice(w); }
    if (line.length + word.length + (line ? 1 : 0) > w) { out.push(line); line = word; } else line = line ? `${line} ${word}` : word;
  }
  if (line) out.push(line);
  return out;
}

// ---- state ----
const qs = new URLSearchParams(location.search);
const S = {
  ctx: 'web', engine: null, catalog: null, error: null,
  states: null,          // device: the engine's `list`, by id
  listing: 'idle',       // device: 'checking' while a network list runs, 'offline' when it failed
  ci: 0, ti: {}, info: false, mi: 0, attract: false,
  fx: qs.get('fx') === 'mosaic' ? 'mosaic' : 'depth',
  busy: null,            // { id, verb, step, text, pct, cancel }
  confirm: null,         // app id awaiting a remove confirmation
  note: null,            // { id, text, bad } after a job: shown on the action row for a few seconds
  copied: 0,
  windows: /Windows/.test(navigator.userAgent),
  touch: matchMedia('(pointer: coarse)').matches,
};
let G = fitGrid(innerWidth, innerHeight);
let ui, live, atmo = null, lastMedia = null, mediaTimer = 0, noteTimer = 0;

const cats = () => rows(S.catalog ? S.catalog.apps : [], { device: S.ctx === 'device', states: S.states });
const curCat = () => { const c = cats(); return c[Math.min(S.ci, c.length - 1)]; };
const curApp = () => { const c = curCat(); return c && c.apps.length ? c.apps[Math.min(S.ti[c.id] || 0, c.apps.length - 1)] : null; };
const isSpecial = (a) => a && a.id.startsWith('@');
const stateOf = (a) => (S.states && S.states[a.id]) || null;

function installer() {
  const a = curApp();
  if (a && a.id === '@ps') return INSTALL.ps;
  if (a && a.id === '@sh') return INSTALL.sh;
  return S.windows ? INSTALL.ps : INSTALL.sh;
}

function mediaOf(a) {
  if (!a || isSpecial(a)) return [];
  return a.media.map((m) => {
    if (m.kind !== 'video' || !m.av1 || S.ctx === 'device') return m;   // the handheld plays H.264
    const v = document.createElement('video');
    return v.canPlayType('video/webm; codecs="av01.0.05M.08"') ? { ...m, src: m.av1 } : m;
  });
}

// ---- render ----
const cell = (x, y, w, h, cls, html, extra = '') => `<div class="c ${cls}" style="--x:${x};--y:${y};--w:${w};--h:${h}" ${extra}>${html}</div>`;
const pill = (k, cap, label, act) => `<span class="pill ${k}" data-act="${act}"><span class="cap ${k}">◖</span><span class="k">${cap}</span><span class="cap ${k}">◗</span><span class="l">${label}</span></span>`;

function badges(a) {
  const out = [];
  if (a.src === 'web') out.push(['WEB', 'web']);
  if (a.prerelease) out.push(['PRE', 'pre']);
  if (a.community) out.push(['COMMUNITY', 'comm']);
  if (a.private) out.push(['PRIVATE', 'priv']);
  if (S.ctx === 'device') {
    const st = stateOf(a);
    if (st && st.installed) {
      const v = st.installed !== '?' && a.src !== 'web' ? ` ${st.installed}` : '';
      if (st.state === 'update') out.push([`↻ UPDATE ${st.latest}`, 'upd']);
      else if (st.state === 'broken') out.push(['BROKEN', 'upd']);
      else out.push([`✓ INSTALLED${v}`, 'ok']);
    } else if (st && st.state === 'unknown') out.push([S.listing === 'checking' ? 'CHECKING…' : 'OFFLINE', 'gen']);
    else if (st && st.state === 'unavailable') out.push(['NOT RELEASED', 'gen']);
  } else if (a.release && a.release.unavailable) out.push(['NOT RELEASED', 'gen']);
  for (const t of a.tags || []) if (TAGS[t]) out.push(TAGS[t]);
  return out.map(([t, k]) => `<span class="badge b-${k}">${esc(t)}</span>`).join('');
}

function action(a, x, y, w, rows) {
  if (S.ctx === 'web' || !a || isSpecial(a)) {
    const line = installer();
    const need = line.length + 2 + 10 + 3;
    const lw = Math.min(w, need);
    // too narrow (phones): break before the pipe and put COPY on the second row
    const shown = need > w ? line.replace(' | ', '\n  | ') : line;
    const html = `<span class="p">$ </span>${esc(shown).replace('https://portmart.app', '<span class="u">https://portmart.app</span>')}<span class="copy" style="${need > w ? 'top:auto;bottom:0' : ''}">${S.copied ? 'COPIED ✓' : 'COPY ⏎'}</span>`;
    return cell(x, y, lw, need > w ? rows : 1, `cmd${S.copied ? ' copied' : ''}`, html, 'data-act="a" role="button" tabindex="0" aria-label="Copy the installer command"');
  }
  if (S.busy && S.busy.id === a.id) {
    const n = Math.max(8, Math.min(30, w - 40));
    const fill = Math.round((S.busy.pct / 100) * n);
    return cell(x, y, w, 1, 'progress', `${esc(S.busy.step.padEnd(9))} <span class="bar">${'█'.repeat(fill)}<i>${'░'.repeat(n - fill)}</i></span> ${String(Math.round(S.busy.pct)).padStart(3)}%  ${pill('b', 'B', 'CANCEL', 'b')}`);
  }
  if (S.note && S.note.id === a.id) return cell(x, y, w, 1, S.note.bad ? 'note bad' : 'note', esc(S.note.text));
  if (S.confirm === a.id) {
    return cell(x, y, w, 1, '', `<span class="warn">Remove ${esc(a.short)}?</span> saves stay  ${pill('a', 'A', 'REMOVE', 'a')}${pill('b', 'B', 'KEEP', 'b')}`);
  }
  const st = stateOf(a);
  const info = pill('y', 'Y', S.info ? 'LESS' : 'INFO', 'y');
  if (!st) return cell(x, y, w, 1, 'note', S.listing === 'checking' ? 'checking the handheld…' : `${info}`);
  if (st.state === 'unknown') return cell(x, y, w, 1, '', `${S.listing === 'checking' ? '<span class="dim">checking for releases…</span>  ' : pill('x', 'X', 'RETRY', 'x')}${info}`);
  if (st.state === 'unavailable' || st.state === 'unsupported') return cell(x, y, w, 1, '', `<span class="dim">${esc(st.reason || 'no release to install yet')}</span>  ${info}`);
  let main;
  if (st.state === 'available') main = a.src === 'web' ? pill('a', 'A', 'ADD TO PORTS', 'a') : pill('a', 'A', `GET${a.size_mb ? ` ${a.size_mb} MB` : ''}`, 'a');
  else if (st.state === 'update') main = pill('a', 'A', `UPDATE TO ${st.latest}`, 'a');
  else main = pill('a', 'A', st.state === 'broken' || st.installed === '?' ? 'REPAIR' : 'REINSTALL', 'a');
  const rm = st.installed ? pill('x', 'X', 'REMOVE', 'x') : '';
  return cell(x, y, w, 1, '', `${main}${rm}${info}`);
}

function infoPanel(a, x, y, w, h) {
  const iw = w - 5;
  const L = [];
  const kv = (k, v) => wrap(v, iw - 7).forEach((l, i) => L.push(`<span class="k">${(i ? '' : k).padEnd(7)}</span>${esc(l)}`));
  if (!a || isSpecial(a)) {
    L.push('<h2>GET PORTMART</h2>', '');
    wrap('portmart is an app store for ROCKNIX handhelds. It lives in EmulationStation\'s Ports menu and installs, updates and removes apps and ROMs from one catalog.', iw).forEach((l) => L.push(esc(l)));
    L.push('');
    wrap('Run the line on a computer on the same network as the handheld. It pairs over SSH once, installs portmart and adds it to Ports.', iw).forEach((l) => L.push(esc(l)));
    L.push('');
    kv('NEEDS', 'ROCKNIX with SSH on, same network');
    if (S.catalog && S.catalog.portmart) kv('LATEST', `portmart ${S.catalog.portmart.version}`);
    kv('APPS', `${S.catalog ? S.catalog.apps.filter((p) => !p.private).length : 0} in the public catalog`);
  } else {
    L.push(`<h2>${esc(a.name.toUpperCase())}</h2>`, `<span class="dim">by ${esc(a.author)}</span>`, '');
    wrap(a.blurb, iw).forEach((l) => L.push(esc(l)));
    L.push('');
    const needs = (a.tags || []).filter((t) => NEEDS[t]).map((t) => NEEDS[t]);
    if (a.size_mb) kv('SIZE', `${a.size_mb} MB`);
    kv('SOURCE', a.src === 'web' ? (a.url || 'web').replace(/^https:\/\//, '').replace(/\/$/, '')
      : a.private ? 'private release' : `github release${a.prerelease ? ' · prerelease' : ''}`);
    if (a.release && a.release.version) kv('LATEST', a.release.version);
    if (needs.length) kv('NEEDS', needs.join(', '));
    if (a.depends.length) kv('USES', a.depends.join(', '));
    if (S.ctx === 'device') {
      const st = stateOf(a);
      if (st) kv('STATE', st.state === 'available' ? 'not installed' : st.state === 'update' ? `${st.installed} → ${st.latest}`
        : st.installed ? `installed ${st.installed === '?' ? '(no update source)' : st.installed}` : st.state);
    }
    const m = mediaOf(a);
    if (m.length) {
      const cur = m[S.mi % m.length];
      L.push('', `<span class="k">MEDIA  </span><span class="dots">${m.map((_, i) => (i === S.mi % m.length ? '●' : '○')).join('')}</span> ${(S.mi % m.length) + 1}/${m.length}  <span class="dim">[ ] · L1 R1</span>`);
      if (cur.caption) wrap(cur.caption, iw).forEach((l) => L.push(`<span class="dim">${esc(l)}</span>`));
    }
    if (S.ctx === 'web') {
      L.push('');
      wrap(`On the handheld: Ports → portmart → ${CAT[a.category].label} → ${a.name}.`, iw).forEach((l) => L.push(`<span class="dim">${esc(l)}</span>`));
    }
  }
  return cell(x, y, w, h, 'info', L.slice(0, h).join('\n'), 'role="region" aria-label="Details"');
}

let lastAnnounce = '';
function announce(text) {
  if (text === lastAnnounce) return;
  lastAnnounce = text;
  live.textContent = text;
}

function render() {
  G = fitGrid(innerWidth, innerHeight);
  const { cols, rows: R, cw, portrait } = G;
  const root = document.documentElement.style;
  root.setProperty('--cw', `${cw}px`); root.setProperty('--ch', `${2 * cw}px`);
  ui.style.left = `${G.ox}px`; ui.style.top = `${G.oy}px`;
  const H = [];
  const L = layout(G, S.info);
  if (!S.catalog) {
    const msg = S.error ? `The catalog didn't load: ${S.error}` : 'loading the catalog…';
    H.push(cell(L.sx, L.metaY, cols - L.sx - L.mx, 1, 'meta', esc(msg)));
    if (S.error) H.push(cell(L.sx, L.actY, 30, 1, '', pill('a', 'A', 'TRY AGAIN', 'reload')));
    ui.innerHTML = H.join('');
    return;
  }
  const C = cats();
  S.ci = Math.min(S.ci, C.length - 1);
  const cat = C[S.ci];
  const a = curApp();
  const accent = CAT[cat.id].accent;
  accent.forEach((c, i) => root.setProperty(`--a${i}`, c));
  const { sx, tw, th, gap, fy, metaY, right } = L;
  const nameW = right - sx;

  // status: omp segments; the right side says where this runs, never anything invented
  const tail = a && !isSpecial(a) ? a.name : '';
  const used = 10 + CAT[cat.id].label.length + 2 + (tail ? tail.length + 2 : 0) + 2;
  const sw = cols - 2 * L.mx;
  const n = S.states ? Object.values(S.states).filter((s) => s.installed).length : 0;
  const rightText = (S.ctx === 'device'
    ? [`handheld · ${n} installed${S.listing === 'offline' ? ' · OFFLINE' : ''}`, `${n} installed`]
    : ['portmart.app']).find((t) => t.length <= sw - used) || '';
  H.push(cell(L.mx, L.statusY, sw, 1, 'status', `<span class="seg brand">portmart</span><span class="seg cat">${CAT[cat.id].label}</span><span class="seg tail">${esc(tail)}</span>${rightText ? `<span class="right">${esc(rightText)}</span>` : ''}`));

  // title: block glyphs; the PORTMART row shows the logo
  let nameTop = metaY;
  const titleGap = 0.5;
  if (a && isSpecial(a)) {
    const lr = logoRows();
    const pw = Math.max(...lr.map((r) => r.length));
    const scale = Math.min(cw, Math.floor((nameW * cw) / pw));
    const h = Math.ceil(lr.length / 2);
    nameTop = metaY - h - (portrait ? 0 : 1) - titleGap;
    H.push(cell(sx, nameTop, nameW, h, 'title', '<span data-logo></span>'));
  } else if (a) {
    const t = fitTitle(a.name, a.short, nameW, bigWidth);
    if (t) {
      const lh = 4 * t.k;
      nameTop = metaY - lh * t.lines.length - (t.k < 1 ? 0.5 : 0) - titleGap;
      t.lines.forEach((l, i) => H.push(cell(sx, nameTop + lh * i, nameW, lh, 'title', `<span data-big="${esc(l)}" data-k="${t.k}" data-name="${i ? '' : esc(a.name)}"></span>`)));
    } else {
      nameTop = metaY - 1 - titleGap;
      H.push(cell(sx, nameTop, nameW, 1, 'meta', `<b>${esc(a.name)}</b>`));
    }
  }

  // meta line
  if (a && !isSpecial(a)) {
    const pos = `${(S.ti[cat.id] || 0) + 1}/${cat.apps.length}`;
    H.push(cell(sx, metaY, nameW, 1, 'meta fade', `<b>${esc(a.author)}</b>  ${badges(a)}<span>${pos}</span>`));
  } else if (a) {
    const ver = S.catalog.portmart ? `<span class="badge b-gen">v${esc(S.catalog.portmart.version)}</span>` : '';
    H.push(cell(sx, metaY, nameW, 1, 'meta fade', `<b>App store for ROCKNIX handhelds</b>  <span class="badge b-gen">${S.catalog.apps.filter((p) => !p.private).length} APPS</span>${ver}<span class="badge b-net">GPL-2.0</span>`));
  } else if (cat.id === 'installed') {
    H.push(cell(sx, metaY, nameW, 1, 'meta', S.states ? 'Nothing installed yet: ↓ to browse the catalog' : 'checking the handheld…'));
  }

  // category spine (vertical axis)
  if (!portrait) {
    C.forEach((c, i) => {
      const d = i - S.ci;
      const y = L.catY + d * 2;
      if (y < L.statusY + 2 || y > L.hintsY - 2) return;
      const cls = d === 0 ? 'focus' : Math.abs(d) > 1 ? 'far' : '';
      H.push(cell(L.railX, y, L.railW, 1, `cat-item ${cls}${d ? ' fade' : ''}`, `${d === 0 ? '<span class="mark">▶</span>' : ' '}${CAT[c.id].label}`, `data-cat="${i}" role="button" aria-label="${CAT[c.id].label}"`));
    });
  } else {
    const prev = C[S.ci - 1], next = C[S.ci + 1];
    if (prev) H.push(cell(sx, L.prevY, cols - 2 * sx, 1, 'cat-item far fade', `▲ ${CAT[prev.id].label}`, `data-cat="${S.ci - 1}"`));
    if (next) H.push(cell(sx, L.nextY, cols - 2 * sx, 1, 'cat-item far fade', `▼ ${CAT[next.id].label}`, `data-cat="${S.ci + 1}"`));
    H.push(cell(right - CAT[cat.id].label.length - 1, L.prevY, CAT[cat.id].label.length + 1, 1, 'cat-item focus', `<span class="mark">▶</span>${CAT[cat.id].label}`));
  }

  // title strip (horizontal axis): the focused title holds the first slot; near the end the window stops and
  // the focus walks right, so the strip never runs half empty
  const ti = Math.min(S.ti[cat.id] || 0, Math.max(0, cat.apps.length - 1));
  const slots = Math.max(1, Math.floor((right + 1 - sx + gap) / (tw + gap)));
  const start = Math.min(ti, Math.max(0, cat.apps.length - slots));
  for (let i = start, x = sx; i < cat.apps.length && x + tw <= right + 1; i++, x += tw + gap) {
    const t = cat.apps[i];
    const k = i - ti;
    const st = S.ctx === 'device' && !isSpecial(t) ? stateOf(t) : null;
    const mark = st && st.state === 'update' ? '<span class="st b-upd">↻</span>' : st && st.installed ? '<span class="st b-ok">✓</span>' : '';
    const img = isSpecial(t)
      ? `<span data-tilelogo="${t.id}"></span><span class="st tl">${t.short}</span>`
      : t.icon ? `<img src="${esc(t.icon)}" alt="" crossorigin="anonymous" draggable="false">` : '';
    H.push(cell(x, fy, tw, th, `tile${k === 0 ? ' focus' : ' dim fade'}`, `${img}${mark}`, `data-tile="${i}" role="button" aria-label="${esc(t.name)}"`));
  }

  // blurb: a reading measure, not the full width
  const blurb = a && isSpecial(a)
    ? (S.windows && a.id !== '@sh') || a.id === '@ps'
      ? 'PowerShell on Windows. Pairs with the handheld over SSH once and installs portmart into Ports.'
      : 'One line in a terminal on macOS or Linux. Pairs with the handheld over SSH once and installs portmart into Ports.'
    : a ? a.blurb : '';
  const bl = wrap(blurb, L.blurbW).slice(0, L.blurbRows);
  H.push(cell(sx, L.blurbY, L.blurbW, bl.length, 'blurb fade', esc(bl.join('\n'))));

  if (a || S.ctx === 'web') H.push(action(a, sx, L.actY, L.actW, L.actRows));

  // media label: placeholder or early-build marking, never colour alone
  const media = mediaOf(a);
  const m = media.length ? media[S.mi % media.length] : null;
  if (m && m.label) {
    const lw = Math.ceil(m.label.length * 0.62) + 1;
    H.push(cell((S.info && !portrait ? L.info.x - 1 : cols - L.mx) - lw, L.labelY, lw, 1, 'medialabel', esc(m.label)));
  }

  if (S.info) H.push(infoPanel(a, L.info.x, L.info.y, L.info.w, portrait ? Math.max(6, Math.floor(nameTop) - L.info.y - 1) : L.info.h));

  const hints = S.ctx === 'device'
    ? `${pill('n', '↕', 'CATEGORY', 'none')}${pill('n', '↔', 'TITLES', 'none')}${pill('a', 'A', 'SELECT', 'a')}${pill('y', 'Y', 'INFO', 'y')}${pill('b', 'B', S.ci === 0 && !S.info && !S.confirm ? 'QUIT' : 'BACK', 'b')}${pill('n', 'START', 'TERMINAL', 'start')}`
    : S.touch
      ? (portrait
        ? '<span class="h"><kbd>SWIPE</kbd> ↕↔ browse</span><span class="h"><kbd>TAP</kbd> copy</span><kbd>HOLD</kbd> info'
        : '<span class="h"><kbd>SWIPE ↕</kbd> category</span><span class="h"><kbd>↔</kbd> titles</span><span class="h"><kbd>TAP</kbd> copy</span><span class="h"><kbd>HOLD</kbd> info</span>')
      : '<span class="h"><kbd>↑↓</kbd> category</span><span class="h"><kbd>←→</kbd> titles</span><span class="h"><kbd>SPACE</kbd> info</span><span class="h"><kbd>ENTER</kbd> copy</span><span class="h"><kbd>ESC</kbd> back</span>';
  H.push(cell(L.mx, L.hintsY, cols - 2 * L.mx, 1, 'hints fade', hints));

  ui.innerHTML = H.join('');
  root.setProperty('--scrim-rows', String(R - nameTop + 2));
  root.setProperty('--scrim-cols', String(L.scrimCols));

  for (const el of ui.querySelectorAll('[data-big]')) {
    el.replaceWith(pixelCanvas(bigRows(el.dataset.big), cw * +el.dataset.k, (x, y, ch, w) => grad(accent, x / Math.max(1, w - 1)), el.dataset.name));
  }
  const logo = ui.querySelector('[data-logo]');
  if (logo) {
    const lr = logoRows();
    const pw = Math.max(...lr.map((r) => r.length));
    logo.replaceWith(pixelCanvas(lr, Math.min(cw, Math.floor((nameW * cw) / pw)), cartColor(0), 'portmart'));
  }
  for (const el of ui.querySelectorAll('[data-tilelogo]')) {
    const scale = (tw * cw) / 18;
    const cv = pixelCanvas(CART, scale, cartColor(el.dataset.tilelogo === '@ps' ? 0.6 : 0));
    cv.style.margin = `${scale}px`;
    el.replaceWith(cv);
  }

  announce(a ? `${CAT[cat.id].label}: ${isSpecial(a) ? `get portmart, ${a.name}` : `${a.name}, by ${a.author}`}` : CAT[cat.id].label);

  if (atmo) {
    atmo.setAccent(accent);
    atmo.setFx(S.fx);
    atmo.setLayout({ cell: cw, focalY: G.oy + (fy + th / 2) * G.ch, dim: S.info ? 1 : 0 });
    const key = m ? m.src : a ? a.id : '';
    if (key !== lastMedia) { lastMedia = key; atmo.setMedia(m || null); }
  }
}

// ---- actions ----
function resetMediaClock() {
  clearTimeout(mediaTimer);
  const m = mediaOf(curApp());
  if (m.length < 2) return;
  mediaTimer = setTimeout(() => { S.mi = (S.mi + 1) % m.length; render(); resetMediaClock(); }, m[S.mi % m.length].kind === 'video' ? 10200 : 6000);
}

function move(dc, dt) {
  const C = cats();
  S.confirm = null;
  if (dc) S.ci = Math.max(0, Math.min(C.length - 1, S.ci + dc));
  if (dt) { const c = C[S.ci]; S.ti[c.id] = Math.max(0, Math.min(c.apps.length - 1, (S.ti[c.id] || 0) + dt)); }
  S.mi = 0;
  render(); resetMediaClock();
}

function note(id, text, bad) {
  clearTimeout(noteTimer);
  S.note = { id, text, bad };
  noteTimer = setTimeout(() => { S.note = null; render(); }, 4000);
}

async function refresh() {
  S.listing = 'checking';
  render();
  try {
    S.states = await S.engine.list();
    S.listing = 'idle';
  } catch {
    S.listing = 'offline';
  }
  render();
}

// install | update | remove through the engine; progress from @step / @progress (CONTRACT)
async function job(a, verb) {
  const busy = { id: a.id, verb, step: verb, pct: 0, cancel: null };
  S.busy = busy;
  render();
  const run = S.engine.run([verb, a.id], (ev) => {
    if (ev.kind === 'step' && ev.state === 'active') { busy.step = ev.key.replace(/^.*:/, ''); busy.pct = 0; }
    else if (ev.kind === 'progress' && ev.total > 0) busy.pct = Math.min(100, (100 * ev.done) / ev.total);
    render();
  });
  busy.cancel = run.cancel;
  const r = await run.done;
  S.busy = null;
  if (r.exit === 0) note(a.id, verb === 'remove' ? `${a.short} removed; saves stay` : `${a.short} is in Ports`, false);
  else note(a.id, r.error, true);
  try { S.states = await S.engine.list(true); } catch { /* keep the last states */ }
  render();
  refresh();
}

async function press(btn) {
  const a = curApp();
  if (btn === 'reload') { location.reload(); return; }
  if (btn === 'y') { S.info = !S.info; render(); return; }
  if (btn === 'l1' || btn === 'r1') {
    const m = mediaOf(a);
    if (m.length) { S.mi = (S.mi + (btn === 'r1' ? 1 : m.length - 1)) % m.length; render(); resetMediaClock(); }
    return;
  }
  if (btn === 'b') {
    if (S.busy && S.busy.cancel) { S.busy.cancel(); return; }
    if (S.confirm) S.confirm = null;
    else if (S.info) S.info = false;
    else if (S.ci !== 0) S.ci = 0;
    else if (S.engine) { S.engine.exit(); return; }       // the top row: B leaves, as in the TUI
    render(); return;
  }
  if (btn === 'start') {                                   // the terminal store, this time (CONTRACT R13)
    if (S.engine && !S.busy) S.engine.exit('tui');
    return;
  }
  if (S.busy || !a) return;
  if (btn === 'a') {
    if (S.ctx === 'web' || isSpecial(a)) {
      try { await navigator.clipboard.writeText(installer()); } catch { /* clipboard blocked: the line is on screen */ }
      S.copied = 1; render();
      setTimeout(() => { S.copied = 0; render(); }, 1600);
      return;
    }
    if (S.confirm === a.id) { S.confirm = null; job(a, 'remove'); return; }
    const st = stateOf(a);
    if (!st || ['unknown', 'unavailable', 'unsupported'].includes(st.state)) return;
    job(a, st.state === 'update' ? 'update' : 'install');
    return;
  }
  if (btn === 'x' && S.ctx === 'device' && !isSpecial(a)) {
    const st = stateOf(a);
    if (st && st.state === 'unknown') { refresh(); return; }
    if (st && st.installed) { S.confirm = a.id; render(); }
  }
}

// ---- input: keys, pad, touch, pointer ----
let idle = 0;
function wake() {
  clearTimeout(idle);
  if (S.attract) { S.attract = false; document.body.classList.remove('attract'); }
  idle = setTimeout(() => { if (!S.busy && !S.info) { S.attract = true; document.body.classList.add('attract'); } }, 12000);
}

function bindInput() {
  addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const map = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    const btn = { Enter: 'a', ' ': 'y', Escape: 'b', Backspace: 'b', x: 'x', y: 'y', '[': 'l1', ']': 'r1', s: 'start' }[e.key];
    if (!map[e.key] && !btn) return;
    e.preventDefault();
    const was = S.attract;
    wake();
    if (was) return;
    if (map[e.key]) move(...map[e.key]); else press(btn);
  });

  // standard-mapping gamepad, Nintendo face labels (Flip 2): east = A, south = B, north = X, west = Y
  const PAD = { 1: 'a', 0: 'b', 3: 'x', 2: 'y', 4: 'l1', 5: 'r1', 9: 'start' };
  const DIRS = { 12: [-1, 0], 13: [1, 0], 14: [0, -1], 15: [0, 1] };
  // seeded with every button still down at start (the press that skipped the intro), so a held button only
  // acts once it is released and pressed again
  const held = {};
  for (const gp of navigator.getGamepads ? navigator.getGamepads() : []) {
    if (gp) gp.buttons.forEach((b, i) => { if (b.pressed) held[`b${i}`] = true; });
  }
  const pollPad = (now) => {
    requestAnimationFrame(pollPad);
    for (const gp of navigator.getGamepads ? navigator.getGamepads() : []) {
      if (!gp) continue;
      const ax = gp.axes || [];
      const stick = { 12: ax[1] < -0.6, 13: ax[1] > 0.6, 14: ax[0] < -0.6, 15: ax[0] > 0.6 };
      for (const [i, b] of Object.entries(PAD)) {
        const p = gp.buttons[i] && gp.buttons[i].pressed;
        if (p && !held[`b${i}`]) { const was = S.attract; wake(); if (!was) press(b); }
        held[`b${i}`] = p;
      }
      for (const [i, d] of Object.entries(DIRS)) {
        const p = (gp.buttons[i] && gp.buttons[i].pressed) || stick[i];
        const h = held[`d${i}`];
        if (p && (!h || now > h)) { const was = S.attract; wake(); if (!was) move(...d); held[`d${i}`] = now + (h ? 90 : 320); }
        if (!p) held[`d${i}`] = 0;
      }
    }
  };
  requestAnimationFrame(pollPad);

  let touch = null, swallow = false;
  addEventListener('pointerdown', (e) => {
    touch = { x: e.clientX, y: e.clientY, lp: setTimeout(() => { swallow = true; wake(); press('y'); }, 520) };
  });
  addEventListener('pointermove', (e) => {
    if (touch && Math.hypot(e.clientX - touch.x, e.clientY - touch.y) > 12) clearTimeout(touch.lp);
  });
  addEventListener('pointerup', (e) => {
    if (!touch) return;
    clearTimeout(touch.lp);
    const dx = e.clientX - touch.x, dy = e.clientY - touch.y;
    const th = Math.max(28, G.cw * 2);
    touch = null;
    if (Math.abs(dx) < th && Math.abs(dy) < th) return;
    swallow = true; wake();
    // content follows the finger: swipe left brings the next title, swipe up the next category
    if (Math.abs(dx) > Math.abs(dy)) move(0, dx < 0 ? 1 : -1); else move(dy < 0 ? 1 : -1, 0);
  });
  ui.addEventListener('click', (e) => {
    if (swallow) { swallow = false; return; }
    const was = S.attract; wake(); if (was) return;
    const tile = e.target.closest('[data-tile]');
    if (tile) { const i = +tile.dataset.tile; const c = curCat(); if (i === (S.ti[c.id] || 0)) press('a'); else move(0, i - (S.ti[c.id] || 0)); return; }
    const c = e.target.closest('[data-cat]');
    if (c) { move(+c.dataset.cat - S.ci, 0); return; }
    const act = e.target.closest('[data-act]');
    if (act && act.dataset.act !== 'none') press(act.dataset.act);
  });
}

// Starts the XMB under the splash: the catalog loads (and, on the handheld, the engine lists) while the intro
// plays. Input binds later, in enableInput(), once the splash is gone.
export async function start() {
  ui = document.getElementById('ui');
  live = document.getElementById('live');
  const bind = binding();
  if (bind) { S.ctx = 'device'; S.engine = new Engine(bind); S.engine.hello(); }
  document.body.classList.toggle('device', S.ctx === 'device');
  addEventListener('resize', render);
  render();
  createAtmosphere(document.getElementById('atmo'), { fps: +qs.get('fps') || (S.ctx === 'device' ? 30 : 60), gpu: qs.get('gpu') !== '0' })
    .then((x) => { atmo = x; lastMedia = null; render(); });
  try {
    S.catalog = await load();
  } catch (e) {
    S.error = e.message;
    render();
    // the handheld with no catalog (offline, nothing cached): the terminal store has a bundled one
    if (S.engine) setTimeout(() => S.engine.exit('tui'), 2500);
    return;
  }
  if (S.ctx === 'device') {
    try { S.states = await S.engine.list(true); } catch { /* the network list below decides */ }
    render();
    // the TUI's startup order (CONTRACT R8): sync, then the network list
    S.engine.run(['sync']).done.then(refresh);
  }
  render(); resetMediaClock();
}

export function enableInput() {
  bindInput();
  wake();
}
