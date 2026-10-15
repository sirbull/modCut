/** Synchronous atomic Commands, nested transactions, coalescing and clean-state tracking. */
function composite(label, batch, mergeKey) {
  const nodeIds = [...new Set(batch.flatMap((item) => item.nodeIds || []))];
  return {
    label, nodeIds, mergeKey, batch,
    do: (doc) => { for (const item of batch) item.do(doc); },
    undo: (doc) => { for (const item of [...batch].reverse()) item.undo(doc); },
    merge(next) {
      if (!mergeKey || next.mergeKey !== mergeKey || !next.batch || JSON.stringify([...next.nodeIds].sort()) !== JSON.stringify([...nodeIds].sort())) return null;
      return composite(next.label, [...batch, ...next.batch], mergeKey);
    },
  };
}
export class History {
  #doc;
  #entries = [];
  #cursor = 0;
  #listeners = new Set();
  #transaction = null;
  #state = {};
  #saved = this.#state;
  #savepoints = new WeakSet();
  constructor(doc) { this.#doc = doc; }
  get canUndo() { return this.#cursor > 0; }
  get canRedo() { return this.#cursor < this.#entries.length; }
  get dirty() { return this.#state !== this.#saved; }
  get undoLabel() { return this.#entries[this.#cursor - 1]?.command.label || null; }
  get redoLabel() { return this.#entries[this.#cursor]?.command.label || null; }
  get entries() { return this.#entries.map(({ command }, i) => ({ label: command.label, applied: i < this.#cursor })); }
  subscribe(listener) { this.#listeners.add(listener); return () => this.#listeners.delete(listener); }
  #notify(commands = []) {
    const changed = [...new Set(commands.flatMap((command) => command.nodeIds || []))];
    // Observers cannot turn a successful commit into a failed command.
    for (const listener of this.#listeners) { try { listener({ nodeIds: changed, dirty: this.dirty }); } catch { /* isolated observer */ } }
  }
  #apply(command, direction) {
    const before = this.#doc.data;
    try {
      const result = command[direction](this.#doc);
      if (result?.then) throw new TypeError('Commands must be synchronous');
    } catch (error) { this.#doc._restore(before); throw error; }
  }
  execute(command) {
    if (!command || typeof command.do !== 'function' || typeof command.undo !== 'function' || typeof command.label !== 'string') throw new TypeError('Expected a Command');
    if (command.do.constructor.name === 'AsyncFunction' || command.undo.constructor.name === 'AsyncFunction') throw new TypeError('Commands must be synchronous');
    this.#apply(command, 'do');
    if (this.#transaction) { this.#transaction.push(command); return; }
    this.#record(command);
  }
  #record(command) {
    const previous = this.#entries[this.#cursor - 1];
    let merged = null;
    if (this.#cursor === this.#entries.length && this.#state !== this.#saved && !this.#savepoints.has(this.#state)) {
      try { merged = previous?.command.merge?.(command) || null; }
      catch { /* A coalescing failure must not discard a committed edit. */ }
    }
    if (merged) {
      const after = {};
      this.#entries[this.#cursor - 1] = { command: merged, before: previous.before, after };
      this.#state = after;
    } else {
      this.#entries.splice(this.#cursor);
      const entry = { command, before: this.#state, after: {} };
      this.#entries.push(entry); this.#cursor++; this.#state = entry.after;
    }
    this.#notify([command]);
  }
  undo() {
    if (this.#transaction) throw new Error('Cannot undo inside a transaction');
    if (!this.canUndo) return false;
    const entry = this.#entries[this.#cursor - 1];
    this.#apply(entry.command, 'undo');
    this.#cursor--; this.#state = entry.before; this.#notify([entry.command]);
    return true;
  }
  redo() {
    if (this.#transaction) throw new Error('Cannot redo inside a transaction');
    if (!this.canRedo) return false;
    const entry = this.#entries[this.#cursor];
    this.#apply(entry.command, 'do');
    this.#cursor++; this.#state = entry.after; this.#notify([entry.command]);
    return true;
  }
  /** Optional mergeKey coalesces consecutive transactions on the same nodes, e.g. a live slider drag. */
  transaction(label, fn, { mergeKey = null } = {}) {
    if (fn.constructor.name === 'AsyncFunction') throw new TypeError('Transactions must be synchronous');
    const outer = this.#transaction, batch = [], before = this.#doc.data;
    this.#transaction = batch;
    try {
      const result = fn();
      if (result?.then) throw new TypeError('Transactions must be synchronous');
    } catch (error) { this.#doc._restore(before); throw error; }
    finally { this.#transaction = outer; }
    if (!batch.length) return;
    const command = composite(label, batch, mergeKey);
    if (outer) outer.push(command);
    else this.#record(command);
  }
  markSaved() {
    this.captureSavepoint()();
  }
  /** Commit the state actually written, even if edits occur during async file IO. */
  captureSavepoint() {
    if (this.#transaction) throw new Error('Cannot mark saved inside a transaction');
    const state = this.#state;
    this.#savepoints.add(state);
    return () => { this.#saved = state; this.#notify(); };
  }
  clear() {
    if (this.#transaction) throw new Error('Cannot clear inside a transaction');
    const clean = !this.dirty;
    this.#entries = []; this.#cursor = 0; this.#state = {};
    if (clean) this.#saved = this.#state;
    // Clearing history is not equivalent to saving the document.
    this.#notify();
  }
}
