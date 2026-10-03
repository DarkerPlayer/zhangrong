import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  DownloadSimple,
  ImageSquare,
  Sparkle,
  Stop,
  Trash,
} from "@phosphor-icons/react";
import { prepareStudioReference, studioRequest } from "./local-studio.mjs";
import { GARMENT_SLOT_IDS, GARMENT_SLOT_LABELS } from "./wardrobe.mjs";
import "./local-studio.css";

const JOB_LABELS = {
  queued: "等待生成",
  running: "正在生成",
  preview: "等待确认",
  imported: "已加入衣橱",
  failed: "生成失败",
  cancelled: "已取消",
};
const isActive = (job) => job && ["queued", "running"].includes(job.status);
const copyRig = (rig) => (rig ? JSON.parse(JSON.stringify(rig)) : null);
const progressPercent = (value) =>
  Math.max(0, Math.min(100, Math.round(Number(value || 0))));
const DEFAULT_PROMPTS = {
  character:
    "根据参考照片生成同一人物的完整全身站立立绘，保留脸、发型和主要穿搭。",
  outfit: "保持当前人物的脸、发型和自然站姿，按照参考图片生成新的完整穿搭。",

};

export default function LocalStudio({
  baseLook,
  items = [],
  initialKind = "character",
  initialItemId,
  initialSlot,
  baseSelection = {},
  operation = "equip",
  onImported,
  onClose,
}) {
  const [snapshot, setSnapshot] = useState(null);
  const [kind, setKind] = useState(initialKind);
  const [name, setName] = useState(operation === "restore" ? `恢复原造型${GARMENT_SLOT_LABELS[initialSlot] || "单品"}` : "");
  const [prompt, setPrompt] = useState("");
  const [resolution, setResolution] = useState("small");
  const [slot, setSlot] = useState(initialSlot || items.find(item => item.id === initialItemId)?.slot || "shoes");
  const [itemId, setItemId] = useState(
    initialItemId ?? items.find((item) => item.slot === (initialSlot || "shoes"))?.id ?? "",
  );
  const slotLabel = GARMENT_SLOT_LABELS[slot];
  const selectedItem = items.find(item => item.id === itemId);
  const restoring = kind === "fit" && operation === "restore";
  const selectionEntries = Object.entries(baseSelection);
  const fitPrompt = restoring
    ? `保持当前人物的脸、姿势和其他已选单品，只恢复原造型的${slotLabel}。`
    : slot === "nails"
      ? `保持当前人物、姿势和其余穿搭，只将指甲颜色改为${selectedItem?.color || "参考图片中的颜色"}，保留自然甲形和光泽。`
      : `保持当前人物的脸、姿势和其他已选单品，只将${slotLabel}替换为参考图片中的款式。`;
  const defaultPrompt = kind === "fit" ? fitPrompt : DEFAULT_PROMPTS[kind];
  const [references, setReferences] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [rig, setRig] = useState(null);
  const [showAnchors, setShowAnchors] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [readingFiles, setReadingFiles] = useState(false);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(false);
  const refs = useRef(references);
  const operationLock = useRef(false);
  const controller = useRef(null);
  refs.current = references;

  const refresh = useCallback(async (signal) => {
    const value = await studioRequest("", undefined, signal);
    if (!mounted.current || signal?.aborted) return;
    setSnapshot(value);
    setLoading(false);
    return value;
  }, []);
  useEffect(() => {
    mounted.current = true;
    const request = new AbortController();
    controller.current = request;
    refresh(request.signal).catch((failure) => {
      if (mounted.current && !request.signal.aborted) {
        setError(failure.message);
        setLoading(false);
      }
    });
    return () => {
      mounted.current = false;
      request.abort();
      for (const item of refs.current) URL.revokeObjectURL(item.previewUrl);
    };
  }, [refresh]);

  const runtime = snapshot?.runtime;
  const runtimeBusy = ["installing", "downloading", "setting-up"].includes(
    runtime?.state,
  );
  const active = isActive(snapshot?.activeJob);
  const busy = pending || readingFiles || active || runtimeBusy;
  const jobs = (snapshot?.jobs || []).filter((job) => job.kind !== "setup");
  const activeGeneration =
    snapshot?.activeJob?.kind !== "setup" ? snapshot?.activeJob : null;
  const matchesGenerationContext = (job) => {
    if (!job) return false;
    if (kind === "character") return true;
    if (job.kind !== kind || (job.input?.baseLookId || job.baseLookId) !== baseLook?.id) return false;
    if (kind !== "fit") return true;
    const jobSlot = job.input?.slot || job.slot ||
      items.find(item => item.id === (job.input?.itemId || job.itemId))?.slot;
    return jobSlot === slot;
  };
  const contextJobs = jobs.filter(matchesGenerationContext);
  const selectedJob =
    jobs.find((job) => job.id === selectedJobId) ||
    (matchesGenerationContext(activeGeneration) ? activeGeneration : null) ||
    contextJobs.find((job) => job.status === "preview") ||
    contextJobs[0];
  const referenceLimit =
    kind === "character" ? 3 : kind === "fit" && (itemId || restoring) ? 1 : 2;
  const canGenerate = Boolean(
    runtime?.ready &&
    !busy &&
    name.trim() &&
    references.length <= referenceLimit &&
    (!restoring || references.length === 0) &&
    (kind !== "character" || references.length > 0) &&
    (kind === "character" ||
      (baseLook?.id && baseLook.id !== "haru-original")) &&
    (kind !== "fit" || restoring || itemId || references.length > 0),
  );

  useEffect(() => {
    setRig(copyRig(selectedJob?.rig));
    setShowAnchors(false);
  }, [selectedJob?.id, selectedJob?.status === "preview"]);
  useEffect(() => {
    if (!active && !runtimeBusy) return;
    let live = true;
    let timer;
    const poll = async () => {
      try {
        await refresh(controller.current?.signal);
      } catch (failure) {
        if (live && mounted.current) setError(failure.message);
      }
      if (live) timer = setTimeout(poll, 1800);
    };
    timer = setTimeout(poll, 1800);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [active, runtimeBusy, refresh]);

  async function perform(operation) {
    if (operationLock.current) return;
    operationLock.current = true;
    setPending(true);
    setError("");
    try {
      await operation();
    } catch (failure) {
      if (mounted.current) setError(failure.message || "操作失败，请重试。");
    } finally {
      operationLock.current = false;
      if (mounted.current) setPending(false);
    }
  }
  async function startGeneration(event) {
    event.preventDefault();
    if (!canGenerate) return;
    await perform(async () => {
      const result = await studioRequest("/jobs", {
        kind,
        name: name.trim(),
        prompt: prompt.trim() || defaultPrompt,
        ...(kind === "character" ? {} : { baseLookId: baseLook.id }),
        ...(kind === "fit"
          ? { ...(!restoring && itemId ? { itemId } : {}), slot, baseSelection, operation }
          : {}),
        references: references.map(({ name, dataUrl }) => ({ name, dataUrl })),
        resolution,
      });
      if (!mounted.current) return;
      setSelectedJobId(result.job.id);
      setSnapshot((current) => ({
        ...current,
        activeJob: result.job,
        jobs: [result.job, ...(current?.jobs || [])],
      }));
    });
  }
  async function addFiles(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length || readingFiles) return;
    setError("");
    if (files.length + refs.current.length > referenceLimit) {
      setError(
        `当前任务最多上传 ${referenceLimit} 张参考图；当前人物与所选单品会自动作为参考。`,
      );
      return;
    }
    setReadingFiles(true);
    const additions = [];
    try {
      for (const file of files)
        additions.push(await prepareStudioReference(file));
      if (!mounted.current) {
        additions.forEach((item) => URL.revokeObjectURL(item.previewUrl));
        return;
      }
      setReferences((current) => [...current, ...additions]);
    } catch (failure) {
      additions.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      if (mounted.current) setError(failure.message);
    } finally {
      if (mounted.current) setReadingFiles(false);
    }
  }
  function removeReference(id) {
    const item = references.find((item) => item.id === id);
    if (item) URL.revokeObjectURL(item.previewUrl);
    setReferences((current) => current.filter((item) => item.id !== id));
  }
  function updateAnchor(key, axis, value) {
    setRig((current) => {
      const next = copyRig(current);
      if (!next) return current;
      const numeric = Math.max(0, Math.min(1, Number(value)));
      if (key === "leftEye" || key === "rightEye")
        next.eyes[key === "leftEye" ? 0 : 1][axis] = numeric;
      else if (key === "leftShoulder" || key === "rightShoulder")
        next.shoulders[key === "leftShoulder" ? "left" : "right"][
          axis === "x" ? 0 : 1
        ] = numeric;
      else next.mouth[axis] = numeric;
      return next;
    });
  }
  const anchors = rig
    ? [
        ["leftEye", "左眼", rig.eyes?.[0]],
        ["rightEye", "右眼", rig.eyes?.[1]],
        ["mouth", "嘴巴", rig.mouth],
        [
          "leftShoulder",
          "左肩",
          rig.shoulders?.left && {
            x: rig.shoulders.left[0],
            y: rig.shoulders.left[1],
          },
        ],
        [
          "rightShoulder",
          "右肩",
          rig.shoulders?.right && {
            x: rig.shoulders.right[0],
            y: rig.shoulders.right[1],
          },
        ],
      ].filter(
        ([, , value]) =>
          value && Number.isFinite(value.x) && Number.isFinite(value.y),
      )
    : [];

  return (
    <section className="local-studio" aria-label="本地生成工作台">
      <div className="local-studio-title">
        <div>
          <p className="wardrobe-kicker">LOCAL CHARACTER STUDIO</p>
          <h3>{kind === "character" ? "新增外观模型" : kind === "outfit" ? `为${baseLook?.character || "当前模型"}生成完整造型` : `为${baseLook?.character || "当前模型"}${restoring ? "恢复原配" : "适配独立"}${slotLabel}`}</h3>
          <p>{kind === "character" ? "从参考照片创建一个新模型，独立加入模型列表。" : kind === "outfit" ? "保留当前模型，生成一张包含完整穿搭的立绘。" : restoring ? "恢复当前类别的原配，其余已选单品保持不变。" : "单品保存在共享库存，适配结果记录当前角色的完整单品组合。"}参考照片保留在本地。</p>
        </div>
        {onClose && (
          <button
            type="button"
            className="local-studio-secondary"
            onClick={onClose}
          >
            <ArrowLeft size={16} />
            返回衣橱
          </button>
        )}
      </div>
      <div
        className={`local-studio-runtime ${runtime?.ready ? "ready" : ""}`}
        aria-live="polite"
      >
        <span className="local-studio-runtime-icon">
          {runtime?.ready ? <Check size={20} /> : <DownloadSimple size={20} />}
        </span>
        <div>
          <strong>
            {loading
              ? "正在连接本地生成…"
              : runtime?.message || "本地生成尚未就绪"}
          </strong>
          <p>
            {runtime?.ready
              ? "生成时一次处理一张，完成后自动释放模型内存。"
              : "首次安装需要网络和约 8 GB 可用空间。安装后可以离线生成。"}
          </p>
          {runtimeBusy && (
            <progress
              aria-label="本地生成安装进度"
              max="100"
              value={progressPercent(snapshot?.activeJob?.progress)}
            />
          )}
        </div>
        {!loading && runtime && !runtime.ready && !runtimeBusy && !active && (
          <button
            type="button"
            className="local-studio-primary"
            disabled={pending}
            onClick={() =>
              perform(async () => {
                await studioRequest("/setup", {});
                await refresh(controller.current?.signal);
              })
            }
          >
            <DownloadSimple size={17} />
            安装本地生成
          </button>
        )}
        {snapshot?.activeJob?.kind === "setup" &&
          isActive(snapshot.activeJob) && (
            <button
              type="button"
              className="local-studio-secondary"
              disabled={pending}
              onClick={() =>
                perform(async () => {
                  await studioRequest(
                    `/jobs/${snapshot.activeJob.id}/cancel`,
                    {},
                  );
                  await refresh(controller.current?.signal);
                })
              }
            >
              取消安装
            </button>
          )}
      </div>
      {error && (
        <div className="local-studio-error" role="alert">
          <p>{error}</p>
          <button
            type="button"
            className="local-studio-secondary"
            disabled={pending}
            onClick={() =>
              perform(async () => {
                await refresh(controller.current?.signal);
              })
            }
          >
            重新连接
          </button>
        </div>
      )}
      <div className="local-studio-columns">
        <form className="local-studio-form" onSubmit={startGeneration}>
          <label>
            生成内容
            <select
              aria-label="生成内容"
              value={kind}
              disabled={busy}
              onChange={(event) => { setKind(event.target.value); setSelectedJobId(""); }}
            >
              <option value="character">新增模型 · 参考你的照片</option>
              <option
                value="outfit"
                disabled={!baseLook?.id || baseLook.id === "haru-original"}
              >
                当前模型 · 完整新造型
              </option>
              <option
                value="fit"
                disabled={!baseLook?.id || baseLook.id === "haru-original"}
              >
                当前模型 · 独立单品适配
              </option>
            </select>
          </label>
          {kind !== "character" && (
            <div className="local-studio-base">
              <img src={baseLook?.thumbnail || baseLook?.asset} alt="" />
              <span>
                当前外观模型
                <strong>{baseLook?.character || baseLook?.name}</strong>
              </span>
            </div>
          )}
          <label>
            生成名称
            <input
              aria-label="生成名称"
              value={name}
              maxLength={50}
              placeholder={
                kind === "character"
                  ? "给这个外观起个名字"
                  : kind === "fit" ? `例如：${baseLook?.character || "当前人物"}的${slotLabel}` : "例如：玫瑰色通勤穿搭"
              }
              disabled={busy}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          {kind === "fit" && <>
            <label>
              单品类别
              <select aria-label="单品类别" value={slot} disabled={busy || restoring} onChange={event => { setSlot(event.target.value); setItemId(""); setSelectedJobId(""); }}>
                {GARMENT_SLOT_IDS.map(id => <option key={id} value={id}>{GARMENT_SLOT_LABELS[id]}</option>)}
              </select>
            </label>
            {selectionEntries.length > 0 && <p className="local-studio-hint" aria-label="保留当前单品组合">当前已选：{selectionEntries.map(([id, selectedId]) => `${GARMENT_SLOT_LABELS[id]} · ${items.find(item => item.id === selectedId)?.name || selectedId}`).join(" / ")}。仅{restoring ? "恢复" : "替换"}{slotLabel}，保留其余单品。</p>}
            {restoring ? <p className="local-studio-hint">适配原造型的{slotLabel}，无需上传新的单品图片。</p> : <label>
              {slotLabel}来源
              <select
                aria-label={`${slotLabel}来源`}
                value={itemId}
                disabled={busy}
                onChange={(event) => setItemId(event.target.value)}
              >
                <option value="">上传自己的{slotLabel}参考图</option>
                {items
                  .filter((item) => item.slot === slot)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </label>}
          </>}
          {!restoring && <label className="local-studio-upload-label">
            参考图片{" "}
            <span>
              {references.length} / {referenceLimit}
            </span>
            <input
              type="file"
              aria-label="上传参考图片"
              accept="image/jpeg,image/png,image/webp"
              multiple
              disabled={busy || references.length >= referenceLimit}
              onChange={addFiles}
            />
            <span className="local-studio-upload">
              <ImageSquare size={24} />
              <strong>
                {readingFiles ? "正在整理照片…" : "点击选择参考图片"}
              </strong>
              <small>JPEG、PNG、WebP · 单张最多 12 MB</small>
            </span>
          </label>}
          {references.length > 0 && (
            <div className="local-studio-references">
              {references.map((item) => (
                <figure key={item.id}>
                  <img src={item.previewUrl} alt={`参考图片：${item.name}`} />
                  <figcaption title={item.name}>{item.name}</figcaption>
                  <button
                    type="button"
                    aria-label={`移除参考图片：${item.name}`}
                    disabled={busy}
                    onClick={() => removeReference(item.id)}
                  >
                    <Trash size={14} />
                  </button>
                </figure>
              ))}
            </div>
          )}
          <p className="local-studio-hint">
            {kind === "character"
              ? "建议包含清晰正脸和全身照，会先生成完整站立立绘，再制作眨眼、呼吸和说话动作。"
              : kind === "fit"
                ? `仅${restoring ? "恢复原配" : "更换"}${slotLabel}，保留其余已选单品。${restoring ? "生成后确认效果，再保存这个组合。" : "选择库存单品后，可额外上传一张细节参考。"}`
                : "当前人物会自动作为参考；可以上传衣服照片，再描述颜色、材质和穿搭。"}
          </p>
          {references.length > referenceLimit && (
            <p className="local-studio-inline-error">
              当前任务最多使用 {referenceLimit} 张上传图片，请移除多余参考。
            </p>
          )}
          <label>
            描述想要的效果（可选）
            <textarea
              aria-label="描述想要的效果"
              value={prompt}
              maxLength={1800}
              rows={4}
              placeholder={
                kind === "character"
                  ? "例如：长发、白色连衣裙、黑色高跟鞋，正面自然站立"
                  : `例如：保持人物和姿势，仅${restoring ? "恢复" : "更换"}${slotLabel}`
              }
              disabled={busy}
              onChange={(event) => setPrompt(event.target.value)}
            />
          </label>
          {!prompt.trim() && (
            <p className="local-studio-hint">
              默认效果：{defaultPrompt}
            </p>
          )}
          <label>
            图片尺寸
            <select
              aria-label="图片尺寸"
              value={resolution}
              disabled={busy}
              onChange={(event) => setResolution(event.target.value)}
            >
              <option value="small">轻量 · 512 × 768（推荐）</option>
              <option value="medium">
                更清晰 · 768 × 1152（占用更多内存）
              </option>
            </select>
          </label>
          <button
            type="submit"
            className="local-studio-primary local-studio-generate"
            disabled={!canGenerate}
          >
            <Sparkle size={18} />
            开始生成
          </button>
          {!runtime?.ready && (
            <p className="local-studio-hint">
              完成首次安装后，就可以开始生成。
            </p>
          )}
        </form>
        <div className="local-studio-results">
          <div className="local-studio-preview">
            {selectedJob ? (
              <>
                <div className="local-studio-job-heading">
                  <div>
                    <span>
                      {JOB_LABELS[selectedJob.status] || selectedJob.status}
                    </span>
                    <h4>{selectedJob.name || "生成任务"}</h4>
                  </div>
                  {isActive(selectedJob) && (
                    <button
                      type="button"
                      className="local-studio-secondary"
                      disabled={pending}
                      onClick={() =>
                        perform(async () => {
                          await studioRequest(
                            `/jobs/${selectedJob.id}/cancel`,
                            {},
                          );
                          await refresh(controller.current?.signal);
                        })
                      }
                    >
                      <Stop size={16} />
                      取消生成
                    </button>
                  )}
                </div>
                <p
                  className={
                    selectedJob.status === "failed"
                      ? "local-studio-inline-error"
                      : "local-studio-hint"
                  }
                  role={selectedJob.status === "failed" ? "alert" : "status"}
                >
                  {selectedJob.message || JOB_LABELS[selectedJob.status]}
                </p>
                {isActive(selectedJob) && (
                  <progress
                    aria-label="图片生成进度"
                    max="100"
                    value={progressPercent(selectedJob.progress)}
                  />
                )}
                {selectedJob.previewUrl && (
                  <div className="local-studio-image-wrap">
                    <img src={selectedJob.previewUrl} alt="生成预览" />
                    {showAnchors &&
                      anchors.map(([key, label, value]) => (
                        <span
                          className={`local-studio-anchor anchor-${key}`}
                          key={key}
                          style={{
                            left: `${value.x * 100}%`,
                            top: `${value.y * 100}%`,
                          }}
                        >
                          <i />
                          <small>{label}</small>
                        </span>
                      ))}
                  </div>
                )}
                {(selectedJob.warnings || []).map((warning, index) => (
                  <p className="local-studio-warning" key={index}>
                    {warning}
                  </p>
                ))}
                {selectedJob.status === "preview" && (
                  <>
                    <p className="local-studio-hint">
                      先检查脸、手、鞋履和透明边缘。{selectedJob.kind === "character" ? "确认后加入模型列表。" : selectedJob.kind === "outfit" ? "确认后加入当前模型的完整造型。" : "确认后保存单品组合，独立单品可继续用于其他模型。"}
                    </p>
                    {anchors.length > 0 && (
                      <button
                        type="button"
                        className="local-studio-secondary"
                        aria-expanded={showAnchors}
                        onClick={() => setShowAnchors((value) => !value)}
                      >
                        调整动画位置
                      </button>
                    )}
                    {showAnchors && (
                      <div className="local-studio-anchor-controls">
                        <p>对准眼睛、嘴巴和肩膀；彩色点表示动画中心。</p>
                        {anchors.map(([key, label, value]) => (
                          <fieldset key={key}>
                            <legend>{label}</legend>
                            {["x", "y"].map((axis) => (
                              <label key={axis}>
                                {axis === "x" ? "横向" : "纵向"}
                                <input
                                  type="range"
                                  aria-label={`${label}${axis === "x" ? "横向" : "纵向"}位置`}
                                  min="0"
                                  max="1"
                                  step=".001"
                                  value={value[axis]}
                                  onChange={(event) =>
                                    updateAnchor(key, axis, event.target.value)
                                  }
                                />
                                <output>
                                  {Math.round(value[axis] * 100)}%
                                </output>
                              </label>
                            ))}
                          </fieldset>
                        ))}
                      </div>
                    )}
                    <button
                      type="button"
                      className="local-studio-primary local-studio-import"
                      disabled={pending || active}
                      onClick={() =>
                        perform(async () => {
                          const result = await studioRequest(
                            `/jobs/${selectedJob.id}/import`,
                            { ...(rig ? { rig } : {}) },
                          );
                          // The parent owns the catalog even when this panel was closed
                          // while the server finished saving the confirmed result.
                          onImported?.(result);
                          if (!mounted.current) return;
                          setSnapshot((current) => ({
                            ...current,
                            jobs: (current.jobs || []).map((job) =>
                              job.id === selectedJob.id ? result.job : job,
                            ),
                            catalog: result.catalog || current.catalog,
                          }));
                        })
                      }
                    >
                      <Check size={17} />
                      加入衣橱并使用
                    </button>
                  </>
                )}
              </>
            ) : (
              <div className="local-studio-empty">
                <Sparkle size={38} />
                <h4>新模样，从几张照片开始</h4>
                <p>
                  生成结果会出现在这里。关闭工作台后任务仍会保留，可以回来继续确认。
                </p>
              </div>
            )}
          </div>
          {jobs.length > 0 && (
            <div className="local-studio-history" aria-label="本地生成记录">
              <h4>最近生成</h4>
              {jobs.map((job) => (
                <button
                  type="button"
                  key={job.id}
                  className={selectedJob?.id === job.id ? "selected" : ""}
                  onClick={() => setSelectedJobId(job.id)}
                >
                  <span>{job.name || "生成任务"}</span>
                  <small>{JOB_LABELS[job.status] || job.status}</small>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
