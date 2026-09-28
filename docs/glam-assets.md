# 原创角色与六套动态穿搭

创建日期：2026-09-26。全部新人物图像使用 Codex 内置 ImageGen 创作。以下记录角色设定、画面方向与最终素材路径，不声称复现逐字生成提示词。

三个身份均为原创虚构成年女性，每位各有两套完整穿搭：夜澜 28 岁、绯月 29 岁、霜华 27 岁。图像采用正面全身时装立绘的构图，保留头部、双手和鞋部，便于完整窗口展示及透明桌宠使用。服装变体以保留同一角色身份为创作目标，每套最终图像独立配有校准坐标。

## 素材清单与创作描述

| 角色与穿搭 | 创作描述 | PNG 路径 | 坐标路径 |
| --- | --- | --- | --- |
| 夜澜 · 黑丝晚礼服，28 岁 | 黑色长发、成熟面容与黑色晚宴穿搭，结合丝袜及高跟鞋，整体为深色都市晚装风格。 | `public/looks/noir-evening/character.png` | `public/looks/noir-evening/rig.json` |
| 夜澜 · 黑丝通勤，28 岁 | 延续夜澜的黑发身份，换成剪裁利落的都市通勤穿搭，保留丝袜搭配与完整站姿。 | `public/looks/noir-office/character.png` | `public/looks/noir-office/rig.json` |
| 绯月 · 酒红丝绒，29 岁 | 酒红长发、成熟面容与温暖色调，以酒红丝绒时装塑造较柔和的晚间风格。 | `public/looks/ruby-velvet/character.png` | `public/looks/ruby-velvet/rig.json` |
| 绯月 · 约会礼服，29 岁 | 延续绯月的酒红发色与身份，将服装切换为约会礼服，保持正面全身与自然垂放的手臂构图。 | `public/looks/ruby-date/character.png` | `public/looks/ruby-date/rig.json` |
| 霜华 · 机车皮衣，27 岁 | 银色长发与冷调气质，搭配机车皮衣元素，形成有别于前两位角色的都市时装风格。 | `public/looks/silver-leather/character.png` | `public/looks/silver-leather/rig.json` |
| 霜华 · 慵懒针织，27 岁 | 延续霜华的银发身份，换成柔软针织穿搭，保持全身立绘与较放松的表情。 | `public/looks/silver-knit/character.png` | `public/looks/silver-knit/rig.json` |

六张成品均为 1024 × 1536 RGBA PNG。PNG 是显示与衣橱缩略图所用的完整人物素材；`rig.json` 是应用自定义坐标文件，不是 Cubism 的 `.moc3`、`.model3.json` 或动画模型。坐标包含头部转动位置、眼睛与嘴部范围、肩部位置、人物边界和面部着色参数。

## 动画实现与使用入口

`src/GlamPet.jsx` 使用 PixiJS 绘制立绘网格，`src/glam-motion.mjs` 根据待机、鼠标方向和互动动作，对头部、躯干及手臂区域做局部形变。面部着色器负责眨眼、轻微表情和根据本机朗读振幅开合的嘴部。口型不是逐音素同步；身体动作是预设的局部形变，不是自由行走或按文字生成新动作。

完整窗口的“衣橱”与桌宠顶部的衣架弹层共用六套造型选择，当前选择保存在本机。切换服装会加载相应 PNG 与 `rig.json`；不是给同一个 Cubism 模型实时更换衣服。旧版四套图片场景及用户导入素材仍由原图片/视频模式显示。

## 与 Haru 的关系

Haru 原始样例仍作为独立选项保留，使用真正的 Live2D Cubism 模型与原有动作、表情和物理数据。新增六套立绘没有编辑、重绘或替换 Haru 贴图，也不把 Haru 的模型与贴图当作这三位原创角色的来源。

Haru 与 Cubism Core 的第三方来源和授权仍见 [live2d-attribution.md](live2d-attribution.md)。本目录素材的随包来源说明见 [public/looks/ATTRIBUTION.md](../public/looks/ATTRIBUTION.md)。早期四套写实场景的生成记录仍见 [asset-prompts.md](asset-prompts.md)。
