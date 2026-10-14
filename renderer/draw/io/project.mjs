import { DrawDocument } from '../doc/document.mjs';
import { History } from '../doc/history.mjs';
import { Selection } from '../doc/selection.mjs';
import { loadDocument } from '../doc/migrate.mjs';

export const PROJECT_VERSION = 4;

/** Check before touching either workspace. Legacy Cut projects remain readable. */
export function validateProject(project) {
  if (!project || project.app !== 'modCut') throw new TypeError('Not a modCut document.');
  const version = project.version ?? 1;
  if (!Number.isInteger(version) || version < 1 || version > PROJECT_VERSION) {
    throw new RangeError('This project needs a newer version of modCut. Open it there to preserve its data.');
  }
}

/** Lives per tab, independently of the lazily mounted canvas. History is transient. */
export function createProjectDraw(input = null, { dirty = false } = {}) {
  let document, source = null, warning = null, report = [];
  if (input === null || input === undefined) document = new DrawDocument();
  else {
    try {
      const loaded = loadDocument(input);
      document = loaded.document; report = loaded.report;
      if (loaded.safeMode) {
        source = loaded.source;
        warning = 'Draw data contains invalid content and is read-only. The original data will be preserved when saving.';
      }
    } catch (error) {
      // Unsupported Draw schemas must survive Cut-only editing and recovery unchanged.
      source = structuredClone(input);
      document = new DrawDocument(undefined, { readOnly: true });
      warning = `Draw data cannot be edited in this version of modCut. The original data will be preserved when saving. ${error.message}`;
    }
  }
  const history = new History(document);
  let recoveredDirty = dirty;
  return {
    document, history, selection: new Selection(document), warning, report,
    get dirty() { return recoveredDirty || history.dirty; },
    // The immutable model snapshot is reused between edits; no clone on every autosave.
    snapshot() { return source ?? document.data; },
    captureSavepoint() {
      const commit = history.captureSavepoint();
      return () => { recoveredDirty = false; commit(); };
    },
    subscribe(listener) { return history.subscribe(listener); },
  };
}
