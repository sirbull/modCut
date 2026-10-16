import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CHARACTER, PT_TO_MM, pointText, textProperties, textValues } from '../doc/text.mjs';
import { createDocument, validateDocument } from '../doc/schema.mjs';
import { createProjectDraw } from '../io/project.mjs';
import { insertNode, updateNode } from '../doc/commands.mjs';
import { artboardCutSvg } from '../io/cut-svg.mjs';

const values = {text:'Horten\r\nÆØÅ',...DEFAULT_CHARACTER,alignment:'left'};
test('point text preserves Unicode, typographic units, placement, save/reload and atomic undo', () => {
  const state = createProjectDraw(), doc = state.document, node = pointText([20,30],values);
  assert.deepEqual(node.transform,[1,0,0,1,20,30]); assert.equal(72*PT_TO_MM,25.4);
  state.history.transaction('Point Text',()=>state.history.execute(insertNode(doc.data.layers[0].id,node)));
  assert.equal(textValues(doc.getNode(node.id)).text,'Horten\nÆØÅ');
  const restored = createProjectDraw(JSON.parse(JSON.stringify(state.snapshot())));
  assert.equal(restored.document.readOnly,false); assert.deepEqual(restored.snapshot(),state.snapshot());
  state.history.execute(updateNode(node.id,textProperties({...values,fontSize:36,fontWeight:'bold',alignment:'center'})));
  assert.equal(textValues(doc.getNode(node.id)).fontSize,36);
  state.history.undo(); assert.equal(textValues(doc.getNode(node.id)).fontSize,24);
  state.history.undo(); assert.equal(doc.getNode(node.id),null);
  state.history.redo(); assert.ok(doc.getNode(node.id));
});
test('invalid text and typography are rejected at the UI and document boundaries', () => {
  for(const patch of [{text:' '},{fontFamily:' '},{fontSize:0},{fontSize:NaN},{leading:Infinity},{fontWeight:'huge'},{fontStyle:'oblique'},{alignment:'justify'}]) {
    assert.throws(()=>textProperties({...values,...patch}));
  }
  const node=pointText([0,0],values),doc=createDocument();doc.layers[0].children.push(node);
  assert.deepEqual(validateDocument(doc),[]);
  node.content.runs=[{text:23}]; assert.ok(validateDocument(doc).some(e=>e.path.endsWith('.text')));
  node.content.runs=[];node.character.fontSize=-5;assert.ok(validateDocument(doc).some(e=>e.path.endsWith('.fontSize')));
});
test('Send to Cut reports omitted text instead of silently losing lettering', () => {
  const state=createProjectDraw(),doc=state.document,node=pointText([10,10],values);
  state.history.execute(insertNode(doc.data.layers[0].id,node));
  const result=artboardCutSvg(doc,doc.data.artboards[0].id,{});
  assert.equal(result.count,0);assert.match(result.warnings.join(' '),/1 text object is not sent yet/);
});
