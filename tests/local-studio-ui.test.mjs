import { test, beforeEach, afterEach, after } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { restoreState } from "../src/state.mjs";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost:4317",
});
for (const name of [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "Event",
  "MouseEvent",
  "File",
  "FileReader",
  "Image",
  "localStorage",
])
  Object.defineProperty(globalThis, name, {
    value: dom.window[name],
    configurable: true,
    writable: true,
  });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = await import("react");
const { render, fireEvent, cleanup, act, waitFor } =
  await import("@testing-library/react");
const temporary = await mkdtemp(
  path.join(process.cwd(), "node_modules/.local-studio-ui-"),
);
const bundle = path.join(temporary, "studio.cjs");
await build({
  entryPoints: ["src/LocalStudio.jsx"],
  outfile: bundle,
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["react", "react-dom", "react/jsx-runtime"],
  loader: { ".css": "empty" },
});
const LocalStudio = createRequire(import.meta.url)(bundle).default;
const appBundle = path.join(temporary, "app.cjs");
await build({
  entryPoints: ["src/App.jsx"],
  outfile: appBundle,
  bundle: true,
  platform: "node",
  format: "cjs",
  define: { "import.meta.env.DEV": "true" },
  external: ["react", "react-dom", "react/jsx-runtime"],
  loader: { ".css": "empty" },
  plugins: [
    {
      name: "studio-app-native-boundaries",
      setup(builder) {
        builder.onResolve(
          { filter: /^\.\/(LivePet\.jsx|audio\.js|media\.mjs)$/ },
          (args) => ({ path: args.path, namespace: "studio-app-test" }),
        );
        builder.onLoad(
          { filter: /.*/, namespace: "studio-app-test" },
          (args) => ({
            contents: args.path.endsWith("LivePet.jsx")
              ? "import React from 'react';export default function LivePet({lookId,appearance}){return React.createElement('div',{'data-testid':'studio-current-look','data-look':lookId,'data-asset':appearance?.asset})}"
              : args.path.endsWith("audio.js")
                ? "export async function speak(){} export function stopSpeech(){} export async function setRain(){}"
                : "export async function readMedia(){return null} export async function saveMedia(){}",
            loader: "js",
          }),
        );
      },
    },
  ],
});
const App = createRequire(import.meta.url)(appBundle).default;
dom.window.HTMLElement.prototype.scrollIntoView = function () {};
const rig = {
  head: { x: 0.5, y: 0.12 },
  eyes: [
    { x: 0.47, y: 0.11 },
    { x: 0.53, y: 0.11 },
  ],
  mouth: { x: 0.5, y: 0.15 },
  shoulders: { left: [0.37, 0.22], right: [0.63, 0.22] },
};
const ready = {
  state: "ready",
  ready: true,
  model: "FLUX.2 Klein 4B",
  message: "本地生成已就绪",
};
let snapshot, posts, imported, getError;
const response = (value, ok = true, status = 200) => ({
  ok,
  status,
  json: async () => value,
});
beforeEach(() => {
  localStorage.clear();
  snapshot = {
    runtime: ready,
    jobs: [],
    activeJob: null,
    catalog: { looks: [], items: [], fits: [] },
  };
  posts = [];
  imported = [];
  getError = null;
  globalThis.fetch = async (url, options = {}) => {
    if (url === "/api/voices")
      return response({
        voices: [{ id: "builtin", name: "原始参考音色", builtin: true }],
        selectedId: "builtin",
      });
    if (url === "/api/health") return response({ ok: true });
    if (url === "/api/models") return response({ models: [] });
    if (!options.method || options.method === "GET") {
      if (getError) return response({ error: getError }, false, 500);
      return response(snapshot);
    }
    const payload = JSON.parse(options.body);
    posts.push({ url, payload });
    if (url === "/api/studio/setup") {
      snapshot = {
        ...snapshot,
        runtime: {
          state: "installing",
          ready: false,
          message: "正在下载本地模型",
        },
        activeJob: {
          id: "setup",
          kind: "setup",
          status: "running",
          message: "正在下载本地模型",
          phase: "download",
          progress: 20,
        },
      };
      return response({ job: snapshot.activeJob }, true, 202);
    }
    if (url === "/api/studio/jobs") {
      const job = {
        id: "new-job",
        kind: payload.kind,
        name: payload.name,
        input: payload,
        status: "running",
        phase: "generate",
        message: "正在生成",
        progress: 1,
      };
      snapshot = { ...snapshot, activeJob: job, jobs: [job] };
      return response({ job }, true, 202);
    }
    if (url.endsWith("/cancel")) {
      const job = {
        ...snapshot.activeJob,
        status: "cancelled",
        message: "已取消",
      };
      snapshot = { ...snapshot, activeJob: null, jobs: [job] };
      return response({ job });
    }
    if (url.endsWith("/import")) {
      const job = snapshot.importJob || {
        ...snapshot.jobs[0],
        status: "imported",
        importedLookId: "local-look-person",
      };
      snapshot = { ...snapshot, jobs: [job] };
      return response({
        job,
        catalog: snapshot.importCatalog || {
          looks: [{ id: "local-look-person" }],
          items: [],
          fits: [],
        },
      });
    }
    throw Error("Unexpected request " + url);
  };
});
afterEach(cleanup);
after(async () => {
  await rm(temporary, { recursive: true, force: true });
  dom.window.close();
});
async function mount(extra = {}) {
  const ui = render(
    React.createElement(LocalStudio, {
      baseLook: {
        id: "ruby-velvet",
        character: "露比",
        characterId: "ruby",
        name: "露比 · 绒裙",
      },
      items: [
        {
          id: "black-pointed-heels",
          name: "黑色尖头高跟鞋",
          slot: "shoes",
          asset: "/wardrobe/items/black-pointed-heels.png",
        },
      ],
      onImported: (value) => imported.push(value),
      ...extra,
    }),
  );
  await act(async () => {});
  return ui;
}

