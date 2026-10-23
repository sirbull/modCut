/** Worker-only protocol and pure dispatcher. No document/model access or DOM/Paper.js. */
import { BACKEND, runGeometry } from './kernel-js.mjs';

export async function handleRequest(message) {
  const id = message?.id;
  try {
    if (!Number.isSafeInteger(id) || id < 1 || message.type !== 'request' || typeof message.method !== 'string' || !message.params || typeof message.params !== 'object') throw new TypeError('Malformed geometry request');
    const result = await runGeometry(message.method, message.params);
    return { type: 'result', id, result };
  } catch (error) {
    return { type: 'result', id, error: { name: error.name || 'Error', code: error.code || 'INVALID_REQUEST', message: error.message || 'Geometry operation failed' } };
  }
}

if (typeof WorkerGlobalScope !== 'undefined' && globalThis instanceof WorkerGlobalScope) {
  globalThis.onmessage = async ({ data }) => globalThis.postMessage(await handleRequest(data));
  globalThis.postMessage({ type: 'ready', backend: BACKEND });
}
