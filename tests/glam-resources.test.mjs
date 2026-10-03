import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { build } from "esbuild";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

async function renderer(t, responses = {}) {
  const dom = new JSDOM("<html><body></body></html>", { url: "http://localhost:4317", pretendToBeVisual: true });
  for (const name of ["window", "document", "navigator", "HTMLElement"]) {
    Object.defineProperty(globalThis, name, { value: dom.window[name], configurable: true });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.Image = class { naturalWidth = 128; naturalHeight = 192; async decode() {} };
  globalThis.ResizeObserver = class { observe() {} disconnect() {} };
  dom.window.HTMLCanvasElement.prototype.getContext = () => ({
    drawImage() {}, getImageData: () => ({ data: new Uint8Array(128 * 192 * 4) }),
  });
  const rig = JSON.parse(await readFile("public/looks/amara-ankara/rig.json", "utf8"));
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, signal: options.signal });
    return { ok: true, json: async () => rig, blob: () => responses[url]?.promise || Promise.resolve(new Blob([url])) };
  };
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  const urls = [], revoked = [];
  URL.createObjectURL = (blob) => { const url = originalCreate(blob); urls.push(url); return url; };
  URL.revokeObjectURL = (url) => { revoked.push(url); originalRevoke(url); };
  globalThis.__glamResourceTextures = [];
  globalThis.__glamResourceApps = [];
  const temporary = await mkdtemp(path.join(process.cwd(), "node_modules/.glam-resource-"));
  const bundle = path.join(temporary, "renderer.cjs");
  await build({
    entryPoints: ["src/GlamPet.jsx"], outfile: bundle, bundle: true,
    platform: "node", format: "cjs", loader: { ".css": "empty" },
    external: ["react", "react-dom", "react/jsx-runtime"],
    plugins: [{ name: "gpu-boundary", setup(b) {
      b.onResolve({ filter: /^(pixi\.js|@pixi\/unsafe-eval)$/ }, () => ({ path: "gpu", namespace: "test" }));
      b.onLoad({ filter: /.*/, namespace: "test" }, () => ({ contents: `
        export const install = () => {};
        export const SCALE_MODES = { LINEAR: 1, NEAREST: 0 };
        export const Texture = {
          from: () => {
            const texture = { baseTexture: {}, destroyed: false, destroy() { this.destroyed = true; } };
            globalThis.__glamResourceTextures.push(texture);
            return texture;
          },
          fromBuffer: () => ({ baseTexture: {}, destroy() {} }),
        };
        export const Program = { from: () => ({}) };
        export class MeshMaterial { constructor(texture, options) { this.texture = texture; Object.assign(this, options); } }
        export class PlaneGeometry {
          constructor(width, height) { this.buffer = { data: new Float32Array([width/2, height/2]), update() {} }; }
          getBuffer() { return this.buffer; }
        }
        export class Mesh {
          alpha = 1; visible = true;
          constructor(geometry, material) {
            Object.assign(this, { geometry, material });
            this.scale = { x: 1, y: 1, set(x,y) { this.x=x; this.y=y; } };
            this.position = { set() {} };
          }
          get texture() { return this.material.texture; }
          set texture(value) { this.material.texture = value; }
        }
        export class Application {
          constructor() {
            this.stage = { children: [], addChild(...items) { this.children.push(...items); } };
            this.screen = { width: 300, height: 400 };
            this.renderer = { resize() {} };
            this.ticker = { deltaMS: 64, add: (callback) => { this.tick = callback; } };
            globalThis.__glamResourceApps.push(this);
          }
          render() {} start() {} stop() {} destroy() {}
        }
      `, loader: "js" }));
    } }],
  });
  const React = await import("react");
  const { render, cleanup, waitFor, act } = await import("@testing-library/react");
  const GlamPet = createRequire(import.meta.url)(bundle).default;
  const appearance = {
    id: "resource-test", character: "Amara", asset: "/body.png", rig: "/rig.json",
    actions: { sexyWalk: ["/walk-1.png", "/walk-2.png"], squat: ["/squat.png"] },
  };
  let nonce = 0;
  const ui = render(React.createElement(GlamPet, { lookId: appearance.id, appearance }));
  t.after(async () => {
    Object.values(responses).forEach((response) => response.resolve(new Blob()));
    cleanup();
    await new Promise((resolve) => setImmediate(resolve));
    dom.window.close();
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    delete globalThis.__glamResourceTextures;
    delete globalThis.__glamResourceApps;
    await rm(temporary, { recursive: true, force: true });
  });
  return {
    ui, requests, urls, revoked, waitFor, act,
    textures: globalThis.__glamResourceTextures,
    ready: () => waitFor(() => assert.equal(ui.container.querySelector("canvas").dataset.ready, "true")),
    play: (kind) => ui.rerender(React.createElement(GlamPet, { lookId: appearance.id, appearance, action: { kind, nonce: ++nonce } })),
    tick: () => globalThis.__glamResourceApps[0].tick(),
    canvas: () => ui.container.querySelector("canvas"),
    stage: () => globalThis.__glamResourceApps[0].stage.children,
  };
}

