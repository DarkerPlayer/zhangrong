import test from "node:test";
import assert from "node:assert/strict";
import { offlineReply, createMessages } from "../server/dialogue.mjs";
import { modelReply } from "../server/ollama.mjs";
import { startServer } from "../server/index.mjs";

test("greeting commands and capabilities describe each look's actual greeting", () => {
  for (const lookId of ["lingyue-hanfu", "amara-royal", "sakura-cafe"]) {
    for (const message of ["挥挥手", "打个招呼"]) {
      const result = offlineReply({ message, avatarMode: "live2d", lookId });
      assert.equal(result.petAction, "wave");
      assert.match(result.reply, /朝你笑了笑，轻轻点头/);
      assert.doesNotMatch(result.reply, /挥手|挥挥手/);
    }
    for (const message of ["你能做什么", "跳个舞"]) {
      const result = offlineReply({ message, avatarMode: "live2d", lookId });
      assert.match(result.reply, /打招呼/);
      assert.doesNotMatch(result.reply, /挥手/);
    }
    const system = createMessages({
      message: "你好",
      avatarMode: "live2d",
      lookId,
    })[0].content;
    assert.match(system, /打招呼/);
    assert.doesNotMatch(system, /挥手/);
  }
  for (const lookId of ["ruby-velvet", "haru-original"]) {
    assert.match(
      offlineReply({ message: "挥挥手", avatarMode: "live2d", lookId }).reply,
      /向你挥挥手/,
    );
    assert.match(
      offlineReply({ message: "你能做什么", avatarMode: "live2d", lookId })
        .reply,
      /挥手/,
    );
  }
});

test("named dynamic clothing commands select their real look instead of a photo scene", () => {
  for (const [message, lookAction] of [
    ["换黑丝晚礼服", "noir-evening"],
    ["换黑丝", "noir-evening"],
    ["穿黑色丝袜", "noir-evening"],
    ["换黑丝通勤", "noir-office"],
    ["换白衬衫", "noir-office"],
    ["换酒红丝绒", "ruby-velvet"],
    ["换约会礼服", "ruby-date"],
    ["换皮衣", "silver-leather"],
    ["换慵懒针织", "silver-knit"],
    ["换针织裙", "silver-knit"],
    ["不要换皮衣，换酒红丝绒", "ruby-velvet"],
    ["能不能换约会礼服", "ruby-date"],
    ["你穿黑丝", "noir-evening"],
    ["我想让你穿白衬衫", "noir-office"],
    ["给我换黑丝", "noir-evening"],
    ["帮我换你的角色服装成皮衣", "silver-leather"],
    ["不换皮衣，但你穿酒红丝绒", "ruby-velvet"],
    ["切换到 Haru", "haru-original"],
    ["换草莓奶油", "sakura-cafe"],
    ["换樱花和服", "sakura-kimono"],
    ["换紫藤洛丽塔", "yuki-lolita"],
    ["换雪日披肩", "yuki-snow"],
    ["换翡翠旗袍", "zhixia-qipao"],
    ["换都市白茶", "zhixia-city"],
    ["换青岚汉服", "lingyue-hanfu"],
    ["换月白仙裙", "lingyue-moon"],
    ["换巴黎花呢", "elise-paris"],
    ["换午夜蓝礼服", "elise-gala"],
    ["换薄荷街头", "mia-street"],
    ["换晴日牛仔", "mia-denim"],
    ["换阿玛拉", "amara-royal"],
    ["换非洲公主", "amara-royal"],
    ["换彩织华服", "amara-ankara"],
    ["换落日长裙", "zuri-sun"],
    ["换珍珠连体衣", "zuri-pearl"],
    ["换樱奈的樱花和服", "sakura-kimono"],
    ["换阿玛拉的彩织华服", "amara-ankara"],
    ["我想让雪乃穿雪日披肩", "yuki-snow"],
  ]) {
    for (const avatarMode of ["photo", "live2d"]) {
      const result = offlineReply({ message, avatarMode });
      assert.equal(result.lookAction, lookAction, `${avatarMode}: ${message}`);
      assert.equal(result.action, null, message);
      assert.equal(result.petAction, null, message);
      assert.doesNotMatch(result.reply, /已切换到已有图片|服装不会跟着改变/);
    }
  }
});

