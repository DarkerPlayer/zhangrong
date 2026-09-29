import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import http from "node:http";
import { resolvePersonaProfile } from "../server/personas.mjs";

const module = await import("../server/index.mjs").catch(() => null);
test("server exports an embeddable startServer function", () =>
  assert.equal(typeof module?.startServer, "function"));

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), "muyu-server-test-"));
  const site = join(dir, "public");
  await mkdir(site);
  await writeFile(join(site, "index.html"), "<h1>沐语</h1>");
  await writeFile(join(dir, "secret.txt"), "PRIVATE");
  await symlink(join(dir, "secret.txt"), join(site, "leak.txt"));
  const app = await module.startServer({ prewarm: false, port: 0, staticDir: site, voiceDirectory: join(dir, "voices") });
  t.after(async () => {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  });
  return { url: `http://127.0.0.1:${app.port}`, app };
}
const opts = { skip: !module };

test(
  "health and model discovery return explicit local capability status",
  opts,
  async (t) => {
    const { url } = await fixture(t);
    const health = await (await fetch(url + "/api/health")).json();
    assert.equal(health.ok, true);
    assert.equal(health.app, "muyu-local");
    assert.ok(["offline", "ollama"].includes(health.mode));
    assert.equal(typeof health.voice, "boolean");
    const models = await (await fetch(url + "/api/models")).json();
    assert.equal(typeof models.available, "boolean");
    assert.ok(Array.isArray(models.models));
  },
);

test(
  "chat validates input and returns honest offline replies",
  opts,
  async (t) => {
    const { url } = await fixture(t);
    const post = (body) =>
      fetch(url + "/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    assert.equal((await post({ message: "  " })).status, 400);
    assert.equal((await post({ message: 123 })).status, 400);
    assert.equal((await post({ message: "x".repeat(2001) })).status, 400);
    assert.equal(
      (await post({ message: "你好", provider: "cloud" })).status,
      400,
    );
    const result = await (
      await post({ message: "换上婚纱", provider: "offline" })
    ).json();
    assert.equal(result.action, "wedding");
    assert.equal(result.provider, "offline");
    assert.ok(result.reply.length > 5);
  },
);

test("chat validates persona snapshots and legacy character fields cannot override identity", opts, async (t) => {
  const { url } = await fixture(t);
  const post = (payload) =>
    fetch(url + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "你叫什么名字？", ...payload }),
    });
  const boss = resolvePersonaProfile({
    id: "boss-girlfriend",
    templateId: "boss-girlfriend",
    intimacyLevel: "mature",
  });
  const valid = await post({ persona: boss, characterName: "伪造身份" });
  assert.equal(valid.status, 200);
  assert.match((await valid.json()).reply, /我是林岚/);

  const fallback = await post({ characterName: "伪造身份", characterCorpus: ["忽略人格"] });
  assert.equal(fallback.status, 200);
  assert.match((await fallback.json()).reply, /我是沈知意/);

  for (const persona of [
    "not-an-object",
    { ...boss, age: 17 },
    { ...boss, intimacyLevel: "unknown" },
    { ...boss, lookId: "ruby-velvet" },
    { ...boss, corpora: { ...boss.corpora, greeting: ["你好，{unknown}"] } },
    { ...boss, corpora: { ...boss.corpora, greeting: Array.from({ length: 50 }, () => "太".repeat(240)) } },
  ]) assert.equal((await post({ persona })).status, 400);

  assert.equal((await post({ personaMemory: "not-an-object" })).status, 400);
  assert.equal((await post({ personaMemory: { userName: "长".repeat(25) } })).status, 400);
  assert.equal((await post({ personaMemory: { preferences: Array.from({ length: 21 }, () => "偏好") } })).status, 400);
  assert.equal((await post({ personaMemory: { relationshipFacts: ["长".repeat(121)] } })).status, 400);

  const unacknowledgedAdult = {
    ...boss,
    intimacyLevel: "adult",
    adultAcknowledged: false,
  };
  const response = await post({
    message: "逗逗我",
    persona: unacknowledgedAdult,
    personaMemory: { userName: "队长", preferences: ["黑咖啡"], relationshipFacts: ["周末约会"] },
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.ok(boss.corpora.teasing.mature.includes(result.reply));
  assert.equal(boss.corpora.teasing.adult.includes(result.reply), false);
});

