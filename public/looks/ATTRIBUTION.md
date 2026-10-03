# 原创人物立绘来源说明

下列六套为 1.2 最初的人物立绘，于 2026-09-26 使用 Codex 内置 ImageGen 创作，用于“沐语”本地桌面陪伴应用。后续新增的美杜莎、林薇、吴多慧、调教组长与反差婊造型另列于下文。

| 角色 | 穿搭 | 图像 | 动画坐标 |
| --- | --- | --- | --- |
| 夜澜，28 岁 | 黑丝晚礼服 | `noir-evening/character.png` | `noir-evening/rig.json` |
| 夜澜，28 岁 | 黑丝通勤 | `noir-office/character.png` | `noir-office/rig.json` |
| 绯月，29 岁 | 酒红丝绒 | `ruby-velvet/character.png` | `ruby-velvet/rig.json` |
| 绯月，29 岁 | 约会礼服 | `ruby-date/character.png` | `ruby-date/rig.json` |
| 霜华，27 岁 | 机车皮衣 | `silver-leather/character.png` | `silver-leather/rig.json` |
| 霜华，27 岁 | 慵懒针织 | `silver-knit/character.png` | `silver-knit/rig.json` |

图像为 1024 × 1536 RGBA PNG。每套 `rig.json` 记录与本套画面对应的头部、双眼、嘴部、肩部和人物边界坐标，以及面部着色参数；这些数据由应用为立绘动画校准。

原创立绘使用 PixiJS 的局部 2D 网格形变和自定义面部着色器实现轻微身体动作、眨眼与音频振幅口型。它们不是 Live2D Cubism 模型，不包含 Haru 的原始贴图或对 Haru 贴图的修改，也没有将 Haru 换色后作为原创角色。

应用另行保留 Live2D Inc. 的 Haru 样例模型、Cubism Core 与各自授权文件，位于打包资源的 `live2d/` 和 `vendor/` 目录。原创立绘与这些第三方资源分开记录；PixiJS 等渲染依赖的许可证也独立于人物素材。

更完整的创作描述和项目相对路径见项目文档 `docs/glam-assets.md`。本来源说明位于公开资源目录，会随静态构建复制到 `looks/ATTRIBUTION.md` 并进入桌面应用资源。

## 1.3 新增八位角色、十六套造型

2026-09-26 的 1.3 扩展继续使用 Codex 内置 ImageGen 创作，新增以下原创虚构成年女性。每位先生成基础造型，再以其为编辑目标更换服装，保留同一身份的面部、发型与站姿。加上上表保留的六套，当时目录共记录 11 位角色、22 套原创立绘。

| 角色 | 穿搭 | 图像 | 动画坐标 |
| --- | --- | --- | --- |
| 樱奈，26 岁 | 草莓奶油 | `sakura-cafe/character.png` | `sakura-cafe/rig.json` |
| 樱奈，26 岁 | 樱花和服 | `sakura-kimono/character.png` | `sakura-kimono/rig.json` |
| 雪乃，27 岁 | 紫藤洛丽塔 | `yuki-lolita/character.png` | `yuki-lolita/rig.json` |
| 雪乃，27 岁 | 雪日披肩 | `yuki-snow/character.png` | `yuki-snow/rig.json` |
| 知夏，28 岁 | 翡翠旗袍 | `zhixia-qipao/character.png` | `zhixia-qipao/rig.json` |
| 知夏，28 岁 | 都市白茶 | `zhixia-city/character.png` | `zhixia-city/rig.json` |
| 灵玥，27 岁 | 青岚汉服 | `lingyue-hanfu/character.png` | `lingyue-hanfu/rig.json` |
| 灵玥，27 岁 | 月白仙裙 | `lingyue-moon/character.png` | `lingyue-moon/rig.json` |
| 艾莉丝，28 岁 | 巴黎花呢 | `elise-paris/character.png` | `elise-paris/rig.json` |
| 艾莉丝，28 岁 | 午夜蓝礼服 | `elise-gala/character.png` | `elise-gala/rig.json` |
| 米娅，27 岁 | 薄荷街头 | `mia-street/character.png` | `mia-street/rig.json` |
| 米娅，27 岁 | 晴日牛仔 | `mia-denim/character.png` | `mia-denim/rig.json` |
| 阿玛拉，29 岁 | 翡翠王冠 | `amara-royal/character.png` | `amara-royal/rig.json` |
| 阿玛拉，29 岁 | 彩织华服 | `amara-ankara/character.png` | `amara-ankara/rig.json` |
| 祖莉，30 岁 | 落日长裙 | `zuri-sun/character.png` | `zuri-sun/rig.json` |
| 祖莉，30 岁 | 珍珠连体衣 | `zuri-pearl/character.png` | `zuri-pearl/rig.json` |

