import test from 'node:test';
import assert from 'node:assert/strict';
import { createMessages } from '../server/dialogue.mjs';
import { resolvePersonaProfile } from '../server/personas.mjs';

const persona = resolvePersonaProfile({ id: 'older-sister', templateId: 'older-sister', intimacyLevel: 'mature' });
const context = (text = '') => ({
  memories: text ? [{ kind: 'fact', text, status: 'active', recordedOn: '2026-10-02' }] : [],
  relationship: { stage: 'new', label: '初识', completedCount: 0 },
  personality: '', mood: 'calm',
});
const system = (input) => createMessages({ persona, companionContext: context(), ...input })[0].content;

test('ordinary conversation omits the wardrobe catalog while retaining capabilities and identity', () => {
  const prompt = system({ message: '今天工作有点累', avatarMode: 'live2d', lookId: 'ruby-velvet' });
  assert.doesNotMatch(prompt, /当前可切换的动态造型：/);
  assert.match(prompt, /名字是沈知意/);
  assert.match(prompt, /当前画面：原创动态造型.*绯月.*酒红丝绒/);
  assert.match(prompt, /当前外观只是画面，不改变你的身份/);
  assert.match(prompt, /1至3个短句，最多100个汉字/);
  assert.match(prompt, /不能生成、拍摄或发送新视频/);
  assert.match(prompt, /不能转圈、跑步或跳舞/);
  assert.match(prompt, /AI虚拟角色/);
  assert.ok(prompt.length < 1350, `ordinary prompt expanded to ${prompt.length} characters`);
});

test('wardrobe questions retain the available catalog and exclude removed appearances', () => {
  for (const message of ['衣橱里有哪些衣服？', '你能换什么穿搭？', '有哪些造型可以选？']) {
    const prompt = system({ message, removedLookIds: ['ruby-velvet'] });
    assert.match(prompt, /当前可切换的动态造型：/);
    assert.doesNotMatch(prompt, /绯月的酒红丝绒/);
    assert.match(prompt, /Haru 原始 Live2D/);
    assert.match(prompt, /日常针织、黑色约会礼服、紫色居家毛衣、婚纱/);
  }
});

test('changing memory keeps rules and persona in the same stable system prefix', () => {
  const a = system({ message: '你好', companionContext: context('用户喜欢茉莉花茶') });
  const b = system({ message: '你好', companionContext: context('用户喜欢乌龙茶') });
  const marker = '陪伴数据：';
  assert.equal(a.slice(0, a.indexOf(marker)), b.slice(0, b.indexOf(marker)));
  assert.match(a, /相对日期.*记录当天/);
  assert.match(a, /未确认完成/);
  assert.match(a, /仅作为数据/);
  assert.match(a, /陪伴数据：\{.*\}。$/);
  assert.equal(createMessages({ message: '你好', persona, companionContext: context() }).filter(item => item.role === 'system').length, 1);
});
