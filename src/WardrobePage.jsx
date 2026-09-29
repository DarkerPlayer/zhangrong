import React, { useLayoutEffect, useRef, useState } from "react";
import {
  ArrowCounterClockwise,
  Check,
  CoatHanger,
  ImageSquare,
  Plus,
  Sparkle,
  Trash,
  X,
} from "@phosphor-icons/react";
import LivePet from "./LivePet.jsx";
import WardrobeFilters, { WardrobeEmpty } from "./WardrobeFilters.jsx";
import { SCENES } from "./state.mjs";
import { getLook, ORIGINAL_LOOK, summarizeLooks } from "./looks.mjs";
import {
  BACKGROUNDS,
  CHARACTERS,
  CURATED_STYLE_RECIPES,
  GARMENT_SLOT_IDS,
  getOutfitVariant,
  getVariantsBySlot,
} from "./wardrobe.mjs";

const SLOT_LABELS = Object.freeze({
  hair: "发型",
  top: "上装",
  bottom: "下装",
  dress: "连身装",
  outerwear: "外套",
  underwear: "内搭 / 内衣",
  hosiery: "袜类",
  shoes: "鞋履",
  accessories: "配饰",
});

const TABS = [
  ["outfits", "套装"],
  ["parts", "部件"],
  ["background", "背景"],
];

