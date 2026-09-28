# 女性角色动作系统 V2 验证记录

日期：2026-09-28
基线：`c335f36 Upload project source`

## 已实现范围

- 统一 `MotionController`：状态机、优先级、队列、Fallback、朝向、速度、时间采样、生命周期和 Motion Event。
- Glam 原创角色：P0 八动作、8 相位女性步态曲线、肩髋反向补偿、4 帧短缝叠化、左右移动、自动折返、蹲下进入/保持/起身、头发和衣料次级运动。
- Haru：V2 Motion ID、优先级和回退 adapter；映射到仓库现有 Cubism motion，保留表情、视线和 Lip Sync。
- 本地中文动作命令：走路风格、方向、下蹲/起身、整理头发、回头及原有互动；否定、引用和历史描述不会误触发。
- 开发调试页：开发环境访问 `/dev/motions`，显示角色、动作、状态、时间、优先级、队列、事件、方向、速度与 FPS；支持预览、停止、下一项、镜像、10 秒 Walk 和 0.25×/0.5×/1×/1.5×。
- 旧造型兼容：没有全身动作图的造型继续使用 Mesh Idle；缺失动作逐级回退，不抛异常。

## 自动化验证

- `PATH=/Users/yunfeikong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm test`
  - 结果：145/145 通过，0 失败，0 跳过。
- `PATH=/Users/yunfeikong/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run build`
  - 结果：Vite 生产构建成功，4705 个模块完成转换。
- 覆盖内容：插值与循环缝、30/60 Hz 次级运动一致性、状态/优先级/队列、跨大帧 Motion Event、Fallback、帧率独立位移、P0 Manifest、Live2D 映射与过期异步表情、中文指令、完整前端和服务端回归。

## 交互式视觉验收

在本机浏览器中加载林薇 · 酒红职场，使用真实 PixiJS/WebGL 渲染执行：

1. Walk Feminine 连续运行超过 10 秒，检查开始/停止、循环、左右折返、头部稳定、肩髋反向运动和屏幕位移。
2. 首轮发现四张整帧持续叠化会出现明显双影，已改为每帧末段的短时 eased seam blend；复验中常态画面不再持续重影。
3. 执行 Stand → Crouch Enter → Crouch Idle 保持 5 秒以上 → Crouch Exit → Idle；遥测依次为 `CROUCH_ENTER`、`CROUCH_IDLE`、`CROUCH_EXIT`、`IDLE`，保持阶段未被随机 Idle 抢占。
4. 在 Walk/Crouch 过程中检查脸部 Shader 仍工作；实际遥测持续更新 mouth、blink、eyeOpen、gaze、breath，已有自动化测试进一步验证 Lip Sync、Blink 和 Gaze 不被身体层覆盖。
5. 打开 `/dev/motions`，验证林薇动作预览、0.5× 慢放、10 秒 Walk、镜像、FPS/事件/队列遥测；浏览器控制台无 warning/error。

本轮没有等待完整 30 分钟墙钟时间的人工 soak；资源释放、重复挂载、Ticker/Controller 销毁和跨造型隔离由现有回归测试及浏览器换装冒烟覆盖。发布候选如需严格执行文档第 69 节，可继续进行 30 分钟人工观测。

## 现有美术资源限制

- 林薇当前只有 4 张 Walk 关键图和 1 张 Crouch 关键姿态；本实现用 Mesh 曲线、短缝叠化与次级运动补足连续性，但新增 8–12 张逐步态关键图、4–6 张下蹲过渡图仍可进一步消除姿态间叠化感。
- `idle_hair_touch` 目前主要由程序 Mesh/头发延迟表现；单独绘制手臂/头发关键姿态后可提升手部接触感。
- Haru 包内没有专用 Walk/Crouch `.motion3.json`，因此 adapter 采用最接近的现有动作与表情并安全回退；要获得物理意义上的精确走路/下蹲，需要后续提供合法授权的 Cubism 动作资产。
- 未下载或提交任何外部商业动作资产，也未升级 PixiJS、`pixi-live2d-display` 或引入 3D 引擎。
