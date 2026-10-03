import { DEFAULT_LOOK_ID, LOOKS, getLook } from "./looks.mjs";
import { SHOE_FITS, SHOE_FIT_ISSUES } from "./wardrobe-fits.mjs";

const DEFAULT_BACKGROUND_ID = "moon-room";

export const BACKGROUNDS = Object.freeze([
  {
    id: DEFAULT_BACKGROUND_ID,
    name: "月色房间",
    description: "柔和的蓝紫夜色与窗边灯光",
    theme: "moon",
    kind: "css",
    default: true,
  },
  {
    id: "rose-studio",
    name: "玫瑰影棚",
    description: "暖玫瑰色柔光与棚拍布景",
    theme: "rose",
    kind: "css",
  },
  {
    id: "city-night",
    name: "都市夜景",
    description: "黑金城市灯影与落地窗",
    theme: "city",
    kind: "css",
  },
  {
    id: "ivory-gallery",
    name: "象牙展厅",
    description: "干净明亮的中性全身展示空间",
    theme: "ivory",
    kind: "css",
  },
]);

const styleRecipe = (id, name, region, mood, slots) =>
  Object.freeze({
    id,
    name,
    region,
    mood,
    audience: "adult",
    fitPolicy: "imagegen-adapt",
    slots: Object.freeze(slots),
  });

export const CURATED_STYLE_RECIPES = Object.freeze([
  styleRecipe("kr-ivory-office", "象牙白雕塑通勤", "韩系", "干练、成熟、显腰线", { top: "交叉包裹上衣", bottom: "高腰酒红一步裙", shoes: "黑色红底尖头高跟鞋" }),
  styleRecipe("kr-satin-date", "香槟缎面约会", "韩系", "柔光、浪漫、贴合", { dress: "斜裁缎面中长裙", shoes: "细带高跟凉鞋", accessories: "精细金色腰链" }),
  styleRecipe("kr-halter-tailoring", "挂脖针织裁剪", "韩系", "利落、都市、黑白", { top: "修身黑色挂脖针织上衣", bottom: "高腰阔腿西裤", shoes: "尖头高跟鞋" }),
  styleRecipe("kr-offshoulder-night", "单色露肩夜色", "韩系", "简洁、显肩颈、晚间", { top: "不透明修身露肩上衣", bottom: "高腰修身短裙", shoes: "及膝长靴" }),
  styleRecipe("kr-corset-denim", "结构感上衣与宽松丹宁", "韩系", "收腰、街拍、张力", { top: "结构感不透明胸衣式上衣", bottom: "宽松高腰丹宁裤", shoes: "细跟尖头鞋" }),
  styleRecipe("jp-mode-asymmetry", "东京非对称黑", "日系", "冷感、层次、摩登", { top: "非对称修身黑色上衣", bottom: "高腰建筑感短裙", shoes: "厚底短靴" }),
  styleRecipe("jp-lace-blazer", "蕾丝内搭与西装", "日系", "成熟、精致、软硬平衡", { underwear: "不透明蕾丝吊带内搭", outerwear: "收腰长款西装", bottom: "缎面中长裙", shoes: "后空高跟鞋" }),
  styleRecipe("jp-city-gal", "都市成年 Gal", "日系", "自信、修身、夜行", { outerwear: "短款修身夹克", top: "简洁修身背心", bottom: "高腰 A 字短裙", shoes: "及膝高跟靴" }),
  styleRecipe("jp-modern-kimono", "现代和服夜游", "日系", "传统纹样、收腰、现代", { dress: "改良和服式连身裙", accessories: "简化宽腰带与金属发饰", shoes: "现代系带短靴" }),
  styleRecipe("jp-pearl-jumpsuit", "珍珠剪裁连体裤", "日系", "优雅、成熟、长腿线条", { dress: "收腰阔腿连体裤", accessories: "珍珠耳饰与细腰带", shoes: "极简尖头高跟鞋" }),
]);

const backgroundIds = new Set(BACKGROUNDS.map((item) => item.id));

