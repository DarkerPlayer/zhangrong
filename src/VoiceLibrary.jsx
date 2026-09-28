import React, { useState, useEffect, useRef } from "react";
import "./voice-library.css";

async function api(path, body, signal) {
  const response = await fetch("/api/voices" + path, {
    signal,
    ...(body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const data = await response.json();
  if (!response.ok) throw Error(data.error || "音色操作失败，请重试。");
  return data;
}
export function encodeWav(buffer) {
  const n = buffer.length,
    b = new ArrayBuffer(44 + n * 2),
    v = new DataView(b);
  const text = (i, s) =>
    [...s].forEach((c, j) => v.setUint8(i + j, c.charCodeAt(0)));
  text(0, "RIFF");
  v.setUint32(4, 36 + n * 2, true);
  text(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 24000, true);
  v.setUint32(28, 48000, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  text(36, "data");
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const sample = Math.max(-1, Math.min(1, buffer[i]));
    v.setInt16(44 + i * 2, sample < 0 ? sample * 32768 : sample * 32767, true);
  }
  return b;
}
export default function VoiceLibrary({
  onChange,
  onPreview,
  onStop,
  speaking,
}) {
  const [library, setLibrary] = useState({ voices: [], selectedId: "builtin" }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState(false),
    [decoded, setDecoded] = useState(null),
    [filename, setFilename] = useState(""),
    [name, setName] = useState(""),
    [start, setStart] = useState(0),
    [duration, setDuration] = useState(6),
    [text, setText] = useState(""),
    [renameId, setRenameId] = useState(null),
    [renameName, setRenameName] = useState(""),
    [deleteId, setDeleteId] = useState(null),
    [notice, setNotice] = useState("");
  const request = useRef(),
    mounted = useRef(true),
    audioUrl = useRef(),
    generation = useRef(0);
  useEffect(() => {
    mounted.current = true;
    api("")
      .then((x) => {
        if (mounted.current) setLibrary(x);
      })
      .catch((e) => {
        if (mounted.current) setError(e.message);
      });
    return () => {
      mounted.current = false;
      generation.current++;
      request.current?.abort();
      if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
    };
  }, []);
  async function mutate(path, body) {
    setBusy(true);
    setError("");
    try {
      const data = await api(path, body);
      if (!mounted.current) return;
      setLibrary(data);
      onStop();
      onChange?.();
      setDeleteId(null);
      setRenameId(null);
    } catch (e) {
      if (mounted.current) setError(e.message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function loadFile(file) {
    if (!file) return;
    const token = ++generation.current;
    setError("");
    setDecoded(null);
    setFilename("");
    if (audioUrl.current) {
      URL.revokeObjectURL(audioUrl.current);
      audioUrl.current = null;
    }
    if (file.size > 80 * 1024 * 1024) {
      setError("请选择80MB以内的录音。");
      return;
    }
    setBusy(true);
    let ctx;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      const audio = await ctx.decodeAudioData(await file.arrayBuffer());
      if (audio.duration < 3) throw Error("录音至少需要3秒。");
      if (token !== generation.current || !mounted.current) return;
      setDecoded(audio);
      setFilename(file.name);
      setStart(0);
      setDuration(Math.min(6, audio.duration));
      setText("");
      setName(file.name.replace(/\.[^.]+$/, "").slice(0, 32));
      audioUrl.current = URL.createObjectURL(file);
    } catch (e) {
      if (mounted.current)
        setError(e.message || "无法读取录音，请使用MP3、WAV或M4A。");
    } finally {
      await ctx?.close();
      if (mounted.current && token === generation.current) setBusy(false);
    }
  }
  async function save(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    if (!decoded) return;
    const offset = Number(start),
      seconds = Number(duration);
    if (
      !Number.isFinite(offset) ||
      offset < 0 ||
      !Number.isFinite(seconds) ||
      seconds < 3 ||
      seconds > 20 ||
      offset + seconds > decoded.duration + 0.001
    ) {
      setError("请选择录音范围内3–20秒的完整说话片段。");
      return;
    }
    setBusy(true);
    onStop();
    request.current = new AbortController();
    try {
      const context = new OfflineAudioContext(
        1,
        Math.round(seconds * 24000),
        24000,
      );
      const source = context.createBufferSource();
      source.buffer = decoded;
      source.connect(context.destination);
      source.start(0, offset, seconds);
      const rendered = await context.startRendering();
      const bytes = new Uint8Array(encodeWav(rendered.getChannelData(0)));
      let binary = "";
      for (let i = 0; i < bytes.length; i += 8192)
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      const result = await api(
        "",
        { name, referenceText: text, audio: btoa(binary) },
        request.current.signal,
      );
      if (!mounted.current) return;
      setLibrary(result);
      setText(result.voice.referenceText);
      setNotice(
        `“${result.voice.name}”已保存。识别台词：${result.voice.referenceText}`,
      );
      setEditing(false);
      setDecoded(null);
      setFilename("");
      if (audioUrl.current) {
        URL.revokeObjectURL(audioUrl.current);
        audioUrl.current = null;
      }
      onChange?.();
    } catch (e) {
      if (mounted.current)
        setError(e.name === "AbortError" ? "已取消制作。" : e.message);
    } finally {
      request.current = null;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <section className="voice-library" aria-label="音色库">
      <header>
        <div>
          <h3>张容的音色库</h3>
          <p>保存喜欢的声音，随时换一种陪伴。</p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setEditing(!editing);
            setError("");
          }}
        >
          {editing ? "收起" : "＋ 添加音色"}
        </button>
      </header>
      {error && (
        <p role="alert" className="voice-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="voice-notice">
          {notice}
        </p>
      )}
      <div className="voice-cards">
        {library.voices.map((voice) => (
          <article
            className={
              "voice-card " +
              (voice.id === library.selectedId ? "selected" : "")
            }
            key={voice.id}
          >
            <div className="voice-symbol" aria-hidden="true">
              ♫
            </div>
            <div className="voice-card-info">
              <strong>{voice.name}</strong>
              <small>
                {voice.builtin
                  ? "内置参考"
                  : `${voice.duration?.toFixed(1)}秒参考`}{" "}
                · 本机保存
              </small>
            </div>
            <button
              type="button"
              disabled={busy || voice.id === library.selectedId}
              onClick={() => mutate("/select", { id: voice.id })}
            >
              {voice.id === library.selectedId ? "使用中" : "使用音色"}
            </button>
            {!voice.builtin && (
              <div className="voice-card-tools">
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`重命名${voice.name}`}
                  onClick={() => {
                    setRenameId(voice.id);
                    setRenameName(voice.name);
                  }}
                >
                  改名
                </button>
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`删除${voice.name}`}
                  onClick={() => setDeleteId(voice.id)}
                >
                  删除
                </button>
              </div>
            )}
            {renameId === voice.id && (
              <form
                className="voice-inline"
                onSubmit={(e) => {
                  e.preventDefault();
                  mutate("/rename", { id: voice.id, name: renameName });
                }}
              >
                <input
                  aria-label="新音色名称"
                  maxLength={32}
                  value={renameName}
                  onChange={(e) => setRenameName(e.target.value)}
                  required
                />
                <button disabled={busy}>保存名称</button>
                <button type="button" onClick={() => setRenameId(null)}>
                  取消
                </button>
              </form>
            )}
            {deleteId === voice.id && (
              <div className="voice-inline">
                <span>删除这张音色卡？</span>
                <button
                  disabled={busy}
                  onClick={() => mutate("/delete", { id: voice.id })}
                >
                  确认删除
                </button>
                <button onClick={() => setDeleteId(null)}>取消</button>
              </div>
            )}
          </article>
        ))}
      </div>
      <button
        className="voice-listen"
        type="button"
        disabled={busy}
        onClick={speaking ? onStop : onPreview}
      >
        {speaking ? "停止试听" : "试听当前音色"}
      </button>
      {editing && (
        <form className="voice-import" onSubmit={save}>
          <label>
            1. 选择录音
            <input
              type="file"
              accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac"
              disabled={busy}
              onChange={(e) => loadFile(e.target.files?.[0])}
            />
          </label>
          <p>MP3 / WAV / M4A，最多80MB。选单人清晰说话、少背景音乐的片段。</p>
          {decoded && (
            <>
              <strong className="voice-filename">{filename}</strong>
              <audio
                controls
                src={audioUrl.current}
                aria-label="原始录音预览"
              />
              <div className="voice-range">
                <label>
                  起点（秒）
                  <input
                    type="number"
                    min="0"
                    max={Math.max(0, decoded.duration - 3)}
                    step="0.1"
                    value={start}
                    disabled={busy}
                    onChange={(e) => setStart(e.target.value)}
                  />
                </label>
                <label>
                  片段时长（秒）
                  <input
                    type="number"
                    min="3"
                    max="20"
                    step="0.1"
                    value={duration}
                    disabled={busy}
                    onChange={(e) => setDuration(e.target.value)}
                  />
                </label>
              </div>
              <p>
                录音总长 {decoded.duration.toFixed(1)}{" "}
                秒；截取3–20秒，建议6–12秒。
              </p>
              <label>
                2. 音色名称
                <input
                  maxLength={32}
                  value={name}
                  required
                  disabled={busy}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label>
                3. 片段台词（可选）
                <textarea
                  rows={3}
                  maxLength={500}
                  value={text}
                  disabled={busy}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="留空自动识别；填写时须与截取片段里的原话一致。"
                />
              </label>
              <button className="voice-save" disabled={busy || !name.trim()}>
                {busy ? "正在本机制作…" : "制作并保存音色"}
              </button>
              {busy && (
                <button type="button" onClick={() => request.current?.abort()}>
                  取消制作
                </button>
              )}
            </>
          )}
        </form>
      )}
      <p className="voice-footnote">
        录音与合成均留在本机。制作后点“使用音色”；打开应用时自动预热，边生成边朗读。
      </p>
    </section>
  );
}
