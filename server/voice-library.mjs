import {
  mkdir,
  readFile,
  writeFile,
  rename,
  rm,
  readdir,
  mkdtemp,
} from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
const fail = (message, status = 400) =>
  Object.assign(new Error(message), { status });
const validId = (id) => id === "builtin" || /^[0-9a-f-]{36}$/.test(id || "");
const cleanName = (name) => {
  if (typeof name !== "string" || !name.trim() || name.trim().length > 32)
    throw fail("音色名称需要为1至32字。");
  return name.trim();
};
export function validateReference(audio) {
  if (
    typeof audio !== "string" ||
    audio.length > 1300000 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(audio)
  )
    throw fail("请导入有效录音片段。");
  const b = Buffer.from(audio, "base64");
  if (
    b.length < 44 ||
    b.toString("ascii", 0, 4) !== "RIFF" ||
    b.toString("ascii", 8, 16) !== "WAVEfmt " ||
    b.readUInt32LE(16) !== 16 ||
    b.readUInt16LE(20) !== 1 ||
    b.readUInt16LE(22) !== 1 ||
    b.readUInt32LE(24) !== 24000 ||
    b.readUInt16LE(32) !== 2 ||
    b.readUInt16LE(34) !== 16 ||
    b.toString("ascii", 36, 40) !== "data" ||
    b.readUInt32LE(40) !== b.length - 44 ||
    b.readUInt32LE(4) !== b.length - 8 ||
    (b.length - 44) % 2
  )
    throw fail("录音需要为24kHz单声道 WAV，请重新选择文件。");
  const duration = (b.length - 44) / 48000;
  if (duration < 3 || duration > 20)
    throw fail("请选择3至20秒的完整说话片段。");
  let power = 0;
  for (let i = 44; i < b.length; i += 2)
    power += (b.readInt16LE(i) / 32768) ** 2;
  if (Math.sqrt(power / ((b.length - 44) / 2)) < 0.001)
    throw fail("这段录音接近静音，请选择有人说话的片段。");
  return { buffer: b, duration };
}
export function createVoiceLibrary({ directory, builtinRoot, transcribe }) {
  let tail = Promise.resolve();
  const serial = (fn) => {
    const p = tail.then(fn);
    tail = p.catch(() => {});
    return p;
  };
  const root = (id) => {
    if (!validId(id)) throw fail("音色不存在。", 404);
    return id === "builtin" ? builtinRoot : join(directory, id);
  };
  async function profile(id) {
    if (id === "builtin")
      return {
        id,
        name: "原始参考音色",
        builtin: true,
        referenceDuration: 5.4,
      };
    try {
      return {
        ...JSON.parse(await readFile(join(root(id), "profile.json"), "utf8")),
        id,
        builtin: false,
      };
    } catch (e) {
      throw fail("音色不存在。", 404);
    }
  }
  async function selected() {
    try {
      const id = JSON.parse(
        await readFile(join(directory, "selected.json"), "utf8"),
      ).id;
      await profile(id);
      return id;
    } catch {
      return "builtin";
    }
  }
  async function atomic(file, value) {
    const tmp = file + "." + randomUUID() + ".tmp";
    await writeFile(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
    await rename(tmp, file);
  }
  async function list() {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const voices = [await profile("builtin")];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && validId(entry.name)) {
        try {
          voices.push(await profile(entry.name));
        } catch {}
      }
    }
    return {
      selectedId: await selected(),
      voices: voices.map(
        ({ id, name, builtin, referenceDuration, createdAt }) => ({
          id,
          name,
          builtin,
          duration: referenceDuration,
          createdAt,
        }),
      ),
    };
  }
  return {
    list: () => serial(list),
    resolve: (id) => serial(async () => ({ ...(await profile(id)), root: root(id) })),
    current: () =>
      serial(async () => {
        const id = await selected();
        return { ...(await profile(id)), root: root(id) };
      }),
    add: (input, { signal } = {}) =>
      serial(async () => {
        const name = cleanName(input.name);
        const { buffer, duration } = validateReference(input.audio);
        let text = input.referenceText;
        if (text != null && typeof text !== "string")
          throw fail("台词格式不正确。");
        text = (text || "").trim();
        if (text.length > 500) throw fail("参考台词最多500字。");
        await mkdir(directory, { recursive: true, mode: 0o700 });
        const temp = await mkdtemp(join(directory, ".import-"));
        try {
          await writeFile(join(temp, "reference.wav"), buffer, { mode: 0o600 });
          if (!text) {
            if (!transcribe)
              throw fail("自动识别不可用，请填写录音台词。", 503);
            text = (
              await transcribe(join(temp, "reference.wav"), { signal })
            ).trim();
          }
          if (!text || text.length > 500)
            throw fail("未识别到清晰台词，请手动填写后重试。");
          if (signal?.aborted) throw fail("制作已取消。", 499);
          const id = randomUUID();
          const item = {
            id,
            name,
            referenceText: text,
            referenceDuration: duration,
            createdAt: new Date().toISOString(),
            version: 1,
          };
          await writeFile(
            join(temp, "profile.json"),
            JSON.stringify(item, null, 2),
            { mode: 0o600 },
          );
          await rename(temp, root(id));
          return item;
        } finally {
          await rm(temp, { recursive: true, force: true });
        }
      }),
    select: (id) =>
      serial(async () => {
        await profile(id);
        await mkdir(directory, { recursive: true });
        await atomic(join(directory, "selected.json"), { id });
        return list();
      }),
    rename: (id, name) =>
      serial(async () => {
        if (id === "builtin") throw fail("内置音色不能改名。");
        const item = await profile(id);
        item.name = cleanName(name);
        await atomic(join(root(id), "profile.json"), item);
        return list();
      }),
    remove: (id) =>
      serial(async () => {
        if (id === "builtin") throw fail("内置音色保留为默认声音。");
        await profile(id);
        if ((await selected()) === id)
          await atomic(join(directory, "selected.json"), { id: "builtin" });
        await rm(root(id), { recursive: true });
        return list();
      }),
  };
}