雪乃的“洛丽塔”表示成年人的服装风格；阿玛拉是受加纳文化启发的虚构成年公主，不是现实王室人物。新增造型仍为 1024 × 1536 RGBA PNG，沿用应用的二维网格与面部着色动画方式，不包含新的 Cubism 或三维模型。

本次 16 张图片的逐字提示词和原始生成文件路径保存在项目源码的 [docs/wardrobe-asian-prompts.json](../../docs/wardrobe-asian-prompts.json) 与 [docs/wardrobe-world-prompts.json](../../docs/wardrobe-world-prompts.json)。当前 43 套清单见 [docs/wardrobe-expansion.md](../../docs/wardrobe-expansion.md)。

## 1.8 新增美杜莎

美杜莎是 28 岁的原创虚构成年角色，于 2026-09-27 使用 Codex 内置 ImageGen 创作。立绘以黑色长发、枝形金冠、蓝宝石与白金色高领长礼服构成，人物全身着装。根据用户后来提供的近景角色参考图，以脸部特征优先再次修订；衣装、姿势与全身构图保持一致。成品为 1024 × 1536 RGBA PNG，面部动画坐标已为这张图单独校准。

| 角色 | 穿搭 | 图像 | 动画坐标 |
| --- | --- | --- | --- |
| 美杜莎，28 岁 | 金枝王冠 | `xuanling-golden-crown/character.png` | `xuanling-golden-crown/rig.json` |

逐字提示词、生成工具与源文件路径记录在 [docs/wardrobe-new-models.json](../../docs/wardrobe-new-models.json)。可复用制作和接入流程见 [docs/wardrobe-model-workflow.md](../../docs/wardrobe-model-workflow.md)。

## 1.9 新增林薇

林薇是 28 岁的原创虚构成年角色，于 2026-09-28 使用 Codex 内置 ImageGen 创作。造型为栗棕长卷发、白色通勤衬衫、工牌、酒红一步裙和黑色红底高跟鞋；全身着装，透明背景。成品为 1024 × 1536 RGBA PNG，双眼与嘴部坐标针对这张立绘单独校准。

| 角色 | 穿搭 | 图像 | 动画坐标 |
| --- | --- | --- | --- |
| 林薇，28 岁 | 酒红职场（黑色红底高跟鞋） | `linwei-red-sole/character.png` | `linwei-red-sole/rig.json` |

逐字提示词、参考素材名、生成工具与源文件路径记录在 [docs/wardrobe-new-models.json](../../docs/wardrobe-new-models.json)。

## 1.10 林薇动作帧

2026-09-28 使用 Codex 内置 ImageGen，以林薇的原始站姿立绘为人物与服装参考，制作全身下蹲姿势和高跟鞋走姿；同日又以相邻动作帧为端点补绘四张中间姿态，将循环扩充为八个关键姿态。人物保持完整通勤着装，面部、发型和酒红职场造型沿用角色设定。图像均为 1024 × 1536 RGBA PNG，由应用以恒定不透明度的单层合成循环播放。

| 动作 | 图像 |
| --- | --- |
| 下蹲 | `linwei-red-sole/actions/squat.png` |
| 高跟鞋走姿 8 个关键姿态 | `linwei-red-sole/actions/walk-01.png` 至 `walk-04.png`，以及相邻帧间的 `walk-01-02.png` 至 `walk-04-01.png` |

## 1.11 林薇象牙白通勤

2026-09-28 使用 Codex 内置 ImageGen，根据用户提供的漫画截图提炼成年角色的栗棕长卷发、象牙白交叉高领上衣、黑色高腰短裙、黑色耳钉与金色手链，创作正面全身透明底立绘。衣橱造型沿用林薇角色名，但使用独立图像和单独校准的面部坐标；原有酒红职场造型仍是角色默认造型。提示词记录注明它是根据生成任务摘要重建，并非逐字原文。

| 角色 | 穿搭 | 图像 | 动画坐标 |
| --- | --- | --- | --- |
| 林薇，28 岁 | 象牙白通勤 | `linwei-ivory-wrap/character.png` | `linwei-ivory-wrap/rig.json` |

生成文件和参考图路径见项目源码 [docs/wardrobe-new-models.json](../../docs/wardrobe-new-models.json)。

## 1.12 林薇象牙白通勤动作帧

2026-09-28 使用 Codex 内置 ImageGen，以酒红职场造型已有的下蹲图和走姿图作为动作参考，以象牙白通勤全身立绘作为人物、服装和饰品参考，分别编辑为同一套新造型的透明全身动作帧；随后为四组相邻走姿补绘中间姿态，形成八个关键姿态的完整循环。新图继续使用 1024 × 1536 RGBA PNG，由现有动作菜单播放。