test("local studio explains first setup and starts a single installation", async () => {
  snapshot.runtime = {
    state: "missing",
    ready: false,
    message: "尚未安装本地生成模型",
  };
  const ui = await mount();
  fireEvent.click(ui.getByRole("button", { name: "安装本地生成" }));
  await waitFor(() => assert.ok(ui.getByText("正在下载本地模型")));
  assert.equal(posts.filter((p) => p.url === "/api/studio/setup").length, 1);
  assert.equal(ui.getByRole("button", { name: "开始生成" }).disabled, true);
});

test("fit generation uses the current character and chosen wardrobe shoe with low-memory default", async () => {
  const ui = await mount();
  fireEvent.change(ui.getByRole("combobox", { name: "生成内容" }), {
    target: { value: "fit" },
  });
  fireEvent.change(ui.getByRole("textbox", { name: "生成名称" }), {
    target: { value: "露比的新高跟鞋" },
  });
  fireEvent.change(ui.getByRole("textbox", { name: "描述想要的效果" }), {
    target: { value: "保留脸和裙子，只替换鞋子" },
  });
  fireEvent.click(ui.getByRole("button", { name: "开始生成" }));
  await waitFor(() => assert.ok(ui.getByRole("button", { name: "取消生成" })));
  assert.deepEqual(posts[0].payload, {
    kind: "fit",
    name: "露比的新高跟鞋",
    prompt: "保留脸和裙子，只替换鞋子",
    baseLookId: "ruby-velvet",
    itemId: "black-pointed-heels",
    slot: "shoes",
    baseSelection: {},
    operation: "equip",
    references: [],
    resolution: "small",
  });
  assert.equal(ui.getByRole("button", { name: "开始生成" }).disabled, true);
  fireEvent.click(ui.getByRole("button", { name: "取消生成" }));
  await waitFor(() =>
    assert.equal(ui.getByRole("status").textContent, "已取消"),
  );
  assert.equal(posts[1].url, "/api/studio/jobs/new-job/cancel");
});

test("studio recovers a preview on reopen and imports user-adjusted animation anchors", async () => {
  snapshot.jobs = [
    {
      id: "saved-preview",
      kind: "character",
      name: "新角色",
      status: "preview",
      message: "预览已生成",
      previewUrl: "/studio/output/character.png",
      rig,
    },
  ];
  const ui = await mount();
  assert.equal(
    ui.getByRole("img", { name: "生成预览" }).getAttribute("src"),
    "/studio/output/character.png",
  );
  fireEvent.click(ui.getByRole("button", { name: "调整动画位置" }));
  fireEvent.change(ui.getByRole("slider", { name: "嘴巴纵向位置" }), {
    target: { value: ".18" },
  });
  fireEvent.click(ui.getByRole("button", { name: "加入衣橱并使用" }));
  await waitFor(() => assert.equal(imported.length, 1));
  assert.equal(posts[0].url, "/api/studio/jobs/saved-preview/import");
  assert.equal(posts[0].payload.rig.mouth.y, 0.18);
  assert.equal(posts[0].payload.rig.eyes[0].x, 0.47);
  assert.equal(imported[0].job.importedLookId, "local-look-person");
});

