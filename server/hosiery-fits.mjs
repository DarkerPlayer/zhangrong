// Shared hosiery explicitly assigned to these character collections by the user.
// Collection membership does not imply a fit for other outfits or combinations.
export const HOSIERY_COLLECTION_CHARACTER_IDS = Object.freeze([
  "wen-furen", "ling-yuling", "mei-ning", "songyu", "yinyue", "ziling",
]);

export const HOSIERY_LOOK_IDS = Object.freeze([
  "wen-furen-black-gold", "ling-yuling-jade-robes", "mei-ning-teal-attire",
  "songyu-azure-robes", "yinyue-silver-fox", "ziling-violet-dress",
  "ziling-violet-veil", "ziling-white-robes",
]);

export const HOSIERY_ITEMS = Object.freeze([
  { id: "sheer-black-stockings", name: "黑色丝袜", description: "黑丝 · 黑色轻透长筒丝袜，沿腿部曲线贴合，保留原造型的衣服与鞋履。" },
  { id: "sheer-white-stockings", name: "白色丝袜", description: "白丝 · 白色轻透长筒丝袜，带柔和织物质感，保留原造型的衣服与鞋履。" },
  { id: "black-fishnet-stockings", name: "黑色渔网袜", description: "渔网袜 · 黑色菱形网眼长筒袜，网格随腿部曲线变化，保留原造型的衣服与鞋履。" },
].map(Object.freeze));

export const HOSIERY_FITS = Object.freeze(HOSIERY_LOOK_IDS.flatMap(lookId =>
  HOSIERY_ITEMS.map(({ id: itemId }) => Object.freeze({
    lookId,
    itemId,
    selection: Object.freeze({ hosiery: itemId }),
    asset: `/wardrobe/fits/${lookId}/${itemId}/character.png`,
    rig: `/wardrobe/fits/${lookId}/${itemId}/rig.json`,
    ...(lookId === "songyu-azure-robes" ? { visibility: "fully-occluded", visibilityNote: "及地长裙遮住袜子，当前造型不会露出袜面。" } : {}),
  })),
));
