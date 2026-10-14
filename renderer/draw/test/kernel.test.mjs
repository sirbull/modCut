import assert from 'node:assert/strict';
import test from 'node:test';
import { Worker } from 'node:worker_threads';
import { createGeometryKernel, GeometryKernel } from '../geom/kernel.mjs';
import { BACKEND, flattenPath, unite, validatePath } from '../geom/kernel-js.mjs';
import { handleRequest } from '../geom/kernel-worker.mjs';
import { DrawDocument } from '../doc/document.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const segment = (p, input = [0, 0], output = [0, 0]) => ({ p, in: input, out: output });
const rect = (x = 0, y = 0, w = 10, h = 10, reverse = false) => {
  const points = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  return [{ closed: true, segments: (reverse ? points.reverse() : points).map((p) => segment(p)) }];
};
const signedArea = (path) => path.reduce((sum, ring) => sum + ring.segments.reduce((area, s, i, all) => {
  const p = all[(i + 1) % all.length].p; return area + s.p[0] * p[1] - p[0] * s.p[1];
}, 0) / 2, 0);
const area = (paths) => Math.abs(paths.reduce((sum, path) => sum + signedArea(path), 0));
function actualWorker() {
  const worker = new Worker(new URL('./fixtures/node-kernel-worker.mjs', import.meta.url));
  return {
    addEventListener(type, callback) { worker.on(type, type === 'message' ? (data) => callback({ data }) : callback); },
    postMessage(data) { worker.postMessage(data); }, terminate() { return worker.terminate(); },
  };
}
function fakeWorker({ startup = true, delay = 0, never = false, invalid = false, crash = false, handshake = BACKEND } = {}) {
  const listeners = {}, worker = {
    stopped: false, messages: [],
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    emit(type, value) { for (const fn of listeners[type] || []) fn(type === 'message' ? { data: value } : value); },
    postMessage(message) {
      worker.messages.push(message);
      if (never) return;
      setTimeout(async () => {
        if (crash) worker.emit('error', { message: 'crashed' });
        else if (invalid) worker.emit('message', { id: message.id, type: 'wrong' });
        else worker.emit('message', await handleRequest(message));
      }, delay);
    },
    terminate() { worker.stopped = true; },
  };
  if (startup) queueMicrotask(() => worker.emit('message', { type: 'ready', backend: handshake }));
  return worker;
}
const kernelWith = (factory, options = {}) => createGeometryKernel({ workerFactory: factory, logger() {}, ...options });

test('adaptive flatten preserves endpoints, closure and curves within the requested tolerance', () => {
  const curve = [{ closed: false, segments: [segment([0, 0], [0, 0], [0, 10]), segment([10, 0], [0, 10])] }];
  const initial = JSON.stringify(curve), tolerance = .001, [{ points }] = flattenPath(curve, tolerance);
  assert.deepEqual(points[0], [0, 0]); assert.deepEqual(points.at(-1), [10, 0]); assert.ok(points.length > 10);
  function distance(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
  }
  for (let i = 0; i <= 1000; i++) {
    const t = i / 1000, u = 1 - t, p = [30 * u * t * t + 10 * t ** 3, 30 * u * u * t + 30 * u * t * t];
    assert.ok(Math.min(...points.slice(1).map((b, i) => distance(p, points[i], b))) <= tolerance);
  }
  assert.equal(JSON.stringify(curve), initial);
  assert.deepEqual(flattenPath(rect())[0], { closed: true, points: [[0, 0], [10, 0], [10, 10], [0, 10]] });
  assert.deepEqual(flattenPath([{ closed: false, segments: [] }]), [{ closed: false, points: [] }]);
  assert.deepEqual(flattenPath([{ closed: false, segments: [segment([3, 4])] }])[0].points, [[3, 4]]);
  const overshoot = [{ closed: false, segments: [segment([0, 0], [0, 0], [20, 0]), segment([1, 0], [-20, 0])] }];
  assert.ok(flattenPath(overshoot)[0].points.length > 2, 'collinear backtracking controls must not flatten to a single segment');
  const loop = [{ closed: true, segments: [segment([0, 0], [-5, 0], [5, 10])] }];
  assert.ok(flattenPath(loop)[0].points.length > 2);
});

