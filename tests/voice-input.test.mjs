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
  "localStorage",
  "Event",
  "MouseEvent",
])
  Object.defineProperty(globalThis, name, {
    value: dom.window[name],
    configurable: true,
    writable: true,
  });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.HTMLElement.prototype.scrollIntoView = function () {};
const React = await import("react");
const { render, fireEvent, cleanup, act, waitFor } =
  await import("@testing-library/react");
const temporary = await mkdtemp(
  path.join(process.cwd(), "node_modules/.voice-input-test-"),
);
const bundle = path.join(temporary, "app.cjs");
await build({
  entryPoints: ["src/App.jsx"],
  outfile: bundle,
  bundle: true,
  platform: "node",
  format: "cjs",
  define: { "import.meta.env.DEV": "true" },
  external: ["react", "react-dom", "react/jsx-runtime"],
  plugins: [
    {
      name: "isolate-reading-native-boundaries",
      setup(builder) {
        builder.onResolve(
          { filter: /^\.\/(LivePet\.jsx|audio\.js|media\.mjs)$/ },
          (args) => ({ path: args.path, namespace: "reading-test" }),
        );
        builder.onLoad({ filter: /.*/, namespace: "reading-test" }, (args) => ({
          contents: args.path.endsWith("LivePet.jsx")
            ? "export default function LivePet(){return null}"
            : args.path.endsWith("audio.js")
              ? "export async function speak(text,end,start,options){globalThis.__readingSpeech.push({text,voiceProfileId:options.voiceProfileId});start?.();end?.()} export function stopSpeech(){} export async function setRain(){}"
              : "export async function readMedia(){return null} export async function saveMedia(){}",
          loader: "js",
        }));
      },
    },
  ],
});
const App = createRequire(import.meta.url)(bundle).default;
let requests;
beforeEach(() => {
  localStorage.clear();
  globalThis.__readingSpeech = [];
  requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    if (url === "/api/voices")
      return {
        ok: true,
        json: async () => ({
          selectedId: "builtin",
          voices: [
            {
              id: "builtin",
              name: "原始参考音色",
              builtin: true,
              duration: 5.4,
            },
            {
              id: "chosen-voice",
              name: "自选音色",
              builtin: false,
              duration: 6,
            },
          ],
        }),
      };
    if (url === "/api/models") return { json: async () => ({ models: [] }) };
    if (url === "/api/health") return { json: async () => ({ ok: true }) };
    throw Error("Unexpected request: " + url);
  };
});
afterEach(cleanup);
after(async () => {
  await rm(temporary, { recursive: true, force: true });
  dom.window.close();
});

async function openReader() {
  const state = restoreState(null);
  localStorage.setItem("muyu-state-v2", JSON.stringify(state));
  const ui = render(React.createElement(App));
  await act(async () => {});
  fireEvent.click(ui.getByRole("button", { name: "朗读", exact: true }));
  await waitFor(() => assert.ok(ui.getByRole("option", { name: "自选音色" })));
  const textArea = ui.getByRole("textbox", { name: "朗读文本" });
  textArea.focus();
  return { ui, textArea };
}

test("custom reading sends the typed text verbatim with the chosen voice without creating chat or corpus", async () => {
  const { ui, textArea } = await openReader();
  const before = JSON.parse(localStorage.getItem("muyu-state-v2"));
  fireEvent.change(ui.getByRole("combobox", { name: "朗读音色" }), {
    target: { value: "chosen-voice" },
  });
  const typed = "  第一行：{personaName}，请照着读。\n第二行：{userName}。  ";
  fireEvent.change(textArea, { target: { value: typed } });
  fireEvent.click(ui.getByRole("button", { name: "读给我听", exact: true }));
  assert.deepEqual(globalThis.__readingSpeech, [
    { text: typed, voiceProfileId: "chosen-voice" },
  ]);
  const after = JSON.parse(localStorage.getItem("muyu-state-v2"));
  assert.deepEqual(after.personas, before.personas);
  assert.deepEqual(after.personaThreads, before.personaThreads);
  assert.equal(
    requests.some((request) => request.url === "/api/chat"),
    false,
  );
});

test("Escape dismissing Chinese composition keeps the reading editor and its draft", async () => {
  const { ui, textArea } = await openReader();
  fireEvent.compositionStart(textArea);
  fireEvent.change(textArea, { target: { value: "正在输入中文" } });
  fireEvent.keyDown(textArea, { key: "Escape", isComposing: true });
  assert.ok(
    ui.queryByRole("region", { name: "朗读工作台" }),
    "IME Escape must keep the reader open",
  );
  assert.equal(document.activeElement, textArea);
  assert.equal(textArea.value, "正在输入中文");
  assert.deepEqual(globalThis.__readingSpeech, []);
  fireEvent.compositionEnd(textArea, { data: "正在输入中文" });
  fireEvent.keyDown(textArea, { key: "Escape" });
  assert.equal(ui.queryByRole("region", { name: "朗读工作台" }), null);
});

test("the legacy IME key code keeps reading open while a Chinese candidate is being selected", async () => {
  const { ui, textArea } = await openReader();
  fireEvent.change(textArea, { target: { value: "中文候选词" } });
  fireEvent.keyDown(textArea, { key: "Escape", keyCode: 229 });
  assert.ok(
    ui.queryByRole("region", { name: "朗读工作台" }),
    "Legacy IME Escape must keep the reader open",
  );
  assert.equal(textArea.value, "中文候选词");
});
