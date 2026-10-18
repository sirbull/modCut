import test from 'node:test';
import assert from 'node:assert/strict';
import { DrawDocument } from '../doc/document.mjs';
import { History } from '../doc/history.mjs';
import { createNode, createDocument } from '../doc/schema.mjs';
import { insertNode } from '../doc/commands.mjs';
import { appearance } from '../geometry.mjs';
import { defaultGradient } from '../doc/gradient.mjs';
import { cutPaint } from '../io/cut-paint.mjs';
import { resolveCutPreviewProcess } from '../view/cut-process.mjs';
import { matchingProcessLayer } from '../../layer-model.mjs';

const square = [{ closed: true, segments: [[0,0],[10,0],[10,10],[0,10]].map(p => ({p,in:[0,0],out:[0,0]})) }];
const vector = (props = {}) => createNode('path', { subpaths: square, appearance: appearance('#FF0000','#000000',1), ...props });
function setup(nodes, layerProps = {}) {
  const doc = new DrawDocument(createDocument({assets:{missing:{mimeType:'image/png',data:'',width:1,height:1}}})), history = new History(doc), layer = createNode('layer', { ...layerProps, children: nodes });
  history.execute(insertNode(null, layer));
  return {doc, history};
}
const process = (op, props = {}) => ({key:'vector:#000000',color:'#000000',raster:false,op,output:true,...props});
const snapshot = (...layers) => ({ mappingMode: 'color', layers });

test('shared Cut layer matching preserves exact keys, colour fallback and raster separation', () => {
  const exact = process('Score'), fallback = process('Engrave',{key:'legacy'}), raster = process('Engrave',{key:'raster:#000000',raster:true});
  assert.equal(matchingProcessLayer([fallback,exact,raster],{key:exact.key,color:'#000000'}),exact);
  assert.equal(matchingProcessLayer([fallback,raster],{color:'#000000'}),fallback);
  assert.equal(matchingProcessLayer([exact,raster],{key:exact.key,color:'#000000',raster:true}),raster);
  assert.equal(matchingProcessLayer([exact],{color:'#000000',raster:true}),null);
  assert.equal(matchingProcessLayer([exact],{color:'#FFFFFF'}),null);
});

test('vector identity follows Send to Cut stroke before fill, independent of presumed laser colours', () => {
  const node = vector(), {doc} = setup([node]);
  for (const op of ['Cut','Score','Engrave']) {
    const result = resolveCutPreviewProcess(doc,node.id,snapshot(process(op)));
    assert.equal(result.operation,op); assert.equal(result.status,'resolved'); assert.equal(result.color,'#000000');
  }
  assert.deepEqual(cutPaint(node),{fill:'#ff0000',stroke:'#000000',color:'#000000'});
  assert.equal(cutPaint(vector({appearance:appearance('#FF0000',null)})).color,'#ff0000');
});

test('hidden paints are skipped and a gradient uses its first stop by offset', () => {
  const node = vector(), look = structuredClone(node.appearance);
  look.strokes[0].hidden = true;
  look.fills[0].paint = defaultGradient({x:0,y:0,width:10,height:10});
  look.fills[0].paint.stops.reverse();
  assert.equal(cutPaint({...node,appearance:look}).color,'#FFFFFF');
  look.fills[0].hidden = true;
  assert.equal(cutPaint({...node,appearance:look}).color,null);
});

test('Scribble uses the fill identity that Send to Cut emits as a line', () => {
  const node = vector();
  const look = {...node.appearance,effects:[{type:'scribble',angle:30,spacing:1,strokeWidth:.2,variation:0}]};
  assert.equal(cutPaint({...node,appearance:look}).color,'#ff0000');
  assert.equal(cutPaint({...node,appearance:{...look,fills:[]}}).color,'#000000');
});

test('missing settings and new colours remain unresolved, without inventing Cut defaults', () => {
  const node = vector(), {doc} = setup([node]);
  assert.equal(resolveCutPreviewProcess(doc,node.id).reason,'missing-process-settings');
  assert.equal(resolveCutPreviewProcess(doc,node.id,snapshot()).reason,'missing-process-layer');
  assert.equal(resolveCutPreviewProcess(doc,node.id,snapshot(process('Cut',{color:'#ffffff',key:'vector:#ffffff'}))).status,'unresolved');
  assert.equal(resolveCutPreviewProcess(doc,'missing',snapshot()).reason,'missing-node');
});