test('flatten rejects invalid data, unsafe coordinates and impossible subdivision', () => {
  for (const input of [null, {}, [null], [{ closed: 1, segments: [] }], [{ closed: true, segments: [null] }],
    [{ closed: true, segments: [segment([NaN, 0])] }], [{ closed: true, segments: [segment([0, Infinity])] }],
    [{ closed: true, segments: [segment([1e6, 0], [0, 0], [1, 0])] }],
    [{ closed: true, segments: [segment([0, 0], [0, 0], ['1', 0])] }]]) assert.throws(() => flattenPath(input), { code: 'INVALID_GEOMETRY' });
  for (const tolerance of [NaN, Infinity, 0, -1, '1']) assert.throws(() => flattenPath(rect(), tolerance));
  const curve = [{ closed: false, segments: [segment([0, 0], [0, 0], [0, 10]), segment([10, 0], [0, 10])] }];
  assert.throws(() => flattenPath(curve, 1e-30), { code: 'GEOMETRY_LIMIT' });
  assert.equal(validatePath(rect()), 4);
});

test('union handles overlap, holes, winding, implicit closure and empty geometry deterministically', async () => {
  const inputs = [rect(), rect(5, 0)], before = JSON.stringify(inputs);
  const result = await unite(inputs);
  assert.equal(area(result), 150); assert.equal(JSON.stringify(inputs), before);
  assert.deepEqual(await unite(inputs), result);
  assert.equal(area(await unite([rect(), rect(5, 0, 10, 10, true)])), 150, 'operand windings cannot cancel their overlap');
  assert.equal(area(await unite([rect(), rect(10, 0)])), 200);
  assert.equal(area(await unite([rect(), rect(10, 10)])), 200);
  assert.equal(area(await unite([rect(), rect(20, 0)])), 200);
  assert.equal(area(await unite([rect(), rect()])), 100);
  const donut = [...rect(0, 0, 20, 20), ...rect(5, 5, 10, 10, true)];
  assert.equal(area(await unite([donut])), 300);
  assert.equal(area(await unite([donut, rect(5, 5)])), 400);
  const sameWinding = [...rect(0, 0, 20, 20), ...rect(5, 5)];
  assert.equal(area(await unite([sameWinding], { fillRule: 'evenodd' })), 300);
  assert.equal(area(await unite([sameWinding])), 400);
  const open = rect(); open[0].closed = false;
  assert.equal(area(await unite([open])), 100);
  assert.deepEqual(await unite([]), []); assert.deepEqual(await unite([[]]), []);
  assert.deepEqual(await unite([[{ closed: true, segments: [segment([0, 0]), segment([1, 1])] }]]), []);
  assert.ok(result.flat(2).every((ring) => ring.closed && ring.segments.every((s) => s.in.every((v) => v === 0) && s.out.every((v) => v === 0))));
  for (const args of [[null], [[rect()], { fillRule: 'bad' }], [[rect()], { tolerance: .1 }], [[rect()], { tolerance: 1e-9 }]]) await assert.rejects(unite(...args), { code: 'INVALID_GEOMETRY' });
});

