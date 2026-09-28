# 沐语 1.3 衣橱扩展验收

2026-09-26，Apple Silicon macOS，本机成品 `release/沐语.app`。

## 交付

- 新增 8 位原创成年女性、16 张独立服装立绘；加上已有内容共 11 位、22 套。
- 每套为 1024×1536 RGBA PNG，保留原始透明通道；每套有独立 `rig.json`。
- 原始文件、确切生成/编辑提示词及引用路径见 `wardrobe-asian-prompts.json`、`wardrobe-world-prompts.json`；资源清单见 `wardrobe-expansion.md`。
- 新增 16 套以头部与表情回应招呼，保留呼吸、目光回应、眨眼及语音口型。宽袖/裙身轮廓相连时禁用独立摆臂，避免拉裂衣服。已有六套与 Haru 保留原动作。

## 自动检查

- Node 24 `npm test`：95/95 通过，0 失败。日志：`wardrobe-tests.log`。
- `npm run build:desktop`：Vite 生产构建和 Electron arm64 打包成功。日志：`wardrobe-build.log`。
- 安装包版本 1.3.0；包内后端目录可独立导入，报告 11 位/22 套。
- 包内 22 张图片及 22 份 rig 与源码逐个 SHA-256 一致；生产 HTML、全部构建资源与 `dist/` 一致。
- 桌面入口仍指向本次 `release/沐语.app`。本地健康接口返回 Ollama / qwen2.5:1.5b / voice=true。

## 浏览器实测

- 通过真实衣橱逐个点击全部 22 套，逐套等到 canvas ready=true；全部成功，渲染为 glam-mesh。记录：`wardrobe-browser-loads.json`。
- 七类筛选结果：全部22、可爱6、日系4、中式4、欧美4、非洲4、成熟6。
- “非洲 + 阿玛拉”返回两套；“旗袍”返回一套；不存在的词显示空状态，清除筛选恢复22套。
- 主衣橱滚动到底后搜索“旗袍”：结果回到顶部、scrollTop=0，输入焦点保留。
- 对新樱奈进行招呼动作实测，原先发现的袖子裂缝已消失；阿玛拉眨眼画面检查通过。
- 22套连续切换后浏览器没有错误或警告日志。

## 原生应用实测

- 重新启动打包成品，原有绯月选择正常保留。
- 1440×900 完整窗口：显示11位/22套、分类按钮、新造型卡片；选择阿玛拉后正确呈现。
- 360×520 透明桌宠：阿玛拉王冠、完整裙摆与鞋部可见；衣橱弹层有固定搜索/分类和独立滚动区域。
- 在桌宠搜索“和服”显示单个匹配项，点击切换到樱奈，弹层收起；和服全身完整。
- 完全退出并重启应用：樱奈·樱花和服选择仍保留，“打个招呼”文案正确。

截图：`screenshots/wardrobe-1.3-native.jpg`、`screenshots/wardrobe-1.3-pet.jpg`、`screenshots/wardrobe-1.3-kimono-pet.jpg`。

本次没有重复验证与衣橱无关的所有旧功能；其历史验收见 `glam-verification.md`、`live2d-verification.md` 和 `verification.md`。原创动态仍为二维立绘局部动画，不是新增的 Cubism 模型或任意动作生成器。
