// Shared by the browser bundle and packaged local dialogue service.
import { CUTE_MESH_ACTIONS, CUTE_FRAME_ACTIONS } from "./cute-actions.mjs";
import { AUTHORED_ACTIONS } from "./authored-actions.mjs";
export const CHARACTER_ID_BY_NAME = Object.freeze({
  "温夫人": "wen-furen",
  "凌玉灵": "ling-yuling",
  "梅凝": "mei-ning",
  "银月": "yinyue",
  "紫灵": "ziling",
  "宋玉": "songyu",
  "绾红": "wanhong",
  "反差婊": "fancha",
  "调教组长": "discipline-lead",
  "吴多慧": "wuduohui",
  "林薇": "linwei",
  "美杜莎": "medusa",
  "夜澜": "yelan",
  "绯月": "ruby",
  "霜华": "shuanghua",
  "樱奈": "sakura",
  "雪乃": "yuki",
  "知夏": "zhixia",
  "灵玥": "lingyue",
  "艾莉丝": "elise",
  "米娅": "mia",
  "阿玛拉": "amara",
  "祖莉": "zuri",
});

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
  characterId: metadata.characterId || CHARACTER_ID_BY_NAME[character],
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
  cuteMotions: metadata.cuteMotions || [],
  ...(metadata.dialoguePolicy ? { dialoguePolicy: metadata.dialoguePolicy } : {}),
  baseLayer: metadata.baseLayer || null,
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

const WALK_POSES = Object.freeze([
  ["walk-01.png", 75, "right_contact", "right"],
  ["walk-01-a.png", 55, "right_settle"],
  ["walk-01-02.png", 45, "right_down"],
  ["walk-01-b.png", 45, "right_compression"],
  ["walk-02.png", 50, "left_passing"],
  ["walk-02-a.png", 50, "right_rise"],
  ["walk-02-03.png", 55, "right_up"],
  ["walk-02-b.png", 65, "left_pre_contact"],
  ["walk-03.png", 75, "left_contact", "left"],
  ["walk-03-a.png", 55, "left_settle"],
  ["walk-03-04.png", 45, "left_down"],
  ["walk-03-b.png", 45, "left_compression"],
  ["walk-04.png", 50, "right_passing"],
  ["walk-04-a.png", 50, "left_rise"],
  ["walk-04-01.png", 55, "left_up"],
  ["walk-04-b.png", 65, "right_pre_contact"],
]);

const WALK_ANCHORS = Object.freeze([
  [0.500, 0.982], [0.497, 0.982], [0.493, 0.979], [0.489, 0.978],
  [0.486, 0.976], [0.488, 0.978], [0.493, 0.980], [0.497, 0.981],
  [0.500, 0.982], [0.503, 0.982], [0.507, 0.979], [0.511, 0.978],
  [0.514, 0.976], [0.512, 0.978], [0.507, 0.980], [0.503, 0.981],
]);

const linweiWalk = (lookId) => WALK_POSES.map(([file, durationMs, phase, contact], index) => ({
  src: `/looks/${lookId}/actions/${file}`,
  durationMs,
  phase,
  groundAnchor: WALK_ANCHORS[index],
  ...(contact ? { contact } : {}),
}));