test('real Node worker runs the production dispatcher with isolated input and structured errors', async (t) => {
  const logs = [], kernel = kernelWith(actualWorker, { logger: (message) => logs.push(message) });
  t.after(() => kernel.dispose());
  const path = rect(), pending = kernel.flatten(path); path[0].segments[0].p[0] = 999;
  assert.deepEqual((await pending)[0].points[0], [0, 0]);
  assert.equal(kernel.backend.name, 'js'); assert.equal(kernel.backend.approximate, true);
  assert.ok(Object.isFrozen(kernel.backend.capabilities));
  assert.equal(area(await kernel.boolean('unite', [rect(), rect(5, 0)])), 150);
  const doc = new DrawDocument(), original = doc.serialize();
  await assert.rejects(kernel.flatten([{ closed: true, segments: [segment([Infinity, 0])] }]), { code: 'INVALID_GEOMETRY' });
  const operations = [kernel.boolean('divide', []), kernel.offset([], 1, 'round', 4), kernel.outlineStroke([], {}),
    kernel.simplify([], .1, {}), kernel.smooth([], .5), kernel.trace({}, {}), kernel.shapeText({}, {}), kernel.writePdf([], {}), kernel.writeEps([], {})];
  for (const operation of operations) await assert.rejects(operation, { code: 'NOT_IMPLEMENTED' });
  assert.equal(doc.serialize(), original); assert.equal(logs.length, 1);
  assert.equal(area(await kernel.boolean('unite', [rect()])), 100);
});

test('dispatcher rejects malformed messages and never exposes exception stacks', async () => {
  for (const message of [null, {}, { type: 'request', id: -1, method: 'flatten', params: {} }]) {
    const result = await handleRequest(message); assert.equal(result.error.code, 'INVALID_REQUEST'); assert.equal(result.error.stack, undefined);
  }
});

test('cancellation terminates active work, ignores late replies and continues queued work', async (t) => {
  const workers = [], log = [], kernel = kernelWith(() => { const w = fakeWorker({ delay: workers.length ? 0 : 30 }); workers.push(w); return w; }, { logger: (m) => log.push(m) });
  t.after(() => kernel.dispose());
  const controller = new AbortController(), first = kernel.flatten(rect(), .001, { signal: controller.signal });
  const failed = assert.rejects(first, { name: 'AbortError', code: 'ABORTED' });
  const second = kernel.flatten(rect(20, 0)); await sleep(5); controller.abort();
  await failed; assert.equal(workers[0].stopped, true);
  assert.equal((await second)[0].points[0][0], 20); await sleep(40);
  assert.equal(log.length, 1); assert.equal(workers.length, 2);
  const pre = new AbortController(); pre.abort();
  await assert.rejects(kernel.flatten(rect(), .001, { signal: pre.signal }), { code: 'ABORTED' });
});

test('cancelling a queued request leaves active work intact', async (t) => {
  const worker = fakeWorker({ delay: 25 }), kernel = kernelWith(() => worker); t.after(() => kernel.dispose());
  const first = kernel.flatten(rect()), controller = new AbortController();
  const second = kernel.flatten(rect(), .001, { signal: controller.signal });
  const failed = assert.rejects(second, { code: 'ABORTED' });
  await sleep(5); controller.abort(); await failed; await first;
  assert.equal(worker.stopped, false); assert.equal(worker.messages.length, 1);
});

test('timeout recovers from both unresponsive computation and failed startup', async (t) => {
  for (const startup of [true, false]) {
    let calls = 0;
    const kernel = kernelWith(() => fakeWorker(calls++ ? {} : { startup, never: true }), { timeoutMs: 35 });
    t.after(() => kernel.dispose());
    await assert.rejects(kernel.flatten(rect()), { code: 'TIMEOUT' });
    assert.equal((await kernel.flatten(rect()))[0].closed, true);
    assert.equal(calls, 2);
  }
});

