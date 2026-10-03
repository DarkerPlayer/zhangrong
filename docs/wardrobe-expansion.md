# 沐语 · 衣橱造型清单

更新日期：2026-10-03。素材总目录保留 16 位虚构成年女性角色、43 套完整立绘；当前默认衣橱显示 **14 位角色、37 套造型**。阿玛拉、祖莉的 6 套造型按用户要求可恢复移除，原文件、女友配置和音色均保留。Haru 原始模型和四套旧版写实场景是独立选项。

既有 **58 套鞋履合身成品**保持不变，黑色尖头高跟鞋与象牙白软底拖鞋覆盖此前 13 位默认保留角色的已适配造型。另有 14 个造型／鞋履组合未通过生成审核，界面明确禁用并仅推荐同一角色的可用造型，不借用其他人物身体。生成记录见 [shoe-fit-generation.json](shoe-fit-generation.json)。本次新增的反差婊仅有“玫瑰职场”主造型，没有白色安全底装或额外鞋履适配；现有 15 套安全底装数量不变，缺少适配时沿用 pending 机制保留当前造型。

玫瑰职场修订 3 已更新侧目挑眉的冷淡神情与亮紫指甲，保留腰腹曲线，并配有三张“吐口水”动作关键帧；它们属于同一造型，角色与造型数量不变。

本页记录当前造型目录、素材路径与实现范围；1.3 历史验收见 [验收记录](wardrobe-1.3-verification.md)，美杜莎与林薇的接入记录见[新增人物模型工作流](wardrobe-model-workflow.md)。

## 使用方式

完整窗口点“衣橱”，或在桌宠顶部点衣架按钮。搜索框可输入伙伴名字、穿搭名称或风格，例如“樱奈”“旗袍”“薄荷”；多个空格分隔的关键词会共同参与匹配。搜索可以与“全部、可爱、日系、中式、欧美、非洲、成熟”筛选组合使用，界面显示匹配数与总数，新伙伴优先展示。没有匹配项时可点“清除筛选”。

点选造型后，当前选择保存在本机；完整窗口与桌宠共用同一造型。桌宠衣橱选择后自动收起，继续保留桌宠与聊天入口。也可直接发出明确的换装指令，例如“换樱花和服”“换翡翠旗袍”“换午夜蓝礼服”或“换非洲公主”。

## 43 套造型与资源

下表链接以本文件所在的 `docs/` 为基准。每套资源目录为 `public/looks/<id>/`，包含 `character.png` 与 `rig.json`；浏览器与应用内对应 URL 为 `/looks/<id>/character.png` 和 `/looks/<id>/rig.json`。

