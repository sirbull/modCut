import assert from 'node:assert/strict';
import { wait } from './cdp.mjs';
import { activeDraw as active, enterDraw, rememberTabs, submitNewDrawDialog } from './draw-test-helpers.mjs';

/** Phase 5: modCut as an MCP server. An agent's HTTP calls draw in the active Draw tab, one undo step each. */
export async function runDrawMcpWorkflows(client) {
  const { evaluate } = client, restore = await rememberTabs(evaluate);
  await enterDraw(evaluate); await evaluate("document.querySelector('#newDoc').click()");
  await submitNewDrawDialog(evaluate, { preset: 'custom', width: 120, height: 80, name: 'MCP proof' });

  // Preferences offers the switch; turned on, the command to connect Claude Code shows.
  await evaluate("document.querySelector('#settings').click()");
  for (let i = 0; i < 100 && !(await evaluate("!!document.querySelector('.preferences-modal [name=mcp]')")); i++) await wait(40);
  assert.equal(await evaluate("document.querySelector('.preferences-modal [name=mcp]').checked"), false, 'Off until turned on');
  await evaluate("(()=>{const s=document.querySelector('.preferences-modal [name=mcp]');s.click();})()");
  let status = null;
  for (let i = 0; i < 100 && !status?.running; i++) { status = await evaluate('window.modcut.getMcpServer()'); await wait(40); }
  assert.equal(status.running, true, JSON.stringify(status));
  assert.equal(await evaluate("document.querySelector('.preferences-modal [name=mcpCommand]').value"), `claude mcp add --transport http modcut ${status.url} --header "Authorization: Bearer ${status.token}"`);
  await evaluate("document.querySelector('.preferences-modal [data-x=cancel]').click()");

  let nextId = 1;
  const rpc = async (method, params = {}, token = status.token) => {
    const response = await fetch(status.url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${token}` }, body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }) });
    return response.status === 200 ? response.json() : { status: response.status };
  };
  const tool = async (name, args = {}) => {
    const reply = await rpc('tools/call', { name, arguments: args });
    if (reply.result?.isError) throw new Error(reply.result.content[0].text);
    return reply.result.structuredContent ?? reply.result;
  };
  assert.equal((await rpc('ping', {}, 'wrong')).status, 401, 'The token is required');
  const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'e2e', version: '1' } });
  assert.equal(init.result.serverInfo.name, 'modcut');
  assert.ok((await rpc('tools/list')).result.tools.some((t) => t.name === 'add_shape'));

  const info = await tool('document_info');
  assert.equal(info.name, 'MCP proof'); assert.deepEqual([info.artboards[0].width, info.artboards[0].height], [120, 80]);
  const { id: circle } = await tool('add_shape', { shape: 'ellipse', x: 10, y: 10, width: 30, height: 20, fill: '#ff0000', stroke: null, name: 'Sun' });
  const { id: star } = await tool('add_shape', { shape: 'star', x: 80, y: 40, radius: 15, points: 6, fill: '#0000FF' });
  const listed = await tool('list_objects');
  const sun = listed.objects.find((o) => o.id === circle);
  assert.equal(sun.type, 'shape:ellipse'); assert.equal(sun.name, 'Sun'); assert.equal(sun.fill, '#ff0000'); assert.equal(sun.stroke, null);
  const board = info.artboards[0];
  assert.deepEqual([sun.bounds.x - board.x, sun.bounds.y - board.y, sun.bounds.width, sun.bounds.height].map(Math.round), [10, 10, 30, 20], 'Artboard coordinates in mm');
  await tool('update_object', { id: circle, fill: '#00ff00', dx: 5, opacity: .5 });
  const moved = (await tool('list_objects')).objects.find((o) => o.id === circle);
  assert.equal(moved.fill, '#00ff00'); assert.equal(moved.opacity, .5); assert.equal(Math.round(moved.bounds.x - board.x), 15);
  assert.ok((await tool('list_commands')).commands.includes('group'));
  const grouped = await tool('run_command', { command: 'group', ids: [circle, star] });
  assert.equal(grouped.changed, true);
  assert.equal((await tool('list_objects')).objects.find((o) => o.depth === 0).type, 'group');
  const svg = await tool('add_svg', { svg: '<svg xmlns="http://www.w3.org/2000/svg" width="20mm" height="10mm" viewBox="0 0 20 10"><rect width="20" height="10" fill="#123456"/></svg>', x: 90, y: 5 });
  assert.equal(svg.ids.length, 1);
  await tool('delete_objects', { ids: svg.ids });
  assert.equal(await evaluate(`(async()=>!${active}.state.document.getNode(${JSON.stringify(svg.ids[0])}))()`), true);
  await assert.rejects(tool('update_object', { id: 'missing' }), /There is no object missing/);
  await assert.rejects(tool('run_command', { command: 'format-disk' }), /Unknown command/);
  await assert.rejects(tool('add_shape', { shape: 'ellipse', x: 0, y: 0, width: 5, height: 5, fill: 'red' }), /hex colour/);

  // PNG comes back as image content; SVG as text.
  const png = await rpc('tools/call', { name: 'export_artboard', arguments: { format: 'png', ppi: 72 } });
  assert.equal(png.result.content[0].type, 'image'); assert.equal(png.result.content[0].mimeType, 'image/png');
  assert.deepEqual([...Buffer.from(png.result.content[0].data, 'base64').subarray(1, 4)].map((c) => String.fromCharCode(c)).join(''), 'PNG');
  const svgOut = await rpc('tools/call', { name: 'export_artboard', arguments: { format: 'svg' } });
  assert.match(svgOut.result.content[0].text, /<svg/);

  // Each change was one undo step in modCut.
  await tool('run_command', { command: 'undo' });
  assert.ok(await evaluate(`(async()=>!!${active}.state.document.getNode(${JSON.stringify(svg.ids[0])}))()`), 'Undo brings the deleted SVG back');

  // new_document opens its own Draw tab.
  const tabs = await evaluate("document.querySelectorAll('.doc-tab').length");
  const fresh = await tool('new_document', { name: 'From agent', width: 50, height: 40 });
  assert.equal(fresh.name, 'From agent'); assert.deepEqual([fresh.artboards[0].width, fresh.artboards[0].height], [50, 40]);
  assert.equal(await evaluate("document.querySelectorAll('.doc-tab').length"), tabs + 1);

  assert.equal((await evaluate('window.modcut.setMcpServer(false)')).running, false);
  await assert.rejects(fetch(status.url, { method: 'POST' }), 'The server stops when turned off');
  await restore();
  console.log('PASS Draw MCP server: Preferences switch and connect command, token required, document info, shapes in artboard mm, update and move, commands, SVG in, delete, PNG and SVG out, undo, new document, off again');
}
