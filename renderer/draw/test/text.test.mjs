import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CHARACTER, PT_TO_MM, pointText, textProperties, textValues, textDefaults, textStyleValues } from '../doc/text.mjs';
import { createDocument, validateDocument } from '../doc/schema.mjs';
import { createProjectDraw } from '../io/project.mjs';
import { insertNode, updateNode } from '../doc/commands.mjs';
import { artboardCutSvg } from '../io/cut-svg.mjs';

const values = {text:'Horten\r\nÆØÅ',...DEFAULT_CHARACTER,alignment:'left'};
test('new text inherits character and paragraph defaults while each tool supplies its own content and frame', () => {
  const ui = { character:{fontFamily:'Example',fontSize:32,leading:40,fontWeight:'bold',tracking:75,allCaps:true}, paragraph:{alignment:'center',leftIndent:12,spaceAfter:6,orientation:'vertical'}, textAlignment:'right', kind:'area', frame:{width:60,height:40}, runs:[{text:'Old content'}] };
  const defaults = textDefaults(ui);
  for (const [kind,extra] of [['point',{}],['area',{frameWidth:60,frameHeight:40}]]) {
    const node = pointText([10,20],{...defaults,text:'New text',kind,...extra});
    assert.equal(node.character.fontFamily,'Example');assert.equal(node.character.fontSize,32);
    assert.equal(node.character.fontWeight,'bold');assert.equal(node.character.tracking,75);assert.equal(node.character.allCaps,true);
    assert.deepEqual(node.paragraph,{alignment:'center',leftIndent:12,spaceAfter:6});
    assert.deepEqual(node.content.runs,[{text:'New text'}]);
    assert.equal(node.kind,kind);
  }
  assert.equal(textDefaults({textAlignment:'right'}).alignment,'right','Legacy workspace alignment still works');
  assert.equal(textDefaults().fontSize,DEFAULT_CHARACTER.fontSize);
});

test('font defaults invalidate stale faces and references, and whole-object changes replace matching run styles', () => {
  const before={...values,fontSource:'google',fontPostscriptName:'OldFace',googleFont:{family:'Old'},fontAxes:{wght:700},runs:[{text:'Horten',character:{fontSize:40,fontWeight:'bold'}},{text:' ÆØÅ'}]};
  const snapshot=structuredClone(before);
  const resized=textStyleValues(before,{fontSize:30});
  assert.deepEqual(resized.runs[0].character,{fontWeight:'bold'});
  assert.equal(resized.fontPostscriptName,'OldFace','Changing size preserves the selected face');
  const replaced=textStyleValues(before,{fontFamily:'New family',fontSource:'system'});
  for(const key of ['fontPostscriptName','googleFont','fontAxes'])assert.equal(replaced[key],undefined);
  assert.equal(textStyleValues(before,{fontWeight:'normal'}).fontPostscriptName,undefined);
  assert.deepEqual(before,snapshot,'Reading and changing defaults do not mutate previous settings');
});

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
  for(const patch of [{text:' '},{fontFamily:' '},{fontSize:0},{fontSize:NaN},{leading:Infinity},{fontWeight:'huge'},{fontStyle:'oblique'},{alignment:'justify-all'},{leftIndent:NaN},{spaceAfter:20000}]) {
    assert.throws(()=>textProperties({...values,...patch}));
  }
  const node=pointText([0,0],values),doc=createDocument();doc.layers[0].children.push(node);
  assert.deepEqual(validateDocument(doc),[]);
  node.content.runs=[{text:23}]; assert.ok(validateDocument(doc).some(e=>e.path.endsWith('.text')));
  node.content.runs=[];node.character.fontSize=-5;assert.ok(validateDocument(doc).some(e=>e.path.endsWith('.fontSize')));
});
test('Send to Cut blocks unresolved text instead of silently losing lettering', () => {
  const state=createProjectDraw(),doc=state.document,node=pointText([10,10],values);
  state.history.execute(insertNode(doc.data.layers[0].id,node));
  const result=artboardCutSvg(doc,doc.data.artboards[0].id,{bounds:()=>({x:10,y:10,width:20,height:20})});
  assert.equal(result.count,0);assert.match(result.errors.join(' '),/resolved font/);
});

test('area frame dimensions are validated and unresolved area layouts cannot be saved',()=>{
  const v={...values,kind:'area',frameWidth:40,frameHeight:30};
  for(const patch of [{frameWidth:0},{frameHeight:Infinity},{frameWidth:100001}])assert.throws(()=>textProperties({...v,...patch}),/Frame dimensions/);
  const node=pointText([4,5],v),doc=createDocument();doc.layers[0].children=[node];
  assert.ok(validateDocument(doc).some(e=>e.path.endsWith('.layout')));
  node.frame.height=-1;assert.ok(validateDocument(doc).some(e=>e.path.endsWith('.frame.height')));
});