test("idle characters fetch no action frames; the requested group plays only when complete", async (t) => {
  const late = deferred();
  const r = await renderer(t, { "/walk-2.png": late });
  await r.ready();
  assert.deepEqual(r.requests.map(({ url }) => url), ["/body.png", "/rig.json"]);
  r.play("sexyWalk");
  await r.waitFor(() => assert.equal(r.textures.length, 2));
  assert.notEqual(r.canvas().dataset.action, "walk_feminine", "incomplete groups must not start");
  assert.equal(r.requests.some(({ url }) => url === "/squat.png"), false);
  await r.act(async () => late.resolve(new Blob(["last frame"])));
  await r.waitFor(() => assert.equal(r.canvas().dataset.action, "walk_feminine"));
  r.tick();
  assert.equal(r.stage()[2].texture, r.textures[2], "64 ms selects the second authored 60 ms pose");
  r.ui.unmount();
  assert.ok(r.textures.every((texture) => texture.destroyed));
  assert.deepEqual(new Set(r.revoked), new Set(r.urls));
});

test("switching looks during action loading releases completed textures and creates no late image URLs", async (t) => {
  const late = deferred();
  const r = await renderer(t, { "/walk-2.png": late });
  await r.ready();
  r.play("sexyWalk");
  await r.waitFor(() => assert.equal(r.textures.length, 2));
  const urlCount = r.urls.length;
  r.ui.unmount();
  await r.act(async () => late.resolve(new Blob(["late pixels"])));
  assert.ok(r.requests.filter(({ url }) => url.startsWith("/walk")).every(({ signal }) => signal.aborted));
  assert.ok(r.textures.every((texture) => texture.destroyed));
  assert.equal(r.urls.length, urlCount, "a disposed look must never create an image URL from a late response");
  assert.deepEqual(new Set(r.revoked), new Set(r.urls));
});

test("a newer action cancels partial loading and late completion cannot replace it", async (t) => {
  const late = deferred();
  const r = await renderer(t, { "/walk-2.png": late });
  await r.ready();
  r.play("sexyWalk");
  await r.waitFor(() => assert.equal(r.textures.length, 2));
  const partial = r.textures[1];
  r.play("squat");
  await r.waitFor(() => assert.equal(r.canvas().dataset.action, "crouch_enter"));
  assert.equal(partial.destroyed, true);
  assert.ok(r.requests.filter(({ url }) => url.startsWith("/walk")).every(({ signal }) => signal.aborted));
  const urlCount = r.urls.length;
  await r.act(async () => late.resolve(new Blob(["obsolete walk"])));
  assert.equal(r.canvas().dataset.action, "crouch_enter");
  assert.equal(r.urls.length, urlCount);
  r.tick();
  assert.equal(r.stage()[2].texture, r.textures[2]);
});

test("a mesh gesture supersedes a pending full-body action", async (t) => {
  const late = deferred();
  const r = await renderer(t, { "/walk-2.png": late });
  await r.ready();
  r.play("sexyWalk");
  await r.waitFor(() => assert.equal(r.textures.length, 2));
  r.play("wave");
  assert.equal(r.canvas().dataset.action, "wave");
  await r.act(async () => late.resolve(new Blob(["obsolete walk"])));
  assert.equal(r.canvas().dataset.action, "wave");
  assert.equal(r.textures[1].destroyed, true);
});

test("idle expiry detaches action samplers, destroys textures, and reloads on next request", async (t) => {
  const r = await renderer(t);
  await r.ready();
  r.play("sexyWalk");
  await r.waitFor(() => assert.equal(r.canvas().dataset.action, "walk_feminine"));
  const frames = r.textures.slice(1);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  // A walking motion is finite; real ticks finish it and return to the idle mesh.
  for (let i = 0; i < 90; i++) r.tick();
  t.mock.timers.tick(29999);
  assert.ok(frames.every((texture) => !texture.destroyed));
  t.mock.timers.tick(1);
  assert.ok(frames.every((texture) => texture.destroyed));
  assert.equal(r.stage()[2].texture, r.textures[0]);
  assert.equal(r.stage()[2].material.uniforms.uNextSampler, r.textures[0]);
  t.mock.timers.reset();
  r.play("sexyWalk");
  await r.waitFor(() => assert.equal(r.textures.length, 5));
  assert.equal(r.requests.filter(({ url }) => url.startsWith("/walk")).length, 4);
  assert.equal(r.requests.some(({ url }) => url === "/squat.png"), false);
});

test("hidden windows release paused action frames and can play again when visible", async (t) => {
  const r = await renderer(t);
  await r.ready();
  r.play("sexyWalk");
  await r.waitFor(() => assert.equal(r.canvas().dataset.action, "walk_feminine"));
  const frames = r.textures.slice(1);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  Object.defineProperty(document, "hidden", { value: true, configurable: true });
  document.dispatchEvent(new window.Event("visibilitychange"));
  t.mock.timers.tick(30000);
  assert.ok(frames.every((texture) => texture.destroyed));
  assert.equal(r.stage()[2].material.uniforms.uNextSampler, r.textures[0]);
  Object.defineProperty(document, "hidden", { value: false, configurable: true });
  document.dispatchEvent(new window.Event("visibilitychange"));
  t.mock.timers.reset();
  r.play("sexyWalk");
  await r.waitFor(() => assert.equal(r.textures.length, 5));
  r.tick();
  assert.ok(!r.stage()[2].texture.destroyed);
});