test("server failures are visible and loading can be retried without losing text", async () => {
  getError = "本地服务暂时不可用";
  const ui = await mount();
  assert.ok(ui.getByRole("alert").textContent.includes("本地服务暂时不可用"));
  fireEvent.change(ui.getByRole("textbox", { name: "描述想要的效果" }), {
    target: { value: "长发与白色连衣裙" },
  });
  getError = null;
  fireEvent.click(ui.getByRole("button", { name: "重新连接" }));
  await waitFor(() => assert.ok(ui.getByText("本地生成已就绪")));
  assert.equal(
    ui.getByRole("textbox", { name: "描述想要的效果" }).value,
    "长发与白色连衣裙",
  );
});

test("new character requires reference photos and invalid file types show a clear error", async () => {
  const ui = await mount();
  fireEvent.change(ui.getByRole("textbox", { name: "生成名称" }), {
    target: { value: "我的角色" },
  });
  assert.equal(ui.getByRole("button", { name: "开始生成" }).disabled, true);
  fireEvent.change(ui.getByLabelText("上传参考图片"), {
    target: {
      files: [new File(["not-an-image"], "bad.txt", { type: "text/plain" })],
    },
  });
  await waitFor(() =>
    assert.ok(ui.getByRole("alert").textContent.includes("JPEG、PNG 或 WebP")),
  );
  assert.equal(posts.length, 0);
});

test("uploaded photos are reduced before generation and released when removed or closed", async () => {
  const originalCreate = URL.createObjectURL,
    originalRevoke = URL.revokeObjectURL;
  const originalBitmap = globalThis.createImageBitmap;
  const originalContext = dom.window.HTMLCanvasElement.prototype.getContext;
  const originalDataUrl = dom.window.HTMLCanvasElement.prototype.toDataURL;
  const revoked = [],
    decoded = [],
    canvasSizes = [];
  let nextUrl = 0;
  URL.createObjectURL = () => `blob:studio-${++nextUrl}`;
  URL.revokeObjectURL = (url) => revoked.push(url);
  globalThis.createImageBitmap = async () => {
    const bitmap = {
      width: 4096,
      height: 6144,
      closed: false,
      close() {
        this.closed = true;
      },
    };
    decoded.push(bitmap);
    return bitmap;
  };
  dom.window.HTMLCanvasElement.prototype.getContext = function () {
    return {
      fillRect() {},
      drawImage: () => canvasSizes.push([this.width, this.height]),
    };
  };
  dom.window.HTMLCanvasElement.prototype.toDataURL = () =>
    "data:image/jpeg;base64,c21hbGwtcmVmZXJlbmNl";
  try {
    const ui = await mount();
    fireEvent.change(ui.getByRole("textbox", { name: "生成名称" }), {
      target: { value: "自定义人物" },
    });
    fireEvent.change(ui.getByLabelText("上传参考图片"), {
      target: {
        files: [
          new File(["image"], "face.png", { type: "image/png" }),
          new File(["image"], "fullbody.jpg", { type: "image/jpeg" }),
        ],
      },
    });
    await waitFor(() =>
      assert.equal(
        ui.getAllByRole("button", { name: /移除参考图片/ }).length,
        2,
      ),
    );
    assert.deepEqual(canvasSizes, [
      [683, 1024],
      [683, 1024],
    ]);
    assert.ok(decoded.every((bitmap) => bitmap.closed));
    fireEvent.click(ui.getByRole("button", { name: "移除参考图片：face.png" }));
    assert.deepEqual(revoked, ["blob:studio-1"]);
    fireEvent.click(ui.getByRole("button", { name: "开始生成" }));
    await waitFor(() => assert.equal(posts.length, 1));
    assert.deepEqual(posts[0].payload.references, [
      {
        name: "fullbody.jpg",
        dataUrl: "data:image/jpeg;base64,c21hbGwtcmVmZXJlbmNl",
      },
    ]);
    ui.unmount();
    assert.deepEqual(revoked, ["blob:studio-1", "blob:studio-2"]);
  } finally {
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    globalThis.createImageBitmap = originalBitmap;
    dom.window.HTMLCanvasElement.prototype.getContext = originalContext;
    dom.window.HTMLCanvasElement.prototype.toDataURL = originalDataUrl;
  }
});

