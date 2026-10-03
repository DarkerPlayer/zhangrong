# 本地人物与换装工作台 Implementation Plan

> **For agentic workers:** Use parallel isolated file ownership for the image runtime, persistent service, and frontend. Verify each deliverable and review the integrated version before updating the desktop app.

**Goal:** 用户上传参考图即可在本机生成人物、套装和鞋履成品，预览确认后加入现有动画衣柜。

**Architecture:** 独立 Python 生成子进程负责 MLX 推理与 Vision 校准；Node 服务保存任务和用户目录；React 衣柜工作台管理参考图、任务和预览。用户确认的目录通过共享目录接口接入现有渲染器。

**Tech Stack:** React、Node.js、Electron、MLX/MFLUX、FLUX.2 Klein 4B 4 位权重、macOS Vision。

**Spec:** `docs/superpowers/specs/2026-10-02-local-character-studio-design.md`

## Global Constraints

- M1 Pro、16 GB；默认 512 × 768，较大选项 768 × 1152。
- 最多三张 PNG/JPEG/WebP，界面原图每张最多 12 MB，缩小后服务端每张最多 8 MB。
- 推理和照片留在本机；只有首次安装下载公开依赖与权重。
- 单任务、四步、低内存、分块解码；结束和取消释放独立生成进程。
- 保留现有工作区修改和用户档案，不提交或覆盖无关文件。

## Review Focus

- 重启后本地角色选择不得在目录加载之前被清理。
- 取消和窗口关闭不能留下占用数 GB 的子进程。
- 上传格式与素材路径验证不能仅依赖扩展名。
- 换装成品不能继承原造型的旧衣服动作帧。
- 五官检测失败不得生成错误但看似成功的 rig。

### Task 1: 生成引擎

**Files:** `server/local-image-runtime.mjs`、`scripts/local-image-worker.py`、`scripts/setup-local-image.py` 和校准工具、`tests/local-image-runtime.test.mjs`。

**Interfaces:** `createLocalImageRuntime({directory})` 返回 `info()`、`setup({signal,onProgress})`、`generate({references,prompt,width,height,seed,outputDirectory,signal,onProgress})`。生成结果包含 assetPath、rigPath、width、height、warnings。

- [x] 编写并运行参数、失败、取消和进程清理测试，确认初始失败。
- [x] 安装固定版本的独立环境和预量化权重，报告可恢复的安装进度。
- [x] 实现低内存推理、透明 PNG、人脸检测和独立 rig，令测试通过。
- [x] 完成真实推理，检查透明边界和五官位置，记录资源占用。

### Task 2: 持久服务与目录

**Files:** `server/local-studio.mjs`、`server/index.mjs`、`server/looks.mjs`、`server/wardrobe.mjs`、服务与 API 测试。

**Interfaces:** `/api/studio`、`/api/studio/setup`、`/api/studio/jobs`、`/api/studio/jobs/:id/cancel`、`/api/studio/jobs/:id/import`；`setLocalLooks(looks)`、`setLocalWardrobe({items,fits})`。

- [x] 编写上传校验、任务串行、取消、重启、原子登记和路径隔离测试，确认初始失败。
- [x] 实现任务存储与生成生命周期，生成前释放本应用语音及已用聊天模型。
- [x] 登记新角色、同角色套装和鞋履适配；重建共享查询目录。
- [x] 接入 API 与受限素材服务，运行服务和 API 测试。

### Task 3: 衣柜工作台

**Files:** `src/LocalStudio.jsx`、`src/local-studio.css`、`src/App.jsx`、`src/WardrobePage.jsx`、前端目录导出和界面测试。

**Interfaces:** 消费 Task 2 的状态、任务和目录接口，应用目录后再恢复已有状态。

- [x] 编写上传、生成、取消、错误、预览登记和重启恢复的界面测试，确认初始失败。
- [x] 添加衣柜入口、新人物、套装和鞋履模式、安装进度与持久任务预览。
- [x] 提供坐标校准和明确登记操作；清理上传预览 URL。
- [x] 检查原生窗口输入、滚动、选择角色与换鞋。

### Task 4: 集成与交付

**Files:** 桌面构建脚本、package.json、README、使用说明与验收记录。

- [x] 确保桌面包包含运行支持脚本，模型留在用户独立目录。
- [x] 运行全部 Node 测试、Python 检查、生产构建和 diff 检查。
- [x] 独立审查新功能的资源、持久保存和实际目录行为，修复问题。
- [x] 更新现有桌面包、重启应用，核实真实生成、预览、登记及重启恢复。

实际验收记录：`docs/local-character-studio-verification.md`。当前设备已安装并通过人物和鞋履的真实生成；首次安装到其他 Mac 的外部安装工具依赖已在使用说明中列出。
