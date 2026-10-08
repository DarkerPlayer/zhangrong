import { test, after } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { getLook } from "../server/looks.mjs";
import { AUTHORED_ACTIONS } from "../server/authored-actions.mjs";

const dom = new JSDOM("<html><body></body></html>", { url: "http://localhost:4317" });
for (const name of ["window", "document", "navigator", "HTMLElement"]) {
  Object.defineProperty(globalThis, name, { value: dom.window[name], configurable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.Image = class { naturalWidth = 128; naturalHeight = 192; async decode() {} };
globalThis.ResizeObserver = class { observe() {} disconnect() {} };
dom.window.HTMLCanvasElement.prototype.getContext = () => ({
  drawImage() {}, getImageData: () => ({ data: new Uint8Array(128 * 192 * 4) }),
});
const temporary = await mkdtemp(path.join(process.cwd(), "node_modules/.spit-test-"));
// Stub only GPU and audio hardware. The renderer, resource loading, controller,
// frame sampler, menu, and cancellation behavior execute their real code.
const gpu = `
  export const install = () => {};
  export const SCALE_MODES = { LINEAR: 1, NEAREST: 0 };
  const texture = () => ({ baseTexture: {}, destroy() { this.destroyed = true; } });
  export const Texture = { from: texture, fromBuffer: texture };
  export const Program = { from: () => ({}) };
  export class MeshMaterial { constructor(texture, options) { this.texture = texture; Object.assign(this, options); } }
  export class PlaneGeometry {
    constructor(w, h) { this.buffer = { data: new Float32Array([w * .5, h * .13]), update() {} }; }
    getBuffer() { return this.buffer; }
  }
  export class Mesh {
    alpha = 1; visible = true;
    constructor(geometry, material) {
      Object.assign(this, { geometry, material });
      this.scale = { x: 1, y: 1, set(x, y) { this.x = x; this.y = y; } };
      this.position = { x: 0, y: 0, set(x, y) { this.x = x; this.y = y; } };
    }
  }
  export class Application {
    constructor() {
      this.stage = { children: [], addChild(...items) { this.children.push(...items); } };
      this.screen = { width: 300, height: 400 }; this.renderer = { resize() {} };
      this.ticker = { deltaMS: 50, add: callback => { this.tick = callback; } };
      globalThis.__spitApps.push(this);
    }
    render() {} start() {} stop() {} destroy() { this.destroyed = true; }
  }
`;
await build({
  entryPoints: ["src/GlamPet.jsx", "src/LookActionMenu.jsx"], outdir: temporary, bundle: true,
  platform: "node", format: "cjs", outExtension: { ".js": ".cjs" }, loader: { ".css": "empty" },
  external: ["react", "react-dom", "react/jsx-runtime"],
  plugins: [{ name: "hardware-boundary", setup(b) {
    b.onResolve({ filter: /^(pixi\.js|@pixi\/unsafe-eval)$/ }, () => ({ path: "gpu", namespace: "test" }));
    b.onResolve({ filter: /^\.\/audio\.js$/ }, () => ({ path: "audio", namespace: "test" }));
    b.onLoad({ filter: /.*/, namespace: "test" }, ({ path }) => ({
      contents: path === "gpu" ? gpu : "export const getSpeechLevel = () => 0.8;", loader: "js",
    }));
  } }],
});
const React = await import("react");
const { render, cleanup, fireEvent, waitFor } = await import("@testing-library/react");
const require = createRequire(import.meta.url);
const GlamPet = require(path.join(temporary, "GlamPet.cjs")).default;
const LookActionMenu = require(path.join(temporary, "LookActionMenu.cjs")).default;
after(async () => { cleanup(); dom.window.close(); await rm(temporary, { recursive: true, force: true }); });

test("the shared main-window and desktop action menu offers spit only for loaded action metadata", () => {
  const selections = [];
  const ui = render(React.createElement(LookActionMenu, { look: getLook("fancha-rose-office"), onSelect: kind => selections.push(kind) }));
  try {
    fireEvent.click(ui.getByRole("button"));
    fireEvent.click(ui.getByRole("menuitem", { name: "吐口水" }));
    assert.deepEqual(selections, ["spit"]);
    ui.rerender(React.createElement(LookActionMenu, { look: getLook("ruby-velvet"), onSelect() {} }));
    fireEvent.click(ui.getByRole("button"));
    assert.equal(ui.queryByRole("menuitem", { name: "吐口水" }), null);
    ui.rerender(React.createElement(LookActionMenu, { look: { actions: { spit: [] } }, onSelect() {} }));
    assert.equal(ui.queryByRole("menuitem", { name: "吐口水" }), null);
  } finally { cleanup(); }
});

test("Songyu menu exposes its nine independent actions and removes them on an unfitted look", () => {
  const look = getLook("songyu-azure-robes");
  const selections = [];
  const ui = render(React.createElement(LookActionMenu, {look,onSelect:kind=>selections.push(kind)}));
  try {
    fireEvent.click(ui.getByRole("button"));
    assert.equal(ui.getAllByRole("menuitem").length,12);
    fireEvent.click(ui.getByRole("menuitem",{name:"闭目打坐"}));
    assert.deepEqual(selections,["meditate"]);
    ui.rerender(React.createElement(LookActionMenu,{look:{...look,actions:null},onSelect(){}}));
    fireEvent.click(ui.getByRole("button"));
    assert.equal(ui.queryByRole("menuitem",{name:"闭目打坐"}),null);
  } finally {cleanup();}
});

test("all Songyu actions load sequentially, retain authored expression and finish once", async () => {
  globalThis.__spitApps = [];
  globalThis.fetch = async () => ({ ok: true, blob: async () => new Blob(), json: async () => ({}) });
  const look = getLook("songyu-azure-robes");
  const props = {lookId:look.id,appearance:look};
  const ui = render(React.createElement(GlamPet,props));
  try {
    await waitFor(() => assert.equal(ui.container.querySelector("canvas").dataset.ready,"true"));
    const app = globalThis.__spitApps[0];
    let nonce = 0;
    for (const {kind} of AUTHORED_ACTIONS) {
      ui.rerender(React.createElement(GlamPet,{...props,action:{kind,nonce:++nonce,args:{repeat:10,durationMs:90000}}}));
      await waitFor(() => assert.equal(ui.container.querySelector("canvas").dataset.action,kind));
      for (let i=0;i<18;i++) app.tick();
      const actionMesh = app.stage.children[2];
      assert.equal(actionMesh.alpha,1,kind);
      assert.equal(actionMesh.material.uniforms.uBlink,0,kind);
      for (let i=0;i<100;i++) app.tick();
      assert.equal(actionMesh.alpha,0,kind);
    }
  } finally {cleanup();delete globalThis.__spitApps;}
});

test("spit lazily renders its authored expression, stays bounded, and idle or look changes cancel loading", async () => {
  globalThis.__spitApps = [];
  const fetched = [], pending = [];
  let holdFrames = false;
  const response = () => ({ ok: true, blob: async () => new Blob(), json: async () => ({
    actionFaces: { spit: { x: 0.6, y: 0.15, radiusX: 0.16, radiusY: 0.08 } },
  }) });
  globalThis.fetch = async (url, { signal } = {}) => {
    fetched.push(url);
    if (holdFrames && url.includes("/actions/")) return new Promise(resolve => pending.push({ signal, resolve }));
    return response();
  };
  const look = getLook("fancha-rose-office");
  const props = { lookId: look.id, appearance: look, mood: "happy" };
  const ui = render(React.createElement(GlamPet, props));
  try {
    await waitFor(() => assert.equal(ui.container.querySelector("canvas").dataset.ready, "true"));
    assert.equal(fetched.filter(url => url.includes("/actions/")).length, 0);
    const app = globalThis.__spitApps[0];
    for (let i = 0; i < 80; i++) app.tick();
    ui.rerender(React.createElement(GlamPet, { ...props, action: { kind: "spit", nonce: 1, args: { durationMs: 90000, repeat: 20 } } }));
    await waitFor(() => assert.equal(ui.container.querySelector("canvas").dataset.action, "spit"));
    assert.equal(fetched.filter(url => url.includes("/actions/")).length, 3);
    for (let i = 0; i < 3; i++) app.tick();
    const [body, , action] = app.stage.children;
    assert.equal(action.alpha, 1);
    assert.equal(body.alpha, 0);
    assert.equal(action.material.uniforms.uStabilizeFace, 0, "do not replace pursed lips with the idle face");
    for (const key of ["uBlink", "uMouthOpen", "uSmile", "uBlush"]) assert.equal(action.material.uniforms[key], 0, key);
    for (let i = 0; i < 29; i++) app.tick();
    assert.equal(action.alpha, 0, "duration and repeat arguments cannot prolong this one-shot action");
    assert.equal(body.alpha, 1);
    ui.rerender(React.createElement(GlamPet, { ...props, action: { kind: "spit", nonce: 2 } }));
    app.tick();
    assert.equal(action.alpha, 1);
    ui.rerender(React.createElement(GlamPet, { ...props, action: { kind: "idle_neutral", nonce: 3 } }));
    app.tick();
    assert.equal(action.alpha, 0, "explicit idle cancels an active higher-priority gesture");
    const savedTexture = action.texture;
    ui.rerender(React.createElement(GlamPet, { lookId: "ruby-velvet" }));
    await waitFor(() => assert.equal(ui.container.querySelector("canvas").dataset.ready, "true"));
    assert.equal(savedTexture.destroyed, true);
    holdFrames = true;
    ui.rerender(React.createElement(GlamPet, { ...props, action: { kind: "spit", nonce: 4 } }));
    await waitFor(() => assert.equal(pending.length, 2));
    ui.rerender(React.createElement(GlamPet, { ...props, action: { kind: "idle_neutral", nonce: 5 } }));
    assert.ok(pending.every(request => request.signal.aborted));
    for (const request of pending) request.resolve(response());
    await waitFor(() => assert.equal(ui.container.querySelector("canvas").dataset.action, "idle_neutral"));
    pending.length = 0;
    ui.rerender(React.createElement(GlamPet, { ...props, action: { kind: "spit", nonce: 6 } }));
    await waitFor(() => assert.equal(pending.length, 2));
    ui.rerender(React.createElement(GlamPet, { lookId: "ruby-velvet" }));
    assert.ok(pending.every(request => request.signal.aborted));
    for (const request of pending) request.resolve(response());
    await waitFor(() => assert.equal(ui.container.querySelector("canvas").dataset.look, "ruby-velvet"));
  } finally { cleanup(); delete globalThis.__spitApps; }
});

test("spit fade sampling holds the resting portrait in place in both facing directions", async () => {
  globalThis.__spitApps = [];
  globalThis.fetch = async () => ({ ok: true, blob: async () => new Blob(), json: async () => ({}) });
  const look = getLook("fancha-rose-office");
  // Exercise horizontal compensation as well as this artwork's vertical
  // correction so mirrored playback cannot reverse the sampling offset.
  const appearance = { ...look, actions: { ...look.actions, spit: look.actions.spit.map(frame => ({
    ...frame, groundAnchor: [0.48, frame.groundAnchor[1]],
  })) } };
  const props = { lookId: look.id, appearance, motion: false };
  const ui = render(React.createElement(GlamPet, props));
  try {
    await waitFor(() => assert.equal(ui.container.querySelector("canvas").dataset.ready, "true"));
    const app = globalThis.__spitApps[0];
    const [body, , action] = app.stage.children;
    let nonce = 0;
    const assertRestingPosition = () => {
      const offset = action.material.uniforms.uBaseUvOffset || [0, 0];
      for (const [axis, pixel, size] of [["x", 64, 128], ["y", 1506 / 1536 * 192, 192]]) {
        const index = axis === "x" ? 0 : 1;
        const expected = body.position[axis] + pixel * body.scale[axis];
        const sampled = action.position[axis] + (pixel - offset[index] * size) * action.scale[axis];
        assert.ok(Math.abs(sampled - expected) < 1e-7,
          `resting ${axis} pixel must stay fixed during a fade: ${sampled} versus ${expected}`);
      }
      assert.deepEqual(Array.from(body.material.uniforms.uBaseUvOffset || []), [0, 0], "base materials stay independent");
      assert.equal(action.material.uniforms.uStabilizeFace, 0);
      assert.ok(action.material.uniforms.uBaseWeight > 0, "check a real entry/exit fade");
    };
    for (const direction of ["right", "left"]) {
      ui.rerender(React.createElement(GlamPet, { ...props, action: { kind: "wave", nonce: ++nonce, args: { direction } } }));
      ui.rerender(React.createElement(GlamPet, { ...props, action: { kind: "spit", nonce: ++nonce } }));
      await waitFor(() => assert.equal(ui.container.querySelector("canvas").dataset.action, "spit"));
      app.tick();
      assertRestingPosition();
      for (let i = 0; i < 30; i++) app.tick();
      assertRestingPosition();
      app.tick();
      assert.equal(action.alpha, 0);
      assert.deepEqual(Array.from(action.material.uniforms.uBaseUvOffset), [0, 0], "idle clears the compensation");
    }
  } finally { cleanup(); delete globalThis.__spitApps; }
});

test('Yinyue menu exposes sixteen cute gestures only for its matching look',()=>{
 const ui=render(React.createElement(LookActionMenu,{look:getLook('yinyue-silver-fox'),onSelect(){}}));
 try{
  fireEvent.click(ui.getByRole('button'));
  assert.equal(ui.getAllByRole('menuitem').length,19);
  for(const label of ['轻轻眨眼','左眼 Wink','狐爪卖萌','抱抱尾巴'])assert.ok(ui.getByRole('menuitem',{name:label}));
  ui.rerender(React.createElement(LookActionMenu,{look:getLook('ziling-violet-dress'),onSelect(){}}));
  assert.equal(ui.queryByRole('menuitem',{name:'狐爪卖萌'}),null);
 }finally{cleanup();}
});

test('Yinyue renderer runs independent wink eyelids, all six frame gestures, recovery and outfit switching',async()=>{
 globalThis.__spitApps=[];
 globalThis.fetch=async()=>({ok:true,blob:async()=>new Blob(),json:async()=>({})});
 const look=getLook('yinyue-silver-fox');const props={lookId:look.id,motion:false};
 const ui=render(React.createElement(GlamPet,props));
 try{
  await waitFor(()=>assert.equal(ui.container.querySelector('canvas').dataset.ready,'true'));
  const app=globalThis.__spitApps[0];const [body,,sprite]=app.stage.children;let nonce=0;
  ui.rerender(React.createElement(GlamPet,{...props,action:{kind:'cute_wink_left',nonce:++nonce}}));
  for(let i=0;i<16;i++)app.tick();
  assert.equal(body.material.uniforms.uBlinkL,0);
  assert.ok(body.material.uniforms.uBlinkR>.99);
  for(let i=0;i<35;i++)app.tick();
  assert.equal(body.material.uniforms.uBlinkR,0);
  for(const kind of Object.keys(look.actions)){
   ui.rerender(React.createElement(GlamPet,{...props,action:{kind,nonce:++nonce}}));
   await waitFor(()=>assert.equal(ui.container.querySelector('canvas').dataset.action,kind));
   for(let i=0;i<20;i++)app.tick();
   assert.ok(sprite.alpha>0,kind);
   assert.equal(sprite.material.uniforms.uMouthOpen,0,'preserve authored mouth/expression');
   assert.equal(sprite.material.uniforms.uBlinkL,0,'do not paint over authored eyes');
   for(let i=0;i<45;i++)app.tick();
   assert.equal(sprite.alpha,0,`${kind} returns to idle`);
  }
  ui.rerender(React.createElement(GlamPet,{...props,action:{kind:'cute_paws',nonce:++nonce}}));
  ui.rerender(React.createElement(GlamPet,{lookId:'ziling-violet-dress',motion:false}));
  await waitFor(()=>assert.equal(ui.container.querySelector('canvas').dataset.look,'ziling-violet-dress'));
  assert.equal(app.destroyed,true);
 }finally{cleanup();delete globalThis.__spitApps;}
});

test('hidden portrait releases gesture textures, borrows idle pixels once, and can play again on return', async () => {
 globalThis.__spitApps=[];
 const requests=[];
 globalThis.fetch=async url=>{requests.push(url);return {ok:true,blob:async()=>new Blob(),json:async()=>({})};};
 let hidden=false;
 Object.defineProperty(document,'hidden',{configurable:true,get:()=>hidden});
 const look=getLook('yinyue-silver-fox'), props={lookId:look.id,motion:false};
 const ui=render(React.createElement(GlamPet,props));
 try {
  await waitFor(()=>assert.equal(ui.container.querySelector('canvas').dataset.ready,'true'));
  const app=globalThis.__spitApps[0], [body,,sprite]=app.stage.children;
  ui.rerender(React.createElement(GlamPet,{...props,action:{kind:'cute_heart',nonce:1}}));
  await waitFor(()=>assert.equal(ui.container.querySelector('canvas').dataset.action,'cute_heart'));
  for(let i=0;i<20;i++)app.tick();
  const poseTexture=sprite.texture;
  assert.equal(requests.filter(url=>url===look.asset).length,1,'prepare/recover reuse the already decoded portrait');
  assert.notEqual(poseTexture,body.material.texture);
  hidden=true;document.dispatchEvent(new window.Event('visibilitychange'));
  assert.equal(poseTexture.destroyed,true);
  assert.notEqual(body.material.texture.destroyed,true,'clearing an action must retain borrowed idle texture');
  assert.equal(sprite.alpha,0);
  hidden=false;document.dispatchEvent(new window.Event('visibilitychange'));
  ui.rerender(React.createElement(GlamPet,{...props,action:{kind:'cute_heart',nonce:2}}));
  await waitFor(()=>assert.equal(ui.container.querySelector('canvas').dataset.actionLoading,''));
  await waitFor(()=>assert.equal(ui.container.querySelector('canvas').dataset.action,'cute_heart'));
  for(let i=0;i<20;i++)app.tick();
  assert.notEqual(sprite.texture,poseTexture);
  assert.notEqual(sprite.texture.destroyed,true);
 } finally { cleanup();delete document.hidden;delete globalThis.__spitApps; }
});
