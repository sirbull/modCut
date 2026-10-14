import { DOCUMENT_VERSION, NODE_TYPES, CONTAINERS, createDocument, createNode, createArtboard, validateDocument } from './schema.mjs';
import { DrawDocument } from './document.mjs';

/** The first Draw schema has no predecessor. Missing versions are draft v1 JSON. */
export function migrateDocument(input) {
  const data = typeof input === 'string' ? JSON.parse(input) : structuredClone(input);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new TypeError('Expected Draw JSON');
  const report = [];
  if (data.version === undefined) { data.version = DOCUMENT_VERSION; report.push({ path: '$.version', message: 'Unversioned draft treated as version 1' }); }
  if (data.version !== DOCUMENT_VERSION) throw new RangeError(`Unsupported Draw version: ${data.version}`);
  return { data, report };
}

/** Repairs missing defaults only. Unsafe geometry is quarantined, never guessed. */
export function loadDocument(input) {
  const { data: source, report } = migrateDocument(input);
  const unsafe = validateDocument(source).find(({ message }) => ['Cyclic data', 'Expected plain JSON', 'Expected JSON data'].includes(message));
  if (unsafe) throw new TypeError(`Cannot recover Draw document: ${unsafe.path}: ${unsafe.message}`);
  const defaults = createDocument();
  function fill(value, base, path) {
    const result = { ...base, ...value };
    for (const key of Object.keys(base)) if (!Object.hasOwn(value, key)) report.push({ path: `${path}.${key}`, message: 'Restored missing default' });
    return result;
  }
  const data = fill(source, defaults, '$');
  if (source.settings && typeof source.settings === 'object' && !Array.isArray(source.settings)) {
    data.settings = fill(source.settings, defaults.settings, '$.settings');
    for (const key of ['grid', 'snapping']) if (source.settings[key] && typeof source.settings[key] === 'object') data.settings[key] = fill(source.settings[key], defaults.settings[key], `$.settings.${key}`);
  }
  function repair(nodes, path) {
    return nodes.map((node, i) => {
      const p = `${path}.${i}`;
      if (!node || !NODE_TYPES.includes(node.type)) return node;
      const next = fill(node, createNode(node.type), p);
      if (CONTAINERS.includes(next.type) && Array.isArray(next.children)) next.children = repair(next.children, `${p}.children`);
      return next;
    });
  }
  if (Array.isArray(data.layers)) data.layers = repair(data.layers, '$.layers');
  if (Array.isArray(data.artboards)) data.artboards = data.artboards.map((board, i) => board && typeof board === 'object' ? fill(board, createArtboard(), `$.artboards.${i}`) : board);
  let errors = validateDocument(data);
  const safeMode = errors.length > 0;
  // Each pass removes at least one invalid subtree or restores one root field.
  while (errors.length) {
    const error = errors[0];
    report.push({ ...error, message: `Quarantined invalid data: ${error.message}` });
    const nodePath = error.path.match(/^\$\.layers\.\d+(?:\.children\.\d+)*/)?.[0];
    const boardPath = error.path.match(/^\$\.artboards\.\d+/)?.[0];
    if (nodePath || boardPath) {
      const keys = (nodePath || boardPath).slice(2).split('.');
      const list = keys.slice(0, -1).reduce((value, key) => value[key], data);
      list.splice(Number(keys.at(-1)), 1);
    } else {
      const key = error.path.split('.')[1];
      if (!Object.hasOwn(defaults, key)) throw new TypeError(`Cannot recover Draw document: ${error.path}`);
      data[key] = structuredClone(defaults[key]);
    }
    if (Array.isArray(data.artboards) && !data.artboards.length) data.artboards.push(createArtboard());
    errors = validateDocument(data);
  }
  return { document: new DrawDocument(data, { readOnly: safeMode }), safeMode, report, source };
}
