// Node test transport for the same pure request dispatcher as the browser worker.
import { parentPort } from 'node:worker_threads';
import { handleRequest } from '../../geom/kernel-worker.mjs';
import { BACKEND } from '../../geom/kernel-js.mjs';
parentPort.on('message', async (message) => parentPort.postMessage(await handleRequest(message)));
parentPort.postMessage({ type: 'ready', backend: BACKEND });