| 动作 | 图像 |
| --- | --- |
| 下蹲 | `linwei-ivory-wrap/actions/squat.png` |
| 走路 8 个关键姿态 | `linwei-ivory-wrap/actions/walk-01.png` 至 `walk-04.png`，以及相邻帧间的 `walk-01-02.png` 至 `walk-04-01.png` |

生成提示词、参考图、原始文件及项目内路径见 [docs/wardrobe-new-models.json](../../docs/wardrobe-new-models.json)。

## 1.13 新增吴多慧

吴多慧是 29 岁的虚构成年职场角色，于 2026-09-29 使用 Codex 内置 ImageGen 生成。用户提供的漫画截图仅作视觉参考；成品重新构图为正面全身、透明底的独立立绘，不包含漫画文字、气泡、背景、香烟或其他人物。

| 角色 | 穿搭 | 图像 | 动画坐标 |
| --- | --- | --- | --- |
| 吴多慧，29 岁 | 格纹代理 | `wuduohui-plaid-agent/character.png` | `wuduohui-plaid-agent/rig.json` |

成品为 1024 × 1536 RGBA PNG，面部坐标由 Vision 定位后按该图独立校准。逐字生成提示词、参考图与原始输出路径见 [docs/wardrobe-new-models.json](../../docs/wardrobe-new-models.json)。

## 1.14 新增调教组长

“调教组长”是 30 岁的虚构成年职场角色，于 2026-09-29 使用 Codex 内置 ImageGen 生成并更新服装与体型。用户提供的成人漫画附件未直接输入生成器；成品以安全版角色立绘为编辑目标，采用深栗色长卷发、黑色缎面眼罩、花卉蕾丝短上衣、装饰颈带、丰满收腰轮廓、清晰腹部 V 线，以及腰至脚尖的黑色连裤袜和漆皮尖头高跟鞋，并保持单人正面全身透明底构图。加强 V 线的预览版本经用户确认后提升为正式立绘。

| 角色 | 穿搭 | 图像 | 动画坐标 |
| --- | --- | --- | --- |
| 调教组长，30 岁 | 黑金组长 | `discipline-lead-noir/character.png` | `discipline-lead-noir/rig.json` |

成品为 1024 × 1536 RGBA PNG，不包含性行为、体液、裸露、牵引、身体束缚、漫画文字、背景或其他人物。面部坐标由 Vision 定位后按该图独立校准；逐字提示词、生成工具与原始输出路径见 [docs/wardrobe-new-models.json](../../docs/wardrobe-new-models.json)。

## 全身衣柜白色比基尼安全底装

2026-09-29 使用 Codex 内置 ImageGen，以 15 位人物各自的既有正面立绘为身份保持编辑目标，生成不透明白色两件式比基尼或等价的高覆盖运动海滩套装。成品保留成年角色、正面中立站姿、完整头脚取景和半写实插画风格，并完成透明背景提取与逐图 Vision 面部坐标校准。

| 角色 | 穿搭 | 图像 | 动画坐标 |
| --- | --- | --- | --- |
| 绯月，29 岁 | 白色比基尼安全底装 | `ruby-white-bikini/character.png` | `ruby-white-bikini/rig.json` |
| 调教组长，30 岁 | 白色比基尼安全底装 | `discipline-lead-white-bikini/character.png` | `discipline-lead-white-bikini/rig.json` |
| 吴多慧，29 岁 | 白色比基尼安全底装 | `wuduohui-white-bikini/character.png` | `wuduohui-white-bikini/rig.json` |
| 林薇，28 岁 | 白色比基尼安全底装 | `linwei-white-bikini/character.png` | `linwei-white-bikini/rig.json` |
| 美杜莎，28 岁 | 白色比基尼安全底装 | `medusa-white-bikini/character.png` | `medusa-white-bikini/rig.json` |
| 夜澜，28 岁 | 白色比基尼安全底装 | `yelan-white-bikini/character.png` | `yelan-white-bikini/rig.json` |
| 霜华，27 岁 | 白色比基尼安全底装 | `shuanghua-white-bikini/character.png` | `shuanghua-white-bikini/rig.json` |
| 樱奈，26 岁 | 白色比基尼安全底装 | `sakura-white-bikini/character.png` | `sakura-white-bikini/rig.json` |
| 雪乃，27 岁 | 白色比基尼安全底装 | `yuki-white-bikini/character.png` | `yuki-white-bikini/rig.json` |
| 知夏，28 岁 | 白色比基尼安全底装 | `zhixia-white-bikini/character.png` | `zhixia-white-bikini/rig.json` |
| 灵玥，27 岁 | 白色比基尼安全底装 | `lingyue-white-bikini/character.png` | `lingyue-white-bikini/rig.json` |
| 艾莉丝，28 岁 | 白色比基尼安全底装 | `elise-white-bikini/character.png` | `elise-white-bikini/rig.json` |
| 米娅，27 岁 | 白色比基尼安全底装 | `mia-white-bikini/character.png` | `mia-white-bikini/rig.json` |
| 阿玛拉，29 岁 | 白色比基尼安全底装 | `amara-white-bikini/character.png` | `amara-white-bikini/rig.json` |
| 祖莉，30 岁 | 白色比基尼安全底装 | `zuri-white-bikini/character.png` | `zuri-white-bikini/rig.json` |

