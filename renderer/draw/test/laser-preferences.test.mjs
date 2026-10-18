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
test('Laser Preview labels and unresolved counts translate to bokmål',()=>{
  const t=translator('nb');assert.equal(t('Laser Preview'),'Laserforhåndsvisning');
  assert.equal(t('Unresolved objects: 3'),'Uavklarte objekter: 3');assert.equal(t('Vector #FF0000'),'Vektor #FF0000');
});
