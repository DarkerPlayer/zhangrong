import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { build } from "esbuild";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { resolveWardrobeAppearance } from "../server/wardrobe.mjs";
import { normalizeRig, fitGlamModel } from "../src/glam-motion.mjs";

test("same-character shoe swaps create a fresh canvas rather than reusing a destroyed WebGL context", async () => {
  const dom = new JSDOM("<html><body></body></html>", { url: "http://localhost:4317" });
  for (const name of ["window", "document", "navigator", "HTMLElement"]) {
    Object.defineProperty(globalThis, name, { value: dom.window[name], configurable: true });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  // Keep GPU/network initialization pending; exercise the real renderer's DOM
  // ownership on replacement, without requiring a WebGL implementation in JSDOM.
  globalThis.fetch = () => new Promise(() => {});
  const temporary = await mkdtemp(path.join(process.cwd(), "node_modules/.glam-test-"));
  const bundle = path.join(temporary, "renderer.cjs");
  await build({
    entryPoints: ["src/GlamPet.jsx"], outfile: bundle, bundle: true,
    platform: "node", format: "cjs", loader: { ".css": "empty" },
    external: ["react", "react-dom", "react/jsx-runtime"],
    plugins: [{ name: "gpu-boundary", setup(b) {
      b.onResolve({ filter: /^(pixi\.js|@pixi\/unsafe-eval)$/ }, () => ({ path: "gpu", namespace: "test" }));
      b.onLoad({ filter: /.*/, namespace: "test" }, () => ({ contents: "export const install = () => {};", loader: "js" }));
    } }],
  });
  const React = await import("react");
  const { render, cleanup } = await import("@testing-library/react");
  const GlamPet = createRequire(import.meta.url)(bundle).default;
  try {
    const heels = resolveWardrobeAppearance("xuanling-golden-crown", { shoes: "black-pointed-heels" });
    const slippers = resolveWardrobeAppearance("xuanling-golden-crown", { shoes: "ivory-soft-slippers" });
    const ui = render(React.createElement(GlamPet, { lookId: heels.id, appearance: heels }));
    const initialCanvas = ui.container.querySelector("canvas");
    ui.rerender(React.createElement(GlamPet, { lookId: slippers.id, appearance: slippers }));
    const fittedCanvas = ui.container.querySelector("canvas");
    assert.notEqual(initialCanvas, fittedCanvas);
    assert.equal(initialCanvas.isConnected, false);
    ui.rerender(React.createElement(GlamPet, { lookId: slippers.id, appearance: slippers, mood: "happy" }));
    assert.equal(ui.container.querySelector("canvas"), fittedCanvas, "mood changes keep the live canvas");
  } finally {
    cleanup();
    dom.window.close();
    await rm(temporary, { recursive: true, force: true });
  }
});

for (const { mouthCovered, homeFraming } of [{ mouthCovered: false }, { mouthCovered: true }, { mouthCovered: false, homeFraming: 'full-body' }]) {
test(`connected artwork preserves body and face motion (veil: ${mouthCovered}, home: ${homeFraming || 'default'})`, async () => {
  const dom = new JSDOM("<html><body></body></html>", { url: "http://localhost:4317" });
  for (const name of ["window", "document", "navigator", "HTMLElement"]) {
    Object.defineProperty(globalThis, name, { value: dom.window[name], configurable: true });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const rig = JSON.parse(await readFile("public/looks/linwei-white-bikini/rig.json", "utf8"));
  rig.mouthCovered = mouthCovered;
  if (homeFraming) rig.homeFraming = homeFraming;
  Object.defineProperty(dom.window.HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 700 });
  Object.defineProperty(dom.window.HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 790 });
  globalThis.fetch = async () => ({ ok: true, blob: async () => new Blob(), json: async () => rig });
  globalThis.Image = class { naturalWidth = 128; naturalHeight = 192; async decode() {} };
  globalThis.ResizeObserver = class { observe() {} disconnect() {} };
  const pixels = new Uint8Array(128 * 192 * 4);
  for (let y = 30; y < 115; y++) {
    for (let x = 45; x < 94; x++) pixels[(y * 128 + x) * 4 + 3] = 255;
  }
  dom.window.HTMLCanvasElement.prototype.getContext = () => ({
    drawImage() {}, getImageData: () => ({ data: pixels }),
  });
  const temporary = await mkdtemp(path.join(process.cwd(), "node_modules/.glam-test-"));
  const bundle = path.join(temporary, "renderer.cjs");
  globalThis.__glamRenderApps = [];
  // These are only the GPU boundary: the component, motion controller, alpha
  // analysis, material configuration, and geometry updates all execute normally.
  const gpu = `
    export const install = () => {};
    export const SCALE_MODES = { LINEAR: 1, NEAREST: 0 };
    export const Texture = {
      from: () => ({ baseTexture: {}, destroy() {} }),
      fromBuffer: () => ({ baseTexture: {}, destroy() {} }),
    };
    export const Program = { from: (vertex, fragment) => ({ vertex, fragment }) };
    export class MeshMaterial {
      constructor(texture, options) { this.texture = texture; Object.assign(this, options); }
    }
    export class PlaneGeometry {
      constructor(width, height) {
        this.buffer = { data: new Float32Array([width * .5, height * .13, width * .7, height * .4]), update() {} };
      }
      getBuffer() { return this.buffer; }
    }
    export class Mesh {
      alpha = 1; visible = true;
      constructor(geometry, material) {
        Object.assign(this, { geometry, material });
        this.scale = { x: 1, y: 1, set(x,y) { this.x=x; this.y=y; } };
        this.position = { x: 0, y: 0, set(x,y) { this.x=x; this.y=y; } };
      }
    }
    export class Application {
      constructor() {
        this.stage = { children: [], addChild(...items) { this.children.push(...items); } };
        this.screen = { width: 300, height: 400 };
        this.renderer = { resize() {} };
        this.ticker = { deltaMS: 64, add: (callback) => { this.tick = callback; } };
        globalThis.__glamRenderApps.push(this);
      }
      render() {} start() {} stop() {} destroy() {}
    }
  `;
  await build({
    entryPoints: ["src/GlamPet.jsx"], outfile: bundle, bundle: true,
    platform: "node", format: "cjs", loader: { ".css": "empty" },
    external: ["react", "react-dom", "react/jsx-runtime"],
    plugins: [{ name: "gpu-boundary", setup(b) {
      b.onResolve({ filter: /^(pixi\.js|@pixi\/unsafe-eval)$/ }, () => ({ path: "gpu", namespace: "test" }));
      b.onLoad({ filter: /.*/, namespace: "test" }, () => ({ contents: gpu, loader: "js" }));
      b.onResolve({ filter: /audio\.js$/ }, () => ({path: "audio", namespace: "speech"}));
      b.onLoad({ filter: /.*/, namespace: "speech" }, () => ({contents: "export const getSpeechLevel = () => 0.8;", loader: "js"}));
    } }],
  });
  const React = await import("react");
  const { render, cleanup, waitFor } = await import("@testing-library/react");
  const GlamPet = createRequire(import.meta.url)(bundle).default;
  try {
    const appearance = { id: "connected-test", character: "Linwei", asset: "/connected.png", rig: "/rig.json" };
    const ui = render(React.createElement(GlamPet, {
      lookId: appearance.id, appearance, action: { kind: "wave", nonce: 1 },
    }));
    await waitFor(() => assert.equal(ui.container.querySelector("canvas").dataset.ready, "true"));
    const app = globalThis.__glamRenderApps[0];
    const initialCanvas = ui.container.querySelector('canvas');
    const expected = fitGlamModel(700, 790, 128, 192, homeFraming === 'full-body', normalizeRig(rig));
    assert.equal(initialCanvas.dataset.framing, homeFraming || 'portrait');
    assert.equal(app.stage.children[0].scale.y, expected.scale);
    assert.equal(ui.container.querySelector('.glam-pet').classList.contains('pet-mode'), false, 'home full-body framing must not enable desktop pet mode');
    ui.rerender(React.createElement(GlamPet, { lookId: appearance.id, appearance, action: { kind: 'wave', nonce: 1 }, petMode: true }));
    assert.equal(initialCanvas.dataset.framing, 'full-body');
    assert.equal(app.stage.children[0].scale.y, fitGlamModel(700, 790, 128, 192, true, normalizeRig(rig)).scale);
    ui.rerender(React.createElement(GlamPet, { lookId: appearance.id, appearance, action: { kind: 'wave', nonce: 1 }, petMode: false }));
    assert.equal(ui.container.querySelector('canvas'), initialCanvas);
    assert.equal(initialCanvas.dataset.framing, homeFraming || 'portrait');
    assert.equal(app.stage.children[0].scale.y, expected.scale);
    for (let i = 0; i < 65; i++) app.tick();
    const canvas = ui.container.querySelector("canvas");
    const [body, arm] = app.stage.children;
    assert.equal(body.material.uniforms.uUseArmMask, 0, "the body texture must retain every garment and finger pixel");
    assert.equal(arm.visible, false, "a second copy must never ghost on top of the intact body");
    assert.equal(canvas.dataset.armLayerMode, "joined-body");
    assert.equal(canvas.dataset.armAngle, "0.000");
    assert.ok(body.material.uniforms.uBlink > 0.9);
    if (mouthCovered) {
      assert.equal(body.material.uniforms.uMouthOpen, 0, "speech must not distort the veil");
      assert.equal(body.material.uniforms.uBlush, 0, "blush must not repaint the veil");
    } else {
      assert.ok(body.material.uniforms.uMouthOpen > 0.1 && body.material.uniforms.uMouthOpen <= 0.175, "speech preserves the reference mouth proportions with a small response");
    }
    assert.equal(body.material.uniforms.uSmile, 0, "generic smile colouring must not repaint the reference face");
    assert.equal(body.material.uniforms.uBlush, 0, "generic blush must not repaint source skin and shading");
    assert.ok(Math.abs(Number(canvas.dataset.breath)) > 0.001);
    assert.notEqual(body.geometry.buffer.data[0], 64, "the head still moves");
  } finally {
    cleanup();
    dom.window.close();
    delete globalThis.__glamRenderApps;
    await rm(temporary, { recursive: true, force: true });
  }
});

}
