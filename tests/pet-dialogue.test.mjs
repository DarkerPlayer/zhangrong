import test from 'node:test';
import assert from 'node:assert/strict';
import { offlineReply, createMessages } from '../server/dialogue.mjs';
import { modelReply } from '../server/ollama.mjs';
import { startServer } from '../server/index.mjs';

test('Live2D explicit requests return renderer actions and a short reply', () => {
  for (const [message, petAction] of [
    ['摸摸头', 'pat'],
    ['让我摸摸你的头', 'pat'],
    ['挥挥手好吗', 'wave'],
    ['打个招呼吧', 'wave'],
    ['开心一点', 'happy'],
    ['害羞一点', 'shy'],
    ['恢复待机', 'idle'],
    ['不要摸摸头，挥挥手', 'wave'],
    ['别害羞，开心一点', 'happy'],
    ['不要摸摸头但可以挥挥手', 'wave'],
    ['能不能挥挥手', 'wave'],
    ['动起来，给我挥挥手', 'wave'],
  ]) {
    const result = offlineReply({ message, avatarMode: 'live2d' });
    assert.equal(result.petAction, petAction, message);
    assert.equal(result.action, null, message);
    assert.ok(result.reply.length > 3 && result.reply.length < 100);
  }
});

test('negated commands and action descriptions never trigger a pet action', () => {
  for (const message of [
    '不要摸摸头', '别挥挥手', '不用打个招呼', '不想让你开心一点',
    '不能害羞一点', '不要摸摸头，也不要挥挥手', '不要摸摸头也不要挥挥手',
    '不需要挥挥手', '不是让你摸摸头', '别再给我挥挥手了',
    '摸摸头是什么意思？', '我昨天看到别人挥挥手', '我希望自己开心一点',
    '你好',
  ]) {
    assert.equal(offlineReply({ message, avatarMode: 'live2d' }).petAction, null, message);
  }
});

test('photo mode never claims that a requested pet motion was performed', () => {
  const result = offlineReply({ message: '挥挥手', avatarMode: 'photo' });
  assert.equal(result.petAction, null);
  assert.match(result.reply, /图片|照片/);
  assert.match(result.reply, /Live2D|桌宠/);
  assert.doesNotMatch(result.reply, /挥好|挥手啦/);
});

test('Live2D capabilities describe actual movement and keep generation limits', () => {
  const movement = offlineReply({ message: '你可以动起来吗', avatarMode: 'live2d' });
  assert.match(movement.reply, /眨眼/);
  assert.match(movement.reply, /呼吸/);
  assert.match(movement.reply, /挥手/);
  assert.doesNotMatch(movement.reply, /只是.*镜头|不能生成角色的新动作/);
  for (const message of ['给我生成一段视频', '跳个舞', '给我跳一段舞', '走过来', '你可以走动吗', '站起来转个圈']) {
    const result = offlineReply({ message, avatarMode: 'live2d' });
    assert.match(result.reply, /不能|不支持|无法/);
    assert.equal(result.petAction, null);
    assert.equal(result.action, null);
  }
});

test('Live2D clothing requests accurately switch to an existing photo outfit', () => {
  const result = offlineReply({ message: '换上婚纱', avatarMode: 'live2d' });
  assert.equal(result.action, 'wedding');
  assert.equal(result.petAction, null);
  assert.match(result.reply, /图片|照片/);
  const system = createMessages({ message: '换上婚纱', avatarMode: 'live2d' })[0].content;
  assert.match(system, /婚纱/);
  assert.match(system, /图片/);
  assert.doesNotMatch(system, /当前画面：Live2D/);
});

test('model prompt tracks avatar mode and identifies an adult virtual companion', () => {
  const live = createMessages({ message: '你好', avatarMode: 'live2d' })[0].content;
  assert.match(live, /虚拟成年女性/);
  assert.match(live, /AI虚拟角色/);
  assert.match(live, /当前画面：Live2D/);
  assert.match(live, /预设动作/);
  assert.doesNotMatch(live, /轻动态只是已有图片/);
  const photo = createMessages({ message: '你好', avatarMode: 'photo' })[0].content;
  assert.match(photo, /图片.*镜头移动/);
});

test('pet commands work immediately even when the selected model is unavailable', async () => {
  const result = await modelReply({
    message: '挥挥手', avatarMode: 'live2d', model: 'muyu-test-model-does-not-exist:missing',
  });
  assert.equal(result.petAction, 'wave');
  assert.equal(result.provider, 'offline');
  assert.equal(result.error, undefined);
});

test('free chat still uses the selected local model and never executes generated action text', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (url === 'http://127.0.0.1:11434/api/tags') {
      return Response.json({ models: [{ name: 'local-test:latest', size: 1024 }] });
    }
    assert.equal(url, 'http://127.0.0.1:11434/api/chat');
    return Response.json({ message: { role: 'assistant', content: '挥挥手。你提到的新计划里，最想先试哪一步？' }, done: true });
  });
  const result = await modelReply({
    message: '我在考虑一个新计划', avatarMode: 'live2d', model: 'local-test:latest',
    history: [{ role: 'user', content: '摸摸头' }],
  });
  assert.equal(result.provider, 'ollama');
  assert.match(result.reply, /新计划/);
  assert.equal(result.petAction, null);
  assert.equal(result.action, null);
});

test('chat API preserves avatar mode and rejects unsupported mode values', async (t) => {
  const app = await startServer({ prewarm: false, port: 0 });
  t.after(() => app.close());
  const post = (body) => fetch(`http://127.0.0.1:${app.port}/api/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const live = await (await post({ message: '摸摸头', avatarMode: 'live2d' })).json();
  assert.equal(live.petAction, 'pat');
  const photo = await (await post({ message: '摸摸头', avatarMode: 'photo' })).json();
  assert.equal(photo.petAction, null);
  assert.equal((await post({ message: '你好', avatarMode: 'video' })).status, 400);
  const legacy = await (await post({ message: '你可以动起来吗' })).json();
  assert.match(legacy.reply, /图片|镜头/);
});
