import { test, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { getLook, getAvailableLooks, ORIGINAL_LOOK } from "../src/looks.mjs";
import { getCharacterForLook, GARMENT_SLOT_LABELS, getEmbeddedWardrobeItems } from "../src/wardrobe.mjs";
import { HOSIERY_LOOK_IDS, HOSIERY_ITEMS } from "../server/hosiery-fits.mjs";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost:4317" });
for (const name of ["window", "document", "navigator", "HTMLElement", "Event", "MouseEvent"])
  Object.defineProperty(globalThis, name, { value: dom.window[name], configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = await import("react");
const { render, cleanup, fireEvent, within, waitFor } = await import("@testing-library/react");
const temporary = await mkdtemp(path.join(process.cwd(), "node_modules/.wardrobe-ui-"));
const bundle = path.join(temporary, "wardrobe.cjs");
await build({
  stdin: { contents: 'export {default} from "./src/WardrobePage.jsx"; export {setLocalWardrobe, resolveWardrobeAppearance} from "./src/wardrobe.mjs";', resolveDir: process.cwd(), loader: "js" }, outfile: bundle,
  bundle: true, platform: "node", format: "cjs",
  external: ["react", "react-dom", "react/jsx-runtime"], loader: { ".css": "empty" },
  plugins: [{ name: "native-renderer-boundary", setup(builder) {
    builder.onResolve({ filter: /^\.\/LivePet\.jsx$/ }, () => ({ path: "pet", namespace: "test" }));
    builder.onLoad({ filter: /.*/, namespace: "test" }, () => ({ contents: "export default function LivePet(){return null}", loader: "js" }));
  } }],
});
const bundled = createRequire(import.meta.url)(bundle);
const WardrobePage = bundled.default;
afterEach(() => { cleanup(); bundled.setLocalWardrobe({ items: [], fits: [] }); });
after(async () => { await rm(temporary, { recursive: true, force: true }); dom.window.close(); });

function mount({ lookId = "ruby-velvet", removedLookIds = [], view = "active", selection = {}, selectResult = {status:"ready",message:"所选单品组合已保存。"}, persistedSelection } = {}) {
  const choices = [];
  const restored = [];
  const worn = [];
  const state = { lookId, backgroundId: "moon-room", avatarMode: "live2d", wardrobeSelections: {[getCharacterForLook(lookId).id]: persistedSelection || selection} };
  const props = {
    state, currentLook: { ...bundled.resolveWardrobeAppearance(lookId, selection) }, activeCharacter: getCharacterForLook(lookId),
    visibleLooks: getAvailableLooks([]), removedLookIds, view, query: "", category: "全部",
    availableLookCount: getAvailableLooks(removedLookIds).length,
    chooseLook: id => choices.push(id), chooseCharacter() {}, setQuery() {}, setCategory() {},
    setView() {}, removeLook() {}, restoreLook: id => restored.push(id), chooseScene: id => choices.push(id),
    setBackground() {}, selectWardrobeItem: (slot, id) => { worn.push([slot, id]); return selectResult; }, requestEmptyOutfit: () => ({ message: "已清空" }),
    onClose() {}, petProps: {},
  };
  const ui = render(React.createElement(WardrobePage, props));
  return { ...ui, choices, restored, worn, changeCharacter(lookId) {
    const nextState = { ...state, lookId };
    ui.rerender(React.createElement(WardrobePage, { ...props, state: nextState,
      currentLook: bundled.resolveWardrobeAppearance(lookId, {}), activeCharacter: getCharacterForLook(lookId) }));
  } };
}

function showAllInventory(ui) {
  fireEvent.click(ui.getByRole("tab", { name: "单品" }));
  fireEvent.click(ui.getByRole("button", { name: /^全部衣橱/ }));
}

test("outfit choices cannot switch the selected model or expose its removed outfits", () => {
  const ui = mount({ removedLookIds: ["ruby-date"] });
  const outfits = ui.getAllByRole("button", { name: /^动态换装：/ });
  assert.deepEqual(outfits.map(button => button.getAttribute("aria-label")).sort(), [
    "动态换装：绯月 · 白色比基尼底装", "动态换装：绯月 · 酒红丝绒",
  ]);
  fireEvent.click(ui.getByRole("button", { name: "动态换装：绯月 · 白色比基尼底装" }));
  assert.deepEqual(ui.choices, ["ruby-white-bikini"]);
});

test("Haru is selected only in the model roster and never shown as another model's outfit", () => {
  const ui = mount({ lookId: ORIGINAL_LOOK.id });
  const roster = ui.getByRole("complementary", { name: "外观模特列表" });
  const selected = within(roster).getAllByRole("button", { pressed: true });
  assert.equal(selected.length, 1);
  assert.equal(selected[0].getAttribute("aria-label"), "选择外观模特：Haru");
  assert.equal(ui.queryByRole("button", { name: /^动态换装：/ }), null);
});

test("removed-view recovery can restore another archived model without switching the selected appearance", () => {
  const ui = mount({ view: "removed", removedLookIds: ["amara-royal", "amara-ankara", "amara-white-bikini"] });
  assert.equal(ui.queryByRole("button", { name: "选择外观模特：阿玛拉" }), null);
  assert.equal(ui.queryByRole("button", { name: /^动态换装：/ }), null);
  fireEvent.click(ui.getByRole("button", { name: "恢复阿玛拉 · 彩织华服" }));
  assert.deepEqual(ui.restored, ["amara-ankara"]);
  assert.deepEqual(ui.choices, []);
});

test("single-item inventory contains real assets and an empty clothing category has no pretend try-on", () => {
  const ui = mount();
  showAllInventory(ui);
  const inventory = ui.getByRole("region", { name: "鞋履独立库存" });
  assert.equal(within(inventory).getAllByRole("button", { name: /鞋履库存：/ }).length, 3);
  fireEvent.click(ui.getByRole("button", { name: "筛选单品：上装" }));
  assert.ok(ui.getByText("还没有独立上装"));
  assert.equal(ui.queryByRole("button", { name: /上装库存：/ }), null);
  assert.equal(ui.queryByRole("button", { name: /绯月.*蕾丝/ }), null);
});

test("photo presets are only available in the background section with their mode change explained", () => {
  const ui = mount();
  assert.equal(ui.queryByRole("button", { name: /^换装：/ }), null);
  fireEvent.click(ui.getByRole("tab", { name: "背景" }));
  assert.ok(ui.getByText(/选择后切换到静态图片场景/));
  const scenes = ui.getAllByRole("button", { name: /^换装：/ });
  assert.ok(scenes.length > 0);
  fireEvent.click(scenes[0]);
  assert.equal(ui.choices.length, 1);
});

test("uploading a new shoe opens adaptation without silently selecting an existing inventory shoe", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({
    runtime: { ready: true, state: "ready", message: "本地生成已就绪" },
    jobs: [], activeJob: null, catalog: { looks: [], items: [], fits: [] },
  }) });
  try {
    const ui = mount();
    fireEvent.click(ui.getByRole("tab", { name: "单品" }));
    fireEvent.click(ui.getByRole("button", { name: "上传新鞋履并适配" }));
    await waitFor(() => assert.ok(ui.getByText("本地生成已就绪")));
    assert.equal(ui.getByRole("combobox", { name: "生成内容" }).value, "fit");
    assert.equal(ui.getByRole("combobox", { name: "鞋履来源" }).value, "");
  } finally { globalThis.fetch = originalFetch; }
});