const groupedLooks = new Map();
for (const look of LOOKS) {
  const list = groupedLooks.get(look.characterId) || [];
  list.push(look);
  groupedLooks.set(look.characterId, list);
}

export let CHARACTERS = Object.freeze(
  [...groupedLooks.entries()].map(([id, looks]) => {
    const defaultLook = looks.find((look) => look.characterDefault) || looks[0];
    return Object.freeze({
      id,
      defaultName: defaultLook.character,
      age: defaultLook.age,
      aliases: Object.freeze([
        ...new Set(looks.flatMap((look) => [look.character, ...look.aliases])),
      ]),
      defaultLookId: defaultLook.id,
      lookIds: Object.freeze(looks.map((look) => look.id)),
    });
  }),
);

let characterById = new Map(CHARACTERS.map((item) => [item.id, item]));
let characterByLookId = new Map(
  LOOKS.map((look) => [look.id, characterById.get(look.characterId)]),
);

export const GARMENT_SLOT_IDS = Object.freeze([
  "hair",
  "top",
  "bottom",
  "dress",
  "outerwear",
  "underwear",
  "hosiery",
  "shoes",
  "nails",
  "watch",
  "earrings",
  "accessories",
]);

export const GARMENT_SLOT_LABELS = Object.freeze({
  hair: "发型", top: "上装", bottom: "下装", dress: "连身装",
  outerwear: "外套", underwear: "内搭 / 内衣", hosiery: "袜类",
  shoes: "鞋履", nails: "指甲颜色", watch: "手表", earrings: "耳环", accessories: "配饰",
});

const wardrobeItem = (id, name, description, asset, details = {}) =>
  Object.freeze({
    id,
    slot: "shoes",
    name,
    description,
    asset,
    audience: "adult",
    fitPolicy: "imagegen-adapt",
    status: "source-ready",
    ...details,
  });

const fanchaItem = (id, slot, name, description, details = {}) => wardrobeItem(
  id, name, description, slot === "nails" ? null : `/wardrobe/items/${id}.png`,
  {slot, sourceLookId: "fancha-rose-office", sourceCharacterId: "fancha",
    embeddedLookIds: Object.freeze(["fancha-rose-office"]), ...details},
);

export let WARDROBE_ITEMS = Object.freeze([
  wardrobeItem(
    "black-pointed-heels",
    "黑色尖头高跟鞋",
    "黑色皮面、尖头与细高跟，适合作为通勤或晚装的合身生成来源。",
    "/wardrobe/items/black-pointed-heels.png",
  ),
  wardrobeItem(
    "ivory-soft-slippers",
    "象牙白软底拖鞋",
    "柔软绒面与轻量软底，适合作为居家造型的合身生成来源。",
    "/wardrobe/items/ivory-soft-slippers.png",
  ),
  fanchaItem("fancha-rose-dress", "dress", "玫瑰粉双排扣连衣裙", "收腰包裹翻领、七分袖与六颗黑色珠宝纽扣，保留自然腰腹曲线。"),
  fanchaItem("fancha-violet-nails", "nails", "亮紫色指甲", "带细腻光泽的紫色甲油，可用于其他人物的指甲配色。", {color: "#A45BEF", kind: "color"}),
  fanchaItem("fancha-ivory-heels", "shoes", "象牙白细跟鞋", "象牙白包头浅口细高跟鞋，保留鞋面的柔和光泽。"),
  fanchaItem("fancha-white-watch", "watch", "白色腕表", "白色表带与精致金属表盘，作为独立腕部配饰。"),
  fanchaItem("fancha-sidepart-hair", "hair", "侧分黑长直发", "侧分光泽黑色长直发，顺着肩部垂落。"),
  fanchaItem("fancha-pearl-earrings", "earrings", "珍珠耳饰", "简洁白色珍珠耳饰，带小巧金属连接细节。"),
]);

const BUILT_IN_ITEMS = WARDROBE_ITEMS;
let wardrobeItemById = new Map(
  WARDROBE_ITEMS.map((item) => [item.id, item]),
);

export function getWardrobeItem(id) {
  return wardrobeItemById.get(id) || null;
}

