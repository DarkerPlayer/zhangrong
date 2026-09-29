import React, { useState } from "react";
import { ArrowLeft, Copy, Heart, Plus, Trash, UserCircle } from "@phosphor-icons/react";
import VoiceLibrary from "./VoiceLibrary.jsx";
import "./persona.css";

const LEVELS = [
  ["sweet", "甜蜜", "温柔黏人，轻轻撒娇"],
  ["mature", "成熟", "更会调侃，也更主动"],
  ["adult", "成人", "成年人的坦率暧昧"],
];

const CATEGORY_LABELS = {
  greeting: "见面",
  daily: "日常",
  affection: "甜言蜜语",
  teasing: "调侃",
  seduction: "诱惑",
  comfort: "安慰",
  jealousy: "吃醋",
  praise: "夸奖",
  goodnight: "晚安",
  fallback: "通用",
};

export default function PersonaPage({
  state,
  activePersona,
  activeSnapshot,
  appearanceCaption,
  selectPersona,
  setIntimacy,
  renamePersona,
  setPersonaAge,
  clonePersona,
  removePersona,
  addCorpus,
  toggleCorpus,
  deleteCorpus,
  voiceProps,
  onClose,
}) {
  const [adultDialog, setAdultDialog] = useState(false);
  const [corpusText, setCorpusText] = useState("");
  const [corpusTitle, setCorpusTitle] = useState("");
  const [category, setCategory] = useState("teasing");
  const [level, setLevel] = useState(activePersona.intimacyLevel);
  const profiles = Object.values(state.personas);

  const chooseLevel = (next) => {
    if (next === "adult" && !activePersona.adultAcknowledged) {
      setAdultDialog(true);
      return;
    }
    setIntimacy(next, activePersona.adultAcknowledged);
  };

  const submitCorpus = (event) => {
    event.preventDefault();
    if (!corpusText.trim()) return;
    addCorpus(corpusText, corpusTitle, category, level);
    setCorpusText("");
    setCorpusTitle("");
  };

  return (
    <section className="persona-page" aria-label="女友本体">
      <header className="persona-page-header">
        <button type="button" className="persona-back" onClick={onClose}>
          <ArrowLeft size={18} /> 返回陪伴
        </button>
        <div>
          <p>GIRLFRIEND PERSONA STUDIO</p>
          <h1>女友本体</h1>
          <span>性格、语言、记忆与声音都独立保存。</span>
        </div>
        <div className="persona-skin-note">
          <UserCircle size={20} />
          <span>当前外观「{appearanceCaption}」只是一层形象，不改变人格。</span>
        </div>
      </header>

      <div className="persona-layout">
        <aside className="persona-roster" aria-label="女友列表">
          <div className="persona-roster-heading">
            <strong>选择女友</strong>
            <small>{profiles.length} 个独立本体</small>
          </div>
          {profiles.map((profile) => (
            <button
              type="button"
              key={profile.id}
              className={profile.id === state.activePersonaId ? "selected" : ""}
              aria-label={`选择女友：${profile.displayName}`}
              onClick={() => selectPersona(profile.id)}
            >
              <span className="persona-card-mark"><Heart weight="fill" size={16} /></span>
              <span>
                <strong>{profile.displayName}</strong>
                <small>{profile.custom ? "自定义副本" : activeSnapshot.id === profile.id ? activeSnapshot.archetype : profile.templateId}</small>
              </span>
              <em>{profile.intimacyLevel === "sweet" ? "甜蜜" : profile.intimacyLevel === "adult" ? "成人" : "成熟"}</em>
            </button>
          ))}
          <button type="button" className="persona-copy" onClick={clonePersona} aria-label="复制当前人格">
            <Copy size={16} /> 复制当前人格
          </button>
        </aside>

        <main className="persona-editor">
          <section className="persona-identity-card">
            <div className="persona-section-title">
              <span>01</span>
              <div><h2>身份与关系</h2><p>这是她最本源的设定，与画面模型无关。</p></div>
            </div>
            <div className="persona-fields">
              <label>
                人格名称
                <input
                  aria-label="人格名称"
                  maxLength={24}
                  value={activePersona.displayName}
                  onChange={(event) => renamePersona(event.target.value)}
                />
              </label>
              {activePersona.custom && (
                <label>
                  人格年龄
                  <input
                    aria-label="人格年龄"
                    type="number"
                    min="25"
                    max="99"
                    value={activePersona.age}
                    onChange={(event) => setPersonaAge(Math.max(25, Math.min(99, Number(event.target.value) || 25)))}
                  />
                </label>
              )}
            </div>
            <div className="persona-definition">
              <strong>{activeSnapshot.archetype} · {activeSnapshot.age} 岁</strong>
              <p>{activeSnapshot.identity.selfDescription}</p>
              <p>{activeSnapshot.identity.relationshipStyle}</p>
            </div>
            {activePersona.custom && (
              <button type="button" className="persona-danger" onClick={removePersona}>
                <Trash size={15} /> 删除这个副本
              </button>
            )}
          </section>

          <section className="persona-intimacy-card">
            <div className="persona-section-title">
              <span>02</span>
              <div><h2>亲密程度</h2><p>同一个本体，在不同程度下使用完全不同的亲密语料。</p></div>
            </div>
            <div className="persona-levels">
              {LEVELS.map(([id, label, description]) => (
                <button
                  type="button"
                  key={id}
                  className={activePersona.intimacyLevel === id ? "selected" : ""}
                  aria-label={`亲密度：${label}`}
                  onClick={() => chooseLevel(id)}
                >
                  <strong>{label}</strong>
                  <span>{description}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="persona-corpus-card">
            <div className="persona-section-title">
              <span>03</span>
              <div><h2>独立语言语料</h2><p>这里只影响当前女友，不会串到其他人格。</p></div>
            </div>
            <form className="persona-corpus-form" onSubmit={submitCorpus}>
              <input aria-label="人格语料标题" placeholder="名称（选填）" maxLength={60} value={corpusTitle} onChange={(event) => setCorpusTitle(event.target.value)} />
              <div>
                <select aria-label="人格语料类型" value={category} onChange={(event) => setCategory(event.target.value)}>
                  {Object.entries(CATEGORY_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
                <select aria-label="人格语料亲密度" value={level} onChange={(event) => setLevel(event.target.value)}>
                  {LEVELS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
              </div>
              <textarea aria-label="人格语料内容" maxLength={240} placeholder="写一句她独有的表达方式…" value={corpusText} onChange={(event) => setCorpusText(event.target.value)} />
              <button type="submit" disabled={!corpusText.trim()} aria-label="添加人格语料"><Plus size={16} /> 添加语料</button>
            </form>
            <div className="persona-corpus-list">
              {!activePersona.customCorpora.length ? <p className="persona-empty">还没有自定义语料；内置本体语料已经生效。</p> : activePersona.customCorpora.map((item) => (
                <article key={item.id}>
                  <div><strong>{item.title}</strong><small>{CATEGORY_LABELS[item.category]} · {LEVELS.find(([id]) => id === item.level)?.[1]}</small></div>
                  <p>{item.text}</p>
                  <div className="persona-corpus-actions">
                    <button type="button" role="switch" aria-checked={item.enabled} aria-label={`启用语料：${item.title}`} onClick={() => toggleCorpus(item.id)}>{item.enabled ? "已启用" : "已停用"}</button>
                    <button type="button" aria-label={`删除人格语料：${item.title}`} onClick={() => deleteCorpus(item.id)}><Trash size={14} /> 删除</button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="persona-voice-card">
            <div className="persona-section-title">
              <span>04</span>
              <div><h2>专属音色</h2><p>选择结果只保存到当前女友。</p></div>
            </div>
            <VoiceLibrary {...voiceProps} personaName={activePersona.displayName} preferredVoiceId={activePersona.voiceProfileId} />
          </section>
        </main>
      </div>

      {adultDialog && (
        <div className="persona-dialog-backdrop">
          <div className="persona-dialog" role="dialog" aria-modal="true" aria-label="确认成人亲密模式">
            <h2>启用成人亲密模式？</h2>
            <p>此模式仅用于已满 18 岁用户与成年虚拟角色之间自愿、可随时停止的暧昧互动。</p>
            <div>
              <button type="button" onClick={() => setAdultDialog(false)} aria-label="取消成人模式">取消</button>
              <button type="button" className="confirm" onClick={() => { setIntimacy("adult", true); setAdultDialog(false); }} aria-label="确认已成年并启用">我已成年，确认启用</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