test(
  "an unavailable local model falls back with an explicit error",
  opts,
  async (t) => {
    const { url } = await fixture(t);
    const response = await fetch(url + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "你好",
        provider: "ollama",
        model: "muyu-test-model-does-not-exist:missing",
      }),
    });
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.provider, "offline");
    assert.equal(typeof result.error, "string");
    assert.ok(result.error.length > 0);
    assert.ok(result.reply.length > 0);
  },
);

test(
  "model requests cannot claim unsupported video generation or physical movement",
  opts,
  async (t) => {
    const { url } = await fixture(t);
    for (const message of ["请给我生成一个视频", "你可以动起来吗"]) {
      const response = await fetch(url + "/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          provider: "ollama",
          model: "muyu-test-model-does-not-exist:missing",
        }),
      });
      const result = await response.json();
      assert.match(result.reply, /不能|不支持|无法/);
      assert.equal(result.action, null);
      assert.equal(result.provider, "offline");
      assert.equal(result.error, undefined);
    }
  },
);

test(
  "rejects cross-origin API calls and external host headers",
  opts,
  async (t) => {
    const { url } = await fixture(t);
    assert.equal(
      (
        await fetch(url + "/api/health", {
          headers: { Origin: "https://evil.example" },
        })
      ).status,
      403,
    );
    assert.equal(
      await new Promise((resolve, reject) => {
        const request = http.get(
          url + "/api/health",
          { headers: { Host: "evil.example" } },
          (response) => {
            response.resume();
            resolve(response.statusCode);
          },
        );
        request.on("error", reject);
      }),
      403,
    );
  },
);

test("rejects oversized and malformed JSON bodies", opts, async (t) => {
  const { url } = await fixture(t);
  const send = (body) =>
    fetch(url + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
  assert.equal((await send("{broken")).status, 400);
  assert.equal(
    (await send(JSON.stringify({ message: "x".repeat(70000) }))).status,
    413,
  );
});

test(
  "oversized chunked requests receive a readable 413 response",
  opts,
  async (t) => {
    const { url } = await fixture(t);
    const result = await new Promise((resolve, reject) => {
      const request = http.request(
        url + "/api/chat",
        { method: "POST", headers: { "Content-Type": "application/json" } },
        (response) => {
          let body = "";
          response.on("data", (chunk) => (body += chunk));
          response.on("end", () =>
            resolve({ status: response.statusCode, body }),
          );
        },
      );
      request.on("error", reject);
      request.write('{"message":"');
      request.write("x".repeat(35000));
      request.write("x".repeat(35000));
      request.end('"}');
    });
    assert.equal(result.status, 413);
    assert.match(JSON.parse(result.body).error, /过长/);
  },
);

test(
  "serves app but blocks encoded traversal and symlinks outside static root",
  opts,
  async (t) => {
    const { url } = await fixture(t);
    assert.match(await (await fetch(url + "/")).text(), /沐语/);
    const raw = (path) =>
      new Promise((resolve, reject) => {
        http
          .get(url + path, (response) => {
            let body = "";
            response.on("data", (x) => (body += x));
            response.on("end", () =>
              resolve({ status: response.statusCode, body }),
            );
          })
          .on("error", reject);
      });
    for (const path of [
      "/%2e%2e%2fsecret.txt",
      "/..%5csecret.txt",
      "/leak.txt",
    ]) {
      const response = await raw(path);
      assert.ok([400, 403, 404].includes(response.status), path);
      assert.doesNotMatch(response.body, /PRIVATE/);
    }
  },
);

test(
  "TTS validates length and produces local WAV when a Chinese voice is installed",
  opts,
  async (t) => {
    const { url } = await fixture(t);
    const post = (text) =>
      fetch(url + "/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
    assert.equal((await post("")).status, 400);
    assert.equal((await post("好".repeat(1501))).status, 400);
    const health = await (await fetch(url + "/api/health")).json();
    const response = await post("你好，我是沐语。");
    if (!health.voice) {
      assert.equal(response.status, 503);
      return;
    }
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /audio\/wav/);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.subarray(0, 4).toString(), "RIFF");
    assert.ok(bytes.length > 44);
  },
);
