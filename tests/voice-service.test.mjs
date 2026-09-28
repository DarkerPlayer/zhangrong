import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const mod = await import("../server/voice.mjs");
test("configured reference voice cannot silently become a system voice when files are missing", async (t) => {
  assert.equal(typeof mod.createVoiceService, "function");
  const root = await mkdtemp(join(tmpdir(), "muyu-reference-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(
    join(root, "profile.json"),
    JSON.stringify({ referenceText: "你好", name: "private-filename" }),
  );
  const service = mod.createVoiceService({ runtimeRoot: root });
  t.after(() => service.close());
  const info = await service.info();
  assert.equal(info.mode, "reference");
  assert.equal(info.available, false);
  assert.equal(info.name, "参考音色");
  await assert.rejects(service.synthesize("你好"), /参考音色/);
  assert.ok(!JSON.stringify(info).includes(root));
});
