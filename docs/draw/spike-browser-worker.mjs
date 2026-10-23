/** D0.3 browser Web Worker. This is not part of the Draw runtime. */
import init, { boolean_json, trace_rgba, write_pdf } from '../../native/modcut-geom/pkg/modcut_geom.js';
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
self.onmessage = async ({ data }) => {
  try {
    const start = performance.now();
    const bytes = await (await fetch(new URL('../../native/modcut-geom/pkg/modcut_geom_bg.wasm', import.meta.url))).arrayBuffer();
    await init({ module_or_path: bytes });
    const initializationMs = performance.now() - start;
    const booleans = data.cases.map((fixture) => {
      const input = JSON.stringify(fixture.input), samples = [];
      let output;
      for (let i = 0; i < 12; i++) {
        const start = performance.now();
        output = boolean_json(input);
        if (i >= 3) samples.push(performance.now() - start);
      }
      return { name: fixture.name, medianMs: median(samples), maxMs: Math.max(...samples), output: JSON.parse(output) };
    });
    const traces = [];
    for (const pattern of ['logo', 'checkerboard']) {
      const width = 1600, height = 1250, rgba = new Uint8Array(width * height * 4);
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const ink = pattern === 'logo'
          ? (x > 100 && x < 700 && y > 100 && y < 1100) || (x - 1100) ** 2 + (y - 625) ** 2 < 350 ** 2
          : (Math.floor(x / 50) + Math.floor(y / 50)) % 2 === 0;
        const offset = (y * width + x) * 4;
        rgba[offset] = rgba[offset + 1] = rgba[offset + 2] = ink ? 0 : 255; rgba[offset + 3] = 255;
      }
      const samples = [];
      let result;
      for (let i = 0; i < 3; i++) {
        const start = performance.now(); result = JSON.parse(trace_rgba(width, height, rgba)); samples.push(performance.now() - start);
      }
      traces.push({ pattern, width, height, samplesMs: samples, medianMs: median(samples), paths: result.length,
        anchors: result.flat(1).reduce((sum, contour) => sum + contour.segments.length, 0) });
    }
    const pdf = write_pdf(JSON.stringify({ width: 200, height: 100, paths: [data.cases[0].expected, data.cases.find((c) => c.name === 'star-unite').expected] }));
    self.postMessage({ ok: true, initializationMs, booleans, traces, pdf }, [pdf.buffer]);
  } catch (error) { self.postMessage({ ok: false, error: String(error?.stack || error) }); }
};