test("a rejected generation keeps the form and shows the server reason", async () => {
  const regularFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) =>
    url === "/api/studio/jobs"
      ? response({ error: "生成模型还没有安装完成" }, false, 503)
      : regularFetch(url, options);
  const ui = await mount();
  fireEvent.change(ui.getByRole("combobox", { name: "生成内容" }), {
    target: { value: "fit" },
  });
  fireEvent.change(ui.getByRole("textbox", { name: "生成名称" }), {
    target: { value: "新鞋履" },
  });
  fireEvent.click(ui.getByRole("button", { name: "开始生成" }));
  await waitFor(() =>
    assert.ok(
      ui.getByRole("alert").textContent.includes("生成模型还没有安装完成"),
    ),
  );
  assert.equal(ui.getByRole("textbox", { name: "生成名称" }).value, "新鞋履");
  assert.equal(ui.getByRole("button", { name: "开始生成" }).disabled, false);
});

const localLook = {
  id: "local-look-person",
  characterId: "local-person-character",
  character: "本地人物",
  name: "本地人物 · 参考立绘",
  age: 28,
  outfit: "参考立绘",
  description: "本地生成的全身立绘",
  color: "#ac86cb",
  region: null,
  styles: ["本地"],
  aliases: [],
  characterDefault: true,
  renderer: "glam",
  asset: "/local-studio/assets/local-look-person/character.png",
  thumbnail: "/local-studio/assets/local-look-person/character.png",
  rig: "/local-studio/assets/local-look-person/rig.json",
  actions: null,
};

test("an import completed after closing the wardrobe still publishes the character without restarting", async () => {
  const saved = restoreState(null);
  saved.activePersonaId = "boss-girlfriend";
  localStorage.setItem("muyu-state-v2", JSON.stringify(saved));
  const preview = {
    id: "delayed-import",
    kind: "character",
    name: "本地人物",
    status: "preview",
    previewUrl: localLook.asset,
    rig,
  };
  snapshot.jobs = [preview];
  const regularFetch = globalThis.fetch;
  let completeImport;
  globalThis.fetch = (url, options) => url.endsWith("/import")
    ? new Promise(resolve => {
      completeImport = () => resolve(response({
        job: { ...preview, status: "imported", importedLookId: localLook.id },
        catalog: { looks: [localLook], items: [], fits: [] },
      }));
    })
    : regularFetch(url, options);
  const ui = render(React.createElement(App));
  await act(async () => {});
  fireEvent.click(ui.getByRole("button", { name: "衣橱", exact: true }));
  fireEvent.click(ui.getByRole("button", { name: "新增模型", exact: true }));
  await waitFor(() => assert.ok(ui.getByRole("img", { name: "生成预览" })));
  fireEvent.click(ui.getByRole("button", { name: "加入衣橱并使用" }));
  assert.ok(completeImport);
  fireEvent.click(ui.getByRole("button", { name: "关闭衣柜" }));
  await act(async () => { completeImport(); });
  await waitFor(() => assert.equal(
    JSON.parse(localStorage.getItem("muyu-state-v2")).lookId, localLook.id,
  ));
  assert.equal(JSON.parse(localStorage.getItem("muyu-state-v2")).activePersonaId, saved.activePersonaId);
  fireEvent.click(ui.getByRole("button", { name: "衣橱", exact: true }));
  assert.ok(ui.getByRole("button", { name: "选择外观模特：本地人物" }));
});

