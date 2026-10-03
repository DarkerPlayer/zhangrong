import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

test('full workspaces and their textareas accept pointers above the animated stage', async () => {
  // Match the production entry: component styles are imported by App first,
  // then main.jsx imports the shared interaction rules.
  const css = (await Promise.all(['voice-library.css', 'persona.css', 'wardrobe.css', 'styles.css']
    .map(file => readFile(new URL('../src/' + file, import.meta.url), 'utf8')))).join('\n');
  const dom = new JSDOM(`<style>${css}</style><div class="animated-world"><main class="main-stage">
    <section class="persona-page"><textarea></textarea></section>
    <section class="voice-studio"><textarea></textarea></section>
    <section class="wardrobe-page"><textarea></textarea></section>
    <section class="side-panel"><textarea></textarea></section>
  </main></div>`);
  try {
    const style = selector => dom.window.getComputedStyle(dom.window.document.querySelector(selector));
    assert.equal(style('.main-stage').pointerEvents, 'none');
    for (const selector of ['.persona-page', '.voice-studio', '.wardrobe-page', '.side-panel']) {
      assert.equal(style(selector).pointerEvents, 'auto', selector + ' must receive scrollbar clicks');
      assert.equal(style(selector + ' textarea').pointerEvents, 'auto', selector + ' must receive text clicks');
      assert.equal(style(selector).scrollbarWidth, 'auto', selector + ' needs a full-width drag target');
    }
    const rules = [...dom.window.document.styleSheets[0].cssRules];
    const textarea = rules.find(rule => rule.selectorText === 'input,\nselect,\ntextarea');
    assert.equal(textarea?.style.getPropertyValue('-webkit-app-region'), 'no-drag');
  } finally {
    dom.window.close();
  }
});
