import { traceRegions } from './trace.mjs';

self.onmessage = ({ data: { image, options } }) => {
  try { self.postMessage({ regions: traceRegions(image, options) }); }
  catch (error) { self.postMessage({ error: error.message || 'Image tracing failed.' }); }
};