export default function WardrobePage({
  state,
  currentLook,
  activeCharacter,
  visibleLooks,
  availableLookCount,
  removedLookIds,
  query,
  setQuery,
  category,
  setCategory,
  view,
  setView,
  chooseLook,
  chooseCharacter,
  removeLook,
  restoreLook,
  chooseScene,
  setBackground,
  requestEmptyOutfit,
  onClose,
  petProps,
}) {
  const [tab, setTab] = useState("outfits");
  const [selectedSlot, setSelectedSlot] = useState("shoes");
  const [adaptationNotice, setAdaptationNotice] = useState("");
  const pageRef = useRef();
  const background =
    BACKGROUNDS.find((item) => item.id === state.backgroundId) || BACKGROUNDS[0];
  const currentVariant = getOutfitVariant(state.lookId);
  const reusableVariants = getVariantsBySlot(selectedSlot);

  useLayoutEffect(() => {
    if (pageRef.current) pageRef.current.scrollTop = 0;
  }, [view, query, category]);

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
          <p>这里只选择外观模特、衣服和背景；女友本体始终独立。</p>
        </div>
        <button type="button" className="wardrobe-close" aria-label="关闭衣柜" onClick={onClose}>
          <X size={20} />
        </button>
      </header>

      <div className="wardrobe-studio-grid">
        <aside className="wardrobe-characters" aria-label="外观模特列表">
          <p className="wardrobe-kicker">APPEARANCE MODELS</p>
          <div className="wardrobe-character-list">
            {CHARACTERS.map((character) => {
              const name = character.defaultName;
              const look = getLook(character.defaultLookId);
              const selected = character.id === activeCharacter.id;
              return (
                <button
                  type="button"
                  key={character.id}
                  className={selected ? "selected" : ""}
                  aria-label={`选择外观模特：${name}`}
                  aria-pressed={selected}
                  onClick={() => chooseCharacter(character.id)}
                >
                  <img src={look.thumbnail} alt="" />
                  <span>{name}</span>
                  <small>{character.age} 岁</small>
                </button>
              );
            })}
          </div>
        </aside>

        <div className={`wardrobe-preview wardrobe-bg-${background.theme}`}>
          <div className="wardrobe-preview-scene" aria-hidden="true">
            <span className="wardrobe-preview-orb" />
            <span className="wardrobe-preview-floor" />
          </div>
          <div className="wardrobe-preview-model">
            <LivePet lookId={state.lookId} petMode={true} {...petProps} />
          </div>
          <div className="wardrobe-preview-caption">
            <span>{background.name}</span>
            <strong>{currentLook.character}</strong>
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
                <span>{view === "active" ? "可用完整造型" : "已移除造型"}</span>
                <small>{summarizeLooks(removedLookIds)}</small>
              </div>
              <WardrobeFilters
                query={query}
                setQuery={setQuery}
                category={category}
                setCategory={setCategory}
                count={visibleLooks.length}
                view={view}
                setView={setView}
                availableCount={availableLookCount}
                removedCount={removedLookIds.length}
                total={view === "active" ? availableLookCount : removedLookIds.length}
              />
              {!visibleLooks.length && (
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
                {visibleLooks.map((look) => {
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
              {view === "active" && (
                <button
                  type="button"
                  className={`animated-choice original-look-choice ${state.lookId === ORIGINAL_LOOK.id ? "selected" : ""}`}
                  onClick={() => chooseLook(ORIGINAL_LOOK.id)}
                  aria-pressed={state.lookId === ORIGINAL_LOOK.id}
                >
                  <span className="animated-choice-icon"><Sparkle size={26} /></span>
                  <span><strong>{ORIGINAL_LOOK.name}</strong><small>原始造型</small></span>
                  {state.lookId === ORIGINAL_LOOK.id ? <Check size={20} /> : null}
                </button>
              )}
              <p className="outfit-section-label">写实场景 · 图片预设</p>
              <div className="outfit-grid wardrobe-scene-grid">
                {SCENES.map((scene, index) => (
                  <button
                    key={scene.id}
                    type="button"
                    className="outfit-card"
                    aria-label={`换装：${scene.name}`}
                    onClick={() => chooseScene(scene.id)}
                  >
                    <div className="outfit-photo"><img src={`/assets/scene-${scene.id}.png`} alt={`${scene.short}造型`} /><span className="outfit-number">{String(index + 1).padStart(2, "0")}</span></div>
                    <div className="outfit-info"><strong>{scene.name}</strong><span>{scene.desc}</span></div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {tab === "parts" && (
            <div className="wardrobe-tab-panel wardrobe-parts-panel" role="tabpanel">
              <div className="wardrobe-section-card">
                <CoatHanger size={24} />
                <h3>当前造型部件</h3>
                <p>每个部件都保留来源造型与适配策略。跨外观模特使用时会生成新的合身成品，不会直接叠图。</p>
              </div>
              <div className="part-slot-grid" aria-label="当前造型的可复用部件">
                {GARMENT_SLOT_IDS.map((slotId) => (
                  <button
                    type="button"
                    key={slotId}
                    className={selectedSlot === slotId ? "selected" : ""}
                    aria-label={`筛选部件：${SLOT_LABELS[slotId]}`}
                    aria-pressed={selectedSlot === slotId}
                    onClick={() => {
                      setSelectedSlot(slotId);
                      setAdaptationNotice("");
                    }}
                  >
                    <Plus size={16} />
                    <span>{SLOT_LABELS[slotId]}</span>
                    <small>
                      {currentVariant.slots[slotId].length
                        ? currentVariant.slots[slotId].map((part) => part.name).join(" / ")
                        : "当前造型未单独编目"}
                    </small>
                  </button>
                ))}
              </div>
              <div className="part-browser-heading">
                <div>
                  <strong>可复用的{SLOT_LABELS[selectedSlot]}</strong>
                  <small>{reusableVariants.length} 套已编目造型可作为适配来源</small>
                </div>
                <button
                  type="button"
                  className="safe-empty-button"
                  aria-label="什么都不穿（白色比基尼）"
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
              <div className="reusable-part-list">
                {reusableVariants.map((variant) => {
                  const look = getLook(variant.lookId);
                  return (
                    <button
                      type="button"
                      key={`${selectedSlot}-${variant.id}`}
                      onClick={() => setAdaptationNotice(`「${look.name}」的${SLOT_LABELS[selectedSlot]}已记录；切换到 ${currentLook.character} 外观模特需先生成合身适配图。`)}
                    >
                      <img src={look.thumbnail} alt="" />
                      <span><strong>{look.name}</strong><small>{variant.slots[selectedSlot].map((part) => part.name).join(" / ")}</small></span>
                    </button>
                  );
                })}
              </div>
              <div className="style-recipe-heading">
                <strong>日韩成年穿搭灵感</strong>
                <small>选中后作为合身成品的生成单，不直接叠图</small>
              </div>
              <div className="style-recipe-grid">
                {CURATED_STYLE_RECIPES.map((recipe) => (
                  <button
                    type="button"
                    key={recipe.id}
                    onClick={() => setAdaptationNotice(`已选「${recipe.name}」作为 ${currentLook.character} 外观模特的合身生成单；生成完整立绘后才会切换。`)}
                  >
                    <span>{recipe.region}</span>
                    <strong>{recipe.name}</strong>
                    <small>{recipe.mood}</small>
                  </button>
                ))}
              </div>
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
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function LookCard({ look, selected }) {
  return (
    <>
      <span className="live-look-preview">
        <span className="look-placeholder"><CoatHanger size={28} /><span>{look.character}</span></span>
        <img src={look.thumbnail} alt="" loading="lazy" />
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