test("app restores a saved local appearance after its persistent catalog is loaded", async () => {
  const saved = {
    ...restoreState(null),
    lookId: localLook.id,
    lastLookByCharacter: { [localLook.characterId]: localLook.id },
  };
  localStorage.setItem("muyu-state-v2", JSON.stringify(saved));
  const regularFetch = globalThis.fetch;
  let finishLoad;
  globalThis.fetch = (url, options) =>
    url === "/api/studio"
      ? new Promise((resolve) => {
          finishLoad = () =>
            resolve(
              response({
                ...snapshot,
                catalog: { looks: [localLook], items: [], fits: [] },
              }),
            );
        })
      : regularFetch(url, options);
  const ui = render(React.createElement(App));
  assert.equal(
    JSON.parse(localStorage.getItem("muyu-state-v2")).lookId,
    localLook.id,
    "catalog bootstrap must not overwrite a locally imported selection",
  );
  await act(async () => {
    finishLoad();
  });
  await waitFor(() =>
    assert.equal(
      ui.getAllByTestId("studio-current-look")[0].dataset.look,
      localLook.id,
    ),
  );
  fireEvent.click(ui.getByRole("button", { name: "衣橱", exact: true }));
  assert.ok(ui.getByRole("button", { name: "选择外观模特：本地人物" }));
});

test("wardrobe local studio imports a new animated appearance without changing the active persona", async () => {
  const saved = restoreState(null);
  saved.activePersonaId = "boss-girlfriend";
  localStorage.setItem("muyu-state-v2", JSON.stringify(saved));
  snapshot.jobs = [
    {
      id: "generated-person",
      kind: "character",
      name: "本地人物",
      status: "preview",
      message: "预览已生成",
      previewUrl: localLook.asset,
      rig,
    },
  ];
  snapshot.importCatalog = { looks: [localLook], items: [], fits: [] };
  const ui = render(React.createElement(App));
  await act(async () => {});
  fireEvent.click(ui.getByRole("button", { name: "衣橱", exact: true }));
  fireEvent.click(ui.getByRole("button", { name: "新增模型", exact: true }));
  await waitFor(() => assert.ok(ui.getByRole("img", { name: "生成预览" })));
  fireEvent.click(ui.getByRole("button", { name: "加入衣橱并使用" }));
  await waitFor(() =>
    assert.equal(
      JSON.parse(localStorage.getItem("muyu-state-v2")).lookId,
      localLook.id,
    ),
  );
  const after = JSON.parse(localStorage.getItem("muyu-state-v2"));
  assert.equal(after.activePersonaId, saved.activePersonaId);
  assert.equal(after.personas[saved.activePersonaId].appearance.lookId,localLook.id);
  assert.deepEqual({...after.personas,[saved.activePersonaId]:{...after.personas[saved.activePersonaId],appearance:saved.personas[saved.activePersonaId].appearance}}, saved.personas);
  assert.deepEqual(after.personaThreads, saved.personaThreads);
  assert.equal(
    ui.getAllByTestId("studio-current-look")[0].dataset.look,
    localLook.id,
  );
});

test("a recovered task with one percent progress never appears complete", async () => {
  snapshot.activeJob = {
    id: "one-percent",
    kind: "character",
    name: "当前任务",
    status: "running",
    message: "正在准备",
    progress: 1,
  };
  snapshot.jobs = [snapshot.activeJob];
  const ui = await mount();
  assert.equal(ui.getByRole("progressbar", { name: "图片生成进度" }).value, 1);
  assert.equal(ui.getByRole("button", { name: "开始生成" }).disabled, true);
});

test("importing a shoe fit reads its original appearance from job input and immediately wears it", async () => {
  const saved = { ...restoreState(null), lookId: "ruby-velvet" };
  localStorage.setItem("muyu-state-v2", JSON.stringify(saved));
  const asset = "/local-studio/assets/local-fit-ruby/character.png";
  snapshot.jobs = [
    {
      id: "shoe-preview",
      kind: "fit",
      name: "新的高跟鞋适配",
      status: "preview",
      message: "预览已生成",
      previewUrl: asset,
      rig,
      input: { baseLookId: "ruby-velvet", itemId: "black-pointed-heels" },
    },
  ];
  snapshot.importJob = {
    ...snapshot.jobs[0],
    status: "imported",
    importedItemId: "black-pointed-heels",
  };
  snapshot.importCatalog = {
    looks: [],
    items: [],
    fits: [
      {
        lookId: "ruby-velvet",
        itemId: "black-pointed-heels",
        asset,
        rig: "/local-studio/assets/local-fit-ruby/rig.json",
      },
    ],
  };
  const ui = render(React.createElement(App));
  await act(async () => {});
  fireEvent.click(ui.getByRole("button", { name: "衣橱", exact: true }));
  fireEvent.click(ui.getByRole("button", { name: "新增模型", exact: true }));
  await waitFor(() => assert.ok(ui.getByRole("img", { name: "生成预览" })));
  fireEvent.click(ui.getByRole("button", { name: "加入衣橱并使用" }));
  await waitFor(() =>
    assert.equal(
      JSON.parse(localStorage.getItem("muyu-state-v2")).wardrobeSelections.ruby
        ?.shoes,
      "black-pointed-heels",
    ),
  );
  assert.equal(
    ui.getAllByTestId("studio-current-look")[0].dataset.asset,
    asset,
  );
  assert.equal(
    JSON.parse(localStorage.getItem("muyu-state-v2")).lookId,
    "ruby-velvet",
  );
});

