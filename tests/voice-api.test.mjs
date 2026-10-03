import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startServer } from "../server/index.mjs";

test("TTS rejects unknown preview profiles before opening a stream and preserves library selection", async t => {
  const directory = await mkdtemp(join(tmpdir(), "muyu-preview-api-"));
  const site = join(directory,"site");
  await mkdir(site);
  await writeFile(join(site,"index.html"),"<h1>preview</h1>");
  const app = await startServer({port:0,prewarm:false,staticDir:site,voiceDirectory:join(directory,"voices"),studioDirectory:join(directory,"studio")});
  t.after(async()=> {await app.close();await rm(directory,{recursive:true,force:true});});
  const url = `http://127.0.0.1:${app.port}`;
  const request = async profile => fetch(url+"/api/tts", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:"试听内容。",stream:true,voiceProfileId:profile})});
  const missing = await request("00000000-0000-0000-0000-000000000000");
  assert.equal(missing.status,404);
  assert.match((await missing.json()).error,/音色不存在/);
  assert.equal((await request({id:"builtin"})).status,400);
  assert.equal((await request("../escape")).status,404);
  const library = await (await fetch(url+"/api/voices")).json();
  assert.equal(library.selectedId,"builtin");
  assert.equal(library.voices.length,1);
});
