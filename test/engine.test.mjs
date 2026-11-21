// src/xmb/engine.js against the app: parse_event / friendly_error parity, and fake-engine line streams replayed
// through a stand-in for the bridge (test/engine-fixtures.json, recorded by tools/engine_fixtures.py).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { EVENT, Engine, binding, friendlyError, parseEvent } from '../src/xmb/engine.js';

const FX = JSON.parse(fs.readFileSync(new URL('./engine-fixtures.json', import.meta.url), 'utf8'));

// ui/data.py's tuples, as engine.js names their fields
function fromPython(t) {
  if (t === null) return null;
  const [kind, ...v] = t;
  const names = { step: ['key', 'state', 'text'], progress: ['key', 'done', 'total'], done: ['what', 'value'],
    error: ['key', 'msg'], log: ['text'], auth: ['code', 'uri', 'expires'] }[kind];
  return Object.fromEntries([['kind', kind], ...names.map((n, i) => [n, v[i]])]);
}

test('parseEvent reads every line as ui/data.py parse_event does', () => {
  for (const [line, want] of FX.parse) assert.deepEqual(parseEvent(line), fromPython(want), JSON.stringify(line));
});

test('friendlyError words errors as ui/data.py friendly_error does', () => {
  for (const [key, msg, rc, want] of FX.friendly) assert.equal(friendlyError(key, msg, rc), want, JSON.stringify([key, msg, rc]));
});

// The bridge: each run request answers with the recorded lines of a scenario, then its exit, asynchronously.
function bridge(answer) {
  const target = new EventTarget();
  const sent = [];
  const bind = (json) => {
    const req = JSON.parse(json);
    sent.push(req);
    if (req.op !== 'run') return;
    const sc = answer(req.argv);
    setTimeout(() => {
      if (sc.rejected) { target.dispatchEvent(new CustomEvent(EVENT, { detail: { id: req.id, rejected: 'argv' } })); return; }
      for (const line of sc.lines) target.dispatchEvent(new CustomEvent(EVENT, { detail: { id: req.id, line } }));
      target.dispatchEvent(new CustomEvent(EVENT, { detail: { id: req.id, exit: sc.exit } }));
    }, 0);
  };
  return { engine: new Engine(bind, target), sent, target };
}

test('list parses the JSON rows by id', async () => {
  const { engine } = bridge(() => FX.scenarios.list);
  const states = await engine.list();
  const rows = JSON.parse(FX.scenarios.list.lines[0]);
  assert.deepEqual(Object.keys(states).sort(), rows.map((r) => r.id).sort());
  assert.equal(states.talkbox.state, 'available');
});

test('an install streams steps and progress, then exits 0 with no error', async () => {
  const { engine } = bridge(() => FX.scenarios.install);
  const events = [];
  const r = await engine.run(['install', 'talkbox'], (e) => events.push(e)).done;
  assert.equal(r.exit, 0);
  assert.equal(r.error, null);
  const progress = events.filter((e) => e.kind === 'progress');
  assert.ok(progress.length > 0 && progress.every((p) => p.total > 0 && p.done <= p.total));
  assert.ok(events.some((e) => e.kind === 'step' && e.key === 'download' && e.state === 'active'));
  assert.deepEqual(events.at(-1), { kind: 'done', what: 'talkbox', value: '1.1' });
});

test('a failed install carries the engine error, worded as the TUI does', async () => {
  const { engine } = bridge(() => FX.scenarios.fail);
  const r = await engine.run(['install', 'talkbox']).done;
  const err = FX.scenarios.fail.lines.map(parseEvent).find((e) => e && e.kind === 'error');
  assert.equal(r.exit, 1);
  assert.equal(r.error, friendlyError(err.key, err.msg, 1));
  assert.match(r.error, /sha256 mismatch/);
});

test('concurrent jobs keep their own lines', async () => {
  const { engine } = bridge((argv) => (argv[0] === 'remove' ? FX.scenarios.remove : FX.scenarios.install));
  const [a, b] = await Promise.all([engine.run(['install', 'talkbox']).done, engine.run(['remove', 'talkbox']).done]);
  assert.deepEqual(a.lines, FX.scenarios.install.lines);
  assert.deepEqual(b.lines, FX.scenarios.remove.lines);
});

test('a refused request resolves with no exit and says so', async () => {
  const { engine } = bridge(() => ({ rejected: true }));
  const r = await engine.run(['remove', 'talkbox', '--purge']).done;
  assert.equal(r.exit, null);
  assert.equal(r.rejected, 'argv');
  assert.ok(r.error);
});

test('cancel sends the cancel op for that job; a list failure throws its friendly error', async () => {
  const { engine, sent } = bridge(() => ({ lines: ['@error cancel'], exit: 130 }));
  const job = engine.run(['install', 'talkbox']);
  job.cancel();
  assert.deepEqual(sent.at(-1), { op: 'cancel', id: job.id });
  assert.equal((await job.done).error, 'cancelled; nothing was changed');
  await assert.rejects(engine.list(), /cancelled/);
});

test('binding() is the capability check: only a bound function counts', () => {
  assert.equal(binding({}), null);
  assert.equal(binding({ portmartEngine: 'x' }), null);
  const f = () => {};
  assert.equal(binding({ portmartEngine: f }), f);
});