export function getWardrobeItemsBySlot(slotId) {
  if (!GARMENT_SLOT_IDS.includes(slotId)) return [];
  return WARDROBE_ITEMS.filter((item) => item.slot === slotId);
}

export function getEmbeddedWardrobeItems(lookId) {
  return WARDROBE_ITEMS.filter(item => item.embeddedLookIds?.includes(lookId));
}

// A fit is a complete painting. Every selected slot must match one authored
// combination; independently fitted images must never be stacked or overwritten.
export function normalizeWardrobeSelection(selection = {}, {strict = false, lookId, items = WARDROBE_ITEMS} = {}) {
  const invalid = message => {if (strict) throw new Error(message);};
  if (!selection || typeof selection !== "object" || Array.isArray(selection)) {
    invalid("穿搭选择格式无效。"); return {};
  }
  const byId = new Map(items.map(item => [item.id, item]));
  for (const slot of Object.keys(selection)) if (!GARMENT_SLOT_IDS.includes(slot)) invalid("单品分类无效。");
  return Object.fromEntries(GARMENT_SLOT_IDS.flatMap(slot => {
    const value = selection[slot];
    if (value === undefined || value === null || value === "") return [];
    const item = byId.get(value);
    if (!item || item.slot !== slot) {invalid("单品不存在或不属于所选分类。"); return [];}
    if (lookId && item.embeddedLookIds?.includes(lookId)) return [];
    return [[slot, item.id]];
  }));
}

export function wardrobeSelectionKey(selection = {}, options = {}) {
  return JSON.stringify(normalizeWardrobeSelection(selection, {...options, strict: true}));
}

function fitSelection(fit, items = WARDROBE_ITEMS) {
  if (fit.selection !== undefined) return fit.selection;
  const item = items.find(item => item.id === fit.itemId);
  return item ? {[item.slot]: item.id} : null;
}

export function getWardrobeCombinationFit(lookId, selection = {}, {looks = LOOKS, items = WARDROBE_ITEMS, fits = WARDROBE_FITS} = {}) {
  const look = looks.find(look => look.id === lookId);
  if (!look) return null;
  let key, normalized;
  try {normalized = normalizeWardrobeSelection(selection, {strict: true, lookId, items}); key = wardrobeSelectionKey(normalized, {items});}
  catch {return null;}
  if (!Object.keys(normalized).length) return {lookId, selection: {}, asset: look.asset, rig: look.rig, original: true};
  return fits.find(fit => {
    if (fit.lookId !== lookId) return false;
    try {const candidate = fitSelection(fit, items); return candidate !== null && wardrobeSelectionKey(candidate, {lookId, items}) === key;}
    catch {return false;}
  }) || null;
}

export function getWardrobeSelectionStatus(lookId, selection = {}) {
  if (getWardrobeCombinationFit(lookId, selection)) return {status: "ready", message: "这套组合已适配，可以使用"};
  return {status: "pending", message: "这套组合待适配，当前外观保持不变"};
}

export let WARDROBE_FITS = Object.freeze(
  SHOE_FITS.map((fit) => Object.freeze(fit)),
);

export function getWardrobeFit(lookId, itemId) {
  const item = getWardrobeItem(itemId);
  return item ? getWardrobeCombinationFit(lookId, {[item.slot]: item.id}) : null;
}

export function getWardrobeFitStatus(lookId, itemId) {
  if (getWardrobeFit(lookId, itemId)) return { status: "ready", message: "已适配，点击穿上" };
  const issue = SHOE_FIT_ISSUES.find((entry) => entry.lookId === lookId && entry.itemId === itemId);
  return issue ? { status: "blocked", message: issue.message } : { status: "pending", message: "该造型待适配" };
}

export function getFittedLooksForItem(characterId, itemId, removedLookIds = []) {
  const removed = new Set(removedLookIds);
  return LOOKS.filter((look) => look.characterId === characterId && !removed.has(look.id) && getWardrobeFit(look.id, itemId));
}