test('busy state appears only after delay and clears after success, error or abort', async (t) => {
  const events = [], kernel = kernelWith(() => fakeWorker({ delay: 25 }), { busyDelayMs: 5, onBusyChange: (event) => events.push(event) });
  t.after(() => kernel.dispose());
  await kernel.flatten(rect()); assert.deepEqual(events.map((e) => e.busy), [true, false]);
  await assert.rejects(kernel.flatten(null)); assert.deepEqual(events.map((e) => e.busy), [true, false, true, false]);
  const controller = new AbortController(), pending = kernel.flatten(rect(), .001, { signal: controller.signal });
  const failed = assert.rejects(pending); await sleep(10); controller.abort(); await failed;
  assert.deepEqual(events.slice(-2).map((e) => e.busy), [true, false]);
  const fast = kernelWith(() => fakeWorker(), { busyDelayMs: 50, onBusyChange() { throw new Error('observer'); } });
  t.after(() => fast.dispose()); await fast.flatten(rect());
});

test('crashes and protocol errors reject pending requests, then a new call restarts the worker', async (t) => {
  for (const failure of [{ crash: true }, { invalid: true }, { handshake: { name: 'wasm' } }]) {
    let calls = 0;
    const kernel = kernelWith(() => fakeWorker(calls++ ? {} : failure)); t.after(() => kernel.dispose());
    const first = assert.rejects(kernel.flatten(rect())), second = assert.rejects(kernel.flatten(rect()));
    await Promise.all([first, second]); assert.equal((await kernel.flatten(rect()))[0].closed, true);
  }
});

test('dispose rejects all pending calls and does not start another worker', async () => {
  const worker = fakeWorker({ never: true }), kernel = kernelWith(() => worker);
  const first = assert.rejects(kernel.flatten(rect()), { code: 'DISPOSED' }), second = assert.rejects(kernel.flatten(rect()), { code: 'DISPOSED' });
  kernel.dispose(); await Promise.all([first, second]); kernel.dispose(); assert.equal(worker.stopped, true);
  await assert.rejects(kernel.flatten(rect()), { code: 'DISPOSED' });
});

test('factory, clone and timer failures are actionable', async (t) => {
  assert.throws(() => new GeometryKernel({ timeoutMs: -1 }), TypeError);
  assert.throws(() => new GeometryKernel({ busyDelayMs: NaN }), TypeError);
  const broken = kernelWith(() => { throw new Error('unavailable'); }); t.after(() => broken.dispose());
  await assert.rejects(broken.flatten(rect()), { code: 'WORKER_UNAVAILABLE' });
  const kernel = kernelWith(() => fakeWorker()); t.after(() => kernel.dispose());
  await assert.rejects(kernel.flatten(() => {}), { code: 'INVALID_REQUEST' });
});

test('postMessage failure and message decoding failure allow clean worker replacement', async (t) => {
  for (const failure of ['send', 'decode']) {
    let calls = 0;
    const kernel = kernelWith(() => {
      const worker = fakeWorker();
      if (calls++ === 0) worker.postMessage = () => {
        if (failure === 'send') throw new Error('closed worker');
        queueMicrotask(() => worker.emit('messageerror', {}));
      };
      return worker;
    });
    t.after(() => kernel.dispose());
    await assert.rejects(kernel.flatten(rect()));
    assert.equal((await kernel.flatten(rect()))[0].closed, true);
  }
});

test('slow startup triggers balanced busy notifications and throwing observers are isolated', async (t) => {
  const events = [], kernel = kernelWith(() => fakeWorker({ startup: false }), { timeoutMs: 25, busyDelayMs: 5, onBusyChange: ({ busy }) => events.push(busy) });
  t.after(() => kernel.dispose()); await assert.rejects(kernel.flatten(rect()), { code: 'TIMEOUT' });
  assert.deepEqual(events, [true, false]);
  const isolated = kernelWith(() => fakeWorker({ delay: 10 }), { busyDelayMs: 1, onBusyChange() { throw new Error('observer'); }, logger() { throw new Error('logger'); } });
  t.after(() => isolated.dispose()); await isolated.flatten(rect());
  await assert.rejects(isolated.flatten(rect(), .001, { signal: {} }), { code: 'INVALID_REQUEST' });
});
