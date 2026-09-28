// Shared by the browser bundle and packaged local dialogue service.
const makeLook = (
  id,
  character,
  age,
  outfit,
  description,
  color,
  metadata = {},
) => ({
  id,
  name: `${character} · ${outfit}`,
  character,
  age,
  outfit,
  description,
  color,
  region: metadata.region || null,
  styles: metadata.styles || ["成熟"],
  isNew: metadata.isNew === true,
  greetingMotion: metadata.greetingMotion || "wave",
  characterDefault: metadata.characterDefault === true,
  actions: metadata.actions || null,
  aliases: [
    ...new Set([
      outfit,
      ...(metadata.aliases || []),
      ...(metadata.characterDefault ? [character] : []),
    ]),
  ],
  renderer: "glam",
  asset: `/looks/${id}/character.png`,
  thumbnail: `/looks/${id}/character.png`,
  textures: null,
});

const recent = (region, styles = []) => ({
  region,
  styles,
  isNew: true,
  greetingMotion: "nod",
});

export const LOOKS = [
  makeLook(
    "linwei-ivory-wrap",
    "林薇",
    28,
    "象牙白通勤",
    "栗棕长卷发、象牙白高领交叉上衣与黑色高腰短裙，配黑色高跟鞋、金色手链和黑色耳钉。",
    "#d8cfc2",
    {
      ...recent(null, ["成熟"]),
      aliases: [
        "象牙白职场",
        "象牙交叉领",
        "白色交叉高领",
        "黑裙白衫",
        "浅色高领",
        "象牙白上衣",
      ],
      actions: {
        squat: ["/looks/linwei-ivory-wrap/actions/squat.png"],
        sexyWalk: [
          "/looks/linwei-ivory-wrap/actions/walk-01.png",
          "/looks/linwei-ivory-wrap/actions/walk-01-02.png",
          "/looks/linwei-ivory-wrap/actions/walk-02.png",
          "/looks/linwei-ivory-wrap/actions/walk-02-03.png",
          "/looks/linwei-ivory-wrap/actions/walk-03.png",
          "/looks/linwei-ivory-wrap/actions/walk-03-04.png",
          "/looks/linwei-ivory-wrap/actions/walk-04.png",
          "/looks/linwei-ivory-wrap/actions/walk-04-01.png",
        ],
      },
    },
  ),
  makeLook(
    "linwei-red-sole",
    "林薇",
    28,
    "酒红职场",
    "栗棕长卷发、白色通勤衬衫与酒红一步裙，配工牌和黑色红底高跟鞋。",
    "#9e3545",
    {
      ...recent(null, ["成熟"]),
      characterDefault: true,
      aliases: ["酒红通勤", "红底高跟鞋", "红底鞋", "白衬衫红裙"],
      actions: {
        squat: ["/looks/linwei-red-sole/actions/squat.png"],
        sexyWalk: [
          "/looks/linwei-red-sole/actions/walk-01.png",
          "/looks/linwei-red-sole/actions/walk-01-02.png",
          "/looks/linwei-red-sole/actions/walk-02.png",
          "/looks/linwei-red-sole/actions/walk-02-03.png",
          "/looks/linwei-red-sole/actions/walk-03.png",
          "/looks/linwei-red-sole/actions/walk-03-04.png",
          "/looks/linwei-red-sole/actions/walk-04.png",
          "/looks/linwei-red-sole/actions/walk-04-01.png",
        ],
      },
    },
  ),
  makeLook(
    "xuanling-golden-crown",
    "美杜莎",
    28,
    "金枝王冠",
    "枝形金冠与蓝宝石点缀白金高领长礼服。",
    "#d3b386",
    {
      ...recent("中式"),
      characterDefault: true,
      aliases: ["金枝王冠", "白金宫廷礼服", "蓝宝石王冠"],
    },
  ),
  makeLook(
    "noir-evening",
    "夜澜",
    28,
    "黑丝晚礼服",
    "墨色长发，珍珠腰饰与黑色礼服。",
    "#b8a5cf",
    {
      characterDefault: true,
      aliases: [
        "黑色晚礼服",
        "晚宴黑裙",
        "黑色连裤袜",
        "黑连裤袜",
        "黑色丝袜",
        "黑丝袜",
        "黑色丝",
        "黑丝",
      ],
    },
  ),
  makeLook(
    "noir-office",
    "夜澜",
    28,
    "黑丝通勤",
    "白色衬衫、修身短裙与轻透黑丝。",
    "#9eacc7",
    {
      aliases: ["通勤", "职业装", "职业套装", "白衬衫", "白色衬衫"],
    },
  ),
  makeLook(
    "ruby-velvet",
    "绯月",
    29,
    "酒红丝绒",
    "酒红卷发，丝绒短裙与黑色丝袜。",
    "#cb8d9f",
    {
      characterDefault: true,
      aliases: ["丝绒", "酒红礼服", "酒红色礼服", "酒红裙", "酒红色裙"],
    },
  ),
  makeLook(
    "ruby-date",
    "绯月",
    29,
    "约会礼服",
    "香槟缎面、金色腰链与晚间约会。",
    "#d1a0a4",
    {
      aliases: ["香槟礼服", "香槟色礼服", "香槟裙", "香槟色裙", "绯月约会"],
    },
  ),
  makeLook(
    "silver-leather",
    "霜华",
    27,
    "机车皮衣",
    "银色长发，黑色皮衣与机车短靴。",
    "#a4bfd0",
    {
      characterDefault: true,
      aliases: ["皮衣", "机车", "皮裙"],
    },
  ),
  makeLook(
    "silver-knit",
    "霜华",
    27,
    "慵懒针织",
    "奶油高领针织裙，配上温暖短靴。",
    "#c5bbae",
    {
      aliases: ["高领针织", "奶油针织", "针织裙", "霜华针织", "霜华毛衣"],
    },
  ),
  makeLook(
    "sakura-cafe",
    "樱奈",
    26,
    "草莓奶油",
    "粉色开衫与奶油连衣裙，甜美的咖啡时光。",
    "#e4a6bc",
    {
      ...recent("日系", ["可爱"]),
      characterDefault: true,
      aliases: ["草莓开衫", "粉色开衫", "樱奈咖啡"],
    },
  ),
  makeLook(
    "sakura-kimono",
    "樱奈",
    26,
    "樱花和服",
    "花瓣色和服，绽放温柔的春日气息。",
    "#deb0c8",
    {
      ...recent("日系", ["可爱"]),
      aliases: ["和服", "樱奈和服"],
    },
  ),
  makeLook(
    "yuki-lolita",
    "雪乃",
    27,
    "紫藤洛丽塔",
    "淡紫色浪漫洋装，精致蕾丝与优雅裙摆。",
    "#b9a7df",
    {
      ...recent("日系", ["可爱"]),
      characterDefault: true,
      aliases: ["洛丽塔", "洛丽塔洋装", "紫藤洋装"],
    },
  ),
  makeLook(
    "yuki-snow",
    "雪乃",
    27,
    "雪日披肩",
    "象牙白小披肩，搭配浅蓝色连衣裙。",
    "#b9d2e2",
    {
      ...recent("日系", ["可爱"]),
      aliases: ["白色披肩", "雪乃披肩"],
    },
  ),
  makeLook(
    "zhixia-qipao",
    "知夏",
    28,
    "翡翠旗袍",
    "翡翠绿旗袍，勾勒从容雅致的中式韵味。",
    "#82bea5",
    {
      ...recent("中式"),
      characterDefault: true,
      aliases: ["旗袍", "知夏旗袍"],
    },
  ),
  makeLook(
    "zhixia-city",
    "知夏",
    28,
    "都市白茶",
    "奶油色西装外套，配海军蓝长裤。",
    "#c6bfae",
    {
      ...recent("中式"),
      aliases: ["白茶西装", "奶油西装", "知夏西装"],
    },
  ),
  makeLook(
    "lingyue-hanfu",
    "灵玥",
    27,
    "青岚汉服",
    "青岚色层叠衣袖，轻盈的东方风雅。",
    "#9ac8c6",
    {
      ...recent("中式"),
      characterDefault: true,
      aliases: ["汉服", "灵玥汉服"],
    },
  ),
  makeLook(
    "lingyue-moon",
    "灵玥",
    27,
    "月白仙裙",
    "月白长裙与柔和光泽，清雅而轻灵。",
    "#cad1e4",
    {
      ...recent("中式"),
      aliases: ["仙裙", "月白长裙", "灵玥仙裙"],
    },
  ),
  makeLook(
    "elise-paris",
    "艾莉丝",
    28,
    "巴黎花呢",
    "精致花呢套装，散步在巴黎的午后。",
    "#c3a8bb",
    {
      ...recent("欧美"),
      characterDefault: true,
      aliases: ["花呢", "巴黎套装"],
    },
  ),
  makeLook(
    "elise-gala",
    "艾莉丝",
    28,
    "午夜蓝礼服",
    "午夜蓝晚礼服，优雅赴一场星光晚宴。",
    "#8699c3",
    {
      ...recent("欧美"),
      aliases: ["午夜蓝", "蓝色晚礼服", "艾莉丝晚宴"],
    },
  ),
  makeLook(
    "mia-street",
    "米娅",
    27,
    "薄荷街头",
    "清新薄荷色休闲穿搭，轻快自在。",
    "#9dd8c2",
    {
      ...recent("欧美", ["可爱"]),
      characterDefault: true,
      aliases: ["薄荷穿搭", "街头休闲"],
    },
  ),
  makeLook(
    "mia-denim",
    "米娅",
    27,
    "晴日牛仔",
    "明亮晴日里的牛仔造型，随性又俏皮。",
    "#9fbde0",
    {
      ...recent("欧美", ["可爱"]),
      aliases: ["牛仔", "牛仔装", "米娅牛仔"],
    },
  ),
  makeLook(
    "amara-royal",
    "阿玛拉",
    29,
    "翡翠王冠",
    "受加纳文化启发的虚构公主，翡翠色华服与金饰。",
    "#86bc9f",
    {
      ...recent("非洲"),
      characterDefault: true,
      aliases: ["非洲公主", "加纳公主", "王冠华服"],
    },
  ),
  makeLook(
    "amara-ankara",
    "阿玛拉",
    29,
    "彩织华服",
    "钴蓝与珊瑚色彩织裙，利落而明艳。",
    "#d69b92",
    {
      ...recent("非洲"),
      aliases: ["安卡拉", "Ankara", "彩织", "阿玛拉彩裙"],
    },
  ),
  makeLook(
    "zuri-sun",
    "祖莉",
    30,
    "落日长裙",
    "落日色长裙，铺开暖意与优雅。",
    "#dbac7e",
    {
      ...recent("非洲"),
      characterDefault: true,
      aliases: ["落日裙", "祖莉长裙"],
    },
  ),
  makeLook(
    "zuri-pearl",
    "祖莉",
    30,
    "珍珠连体衣",
    "象牙白连体衣与金色外套，明亮而从容。",
    "#ded1b1",
    {
      ...recent("非洲"),
      aliases: ["连体衣", "象牙白连体衣", "祖莉连体衣"],
    },
  ),
];

