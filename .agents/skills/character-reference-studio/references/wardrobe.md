# 共享衣橱

## 六类元素分别入库

库存面向所有角色；选择和适配结果按角色/造型区分。按用户请求抽离相应类目，不要求每次生成六类。

| 用户概念 | 现有 slot | 保存形式与细节 |
| --- | --- | --- |
| 衣服 | `dress` / `top` / `bottom` / `outerwear` 等 | 独立服装参考图；保留剪裁、颜色、材质、纽扣、袖长、腰线 |
| 鞋子 | `shoes` | 成对参考图；鞋头、鞋跟高度/形状、鞋面与颜色 |
| 指甲颜色 | `nails` | 纯换色使用 `kind: "color"` 与色值；内置颜色单品可以 `asset: null` |
| 发型 | `hair` | 独立发型参考图；分缝、长度、发色、光泽、发梢走向 |
| 手表 | `watch` | 表带、表盘、金属部分；适配时保持佩戴侧 |
| 耳环 | `earrings` | 成对饰品，保持结构、材质、大小与左右一致性 |

优先沿用现有 `GARMENT_SLOT_IDS` 与 `GARMENT_SLOT_LABELS`。新增类别才修改整个数据/表单/持久化链路；不要为了单件物品另建相近但不兼容的 slot。

单品参考图应去除来源角色的脸、皮肤和手。衣服保留空衣/隐形人台形状，发型可保留空头型内部空间但不附带原角色脸。保留真实透明 alpha，检查头发与耳环空隙。不要把截取了人物身体的矩形图标当作独立单品。

当前亮紫色示例是 `fancha-violet-nails` / `#A45BEF`；它不规定未来甲色。当前颜色单品路径主要是内置目录，本地上传单品的持久化校验要求资产路径。若新增“本地自定义纯色”能力，先调整并验证相应服务与 UI，不能只照抄内置 `asset: null`。

## 来源与组合数据

- 内置素材放在 `public/wardrobe/items/`，保存独立 ID、slot、名称、描述、asset 或 color、来源造型 `sourceLookId`、来源角色 `sourceCharacterId`。
- 用 `embeddedLookIds` 标记原本画在立绘里的单品；在该原造型中显示“原配”，规范化选择时移除这类多余覆盖项。
- 每份适配结果包括目标 `lookId`、完整 `selection`、整身 `asset` 与对应 `rig`。共享的是库存；另一人物不能直接使用来源人物的整身适配图。
- 保存生成提示词、来源参考、原始输出、最终文件及哈希；可参考 `public/wardrobe/items/fancha-extraction-provenance.json`。

**当前渲染资产是整张立绘，不是可开关的服装图层。** 单品参考图支持重新适配；它不等于能无损从原立绘中直接卸下的图层，也不自动适合其他人物的姿态和体型。

## 完整组合原则

使用 `normalizeWardrobeSelection` 和 `wardrobeSelectionKey` 生成规范键，通过 `getWardrobeCombinationFit` 获取目标造型的完全匹配结果。不要自创另一种排序或组合键。

例如已分别存在“换鞋”与“换发型”两张整身图，并不代表“换鞋 + 换发型”已经存在。组合缺失时显示待适配，保持当前已显示外观与已提交选择；不叠加整身图，不用最后一张覆盖前面选择，也不将其他角色结果当成可用。

生成参考必须是开始任务时的当前已解析外观快照，携带完整 `baseSelection`。只改目标部位，保留其他已选部位。发型任务允许改变头发但锁定脸；甲色任务只改变指甲颜色，不强制添加一张不存在的色值图片。

当前本地工作室的换装输入形如：

```js
{
  kind: 'fit',
  baseLookId,
  itemId,
  slot,
  baseSelection,
  operation: 'equip'
}
```

恢复某部位则传 `{kind: 'fit', baseLookId, slot, baseSelection, operation: 'restore'}`，省略 `itemId` 且不传上传参考图。服务会从当前组合及原造型取参考，携带新单品或上传图片会被拒绝；该 slot 还需确实存在替换项。

按当前服务校验构造请求。导入后使用完整 `importedSelection`，包括合法空对象 `{}`；不要用真假判断把“恢复原配”的空选择回退为旧单件选择。导入图和 rig 必须对应实际预览的完整组合。

## 卸下与保存

- 按部位卸下替换单品是“恢复原造型的该部位”。例如恢复鞋子，仍保留当前发型与甲色；剩余完整组合尚无适配图时生成恢复结果。
- “恢复原配”不等于擦除原本画在整张图中的衣服或配饰。当前清空穿搭流程使用已有对应白色比基尼底装；没有底装则保持外观。用户真要新增其他底装时，将其作为新的明确资源工作。
- 每个人物保存自己的选择；多个女友/人设之间也保留独立外观快照。确认重载后仍正确。
- 不删除其他人物正在进行的适配任务。`fit` 模式自动默认预览匹配任务类别、造型和部位；用户主动打开历史任务则允许查看其结果。新角色模式当前允许展示其他类别任务，不将适配模式的过滤规则误称为整个工作室的现状。
- 当前组合适配会禁用原造型专属整身动作，避免播放中换回旧衣服。若用户要求换装后继续动作，还要派生匹配帧、扩展组合动作的存储与解析；读取 [动作抽离](actions.md)，不能以补充图片代替完整接入。

## 当前实现入口

| 范围 | 入口 |
| --- | --- |
| 分类、库存、组合解析 | `server/wardrobe.mjs`（`src/wardrobe.mjs` 复用） |
| 选择与导入决策 | `src/wardrobe-selection.mjs` |
| 衣橱与适配界面 | `src/WardrobePage.jsx`、`src/LocalStudio.jsx`、`src/App.jsx` |
| 适配服务 | `server/local-studio.mjs` |
| 角色与人设保存 | `src/state.mjs`、`src/persona-appearance.mjs` |

验证六类分类、来源标记、跨角色适配入口、组合缺失、精确组合、单部位恢复、重载保存、旧鞋履数据兼容和动作服装一致性。参考 `tests/wardrobe-domain.test.mjs`、`tests/wardrobe-combinations.test.mjs`、`tests/wardrobe-selection.test.mjs`、`tests/wardrobe-ui.test.mjs`、`tests/studio-service.test.mjs`、`tests/studio-api.test.mjs` 与相关状态测试，按变更范围选择。

至少在来源角色和另一角色检查复用路径。若没有实际生成另一角色的图，只能报告入口/管线已验证，不能声称跨角色视觉效果已通过。已有案例说明见 [可复用单品衣橱](../../../../docs/wardrobe-reusable-items.md)。
