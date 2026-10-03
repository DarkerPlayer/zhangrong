import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, BookOpen, Check, DownloadSimple, FileText, Play, Sparkle, Stop, Trash, UploadSimple } from "@phosphor-icons/react";
import "./text-workshop.css";

const BASE = "/api/text-packs";
const PAGE_SIZE = 25;
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const CATEGORIES = {greeting:"见面",daily:"日常",affection:"甜言蜜语",teasing:"调侃",seduction:"诱惑",comfort:"安慰",jealousy:"吃醋",praise:"夸奖",goodnight:"晚安",fallback:"通用"};

async function request(path, body, signal) {
  const response = await fetch(`${BASE}${path}`, {
    signal,
    ...(body === undefined ? {} : {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "文本处理暂时失败，请重试。");
  return data;
}

function fileContents(file, signal) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const stop = () => { reader.abort(); reject(new DOMException("已取消", "AbortError")); };
    const finish = (callback, value) => {
      signal.removeEventListener("abort", stop);
      reader.onload = reader.onerror = reader.onabort = null;
      callback(value);
    };
    reader.onload = () => finish(resolve, String(reader.result).split(",", 2)[1]);
    reader.onerror = () => finish(reject, new Error("无法读取这个文件，请重新选择。"));
    reader.onabort = () => finish(reject, new DOMException("已取消", "AbortError"));
    if (signal.aborted) { finish(reject, new DOMException("已取消", "AbortError")); return; }
    signal.addEventListener("abort", stop, {once:true});
    reader.readAsDataURL(file);
  });
}

function locationLabel(source = {}) {
  return [source.chapter, source.page ? `第 ${source.page} 页` : "", source.paragraph ? `第 ${source.paragraph} 段` : ""].filter(Boolean).join(" · ") || "原文片段";
}