| 角色 | 年龄 | 风格分组 | 穿搭 | 稳定 ID | 人物图像 | 动画坐标 |
| --- | --- | --- | --- | --- | --- | --- |
| 反差婊 | 29 岁 | 成熟 | 玫瑰职场 | `fancha-rose-office` | [PNG](../public/looks/fancha-rose-office/character.png) | [rig.json](../public/looks/fancha-rose-office/rig.json) |
| 调教组长 | 30 岁 | 成熟 | 黑金组长 | `discipline-lead-noir` | [PNG](../public/looks/discipline-lead-noir/character.png) | [rig.json](../public/looks/discipline-lead-noir/rig.json) |
| 吴多慧 | 29 岁 | 成熟 | 格纹代理 | `wuduohui-plaid-agent` | [PNG](../public/looks/wuduohui-plaid-agent/character.png) | [rig.json](../public/looks/wuduohui-plaid-agent/rig.json) |
| 林薇 | 28 岁 | 成熟 | 象牙白通勤 | `linwei-ivory-wrap` | [PNG](../public/looks/linwei-ivory-wrap/character.png) | [rig.json](../public/looks/linwei-ivory-wrap/rig.json) |
| 林薇 | 28 岁 | 成熟 | 酒红职场（黑色红底高跟鞋） | `linwei-red-sole` | [PNG](../public/looks/linwei-red-sole/character.png) | [rig.json](../public/looks/linwei-red-sole/rig.json) |
| 美杜莎 | 28 岁 | 中式 | 金枝王冠 | `xuanling-golden-crown` | [PNG](../public/looks/xuanling-golden-crown/character.png) | [rig.json](../public/looks/xuanling-golden-crown/rig.json) |
| 夜澜 | 28 岁 | 原有成熟风格 | 黑丝晚礼服 | `noir-evening` | [PNG](../public/looks/noir-evening/character.png) | [rig.json](../public/looks/noir-evening/rig.json) |
| 夜澜 | 28 岁 | 原有成熟风格 | 黑丝通勤 | `noir-office` | [PNG](../public/looks/noir-office/character.png) | [rig.json](../public/looks/noir-office/rig.json) |
| 绯月 | 29 岁 | 原有成熟风格 | 酒红丝绒 | `ruby-velvet` | [PNG](../public/looks/ruby-velvet/character.png) | [rig.json](../public/looks/ruby-velvet/rig.json) |
| 绯月 | 29 岁 | 原有成熟风格 | 约会礼服 | `ruby-date` | [PNG](../public/looks/ruby-date/character.png) | [rig.json](../public/looks/ruby-date/rig.json) |
| 绯月 | 29 岁 | 成熟 | 白色比基尼安全底装 | `ruby-white-bikini` | [PNG](../public/looks/ruby-white-bikini/character.png) | [rig.json](../public/looks/ruby-white-bikini/rig.json) |
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
| 调教组长 | 30 岁 | 成熟 | 白色比基尼安全底装 | `discipline-lead-white-bikini` | [PNG](../public/looks/discipline-lead-white-bikini/character.png) | [rig.json](../public/looks/discipline-lead-white-bikini/rig.json) |
| 吴多慧 | 29 岁 | 成熟 | 白色比基尼安全底装 | `wuduohui-white-bikini` | [PNG](../public/looks/wuduohui-white-bikini/character.png) | [rig.json](../public/looks/wuduohui-white-bikini/rig.json) |
| 林薇 | 28 岁 | 成熟 | 白色比基尼安全底装 | `linwei-white-bikini` | [PNG](../public/looks/linwei-white-bikini/character.png) | [rig.json](../public/looks/linwei-white-bikini/rig.json) |
| 美杜莎 | 28 岁 | 成熟 | 白色比基尼安全底装 | `medusa-white-bikini` | [PNG](../public/looks/medusa-white-bikini/character.png) | [rig.json](../public/looks/medusa-white-bikini/rig.json) |
| 夜澜 | 28 岁 | 成熟 | 白色比基尼安全底装 | `yelan-white-bikini` | [PNG](../public/looks/yelan-white-bikini/character.png) | [rig.json](../public/looks/yelan-white-bikini/rig.json) |
| 霜华 | 27 岁 | 成熟 | 白色比基尼安全底装 | `shuanghua-white-bikini` | [PNG](../public/looks/shuanghua-white-bikini/character.png) | [rig.json](../public/looks/shuanghua-white-bikini/rig.json) |
| 樱奈 | 26 岁 | 成熟 | 白色比基尼安全底装 | `sakura-white-bikini` | [PNG](../public/looks/sakura-white-bikini/character.png) | [rig.json](../public/looks/sakura-white-bikini/rig.json) |
| 雪乃 | 27 岁 | 成熟 | 白色比基尼安全底装 | `yuki-white-bikini` | [PNG](../public/looks/yuki-white-bikini/character.png) | [rig.json](../public/looks/yuki-white-bikini/rig.json) |
| 知夏 | 28 岁 | 成熟 | 白色比基尼安全底装 | `zhixia-white-bikini` | [PNG](../public/looks/zhixia-white-bikini/character.png) | [rig.json](../public/looks/zhixia-white-bikini/rig.json) |
| 灵玥 | 27 岁 | 成熟 | 白色比基尼安全底装 | `lingyue-white-bikini` | [PNG](../public/looks/lingyue-white-bikini/character.png) | [rig.json](../public/looks/lingyue-white-bikini/rig.json) |
| 艾莉丝 | 28 岁 | 成熟 | 白色比基尼安全底装 | `elise-white-bikini` | [PNG](../public/looks/elise-white-bikini/character.png) | [rig.json](../public/looks/elise-white-bikini/rig.json) |
| 米娅 | 27 岁 | 成熟 | 白色比基尼安全底装 | `mia-white-bikini` | [PNG](../public/looks/mia-white-bikini/character.png) | [rig.json](../public/looks/mia-white-bikini/rig.json) |
| 阿玛拉 | 29 岁 | 成熟 | 白色比基尼安全底装 | `amara-white-bikini` | [PNG](../public/looks/amara-white-bikini/character.png) | [rig.json](../public/looks/amara-white-bikini/rig.json) |
| 祖莉 | 30 岁 | 成熟 | 白色比基尼安全底装 | `zuri-white-bikini` | [PNG](../public/looks/zuri-white-bikini/character.png) | [rig.json](../public/looks/zuri-white-bikini/rig.json) |