export const DEFAULT_LOOK_ID = "ruby-velvet";
export const ORIGINAL_LOOK = {
  id: "haru-original",
  name: "Haru · 动态陪伴",
  character: "Haru",
  outfit: "原始造型",
  description: "原始 Live2D 造型",
  greetingMotion: "wave",
  color: "#bcadcb",
  renderer: "live2d",
  thumbnail: null,
  textures: null,
  aliases: ["Haru", "原始造型", "原始模型", "原版造型", "原版模型"],
};
export const LOOK_FILTERS = [
  "全部",
  "可爱",
  "日系",
  "中式",
  "欧美",
  "非洲",
  "成熟",
];
export const LOOK_COUNT = LOOKS.length;
export const CHARACTER_NAMES = [
  ...new Set(LOOKS.map((look) => look.character)),
];
export const CHARACTER_COUNT = CHARACTER_NAMES.length;
export const WARDROBE_SUMMARY = `${CHARACTER_COUNT}位伙伴 · ${LOOK_COUNT}套穿搭`;

export const isLookId = (id) =>
  id === ORIGINAL_LOOK.id || LOOKS.some((look) => look.id === id);
export const cleanRemovedLookIds = (ids) => {
  if (!Array.isArray(ids)) return [];
  const knownIds = new Set(LOOKS.map((look) => look.id));
  return [
    ...new Set(ids.filter((id) => typeof id === "string" && knownIds.has(id))),
  ];
};
export const getAvailableLooks = (removedLookIds = []) => {
  const removed = new Set(cleanRemovedLookIds(removedLookIds));
  return LOOKS.filter((look) => !removed.has(look.id));
};
export const getRemovedLooks = (removedLookIds = []) => {
  const removed = new Set(cleanRemovedLookIds(removedLookIds));
  return LOOKS.filter((look) => removed.has(look.id));
};
export const isLookAvailable = (id, removedLookIds = []) =>
  id === ORIGINAL_LOOK.id ||
  (LOOKS.some((look) => look.id === id) &&
    !new Set(cleanRemovedLookIds(removedLookIds)).has(id));
