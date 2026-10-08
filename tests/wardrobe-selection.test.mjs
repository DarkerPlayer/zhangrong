import test from 'node:test';
import assert from 'node:assert/strict';
import { planWardrobeSelection, importedWardrobeSelection } from '../src/wardrobe-selection.mjs';
import { getEmbeddedWardrobeItems, setLocalWardrobe, resolveWardrobeAppearance } from '../server/wardrobe.mjs';
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

test('Wanhong necklace and waist pendants coexist as original accessories', () => {
  const sourceLookId = 'wanhong-vermilion-robes';
  const accessories = getEmbeddedWardrobeItems(sourceLookId).filter(item => item.slot === 'accessories');
  assert.deepEqual(accessories.map(item => item.id).sort(), [
    'wanhong-beaded-necklace',
    'wanhong-jade-waist-pendants',
  ]);
  const original = resolveWardrobeAppearance(sourceLookId, {});
  for (const item of accessories) {
    const result = planWardrobeSelection({lookId:sourceLookId,selection:{},slotId:'accessories',itemId:item.id});
    assert.equal(result.status,'ready');
    assert.deepEqual(result.selection,{});
    assert.equal(result.appearance,original);
  }
});

test('unfitted waist pendants replace the requested accessory slot without replacing another character appearance', () => {
  const necklace = 'wanhong-beaded-necklace';
  const pendants = 'wanhong-jade-waist-pendants';
  const currentSelection = {nails,accessories:necklace};
  setLocalWardrobe({fits:[{
    lookId,selection:currentSelection,asset:asset('nails-necklace'),rig:rig('nails-necklace'),
  }]});
  try {
    const current = resolveWardrobeAppearance(lookId,currentSelection);
    const result = planWardrobeSelection({lookId,selection:currentSelection,slotId:'accessories',itemId:pendants});
    assert.equal(result.status,'pending');
    assert.deepEqual(result.selection,{nails,accessories:pendants});
    assert.equal(result.appearance,undefined);
    assert.deepEqual(currentSelection,{nails,accessories:necklace});
    assert.equal(resolveWardrobeAppearance(lookId,currentSelection).asset,asset('nails-necklace'));
    assert.equal(current.characterId,'linwei');
  } finally {setLocalWardrobe();}
});

test('Wanhong original underlayer restores only underwear while retaining another fitted slot', () => {
  const sourceLookId = 'wanhong-vermilion-robes';
  const briefs = 'wanhong-vermilion-briefs';
  const original = planWardrobeSelection({lookId:sourceLookId,selection:{},slotId:'underwear',itemId:briefs});
  assert.equal(original.status,'ready');
  assert.deepEqual(original.selection,{});
  assert.equal(original.appearance.asset,'/looks/wanhong-vermilion-robes/character.png');
  const replacement = 'local-item-replacement-underlayer';
  setLocalWardrobe({
    items:[{id:replacement,slot:'underwear',asset:asset('replacement-underlayer')}],
    fits:[
      {lookId:sourceLookId,selection:{nails},asset:asset('wanhong-nails'),rig:rig('wanhong-nails')},
      {lookId:sourceLookId,selection:{underwear:replacement,nails},asset:asset('wanhong-underlayer-nails'),rig:rig('wanhong-underlayer-nails')},
    ],
  });
  try {
    const result = planWardrobeSelection({lookId:sourceLookId,selection:{underwear:replacement,nails},slotId:'underwear',itemId:briefs});
    assert.equal(result.status,'ready');
    assert.deepEqual(result.selection,{nails});
    assert.equal(result.appearance.asset,asset('wanhong-nails'));
  } finally {setLocalWardrobe();}
});

test('unfitted Wanhong underlayer keeps another character appearance and its fitted slots', () => {
  installFits();
  try {
    const currentSelection = {nails,watch};
    const result = planWardrobeSelection({lookId,selection:currentSelection,slotId:'underwear',itemId:'wanhong-vermilion-briefs'});
    assert.equal(result.status,'pending');
    assert.deepEqual(result.selection,{underwear:'wanhong-vermilion-briefs',nails,watch});
    assert.equal(result.appearance,undefined);
    assert.deepEqual(currentSelection,{nails,watch});
    assert.equal(resolveWardrobeAppearance(lookId,currentSelection).asset,asset('nails-watch'));
  } finally {setLocalWardrobe();}
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
