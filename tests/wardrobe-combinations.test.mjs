import test from 'node:test';
import assert from 'node:assert/strict';
import * as wardrobe from '../server/wardrobe.mjs';
import {getLook} from '../server/looks.mjs';

test('Fancha contributes six reusable parts with dedicated appearance slots',()=>{
  assert.equal(wardrobe.GARMENT_SLOT_LABELS.nails,'指甲颜色');
  assert.deepEqual(wardrobe.getEmbeddedWardrobeItems('fancha-rose-office').map(item=>item.slot).sort(),['dress','earrings','hair','nails','shoes','watch']);
  const nails=wardrobe.getWardrobeItem('fancha-violet-nails');
  assert.equal(nails.color,'#A45BEF');
  assert.equal(nails.sourceCharacterId,'fancha');
});

test('selection keys validate ownership of slots and are independent of property order',()=>{
  const selection={watch:'fancha-white-watch',nails:'fancha-violet-nails'};
  assert.equal(wardrobe.wardrobeSelectionKey(selection),wardrobe.wardrobeSelectionKey({nails:selection.nails,watch:selection.watch}));
  assert.throws(()=>wardrobe.normalizeWardrobeSelection({hair:selection.watch},{strict:true}),/分类|单品/);
  assert.throws(()=>wardrobe.normalizeWardrobeSelection({unknown:'fancha-white-watch'},{strict:true}),/分类/);
  assert.throws(()=>wardrobe.normalizeWardrobeSelection([],{strict:true}),/穿搭/);
  assert.deepEqual(wardrobe.normalizeWardrobeSelection({watch:null}),{});
});

test('original extracted parts are visually ready only on their source look',()=>{
  const selection={dress:'fancha-rose-dress',nails:'fancha-violet-nails',watch:'fancha-white-watch'};
  assert.equal(wardrobe.getWardrobeSelectionStatus('fancha-rose-office',selection).status,'ready');
  assert.equal(wardrobe.resolveWardrobeAppearance('fancha-rose-office',selection),getLook('fancha-rose-office'));
  assert.equal(wardrobe.getWardrobeCombinationFit('ruby-velvet',selection),null);
  assert.equal(wardrobe.getWardrobeFit('missing','fancha-white-watch'),null);
});

test('separate full-body fits never silently combine or leak onto another character',()=>{
  const first={lookId:'ruby-velvet',selection:{nails:'fancha-violet-nails'},itemId:'fancha-violet-nails',asset:'/local-studio/assets/nails/character.png',rig:'/local-studio/assets/nails/rig.json'};
  const second={lookId:'ruby-velvet',selection:{watch:'fancha-white-watch'},itemId:'fancha-white-watch',asset:'/local-studio/assets/watch/character.png',rig:'/local-studio/assets/watch/rig.json'};
  const selection={nails:first.itemId,watch:second.itemId};
  wardrobe.setLocalWardrobe({fits:[first,second]});
  try {
    assert.ok(wardrobe.getWardrobeCombinationFit('ruby-velvet',first.selection));
    assert.equal(wardrobe.getWardrobeCombinationFit('ruby-velvet',selection),null);
    assert.equal(wardrobe.resolveWardrobeAppearance('ruby-velvet',selection),getLook('ruby-velvet'));
    const combination={...second,selection,asset:'/local-studio/assets/both/character.png'};
    wardrobe.setLocalWardrobe({fits:[first,second,combination]});
    const appearance=wardrobe.resolveWardrobeAppearance('ruby-velvet',selection);
    assert.equal(appearance.asset,combination.asset);
    assert.deepEqual(appearance.wardrobeSelection,selection);
    assert.equal(appearance.actions,null);
    assert.equal(appearance.characterId,'ruby');
    assert.equal(wardrobe.getWardrobeCombinationFit('fancha-rose-office',first.selection)?.asset,getLook('fancha-rose-office').asset);
    assert.equal(wardrobe.getWardrobeCombinationFit('linwei-red-sole',selection),null);
    assert.equal(wardrobe.getWardrobeCombinationFit('ruby-velvet',second.selection).asset,second.asset);
  } finally {wardrobe.setLocalWardrobe({});}
});