export function getAvailableLookId(removedLookIds = [], preferredId) {
  if (preferredId === ORIGINAL_LOOK.id) return ORIGINAL_LOOK.id;
  const available = getAvailableLooks(removedLookIds);
  if (available.some((look) => look.id === preferredId)) return preferredId;
  return (
    available.find((look) => look.id === DEFAULT_LOOK_ID)?.id ||
    available[0]?.id ||
    ORIGINAL_LOOK.id
  );
}
export function summarizeLooks(removedLookIds = []) {
  const available = getAvailableLooks(removedLookIds);
  const characters = new Set(available.map((look) => look.character));
  return `${characters.size}位伙伴 · ${available.length}套穿搭`;
}
export const getLook = (id) =>
  id === ORIGINAL_LOOK.id
    ? ORIGINAL_LOOK
    : LOOKS.find((look) => look.id === id) ||
      LOOKS.find((look) => look.id === DEFAULT_LOOK_ID);
const normalize = (text) =>
  String(text || "")
    .toLowerCase()
    .replace(/[\s·的]+/g, "");

export function filterLooks({
  query = "",
  category = "全部",
  removedLookIds = [],
  view = "active",
} = {}) {
  const terms = query.trim().split(/\s+/).map(normalize).filter(Boolean);
  const removed = new Set(cleanRemovedLookIds(removedLookIds));
  return LOOKS.filter((look) => {
    if ((view === "removed") !== removed.has(look.id)) return false;
    if (
      category !== "全部" &&
      look.region !== category &&
      !look.styles.includes(category)
    )
      return false;
    const searchable = normalize(
      [
        look.name,
        look.region,
        ...look.styles,
        ...look.aliases,
        look.description,
      ].join(" "),
    );
    return terms.every((term) => searchable.includes(term));
  }).sort((a, b) => Number(b.isNew) - Number(a.isNew));
}

// Called only after the dialogue service verifies that this is a direct command.
export function matchLookAlias(text, removedLookIds = []) {
  const message = normalize(text);
  const removed = new Set(cleanRemovedLookIds(removedLookIds));
  const available = getAvailableLooks(removedLookIds);
  const aliases = [
    ...LOOKS.flatMap((look) =>
      look.aliases.map((alias) => ({
        alias: normalize(alias),
        id: look.id,
        available: !removed.has(look.id),
      })),
    ),
    ...[...new Set(available.map((look) => look.character))].map(
      (character) => {
        const characterLooks = available.filter(
          (look) => look.character === character,
        );
        return {
          alias: normalize(character),
          id: (
            characterLooks.find((look) => look.characterDefault) ||
            characterLooks[0]
          ).id,
          available: true,
        };
      },
    ),
    ...ORIGINAL_LOOK.aliases.map((alias) => ({
      alias: normalize(alias),
      id: ORIGINAL_LOOK.id,
      available: true,
    })),
  ].sort((a, b) => b.alias.length - a.alias.length);
  const matches = aliases.filter(({ alias }) => message.includes(alias));
  const longest = matches[0]?.alias.length;
  return (
    matches.find((match) => match.alias.length === longest && match.available)
      ?.id || null
  );
}