export default function TextWorkshop({ personaId, personaName, corpusCount = 0, model, onApplyEntries, onRead, onStopRead, onClose }) {
  const [packs, setPacks] = useState([]);
  const [page, setPage] = useState(null);
  const [inputKind, setInputKind] = useState("paste");
  const [text, setText] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [file, setFile] = useState(null);
  const [mode, setMode] = useState("dialogue");
  const [title, setTitle] = useState("");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [pending, setPending] = useState(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [previewed, setPreviewed] = useState(false);
  const operation = useRef(null);
  const scope = useRef(0);
  const mounted = useRef(false);
  const currentPersona = useRef(personaId);
  const previewActive = useRef(false);
  const callbacks = useRef({onStopRead});
  const downloads = useRef(new Map());
  currentPersona.current = personaId;
  callbacks.current = {onStopRead};

  const remaining = Math.max(0, 40 - Math.max(0, Number(corpusCount) || 0));
  const busy = Boolean(pending);
  const entries = page?.entries || [];
  const pack = page?.pack;
  const allPageSelected = entries.length > 0 && entries.every(entry => selected.has(entry.id));

  function stopPreview() {
    if (previewActive.current) callbacks.current.onStopRead?.();
    previewActive.current = false;
    if (mounted.current) setPreviewed(false);
  }

  function cancelWork(announce = true) {
    operation.current?.controller.abort();
    operation.current = null;
    if (mounted.current) {
      setPending(null);
      if (announce) setNotice("已取消处理，已完成的结果会保留。");
    }
  }

  async function perform(type, label, work) {
    if (operation.current) return;
    const task = {controller:new AbortController(),scope:scope.current,personaId};
    operation.current = task;
    const alive = () => mounted.current && operation.current === task && scope.current === task.scope && currentPersona.current === task.personaId && !task.controller.signal.aborted;
    const progress = value => { if (alive()) setPending({type,label:value}); };
    setError("");setNotice("");setPending({type,label});
    try {
      await work({signal:task.controller.signal,personaId:task.personaId,alive,progress});
    } catch (failure) {
      if (alive()) setError(failure.message || "操作暂时失败，请重试。");
    } finally {
      if (operation.current === task) {
        operation.current = null;
        if (mounted.current && scope.current === task.scope) setPending(null);
      }
    }
  }

  useEffect(() => {
    mounted.current = true;
    scope.current += 1;
    operation.current?.controller.abort();operation.current = null;
    setPacks([]);setPage(null);setSelected(new Set());setText("");setSourceName("");setFile(null);
    setInputKind("paste");setMode("dialogue");setQuery("");setKind("");setTitle("");setPreviewed(false);
    void perform("library", "正在打开本地文本包…", async ({signal,alive}) => {
      const result = await request("", undefined, signal);
      if (alive()) setPacks(result.packs || []);
    });
    return () => {
      mounted.current = false;
      scope.current += 1;
      operation.current?.controller.abort();operation.current = null;
      stopPreview();
      for (const [url,timer] of downloads.current) {clearTimeout(timer);URL.revokeObjectURL(url);}
      downloads.current.clear();
    };
  }, [personaId]);

  async function refreshPacks(task) {
    const result = await request("", undefined, task.signal);
    if (task.alive()) setPacks(result.packs || []);
  }

  function showPage(result, filters = {query:"",kind:""}) {
    if (!result.pack || !Array.isArray(result.entries)) throw new Error("文本包没有完整打开，请重试。");
    setPage({...result,query:filters.query,kind:filters.kind});
  }

  function chooseFile(event) {
    const chosen = event.target.files?.[0];
    event.target.value = "";
    if (!chosen) return;
    setError("");setNotice("");
    if (chosen.size > MAX_FILE_SIZE) {setFile(null);setError("请选择不超过 20 MB 的文件。");return;}
    if (!/\.(txt|md|epub|docx|pdf|json)$/i.test(chosen.name)) {setFile(null);setError("请选择 TXT、MD、EPUB、DOCX、PDF 或 JSON 文本包。");return;}
    setFile(chosen);
  }

  function extract(event) {
    event.preventDefault();
    if (inputKind === "paste" ? !text.trim() : !file) return;
    if (text.length > 1000000 && inputKind === "paste") {setError("每次最多处理 100 万字，请分成几个文本包。");return;}
    stopPreview();
    void perform("extract", inputKind === "file" ? "正在读取文件…" : "正在整理原文…", async task => {
      const input = inputKind === "file"
        ? {fileBase64:await fileContents(file,task.signal),name:file.name,mode}
        : {text,name:sourceName.trim() || "粘贴文本",mode};
      if (!task.alive()) return;
      task.progress(mode === "dialogue" ? "正在提取对白…" : "正在整理阅读片段…");
      const result = await request("/extract",input,task.signal);
      if (!task.alive()) return;
      showPage(result);setTitle(result.pack.title);setSelected(new Set());setQuery("");setKind("");
      setNotice("已整理为草稿。可以保存整包，再挑选喜欢的片段。");
      await refreshPacks(task);
    });
  }

  function loadPage(id, offset = 0, filters = {query:"",kind:""}) {
    if (id !== pack?.id) stopPreview();
    void perform("page", "正在打开片段…", async task => {
      const params = new URLSearchParams({offset:String(offset),limit:String(PAGE_SIZE),query:filters.query,kind:filters.kind});
      const result = await request(`/${encodeURIComponent(id)}?${params}`,undefined,task.signal);
      if (!task.alive()) return;
      if (id !== pack?.id) {setSelected(new Set());setTitle(result.pack.title);setQuery("");setKind("");}
      showPage(result,filters);
    });
  }

  function toggleEntry(id) {
    setError("");
    setSelected(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else if (next.size < 40) next.add(id);
      return next;
    });
  }

  function selectPage() {
    const next = new Set(selected);
    for (const entry of entries) allPageSelected ? next.delete(entry.id) : next.add(entry.id);
    if (next.size > 40) {setError("一次最多选择 40 条，请取消部分片段后再选。");return;}
    setSelected(next);setError("");
  }

  function savePack() {
    if (!pack || !title.trim()) return;
    void perform("save", "正在保存文本包…", async task => {
      const result = await request(`/${encodeURIComponent(pack.id)}/save`,{title:title.trim()},task.signal);
      if (!task.alive()) return;
      setPage(current => ({...current,pack:result.pack}));setTitle(result.pack.title);
      setNotice(`已保存「${result.pack.title}」的全部片段。`);
      await refreshPacks(task);
    });
  }

  function applyEntries() {
    if (!pack || !selected.size || selected.size > 40 || !onApplyEntries) return;
    void perform("apply", `正在加入${personaName}的语料…`, async task => {
      const result = await request(`/${encodeURIComponent(pack.id)}/select`,{ids:[...selected]},task.signal);
      if (!task.alive()) return;
      if (!Array.isArray(result.entries) || result.entries.length > 40) throw new Error("一次最多加入 40 条，请重新选择。");
      const count = await onApplyEntries({personaId:task.personaId,pack,entries:result.entries});
      if (!task.alive()) return;
      setNotice(`已加入 ${Number.isFinite(count) ? count : result.entries.length} 条语料，已有内容保留。`);
    });
  }

  function classify() {
    if (!pack || !selected.size || !model) return;
    const ids = [...selected];
    stopPreview();
    void perform("classify", `正在分类 0 / ${ids.length} 条…`, async task => {
      for (let offset = 0; offset < ids.length; offset += 8) {
        if (!task.alive()) return;
        const result = await request(`/${encodeURIComponent(pack.id)}/classify`,{ids:ids.slice(offset,offset+8),model},task.signal);
        if (!task.alive()) return;
        const labels = new Map((result.entries || []).map(entry => [entry.id,entry]));
        setPage(current => current?.pack.id === pack.id ? {...current,entries:current.entries.map(entry => labels.get(entry.id) || entry)} : current);
        task.progress(`正在分类 ${Math.min(offset+8,ids.length)} / ${ids.length} 条…`);
      }
      if (task.alive()) setNotice("已完成所选片段分类，原文保持不变。");
    });
  }

  function updateCategory(entry, category) {
    if (!pack || !Object.hasOwn(CATEGORIES, category) || category === entry.category) return;
    void perform("label", "正在保存分类…", async task => {
      const result = await request(`/${encodeURIComponent(pack.id)}/labels`, {labels:[{id:entry.id,category}]}, task.signal);
      if (!task.alive()) return;
      const updated = result.entries?.find(item => item.id === entry.id);
      if (!updated || !Object.hasOwn(CATEGORIES, updated.category)) throw new Error("分类暂时没有保存，请重试。");
      setPage(current => current?.pack.id === pack.id ? {...current,entries:current.entries.map(item => item.id === entry.id ? {...item,category:updated.category} : item)} : current);
      setNotice(`已将这段文字归为「${CATEGORIES[updated.category]}」。`);
    });
  }

  function exportPack(format) {
    if (!pack) return;
    void perform("export", "正在准备导出…", async task => {
      const result = await fetch(`${BASE}/${encodeURIComponent(pack.id)}/export?format=${format}`,{signal:task.signal});
      if (!result.ok) {const problem = await result.json().catch(()=>({}));throw new Error(problem.error || "导出失败，请重试。");}
      const blob = await result.blob();
      if (!task.alive()) return;
      const url = URL.createObjectURL(blob), link = document.createElement("a");
      link.href = url;link.download = `${pack.title.replace(/[\\/:*?"<>|]/g,"-") || "文本包"}.${format}`;
      document.body.append(link);link.click();link.remove();
      downloads.current.set(url,setTimeout(()=>{URL.revokeObjectURL(url);downloads.current.delete(url);},1000));
      setNotice("已导出完整文本包。");
    });
  }

  function deletePack() {
    if (!pack) return;
    stopPreview();
    void perform("delete", "正在删除文本包…", async task => {
      await request(`/${encodeURIComponent(pack.id)}/delete`,{},task.signal);
      if (!task.alive()) return;
      setPage(null);setTitle("");setSelected(new Set());setNotice("文本包已移到本机回收区。");
      await refreshPacks(task);
    });
  }

  async function preview(entry) {
    const owner = personaId, generation = scope.current;
    try {
      previewActive.current = true;setPreviewed(true);
      await onRead?.(entry.text);
    } catch (failure) {
      if (mounted.current && owner === currentPersona.current && generation === scope.current) {setError(failure.message || "这段文字暂时无法试听。");stopPreview();}
    }
  }

  return <section className="text-workshop" aria-label="文本工作台">
    <header className="text-workshop-header">
      <button type="button" className="text-workshop-back" aria-label="关闭文本工作台" onClick={()=>{cancelWork(false);stopPreview();onClose?.();}}><ArrowLeft size={17}/>返回</button>
      <div><p>WORDS TO KEEP</p><h1>文本工坊</h1><span>留住喜欢的文字，选几句成为{personaName}的表达。</span></div>
      <div className="text-workshop-capacity"><BookOpen size={21}/><span>{personaName}<small>还可新增 {remaining} 条语料 · 已有 {Math.min(40,Number(corpusCount)||0)} / 40</small></span></div>
    </header>
    <div className="text-workshop-layout">
      <aside className="text-pack-library" aria-label="本地文本包">
        <div className="text-workshop-section-heading"><h2>我的文本包</h2><span>{packs.length} 包</span></div>
        <p className="text-workshop-note">保存整理后的片段，再挑选适合她的表达。草稿保留一天。</p>
        <div className="text-pack-library-list">{packs.map(item=><button type="button" key={item.id} aria-label={`打开文本包：${item.title}`} aria-pressed={pack?.id===item.id} disabled={busy} onClick={()=>loadPage(item.id)}><FileText size={19}/><span><strong>{item.title}</strong><small>{item.totalEntries} 条 · {item.mode === "reading" ? "阅读" : "对白"}</small></span><em>{item.draft ? "草稿" : "已保存"}</em></button>)}</div>
        {!packs.length && !busy && <p className="text-workshop-empty">还没有文本包，从一段喜欢的文字开始。</p>}
      </aside>

      <main className="text-workshop-main">
        <section className="text-workshop-card text-workshop-import" aria-label="导入文字">
          <div className="text-workshop-section-heading"><h2>导入一段文字，或一本书</h2><span>全程在本机处理</span></div>
          <form onSubmit={extract}>
            <div className="text-workshop-source-tabs" aria-label="文字来源">
              <button type="button" aria-pressed={inputKind === "paste"} disabled={busy} onClick={()=>setInputKind("paste")}>粘贴文本</button>
              <button type="button" aria-pressed={inputKind === "file"} disabled={busy} onClick={()=>setInputKind("file")}><UploadSimple size={15}/>选择文件</button>
            </div>
            {inputKind === "paste" ? <>
              <label className="text-workshop-field">来源名称（选填）<input aria-label="来源名称" value={sourceName} maxLength={80} disabled={busy} placeholder="例如：雨夜的故事" onChange={event=>setSourceName(event.target.value)}/></label>
              <label className="text-workshop-field">粘贴文本<textarea aria-label="粘贴文本" rows={5} maxLength={1000000} value={text} disabled={busy} placeholder="粘贴对白、散文或故事，按所选方式整理成片段…" onChange={event=>setText(event.target.value)}/></label>
            </> : <label className="text-workshop-file"><input aria-label="导入文本文件" type="file" accept=".txt,.md,.epub,.docx,.pdf,.json" disabled={busy} onChange={chooseFile}/><strong>{file ? file.name : "选择本地文件"}</strong><span>TXT、MD、EPUB、DOCX、文字 PDF 或 JSON 文本包 · 不超过 20 MB</span></label>}
            <fieldset className="text-workshop-modes" disabled={busy}><legend>怎么整理这些文字</legend>
              <label><input type="radio" aria-label="提取对白" name="text-workshop-mode" value="dialogue" checked={mode === "dialogue"} onChange={()=>setMode("dialogue")}/><span>提取对白<small>收集人物说的话，便于挑选表达风格。</small></span></label>
              <label><input type="radio" aria-label="完整阅读分段" name="text-workshop-mode" value="reading" checked={mode === "reading"} onChange={()=>setMode("reading")}/><span>完整阅读分段<small>按原文顺序保留内容，逐段试听。</small></span></label>
            </fieldset>
            <div className="text-workshop-import-footer"><p className="text-workshop-note">导入不会改动她的身份、记忆或已有语料。</p><button type="submit" className="text-workshop-primary" disabled={busy || (inputKind === "paste" ? !text.trim() : !file)}>{mode === "dialogue" ? "提取对白" : "生成阅读片段"}</button></div>
          </form>
        </section>

        {pending && <div className="text-workshop-progress" role="status"><progress aria-label="文本处理进度"/><span>{pending.label}</span>{["extract","classify","apply","page"].includes(pending.type) && <button type="button" onClick={()=>cancelWork()}>取消处理</button>}</div>}
        {error && <p className="text-workshop-error" role="alert">{error}</p>}
        {notice && <p className="text-workshop-notice" role="status">{notice}</p>}

        {pack && <section className="text-workshop-card text-pack-review" aria-label="文本包片段">
          <div className="text-workshop-section-heading"><h2>挑选值得留下的片段</h2><span>{pack.draft ? "草稿" : "已保存"} · 全包 {pack.totalEntries} 条</span></div>
          <div className="text-pack-save"><label className="text-workshop-field">文本包名称<input aria-label="文本包名称" maxLength={80} value={title} disabled={busy} onChange={event=>setTitle(event.target.value)}/></label><button type="button" className="text-workshop-primary" disabled={busy || !title.trim()} onClick={savePack}><Check size={15}/>保存文本包</button></div>
          <p className="text-workshop-origin">来源：{pack.sourceName} · {pack.sourceFormat?.toUpperCase()} · {Number(pack.sourceCharacters || 0).toLocaleString()} 字{pack.stats?.duplicates ? ` · 合并 ${pack.stats.duplicates} 条重复对白` : ""}</p>
          {(pack.warnings || []).length > 0 && <ul className="text-workshop-warnings">{pack.warnings.map((warning,index)=><li key={index}>{warning}</li>)}</ul>}
          <div className="text-pack-tools"><button type="button" disabled={busy} aria-label="导出 JSON 文本包" onClick={()=>exportPack("json")}><DownloadSimple size={14}/>导出文本包</button><button type="button" disabled={busy} aria-label="导出 TXT 文本" onClick={()=>exportPack("txt")}>导出纯文本</button><button type="button" className="text-workshop-delete" disabled={busy} onClick={deletePack}><Trash size={14}/>删除文本包</button></div>
          <form className="text-pack-search" onSubmit={event=>{event.preventDefault();loadPage(pack.id,0,{query:query.trim(),kind});}}>
            <input type="search" aria-label="搜索片段" placeholder="搜索这个文本包…" value={query} disabled={busy} maxLength={200} onChange={event=>setQuery(event.target.value)}/>
            <select aria-label="片段类型" value={kind} disabled={busy} onChange={event=>setKind(event.target.value)}><option value="">全部片段</option><option value="dialogue">对白</option><option value="narration">叙述</option></select><button type="submit" disabled={busy}>搜索</button>
          </form>
          <div className="text-pack-selection"><div><strong>已选 {selected.size} 条</strong><small>跨页保留选择，最多 40 条；保存和导出会包含整包。</small></div><button type="button" disabled={busy || !entries.length} onClick={selectPage}>{allPageSelected ? "取消本页选择" : "选择本页"}</button><button type="button" disabled={busy || !selected.size} onClick={()=>setSelected(new Set())}>清空选择</button></div>
          <div className="text-pack-entries">{entries.map((entry,index)=><article key={entry.id} className={selected.has(entry.id) ? "selected" : ""}>
            <input type="checkbox" aria-label={`选择片段 ${page.offset+index+1}`} checked={selected.has(entry.id)} disabled={busy || (!selected.has(entry.id) && selected.size >= 40)} onChange={()=>toggleEntry(entry.id)}/>
            <div className="text-pack-entry-content"><div className="text-pack-entry-labels"><span>{entry.kind === "dialogue" ? "对白" : "叙述"}</span><select className="text-pack-category" aria-label={`片段 ${page.offset+index+1} 分类`} value={entry.category || "fallback"} disabled={busy} onChange={event=>updateCategory(entry,event.target.value)}>{Object.entries(CATEGORIES).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select>{entry.speaker && <span>{entry.speaker}</span>}{entry.occurrences > 1 && <small>出现 {entry.occurrences} 次</small>}</div><p>{entry.text}</p><small className="text-pack-entry-source">{locationLabel(entry.source)}</small></div>
            <button type="button" className="text-pack-preview" aria-label={`试听片段 ${page.offset+index+1}`} disabled={busy || !onRead} onClick={()=>preview(entry)}><Play size={14}/>试听</button>
          </article>)}</div>
          {!entries.length && <p className="text-workshop-empty">{!page.query && !page.kind && pack.mode === "dialogue" ? "没有找到对白，可以选择完整阅读分段来保留这份文字。" : "没有找到符合条件的片段，试试其他关键词。"}</p>}
          <nav className="text-pack-pagination" aria-label="片段分页"><span>{page.total ? `${page.offset+1}–${Math.min(page.offset+entries.length,page.total)} / ${page.total} 条` : "0 条片段"}</span><button type="button" disabled={busy || page.offset <= 0} onClick={()=>loadPage(pack.id,Math.max(0,page.offset-PAGE_SIZE),{query:page.query,kind:page.kind})}>上一页</button><button type="button" disabled={busy || page.offset+page.limit >= page.total} onClick={()=>loadPage(pack.id,page.offset+page.limit,{query:page.query,kind:page.kind})}>下一页</button></nav>
          <div className="text-pack-apply"><p>{personaName}还可新增 {remaining} 条。重复会跳过，超量整批不导入；已有语料不会被替换。</p><div><button type="button" disabled={busy || !selected.size || !model} onClick={classify}><Sparkle size={15}/>本地 AI 分类</button>{previewed && <button type="button" onClick={stopPreview}><Stop size={14}/>停止试听</button>}<button type="button" className="text-workshop-primary" disabled={busy || !selected.size || selected.size > 40 || !onApplyEntries} onClick={applyEntries}>加入{personaName}的语料</button></div><small>AI 分类仅供参考，原文保持不变。{!model && "先在设置里选择本地模型即可使用。"}</small></div>
        </section>}
      </main>
    </div>
  </section>;
}