export function resolveWardrobeAppearance(lookId, selection = {}) {
  const look = getLook(lookId);
  const fit = getWardrobeCombinationFit(look.id, selection);
  if (!fit || fit.original) return look;
  const normalized = normalizeWardrobeSelection(selection, {lookId: look.id});
  const selectedItems = Object.values(normalized).map(getWardrobeItem);
  const names = selectedItems.map(item => item.name).join(" · ");
  return {
    ...look,
    asset: fit.asset,
    rig: fit.rig,
    thumbnail: fit.asset,
    outfit: `${look.outfit} · ${names}`,
    description: `${look.description} 当前独立单品：${names}。`,
    actions: null,
    wardrobeItemId: selectedItems.length === 1 ? selectedItems[0].id : null,
    wardrobeItemIds: selectedItems.map(item => item.id),
    wardrobeSelection: normalized,
  };
}

const SLOT_PATTERNS = Object.freeze({
  hair: /发|马尾|辫/,
  top: /上衣|衬衫|毛衣|针织|吊带|短袖|露肩|高领|束身/,
  bottom: /短裙|长裙|一步裙|半身裙|百褶裙|短裤|长裤|阔腿裤|西裤/,
  dress: /连衣裙|礼服|旗袍|汉服|婚纱|华服|和服|裙装|襁裙/,
  outerwear: /外套|皮衣|夹克|风衣|西装|大衣/,
  underwear: /内衣|文胸|比基尼|内搭/,
  hosiery: /丝袜|连裤袜|长筒袜|过膝袜|黑丝|白丝|袜/,
  shoes: /高跟鞋|镴|凉鞋|鞋/,
  nails: /指甲|美甲|甲油/,
  watch: /手表|腕表/,
  earrings: /耳环|耳饰|耳钉/,
  accessories: /眼罩|颈带|腰带|耳|项链|手链|工牌|王冠|宝石|发簪|头饰|手套|丝巾|腰饰|珍珠|领带/,
});

function getSlotFragments(look, slotId) {
  const fragments = look.description
    .split(/[，。；]|(?:，?配)/)
    .map((value) => value.trim())
    .filter(Boolean);
  const matches = fragments.filter((value) => SLOT_PATTERNS[slotId].test(value));
  if (slotId === "hair" && !matches.length) matches.push(`延用${look.character}发型`);
  return [...new Set(matches)];
}

function buildSlots(look) {
  return Object.freeze(
    Object.fromEntries(
      GARMENT_SLOT_IDS.map((slotId) => [
        slotId,
        Object.freeze(
          getSlotFragments(look, slotId).map((name, index) =>
            Object.freeze({
              id: `${look.id}:${slotId}:${index + 1}`,
              slot: slotId,
              name,
              sourceLookId: look.id,
              sourceCharacterId: look.characterId,
              sourceAsset: look.asset,
              fitPolicy: "imagegen-adapt",
            }),
          ),
        ),
      ]),
    ),
  );
}

export let OUTFIT_VARIANTS = Object.freeze(
  LOOKS.map((look) =>
    Object.freeze({
      id: look.id,
      lookId: look.id,
      characterId: look.characterId,
      name: look.outfit,
      description: look.description,
      baseLayer: look.baseLayer,
      asset: look.asset,
      rig: look.rig || `/looks/${look.id}/rig.json`,
      slots: buildSlots(look),
      status: "ready",
    }),
  ),
);

let outfitVariantByLookId = new Map(
  OUTFIT_VARIANTS.map((variant) => [variant.lookId, variant]),
);

export function getOutfitVariant(lookId) {
  return outfitVariantByLookId.get(lookId) || outfitVariantByLookId.get(DEFAULT_LOOK_ID);
}

export function getVariantsBySlot(slotId) {
  if (!GARMENT_SLOT_IDS.includes(slotId)) return [];
  return OUTFIT_VARIANTS.filter((variant) => variant.slots[slotId].length > 0);
}