test('same-colour raster never inherits vector cutting and carries real raster settings', () => {
  const image = createNode('image',{assetId:'missing'}), {doc} = setup([image]);
  const vectorLayer = process('Cut');
  assert.equal(resolveCutPreviewProcess(doc,image.id,snapshot(vectorLayer)).reason,'missing-process-layer');
  const rasterLayer = process('Engrave',{key:'raster:#000000',raster:true,dpi:500,dither:'Jarvis',power:32,speed:40});
  const result = resolveCutPreviewProcess(doc,image.id,snapshot(vectorLayer,rasterLayer));
  assert.equal(result.operation,'Engrave'); assert.equal(result.layer.dpi,500); assert.equal(result.layer.dither,'Jarvis');
  assert.equal(result.layer.power,32); assert.notEqual(result.layer,rasterLayer);
  result.layer.power=0; assert.equal(rasterLayer.power,32);
  assert.equal(resolveCutPreviewProcess(doc,image.id,snapshot({...rasterLayer,op:'Cut'})).reason,'invalid-operation');
});

test('ignore and disabled output stay excluded and malformed settings are unresolved', () => {
  const node = vector(), {doc} = setup([node]);
  for (const op of ['Cut','Engrave','Score','Ignore']) {
    assert.equal(resolveCutPreviewProcess(doc,node.id,snapshot(process(op,{output:false}))).status,'excluded');
  }
  assert.equal(resolveCutPreviewProcess(doc,node.id,snapshot(process('Ignore'))).reason,'ignored');
  assert.equal(resolveCutPreviewProcess(doc,node.id,snapshot(process('Unknown'))).reason,'invalid-operation');
  assert.equal(resolveCutPreviewProcess(doc,node.id,snapshot(process('Cut',{output:undefined}))).reason,'missing-output-setting');
});

test('global mode uses only the global layer and checks operation consistency', () => {
  const node = vector(), {doc} = setup([node]);
  for (const mappingMode of ['cut','score','engrave']) {
    const op = mappingMode[0].toUpperCase()+mappingMode.slice(1);
    assert.equal(resolveCutPreviewProcess(doc,node.id,{mappingMode,layers:[process(op,{color:null})]}).operation,op);
    assert.equal(resolveCutPreviewProcess(doc,node.id,{mappingMode,layers:[process(op)]}).reason,'missing-process-layer');
  }
  assert.equal(resolveCutPreviewProcess(doc,node.id,{mappingMode:'cut',layers:[process('Engrave',{color:null})]}).reason,'inconsistent-global-operation');
  assert.equal(resolveCutPreviewProcess(doc,node.id,{mappingMode:'invalid',layers:[]}).reason,'missing-process-settings');
});

test('template, hidden and non-printing ancestors exclude children before process matching', () => {
  for (const props of [{template:true},{visible:false},{printable:false}]) {
    const node=vector(), {doc}=setup([node],props);
    assert.equal(resolveCutPreviewProcess(doc,node.id,snapshot(process('Cut'))).reason,'not-output');
  }
  const node=vector({visible:false}), {doc}=setup([node]);
  assert.equal(resolveCutPreviewProcess(doc,node.id,snapshot(process('Cut'))).status,'excluded');
});

test('process lookup preserves document identity, serialization, history and Cut settings', () => {
  const node=vector(), {doc,history}=setup([node]), data=doc.data, json=JSON.stringify(data), entries=history.entries.length;
  const cut=snapshot(process('Engrave')), before=JSON.stringify(cut);
  resolveCutPreviewProcess(doc,node.id,cut);
  assert.equal(doc.data,data); assert.equal(JSON.stringify(doc.data),json); assert.equal(history.entries.length,entries); assert.equal(JSON.stringify(cut),before);
  history.undo(); assert.equal(doc.getNode(node.id),null); history.redo(); assert.deepEqual(doc.getNode(node.id),node);
});


test('containers are not assigned a single process and unpainted paths do not become cuts', () => {
  const leaf=vector({appearance:appearance(null,null)}), group=createNode('group',{children:[leaf]}), {doc}=setup([group]);
  assert.equal(resolveCutPreviewProcess(doc,group.id,snapshot(process('Cut'))).status,'container');
  assert.equal(resolveCutPreviewProcess(doc,leaf.id,snapshot(process('Cut'))).reason,'no-paint');
});

test('a new snapshot reflects process edits without retaining a stale colour match', () => {
  const node=vector(), {doc}=setup([node]), cut=snapshot(process('Score'));
  assert.equal(resolveCutPreviewProcess(doc,node.id,cut).operation,'Score');
  cut.layers[0].op='Engrave';
  assert.equal(resolveCutPreviewProcess(doc,node.id,cut).operation,'Engrave');
  cut.layers=[];
  assert.equal(resolveCutPreviewProcess(doc,node.id,cut).status,'unresolved');
});