function mockStudioService() {
  const previous = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    if (options.body) requests.push(JSON.parse(options.body));
    return { ok: true, json: async () => options.body
      ? { job: { id: "fit-request", status: "running", kind: "fit", name: "适配", input: requests.at(-1) } }
      : { runtime: { ready: true, state: "ready", message: "本地生成已就绪" }, jobs: [], activeJob: null, catalog: { looks: [], items: [], fits: [] } } };
  };
  return { requests, restore: () => { globalThis.fetch = previous; } };
}

function installFit(selection, lookId = "ruby-velvet") {
  bundled.setLocalWardrobe({ items: [], fits: [{ lookId, selection,
    asset: "/local-studio/assets/ui-combination/character.png",
    rig: "/local-studio/assets/ui-combination/rig.json" }] });
}

test("the source character exposes all six reusable originals without claiming they are overrides", () => {
  const ui = mount({ lookId: "fancha-rose-office" });
  fireEvent.click(ui.getByRole("tab", { name: "单品" }));
  for (const item of getEmbeddedWardrobeItems("fancha-rose-office")) {
    fireEvent.click(ui.getByRole("button", { name: `筛选单品：${GARMENT_SLOT_LABELS[item.slot]}` }));
    const card = ui.getByRole("button", { name: `${GARMENT_SLOT_LABELS[item.slot]}库存：${item.name}` });
    assert.equal(card.getAttribute("aria-pressed"), "true");
    assert.equal(card.disabled, true);
    assert.match(card.textContent, /原配 · 当前造型自带/);
    assert.match(card.textContent, /来源：反差婊 · 玫瑰职场/);
    assert.equal(ui.queryByRole("button", { name: `本地适配：${item.name}` }), null);
    if (item.slot === "nails") assert.match(ui.getByLabelText("指甲颜色：#A45BEF").getAttribute("style"), /#A45BEF/);
  }
  assert.deepEqual(ui.worn, []);
});

test("adapting a shared nail color keeps the currently worn shoe selection in the job", async () => {
  const selection = { shoes: "ivory-soft-slippers" };
  const service = mockStudioService();
  try {
    const ui = mount({ lookId: "ruby-white-bikini", selection });
    showAllInventory(ui);
    fireEvent.click(ui.getByRole("button", { name: "筛选单品：指甲颜色" }));
    assert.equal(ui.getByRole("button", { name: "指甲颜色库存：亮紫色指甲" }).disabled, true);
    fireEvent.click(ui.getByRole("button", { name: "本地适配：亮紫色指甲" }));
    await waitFor(() => assert.ok(ui.getByText("本地生成已就绪")));
    assert.equal(ui.getByRole("combobox", { name: "单品类别" }).value, "nails");
    assert.equal(ui.getByRole("combobox", { name: "指甲颜色来源" }).value, "fancha-violet-nails");
    fireEvent.change(ui.getByRole("textbox", { name: "生成名称" }), { target: { value: "紫色指甲与原鞋" } });
    fireEvent.click(ui.getByRole("button", { name: "开始生成" }));
    await waitFor(() => assert.equal(service.requests.length, 1));
    assert.deepEqual(service.requests[0].baseSelection, selection);
    assert.equal(service.requests[0].itemId, "fancha-violet-nails");
    assert.equal(service.requests[0].slot, "nails");
    assert.match(service.requests[0].prompt, /#A45BEF/);
    assert.deepEqual(ui.worn, []);
  } finally { service.restore(); }
});

test("restoring one slot adapts the remaining combination instead of dropping other worn items", async () => {
  const selection = { shoes: "black-pointed-heels", watch: "fancha-white-watch" };
  installFit(selection);
  const service = mockStudioService();
  try {
    const ui = mount({ selection });
    fireEvent.click(ui.getByRole("tab", { name: "单品" }));
    fireEvent.click(ui.getByRole("button", { name: "恢复原造型鞋履" }));
    await waitFor(() => assert.ok(ui.getByText("本地生成已就绪")));
    assert.ok(ui.getByText("适配原造型的鞋履，无需上传新的单品图片。"));
    assert.equal(ui.queryByLabelText("上传参考图片"), null);
    fireEvent.click(ui.getByRole("button", { name: "开始生成" }));
    await waitFor(() => assert.equal(service.requests.length, 1));
    assert.equal(service.requests[0].operation, "restore");
    assert.equal(service.requests[0].slot, "shoes");
    assert.deepEqual(service.requests[0].baseSelection, selection);
    assert.equal(service.requests[0].itemId, undefined);
    assert.deepEqual(ui.worn, []);
  } finally { service.restore(); }
});

test("wear and restore actions show the selector result rather than a fabricated success message", () => {
  const ui = mount({ lookId: "ruby-white-bikini", selection: { shoes: "ivory-soft-slippers" }, selectResult: {status:"pending",message:"组合仍在适配，当前外观保持不变。"} });
  fireEvent.click(ui.getByRole("tab", { name: "单品" }));
  fireEvent.click(ui.getByRole("button", { name: "恢复原造型鞋履" }));
  assert.deepEqual(ui.worn, [["shoes", null]]);
  assert.equal(ui.getByRole("status").textContent, "组合仍在适配，当前外观保持不变。");
});

test("an unavailable remembered combination is not treated as currently worn", () => {
  const ui = mount({ lookId: "ruby-velvet", persistedSelection: { shoes: "black-pointed-heels", watch: "fancha-white-watch" } });
  fireEvent.click(ui.getByRole("tab", { name: "单品" }));
  assert.equal(ui.queryByRole("button", { name: "恢复原造型鞋履" }), null);
  assert.equal(ui.queryByLabelText("当前单品组合"), null);
});

test("pending items offer available exact-fit alternatives only within the same character", () => {
  const ui = mount({ lookId: "ruby-white-bikini" });
  showAllInventory(ui);
  const choices = ui.getAllByRole("button", { name: /^切换到.*适配黑色尖头高跟鞋$/ });
  assert.ok(choices.length);
  assert.ok(choices.every(button => button.getAttribute("aria-label").startsWith("切换到绯月 · ")));
  fireEvent.click(ui.getByRole("button", { name: "切换到绯月 · 酒红丝绒适配黑色尖头高跟鞋" }));
  assert.deepEqual(ui.choices, ["ruby-velvet"]);
  assert.deepEqual(ui.worn, []);
});

test("an alternative is hidden when switching there would drop an existing worn item", () => {
  const selection = { watch: "fancha-white-watch" };
  const next = { shoes: "black-pointed-heels", ...selection };
  const fitted = (lookId, selection) => ({ lookId, selection,
    asset: "/local-studio/assets/preserved-combination/character.png",
    rig: "/local-studio/assets/preserved-combination/rig.json" });
  bundled.setLocalWardrobe({ items: [], fits: [
    fitted("ruby-white-bikini", selection),
    fitted("ruby-velvet", next),
  ] });
  const ui = mount({ lookId: "ruby-white-bikini", selection });
  showAllInventory(ui);
  assert.equal(ui.queryByRole("button", { name: /^切换到.*适配黑色尖头高跟鞋$/ }), null);
});

test("an alternative appears when both the retained and desired combinations are fitted", () => {
  const selection = { watch: "fancha-white-watch" };
  const next = { shoes: "black-pointed-heels", ...selection };
  const fitted = (lookId, selection) => ({ lookId, selection,
    asset: "/local-studio/assets/preserved-combination/character.png",
    rig: "/local-studio/assets/preserved-combination/rig.json" });
  bundled.setLocalWardrobe({ items: [], fits: [
    fitted("ruby-white-bikini", selection),
    fitted("ruby-velvet", selection),
    fitted("ruby-velvet", next),
  ] });
  const ui = mount({ lookId: "ruby-white-bikini", selection });
  showAllInventory(ui);
  fireEvent.click(ui.getByRole("button", { name: "切换到绯月 · 酒红丝绒适配黑色尖头高跟鞋" }));
  assert.deepEqual(ui.choices, ["ruby-velvet"]);
  assert.deepEqual(ui.worn, []);
});

test("the default character wardrobe hides other sources and all inventory is still available", () => {
  const ui = mount({ lookId: "fancha-rose-office" });
  fireEvent.click(ui.getByRole("tab", { name: "单品" }));
  assert.equal(ui.getByRole("button", { name: /^角色专属/ }).getAttribute("aria-pressed"), "true");
  assert.equal(ui.getAllByRole("button", { name: /鞋履库存：/ }).length, 1);
  assert.ok(ui.getByRole("button", { name: "鞋履库存：象牙白细跟鞋" }));
  assert.equal(ui.queryByRole("button", { name: "鞋履库存：黑色尖头高跟鞋" }), null);
  fireEvent.click(ui.getByRole("button", { name: "筛选单品：指甲颜色" }));
  assert.equal(ui.getAllByRole("button", { name: /指甲颜色库存：/ }).length, 1);
  fireEvent.click(ui.getByRole("button", { name: /^全部衣橱/ }));
  assert.equal(ui.getAllByRole("button", { name: /指甲颜色库存：/ }).length, 3);
  assert.deepEqual(ui.worn, []);
});

test("switching character resets all inventory to that character's own wardrobe", () => {
  const ui = mount({ lookId: "fancha-rose-office" });
  showAllInventory(ui);
  ui.changeCharacter("songyu-azure-robes");
  assert.equal(ui.getByRole("button", { name: /^角色专属/ }).getAttribute("aria-pressed"), "true");
  assert.ok(ui.getByRole("heading", { name: "宋玉的专属衣橱" }));
  // The first non-empty category is selected instead of an empty shoe shelf.
  assert.ok(ui.getByRole("button", { name: "连身装库存：蓝白刺绣仙衣" }));
  assert.equal(ui.queryByRole("button", { name: "连身装库存：玫瑰粉双排扣连衣裙" }), null);
  ui.changeCharacter("fancha-rose-office");
  assert.equal(ui.getByRole("button", { name: /^角色专属/ }).getAttribute("aria-pressed"), "true");
});

test("an empty character category keeps access to the full collection even when other slots have assigned items", () => {
  const ui = mount({ lookId: "yinyue-silver-fox" });
  fireEvent.click(ui.getByRole("tab", { name: "单品" }));
  fireEvent.click(ui.getByRole("button", { name: "筛选单品：鞋履" }));
  assert.ok(ui.getByText("银月还没有独立鞋履"));
  assert.equal(ui.queryByRole("button", { name: /库存：/ }), null);
  fireEvent.click(ui.getByRole("button", { name: "查看全部鞋履" }));
  assert.equal(ui.getAllByRole("button", { name: /鞋履库存：/ }).length, 3);
  assert.deepEqual(ui.worn, []);
});

test("all eight assigned outfits offer three immediately wearable stockings in their own default collection", () => {
  for (const lookId of HOSIERY_LOOK_IDS) {
    const ui = mount({ lookId });
    fireEvent.click(ui.getByRole("tab", { name: "单品" }));
    assert.equal(ui.getByRole("button", { name: /^角色专属/ }).getAttribute("aria-pressed"), "true");
    fireEvent.click(ui.getByRole("button", { name: "筛选单品：袜类" }));
    assert.equal(ui.getAllByRole("button", { name: /^袜类库存：/ }).length, 3);
    for (const item of HOSIERY_ITEMS) {
      const button = ui.getByRole("button", { name: `袜类库存：${item.name}` });
      assert.equal(button.disabled, false, `${lookId}:${item.id}`);
      fireEvent.click(button);
    }
    assert.deepEqual(ui.worn, HOSIERY_ITEMS.map(item => ["hosiery", item.id]));
    assert.equal(ui.queryByRole("button", { name: /^本地适配：/ }), null);
    if (lookId === "songyu-azure-robes") assert.equal(ui.getAllByText("及地长裙遮住袜子，当前造型不会露出袜面。").length, 3);
    cleanup();
  }
});

test("unassigned characters see stockings only in all inventory and receive a genuine adaptation entry", () => {
  const ui = mount({ lookId: "ruby-velvet" });
  fireEvent.click(ui.getByRole("tab", { name: "单品" }));
  fireEvent.click(ui.getByRole("button", { name: "筛选单品：袜类" }));
  assert.equal(ui.queryByRole("button", { name: /^袜类库存：/ }), null);
  fireEvent.click(ui.getByRole("button", { name: /^全部衣橱/ }));
  for (const item of HOSIERY_ITEMS) {
    assert.equal(ui.getByRole("button", { name: `袜类库存：${item.name}` }).disabled, true);
    assert.ok(ui.getByRole("button", { name: `本地适配：${item.name}` }));
  }
  assert.deepEqual(ui.worn, []);
});
