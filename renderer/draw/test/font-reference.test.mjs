import test from 'node:test';
import assert from 'node:assert/strict';
import { validGoogleReference,validFontAxes } from '../doc/font-reference.mjs';
import { pointText,DEFAULT_CHARACTER,textProperties } from '../doc/text.mjs';
import { createDocument,validateDocument } from '../doc/schema.mjs';
const ref={family:'Roboto',url:'https://fonts.gstatic.com/s/roboto/v1/font.ttf',sha256:'a'.repeat(64),license:'License text. '.repeat(30)};
test('portable Google references and axes are checked at both UI and document boundaries',()=>{
  assert.ok(validGoogleReference(ref));assert.ok(validFontAxes({wght:650,wdth:90}));
  for(const axes of [{bad:1},{wght:NaN},[],{wght:Infinity}])assert.equal(!!validFontAxes(axes),false);
  const v={...DEFAULT_CHARACTER,text:'A',fontSource:'google',fontFamily:'Roboto',fontWeight:650,fontAxes:{wght:650},alignment:'left',googleFont:ref};
  const node=pointText([0,0],v),data=createDocument();data.layers[0].children=[node];assert.deepEqual(validateDocument(data),[]);
  for(const patch of [{url:'file:///private.ttf'},{url:'https://example.com/font.ttf'},{url:'https://fonts.gstatic.com@evil.com/font.ttf'},{sha256:'invalid'},{license:''}]) {
    assert.throws(()=>textProperties({...v,googleFont:{...ref,...patch}}),/reference/);
    node.character.googleFont={...ref,...patch};assert.ok(validateDocument(data).some(e=>e.path.endsWith('.googleFont')));
  }
});
