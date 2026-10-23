import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePreferences,loadPreferences,PREFERENCES_KEY} from '../../preferences.mjs';
import {translator} from '../../i18n.mjs';
test('Laser Preview defaults off, persists user choices and rejects malformed preferences',()=>{
  assert.equal(normalizePreferences({}).laserPreviewEnabled,false);
  assert.equal(normalizePreferences({}).hideLaserPreviewIntro,false);
  const saved=loadPreferences({getItem:key=>{assert.equal(key,PREFERENCES_KEY);return JSON.stringify({laserPreviewEnabled:true,hideLaserPreviewIntro:true});}});
  assert.equal(saved.laserPreviewEnabled,true);assert.equal(saved.hideLaserPreviewIntro,true);
  assert.equal(normalizePreferences({laserPreviewEnabled:'true',hideLaserPreviewIntro:1}).laserPreviewEnabled,false);
  assert.equal(normalizePreferences({hideLaserPreviewIntro:false},saved).hideLaserPreviewIntro,false);
});
test('Cut process preview defaults off with red cut, blue dashed score and gray engrave',()=>{
  const d=normalizePreferences({});
  assert.deepEqual([d.processPreview,d.processPreviewCut,d.processPreviewScore,d.processPreviewEngrave,d.processPreviewScoreDashed],[false,'#e0201b','#1f6fe0','#4d4d4d',true]);
  const saved=normalizePreferences({processPreview:true,processPreviewCut:'#00FF00',processPreviewScore:'red',processPreviewScoreDashed:false});
  assert.equal(saved.processPreview,true);assert.equal(saved.processPreviewCut,'#00ff00');
  assert.equal(saved.processPreviewScore,'#1f6fe0','only #rrggbb colours are kept');assert.equal(saved.processPreviewScoreDashed,false);
});
test('Laser Preview labels and unresolved counts translate to bokmål',()=>{
  const t=translator('nb');assert.equal(t('Laser Preview'),'Laserforhåndsvisning');
  assert.equal(t('Unresolved objects: 3'),'Uavklarte objekter: 3');assert.equal(t('Vector #FF0000'),'Vektor #FF0000');
});
