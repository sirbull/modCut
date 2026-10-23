import test from 'node:test';
import assert from 'node:assert/strict';
import { newDrawDocument, MAX_ARTBOARD_SIZE } from '../doc/artboards.mjs';
import { validateDocument } from '../doc/schema.mjs';
import { DOCUMENT_PRESETS, PRESET_CATEGORIES, RECENT_KEY, TEMPLATES_KEY, MAX_RECENT, toMm, fromMm, formatSize, normalizeSetup,
  setupFromDocument, rememberRecent, saveTemplate, removeTemplate, loadStoredList, storeList } from '../doc/presets.mjs';

const memoryStorage = (values = {}) => ({getItem:key => values[key] ?? null, setItem:(key,value) => { values[key] = value; }, values});

test('document presets are unique, categorised and valid as new documents',()=>{
  assert.equal(new Set(DOCUMENT_PRESETS.map(p=>p.id)).size,DOCUMENT_PRESETS.length);
  for(const category of PRESET_CATEGORIES)assert.ok(DOCUMENT_PRESETS.some(p=>p.category===category.id),category.id);
  for(const preset of DOCUMENT_PRESETS){
    assert.ok(PRESET_CATEGORIES.some(c=>c.id===preset.category));
    const doc=newDrawDocument({preset:'custom',...normalizeSetup(preset)});
    assert.equal(validateDocument(doc).length,0,preset.id);
    assert.equal(doc.units,preset.units);
  }
  const hd=DOCUMENT_PRESETS.find(p=>p.id==='screen');
  assert.equal(fromMm(hd.width,'px'),1920);assert.equal(fromMm(hd.height,'px'),1080);
  assert.equal(DOCUMENT_PRESETS.find(p=>p.id==='a4').width,210);
});
test('unit conversion keeps millimetres exact and formats sizes in the chosen unit',()=>{
  assert.equal(toMm(1,'in'),25.4);assert.equal(toMm(72,'pt'),25.4);assert.equal(toMm(96,'px'),25.4);assert.equal(toMm(2,'cm'),20);
  assert.equal(fromMm(215.9,'in'),8.5);assert.equal(fromMm(toMm(1080,'px'),'px'),1080);
  assert.equal(formatSize(210,297,'mm'),'210 × 297 mm');assert.equal(formatSize(215.9,279.4,'in'),'8.5 × 11 in');
  assert.ok(Number.isNaN(toMm(1,'furlong')));
});
test('setups are validated and new documents keep units and resolution',()=>{
  for(const bad of [{width:0,height:10},{width:10,height:-1},{width:MAX_ARTBOARD_SIZE+1,height:10},{width:10,height:10,count:0},
    {width:10,height:10,count:1.5},{width:10,height:10,spacing:-1},{width:10,height:10,ppi:0},{width:10,height:10,columns:0}])
    assert.throws(()=>normalizeSetup(bad),JSON.stringify(bad));
  assert.deepEqual(normalizeSetup({width:'100',height:50,units:'bogus',layout:'spiral'}),
    {width:100,height:50,units:'mm',ppi:300,count:1,layout:'grid-row',columns:2,spacing:20});
  const doc=newDrawDocument({name:'Pixels',preset:'custom',...normalizeSetup({width:508,height:285.75,units:'px',ppi:72,count:2,layout:'row',spacing:10})});
  assert.equal(doc.units,'px');assert.equal(doc.rasterEffectsPpi,72);assert.equal(doc.artboards[1].x,518);
});
test('document properties round-trip through setupFromDocument for every layout',()=>{
  for(const layout of ['row','column','grid-row']){
    const setup=normalizeSetup({width:100,height:60,units:'cm',ppi:150,count:5,layout,columns:3,spacing:12.5});
    const doc=newDrawDocument({preset:'custom',...setup});
    assert.deepEqual(setupFromDocument(doc),layout==='grid-row'?setup:{...setup,columns:2},layout);
  }
  assert.deepEqual(setupFromDocument(newDrawDocument({preset:'custom',width:40,height:30})),normalizeSetup({width:40,height:30}));
});
test('recent setups are newest first, de-duplicated and capped',()=>{
  let list=[];
  for(let i=0;i<MAX_RECENT+3;i++)list=rememberRecent(list,{label:`Size ${i}`,width:100+i,height:50},i);
  assert.equal(list.length,MAX_RECENT);assert.equal(list[0].label,`Size ${MAX_RECENT+2}`);
  list=rememberRecent(list,{label:'Again',width:105,height:50},99);
  assert.equal(list.length,MAX_RECENT);assert.equal(list[0].label,'Again');assert.equal(list.filter(e=>e.width===105).length,1);
});
test('templates are named, replaced by name, removable and survive storage round-trips',()=>{
  assert.throws(()=>saveTemplate([],'  ',{width:10,height:10}));
  let list=saveTemplate([],'Coasters',{width:100,height:100,count:4,layout:'grid-row',columns:2},'a');
  list=saveTemplate(list,'Signs',{width:300,height:200},'b');
  list=saveTemplate(list,'coasters',{width:90,height:90},'c');
  assert.deepEqual(list.map(t=>[t.id,t.name,t.width]),[['a','coasters',90],['b','Signs',300]]);
  const storage=memoryStorage();
  assert.equal(storeList(storage,TEMPLATES_KEY,list),true);
  assert.deepEqual(loadStoredList(storage,TEMPLATES_KEY),list);
  assert.deepEqual(removeTemplate(list,'a').map(t=>t.id),['b']);
});
test('stored lists ignore corrupt or invalid entries and failing storage',()=>{
  const storage=memoryStorage({[RECENT_KEY]:JSON.stringify([{label:'Ok',width:10,height:10,usedAt:5},{width:-1,height:2},null,'x']),
    [TEMPLATES_KEY]:'{not json'});
  assert.deepEqual(loadStoredList(storage,RECENT_KEY).map(e=>e.label),['Ok']);
  assert.deepEqual(loadStoredList(storage,TEMPLATES_KEY),[]);
  storage.values[TEMPLATES_KEY]=JSON.stringify([{id:1,name:'No id',width:10,height:10},{id:'t',name:'Fine',width:10,height:10}]);
  assert.deepEqual(loadStoredList(storage,TEMPLATES_KEY).map(t=>t.id),['t']);
  assert.equal(storeList({setItem(){throw new Error('quota');}},RECENT_KEY,[]),false);
  assert.deepEqual(loadStoredList(undefined,RECENT_KEY),[]);
});