## 2026-10-03 新增反差婊

“反差婊”是 29 岁的虚构成年角色，稳定人物 ID 为 `fancha`。使用 Codex 内置 ImageGen 生成“玫瑰职场”主造型，以用户提供的 18 张漫画参考中的图 1 作为脸部参考、图 11 作为全身服装参考，采用黑色侧分长直发、青蓝眼睛、六颗黑扣的粉色双排扣连衣裙、金项链、珍珠耳饰、白色腕表、浅紫指甲与象牙白高跟鞋。

| 角色 | 穿搭 | 图像 | 动画坐标 |
| --- | --- | --- | --- |
| 反差婊，29 岁 | 玫瑰职场 | `fancha-rose-office/character.png` | `fancha-rose-office/rig.json` |

首次接入的成品为 1024 × 1536 RGBA PNG，透明底、正面站立、头脚完整；生成图原样复制到上述图像路径。动画坐标按本图使用 Vision 单独校准，`armMobility` 为 `0`。当时仅生成这一套主造型，未生成该角色的白色安全底装、额外鞋履适配或独立动作帧；同日修订 3 已补充三张“吐口水”动作关键帧。提示词、参考图、生成工具与原始输出路径见 [docs/wardrobe-new-models.json](../../docs/wardrobe-new-models.json)。

## 2026-10-03 玫瑰职场进一步修订

按用户进一步要求，使用 Codex 内置 ImageGen 编辑 `fancha-rose-office`，参考图 12（文件名前缀 `a159`）的腰腹与表情、图 10（文件名前缀 `d7ef`）的面部，更新腰腹立体曲线、衣料下的肚脐凹陷和高傲冷淡表情。保留不透明粉色职场裙、配饰、站姿与透明全身构图；本轮原始输出为 `exec-382b858d-bae4-4629-84e9-f6f52dd842b5.png`。

## 2026-10-03 玫瑰职场修订 3：表情与动作关键帧

使用 Codex 内置 ImageGen，按用户补充的第二张参考图（文件名前缀 `ede`）编辑主立绘的侧目挑眉与冷淡神情，更新为清晰亮紫指甲，并保留腰腹曲线、衣料下的肚脐凹陷、不透明粉色职场裙、配饰、站姿和透明全身构图。第一张补充参考图（文件名前缀 `ed4`）用于“吐口水”动作。

| 阶段 | 图像 | 时长 |
| --- | --- | --- |
| 准备 | `fancha-rose-office/actions/spit-prepare.png` | 550 毫秒 |
| 吐出 | `fancha-rose-office/actions/spit-release.png` | 350 毫秒 |
| 恢复 | `fancha-rose-office/actions/spit-recover.png` | 700 毫秒 |

这三张内置 ImageGen 动作 PNG 组成一次 1.6 秒的关键帧短动画，由主窗口与桌宠共用，通过动作菜单“吐口水”或明确文字指令触发；结束后恢复待机，也可通过“恢复待机”或切换角色取消。未配置此动作的角色会提示不支持。完整提示词、参考图和原始输出见 [docs/wardrobe-new-models.json](../../docs/wardrobe-new-models.json)。


## 2026-10-03 玫瑰职场独立单品

通过 Codex 内置 ImageGen，以当前 `fancha-rose-office/character.png` 为唯一参考，分别重建独立粉色裙装、象牙白高跟鞋、白色腕表、黑色侧分长发、珍珠耳环五张透明 PNG，保存于 `public/wardrobe/items/fancha-*.png`。它们用于共享库存与角色适配的参考，不是从原画无损分离的骨骼图层。紫色指甲作为 `#A45BEF` 色值保存。生成原图未做后处理，保留原始 alpha；完整提示词、源文件和哈希见 [单品生成记录](../wardrobe/items/fancha-extraction-provenance.json)。