test("negated outfit commands and descriptions never change the current appearance", () => {
  for (const message of [
    "不要换黑丝通勤",
    "别穿约会礼服",
    "不用换皮衣",
    "不需要换酒红丝绒",
    "不是让你换约会礼服",
    "换皮衣是什么意思",
    "昨天她穿约会礼服很好看",
    "我喜欢酒红丝绒",
    "我刚才说过换皮衣",
    "能不能不要换皮衣",
    "不换黑丝",
    "不穿白衬衫",
    "不试针织裙",
    "我今天穿黑丝去上班",
    "我想试试白衬衫适不适合我",
    "我想穿黑丝",
    "试试约会礼服适不适合我",
    "我明天换针织裙",
    "不换樱花和服",
    "不要换非洲公主",
    "我今天穿翡翠旗袍",
    "我想试试巴黎花呢适不适合我",
    "樱花和服是什么颜色的",
    "我昨天看到她穿月白仙裙",
  ]) {
    const result = offlineReply({
      message,
      avatarMode: "live2d",
      lookId: "ruby-velvet",
    });
    assert.equal(result.lookAction, null, message);
    assert.equal(result.action, null, message);
  }
});

test("legacy photo outfits and explicit photo requests keep their original scene behavior", () => {
  for (const [message, action] of [
    ["换婚纱", "wedding"],
    ["换紫色毛衣", "cozy"],
    ["换日常针织", "home"],
    ["换约会裙", "date"],
    ["换成约会礼服照片", "date"],
    ["换白衬衫照片", "home"],
    ["换针织裙图片", "home"],
    ["换皮衣，换婚纱", "wedding"],
  ]) {
    const result = offlineReply({
      message,
      avatarMode: "live2d",
      lookId: "ruby-velvet",
    });
    assert.equal(result.action, action, message);
    assert.equal(result.lookAction, null, message);
  }
});

test("continued negation and outfit comparisons keep the current look", () => {
  for (const message of [
    "不再穿和服",
    "不再换黑丝",
    "你穿和服好看还是旗袍好看",
    "穿和服还是旗袍呢",
    "换和服还是旗袍",
    "换阿玛拉或者灵玥",
    "还是穿和服或旗袍呢",
  ]) {
    const result = offlineReply({
      message,
      avatarMode: "live2d",
      lookId: "ruby-velvet",
    });
    assert.equal(result.lookAction, null, message);
    assert.equal(result.action, null, message);
  }
});

test("first-person avatar selection is distinct from describing the user's own clothes", () => {
  for (const [message, lookAction] of [
    ["我想换成阿玛拉", "amara-royal"],
    ["我想切换到樱奈", "sakura-cafe"],
    ["我想换阿玛拉看看", "amara-royal"],
    ["我想切换到 Haru", "haru-original"],
    ["还是换樱花和服吧", "sakura-kimono"],
    ["还是换阿玛拉吧", "amara-royal"],
  ]) {
    assert.equal(
      offlineReply({ message, avatarMode: "live2d" }).lookAction,
      lookAction,
      message,
    );
  }
  for (const message of [
    "我今天穿樱花和服",
    "我今天换成阿玛拉同款衣服",
    "我想试试白衬衫适不适合我",
    "我不想切换到樱奈",
  ]) {
    const result = offlineReply({ message, avatarMode: "live2d" });
    assert.equal(result.lookAction, null, message);
    assert.equal(result.action, null, message);
  }
});

test("new look commands execute immediately without depending on a local language model", async (t) => {
  t.mock.method(globalThis, "fetch", () => {
    throw Error("No model call is needed to select an existing outfit");
  });
  const result = await modelReply({
    message: "换皮衣",
    avatarMode: "live2d",
    model: "missing:latest",
  });
  assert.equal(result.lookAction, "silver-leather");
  assert.equal(result.provider, "offline");
  assert.equal(result.error, undefined);
});

test("model receives the actual dynamic appearance without claiming it is a Cubism model", () => {
  const system = createMessages({
    message: "你好",
    avatarMode: "live2d",
    lookId: "ruby-velvet",
  })[0].content;
  assert.match(system, /当前画面：原创动态造型/);
  assert.match(system, /绯月.*酒红丝绒/);
  assert.match(system, /29/);
  assert.doesNotMatch(system, /其模型服装不能自定义更换/);
  const changed = createMessages({
    message: "换约会礼服",
    avatarMode: "photo",
    lookId: "ruby-velvet",
  })[0].content;
  assert.match(changed, /当前画面：原创动态造型.*绯月.*约会礼服/);
});

test("API carries supported look IDs and returns a new-look action", async (t) => {
  const app = await startServer({ prewarm: false, port: 0 });
  t.after(() => app.close());
  const post = (body) =>
    fetch(`http://127.0.0.1:${app.port}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  const result = await (
    await post({
      message: "换酒红丝绒",
      avatarMode: "live2d",
      lookId: "noir-office",
    })
  ).json();
  assert.equal(result.lookAction, "ruby-velvet");
  assert.equal(result.action, null);
  const capability = await (
    await post({
      message: "生成一个视频",
      avatarMode: "live2d",
      lookId: "ruby-velvet",
    })
  ).json();
  assert.match(capability.reply, /原创动态角色/);
  assert.equal(
    (await post({ message: "你好", lookId: "../../missing" })).status,
    400,
  );
});
