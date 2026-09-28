import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
} from "react";
import {
  Heart,
  ChatCircleDots,
  CoatHanger,
  Timer,
  BookOpen,
  GearSix,
  SpeakerHigh,
  SpeakerSlash,
  Microphone,
  ArrowUp,
  ArrowsOut,
  ArrowsIn,
  PushPin,
  CloudRain,
  Moon,
  Sun,
  Check,
  X,
  ArrowCounterClockwise,
  Play,
  Pause,
  Download,
  Trash,
  Plus,
  Sparkle,
  ImageSquare,
  CaretRight,
  PaperPlaneTilt,
  Monitor,
  ShieldCheck,
  Stop,
  Waveform,
  Minus,
  AppWindow,
  MagicWand,
  HandWaving,
} from "@phosphor-icons/react";
import {
  SCENES,
  restoreState,
  createCorpus,
  appendMessage,
  formatRemaining,
  toggleFavorite,
  exportableMessages,
} from "./state.mjs";
import { readMedia, saveMedia } from "./media.mjs";
import { setRain, speak, stopSpeech } from "./audio.js";
import {
  DEFAULT_LOOK_ID,
  ORIGINAL_LOOK,
  cleanRemovedLookIds,
  filterLooks,
  getAvailableLookId,
  getAvailableLooks,
  getLook,
  isLookAvailable,
  isLookId,
  summarizeLooks,
} from "./looks.mjs";
import VoiceLibrary from "./VoiceLibrary.jsx";
import WardrobeFilters, { WardrobeEmpty } from "./WardrobeFilters.jsx";
import { version as appVersion } from "../package.json";
import "./wardrobe.css";

import LivePet from "./LivePet.jsx";
import PetShell from "./PetShell.jsx";
import LookActionMenu from "./LookActionMenu.jsx";