所有角色均为原创虚构成年人。雪乃的“洛丽塔”是成年人的浪漫洋装风格。阿玛拉是受加纳文化启发的虚构成年公主，没有以真实王室人物为原型。

## 图像与坐标

成品采用 1024 × 1536 RGBA PNG，透明底、正面全身构图，保留头部、双手和鞋部。同一角色后续新增穿搭时，以首套图像为编辑目标，尽量保留脸部、发型、体型、站姿和取景；每张成品仍使用独立坐标配置。

`rig.json` 是本应用的自定义动画配置，记录头部位置、双眼与嘴部区域、肩部位置、人物边界和面部着色数据。它不是 Cubism 的 `.moc3` 或 `.model3.json`，也不包含三维骨骼或独立布料模型。不同造型不应仅凭同一角色身份直接套用未检查的面部坐标。

## 动画范围

`src/GlamPet.jsx` 与 `src/glam-motion.mjs` 使用 PixiJS 在本机绘制二维网格，完成呼吸、轻微头部转动与目光方向回应；面部着色器完成眨眼与朗读时的嘴部开合。渲染前根据 PNG 透明轮廓检查手臂是否能独立分层：肩部、袖子或衣服与身体连在一起时保留完整身体，用点头、歪头回应招呼，不强行切割挥手；真实分离的手臂分层保留完整指尖。林薇的两套原造型另有配套的下蹲和走姿；换鞋成品不继续使用穿原鞋的动作图。

玫瑰职场另有三张关键帧组成的“吐口水”短动画：准备 550 毫秒、吐出 350 毫秒、恢复 700 毫秒，总计 1.6 秒，只播放一次。主窗口与桌宠共用动作菜单，也可通过明确文字指令触发；结束后返回待机，“恢复待机”或切换角色可取消。其他角色未配置此动作时会提示不支持。

这是对既有立绘的局部动画。服装、发丝与身体没有完整三维结构，长裙、宽袖和披肩没有独立布料模拟；无法生成任意新动作、自由行走、背面视角或真人视频。口型依据实际朗读音频的振幅，不是逐音素同步。切换造型载入另一张完整 PNG 与对应坐标，不会实时重绘衣服。

Haru 继续使用独立的真正 Live2D Cubism 模型、原始贴图、动作与物理数据。原创人物没有使用或改写 Haru 的贴图；四套旧版场景以及用户导入的图片/视频也继续通过原媒体模式显示。

## 提示词与来源记录

- [日系与中式 8 张图像的完整提示词](wardrobe-asian-prompts.json)：樱奈、雪乃、知夏、灵玥。记录逐字 `prompt`、生成/身份保持编辑模式、参考图、原始 `sourcePath` 和项目内 `savedPath`。
- [欧美与非洲风格 8 张图像的完整提示词](wardrobe-world-prompts.json)：艾莉丝、米娅、阿玛拉、祖莉。记录逐字提示词、生成/编辑模式、参考文件、原始 `sourcePath`、项目内 `workspacePath` 和相关尝试记录。
- [美杜莎、林薇、吴多慧、调教组长与反差婊图像的提示词和来源路径](wardrobe-new-models.json)，以及[后续人物模型可复用工作流](wardrobe-model-workflow.md)。
- [1.2 最初六套人物素材记录](glam-assets.md)：保留夜澜、绯月、霜华的创作描述与资源路径；该历史文档不声称是逐字提示词记录。
- [随应用打包的原创素材来源说明](../public/looks/ATTRIBUTION.md)：记录最初六套、1.3 新增十六套、后续新增角色与 15 套安全底装。
- [早期四套写实场景记录](asset-prompts.md)与 [Haru / Cubism 第三方来源](live2d-attribution.md)：分别记录旧版场景和第三方模型，独立于本次原创角色扩展。