export const LOOKS = [
  makeLook(
    "songyu-azure-robes", "宋玉", 28, "冰绡青衣",
    "深棕半束长发、白色云纹冠与双侧羽形发饰，蓝白刺绣露肩长衣配青色银叶腰封，红绳白玉坠及绿玉金环流苏；自然裸色指甲。",
    "#80b7c6",
    {
      ...recent("中式", ["成熟"]), characterDefault: true,
      aliases: ["宋玉", "冰绡青衣", "蓝白仙衣"],
      actions: Object.fromEntries(AUTHORED_ACTIONS.map(({kind, asset}) => {
        const root = "/looks/songyu-azure-robes/";
        const hasReady = ["tea", "scroll", "salute", "guzheng", "talisman"].includes(asset);
        const ready = hasReady ? `actions/${asset}-ready.png` : "character.png";
        const frame = (file, durationMs, phase) => ({src:root+file,durationMs,phase,groundAnchor:[0.5,0.982]});
        return [kind, [
          frame(ready, 650, "prepare"),
          frame(`actions/${asset}.png`, asset === "meditate" ? 3200 : 1700, "perform"),
          frame(ready, 600, "recover"),
          frame("character.png", 280, "rest"),
        ]];
      })),
    },
  ),
  makeLook(
    "yinyue-silver-fox", "银月", 28, "银狐红绦",
    "银白长发、狐耳与白色蓬松尾巴，蓝灰眼与轻笑；银灰绣纹露肩短衣、独立宽袖和红色长绦腰带，配银饰与白色绣纹长靴。",
    "#d7dee5",
    {...recent("中式", ["可爱"]), characterDefault: true, aliases: ["银月", "银狐", "银发狐耳", "银狐红绦"],
      cuteMotions: CUTE_MESH_ACTIONS.map(({kind})=>kind),
      actions: Object.fromEntries(CUTE_FRAME_ACTIONS.map(({kind,asset})=>[kind,[
        {src:"/looks/yinyue-silver-fox/character.png",durationMs:280,phase:"prepare",groundAnchor:[.5,.982]},
        {src:`/looks/yinyue-silver-fox/actions/${asset}.png`,durationMs:2200,phase:"perform",groundAnchor:[.5,.982]},
        {src:"/looks/yinyue-silver-fox/character.png",durationMs:500,phase:"recover",groundAnchor:[.5,.982]},
      ]])),
    },
  ),
  makeLook(
    "ziling-violet-dress", "紫灵", 28, "紫绡金饰",
    "按摘纱正脸重做紫瞳眉眼与柔和脸型，黑色半束长发配枝形金冠与紫晶垂饰，露肩金饰、紫色薄袖及侧开衩裙片；保留来源神态。",
    "#9569bf",
    {...recent("中式", ["成熟"]), characterDefault: true, aliases: ["紫灵", "紫绡金饰", "紫色仙裙", "紫瞳"]},
  ),
  makeLook(
    "ziling-violet-veil", "紫灵", 28, "紫绡面纱",
    "紫色金纹薄纱覆至下巴下方，金边、尖端紫晶垂珠与原图眉眼；露肩金饰、紫色薄袖和侧开衩长裙。",
    "#9569bf",
    {...recent("中式", ["成熟"]), aliases: ["紫灵面纱", "紫衣面纱", "蒙面紫灵"]},
  ),
  makeLook(
    "ziling-white-robes", "紫灵", 28, "白衣紫领",
    "素材早期浅白宽袖外衣、紫色折领与袖里，双侧细辫、紫晶发饰和淡紫绣纹面纱；白色长衣配紫色内裙。",
    "#dfd9ec",
    {...recent("中式", ["成熟"]), aliases: ["白衣紫灵", "紫灵白衣", "白衣紫领"]},
  ),
  makeLook(
    "wen-furen-black-gold", "温夫人", 38, "黑金披肩",
    "黑金衣裙与宽披肩，黑色盘束长发配金色额饰、耳坠和腕饰；保留来源图沉静的眉眼与衣饰轮廓。",
    "#b49a64",
    {...recent("中式", ["成熟"]), characterDefault: true,
      aliases: ["温夫人", "温夫人黑金衣裙", "黑金披肩"], dialoguePolicy: "provided-corpus-only"},
  ),
  makeLook(
    "ling-yuling-jade-robes", "凌玉灵", 28, "白灰金纹长衣",
    "成年凌玉灵的白灰交领长衣，肩部金纹与深金腰饰，棕黑半束长发和两侧垂发；沿用来源图的五官与神态。",
    "#cfcbc0",
    {...recent("中式", ["成熟"]), characterDefault: true,
      aliases: ["凌玉灵", "成年凌玉灵", "白灰金纹长衣"], dialoguePolicy: "provided-corpus-only"},
  ),
  makeLook(
    "mei-ning-teal-attire", "梅凝", 28, "青绿斜肩行装",
    "青绿斜肩行装配深色束腰与护腕，盘束黑发、两侧垂发及发饰；保留来源图的面部比例和衣物结构。",
    "#589b90",
    {...recent("中式", ["成熟"]), characterDefault: true,
      aliases: ["梅凝", "梅凝青衣", "青绿斜肩行装"], dialoguePolicy: "provided-corpus-only"},
  ),
  makeLook(
    "wanhong-vermilion-robes",
    "绾红",
    28,
    "朱绡云袖",
    "黑色半盘长发配红金发饰与垂链，朱红暗纹交叠 V 领裙保留双侧分片开衩与中央长裙片，搭配完整遮覆的不透明朱红系带三角内搭，配金色腰扣、两侧各三枚沿细珠链独立悬挂的细长梨形垂珠及象牙白云袖外披，垂珠配绿色窄带与长环，画面左组依次绿粉绿、右组依次绿粉粉，保留水滴耳饰、细珠项链和自然裸粉指甲。",
    "#c9715a",
    {
      ...recent("中式", ["成熟"]),
      characterDefault: true,
      aliases: ["绾红", "朱绡云袖", "红白古装", "朱红长裙", "盘发云袖"],
    },
  ),
  makeLook(
    "fancha-rose-office",
    "反差婊",
    29,
    "玫瑰职场",
    "黑色侧分长直发、粉色双排扣连衣裙，配金色项链、珍珠耳饰、白色腕表和象牙白高跟鞋。",
    "#ca9caa",
    {
      ...recent(null, ["成熟"]),
      characterDefault: true,
      aliases: ["反差", "粉色双排扣", "粉色职场裙", "玫瑰通勤"],
      actions: {
        spit: [
          { src: "/looks/fancha-rose-office/actions/spit-prepare.png", durationMs: 550, phase: "prepare", groundAnchor: [0.5, 1475 / 1536] },
          { src: "/looks/fancha-rose-office/actions/spit-release.png", durationMs: 350, phase: "release", groundAnchor: [0.5, 1475 / 1536] },
          { src: "/looks/fancha-rose-office/actions/spit-recover.png", durationMs: 700, phase: "recover", groundAnchor: [0.5, 1476 / 1536] },
        ],
      },
    },
  ),
  makeLook(
    "discipline-lead-noir",
    "调教组长",
    30,
    "黑金组长",
    "深栗色侧分长卷发、黑色缎面眼罩与花卉蕾丝短上衣，配装饰颈带、丰满收腰轮廓、清晰腹部 V 线、腰至脚尖的黑色连裤袜和漆皮高跟鞋。",
    "#29242b",
    {
      ...recent(null, ["成熟"]),
      characterDefault: true,
      aliases: ["组长", "黑金组长", "蕾丝眼罩", "黑色眼罩", "黑色蕾丝", "黑丝组长", "纪律组长"],
    },
  ),
  makeLook(
    "wuduohui-plaid-agent",
    "吴多慧",
    29,
    "格纹代理",
    "栗棕低马尾、灰白印花丝巾与棕色格纹收腰连衣裙，配双环细腰带和裸棕色高跟鞋。",
    "#aa8176",
    {
      ...recent(null, ["成熟"]),
      characterDefault: true,
      aliases: ["吴代理", "多慧代理", "格纹职场", "棕色格纹裙", "代理通勤"],
    },
  ),
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
        sexyWalk: linweiWalk("linwei-ivory-wrap"),
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
        sexyWalk: linweiWalk("linwei-red-sole"),
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
    "ruby-white-bikini",
    "绯月",
    29,
    "白色比基尼底装",
    "酒红长卷发，不透明白色支撑型比基尼上衣与中腰比基尼下装，赤足。",
    "#eee8e2",
    {
      baseLayer: "white-bikini",
      aliases: ["白色比基尼", "白比基尼", "安全底装", "什么都不穿", "清空穿搭"],
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

const WHITE_BIKINI_BASES = [
  ["discipline-lead", "调教组长", 30, "#eee8e2"],
  ["wuduohui", "吴多慧", 29, "#eee8e2"],
  ["linwei", "林薇", 28, "#eee8e2"],
  ["medusa", "美杜莎", 28, "#eee8e2"],
  ["yelan", "夜澜", 28, "#eee8e2"],
  ["shuanghua", "霜华", 27, "#eee8e2"],
  ["sakura", "樱奈", 26, "#eee8e2"],
  ["yuki", "雪乃", 27, "#eee8e2"],
  ["zhixia", "知夏", 28, "#eee8e2"],
  ["lingyue", "灵玥", 27, "#eee8e2"],
  ["elise", "艾莉丝", 28, "#eee8e2"],
  ["mia", "米娅", 27, "#eee8e2"],
  ["amara", "阿玛拉", 29, "#eee8e2"],
  ["zuri", "祖莉", 30, "#eee8e2"],
];

LOOKS.push(
  ...WHITE_BIKINI_BASES.map(([characterId, character, age, color]) =>
    makeLook(
      `${characterId}-white-bikini`,
      character,
      age,
      "白色比基尼底装",
      "不透明白色高领运动型上衣与高腰全覆盖下装，赤足。",
      color,
      {
        characterId,
        baseLayer: "white-bikini",
        aliases: ["白色比基尼", "白比基尼", "安全底装", "什么都不穿", "清空穿搭"],
      },
    ),
  ),
);

const BUILT_IN_LOOKS = LOOKS.slice();

export const DEFAULT_LOOK_ID = "ruby-velvet";
export const ORIGINAL_LOOK = {
  id: "haru-original",
  characterId: "haru",
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
export let LOOK_COUNT = LOOKS.length;
export let CHARACTER_NAMES = [
  ...new Set(LOOKS.map((look) => look.character)),
];
export let CHARACTER_COUNT = CHARACTER_NAMES.length;
export let WARDROBE_SUMMARY = `${CHARACTER_COUNT}位伙伴 · ${LOOK_COUNT}套穿搭`;

// Local Studio catalogs are loaded independently in the server and browser.
// Keep the array identity so existing consumers continue to see new looks.
export function setLocalLooks(looks = []) {
  const reserved = new Set(BUILT_IN_LOOKS.map(look => look.id));
  const local = Array.isArray(looks) ? looks.filter(look => look && typeof look.id === 'string' && look.id.startsWith('local-look-') && !reserved.has(look.id) && typeof look.characterId === 'string' && typeof look.character === 'string' && typeof look.asset === 'string' && look.asset.startsWith('/local-studio/assets/')).map(look => ({ ...look, actions: null, styles: Array.isArray(look.styles) ? look.styles : ['成熟'], aliases: Array.isArray(look.aliases) ? look.aliases : [look.character] })) : [];
  LOOKS.splice(0, LOOKS.length, ...BUILT_IN_LOOKS, ...local);
  LOOK_COUNT = LOOKS.length;
  CHARACTER_NAMES = [...new Set(LOOKS.map(look => look.character))];
  CHARACTER_COUNT = CHARACTER_NAMES.length;
  WARDROBE_SUMMARY = `${CHARACTER_COUNT}位伙伴 · ${LOOK_COUNT}套穿搭`;
}

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
  looks = LOOKS,
} = {}) {
  const terms = query.trim().split(/\s+/).map(normalize).filter(Boolean);
  const removed = new Set(cleanRemovedLookIds(removedLookIds));
  return looks.filter((look) => {
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
