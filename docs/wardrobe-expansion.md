# 沐语 · 衣橱造型清单

更新日期：2026-09-28。衣橱包含 **13 位原创成年女性角色、25 套完整立绘**；1.3 新增的 8 位角色、16 套穿搭与 1.2 保留的三位角色、六套造型之外，1.8 新增「金枝王冠」一套造型，1.8.1 更名为美杜莎并按正面参考修订脸部，1.9 新增林薇的「酒红职场」造型，1.11 为林薇新增「象牙白通勤」造型，1.12 为象牙白通勤造型加入配套的下蹲与四帧走路动作。Haru 原始模型和四套旧版写实场景是独立选项，不计入这 25 套原创立绘。

本页记录当前造型目录、素材路径与实现范围；1.3 历史验收见 [验收记录](wardrobe-1.3-verification.md)，美杜莎与林薇的接入记录见[新增人物模型工作流](wardrobe-model-workflow.md)。

## 使用方式

完整窗口点“衣橱”，或在桌宠顶部点衣架按钮。搜索框可输入伙伴名字、穿搭名称或风格，例如“樱奈”“旗袍”“薄荷”；多个空格分隔的关键词会共同参与匹配。搜索可以与“全部、可爱、日系、中式、欧美、非洲、成熟”筛选组合使用，界面显示匹配数与总数，新伙伴优先展示。没有匹配项时可点“清除筛选”。

点选造型后，当前选择保存在本机；完整窗口与桌宠共用同一造型。桌宠衣橱选择后自动收起，继续保留桌宠与聊天入口。也可直接发出明确的换装指令，例如“换樱花和服”“换翡翠旗袍”“换午夜蓝礼服”或“换非洲公主”。

## 25 套造型与资源

下表链接以本文件所在的 `docs/` 为基准。每套资源目录为 `public/looks/<id>/`，包含 `character.png` 与 `rig.json`；浏览器与应用内对应 URL 为 `/looks/<id>/character.png` 和 `/looks/<id>/rig.json`。

