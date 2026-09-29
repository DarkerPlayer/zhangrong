const LEVEL_CATEGORIES = new Set(["affection", "teasing", "seduction"]);
const COMMON_CATEGORIES = new Set([
  "greeting",
  "daily",
  "comfort",
  "jealousy",
  "praise",
  "goodnight",
  "fallback",
]);

export function detectDialogueIntent(message = "") {
  const text = String(message).trim();
  if (/晚安|睡觉|睡了|好梦/.test(text)) return "goodnight";
  if (/难过|伤心|累|烦|焦虑|压力|委屈|不开心|孤独|寂寞|失眠/.test(text)) return "comfort";
  if (/吃醋|嫉妒|别的女生|别的女人|前女友|她比你/.test(text)) return "jealousy";
  if (/夸夸我|表扬我|做到了|完成了|成功了|考过了/.test(text)) return "praise";
  if (/摸摸(?:你的)?(?:头|脑袋)|摸(?:一下)?头/.test(text)) return "action:pat";
  if (/挥挥手|挥(?:个|一下)手|打个招呼/.test(text)) return "action:wave";
  if (/换|穿|试|衣服|造型|穿搭/.test(text)) return "action:outfit";
  if (/诱惑|勾引|撩我|性感一点|暧昧一点|更大胆/.test(text)) return "seduction";
  if (/逗逗我|调侃|捉弄|逗我|坏一点/.test(text)) return "teasing";
  if (/喜欢你|爱你|想你|抱抱|亲亲|宝贝|女朋友/.test(text)) return "affection";
  if (/早上好|早安|你好|嗨|哈[喽啰]|在吗|回来|下班|hello|hi\b/i.test(text)) return "greeting";
  if (/吃|饿|工作|学习|电影|音乐|游戏|今天|日常|计划|目标/.test(text)) return "daily";
  return "fallback";
}

function intentLines(persona, intent) {
  if (!persona?.corpora) return [];
  if (String(intent).startsWith("action:")) {
    const action = String(intent).slice(7);
    return Array.isArray(persona.corpora.action?.[action]) ? persona.corpora.action[action] : [];
  }
  if (LEVEL_CATEGORIES.has(intent)) {
    const level = persona.intimacyLevel || "mature";
    return Array.isArray(persona.corpora[intent]?.[level]) ? persona.corpora[intent][level] : [];
  }
  return COMMON_CATEGORIES.has(intent) && Array.isArray(persona.corpora[intent])
    ? persona.corpora[intent]
    : [];
}

function hashText(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function selectPersonaReferences(persona, intent, limit = 4) {
  const lines = intentLines(persona, intent);
  const bounded = Math.max(0, Math.min(4, Number.isFinite(limit) ? Math.floor(limit) : 4));
  if (!bounded || !lines.length) return [];
  const start = hashText(`${persona?.id || "persona"}:${intent}`) % lines.length;
  return [...lines.slice(start), ...lines.slice(0, start)].slice(0, bounded);
}

export function renderPersonaLine(line, values = {}) {
  const replacements = {
    userName: values.userName || "你",
    personaName: values.personaName || "我",
  };
  return String(line).replace(/\{(userName|personaName)\}/g, (_, key) => replacements[key]);
}

export function choosePersonaLine(persona, intent, history = [], message = "", values = {}) {
  const lines = intentLines(persona, intent);
  if (!lines.length && intent !== "fallback")
    return choosePersonaLine(persona, "fallback", history, message, values);
  if (!lines.length) return "我在听，你继续说。";
  const rendered = lines.map((line) => renderPersonaLine(line, {
    ...values,
    personaName: values.personaName || persona?.name,
  }));
  const recent = new Set(
    (Array.isArray(history) ? history : [])
      .filter((item) => item?.role === "assistant" && typeof item.content === "string")
      .slice(-3)
      .map((item) => item.content),
  );
  const start = hashText(`${message}:${history.length}:${persona?.id || "persona"}:${intent}`) % rendered.length;
  return [...rendered.slice(start), ...rendered.slice(0, start)].find((line) => !recent.has(line)) || rendered[start];
}