const STORAGE = "muyu-state-v1";
function load() {
  try {
    return restoreState(localStorage.getItem(STORAGE));
  } catch {
    return restoreState(null);
  }
}
function IconButton({
  label,
  children,
  active = false,
  className = "",
  ...props
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={`icon-button ${active ? "active" : ""} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
function Toggle({ checked, onChange, label }) {
  return (
    <button
      className={`toggle ${checked ? "on" : ""}`}
      role="switch"
      aria-label={label}
      aria-checked={checked}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}
function Waves({ active = false }) {
  return (
    <span className={`waves ${active ? "playing" : ""}`} aria-hidden="true">
      {[8, 15, 23, 12, 19, 9, 16].map((h, i) => (
        <i key={i} style={{ height: h, animationDelay: `${i * -0.13}s` }} />
      ))}
    </span>
  );
}
function TypingText({ text, instant = false }) {
  const [count, setCount] = useState(instant ? text.length : 0);
  useEffect(() => {
    if (instant) {
      setCount(text.length);
      return;
    }
    setCount(0);
    let n = 0;
    const id = setInterval(() => {
      n += 1;
      setCount(n);
      if (n >= text.length) clearInterval(id);
    }, 35);
    return () => clearInterval(id);
  }, [text, instant]);
  return (
    <>
      {text.slice(0, count)}
      {count < text.length && <span className="typing-cursor" />}
    </>
  );
}
function Panel({ type, title, subtitle, children, onClose, scrollResetKey }) {
  const ref = useRef();
  useLayoutEffect(() => {
    if (scrollResetKey !== undefined && ref.current) ref.current.scrollTop = 0;
  }, [scrollResetKey]);
  useEffect(() => {
    const before = document.activeElement;
    ref.current?.focus();
    return () => {
      if (before?.isConnected) before.focus();
    };
  }, [type]);
  return (
    <section
      className={`side-panel ${type}`}
      aria-label={title}
      ref={ref}
      tabIndex={-1}
    >
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{subtitle}</p>
          <h2>{title}</h2>
        </div>
        <IconButton label="关闭面板" onClick={onClose}>
          <X size={20} />
        </IconButton>
      </div>
      {children}
    </section>
  );
}

export default function App() {
  const [state, setState] = useState(load),
    [panel, setPanel] = useState(null),
    [input, setInput] = useState(""),
    [busy, setBusy] = useState(false),
    [speaking, setSpeaking] = useState(false),
    [speechPreparing, setSpeechPreparing] = useState(false),
    [rain, setRainState] = useState(false),
    [immersive, setImmersive] = useState(false),
    [toast, setToast] = useState(""),
    [clock, setClock] = useState(new Date()),
    [models, setModels] = useState([]),
    [health, setHealth] = useState(null),
    [compact, setCompact] = useState(false),
    [petMode, setPetMode] = useState(false),
    [petAction, setPetAction] = useState(null),
    [petReady, setPetReady] = useState(false),
    [mood, setMood] = useState("calm"),
    [pinned, setPinned] = useState(false),
    [custom, setCustom] = useState(null),
    [customEnabled, setCustomEnabled] = useState(false),
    [listening, setListening] = useState(false),
    [focusDuration, setFocusDuration] = useState(25),
    [focusRemaining, setFocusRemaining] = useState(1500),
    [focusRunning, setFocusRunning] = useState(false),
    [focusDone, setFocusDone] = useState(false),
    [memoryTab, setMemoryTab] = useState("all"),
    [corpusDraft, setCorpusDraft] = useState(""),
    [corpusTitle, setCorpusTitle] = useState(""),
    [wardrobeQuery, setWardrobeQuery] = useState(""),
    [wardrobeCategory, setWardrobeCategory] = useState("全部"),
    [wardrobeView, setWardrobeView] = useState("active");
  const { scene, settings, messages } = state;
  const animated = state.avatarMode !== "photo";
  const currentLook = getLook(state.lookId);
  const removedLookIds = state.removedLookIds || [];
  const availableLookCount = getAvailableLooks(removedLookIds).length;
  const visibleLooks = filterLooks({
    query: wardrobeQuery,
    category: wardrobeCategory,
    removedLookIds,
    view: wardrobeView,
  });
  const [sceneLine, setSceneLine] = useState(
    "你来啦，等你好久了。\n今天，有什么想和我分享的吗？",
  );
  const [lineKind, setLineKind] = useState("welcome");
  const inputRef = useRef(),
    mediaRef = useRef(),
    requestRef = useRef(),
    recognitionRef = useRef(),
    deadline = useRef(0),
    historyEnd = useRef(),
    toastTimer = useRef(),
    customUrlRef = useRef(),
    sceneRef = useRef(scene),
    sendLock = useRef(false),
    petModeRef = useRef(petMode),
    settingsRef = useRef(settings),
    requestEpoch = useRef(0);
  const removedLookIdsRef = useRef(removedLookIds);
  removedLookIdsRef.current = removedLookIds;
  settingsRef.current = settings;
  petModeRef.current = petMode;
  const notify = useCallback((text) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 4000);
  }, []);
  const readAloud = useCallback(
    (text) => {
      setSpeaking(true);
      setSpeechPreparing(true);
      speak(
        text,
        (error) => {
          setSpeaking(false);
          setSpeechPreparing(false);
          if (error) notify(error.message);
        },
        () => setSpeechPreparing(false),
      );
    },
    [notify],
  );
  const changeSettings = (patch) =>
    setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
  const setMessages = (updater) =>
    setState((s) => ({
      ...s,
      messages: typeof updater === "function" ? updater(s.messages) : updater,
    }));
  const currentScene = SCENES.find((s) => s.id === scene) || SCENES[0];
  const actualProvider =
    settings.provider === "offline"
      ? "offline"
      : models.length
        ? "ollama"
        : "offline";
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE, JSON.stringify(state));
    } catch {
      notify("本地存储空间不足，新的记录暂时无法保存。");
    }
  }, [state, notify]);
  useEffect(() => {
    let live = true;
    fetch("/api/health")
      .then((r) => r.json())
      .then((h) => {
        if (live) setHealth(h);
      })
      .catch(() => {});
    fetch("/api/models")
      .then((r) => r.json())
      .then((data) => {
        if (live)
          setModels(
            (data.models || [])
              .map((m) => (typeof m === "string" ? m : m.name))
              .filter(Boolean),
          );
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    let live = true;
    readMedia()
      .then((data) => {
        if (!live || !data) return;
        const url = URL.createObjectURL(data.blob);
        customUrlRef.current = url;
        setCustom({ ...data, url });
        setCustomEnabled(state.customEnabled);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const desk = window.desktop;
    if (!desk) return;
    desk.getState().then((s) => {
      setCompact(Boolean(s.compact));
      setPinned(Boolean(s.alwaysOnTop));
      setPetMode(Boolean(s.petMode));
    });
    return desk.onStateChange((s) => {
      setCompact(Boolean(s.compact));
      setPinned(Boolean(s.alwaysOnTop));
      setPetMode(Boolean(s.petMode));
    });
  }, []);
  useEffect(() => {
    if (mood === "calm") return;
    const timer = setTimeout(() => setMood("calm"), 5000);
    return () => clearTimeout(timer);
  }, [mood, petAction?.nonce]);
  useEffect(() => {
    document.documentElement.classList.toggle(
      "pet-transparent",
      petMode && Boolean(window.desktop),
    );
    return () => document.documentElement.classList.remove("pet-transparent");
  }, [petMode]);
  useEffect(() => {
    const listener = (e) => {
      if (e.key === "Escape") {
        setPanel(null);
        setImmersive(false);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setPanel(null);
        setImmersive(false);
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
  useEffect(() => {
    if (!settings.voice) {
      stopSpeech();
      setSpeaking(false);
    }
  }, [settings.voice]);
  useEffect(() => {
    setRain(rain, settings.volume).catch(() =>
      notify("当前环境无法播放雨声。"),
    );
  }, [rain, settings.volume, notify]);
  useEffect(
    () => () => {
      requestRef.current?.abort();
      stopSpeech();
      recognitionRef.current?.stop();
      if (customUrlRef.current) URL.revokeObjectURL(customUrlRef.current);
      clearTimeout(toastTimer.current);
    },
    [],
  );
  useEffect(() => {
    historyEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, panel]);
  useEffect(() => {
    if (!focusRunning) return;
    const id = setInterval(() => {
      const remain = Math.max(
        0,
        Math.ceil((deadline.current - Date.now()) / 1000),
      );
      setFocusRemaining(remain);
      if (remain === 0) {
        setFocusRunning(false);
        setFocusDone(true);
        setSceneLine(
          "做得很好，这一段专注完成了。起来伸个懒腰，我们休息一下吧。",
        );
        setLineKind("focus");
        notify("专注完成，休息一下吧。");
        if (settings.voice) readAloud("做得很好，休息一下吧。");
      }
    }, 250);
    return () => clearInterval(id);
  }, [focusRunning, settings.voice, notify, readAloud]);
  const chooseScene = useCallback(
    (id, { quiet = false } = {}) => {
      const s = SCENES.find((s) => s.id === id);
      if (!s) return;
      sceneRef.current = id;
      setState((old) => ({
        ...old,
        scene: id,
        customEnabled: false,
        avatarMode: "photo",
      }));
      setCustomEnabled(false);
      if (!quiet) {
        setSceneLine(s.line);
        setLineKind("outfit");
        if (settings.voice) {
          readAloud(s.line);
        }
      }
    },
    [settings.voice, readAloud],
  );
  function say(text) {
    setSceneLine(text);
    setLineKind("reply");
    if (settingsRef.current.voice) {
      readAloud(text);
    }
  }
  async function send(text = input) {
    const value = text.trim();
    if (!value || sendLock.current) return;
    if (value.length > 1000) {
      notify("每条消息最多 1000 字，试着分成几句吧。");
      return;
    }
    sendLock.current = true;
    setBusy(true);
    setInput("");
    stopSpeech();
    setSpeaking(false);
    setMessages((old) => appendMessage(old, "user", value));
    const epoch = ++requestEpoch.current;
    const controller = new AbortController();
    requestRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 100000);
    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          message: value,
          history: messages
            .slice(-24)
            .map(({ role, content }) => ({ role, content })),
          name: settings.name,
          scene: sceneRef.current,
          avatarMode: animated || petMode ? "live2d" : "photo",
          lookId: state.lookId,
          removedLookIds,
          model: models.includes(settings.model) ? settings.model : models[0],
          provider: actualProvider,
        }),
      });
      const data = await r.json();
      if (epoch !== requestEpoch.current) return;
      if (!r.ok || typeof data.reply !== "string")
        throw Error(data.error || "连接暂时中断");
      if (isLookAvailable(data.lookAction, removedLookIdsRef.current)) {
        chooseLook(data.lookAction);
      } else if (data.action) {
        if (petModeRef.current) await togglePetMode(false);
        if (epoch !== requestEpoch.current) return;
        chooseScene(data.action, { quiet: true });
      }
      setMood(
        ["happy", "calm", "shy", "thinking"].includes(data.emotion)
          ? data.emotion
          : "calm",
      );
      if (data.petAction)
        setPetAction({ kind: data.petAction, nonce: Date.now() });
      setMessages((old) =>
        appendMessage(old, "assistant", data.reply, {
          provider: data.provider,
        }),
      );
      say(data.reply);
      if (data.error) notify("本地模型暂不可用，已切换为内置互动。");
    } catch (error) {
      if (epoch !== requestEpoch.current) return;
      if (error.name === "AbortError") {
        notify("已停止生成。");
        setSceneLine("我在这里。想好了，再慢慢说。");
      } else {
        notify("暂时连接不上本地服务，请重新打开应用。");
        setSceneLine("连接暂时中断了，重新打开应用后我们继续。");
      }
      setLineKind("status");
    } finally {
      clearTimeout(timeout);
      setBusy(false);
      sendLock.current = false;
      requestRef.current = null;
      inputRef.current?.focus();
    }
  }
  async function importMedia(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    if (
      !/^image\/(jpeg|png|webp|gif)$|^video\/(mp4|webm|quicktime)$/.test(
        file.type,
      )
    ) {
      notify("请选择 JPG、PNG、WebP 图片或 MP4、WebM 视频。");
      return;
    }
    if (file.size > 150 * 1024 * 1024) {
      notify("请选择小于 150 MB 的文件。");
      return;
    }
    try {
      await saveMedia(file);
      if (customUrlRef.current) URL.revokeObjectURL(customUrlRef.current);
      const url = URL.createObjectURL(file);
      customUrlRef.current = url;
      setCustom({ blob: file, url, type: file.type, name: file.name });
      setCustomEnabled(true);
      setState((s) => ({ ...s, customEnabled: true, avatarMode: "photo" }));
      notify("已保存到这台电脑，刷新后也会保留。");
    } catch {
      notify("素材保存失败，可能是本地存储空间不足。");
    }
  }
  async function removeMedia() {
    try {
      await saveMedia(null);
      if (customUrlRef.current) URL.revokeObjectURL(customUrlRef.current);
      customUrlRef.current = null;
      setCustom(null);
      setCustomEnabled(false);
      setState((s) => ({ ...s, customEnabled: false }));
      notify("已移除自定义素材。");
    } catch {
      notify("移除失败，请重试。");
    }
  }
  function chooseLook(id) {
    if (!isLookAvailable(id, removedLookIdsRef.current)) return;
    const look = getLook(id);
    if (id !== state.lookId || !animated) setPetReady(false);
    setState((s) => ({ ...s, lookId: id, avatarMode: "live2d" }));
    setPetAction({ kind: "wave", nonce: Date.now() });
    setSceneLine(`换好${look.outfit}了。今晚，继续陪在你身边。`);
    setLineKind("outfit");
  }
  function removeLook(id) {
    if (!isLookId(id) || id === ORIGINAL_LOOK.id) return;
    const wasSelected = state.lookId === id;
    setState((s) => {
      const nextRemovedLookIds = cleanRemovedLookIds([
        ...(s.removedLookIds || []),
        id,
      ]);
      return {
        ...s,
        removedLookIds: nextRemovedLookIds,
        lookId:
          s.lookId === id
            ? getAvailableLookId(nextRemovedLookIds, DEFAULT_LOOK_ID)
            : s.lookId,
      };
    });
    if (wasSelected) {
      setPetReady(false);
      setPetAction({ kind: "wave", nonce: Date.now() });
      notify("已移除当前造型，已切换到保留的造型；可在“已移除”中恢复。");
    } else {
      notify("造型已移除，可在“已移除”中恢复。");
    }
  }
  function restoreLook(id) {
    if (!removedLookIdsRef.current.includes(id)) return;
    setState((s) => ({
      ...s,
      removedLookIds: (s.removedLookIds || []).filter(
        (removedId) => removedId !== id,
      ),
    }));
    notify("造型已恢复到可用衣橱。");
  }
  const onPetReady = useCallback(() => setPetReady(true), []);
  const onPetError = useCallback((message) => notify(message), [notify]);
  function interact(kind) {
    if (busy) return;
    const lines = {
      pat: [
        "唔，头发都被你揉乱啦。再摸一下也可以。",
        "嘿嘿，摸摸头，今天的疲惫就少一点。",
      ],
      wave:
        currentLook.greetingMotion === "nod"
          ? [
              "嗨，和你打个招呼。很高兴在这里陪你。",
              "和你打个招呼，给你送来一点好心情。",
            ]
          : ["嗨！我在这里，看到你啦。", "挥挥手，给你送来一点好心情。"],
      happy: ["收到你的好心情啦，今天也要一起开心。"],
      shy: ["这样看着我，会有一点点害羞呢。"],
      squat: [
        "好呀，我轻轻屈膝蹲下，再从容地站好。",
        "蹲好啦，裙摆和步子都整理妥了。",
      ],
      sexyWalk:
        currentLook.id === "linwei-ivory-wrap"
          ? [
              "那我踩着黑色高跟鞋，慢慢朝你走几步。",
              "好呀，穿着这身通勤装陪你走几步。",
            ]
          : [
              "那我踩着高跟鞋，慢慢朝你走几步。",
              "好呀，穿着红底高跟鞋走几步给你看。",
            ],
    };
    const choices = lines[kind] || lines.pat;
    setPetAction({ kind, nonce: Date.now() });
    setMood(kind === "shy" ? "shy" : "happy");
    say(choices[Math.floor(Math.random() * choices.length)]);
  }
  async function togglePetMode(enabled = !petMode) {
    setPanel(null);
    setImmersive(false);
    if (enabled) setState((s) => ({ ...s, avatarMode: "live2d" }));
    if (window.desktop?.setPetMode) await window.desktop.setPetMode(enabled);
    else setPetMode(enabled);
  }
  async function toggleCompact() {
    if (window.desktop) {
      await window.desktop.setCompact(!compact);
    } else {
      setCompact(!compact);
      notify(
        !compact
          ? "已切换小窗预览。原生置顶请打开桌面应用。"
          : "已返回完整视图。",
      );
    }
    setPanel(null);
  }
  async function togglePin() {
    if (!window.desktop) {
      notify("请打开「母狗张容.app」，即可将窗口置顶。");
      return;
    }
    const result = await window.desktop.setAlwaysOnTop(!pinned);
    setPinned(Boolean(result?.alwaysOnTop ?? !pinned));
  }
  function startVoice() {
    const Recognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      notify("当前环境不支持语音输入，请使用键盘；中文语音朗读仍可用。");
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const r = new Recognition();
    r.lang = "zh-CN";
    r.interimResults = true;
    recognitionRef.current = r;
    r.onstart = () => setListening(true);
    r.onresult = (e) =>
      setInput(
        Array.from(e.results)
          .map((x) => x[0].transcript)
          .join(""),
      );
    r.onend = () => setListening(false);
    r.onerror = (e) => {
      setListening(false);
      notify(
        e.error === "not-allowed"
          ? "麦克风未获授权，请在系统设置中允许或使用键盘。"
          : "语音识别暂不可用，请使用键盘输入。",
      );
    };
    try {
      r.start();
    } catch {
      setListening(false);
      notify("麦克风暂不可用。");
    }
  }
  function exportHistory() {
    const text = exportableMessages(state)
      .map(
        (m) =>
          `${new Date(m.createdAt).toLocaleString("zh-CN")} ${m.role === "user" ? "我" : "张容"}\n${m.content}\n`,
      )
      .join("\n");
    const url = URL.createObjectURL(
      new Blob([text || "还没有聊天记录。"], {
        type: "text/plain;charset=utf-8",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `张容-回忆-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify("回忆已导出。");
  }
  function favorite(id) {
    setState((s) => toggleFavorite(s, id));
  }
  function saveCorpus(event) {
    event.preventDefault();
    const text = corpusDraft.trim();
    if (!text) {
      notify("先写下想让张容读的内容。");
      return;
    }
    const corpus = createCorpus(text, corpusTitle);
    setState((s) => ({
      ...s,
      corpora: [corpus, ...(s.corpora || [])].slice(0, 100),
    }));
    setCorpusDraft("");
    setCorpusTitle("");
    notify("语料已保存在本机。");
  }
  function playCorpus(text) {
    setSceneLine(text);
    setLineKind("corpus");
    readAloud(text);
  }
  function deleteCorpus(id) {
    setState((s) => ({
      ...s,
      corpora: (s.corpora || []).filter((item) => item.id !== id),
    }));
    notify("这条语料已删除。");
  }
  function clearHistory() {
    requestEpoch.current++;
    requestRef.current?.abort();
    stopSpeech();
    setSpeaking(false);
    setState((s) => ({ ...s, messages: [], favorites: [], savedMessages: [] }));
    setSceneLine("新的一页，也想陪你一起写。");
    notify("聊天记录已清空。");
  }
  function startFocus() {
    if (focusRunning) {
      setFocusRunning(false);
      return;
    }
    setFocusDone(false);
    const duration = focusRemaining > 0 ? focusRemaining : focusDuration * 60;
    setFocusRemaining(duration);
    deadline.current = Date.now() + duration * 1000;
    setFocusRunning(true);
    setSceneLine(`接下来的 ${Math.ceil(duration / 60)} 分钟，我安静地陪着你。`);
    setLineKind("focus");
  }
  function nav(id) {
    setPanel((p) => (p === id ? null : id));
    setImmersive(false);
  }
  const time = clock.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const days = Math.max(
    1,
    Math.ceil((Date.now() - state.startedAt) / 86400000),
  );
  const visibleMemories =
    memoryTab === "saved" ? state.savedMessages : messages;
  if (petMode)
    return (
      <PetShell
        lookId={state.lookId}
        removedLookIds={removedLookIds}
        chooseLook={chooseLook}
        removeLook={removeLook}
        restoreLook={restoreLook}
        mood={busy ? "thinking" : mood}
        action={petAction}
        motion={settings.motion}
        line={sceneLine}
        busy={busy}
        speaking={speaking}
        voice={settings.voice}
        input={input}
        setInput={setInput}
        send={send}
        stop={() => requestRef.current?.abort()}
        interact={interact}
        exit={() => togglePetMode(false)}
        toggleVoice={() => changeSettings({ voice: !settings.voice })}
        inputRef={inputRef}
        onReady={onPetReady}
        onError={onPetError}
        native={Boolean(window.desktop)}
      />
    );
  return (
    <div
      className={`app ${animated ? "animated-world" : "photo-world"} ${compact ? "compact" : ""} ${immersive ? "immersive" : ""} ${panel ? "panel-open" : ""} ${settings.motion ? "motion-on" : ""} ${settings.fontSize === "large" ? "large-text" : ""} ${window.desktop ? "native" : ""}`}
    >
      <div className="scene-backdrop" aria-hidden="true">
        {!animated &&
          SCENES.map((s) => (
            <img
              key={s.id}
              src={`/assets/scene-${s.id}.png`}
              className={`scene-image ${scene === s.id && !customEnabled ? "visible" : ""}`}
              alt=""
            />
          ))}
        {!animated &&
          customEnabled &&
          custom &&
          (custom.type.startsWith("video/") ? (
            <video
              key={custom.url}
              className="scene-image custom-media visible"
              src={custom.url}
              autoPlay
              loop
              muted
              playsInline
              onError={() => {
                notify("这个视频无法解码，请换用 H.264 MP4 文件。");
                setCustomEnabled(false);
              }}
            />
          ) : (
            <img
              className="scene-image custom-media visible"
              src={custom.url}
              alt=""
            />
          ))}
        {animated && (
          <div className="pet-room">
            <div className="room-window">
              <span className="room-moon" />
              <i />
              <i />
              <i />
            </div>
            <div className="room-halo" />
            <div className="room-floor" />
          </div>
        )}
        <div className="scene-shade" />
        {rain && (
          <div className="rain-overlay">
            {Array.from({ length: 24 }, (_, i) => (
              <i
                key={i}
                style={{
                  left: `${(i * 37) % 58}%`,
                  animationDelay: `${i * 0.17}s`,
                  animationDuration: `${0.8 + (i % 4) * 0.3}s`,
                }}
              />
            ))}
          </div>
        )}
      </div>
      {animated && (
        <div className="live-stage">
          <LivePet
            lookId={state.lookId}
            mood={busy ? "thinking" : mood}
            action={petAction}
            motion={settings.motion}
            petMode={false}
            onInteract={interact}
            onReady={onPetReady}
            onError={onPetError}
          />
        </div>
      )}
      <aside className="navigation">
        <button
          className="app-mark"
          onClick={() => {
            setPanel(null);
            setImmersive(false);
          }}
          title="张容首页"
          aria-label="张容首页"
        >
          <Moon size={25} weight="fill" />
          <span className="mark-star" />
        </button>
        <div className="nav-main">
          {[
            { id: null, icon: ChatCircleDots, label: "陪伴" },
            { id: "wardrobe", icon: CoatHanger, label: "衣橱" },
            { id: "focus", icon: Timer, label: "专注" },
            { id: "memories", icon: BookOpen, label: "回忆" },
          ].map(({ id, icon: Icon, label }) => (
            <button
              key={label}
              className={`nav-item ${panel === id ? "selected" : ""}`}
              onClick={() => (id ? nav(id) : setPanel(null))}
              aria-label={label}
            >
              <Icon size={23} weight={panel === id ? "fill" : "regular"} />
              <span>{label}</span>
            </button>
          ))}
        </div>
        <div className="nav-bottom">
          <button
            className={`nav-item ${panel === "settings" ? "selected" : ""}`}
            onClick={() => nav("settings")}
            aria-label="设置"
          >
            <GearSix size={23} />
            <span>设置</span>
          </button>
          <div className="nav-divider" />
          <span className="privacy-mark" title="数据保存在本机">
            <ShieldCheck size={20} />
          </span>
        </div>
      </aside>
      <main className="main-stage">
        <header className="topbar">
          <div className="brand">
            <span className="brand-name">母狗张容</span>
            <span className="brand-en">ZHANG RONG</span>
            <span className="header-divider" />
            <span className="connection">
              <i />
              {actualProvider === "ollama" ? "本地 AI 陪伴" : "本地陪伴"}
            </span>
          </div>
          <div className="top-actions">
            <button
              className="desktop-pet-button"
              aria-label="桌宠模式"
              title="桌宠模式"
              onClick={() => togglePetMode(true)}
            >
              <Sparkle size={17} weight="fill" />
              <span>桌宠模式</span>
            </button>
            <span className="clock">
              <span>{time}</span>
              <small>
                {clock.toLocaleDateString("zh-CN", {
                  month: "long",
                  day: "numeric",
                  weekday: "long",
                })}
              </small>
            </span>
            <span className="header-divider" />
            <IconButton label="窗口置顶" active={pinned} onClick={togglePin}>
              <PushPin size={19} weight={pinned ? "fill" : "regular"} />
            </IconButton>
            <IconButton
              label={compact ? "退出小窗" : "桌面小窗"}
              active={compact}
              onClick={toggleCompact}
            >
              <AppWindow size={20} />
            </IconButton>
            <IconButton
              label={immersive ? "退出沉浸" : "沉浸模式"}
              active={immersive}
              onClick={() => {
                setImmersive(!immersive);
                setPanel(null);
              }}
            >
              <ArrowsOut size={20} />
            </IconButton>
          </div>
        </header>
        <div className="ambient-label">
          <span className="ambient-dot" />
          {animated ? (
            <button className="ambient-look" onClick={() => nav("wardrobe")}>
              {currentLook.name} <CaretRight size={12} />
            </button>
          ) : (
            "此刻 · 在你身边"
          )}{" "}
          <span className="ambient-line" />
          <span>OUR LITTLE WORLD</span>
        </div>
        {!panel && (
          <section className="welcome">
            <p className="eyebrow">
              <span /> 一个人的桌面，两个人的时光
            </p>
            <h1>
              世界很大，
              <br />
              这里<span>有我。</span>
            </h1>
            <p className="welcome-caption">
              {animated
                ? "摸摸头、打个招呼。陪伴，是会回应的小日常。"
                : "放慢一点。今天的故事，我想听你说。"}
            </p>
            <div className="day-pill">
              <Heart size={13} weight="fill" />
              相伴的第 {days} 天<span>·</span>
              <span>从这一刻开始</span>
            </div>
          </section>
        )}
        {focusRunning && (
          <button className="focus-indicator" onClick={() => nav("focus")}>
            <Timer size={18} />
            <span>一起专注</span>
            <strong>{formatRemaining(focusRemaining)}</strong>
            <CaretRight size={14} />
          </button>
        )}
        {animated && !panel && (
          <div className="pet-interaction-bar" aria-label="角色互动">
            <span className="live-status">
              <i />
              {petReady ? `张容 · 正在你身边` : `张容 · 正在换好衣服`}
            </span>
            <div>
              <button onClick={() => interact("pat")}>
                <Heart size={16} />
                摸摸头
              </button>
              <button onClick={() => interact("wave")}>
                <HandWaving size={16} />
                {currentLook.greetingMotion === "nod" ? "打个招呼" : "挥挥手"}
              </button>
              <button onClick={() => interact("shy")}>
                <Sparkle size={16} />
                害羞一下
              </button>
              <LookActionMenu look={currentLook} onSelect={interact} />
            </div>
            <small>试着移动鼠标，她会看向你</small>
          </div>
        )}
        <div className="character-note">
          <span className="little-star">✧</span>
          <div>
            <span>张容</span>
            <small>
              {speaking
                ? "正在轻声回应"
                : busy
                  ? "在认真想你的话"
                  : "今天也很高兴见到你"}
            </small>
          </div>
          <span className="character-online" />
        </div>
        <section className="conversation" aria-label="对话">
          <div className="reply-heading">
            <span className="reply-avatar">
              <Moon size={14} weight="fill" />
            </span>
            <span>张容</span>
            <span className="reply-divider" />
            <span className="reply-mood">
              {busy
                ? "想一想…"
                : speaking
                  ? speechPreparing
                    ? "正在准备声音…"
                    : "正在说话"
                  : lineKind === "outfit"
                    ? "换好了"
                    : "轻轻说"}
            </span>
            <button
              className="inline-voice"
              onClick={() => {
                if (speaking) {
                  stopSpeech();
                  setSpeaking(false);
                } else {
                  readAloud(sceneLine);
                }
              }}
              aria-label={speaking ? "停止朗读" : "朗读回复"}
            >
              <Waves active={speaking || busy} />
            </button>
          </div>
          <p className="reply-text" aria-live="polite">
            {busy ? (
              <span className="thinking">
                让我想一想<span>···</span>
              </span>
            ) : (
              <TypingText text={sceneLine} instant={!settings.motion} />
            )}
          </p>
          {!busy && (
            <div className="suggestions">
              {[
                "今天有点累",
                animated ? "开心一点" : "换一套衣服",
                "陪我专注",
              ].map((t, i) => (
                <button
                  key={t}
                  onClick={() =>
                    i === 1
                      ? animated
                        ? interact("happy")
                        : nav("wardrobe")
                      : i === 2
                        ? nav("focus")
                        : send(t)
                  }
                >
                  {t}
                  <CaretRight size={12} />
                </button>
              ))}
            </div>
          )}
        </section>
        <div className="bottom-area">
          <form
            className={`composer ${listening ? "listening" : ""}`}
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <IconButton
              label={listening ? "停止语音输入" : "语音输入"}
              active={listening}
              onClick={startVoice}
            >
              <Microphone size={23} weight={listening ? "fill" : "regular"} />
            </IconButton>
            <button
              type="button"
              className="corpus-open-button"
              onClick={() => nav("corpora")}
              aria-label={`打开语料库，共 ${state.corpora?.length || 0} 条`}
              title="语料库"
            >
              <BookOpen size={18} />
              <span>语料</span>
            </button>
            <span className="composer-divider" />
            <input
              ref={inputRef}
              aria-label="对张容说点什么"
              placeholder={
                listening ? "正在听你说…" : "和我说说话吧，什么都可以…"
              }
              maxLength={1000}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  (e.nativeEvent.isComposing || e.keyCode === 229)
                )
                  e.preventDefault();
              }}
            />
            <span className="enter-hint">↵</span>
            {busy ? (
              <IconButton
                label="停止生成"
                className="send-button"
                onClick={() => requestRef.current?.abort()}
              >
                <Stop size={19} weight="fill" />
              </IconButton>
            ) : (
              <button
                className="send-button"
                type="submit"
                title="发送消息"
                aria-label="发送消息"
                disabled={!input.trim()}
              >
                <ArrowUp size={22} weight="bold" />
              </button>
            )}
          </form>
          <div className="bottom-meta">
            <span>
              <ShieldCheck size={12} />
              {actualProvider === "ollama"
                ? "本地模型 · 对话不出设备"
                : "内置互动 · 无需联网"}
            </span>
            <span className="keyboard-tip">⌘ K 快速说话</span>
          </div>
        </div>
        <div className="scene-controls">
          <button
            className={`rain-button ${rain ? "active" : ""}`}
            onClick={() => setRainState(!rain)}
            aria-label={rain ? "关闭雨声" : "开启雨声"}
          >
            <CloudRain size={19} />
            <span>{rain ? "雨声已开启" : "听雨"}</span>
            <span className="tiny-dot" />
          </button>
          <span className="vertical-line" />
          <IconButton
            label={settings.voice ? "关闭语音朗读" : "开启语音朗读"}
            active={settings.voice}
            onClick={() => changeSettings({ voice: !settings.voice })}
          >
            {settings.voice ? (
              <SpeakerHigh size={20} />
            ) : (
              <SpeakerSlash size={20} />
            )}
          </IconButton>
          <button className="current-look" onClick={() => nav("wardrobe")}>
            <span
              style={{
                background: animated ? currentLook.color : currentScene.color,
              }}
            />
            {animated
              ? currentLook.name
              : customEnabled
                ? "自定义画面"
                : currentScene.short}
            <CaretRight size={13} />
          </button>
        </div>
        {immersive && (
          <button
            className="exit-immersive"
            onClick={() => setImmersive(false)}
          >
            <ArrowsIn size={16} />
            退出沉浸 <span>ESC</span>
          </button>
        )}
        {panel === "wardrobe" && (
          <Panel
            type="wardrobe"
            title="选一种，陪你的模样"
            subtitle="MY WARDROBE"
            scrollResetKey={JSON.stringify([
              wardrobeView,
              wardrobeQuery,
              wardrobeCategory,
            ])}
            onClose={() => setPanel(null)}
          >
            <p className="panel-intro">
              <span className="wardrobe-summary">
                {summarizeLooks(removedLookIds)}
              </span>
              <span>不同风格，一样会回应的陪伴。</span>
            </p>
            <div className="look-section-heading">
              <span>
                {wardrobeView === "active" ? "原创动态造型" : "已移除造型"}
              </span>
              <small>
                {wardrobeView === "active"
                  ? "找到今天的心动模样"
                  : "可以随时恢复"}
              </small>
            </div>
            <WardrobeFilters
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
            <div className="live-look-grid">
              {visibleLooks.map((look) => {
                const selected =
                  wardrobeView === "active" &&
                  animated &&
                  state.lookId === look.id;
                const cardContent = (
                  <>
                    <span className="live-look-preview">
                      <span className="look-placeholder" aria-hidden="true">
                        <Sparkle size={30} weight="thin" />
                        <span>{look.character}</span>
                      </span>
                      <img
                        src={look.thumbnail}
                        alt=""
                        loading="lazy"
                        onError={(event) => {
                          event.currentTarget.hidden = true;
                        }}
                      />
                      <span className="look-age">{look.age} 岁</span>
                      {look.isNew && <span className="look-new">NEW</span>}
                      {selected && (
                        <span className="chosen-check">
                          <Check size={13} weight="bold" />
                        </span>
                      )}
                    </span>
                    <span className="live-look-info">
                      <strong>
                        {look.character}
                        <small>{look.outfit}</small>
                      </strong>
                      <span className="look-style-tags">
                        {[look.region, ...look.styles]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                      <span>{look.description}</span>
                    </span>
                  </>
                );
                return (
                  <article
                    key={look.id}
                    className={`live-look-card ${selected ? "chosen" : ""}`}
                    style={{ "--look-accent": look.color }}
                  >
                    {wardrobeView === "active" ? (
                      <button
                        type="button"
                        className="live-look-main"
                        aria-label={`动态换装：${look.name}`}
                        aria-pressed={selected}
                        onClick={() => chooseLook(look.id)}
                      >
                        {cardContent}
                      </button>
                    ) : (
                      <div className="live-look-main is-removed">
                        {cardContent}
                      </div>
                    )}
                    <button
                      type="button"
                      className="live-look-action"
                      aria-label={`${wardrobeView === "active" ? "移除" : "恢复"}${look.name}`}
                      onClick={() =>
                        wardrobeView === "active"
                          ? removeLook(look.id)
                          : restoreLook(look.id)
                      }
                    >
                      {wardrobeView === "active" ? (
                        <Trash size={13} />
                      ) : (
                        <ArrowCounterClockwise size={13} />
                      )}
                      {wardrobeView === "active" ? "移除" : "恢复"}
                    </button>
                  </article>
                );
              })}
            </div>
            {wardrobeView === "active" && (
              <button
                className={`animated-choice original-look-choice ${animated && state.lookId === ORIGINAL_LOOK.id ? "selected" : ""}`}
                onClick={() => chooseLook(ORIGINAL_LOOK.id)}
                aria-pressed={animated && state.lookId === ORIGINAL_LOOK.id}
              >
                <span className="animated-choice-icon">
                  <Sparkle size={26} />
                </span>
                <span>
                  <strong>{ORIGINAL_LOOK.name}</strong>
                  <small>原始造型</small>
                </span>
                {animated && state.lookId === ORIGINAL_LOOK.id ? (
                  <Check size={20} />
                ) : (
                  <CaretRight size={20} />
                )}
              </button>
            )}
            <p className="outfit-section-label">写实场景 · 图片 / 自定义视频</p>
            <div className="outfit-grid">
              {SCENES.map((s, i) => (
                <button
                  key={s.id}
                  className={`outfit-card ${!animated && scene === s.id && !customEnabled ? "chosen" : ""}`}
                  onClick={() => chooseScene(s.id)}
                  aria-label={`换装：${s.name}`}
                  aria-pressed={!animated && scene === s.id && !customEnabled}
                >
                  <div className="outfit-photo">
                    <img
                      src={`/assets/scene-${s.id}.png`}
                      alt={`${s.short}造型`}
                    />
                    <span className="outfit-number">0{i + 1}</span>
                    {!animated && scene === s.id && !customEnabled && (
                      <span className="chosen-check">
                        <Check size={13} weight="bold" />
                      </span>
                    )}
                  </div>
                  <div className="outfit-info">
                    <strong>{s.name}</strong>
                    <span>{s.desc}</span>
                  </div>
                </button>
              ))}
            </div>
            <div className="custom-section">
              <div className="section-label">
                <span>你的专属画面</span>
                <span>图片 / 循环视频</span>
              </div>
              <button
                className="upload-button"
                onClick={() => mediaRef.current.click()}
              >
                <Plus size={19} />
                <span>{custom ? "更换本地素材" : "导入你喜欢的画面"}</span>
                <ArrowUp className="upload-arrow" size={16} />
              </button>
              {custom && (
                <div className="uploaded-media">
                  <button
                    onClick={() => {
                      setCustomEnabled(!customEnabled);
                      setState((s) => ({
                        ...s,
                        customEnabled: !customEnabled,
                        avatarMode: "photo",
                      }));
                    }}
                  >
                    <ImageSquare size={16} />
                    <span>{custom.name}</span>
                    {customEnabled && <Check size={16} />}
                  </button>
                  <IconButton label="移除自定义素材" onClick={removeMedia}>
                    <Trash size={16} />
                  </IconButton>
                </div>
              )}
              <p className="footnote">
                内置为原创 AI 场景与轻动态效果。导入 MP4 /
                WebM，可播放真正的循环视频。素材仅保存在本机。
              </p>
            </div>
          </Panel>
        )}
        {panel === "focus" && (
          <Panel
            type="focus"
            title="把时间，留给自己"
            subtitle="STAY A LITTLE FOCUSED"
            onClose={() => setPanel(null)}
          >
            <p className="panel-intro">你认真做事，我安静陪着你。</p>
            <div className={`timer-face ${focusRunning ? "running" : ""}`}>
              <div>
                <span>
                  {focusDone
                    ? "这一段，做得很棒"
                    : focusRunning
                      ? "正在陪你专注"
                      : "属于你的专注时光"}
                </span>
                <strong>{formatRemaining(focusRemaining)}</strong>
                <small>
                  {focusRunning ? "不用着急，一件一件来" : "今天，也向前一点点"}
                </small>
              </div>
            </div>
            <div className="duration-options">
              {[15, 25, 45, 60].map((n) => (
                <button
                  key={n}
                  disabled={focusRunning}
                  className={focusDuration === n ? "selected" : ""}
                  onClick={() => {
                    setFocusDuration(n);
                    setFocusRemaining(n * 60);
                    setFocusDone(false);
                  }}
                >
                  {n} 分钟
                </button>
              ))}
            </div>
            <div className="focus-actions">
              <button className="primary-button" onClick={startFocus}>
                {focusRunning ? (
                  <Pause size={19} weight="fill" />
                ) : (
                  <Play size={19} weight="fill" />
                )}
                {focusRunning
                  ? "暂停一下"
                  : focusDone
                    ? "再来一段"
                    : "开始专注"}
              </button>
              <IconButton
                label="重置专注计时"
                onClick={() => {
                  setFocusRunning(false);
                  setFocusRemaining(focusDuration * 60);
                  setFocusDone(false);
                }}
              >
                <ArrowCounterClockwise size={21} />
              </IconButton>
            </div>
            <div className="sound-card">
              <CloudRain size={29} />
              <div>
                <strong>窗外，落着小雨</strong>
                <p>柔和的雨声，让思绪慢下来。</p>
              </div>
              <Toggle label="专注雨声" checked={rain} onChange={setRainState} />
            </div>
            <p className="focus-quote">
              “不用每一天都很厉害，
              <br />
              今天的你，已经很好了。”
            </p>
          </Panel>
        )}
        {panel === "memories" && (
          <Panel
            type="memories"
            title="我们的碎碎念"
            subtitle="LITTLE THINGS, KEPT HERE"
            onClose={() => setPanel(null)}
          >
            <div className="memory-toolbar">
              <div className="memory-tabs">
                <button
                  className={memoryTab === "all" ? "selected" : ""}
                  onClick={() => setMemoryTab("all")}
                >
                  全部 <span>{messages.length}</span>
                </button>
                <button
                  className={memoryTab === "saved" ? "selected" : ""}
                  onClick={() => setMemoryTab("saved")}
                >
                  心动收藏
                </button>
              </div>
              <IconButton label="导出聊天记录" onClick={exportHistory}>
                <Download size={19} />
              </IconButton>
            </div>
            <div className="memory-list">
              {!visibleMemories.length ? (
                <div className="empty-state">
                  <BookOpen size={42} weight="thin" />
                  <h3>
                    {memoryTab === "saved"
                      ? "把喜欢的话，悄悄留下"
                      : "我们的故事，刚刚开始"}
                  </h3>
                  <p>
                    {memoryTab === "saved"
                      ? "轻点消息旁的爱心，即可收藏。"
                      : "说一句你好，留下第一段回忆。"}
                  </p>
                </div>
              ) : (
                visibleMemories.map((m) => (
                  <article key={m.id} className={`memory-message ${m.role}`}>
                    <div>
                      <strong>{m.role === "user" ? "我" : "张容"}</strong>
                      <time>
                        {new Date(m.createdAt).toLocaleTimeString("zh-CN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                      <button
                        className={
                          state.favorites.includes(m.id) ? "favorited" : ""
                        }
                        aria-label={
                          state.favorites.includes(m.id)
                            ? "取消收藏"
                            : "收藏这条消息"
                        }
                        onClick={() => favorite(m.id)}
                      >
                        <Heart
                          size={15}
                          weight={
                            state.favorites.includes(m.id) ? "fill" : "regular"
                          }
                        />
                      </button>
                    </div>
                    <p>{m.content}</p>
                  </article>
                ))
              )}
              <div ref={historyEnd} />
            </div>
            <div className="memory-footer">
              <ShieldCheck size={15} />
              <span>最近 200 条保存在本机，收藏会单独保留。</span>
            </div>
          </Panel>
        )}
        {panel === "corpora" && (
          <Panel
            type="corpora"
            title="张容的语料库"
            subtitle="WORDS TO KEEP"
            onClose={() => setPanel(null)}
          >
            <p className="panel-intro">
              写下想听的文字，试读一下，或保存起来随时播放。
            </p>
            <form className="corpus-editor" onSubmit={saveCorpus}>
              <label className="field-label" htmlFor="corpus-title">
                名称（选填）
              </label>
              <input
                id="corpus-title"
                className="settings-input"
                value={corpusTitle}
                maxLength={60}
                placeholder="例如：睡前故事"
                onChange={(event) => setCorpusTitle(event.target.value)}
              />
              <label className="field-label" htmlFor="corpus-text">
                朗读文本
              </label>
              <textarea
                id="corpus-text"
                className="corpus-textarea"
                value={corpusDraft}
                maxLength={1500}
                placeholder="输入或粘贴一段文字，最多 1500 字…"
                onChange={(event) => setCorpusDraft(event.target.value)}
              />
              <div className="corpus-editor-actions">
                <button
                  type="button"
                  className="corpus-secondary-button"
                  disabled={!corpusDraft.trim()}
                  onClick={() => playCorpus(corpusDraft.trim())}
                >
                  <Play size={16} weight="fill" />
                  读给我听
                </button>
                <button
                  className="primary-button"
                  type="submit"
                  disabled={!corpusDraft.trim()}
                >
                  <Plus size={17} />
                  保存语料
                </button>
              </div>
            </form>
            <div className="corpus-list-heading">
              <strong>已保存</strong>
              <span>{state.corpora?.length || 0} / 100</span>
            </div>
            <div className="corpus-list">
              {!state.corpora?.length ? (
                <div className="empty-state corpus-empty">
                  <BookOpen size={37} weight="thin" />
                  <h3>喜欢的文字，留在这里</h3>
                  <p>保存后可以随时点开，让张容读给你听。</p>
                </div>
              ) : (
                state.corpora.map((item) => (
                  <article className="corpus-card" key={item.id}>
                    <div className="corpus-card-heading">
                      <strong>{item.title}</strong>
                      <time>
                        {new Date(item.createdAt).toLocaleDateString("zh-CN")}
                      </time>
                    </div>
                    <p>{item.text}</p>
                    <div className="corpus-card-actions">
                      <button onClick={() => playCorpus(item.text)}>
                        <Play size={15} weight="fill" />
                        朗读
                      </button>
                      <button
                        className="corpus-delete-button"
                        aria-label={`删除语料：${item.title}`}
                        onClick={() => deleteCorpus(item.id)}
                      >
                        <Trash size={15} />
                        删除
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </Panel>
        )}
        {panel === "settings" && (
          <Panel
            type="settings"
            title="让陪伴，更像你喜欢的"
            subtitle="MAKE YOURSELF AT HOME"
            onClose={() => setPanel(null)}
          >
            <div className="settings-scroll">
              <div className="settings-section">
                <h3>认识一下你</h3>
                <label className="field-label" htmlFor="your-name">
                  希望我怎么称呼你
                </label>
                <input
                  id="your-name"
                  className="settings-input"
                  value={settings.name}
                  maxLength={24}
                  placeholder="留一个喜欢的称呼"
                  onChange={(e) => changeSettings({ name: e.target.value })}
                />
              </div>
              <div className="settings-section">
                <h3>声音与画面</h3>
                <div className="setting-row">
                  <div>
                    <strong>语音回应</strong>
                    <p>
                      {health?.voiceProfile?.mode === "reference"
                        ? `${health.voiceProfile.name || "参考音色"} · 本机流式朗读`
                        : "使用本机中文语音轻声朗读"}
                    </p>
                  </div>
                  <Toggle
                    label="语音回应"
                    checked={settings.voice}
                    onChange={(voice) => changeSettings({ voice })}
                  />
                </div>
                <VoiceLibrary
                  speaking={speaking}
                  onStop={() => {
                    stopSpeech();
                    setSpeaking(false);
                    setSpeechPreparing(false);
                  }}
                  onPreview={() =>
                    readAloud(
                      "你好，我是张容。今天过得怎么样？我会在这里，慢慢听你说。",
                    )
                  }
                  onChange={() =>
                    fetch("/api/health")
                      .then((r) => r.json())
                      .then(setHealth)
                      .catch(() => {})
                  }
                />
                <div className="setting-row">
                  <div>
                    <strong>角色自动动作</strong>
                    <p>眨眼、呼吸与目光跟随；关闭后可手动互动</p>
                  </div>
                  <Toggle
                    label="角色自动动作"
                    checked={settings.motion}
                    onChange={(motion) => changeSettings({ motion })}
                  />
                </div>
                <div className="setting-row">
                  <div>
                    <strong>更大的字幕</strong>
                    <p>让每句话看得更清楚</p>
                  </div>
                  <Toggle
                    label="更大的字幕"
                    checked={settings.fontSize === "large"}
                    onChange={(v) =>
                      changeSettings({ fontSize: v ? "large" : "normal" })
                    }
                  />
                </div>
                <label className="volume-row">
                  <SpeakerHigh size={17} />
                  <span>雨声音量</span>
                  <input
                    aria-label="雨声音量"
                    type="range"
                    min="0"
                    max="1"
                    step=".01"
                    value={settings.volume}
                    onChange={(e) =>
                      changeSettings({ volume: Number(e.target.value) })
                    }
                  />
                  <small>{Math.round(settings.volume * 100)}%</small>
                </label>
              </div>
              <div className="settings-section">
                <h3>本地对话</h3>
                <div className="model-status">
                  <span
                    className={`model-dot ${models.length ? "ready" : ""}`}
                  />
                  <div>
                    <strong>
                      {models.length ? "本地模型已就绪" : "内置互动已就绪"}
                    </strong>
                    <p>{models[0] || "支持换装、问候与日常陪伴"}</p>
                  </div>
                  <span className="local-badge">LOCAL</span>
                </div>
                <label className="field-label" htmlFor="provider">
                  对话方式
                </label>
                <select
                  id="provider"
                  value={settings.provider}
                  onChange={(e) => changeSettings({ provider: e.target.value })}
                >
                  <option value="auto">自动 · 优先本地 AI</option>
                  <option value="offline">内置场景互动</option>
                  <option value="ollama" disabled={!models.length}>
                    Ollama 本地 AI
                  </option>
                </select>
                {models.length > 1 && (
                  <select
                    aria-label="本地模型"
                    value={
                      models.includes(settings.model)
                        ? settings.model
                        : models[0]
                    }
                    onChange={(e) => changeSettings({ model: e.target.value })}
                  >
                    {models.map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                )}
                <p className="footnote">
                  本地模型用于自由对话；内置互动使用预设规则。语音输入取决于浏览器识别服务，可能需要联网。中文朗读可在本机完成。
                </p>
                <button
                  className="text-button"
                  onClick={async () => {
                    try {
                      const d = await (await fetch("/api/models")).json();
                      setModels(
                        (d.models || [])
                          .map((m) => (typeof m === "string" ? m : m.name))
                          .filter(Boolean),
                      );
                      notify("已重新检测本地模型。");
                    } catch {
                      notify("本地模型检测失败。");
                    }
                  }}
                >
                  <ArrowCounterClockwise size={14} />
                  重新检测模型
                </button>
              </div>
              <div className="settings-section">
                <h3>留住，或重新开始</h3>
                <div className="data-buttons">
                  <button onClick={exportHistory}>
                    <Download size={16} />
                    导出回忆
                  </button>
                  <button onClick={clearHistory}>
                    <Trash size={16} />
                    清空记录
                  </button>
                </div>
                <p className="footnote">
                  张容是 AI
                  虚构角色。记录和偏好仅保存在本机，清空记录后无法恢复。
                </p>
              </div>
              <div className="about">
                <Moon size={22} weight="fill" />
                <span>
                  张容 <small>ZHANG RONG · {appVersion}</small>
                </span>
                <p>小小的桌面，刚刚好的陪伴。</p>
              </div>
            </div>
          </Panel>
        )}
      </main>
      <input
        ref={mediaRef}
        type="file"
        hidden
        accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
        onChange={importMedia}
      />
      {toast && (
        <div className="toast" role="status">
          <Sparkle size={17} />
          {toast}
        </div>
      )}
    </div>
  );
}