test("entering local fit generation from a lower wardrobe row starts at the top of the form", async () => {
  localStorage.setItem(
    "muyu-state-v2",
    JSON.stringify({ ...restoreState(null), lookId: "ruby-white-bikini" }),
  );
  const ui = render(React.createElement(App));
  await act(async () => {});
  fireEvent.click(ui.getByRole("button", { name: "衣橱", exact: true }));
  fireEvent.click(ui.getByRole("tab", { name: "单品" }));
  const page = ui.getByRole("region", { name: "选一种，陪你的模样" });
  page.scrollTop = 700;
  fireEvent.click(ui.getAllByRole("button", { name: /本地适配：/ })[0]);
  await waitFor(() =>
    assert.ok(ui.getByRole("region", { name: "本地生成工作台" })),
  );
  assert.equal(page.scrollTop, 0);
  assert.equal(ui.getByRole("combobox", { name: "生成内容" }).value, "fit");
  page.scrollTop = 700;
  fireEvent.click(ui.getByRole("button", { name: "返回衣橱" }));
  assert.equal(page.scrollTop, 0);
});

test("an unavailable local service uses the last catalog without erasing an imported appearance", async () => {
  const first = render(React.createElement(App));
  await act(async () => {});
  first.unmount();
  localStorage.setItem(
    "muyu-local-catalog-v1",
    JSON.stringify({ looks: [localLook], items: [], fits: [] }),
  );
  localStorage.setItem(
    "muyu-state-v2",
    JSON.stringify({ ...restoreState(null), lookId: localLook.id }),
  );
  getError = "本地服务连接暂时失败";
  const ui = render(React.createElement(App));
  await act(async () => {});
  assert.equal(
    ui.getAllByTestId("studio-current-look")[0].dataset.look,
    localLook.id,
  );
  assert.equal(
    JSON.parse(localStorage.getItem("muyu-state-v2")).lookId,
    localLook.id,
  );
});

test("switching the uploaded item category clears the previous item and filters its inventory", async () => {
  const ui = await mount({ initialKind: "fit", items: [
    { id: "black-pointed-heels", name: "黑色尖头高跟鞋", slot: "shoes" },
    { id: "fancha-sidepart-hair", name: "侧分黑长直发", slot: "hair" },
    { id: "fancha-white-watch", name: "白色腕表", slot: "watch" },
  ] });
  fireEvent.change(ui.getByRole("combobox", { name: "单品类别" }), { target: { value: "hair" } });
  const source = ui.getByRole("combobox", { name: "发型来源" });
  assert.equal(source.value, "");
  assert.deepEqual([...source.options].map(option => option.value), ["", "fancha-sidepart-hair"]);
  fireEvent.change(source, { target: { value: "fancha-sidepart-hair" } });
  fireEvent.change(ui.getByRole("textbox", { name: "生成名称" }), { target: { value: "新的黑长直" } });
  fireEvent.click(ui.getByRole("button", { name: "开始生成" }));
  await waitFor(() => assert.equal(posts.length, 1));
  assert.equal(posts[0].payload.slot, "hair");
  assert.equal(posts[0].payload.itemId, "fancha-sidepart-hair");
  assert.match(posts[0].payload.prompt, /只将发型替换/);
  assert.doesNotMatch(posts[0].payload.prompt, /保留.*发型|保持.*发型.*只将/);
});

