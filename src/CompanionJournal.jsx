import React, { useRef, useState } from "react";
import { Check, PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import { getRelationshipSummary } from "./companion-memory.mjs";

const MEMORY_KINDS = { fact: "关于你", preference: "喜好", event: "重要事情", plan: "共同计划" };
const EXPERIENCE_KINDS = { date: "一次约会", movie: "一起看电影", focus: "专注陪伴", support: "互相支持", activity: "其他共同活动" };
const ACTIVITY_PROMPTS = {
  "回顾共同经历": "我们最近一起完成了哪些事？挑一件和我聊聊。",
  "一起制定下一次计划": "根据我们之前的共同经历，一起想个下次可以完成的小计划。",
  "回顾陪伴里程碑": "回顾一下我们的相处记录，有哪些值得纪念的变化？",
};
const freshDraft = () => ({ memory: { kind: "fact", text: "" }, experience: { kind: "date", title: "", detail: "", confirmed: false }, notice: "", showAll: false });
const dateLabel = (value) => Number.isFinite(Number(value)) && Number(value) > 0
  ? new Date(Number(value)).toLocaleDateString("zh-CN", { month: "short", day: "numeric" })
  : "";

export default function CompanionJournal({ personaId, personaName, thread = {}, onSaveMemory, onDeleteMemory, onRecordExperience, onUpdateExperience, onDeleteExperience, onStartActivity }) {
  const [drafts, setDrafts] = useState({});
  const memoryForm = useRef();
  const experienceForm = useRef();
  const draft = drafts[personaId] || freshDraft();
  const updateDraft = (patch) => setDrafts(current => ({ ...current, [personaId]: { ...(current[personaId] || freshDraft()), ...patch } }));
  const setMemory = (patch) => updateDraft({ memory: { ...draft.memory, ...patch }, notice: "" });
  const setExperience = (patch) => updateDraft({ experience: { ...draft.experience, ...patch }, notice: "" });
  const summary = getRelationshipSummary(thread);
  const entries = (thread.memories?.entries || []).slice().sort((a, b) => b.updatedAt - a.updatedAt);
  const experiences = (thread.relationship?.experiences || []).slice().sort((a, b) => b.createdAt - a.createdAt);
  const visibleEntries = draft.showAll ? entries : entries.slice(0, 5);

  function saveMemory(event) {
    event.preventDefault();
    const text = draft.memory.text.trim();
    if (!text || !onSaveMemory) return;
    const existing = entries.find(entry => entry.id === draft.memory.id);
    onSaveMemory({ ...(existing || {}), ...(draft.memory.id ? { id: draft.memory.id } : {}), kind: draft.memory.kind, text, source: "manual" });
    updateDraft({ memory: freshDraft().memory, notice: "已保存这条记忆。" });
  }

  function editMemory(entry) {
    updateDraft({ memory: { id: entry.id, kind: entry.kind, text: entry.text }, notice: "" });
    if (memoryForm.current) memoryForm.current.open = true;
  }

  function saveExperience(event) {
    event.preventDefault();
    const { id, kind, title, detail, confirmed } = draft.experience;
    if (!title.trim()) return;
    if (id) {
      if (!onUpdateExperience) return;
      onUpdateExperience(id, { title: title.trim(), detail: detail.trim() });
    } else {
      if (!confirmed || !onRecordExperience) return;
      onRecordExperience({ kind, title: title.trim(), detail: detail.trim() });
    }
    updateDraft({ experience: freshDraft().experience, notice: id ? "已更正这次共同经历。" : "已记下这次共同经历。" });
  }

  function editExperience(experience) {
    updateDraft({ experience: { id: experience.id, kind: experience.kind, title: experience.title, detail: experience.detail || "" }, notice: "" });
    if (experienceForm.current) experienceForm.current.open = true;
  }

  return <>
    <section className="companion-growth-card" aria-label={`${personaName}的相处成长`}>
      <div className="persona-section-title">
        <span>01</span>
        <div><h2>我们一起走过的日子</h2><p>成长来自记住的事情和已经完成的共同经历。</p></div>
      </div>
      <div className="companion-growth-summary">
        <div><small>现在的关系</small><strong>{summary.label}</strong><p>{summary.description}</p></div>
        <span className="companion-experience-count"><b>{summary.completedCount}</b> 次共同经历</span>
      </div>
      <p className="companion-next-hint">{summary.nextHint}</p>
      {summary.unlocks.length > 0 && <div className="companion-unlocks" aria-label="已解锁的陪伴方式">{summary.unlocks.map(unlock => <button type="button" key={unlock} disabled={!onStartActivity || !ACTIVITY_PROMPTS[unlock]} onClick={() => onStartActivity(ACTIVITY_PROMPTS[unlock])}><Check size={13} />{unlock}</button>)}</div>}
      <p className="companion-quiet-note">不需要签到，也没有离线惩罚；已有衣服和角色始终可以使用。</p>
      <details key={`${personaId}-experience-form`} ref={experienceForm} className="companion-disclosure">
        <summary>{draft.experience.id ? "更正共同经历" : "记录已完成的共同经历"}</summary>
        <form className="companion-entry-form" onSubmit={saveExperience}>
          {draft.experience.id
            ? <div className="companion-preserved-kind"><span>经历类型</span><strong>{EXPERIENCE_KINDS[draft.experience.kind] || "完成计划"}</strong></div>
            : <label>经历类型<select aria-label="经历类型" value={draft.experience.kind} onChange={event => setExperience({ kind: event.target.value })}>{Object.entries(EXPERIENCE_KINDS).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}</select></label>}
          <label>给这次经历起个名字<input aria-label="经历标题" maxLength={80} value={draft.experience.title} placeholder="例如：雨天一起看完一部电影" onChange={event => setExperience({ title: event.target.value })} /></label>
          <label className="companion-form-wide">留下一个细节（选填）<textarea aria-label="经历详情" maxLength={240} rows={2} value={draft.experience.detail} placeholder="记下聊过的话、一起做过的事…" onChange={event => setExperience({ detail: event.target.value })} /></label>
          {!draft.experience.id && <>
            <label className="companion-completed-check companion-form-wide"><input type="checkbox" checked={draft.experience.confirmed} onChange={event => setExperience({ confirmed: event.target.checked })} />这件事已经一起完成</label>
            <p className="companion-form-wide companion-quiet-note">尚未完成的约定可以先添加为共同计划。</p>
          </>}
          <div className="companion-entry-actions companion-form-wide">
            <button type="submit" className="companion-save" disabled={!draft.experience.title.trim() || (draft.experience.id ? !onUpdateExperience : !onRecordExperience || !draft.experience.confirmed)}>{draft.experience.id ? "保存更正" : "保存共同经历"}</button>
            {draft.experience.id && <button type="button" aria-label="取消编辑经历" onClick={() => updateDraft({ experience: freshDraft().experience, notice: "" })}>取消编辑</button>}
          </div>
        </form>
      </details>
      {experiences.length > 0 ? <details key={`${personaId}-experience-log`} className="companion-disclosure">
        <summary>共同经历日志 · {experiences.length} 条</summary>
        <p className="companion-quiet-note">忘记会移除内容，已积累的成长保留。</p>
        <ol className="companion-experience-list">{experiences.map(experience => <li key={experience.id}>
          <div><strong>{experience.title}</strong><small>{EXPERIENCE_KINDS[experience.kind] || "完成计划"} · {dateLabel(experience.createdAt)}</small></div>
          {experience.detail && <p>{experience.detail}</p>}
          <div className="companion-entry-actions">
            <button type="button" aria-label={`编辑经历：${experience.title}`} disabled={!onUpdateExperience} onClick={() => editExperience(experience)}><PencilSimple size={13} />编辑</button>
            <button type="button" aria-label={`忘记经历：${experience.title}`} disabled={!onDeleteExperience} onClick={() => { onDeleteExperience(experience.id); updateDraft({ ...(draft.experience.id === experience.id ? { experience: freshDraft().experience } : {}), notice: "已忘记这次经历的内容，已积累的成长保留。" }); }}><Trash size={13} />忘记</button>
          </div>
        </li>)}</ol>
      </details> : <p className="companion-quiet-note">还没有共同经历，从一次真实完成的小事开始就好。</p>}
    </section>

    <section className="companion-memory-card" aria-label={`${personaName}的长期记忆`}>
      <div className="persona-section-title">
        <span>02</span>
        <div><h2>她记得的事情</h2><p>{entries.length} 条记忆，只属于你和{personaName}；随时可以纠正或删除。</p></div>
      </div>
      <div className="companion-memory-list">
        {visibleEntries.map(entry => <article key={entry.id} className={entry.status === "done" ? "is-done" : ""}>
          <div className="companion-memory-meta"><span>{MEMORY_KINDS[entry.kind] || "关于你"}{entry.status === "done" ? " · 已完成" : ""}</span><small>{entry.source === "chat" ? "来自聊天" : "手动记录"}</small></div>
          <p>{entry.text}</p>
          <div className="companion-entry-actions">
            {entry.kind === "plan" && entry.status !== "done" && <button type="button" aria-label={`完成计划：${entry.text}`} disabled={!onSaveMemory} onClick={() => { onSaveMemory({ ...entry, status: "done" }); updateDraft({ notice: "已完成计划，并记下一次共同经历。" }); }}><Check size={13} />已完成</button>}
            <button type="button" aria-label={`编辑记忆：${entry.text}`} onClick={() => editMemory(entry)}><PencilSimple size={13} />编辑</button>
            <button type="button" aria-label={`删除记忆：${entry.text}`} disabled={!onDeleteMemory} onClick={() => { onDeleteMemory(entry.id); updateDraft({ ...(draft.memory.id === entry.id ? { memory: freshDraft().memory } : {}), notice: "已删除这条记忆。" }); }}><Trash size={13} />删除</button>
          </div>
        </article>)}
        {!entries.length && <p className="companion-quiet-note">还没有长期记忆。可以先记下一个喜好、一件重要的事，或下次的共同计划。</p>}
      </div>
      {entries.length > 5 && <button type="button" className="companion-show-more" aria-expanded={draft.showAll} onClick={() => updateDraft({ showAll: !draft.showAll })}>{draft.showAll ? "收起记忆" : `查看全部 ${entries.length} 条记忆`}</button>}
      <details key={`${personaId}-memory-form`} ref={memoryForm} className="companion-disclosure">
        <summary>{draft.memory.id ? "编辑记忆" : "添加记忆"}</summary>
        <form className="companion-entry-form" onSubmit={saveMemory}>
          <label>记忆类型<select aria-label="记忆类型" value={draft.memory.kind} onChange={event => setMemory({ kind: event.target.value })}>{Object.entries(MEMORY_KINDS).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}</select></label>
          <label className="companion-form-wide">记忆内容<textarea aria-label="记忆内容" maxLength={240} rows={3} value={draft.memory.text} placeholder="例如：喜欢少糖热拿铁；周五有一场面试" onChange={event => setMemory({ text: event.target.value })} /></label>
          <div className="companion-entry-actions companion-form-wide">
            <button type="submit" className="companion-save" disabled={!onSaveMemory || !draft.memory.text.trim()}><Plus size={14} />保存记忆</button>
            {draft.memory.id && <button type="button" onClick={() => updateDraft({ memory: freshDraft().memory, notice: "" })}>取消编辑</button>}
          </div>
        </form>
      </details>
    </section>
    {draft.notice && <p className="companion-feedback" role="status">{draft.notice}</p>}
  </>;
}