export function resolveEmptyOutfit(characterId, currentLookId) {
  const authoredSafeBase = OUTFIT_VARIANTS.find(
    (variant) =>
      variant.characterId === characterId &&
      variant.baseLayer === "white-bikini" &&
      variant.status === "ready",
  );
  if (authoredSafeBase) {
    return {
      status: "ready",
      characterId,
      requestedBase: "white-bikini",
      lookId: authoredSafeBase.lookId,
      message: "已换上白色比基尼安全底装",
    };
  }
  const current = outfitVariantByLookId.get(currentLookId);
  return {
    status: "pending",
    characterId,
    requestedBase: "white-bikini",
    lookId: current?.lookId || getCharacter(characterId).defaultLookId,
    message: "白色比基尼适配待生成",
  };
}

export function getCharacter(id) {
  return (
    characterById.get(id) ||
    characterByLookId.get(DEFAULT_LOOK_ID) ||
    CHARACTERS[0]
  );
}

export function getCharacterForLook(lookId) {
  return characterByLookId.get(lookId) || getCharacter(getLook(DEFAULT_LOOK_ID).characterId);
}

export function getCharacterLooks(characterId) {
  const character = getCharacter(characterId);
  return character.lookIds.map((id) => getLook(id));
}

export function isBackgroundId(id) {
  return backgroundIds.has(id);
}

export function getDefaultBackgroundId() {
  return DEFAULT_BACKGROUND_ID;
}

export function setLocalWardrobe({items = [], fits = []} = {}) {
  const reserved = new Set(BUILT_IN_ITEMS.map(item => item.id));
  const localItems = Array.isArray(items) ? items.filter(item => item && typeof item.id === 'string' && item.id.startsWith('local-item-') && !reserved.has(item.id) && GARMENT_SLOT_IDS.includes(item.slot) && typeof item.asset === 'string' && item.asset.startsWith('/local-studio/assets/')) : [];
  WARDROBE_ITEMS = Object.freeze([...BUILT_IN_ITEMS, ...localItems.map(item => Object.freeze({...item}))]);
  wardrobeItemById = new Map(WARDROBE_ITEMS.map(item => [item.id,item]));
  const knownLooks = new Set(LOOKS.map(look => look.id));
  const localFits = Array.isArray(fits) ? fits.filter(fit => {
    if (!fit || !knownLooks.has(fit.lookId) || typeof fit.asset !== 'string' || !fit.asset.startsWith('/local-studio/assets/') || typeof fit.rig !== 'string' || !fit.rig.startsWith('/local-studio/assets/')) return false;
    try {const selection = fitSelection(fit); if (selection === null) return false; wardrobeSelectionKey(selection, {lookId: fit.lookId}); return true;} catch {return false;}
  }) : [];
  const key = fit => `${fit.lookId}:${wardrobeSelectionKey(fitSelection(fit), {lookId: fit.lookId})}`;
  const combined = new Map([...SHOE_FITS, ...localFits].map(fit => [key(fit), Object.freeze({...fit})]));
  WARDROBE_FITS = Object.freeze([...combined.values()]);
  const groups = new Map();
  for(const look of LOOKS) {const list=groups.get(look.characterId) || [];list.push(look);groups.set(look.characterId,list);}
  CHARACTERS = Object.freeze([...groups.entries()].map(([id,looks]) => {
    const defaultLook = looks.find(look => look.characterDefault) || looks[0];
    return Object.freeze({id,defaultName:defaultLook.character,age:defaultLook.age,aliases:Object.freeze([...new Set(looks.flatMap(look => [look.character,...look.aliases]))]),defaultLookId:defaultLook.id,lookIds:Object.freeze(looks.map(look => look.id))});
  }));
  characterById = new Map(CHARACTERS.map(item => [item.id,item]));
  characterByLookId = new Map(LOOKS.map(look => [look.id,characterById.get(look.characterId)]));
  OUTFIT_VARIANTS = Object.freeze(LOOKS.map(look => Object.freeze({id:look.id,lookId:look.id,characterId:look.characterId,name:look.outfit,description:look.description,baseLayer:look.baseLayer,asset:look.asset,rig:look.rig || `/looks/${look.id}/rig.json`,slots:buildSlots(look),status:'ready'})));
  outfitVariantByLookId = new Map(OUTFIT_VARIANTS.map(variant => [variant.lookId,variant]));
}
