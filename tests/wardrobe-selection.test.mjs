import test from 'node:test';
import assert from 'node:assert/strict';
import { planWardrobeSelection, importedWardrobeSelection } from '../src/wardrobe-selection.mjs';
import { setLocalWardrobe, resolveWardrobeAppearance } from '../server/wardrobe.mjs';
import { restoreState } from '../src/state.mjs';
import { capturePersonaAppearance, switchPersonaAppearance } from '../src/persona-appearance.mjs';

const lookId = 'linwei-white-bikini';
const nails = 'fancha-violet-nails';
const watch = 'fancha-white-watch';
const asset = (id) => `/local-studio/assets/${id}/character.png`;
const rig = (id) => `/local-studio/assets/${id}/rig.json`;
const installFits = () => setLocalWardrobe({fits:[
  {lookId,itemId:nails,selection:{nails},asset:asset('nails'),rig:rig('nails')},
  {lookId,itemId:watch,selection:{nails,watch},asset:asset('nails-watch'),rig:rig('nails-watch')},
]});

test('wardrobe changes only commit exact ready combinations and preserve other slots', () => {
  installFits();
  try {
    const first = planWardrobeSelection({lookId,selection:{},slotId:'nails',itemId:nails});
    assert.equal(first.status,'ready');
    assert.deepEqual(first.selection,{nails});
    const pair = planWardrobeSelection({lookId,selection:first.selection,slotId:'watch',itemId:watch});
    assert.equal(pair.status,'ready');
    assert.deepEqual(pair.selection,{nails,watch});
    assert.equal(pair.appearance.asset,asset('nails-watch'));
    const restore = planWardrobeSelection({lookId,selection:pair.selection,slotId:'watch',itemId:null});
    assert.equal(restore.status,'ready');
    assert.deepEqual(restore.selection,{nails});
    assert.equal(restore.appearance.asset,asset('nails'));
    const missing = planWardrobeSelection({lookId,selection:pair.selection,slotId:'nails',itemId:null});
    assert.equal(missing.status,'pending');
    assert.deepEqual(missing.selection,{watch});
    assert.equal(resolveWardrobeAppearance(lookId,pair.selection).asset,asset('nails-watch'));
  } finally {setLocalWardrobe();}
});

test('source outfit originals restore that slot and malformed item slots cannot be worn', () => {
  const original = planWardrobeSelection({lookId:'fancha-rose-office',selection:{},slotId:'dress',itemId:'fancha-rose-dress'});
  assert.equal(original.status,'ready');
  assert.deepEqual(original.selection,{});
  assert.equal(planWardrobeSelection({lookId,selection:{},slotId:'watch',itemId:nails}).status,'invalid');
  assert.equal(planWardrobeSelection({lookId,selection:{},slotId:'unknown',itemId:null}).status,'invalid');
});

test('imported combinations and restore-to-original are accepted only when the exact artwork exists', () => {
  installFits();
  try {
    assert.deepEqual(importedWardrobeSelection({kind:'fit',input:{baseLookId:lookId},importedSelection:{nails,watch}}),{lookId,selection:{nails,watch}});
    assert.deepEqual(importedWardrobeSelection({kind:'fit',input:{baseLookId:lookId},importedSelection:{}}),{lookId,selection:{}});
    assert.equal(importedWardrobeSelection({kind:'fit',input:{baseLookId:lookId},importedSelection:{watch}}),null);
    assert.equal(importedWardrobeSelection({kind:'fit',input:{baseLookId:'missing'},importedSelection:{}}),null);
    assert.deepEqual(importedWardrobeSelection({kind:'fit',input:{baseLookId:lookId},importedItemId:nails}),{lookId,selection:{nails}});
  } finally {setLocalWardrobe();}
});

test('all extracted slots persist independently per character and companion', () => {
  const kit={dress:'fancha-rose-dress',nails,shoes:'fancha-ivory-heels',watch,hair:'fancha-sidepart-hair',earrings:'fancha-pearl-earrings'};
  let state=restoreState(JSON.stringify({...restoreState(null),lookId,wardrobeSelections:{linwei:kit,ruby:{nails}}}));
  assert.deepEqual(state.wardrobeSelections.linwei,kit);
  assert.deepEqual(capturePersonaAppearance(state).wardrobeSelections.ruby,{nails});
  state=switchPersonaAppearance(state,'boss-girlfriend');
  state={...state,wardrobeSelections:{linwei:{watch}}};
  state=switchPersonaAppearance(state,'older-sister');
  assert.deepEqual(state.wardrobeSelections.linwei,kit);
});