| 角色 | 年龄 | 风格分组 | 穿搭 | 稳定 ID | 人物图像 | 动画坐标 |
| --- | --- | --- | --- | --- | --- | --- |
| 林薇 | 28 岁 | 成熟 | 象牙白通勤 | `linwei-ivory-wrap` | [PNG](../public/looks/linwei-ivory-wrap/character.png) | [rig.json](../public/looks/linwei-ivory-wrap/rig.json) |
| 林薇 | 28 岁 | 成熟 | 酒红职场（黑色红底高跟鞋） | `linwei-red-sole` | [PNG](../public/looks/linwei-red-sole/character.png) | [rig.json](../public/looks/linwei-red-sole/rig.json) |
| 美杜莎 | 28 岁 | 中式 | 金枝王冠 | `xuanling-golden-crown` | [PNG](../public/looks/xuanling-golden-crown/character.png) | [rig.json](../public/looks/xuanling-golden-crown/rig.json) |
| 夜澜 | 28 岁 | 原有成熟风格 | 黑丝晚礼服 | `noir-evening` | [PNG](../public/looks/noir-evening/character.png) | [rig.json](../public/looks/noir-evening/rig.json) |
| 夜澜 | 28 岁 | 原有成熟风格 | 黑丝通勤 | `noir-office` | [PNG](../public/looks/noir-office/character.png) | [rig.json](../public/looks/noir-office/rig.json) |
| 绯月 | 29 岁 | 原有成熟风格 | 酒红丝绒 | `ruby-velvet` | [PNG](../public/looks/ruby-velvet/character.png) | [rig.json](../public/looks/ruby-velvet/rig.json) |
| 绯月 | 29 岁 | 原有成熟风格 | 约会礼服 | `ruby-date` | [PNG](../public/looks/ruby-date/character.png) | [rig.json](../public/looks/ruby-date/rig.json) |
| 霜华 | 27 岁 | 原有成熟风格 | 机车皮衣 | `silver-leather` | [PNG](../public/looks/silver-leather/character.png) | [rig.json](../public/looks/silver-leather/rig.json) |
| 霜华 | 27 岁 | 原有成熟风格 | 慵懒针织 | `silver-knit` | [PNG](../public/looks/silver-knit/character.png) | [rig.json](../public/looks/silver-knit/rig.json) |
| 樱奈 | 26 岁 | 日系 | 草莓奶油 | `sakura-cafe` | [PNG](../public/looks/sakura-cafe/character.png) | [rig.json](../public/looks/sakura-cafe/rig.json) |
| 樱奈 | 26 岁 | 日系 | 樱花和服 | `sakura-kimono` | [PNG](../public/looks/sakura-kimono/character.png) | [rig.json](../public/looks/sakura-kimono/rig.json) |
| 雪乃 | 27 岁 | 日系 | 紫藤洛丽塔 | `yuki-lolita` | [PNG](../public/looks/yuki-lolita/character.png) | [rig.json](../public/looks/yuki-lolita/rig.json) |
| 雪乃 | 27 岁 | 日系 | 雪日披肩 | `yuki-snow` | [PNG](../public/looks/yuki-snow/character.png) | [rig.json](../public/looks/yuki-snow/rig.json) |
| 知夏 | 28 岁 | 中式 | 翡翠旗袍 | `zhixia-qipao` | [PNG](../public/looks/zhixia-qipao/character.png) | [rig.json](../public/looks/zhixia-qipao/rig.json) |
| 知夏 | 28 岁 | 中式 | 都市白茶 | `zhixia-city` | [PNG](../public/looks/zhixia-city/character.png) | [rig.json](../public/looks/zhixia-city/rig.json) |
| 灵玥 | 27 岁 | 中式 | 青岚汉服 | `lingyue-hanfu` | [PNG](../public/looks/lingyue-hanfu/character.png) | [rig.json](../public/looks/lingyue-hanfu/rig.json) |
| 灵玥 | 27 岁 | 中式 | 月白仙裙 | `lingyue-moon` | [PNG](../public/looks/lingyue-moon/character.png) | [rig.json](../public/looks/lingyue-moon/rig.json) |
| 艾莉丝 | 28 岁 | 欧美 | 巴黎花呢 | `elise-paris` | [PNG](../public/looks/elise-paris/character.png) | [rig.json](../public/looks/elise-paris/rig.json) |
| 艾莉丝 | 28 岁 | 欧美 | 午夜蓝礼服 | `elise-gala` | [PNG](../public/looks/elise-gala/character.png) | [rig.json](../public/looks/elise-gala/rig.json) |
| 米娅 | 27 岁 | 欧美 | 薄荷街头 | `mia-street` | [PNG](../public/looks/mia-street/character.png) | [rig.json](../public/looks/mia-street/rig.json) |
| 米娅 | 27 岁 | 欧美 | 晴日牛仔 | `mia-denim` | [PNG](../public/looks/mia-denim/character.png) | [rig.json](../public/looks/mia-denim/rig.json) |
| 阿玛拉 | 29 岁 | 非洲 | 翡翠王冠 | `amara-royal` | [PNG](../public/looks/amara-royal/character.png) | [rig.json](../public/looks/amara-royal/rig.json) |
| 阿玛拉 | 29 岁 | 非洲 | 彩织华服 | `amara-ankara` | [PNG](../public/looks/amara-ankara/character.png) | [rig.json](../public/looks/amara-ankara/rig.json) |
| 祖莉 | 30 岁 | 非洲 | 落日长裙 | `zuri-sun` | [PNG](../public/looks/zuri-sun/character.png) | [rig.json](../public/looks/zuri-sun/rig.json) |
| 祖莉 | 30 岁 | 非洲 | 珍珠连体衣 | `zuri-pearl` | [PNG](../public/looks/zuri-pearl/character.png) | [rig.json](../public/looks/zuri-pearl/rig.json) |

