/** Promise-based GeometryKernel. Worker is injected for Node tests; never runs geometry on UI. */
export class KernelError extends Error {
  constructor(message, code = 'WORKER_ERROR', name = 'KernelError') { super(message); this.name = name; this.code = code; }
}
const abortError = () => new KernelError('Geometry operation cancelled', 'ABORTED', 'AbortError');
const closedError = () => new KernelError('Geometry kernel has been disposed', 'DISPOSED');
export class GeometryKernel {
  #factory;
  #worker = null;
  #ready = false;
  #backend = null;
  #active = null;
  #queue = [];
  #id = 0;
  #closed = false;
  #logged = false;
  #timeoutMs;
  #busyDelayMs;
  #onBusyChange;
  #logger;
  constructor({ workerFactory = () => new globalThis.Worker(new URL('./kernel-worker.mjs', import.meta.url), { type: 'module' }),
    timeoutMs = 10_000, busyDelayMs = 50, onBusyChange = () => {}, logger = (message) => console.info(message) } = {}) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || !Number.isFinite(busyDelayMs) || busyDelayMs < 0) throw new TypeError('Invalid kernel timer settings');
    this.#factory = workerFactory; this.#timeoutMs = timeoutMs; this.#busyDelayMs = busyDelayMs;
    this.#onBusyChange = onBusyChange; this.#logger = logger;
  }
  get backend() { return this.#backend; }
  #busy(job, busy) {
    try { this.#onBusyChange({ id: job.id, method: job.method, busy }); } catch { /* observer only */ }
  }
  #finish(job, error, result) {
    clearTimeout(job.timeout); clearTimeout(job.busyTimer);
    job.signal?.removeEventListener('abort', job.abort);
    if (job.busy) this.#busy(job, false);
    if (error) job.reject(error); else job.resolve(result);
  }
  #stopWorker() {
    const worker = this.#worker;
    this.#worker = null; this.#ready = false;
    try { worker?.terminate(); } catch { /* already stopped */ }
  }
  #failWorker(error) {
    const jobs = this.#active ? [this.#active, ...this.#queue] : this.#queue;
    this.#active = null; this.#queue = []; this.#stopWorker();
    for (const job of jobs) this.#finish(job, error);
  }
  #spawn() {
    try {
      const worker = this.#factory();
      this.#worker = worker;
      worker.addEventListener('message', ({ data }) => {
        if (this.#worker !== worker) return;
        if (data?.type === 'ready') {
          if (data.backend?.name !== 'js' || !Array.isArray(data.backend.capabilities)) {
            this.#failWorker(new KernelError('Invalid geometry backend handshake', 'PROTOCOL_ERROR')); return;
          }
          this.#backend = Object.freeze({ ...data.backend, capabilities: Object.freeze([...data.backend.capabilities]) });
          this.#ready = true;
          if (!this.#logged) {
            this.#logged = true;
            try { this.#logger('Draw GeometryKernel: JS fallback (clipper-lib 6.4.2; approximate curves)'); } catch { /* observer only */ }
          }
          this.#pump(); return;
        }
        const job = this.#active;
        if (!job || data?.id !== job.id) return;
        if (data.type !== 'result' || (!Object.hasOwn(data, 'result') && !data.error)) {
          this.#failWorker(new KernelError('Invalid geometry worker response', 'PROTOCOL_ERROR')); return;
        }
        this.#active = null;
        const error = data.error ? new KernelError(data.error.message || 'Geometry operation failed', data.error.code || 'GEOMETRY_FAILED', data.error.name || 'GeometryError') : null;
        this.#finish(job, error, data.result); this.#pump();
      });
      worker.addEventListener('error', (event) => {
        if (this.#worker === worker) this.#failWorker(new KernelError(event.message || 'Geometry worker crashed'));
      });
      worker.addEventListener('messageerror', () => {
        if (this.#worker === worker) this.#failWorker(new KernelError('Unreadable geometry worker response', 'PROTOCOL_ERROR'));
      });
    } catch (error) { this.#failWorker(new KernelError(`Could not start geometry worker: ${error.message}`, 'WORKER_UNAVAILABLE')); }
  }
  #pump() {
    if (this.#closed || this.#active || !this.#queue.length) return;
    if (!this.#worker) this.#spawn();
    if (!this.#ready || !this.#worker || !this.#queue.length) return;
    const job = this.#queue.shift(); this.#active = job;
    try { this.#worker.postMessage({ type: 'request', id: job.id, method: job.method, params: job.params }); }
    catch (error) { this.#active = null; this.#stopWorker(); this.#finish(job, new KernelError(`Could not send geometry: ${error.message}`, 'INVALID_REQUEST')); this.#pump(); }
  }
  #cancel(job, error) {
    if (this.#active === job) { this.#active = null; this.#stopWorker(); }
    else {
      const index = this.#queue.indexOf(job);
      if (index < 0) return;
      this.#queue.splice(index, 1);
      if (!this.#ready) this.#stopWorker();
    }
    this.#finish(job, error); this.#pump();
  }
  #request(method, params, { signal } = {}) {
    if (this.#closed) return Promise.reject(closedError());
    if (signal && (typeof signal.addEventListener !== 'function' || typeof signal.removeEventListener !== 'function')) return Promise.reject(new KernelError('Expected an AbortSignal', 'INVALID_REQUEST'));
    if (signal?.aborted) return Promise.reject(abortError());
    // Snapshot at call time: caller changes while the request is queued cannot alter its input.
    let snapshot;
    try { snapshot = structuredClone(params); } catch { return Promise.reject(new KernelError('Geometry input must be cloneable data', 'INVALID_REQUEST')); }
    return new Promise((resolve, reject) => {
      const job = { id: ++this.#id, method, params: snapshot, resolve, reject, signal, busy: false };
      job.abort = () => this.#cancel(job, abortError());
      job.timeout = setTimeout(() => this.#cancel(job, new KernelError('Geometry operation timed out', 'TIMEOUT', 'TimeoutError')), this.#timeoutMs);
      signal?.addEventListener('abort', job.abort, { once: true });
      this.#queue.push(job);
      job.busyTimer = setTimeout(() => {
        if (this.#active === job || this.#queue.includes(job)) { job.busy = true; this.#busy(job, true); }
      }, this.#busyDelayMs);
      this.#pump();
    });
  }
  async flatten(path, tolerance = .001, request) { return this.#request('flatten', { path, tolerance }, request); }
  async boolean(op, paths, { signal, tolerance = .001, fillRule = 'nonzero' } = {}) { return this.#request('boolean', { op, paths, options: { tolerance, fillRule } }, { signal }); }
  async offset(paths, distance, join, miterLimit, request) { return this.#request('offset', { paths, distance, join, miterLimit }, request); }
  async outlineStroke(path, stroke, request) { return this.#request('outlineStroke', { path, stroke }, request); }
  async simplify(path, precision, options, request) { return this.#request('simplify', { path, precision, options }, request); }
  async smooth(path, amount, request) { return this.#request('smooth', { path, amount }, request); }
  async trace(image, options, request) { return this.#request('trace', { image, options }, request); }
  async shapeText(run, font, request) { return this.#request('shapeText', { run, font }, request); }
  async writePdf(scene, options, request) { return this.#request('writePdf', { scene, options }, request); }
  async writeEps(scene, options, request) { return this.#request('writeEps', { scene, options }, request); }
  dispose() {
    if (this.#closed) return;
    this.#closed = true; this.#failWorker(closedError());
  }
}
export function createGeometryKernel(options) { return new GeometryKernel(options); }
