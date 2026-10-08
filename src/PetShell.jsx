import React, { useState, useRef, useEffect, useLayoutEffect } from "react";
import {
  ChatCircleDots,
  ArrowUp,
  ArrowsOut,
  Heart,
  HandWaving,
  DotsSix,
  X,
  SpeakerHigh,
  SpeakerSlash,
  Stop,
  CoatHanger,
  Check,
  Sparkle,
  Trash,
  ArrowCounterClockwise,
} from "@phosphor-icons/react";
import LivePet from "./LivePet.jsx";
import {
  filterLooks,
  getAvailableLooks,
  getLook,
  summarizeLooks,
} from "./looks.mjs";
import WardrobeFilters, { WardrobeEmpty } from "./WardrobeFilters.jsx";
import LookActionMenu from "./LookActionMenu.jsx";

export default function PetShell({
  characterName = "张容",
  modelNames = {},
  lookId,
  appearance,
  removedLookIds = [],
  chooseLook,
  removeLook,
  restoreLook,
  mood,
  action,
  motion,
  line,
  dialogueStatus = "",
  busy,
  speaking,
  voice,
  input,
  setInput,
  send,
  stop,
  interact,
  exit,
  toggleVoice,
  inputRef,
  onError,
  onReady,
  native,
}) {
  const [chatOpen, setChatOpen] = useState(false);
  const [wardrobeOpen, setWardrobeOpen] = useState(false);
  const [wardrobeQuery, setWardrobeQuery] = useState("");
  const [wardrobeCategory, setWardrobeCategory] = useState("全部");
  const [wardrobeView, setWardrobeView] = useState("active");
  const wardrobeButton = useRef(null);
  const wardrobePanel = useRef(null);
  const wardrobeResults = useRef(null);
  useLayoutEffect(() => {
    if (wardrobeResults.current) wardrobeResults.current.scrollTop = 0;
  }, [wardrobeView, wardrobeQuery, wardrobeCategory]);
  const currentLook = appearance?.id === lookId ? appearance : getLook(lookId);
  const availableLookCount = getAvailableLooks(removedLookIds).length;
  const visibleLooks = filterLooks({
    modelNames,
    query: wardrobeQuery,
    category: wardrobeCategory,
    removedLookIds,
    view: wardrobeView,
  });
  const dragging = useRef(false);
  useEffect(() => {
    if (!wardrobeOpen) return;
    const button = wardrobeButton.current;
    wardrobePanel.current?.querySelector('input[type="search"]')?.focus();
    function closeOnEscape(event) {
      if (event.key === "Escape") setWardrobeOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      if (button?.isConnected) button.focus();
    };
  }, [wardrobeOpen]);
  function endDrag() {
    if (!dragging.current) return;
    dragging.current = false;
    window.desktop?.endPetDrag?.().catch(() => {});
  }
  useEffect(
    () => () => {
      if (dragging.current) window.desktop?.endPetDrag?.().catch(() => {});
    },
    [],
  );
  function beginDrag(event) {
    if (!native || event.button !== 0 || !window.desktop?.beginPetDrag) return;
    event.preventDefault();
    dragging.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    window.desktop.beginPetDrag(event.screenX, event.screenY).catch(() => {
      dragging.current = false;
    });
  }
  function moveDrag(event) {
    if (!dragging.current) return;
    window.desktop.movePetDrag(event.screenX, event.screenY).catch(endDrag);
  }
  return (
    <div className={`pet-shell ${native ? "is-native" : "browser-pet"}`}>
      <div className="pet-topline">
        <div
          className="pet-drag"
          title="按住这里拖动桌宠"
          onPointerDown={beginDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onLostPointerCapture={endDrag}
        >
          <DotsSix size={18} />
          <span>{characterName}</span>
          <i />
        </div>
        <button
          title={`当前：${currentLook.outfit} · 换装`}
          aria-label="桌宠换装"
          aria-expanded={wardrobeOpen}
          aria-controls="pet-wardrobe"
          ref={wardrobeButton}
          onClick={() => setWardrobeOpen((open) => !open)}
        >
          <CoatHanger size={15} />
        </button>
        <button
          title={voice ? "关闭语音朗读" : "开启语音朗读"}
          aria-label={voice ? "关闭语音朗读" : "开启语音朗读"}
          onClick={toggleVoice}
        >
          {voice ? <SpeakerHigh size={15} /> : <SpeakerSlash size={15} />}
        </button>
        <button title="返回陪伴窗口" aria-label="返回陪伴窗口" onClick={exit}>
          <ArrowsOut size={15} />
        </button>
      </div>
      {wardrobeOpen && (
        <div className="pet-wardrobe-layer">
          <button
            className="pet-wardrobe-backdrop"
            aria-label="收起桌宠衣橱"
            onClick={() => setWardrobeOpen(false)}
          />
          <section
            id="pet-wardrobe"
            className="pet-wardrobe"
            role="dialog"
            aria-label="桌宠衣橱"
            ref={wardrobePanel}
          >
            <div className="pet-wardrobe-heading">
              <div>
                <strong>换一种心情</strong>
                <span>{summarizeLooks(removedLookIds)}</span>
              </div>
              <button
                aria-label="关闭桌宠衣橱"
                onClick={() => setWardrobeOpen(false)}
              >
                <X size={17} />
              </button>
            </div>
            <WardrobeFilters
              compact
              query={wardrobeQuery}
              setQuery={setWardrobeQuery}
              category={wardrobeCategory}
              setCategory={setWardrobeCategory}
              count={visibleLooks.length}
              view={wardrobeView}
              setView={setWardrobeView}
              availableCount={availableLookCount}
              removedCount={removedLookIds.length}
              total={
                wardrobeView === "active"
                  ? availableLookCount
                  : removedLookIds.length
              }
            />
            <div className="pet-look-results" ref={wardrobeResults}>
              {!visibleLooks.length && (
                <WardrobeEmpty
                  title={
                    wardrobeView === "removed" && removedLookIds.length === 0
                      ? "目前没有已移除的造型"
                      : undefined
                  }
                  actionLabel={
                    wardrobeView === "removed" && removedLookIds.length === 0
                      ? "返回可用造型"
                      : undefined
                  }
                  reset={() => {
                    if (
                      wardrobeView === "removed" &&
                      removedLookIds.length === 0
                    ) {
                      setWardrobeView("active");
                      setWardrobeQuery("");
                      setWardrobeCategory("全部");
                    } else {
                      setWardrobeQuery("");
                      setWardrobeCategory("全部");
                    }
                  }}
                />
              )}
              <div className="pet-look-grid">
                {visibleLooks.map((look) => {
                  const selected =
                    wardrobeView === "active" && lookId === look.id;
                  const cardContent = (
                    <>
                      <span className="pet-look-preview">
                        <span className="look-placeholder" aria-hidden="true">
                          <Sparkle size={22} weight="thin" />
                        </span>
                        <img
                          src={look.thumbnail}
                          alt=""
                          loading="lazy"
                          onError={(event) => {
                            event.currentTarget.hidden = true;
                          }}
                        />
                        {look.isNew && <span className="look-new">NEW</span>}
                        {selected && (
                          <span className="pet-look-check">
                            <Check size={11} weight="bold" />
                          </span>
                        )}
                      </span>
                      <strong>{look.character}</strong>
                      <small>{look.outfit}</small>
                    </>
                  );
                  return (
                    <article
                      key={look.id}
                      className={`pet-look-card ${selected ? "chosen" : ""}`}
                      style={{ "--look-accent": look.color }}
                    >
                      {wardrobeView === "active" ? (
                        <button
                          type="button"
                          className="pet-look-main"
                          aria-label={`动态换装：${look.name}`}
                          aria-pressed={selected}
                          onClick={() => {
                            chooseLook(look.id);
                            setWardrobeOpen(false);
                          }}
                        >
                          {cardContent}
                        </button>
                      ) : (
                        <div className="pet-look-main is-removed">
                          {cardContent}
                        </div>
                      )}
                      <button
                        type="button"
                        className="pet-look-action"
                        aria-label={`${wardrobeView === "active" ? "移除" : "恢复"}${look.name}`}
                        onClick={() =>
                          wardrobeView === "active"
                            ? removeLook(look.id)
                            : restoreLook(look.id)
                        }
                      >
                        {wardrobeView === "active" ? (
                          <Trash size={11} />
                        ) : (
                          <ArrowCounterClockwise size={11} />
                        )}
                        {wardrobeView === "active" ? "移除" : "恢复"}
                      </button>
                    </article>
                  );
                })}
              </div>
            </div>
          </section>
        </div>
      )}
      {dialogueStatus && <div className="pet-corpus-status" role="status" aria-label="角色语料状态">
        {dialogueStatus}
      </div>}
      {(!dialogueStatus || Boolean(line) && !busy) && <div
        className={`pet-bubble ${speaking ? "speaking" : ""}`}
        aria-live="polite"
      >
        <span>{busy ? "让我想一想…" : line}</span>
        <i />
      </div>}
      <div className="pet-character">
      <LivePet
        lookId={lookId}
        appearance={appearance}
          mood={mood}
          action={action}
          motion={motion}
          petMode
          onInteract={interact}
          onError={onError}
          onReady={onReady}
        />
      </div>
      <div className="pet-bottom">
        <div className="pet-actions">
          <button onClick={() => interact("pat")}>
            <Heart size={16} />
            摸摸头
          </button>
          <button onClick={() => interact("wave")}>
            <HandWaving size={16} />
            {currentLook.greetingMotion === "nod" ? "打个招呼" : "挥挥手"}
          </button>
          <LookActionMenu look={currentLook} onSelect={interact} compact />
          <button
            onClick={() => {
              setChatOpen((v) => !v);
              setTimeout(() => inputRef.current?.focus(), 50);
            }}
            aria-expanded={chatOpen}
          >
            <ChatCircleDots size={16} />
            {chatOpen ? "收起" : "聊天"}
          </button>
        </div>
        {chatOpen && (
          <form
            className="pet-composer"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <input
              ref={inputRef}
              aria-label={`对${characterName}说点什么`}
              placeholder="我在，慢慢说…"
              value={input}
              maxLength={1000}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  (e.nativeEvent.isComposing || e.keyCode === 229)
                )
                  e.preventDefault();
              }}
            />
            {busy ? (
              <button type="button" aria-label="停止生成" onClick={stop}>
                <Stop size={16} />
              </button>
            ) : (
              <button
                type="submit"
                aria-label="发送消息"
                disabled={!input.trim()}
              >
                <ArrowUp size={18} />
              </button>
            )}
          </form>
        )}
        {!native && (
          <p className="pet-browser-note">
            桌宠预览 · 在母狗张容.app 中可透明置顶和拖动
          </p>
        )}
      </div>
    </div>
  );
}
