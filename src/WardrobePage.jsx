import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowCounterClockwise,
  Check,
  CoatHanger,
  ImageSquare,
  PencilSimple,
  Sparkle,
  Trash,
  X,
} from "@phosphor-icons/react";
import LivePet from "./LivePet.jsx";
import WardrobeFilters, { WardrobeEmpty } from "./WardrobeFilters.jsx";
import LocalStudio from "./LocalStudio.jsx";
import { SCENES } from "./state.mjs";
import { getModelName, withModelName } from "./model-names.mjs";
import { getWardrobeInventory } from "./wardrobe-inventory.mjs";
import { getAvailableLooks, getRemovedLooks, getLook, ORIGINAL_LOOK } from "./looks.mjs";
import {
  BACKGROUNDS,
  CHARACTERS,
  GARMENT_SLOT_IDS,
  GARMENT_SLOT_LABELS,
  getOutfitVariant,
  getWardrobeCombinationFit,
  getEmbeddedWardrobeItems,
  normalizeWardrobeSelection,
  WARDROBE_ITEMS,
} from "./wardrobe.mjs";


const TABS = [
  ["outfits", "完整造型"],
  ["parts", "单品"],
  ["background", "背景"],
];

export default function WardrobePage({
  state,
  currentLook,
  activeCharacter,
  visibleLooks,
  removedLookIds,
  query,
  setQuery,
  category,
  setCategory,
  view,
  setView,
  chooseLook,
  chooseCharacter,
  renameModel,
  removeLook,
  restoreLook,
  chooseScene,
  setBackground,
  selectWardrobeItem,
  requestEmptyOutfit,
  onStudioImported,
  onClose,
  petProps,
}) {
  const inventoryCharacterId = currentLook.characterId || activeCharacter.id;
  const [tab, setTab] = useState("outfits");
  const [selectedSlot, setSelectedSlot] = useState(() =>
    getWardrobeInventory(inventoryCharacterId).find(item => item.slot === "shoes")?.slot ||
    getWardrobeInventory(inventoryCharacterId)[0]?.slot || "shoes");
  const [inventoryView, setInventoryView] = useState({ characterId: inventoryCharacterId, scope: "character" });
  const [adaptationNotice, setAdaptationNotice] = useState("");
  const [studio, setStudio] = useState(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const pageRef = useRef();
  const background =
    BACKGROUNDS.find((item) => item.id === state.backgroundId) || BACKGROUNDS[0];
  const availableLooks = getAvailableLooks(removedLookIds).map((look) => withModelName(look, state.modelNames));
  const removedLooks = getRemovedLooks(removedLookIds);
  const isOriginal = state.lookId === ORIGINAL_LOOK.id;
  const originalName = getModelName(ORIGINAL_LOOK.characterId, ORIGINAL_LOOK.character, state.modelNames);
  const modelLooks = isOriginal ? [] : availableLooks.filter((look) => look.characterId === activeCharacter.id);
  // Removed looks remain a global recovery view so fully archived models can return.
  const scopedLooks = visibleLooks.filter((look) => view === "removed"
    ? removedLookIds.includes(look.id)
    : !isOriginal && look.characterId === activeCharacter.id && !removedLookIds.includes(look.id));
  const availableCharacters = CHARACTERS.filter((character) =>
    availableLooks.some((look) => look.characterId === character.id),
  );
  const currentVariant = isOriginal ? null : getOutfitVariant(state.lookId);
  const inventoryScope = inventoryView.characterId === inventoryCharacterId ? inventoryView.scope : "character";
  const scopedInventory = getWardrobeInventory(inventoryCharacterId, { scope: inventoryScope });
  const inventoryItems = scopedInventory.filter(item => item.slot === selectedSlot);
  const ownItemCount = getWardrobeInventory(inventoryCharacterId).length;
  const selection = currentLook.wardrobeSelection || {};
  const selectedItemId = selection[selectedSlot] || "";
  const embeddedItems = getEmbeddedWardrobeItems(state.lookId);
  const slotLabel = GARMENT_SLOT_LABELS[selectedSlot];
  const candidateSelection = (slot, itemId) => {
    const next = { ...selection };
    if (itemId) next[slot] = itemId;
    else delete next[slot];
    return normalizeWardrobeSelection(next, { lookId: state.lookId });
  };
  function openFit(slot, itemId = "", operation = "equip") {
    setStudio({ kind: "fit", itemId, slot, operation, baseSelection: { ...selection } });
  }
  function wearItem(slot, itemId) {
    const result = selectWardrobeItem(slot, itemId);
    setAdaptationNotice(result?.message || "穿搭已更新。");
  }
  function restoreSlot() {
    const next = candidateSelection(selectedSlot, null);
    if (getWardrobeCombinationFit(state.lookId, next)) wearItem(selectedSlot, null);
    else openFit(selectedSlot, "", "restore");
  }

  useLayoutEffect(() => {
    if (pageRef.current) pageRef.current.scrollTop = 0;
  }, [view, query, category, studio, tab, activeCharacter.id, isOriginal, inventoryScope]);
  useEffect(() => {
    setInventoryView({ characterId: inventoryCharacterId, scope: "character" });
    const items = getWardrobeInventory(inventoryCharacterId);
    setSelectedSlot(items.find(item => item.slot === "shoes")?.slot || items[0]?.slot || "shoes");
  }, [inventoryCharacterId]);
  useEffect(() => setAdaptationNotice(""), [activeCharacter.id, isOriginal]);
  useEffect(() => setEditingName(false), [currentLook.characterId]);

  return (
    <section
      className="wardrobe-page"
      aria-label="选一种，陪你的模样"
      ref={pageRef}
      tabIndex={-1}
    >
      <header className="wardrobe-page-header">
        <div>
          <p className="eyebrow">FULL-BODY WARDROBE STUDIO</p>
          <h2>全身衣柜工作台</h2>
          <p>先选模型，再选完整造型或独立单品；女友本体始终独立。</p>
        </div>
        <div className="wardrobe-header-actions">
          {!studio && <button type="button" className="wardrobe-local-generate" onClick={() => setStudio({kind:"character"})}><Sparkle size={18} />新增模型</button>}
          <button type="button" className="wardrobe-close" aria-label="关闭衣柜" onClick={onClose}><X size={20} /></button>
        </div>
      </header>

      {studio ? <LocalStudio
        baseLook={withModelName(getLook(state.lookId), state.modelNames)}
        items={WARDROBE_ITEMS}
        initialKind={studio.kind}
        initialItemId={studio.itemId}
        initialSlot={studio.slot}
        baseSelection={studio.baseSelection || selection}
        operation={studio.operation || "equip"}
        onClose={() => setStudio(null)}
        onImported={(result) => { onStudioImported?.(result); setStudio(null); setTab(result.job?.kind === "fit" ? "parts" : "outfits"); }}
      /> : <div className="wardrobe-studio-grid">
        <aside className="wardrobe-characters" aria-label="外观模特列表">
          <p className="wardrobe-kicker">外观模型 · 选择人物</p>
          <div className="wardrobe-character-list">
            {availableCharacters.map((character) => {
              const name = getModelName(character.id, character.defaultName, state.modelNames);
              const look = availableLooks.find((look) => look.id === character.defaultLookId) ||
                availableLooks.find((look) => look.characterId === character.id);
              const selected = !isOriginal && character.id === activeCharacter.id;
              return (
                <button
                  type="button"
                  key={character.id}
                  className={selected ? "selected" : ""}
                  aria-label={`选择外观模特：${name}`}
                  aria-pressed={selected}
                  onClick={() => {
                    chooseCharacter(character.id);
                    setQuery("");
                    setCategory("全部");
                    setView("active");
                  }}
                >
                  <img src={look.thumbnail} alt="" loading="lazy" decoding="async" />
                  <span>{name}</span>
                  <small>{character.age} 岁</small>
                </button>
              );
            })}
            <button
              type="button"
              className={isOriginal ? "selected" : ""}
              aria-label={`选择外观模特：${originalName}`}
              aria-pressed={isOriginal}
              onClick={() => {
                chooseLook(ORIGINAL_LOOK.id);
                setQuery("");
                setCategory("全部");
                setView("active");
              }}
            >
              <span className="wardrobe-original-icon"><Sparkle size={24} /></span>
              <span>{originalName}</span>
              <small>原始 Live2D</small>
            </button>
          </div>
        </aside>

        <div className={`wardrobe-preview wardrobe-bg-${background.theme}`}>
          <div className="wardrobe-preview-scene" aria-hidden="true">
            <span className="wardrobe-preview-orb" />
            <span className="wardrobe-preview-floor" />
          </div>
          <div className="wardrobe-preview-model">
            <LivePet lookId={state.lookId} appearance={currentLook} petMode={true} {...petProps} />
          </div>
          <div className="wardrobe-preview-caption">
            <span>{background.name}</span>
            {editingName ? (
              <form className="model-name-form" onSubmit={(event) => {
                event.preventDefault();
                if (!nameDraft.trim()) return;
                renameModel(currentLook.characterId, nameDraft);
                setEditingName(false);
              }} onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.stopPropagation();
                  setEditingName(false);
                }
              }}>
                <input aria-label="模型名称" value={nameDraft} maxLength={24} autoFocus
                  onFocus={(event) => event.target.select()}
                  onChange={(event) => setNameDraft(event.target.value)} />
                <button type="submit" disabled={!nameDraft.trim()} aria-label="保存模型名称">保存</button>
                <button type="button" aria-label="取消改名" onClick={() => setEditingName(false)}>取消</button>
              </form>
            ) : (
              <div className="model-name-row">
                <strong>{currentLook.character}</strong>
                <button type="button" className="model-rename-button" aria-label="修改模型名称"
                  onClick={() => { setNameDraft(currentLook.character); setEditingName(true); }}>
                  <PencilSimple size={14} />改名
                </button>
              </div>
            )}
            <small>{currentLook.outfit} · 全身预览</small>
          </div>
        </div>

        <div className="wardrobe-editor">
          <div className="wardrobe-tabs" role="tablist" aria-label="衣柜编辑器">
            {TABS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "outfits" && (
            <div className="wardrobe-tab-panel wardrobe-outfits-panel" role="tabpanel">
              <div className="look-section-heading">
                <span>{view === "active" ? `${currentLook.character} · 完整造型` : "已移除造型 · 所有模型"}</span>
                <small>{view === "active" ? `${isOriginal ? 1 : modelLooks.length} 套完整造型` : "恢复后在对应模型下选择"}</small>
              </div>
              {!isOriginal && view === "active" && <div className="wardrobe-context-action">
                <p>这里的完整立绘属于同一个模型，选择造型会保留人物身份。</p>
                <button type="button" className="safe-empty-button" onClick={() => setStudio({kind:"outfit"})}><Sparkle size={15} />为{currentLook.character}生成新造型</button>
              </div>}
              {(!isOriginal || view === "removed") && <WardrobeFilters
                query={query}
                setQuery={setQuery}
                category={category}
                setCategory={setCategory}
                count={scopedLooks.length}
                view={view}
                setView={setView}
                availableCount={modelLooks.length}
                removedCount={removedLooks.length}
                total={view === "active" ? modelLooks.length : removedLooks.length}
                searchLabel={view === "active" ? "搜索当前模型的造型" : "搜索已移除造型"}
                searchPlaceholder={view === "active" ? "搜索当前模型的穿搭或风格" : "搜索已移除的模型或造型"}
                resultHint={view === "active" ? "仅当前模型" : "恢复后在对应模型下选择"}
              />}
              {isOriginal && view === "active" ? <div className="wardrobe-empty-note"><strong>{originalName} · 原始 Live2D 造型</strong><p>这个模型使用自带造型，暂不支持独立单品适配。</p><button type="button" className="safe-empty-button" onClick={() => setView("removed")}>管理已移除造型</button></div> : !scopedLooks.length && (
                <WardrobeEmpty
                  title={view === "removed" && !removedLookIds.length ? "目前没有已移除的造型" : undefined}
                  actionLabel={view === "removed" && !removedLookIds.length ? "返回可用造型" : undefined}
                  reset={() => {
                    if (view === "removed" && !removedLookIds.length) setView("active");
                    setQuery("");
                    setCategory("全部");
                  }}
                />
              )}
              <div className="live-look-grid">
                {scopedLooks.map((look) => {
                  const selected = state.lookId === look.id && state.avatarMode !== "photo";
                  return (
                    <article key={look.id} className={`live-look-card ${selected ? "chosen" : ""}`} style={{ "--look-accent": look.color }}>
                      {view === "active" ? (
                        <button
                          type="button"
                          className="live-look-main"
                          aria-label={`动态换装：${look.name}`}
                          aria-pressed={selected}
                          onClick={() => chooseLook(look.id)}
                        >
                          <LookCard look={look} selected={selected} />
                        </button>
                      ) : (
                        <div className="live-look-main is-removed"><LookCard look={look} selected={false} /></div>
                      )}
                      <button
                        type="button"
                        className="live-look-action"
                        aria-label={`${view === "active" ? "移除" : "恢复"}${look.name}`}
                        onClick={() => view === "active" ? removeLook(look.id) : restoreLook(look.id)}
                      >
                        {view === "active" ? <Trash size={13} /> : <ArrowCounterClockwise size={13} />}
                        {view === "active" ? "移除" : "恢复"}
                      </button>
                    </article>
                  );
                })}
              </div>
            </div>
          )}

          {tab === "parts" && (
            <div className="wardrobe-tab-panel wardrobe-parts-panel" role="tabpanel">
              <div className="wardrobe-section-card">
                <CoatHanger size={24} />
                <h3>{inventoryScope === "character" ? `${currentLook.character}的专属衣橱` : "全部单品衣橱"}</h3>
                <p>{inventoryScope === "character"
                  ? "展示来源于这个角色的独立部件，以及已分配给这个角色的共享单品。其他库存保留在全部衣橱中，可随时切换查看。"
                  : "这里保留所有角色和通用单品，可为当前角色适配；每次替换保留其余已选部件。"}</p>
              </div>
              <div className="wardrobe-inventory-scope" role="group" aria-label="单品衣橱范围">
                <button type="button" aria-pressed={inventoryScope === "character"}
                  onClick={() => setInventoryView({ characterId: inventoryCharacterId, scope: "character" })}>
                  角色专属 <span>{ownItemCount}</span>
                </button>
                <button type="button" aria-pressed={inventoryScope === "all"}
                  onClick={() => setInventoryView({ characterId: inventoryCharacterId, scope: "all" })}>
                  全部衣橱 <span>{WARDROBE_ITEMS.length}</span>
                </button>
              </div>
              <div className="part-slot-grid" aria-label="独立单品分类">
                {GARMENT_SLOT_IDS.map((slotId) => (
                  <button
                    type="button"
                    key={slotId}
                    className={selectedSlot === slotId ? "selected" : ""}
                    aria-label={`筛选单品：${GARMENT_SLOT_LABELS[slotId]}`}
                    aria-pressed={selectedSlot === slotId}
                    onClick={() => {
                      setSelectedSlot(slotId);
                      setAdaptationNotice("");
                    }}
                  >
                    <CoatHanger size={16} />
                    <span>{GARMENT_SLOT_LABELS[slotId]}</span>
                    <small>
                      {scopedInventory.filter(item => item.slot === slotId).length} 件独立单品
                    </small>
                  </button>
                ))}
              </div>
              <div className="part-browser-heading">
                <div>
                  <strong>{GARMENT_SLOT_LABELS[selectedSlot]} · 单品库存</strong>
                  <small>试穿模型：{currentLook.character}</small>
                </div>
                <button
                  type="button"
                  className="safe-empty-button"
                  aria-label="什么都不穿（白色比基尼）"
                  disabled={isOriginal}
                  onClick={() => {
                    const result = requestEmptyOutfit();
                    setAdaptationNotice(result.message);
                  }}
                >
                  清空穿搭 · 白色比基尼底装
                </button>
              </div>
              {adaptationNotice && (
                <p className="adaptation-notice" role="status">{adaptationNotice}</p>
              )}
              {isOriginal && <p className="adaptation-notice">Haru 暂不支持单品适配。请先选择其他外观模型。</p>}
              {!isOriginal && <div className="wardrobe-item-tools">
                <button type="button" className="safe-empty-button" onClick={() => openFit(selectedSlot)}><Sparkle size={15} />上传新{slotLabel}并适配</button>
                {selectedItemId && <button type="button" className="safe-empty-button" aria-label={`恢复原造型${slotLabel}`} onClick={restoreSlot}><ArrowCounterClockwise size={15} />恢复原造型{slotLabel}</button>}
              </div>}
              {Object.keys(selection).length > 0 && <p className="wardrobe-current-selection" aria-label="当前单品组合">
                当前组合：{Object.entries(selection).map(([slot, id]) => `${GARMENT_SLOT_LABELS[slot]} · ${WARDROBE_ITEMS.find(item => item.id === id)?.name || id}`).join(" / ")}
              </p>}
              {inventoryItems.length > 0 ? (
                <section className="wardrobe-inventory" aria-label={`${slotLabel}独立库存`}>
                  <div className="wardrobe-inventory-heading">
                    <h3>独立{slotLabel}库存</h3>
                    <small>{inventoryItems.length} 件单品 · {inventoryScope === "character" ? `${currentLook.character}专属` : "所有角色共享"}</small>
                  </div>
                  {!isOriginal && inventoryItems.some(item => !getWardrobeCombinationFit(state.lookId, candidateSelection(item.slot, item.id))) && <p className="wardrobe-context-note">只推荐当前模特已适配的造型，并保留当前单品组合。</p>}
                  <div className="wardrobe-item-grid">
                    {inventoryItems.map((item) => {
                      const selected = selectedItemId === item.id;
                      const embedded = embeddedItems.some(source => source.id === item.id);
                      const original = embedded && !selectedItemId;
                      const next = candidateSelection(item.slot, item.id);
                      const fit = !isOriginal && getWardrobeCombinationFit(state.lookId, next);
                      const source = item.sourceLookId ? getLook(item.sourceLookId) : null;
                      const sourceLook = source && source.id === item.sourceLookId ? withModelName(source, state.modelNames) : null;
                      const alternatives = !isOriginal && !fit ? modelLooks.filter(look =>
                        look.id !== state.lookId &&
                        getWardrobeCombinationFit(look.id, selection) &&
                        getWardrobeCombinationFit(look.id, next),
                      ).slice(0, 3) : [];
                      return (
                        <article key={item.id} className={`wardrobe-item-card ${selected || original ? "selected" : ""}`}>
                          <button
                            type="button"
                            className="wardrobe-item-main"
                            aria-label={`${GARMENT_SLOT_LABELS[item.slot]}库存：${item.name}`}
                            aria-pressed={selected || original}
                            disabled={!fit || original}
                            onClick={() => wearItem(item.slot, embedded ? null : item.id)}
                          >
                            <span className={`wardrobe-item-image ${item.slot === "nails" ? "wardrobe-nail-swatch" : ""}`}>
                              {item.slot === "nails" && item.color
                                ? <span className="wardrobe-color-swatch" style={{ "--nail-color": typeof item.color === "string" ? item.color : item.color.hex }} aria-label={`指甲颜色：${typeof item.color === "string" ? item.color : item.color.hex}`} />
                                : <img src={item.asset} alt="" loading="lazy" decoding="async" />}
                            </span>
                            <span className="wardrobe-item-copy">
                              <strong>{item.name}</strong>
                              <small>{item.description}</small>
                              <span className="wardrobe-item-source">来源：{sourceLook ? `${sourceLook.character} · ${sourceLook.outfit}` : item.sourceLabel || "独立单品库存"}</span>
                              <em>{original ? "原配 · 当前造型自带" : selected ? "已穿上" : fit ? embedded ? "恢复此原配" : "点击穿上" : "当前组合待适配"}</em>
                              {fit?.visibilityNote && <small>{fit.visibilityNote}</small>}
                            </span>
                            {(selected || original) && <Check size={18} />}
                          </button>
                          {alternatives.length > 0 && <div className="wardrobe-item-alternatives">
                            <small>同一角色 · 已适配造型</small>
                            {alternatives.map(look => <button key={look.id} type="button" className="safe-empty-button" aria-label={`切换到${look.name}适配${item.name}`} onClick={() => {
                              chooseLook(look.id);
                              setAdaptationNotice(`已切换到「${look.outfit}」，保留当前单品组合；点击单品即可换上「${item.name}」。`);
                            }}>{look.outfit} · 可穿此单品</button>)}
                          </div>}
                          {!isOriginal && !fit && <button type="button" className="wardrobe-item-adapt" aria-label={`本地适配：${item.name}`} onClick={() => openFit(item.slot, embedded ? "" : item.id, embedded ? "restore" : "equip")}><Sparkle size={14} />适配到当前角色</button>}
                        </article>
                      );
                    })}
                  </div>
                </section>
              ) : <div className="wardrobe-empty-note">
                <strong>{inventoryScope === "character" ? `${currentLook.character}还没有独立${slotLabel}` : `还没有独立${slotLabel}`}</strong>
                <p>{inventoryScope === "character"
                  ? `可以在全部衣橱中挑选${slotLabel}，或上传新部件适配到当前角色。完整造型中的衣物仍保留在原造型里。`
                  : `上传${slotLabel}参考图片，适配后会保存在单品库存，供其他角色继续使用。`}</p>
                {inventoryScope === "character" && <button type="button" className="safe-empty-button"
                  onClick={() => setInventoryView({ characterId: inventoryCharacterId, scope: "all" })}>查看全部{slotLabel}</button>}
              </div>}
              {currentVariant?.slots[selectedSlot]?.length > 0 && !embeddedItems.some(item => item.slot === selectedSlot) && <details className="wardrobe-source-notes">
                <summary>造型参考（需生成适配）</summary>
                <p>以下是当前完整立绘的服饰描述，仅作为参考，尚无独立单品图片。</p>
                <ul>{currentVariant.slots[selectedSlot].map(part => <li key={part.id}>{part.name}</li>)}</ul>
              </details>}
            </div>
          )}

          {tab === "background" && (
            <div className="wardrobe-tab-panel" role="tabpanel">
              <div className="background-grid">
                {BACKGROUNDS.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={`background-card wardrobe-bg-${item.theme} ${item.id === state.backgroundId ? "selected" : ""}`}
                    aria-label={`背景：${item.name}`}
                    aria-pressed={item.id === state.backgroundId}
                    onClick={() => setBackground(item.id)}
                  >
                    <span className="background-swatch"><ImageSquare size={22} /></span>
                    <strong>{item.name}</strong>
                    <small>{item.description}</small>
                    {item.id === state.backgroundId && <Check size={17} />}
                  </button>
                ))}
              </div>
              <p className="outfit-section-label">写实场景 · 图片预设</p>
              <p className="wardrobe-context-note">选择后切换到静态图片场景；返回模型列表可继续使用动态人物。</p>
              <div className="outfit-grid wardrobe-scene-grid">
                {SCENES.map((scene, index) => (
                  <button
                    key={scene.id}
                    type="button"
                    className="outfit-card"
                    aria-label={`换装：${scene.name}`}
                    onClick={() => chooseScene(scene.id)}
                  >
                    <div className="outfit-photo"><img src={`/assets/scene-${scene.id}.png`} alt={`${scene.short}造型`} loading="lazy" decoding="async" /><span className="outfit-number">{String(index + 1).padStart(2, "0")}</span></div>
                    <div className="outfit-info"><strong>{scene.name}</strong><span>{scene.desc}</span></div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>}
    </section>
  );
}

function LookCard({ look, selected }) {
  return (
    <>
      <span className="live-look-preview">
        <span className="look-placeholder"><CoatHanger size={28} /><span>{look.character}</span></span>
        <img src={look.thumbnail} alt="" loading="lazy" decoding="async" />
        <span className="look-age">{look.age}+</span>
        {look.isNew && <span className="look-new">NEW</span>}
        {selected && <span className="chosen-check"><Check size={13} weight="bold" /></span>}
      </span>
      <span className="live-look-info">
        <strong>{look.character}<small>{look.outfit}</small></strong>
        <span className="look-style-tags">{[look.region, ...look.styles].filter(Boolean).join(" · ")}</span>
        <span>{look.description}</span>
      </span>
    </>
  );
}
