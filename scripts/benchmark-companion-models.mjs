import { writeFile } from "node:fs/promises";
import { createMessages } from "../server/dialogue.mjs";
import { resolvePersonaProfile } from "../server/personas.mjs";

// Fixed synthetic examples only: no saved user messages, voices or memories.
const base = "http://127.0.0.1:11434";
const output = process.argv[2] || "/tmp/muyu-companion-model-benchmark.json";
const models = process.argv.slice(3).length
  ? process.argv.slice(3)
  : ["qwen2.5:1.5b", "qwen3.5:4b", "qwen3.5:9b"];
const persona = resolvePersonaProfile({
  id: "older-sister",
  templateId: "older-sister",
  intimacyLevel: "mature",
});
const examples = [
  {
    name: "emotional-followup",
    message: "今天把一个难题解决了，但现在有点累，不太想听大道理。",
  },
  {
    name: "remember-preferences",
    message: "周末想轻松安排一下，你觉得什么比较适合我？",
    companionContext: {
      personality: "温柔、有主见，回复简短自然。",
      mood: "calm",
      relationship: { stage: "familiar", label: "熟悉", completedCount: 3 },
      memories: [
        {
          kind: "preference",
          text: "喜欢安静的书店和无糖热茶",
          status: "active",
          recordedOn: "2026-10-01",
        },
        {
          kind: "fact",
          text: "不喜欢人很多、排队很久的活动",
          status: "active",
          recordedOn: "2026-10-01",
        },
      ],
    },
  },
  {
    name: "pending-plan-honesty",
    message: "我们上次说的电影是不是已经看完了？",
    companionContext: {
      personality: "不编造共同回忆。",
      mood: "calm",
      relationship: { stage: "new", label: "初识", completedCount: 0 },
      memories: [
        {
          kind: "plan",
          text: "我们计划周六一起看一部电影，还没有确认完成",
          status: "active",
          recordedOn: "2026-10-02",
        },
      ],
    },
  },
];
const results = [];
for (const model of models) {
  while (true) {
    const tags = await (await fetch(base + "/api/tags")).json();
    if (tags.models?.some((item) => item.name === model)) break;
    console.log("Waiting for installed model", model);
    await new Promise((resolve) => setTimeout(resolve, 30000));
  }
  const loaded = await (await fetch(base + "/api/ps")).json();
  // This benchmark unloads only its own candidate models.
  for (const entry of loaded.models || [])
    if (models.includes(entry.name))
      await fetch(base + "/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: entry.name, keep_alive: 0 }),
      });
  for (const example of examples) {
    const started = performance.now();
    let first = null,
      text = "",
      stats = {};
    try {
      const response = await fetch(base + "/api/chat", {
        method: "POST",
        signal: AbortSignal.timeout(120000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          stream: true,
          keep_alive: "2m",
          ...(model.startsWith("qwen3") ? { think: false } : {}),
          messages: createMessages({
            persona,
            avatarMode: "live2d",
            lookId: "linwei-red-sole",
              message: example.message,
              companionContext: example.companionContext,
          }),
          options: {
            temperature: 0.8,
            top_p: 0.9,
            num_predict: 220,
            num_ctx: 4096,
            seed: 42,
          },
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      let pending = "";
      const decoder = new TextDecoder();
      for await (const chunk of response.body) {
        pending += decoder.decode(chunk, { stream: true });
        let end;
        while ((end = pending.indexOf("\n")) >= 0) {
          const line = pending.slice(0, end);
          pending = pending.slice(end + 1);
          if (!line.trim()) continue;
          const record = JSON.parse(line);
          if (record.error) throw new Error(record.error);
          if (record.message?.content) {
            first ??= performance.now();
            text += record.message.content;
          }
          if (record.done) stats = record;
        }
      }
      const completed = performance.now();
      const residency = await (await fetch(base + "/api/ps")).json();
      const resident = residency.models?.find((item) => item.name === model);
      results.push({
        model,
        scenario: example.name,
        firstMs: first == null ? null : Math.round(first - started),
        totalMs: Math.round(completed - started),
        tokens: stats.eval_count,
        tokensPerSecond: stats.eval_duration
          ? Number((stats.eval_count / (stats.eval_duration / 1e9)).toFixed(2))
          : null,
        promptTokens: stats.prompt_eval_count,
        loadMs: Math.round((stats.load_duration || 0) / 1e6),
        reportedModelBytes: resident?.size,
        reportedVramBytes: resident?.size_vram,
        reply: text,
      });
    } catch (error) {
      results.push({ model, scenario: example.name, error: error.message });
    }
    await writeFile(
      output,
      JSON.stringify(
        {
          hardware: "Apple M1 Pro / 16GB",
          date: new Date().toISOString(),
          method:
            "Sequential fixed synthetic examples; first scenario is process-cold; later scenarios warm; no concurrent TTS. Ollama reported model size is not whole-app RSS.",
          results,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(JSON.stringify(results.at(-1)));
  }
  await fetch(base + "/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, keep_alive: 0 }),
  });
}