新增图像均通过 Codex 内置 ImageGen 生成或编辑，没有使用 API Key 或另行调用图像 API。原始生成文件保留在本机 `.codex/generated_images/`，提示词 JSON 中的绝对源路径用于本机追溯；实际随应用发布的是 `public/looks/` 内的副本。用户查看或运行应用不依赖这些开发时的原始路径。

## 1.13 吴多慧格纹代理

2026-09-29 使用 Codex 内置 ImageGen，以用户提供的漫画截图作为视觉参考，重新构图为正面全身透明底立绘。角色为 29 岁的虚构成年职场女性，保留栗棕低马尾、方形耳坠、印花丝巾、棕色格纹收腰连衣裙、双环细腰带与裸棕色高跟鞋。附件中的漫画文字、气泡、香烟、背景和其他人物未进入成品。

| 角色 | 穿搭 | 图像 | 动画坐标 |
| --- | --- | --- | --- |
| 吴多慧，29 岁 | 格纹代理 | `wuduohui-plaid-agent/character.png` | `wuduohui-plaid-agent/rig.json` |

## 1.14 调教组长黑金组长

2026-09-29 使用 Codex 内置 ImageGen 创建正面全身透明底立绘，并按用户确认的安全范围更新服装与体型。角色为 30 岁的虚构成年职场女性，采用深栗色侧分长卷发、黑色缎面眼罩、花卉蕾丝短上衣、装饰颈带、丰满收腰轮廓、清晰腹部 V 线，以及腰至脚尖的黑色连裤袜和漆皮尖头高跟鞋。加强 V 线的预览版本经用户确认后成为正式立绘。用户提供的成人漫画附件未直接输入生成器；成品以安全版角色立绘为编辑目标，保留黑色服装、眼罩和韩漫光影，不包含性行为、体液、裸露、牵引、身体束缚、画面文字、背景或其他人物。

| 角色 | 穿搭 | 图像 | 动画坐标 |
| --- | --- | --- | --- |
| 调教组长，30 岁 | 黑金组长 | `discipline-lead-noir/character.png` | `discipline-lead-noir/rig.json` |

## 2026-10-03 反差婊玫瑰职场

新增 29 岁虚构成年角色“反差婊”，稳定人物 ID 为 `fancha`，主造型 ID 为 `fancha-rose-office`。用户提供的 18 张漫画参考中，采用图 1 的脸部特征和图 11 的全身服装，提炼为黑色侧分长直发、青蓝眼睛、带六颗黑扣的粉色双排扣连衣裙、金项链、珍珠耳饰、白色腕表、浅紫指甲与象牙白高跟鞋。

使用内置 ImageGen 生成 1024 × 1536 RGBA 透明 PNG，人物正面站立，头发、双手与鞋部完整入画；生成图原样复制到 [character.png](../public/looks/fancha-rose-office/character.png)。[rig.json](../public/looks/fancha-rose-office/rig.json) 按本图使用 Vision 校准，`armMobility` 为 `0`，沿用眨眼、口型、呼吸与头部轻动作。生成提示词、参考图与源文件路径见 [wardrobe-new-models.json](wardrobe-new-models.json)。

首次接入时仅新增这一套主造型，当时未制作白色安全底装、额外鞋履适配或独立动作帧；同日修订 3 已补充以下动作关键帧。

## 2026-10-03 玫瑰职场修订 3

使用内置 ImageGen，按用户补充的第二张参考图（文件名前缀 `ede`）更新主立绘的侧目挑眉、冷淡神情和亮紫指甲，保留此前腰腹曲线、衣料下的肚脐凹陷、不透明粉色职场裙、配饰、站姿与透明全身构图。第一张补充参考图（文件名前缀 `ed4`）用于“吐口水”动作，新增三个阶段的 PNG：

| 阶段 | 图像 | 时长 |
| --- | --- | --- |
| 准备 | [spit-prepare.png](../public/looks/fancha-rose-office/actions/spit-prepare.png) | 550 毫秒 |
| 吐出 | [spit-release.png](../public/looks/fancha-rose-office/actions/spit-release.png) | 350 毫秒 |
| 恢复 | [spit-recover.png](../public/looks/fancha-rose-office/actions/spit-recover.png) | 700 毫秒 |

三张关键帧按上述顺序播放一次，沿用 `fancha-rose-office` 造型。完整提示词和生成来源见 [wardrobe-new-models.json](wardrobe-new-models.json)。