test("restoration submits the full worn selection without needing an item or new reference", async () => {
  const baseSelection = { shoes: "black-pointed-heels", earrings: "fancha-pearl-earrings" };
  const ui = await mount({ initialKind: "fit", initialSlot: "earrings", initialItemId: "", baseSelection, operation: "restore" });
  assert.equal(ui.queryByRole("combobox", { name: "耳环来源" }), null);
  assert.equal(ui.queryByLabelText("上传参考图片"), null);
  assert.equal(ui.getByRole("combobox", { name: "单品类别" }).disabled, true);
  fireEvent.click(ui.getByRole("button", { name: "开始生成" }));
  await waitFor(() => assert.equal(posts.length, 1));
  assert.equal(posts[0].payload.operation, "restore");
  assert.equal(posts[0].payload.slot, "earrings");
  assert.deepEqual(posts[0].payload.baseSelection, baseSelection);
  assert.deepEqual(posts[0].payload.references, []);
  assert.equal(posts[0].payload.itemId, undefined);
});

test("opening nail adaptation leaves unrelated previews in history until explicitly selected", async () => {
  snapshot.jobs = [{ id: "unrelated-person", kind: "character", name: "旧模型预览", status: "preview", previewUrl: "/local-studio/assets/old-person/character.png", rig }];
  const ui = await mount({ initialKind: "fit", initialSlot: "nails", initialItemId: "fancha-violet-nails",
    items: [{ id: "fancha-violet-nails", name: "亮紫色指甲", slot: "nails", color: "#A45BEF" }] });
  assert.equal(ui.queryByRole("img", { name: "生成预览" }), null);
  assert.equal(ui.queryByRole("button", { name: "加入衣橱并使用" }), null);
  assert.equal(posts.length, 0, "opening a different context must not mutate an existing task");
  fireEvent.click(ui.getByRole("button", { name: /旧模型预览/ }));
  assert.equal(ui.getByRole("img", { name: "生成预览" }).getAttribute("src"), "/local-studio/assets/old-person/character.png");
  assert.ok(ui.getByRole("button", { name: "加入衣橱并使用" }));
  assert.equal(posts.length, 0);
});

test("automatic fit preview selection matches both the current model and item category", async () => {
  const preview = (id, baseLookId, slot) => ({ id, kind: "fit", name: id, status: "preview", previewUrl: `/local-studio/assets/${id}/character.png`, input: { baseLookId, slot }, rig });
  snapshot.jobs = [
    preview("other-character-nails", "linwei-ivory-wrap", "nails"),
    preview("same-character-hair", "ruby-velvet", "hair"),
    preview("matching-nails", "ruby-velvet", "nails"),
  ];
  const ui = await mount({ initialKind: "fit", initialSlot: "nails", initialItemId: "fancha-violet-nails",
    items: [{ id: "fancha-violet-nails", name: "亮紫色指甲", slot: "nails", color: "#A45BEF" }] });
  assert.equal(ui.getByRole("img", { name: "生成预览" }).getAttribute("src"), "/local-studio/assets/matching-nails/character.png");
  fireEvent.click(ui.getByRole("button", { name: /other-character-nails/ }));
  assert.equal(ui.getByRole("img", { name: "生成预览" }).getAttribute("src"), "/local-studio/assets/other-character-nails/character.png");
});

test("an unrelated active generation still blocks new jobs without being auto-selected", async () => {
  snapshot.activeJob = { id: "other-active", kind: "character", name: "其他模型生成", status: "running", progress: 20 };
  snapshot.jobs = [snapshot.activeJob];
  const ui = await mount({ initialKind: "fit", initialSlot: "nails", initialItemId: "fancha-violet-nails",
    items: [{ id: "fancha-violet-nails", name: "亮紫色指甲", slot: "nails", color: "#A45BEF" }] });
  assert.equal(ui.queryByRole("button", { name: "取消生成" }), null);
  assert.equal(ui.getByRole("button", { name: "开始生成" }).disabled, true);
  fireEvent.click(ui.getByRole("button", { name: /其他模型生成/ }));
  assert.equal(ui.getByRole("progressbar", { name: "图片生成进度" }).value, 20);
  assert.ok(ui.getByRole("button", { name: "取消生成" }));
  assert.equal(posts.length, 0);
});