所有角色均为原创虚构成年人。雪乃的“洛丽塔”是成年人的浪漫洋装风格。阿玛拉是受加纳文化启发的虚构成年公主，没有以真实王室人物为原型。

## 图像与坐标

成品采用 1024 × 1536 RGBA PNG，透明底、正面全身构图，保留头部、双手和鞋部。同一角色后续新增穿搭时，以首套图像为编辑目标，尽量保留脸部、发型、体型、站姿和取景；每张成品仍使用独立坐标配置。

`rig.json` 是本应用的自定义动画配置，记录头部位置、双眼与嘴部区域、肩部位置、人物边界和面部着色数据。它不是 Cubism 的 `.moc3` 或 `.model3.json`，也不包含三维骨骼或独立布料模型。不同造型不应仅凭同一角色身份直接套用未检查的面部坐标。

## 动画范围

`src/GlamPet.jsx` 与 `src/glam-motion.mjs` 使用 PixiJS 在本机绘制二维网格，完成呼吸、轻微头部转动与目光方向回应；面部着色器完成眨眼与朗读时的嘴部开合。原有六套支持小幅摆臂。1.3 新增十六套以及 1.8、1.9、1.11 新增的美杜莎与林薇造型以点头、歪头和微笑回应招呼，保留呼吸、目光回应、眨眼与口型，不做独立手臂挥动。林薇的两套造型都可以通过复用的动作菜单与播放逻辑触发各自匹配服装的下蹲和四帧走姿；象牙白通勤动作图见 `public/looks/linwei-ivory-wrap/actions/`。

这是对既有立绘的局部动画。服装、发丝与身体没有完整三维结构，长裙、宽袖和披肩没有独立布料模拟；无法生成任意新动作、自由行走、背面视角或真人视频。口型依据实际朗读音频的振幅，不是逐音素同步。切换造型载入另一张完整 PNG 与对应坐标，不会实时重绘衣服。

Haru 继续使用独立的真正 Live2D Cubism 模型、原始贴图、动作与物理数据。原创人物没有使用或改写 Haru 的贴图；四套旧版场景以及用户导入的图片/视频也继续通过原媒体模式显示。

## 提示词与来源记录

- [日系与中式 8 张图像的完整提示词](wardrobe-asian-prompts.json)：樱奈、雪乃、知夏、灵玥。记录逐字 `prompt`、生成/身份保持编辑模式、参考图、原始 `sourcePath` 和项目内 `savedPath`。
- [欧美与非洲风格 8 张图像的完整提示词](wardrobe-world-prompts.json)：艾莉丝、米娅、阿玛拉、祖莉。记录逐字提示词、生成/编辑模式、参考文件、原始 `sourcePath`、项目内 `workspacePath` 和相关尝试记录。
- [美杜莎与林薇图像的提示词和来源路径](wardrobe-new-models.json)，以及[后续人物模型可复用工作流](wardrobe-model-workflow.md)。林薇 1.11 的提示词由本轮生成摘要重建，记录中对此作了标注。
- [1.2 最初六套人物素材记录](glam-assets.md)：保留夜澜、绯月、霜华的创作描述与资源路径；该历史文档不声称是逐字提示词记录。
- [随应用打包的原创素材来源说明](../public/looks/ATTRIBUTION.md)：记录最初六套、1.3 新增十六套，以及 1.8 和 1.9 新增的角色。
- [早期四套写实场景记录](asset-prompts.md)与 [Haru / Cubism 第三方来源](live2d-attribution.md)：分别记录旧版场景和第三方模型，独立于本次原创角色扩展。

新增图像均通过 Codex 内置 ImageGen 生成或编辑，没有使用 API Key 或另行调用图像 API。原始生成文件保留在本机 `.codex/generated_images/`，提示词 JSON 中的绝对源路径用于本机追溯；实际随应用发布的是 `public/looks/` 内的副本。用户查看或运行应用不依赖这些开发时的原始路径。
