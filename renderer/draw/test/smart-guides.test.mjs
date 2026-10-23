import test from 'node:test';
import assert from 'node:assert/strict';
import {snapTranslation} from '../tools/selection.mjs';
import {DEFAULT_SMART_GUIDES,loadPreferences,normalizePreferences} from '../../preferences.mjs';

test('Smart Guide preferences survive storage, accept valid values and reject invalid input',()=>{
  const values={smartGuideColor:'#A01BAD',smartGuideAlignment:false,smartGuideHighlight:false,smartGuideMeasurements:false,smartGuideSpacing:false,smartGuideTolerance:12};
  const saved=normalizePreferences(values),loaded=loadPreferences({getItem:()=>JSON.stringify(saved)});
  for(const [key,value] of Object.entries(values))assert.equal(loaded[key],typeof value==='string'?value.toLowerCase():value);
  const bad=normalizePreferences({smartGuideColor:'red',smartGuideAlignment:'false',smartGuideTolerance:NaN});
  for(const key of Object.keys(DEFAULT_SMART_GUIDES))assert.equal(bad[key],DEFAULT_SMART_GUIDES[key]);
  assert.equal(normalizePreferences({smartGuideTolerance:100}).smartGuideTolerance,20);
  assert.equal(normalizePreferences({smartGuideTolerance:-2}).smartGuideTolerance,1);
});

test('alignment and tolerance are independent from equal spacing',()=>{
  const box={x:0,y:0,width:10,height:10},targets=[{x:30,y:40,id:'target',label:'center'}];
  assert.equal(snapTranslation(box,[18,0],targets,4).x,20);
  assert.equal(snapTranslation(box,[18,0],targets,1).x,18);
  assert.equal(snapTranslation(box,[18,0],targets,4,{alignment:false}).x,18);
  assert.equal(snapTranslation(box,[18,0],targets,4).guides[0].targetId,'target');
});

test('equal spacing snaps between neighbours and repeats a gap on either side, on both axes',()=>{
  for(const axis of ['x','y']) {
    const vertical=axis==='y',box={x:0,y:0,width:10,height:10};
    const boxes=[{...box,[axis]:20},{...box,[axis]:70}];
    const snap=value=>snapTranslation(box,vertical?[0,value]:[value,0],[],2,{alignment:false,spacing:true,boxes});
    for(const [near,expected,gap] of [[44,45,15],[-29,-30,40],[119,120,40]]) {
      const result=snap(near);assert.equal(result[axis],expected);
      const guides=result.guides.filter(g=>g.axis===axis);assert.equal(guides.length,2);
      assert.ok(guides.every(g=>g.kind==='spacing'&&g.distance===gap));
    }
    assert.equal(snap(42)[axis],42,'outside tolerance');
    const blocked=snapTranslation(box,vertical?[0,19]:[19,0],[],2,{alignment:false,spacing:true,boxes:[...boxes,{...box,[axis]:120}]});
    assert.equal(blocked[axis],19,'a repeated gap must not overlap another neighbour');
    const disabled=snapTranslation(box,vertical?[0,44]:[44,0],[],2,{alignment:false,spacing:false,boxes});
    assert.equal(disabled[axis],44);
    const elsewhere=boxes.map(b=>({...b,[vertical?'x':'y']:100}));
    assert.equal(snapTranslation(box,vertical?[0,44]:[44,0],[],2,{alignment:false,spacing:true,boxes:elsewhere})[axis],44,'unrelated rows do not snap');
  }
});
