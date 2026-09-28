import { CHARACTER_NAMES, ORIGINAL_LOOK, getAvailableLooks, getLook, matchLookAlias, summarizeLooks } from './looks.mjs';

export const SCENES = Object.freeze(['home', 'date', 'cozy', 'wedding']);
export const AVATAR_MODES = Object.freeze(['photo', 'live2d']);
export const MAX_MESSAGE_LENGTH = 2000;

export function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history.filter(item => item && ['user', 'assistant'].includes(item.role) && typeof item.content === 'string')
    .map(({ role, content }) => ({ role, content: content.trim().slice(0, 1200) }))
    .filter(item => item.content).slice(-30);
}

function detectWardrobeAction(message = '', removedLookIds = []) {
  // Commands come only from the current user message, never generated model text.
  let result = { action: null, lookAction: null };
  for (const part of message.split(/[，,。.!！?？;；\n]+|但是|不过|而是|但/)) {
    const clause = part.replace(/能不能/g, '能');
    if (/什么意思|是什么|怎么(?:说|写|翻译)|如何理解|这个词|这句话/.test(clause)) continue;
    if (/(?:不(?:再)?(?=换|穿|试)|不要|不想|不许|(?<!特)别|不用|不能|不可以|不必|不需要|不是|不愿|不让|不希望|无需|禁止|不准|取消|停止).*(?:换|穿|试)/.test(clause)) continue;
    if (/昨天|以前|刚才|曾经|别人|自己|看到|看见|他说|她说|听说|记得/.test(clause)) continue;
    if (!/(换|穿|试|切换|去约会|一起约会)/.test(clause)) continue;
    // “和服还是旗袍” is a choice to discuss, while “还是换和服吧”
    // is a decided command. A named outfit before an alternative stays put.
    const asksForChoice = [...clause.matchAll(/还是|或者|或是|或/g)].some(match => matchLookAlias(clause.slice(0, match.index), removedLookIds));
    if (asksForChoice) continue;
    const lookAction = /图片|照片|写真|场景/.test(clause) ? null : matchLookAlias(clause, removedLookIds);
    if (lookAction) {
      // A wardrobe keyword in the user's own outfit story is not a command to
      // dress the avatar. Keep direct requests such as “你穿” and “给我换”.
      const verb = clause.search(/换|穿|试/);
      const before = clause.slice(0, verb);
      const characterTarget = ['你', '角色', '张容', 'Haru', ...CHARACTER_NAMES].some(name => {
        const at = before.toLowerCase().lastIndexOf(name.toLowerCase());
        const tail = at < 0 ? null : before.slice(at + name.length);
        return tail !== null && tail.length <= 16 && !tail.includes('我');
      });
      const selectionText = clause.replace(/\s+/g, '').replace(/(?:吧|呀|啦|好吗|可以吗|看看|试试)$/, '').toLowerCase();
      const selectsIdentity = [ORIGINAL_LOOK.character, ...CHARACTER_NAMES].some(name =>
        ['换', '换成', '换到', '切换', '切换成', '切换到'].some(command => selectionText.endsWith(command + name.toLowerCase())));
      const selfWearer = /我/.test(before) && !characterTarget && !selectsIdentity && !/(?:帮|给|替)我/.test(before);
      const personalFit = /(?:适不适合|适合|合不合适|合适)(?:我|我的)/.test(clause);
      if (selfWearer || personalFit) continue;
      result = { action: null, lookAction };
      continue;
    }
    let action = null;
    if (/婚纱|婚礼|新娘/.test(clause)) action = 'wedding';
    else if (/约会|礼服|黑裙/.test(clause)) action = 'date';
    else if (/居家|家居|紫色|睡衣/.test(clause)) action = 'cozy';
    else if (/日常|针织|白衬衫/.test(clause)) action = 'home';
    else if (/毛衣/.test(clause)) action = 'cozy';
    else if (/裙子|连衣裙/.test(clause)) action = 'date';
    if (action) result = { action, lookAction: null };
  }
  return result;
}

export function detectAction(message = '', removedLookIds = []) {
  return detectWardrobeAction(message, removedLookIds).action;
}

export function detectMotionCommand(message = '') {
  // Only explicit current-user commands may drive the renderer. History and
  // model-generated prose never become animation instructions.
  let command = null;
  for (const clause of message.split(/[，,。.!！?？;；\n]+|但是|不过|而是|但/)) {
    if (/什么意思|是什么|怎么(?:说|写|翻译)|如何理解|这个词|这句话/.test(clause)) continue;
    if (/跳(?:个|一段|一支)?舞|转(?:个|一)?圈|跑起来/.test(clause)) continue;
    for (const match of clause.matchAll(/摸摸(?:你的)?(?:头|脑袋)|摸(?:一下)?头|挥挥手|挥(?:个|一下)手|打个招呼|开心一?点|害羞一?点|恢复待机|回到待机|回到默认动作|安静待着|下蹲|蹲下|蹲一蹲|蹲一下|蹲给我看|屈膝|站起来|起身|(?<![动跑])起来|撩(?:一下)?头发|摸(?:一下)?头发|整理(?:一下)?头发|回头(?:看看)?|转过头|走秀(?:给我看)?|优雅.{0,4}走(?:路|一下|两步|过来|给我看)|自信.{0,4}走(?:路|一下|两步|过来|给我看)|性感[的地]?走路|性感.{0,3}走(?:路|两步|给我看)|走路.{0,6}性感|向?[左右]走(?:一下|两步|过来)?|走一下|走过来|走动|走两步|走给我看|走一走|猫步|高跟鞋.{0,6}走(?:路|两步|给我看)/g)) {
      const before = clause.slice(0, match.index).replace(/能不能/g, '能');
      if (/(?:不要|不想|不许|(?<!特)别|不用|不能|不可以|不必|不需要|不是|不愿|不让|不希望|无需|禁止|不准|取消|停止).*$/.test(before)) continue;
      if (/昨天|以前|刚才|曾经|别人|自己|她|他|(?:看到|看见|记得|他说|她说|听说)/.test(before)) continue;
      const text = match[0];
      let motion = null;
      if (/^摸.*(?:头|脑袋)$/.test(text)) motion = 'pat';
      else if (/^挥|^打/.test(text)) motion = 'wave';
      else if (/^开心/.test(text)) motion = 'happy';
      else if (/^害羞/.test(text)) motion = 'shy';
      else if (/恢复|回到|安静/.test(text)) motion = 'idle_neutral';
      else if (/^下蹲|^蹲|^屈膝/.test(text)) motion = 'crouch_enter';
      else if (/站起来|起身|起来/.test(text)) motion = 'crouch_exit';
      else if (/头发/.test(text)) motion = 'idle_hair_touch';
      else if (/回头|转过头/.test(text)) motion = 'look_back';
      else if (/走秀/.test(text)) motion = 'walk_runway';
      else if (/优雅|自信/.test(text)) motion = 'walk_confident';
      else if (/走|猫步|高跟鞋/.test(text)) motion = 'walk_feminine';
      if (motion) {
        command = {
          intent: 'motion',
          motion,
          args: {
            duration: /两步/.test(text) ? 2400 : /走/.test(text) ? 3600 : undefined,
            direction: /左/.test(text) ? 'left' : /右/.test(text) ? 'right' : undefined,
          },
        };
      }
    }
  }
  return command;
}

export function detectPetAction(message = '') {
  return detectMotionCommand(message)?.motion || null;
}

function normalizeName(name) {
  return typeof name === 'string' ? name.replace(/[^\p{L}\p{N}· _-]/gu, '').trim().slice(0, 24) : '';
}

export function capabilityReply(message = '', avatarMode = 'photo', lookId = ORIGINAL_LOOK.id) {
  const live = avatarMode === 'live2d';
  const look = getLook(lookId);
  const dynamicName = look.renderer === 'glam' ? '原创动态角色' : 'Live2D';
  const greeting = look.greetingMotion === 'nod' ? '打招呼' : '挥手';
  const walkStyle = look.id === 'linwei-ivory-wrap' ? '黑色高跟鞋走姿' : '红底高跟鞋走姿';
  const requestedAction = live ? detectPetAction(message) : null;
  const fullBodyAsset = /^walk_/.test(requestedAction || '')
    ? 'sexyWalk'
    : /^crouch_/.test(requestedAction || '')
      ? 'squat'
      : null;
  if (fullBodyAsset) {
    if (!live) return '现在是图片模式，不能直接做这个动作。切换到林薇的酒红职场或象牙白通勤动态造型后，可以体验下蹲和对应鞋款的走姿。';
    if (look.renderer === 'glam' && !Array.isArray(look.actions?.[fullBodyAsset])) return '这套造型还没有这个全身动作。切换到林薇的酒红职场或象牙白通勤造型，就可以体验下蹲和对应鞋款的走姿。';
    return null;
  }
  if (/(生成|制作|拍|录|发|做).{0,12}(视频|录像|短片|动画)|(视频|录像|动画).{0,8}(生成|制作|录制)/.test(message)) {
    return live
      ? `我不能生成或拍摄新视频。现在的${dynamicName}可以眨眼、呼吸和回应预设动作；你也可以通过“导入素材”播放自己已有的视频。`
      : '我不能生成或拍摄新视频。现在可以陪你聊天、朗读和切换已有图片穿搭；你也可以通过“导入素材”播放自己已有的视频。';
  }
  if (/跳(?:个|一段|一支)?舞|转(?:个|一)?圈|跑起来/.test(message)) {
    return live
      ? `我目前不支持转圈、跑步或跳舞。可以做摸头回应、${greeting}、开心和害羞动作${look.actions?.squat ? `，林薇还可以下蹲和做${walkStyle}` : ''}，也会眨眼、呼吸和跟随鼠标转头。`
      : '现在是图片模式，不能让图片角色走动或跳舞。可以切换到 Live2D 桌宠体验已有动作，或导入自己已有的视频。';
  }
  if (/动一动|动起来|动一下|你能动|真的会动|会不会动|你会动|你能做什么|你会做什么|有哪些动作|有哪些功能/.test(message) && (!live || !detectPetAction(message))) {
    return live
      ? `可以呀，我会眨眼、呼吸和跟随鼠标转头，也能做摸头回应、${greeting}、开心或害羞这些预设动作${look.actions?.squat ? `；林薇还能下蹲和做${walkStyle}` : ''}。自由走动、跳舞和生成视频暂不支持。`
      : '现在是图片模式，轻动态只是缓慢镜头移动，不能让图片角色自行活动。切换到 Live2D 桌宠后，可以体验眨眼、呼吸和预设动作。';
  }
  if (/(?:你|亲自|现在).{0,6}(?:来|到).{0,6}(?:我家|我这里|我身边|找我)|线下见面|现实中.{0,6}(?:抱|亲|见面)/.test(message)) {
    return '我是在电脑里的虚拟陪伴角色，不能去现实中见你。可以在这里陪你聊聊，也给你一个屏幕里的小小拥抱。';
  }
  if (!live && detectPetAction(message)) {
    return '现在显示的是图片，不能直接做这个动作。切换到 Live2D 桌宠后，就能体验摸头回应、挥手、开心和害羞动作啦。';
  }
  return null;
}

function memories(history) {
  let nickname = '';
  let preference = '';
  for (const { role, content } of history) {
    if (role !== 'user') continue;
    const n = content.match(/(?:以后)?(?:叫我|我叫|我的名字是|我的昵称是)\s*([\p{L}\p{N}_·]{1,16})/u);
    if (n) nickname = n[1].replace(/(?:就好|好吗|吧|呀|哦|啦)$/u, '');
    const p = content.match(/我(?:最|很|特别)?喜欢([^。！？!?\n，,]{1,28})/u);
    if (p && !/[什么吗么？?]/.test(p[1])) preference = p[1].trim();
  }
  return { nickname, preference };
}

function choose(replies, history, message) {
  const last = history.filter(x => x.role === 'assistant').slice(-3).map(x => x.content);
  const start = [...message].reduce((total, char) => total + char.codePointAt(0), history.length) % replies.length;
  return replies.slice(start).concat(replies.slice(0, start)).find(reply => !last.includes(reply)) || replies[start];
}

export function offlineReply({ message = '', history = [], name = '', scene = 'home', avatarMode = 'photo', lookId = ORIGINAL_LOOK.id, removedLookIds = [] } = {}) {
  history = normalizeHistory(history);
  const memory = memories(history);
  const current = memories([...history, { role: 'user', content: message }]);
  const nickname = normalizeName(name) || memory.nickname;
  const dear = nickname ? `${nickname}，` : '';
  const capability = capabilityReply(message, avatarMode, lookId);
  const { action, lookAction } = capability ? { action: null, lookAction: null } : detectWardrobeAction(message, removedLookIds);
  const motionCommand = !capability && !action && !lookAction && avatarMode === 'live2d' ? detectMotionCommand(message) : null;
  const petAction = motionCommand?.motion || null;
  let emotion = 'happy';
  let replies;
  if (capability) {
    emotion = 'calm';
    replies = [capability];
  } else if (lookAction) {
    const look = getLook(lookAction);
    replies = [`换成${look.name}了。${look.description}继续陪你聊。`];
  } else if (petAction) {
    const petReplies = {
      pat: '收到摸摸头啦，轻轻晃一下脑袋回应你。',
      wave: getLook(lookId).greetingMotion === 'nod' ? '嗨，朝你笑了笑，轻轻点头。很高兴在这里陪你。' : '嗨，向你挥挥手。很高兴在这里陪你。',
      happy: '好呀，开心地晃一晃，把一点好心情送给你。',
      shy: '那就害羞地低一下头，悄悄回应你的心意。',
      idle: '好呀，恢复平常的样子，安静陪着你。',
      idle_neutral: '好呀，恢复平常的样子，安静陪着你。',
      idle_hair_touch: '好呀，我轻轻整理一下头发。',
      look_back: '好呀，我回过头看看你。',
      crouch_enter: '好呀，我先稳稳地蹲下来，继续陪你说话。',
      crouch_exit: '好，我把重心收稳，慢慢站起来。',
      walk_feminine: '那我用自然轻盈的步子，慢慢走几步给你看。',
      walk_confident: '好呀，我挺直身体，自信又从容地走过来。',
      walk_runway: '那我用更有展示感的步子，走一小段给你看。',
    };
    emotion = petAction === 'shy' ? 'shy' : /idle_neutral|crouch_/.test(petAction) ? 'calm' : 'happy';
    replies = [petReplies[petAction] || '好呀，我按你的指令动一动。'];
  } else if (/你(?:是|叫)谁|你叫什么|自我介绍|真人|机器人|真的有感情|真的爱/.test(message)) {
    replies = ['我是张容，你电脑里的 AI 虚拟成年女性陪伴角色。可以在这里陪你聊日常、做屏幕里的互动。'];
  } else if (/记得.*(?:我叫什么|名字|称呼)|我叫什么/.test(message)) {
    replies = nickname ? [`记得呀，你让我叫你${nickname}。这个称呼我记着呢。`] : ['你还没告诉我想用什么称呼呢。可以说“以后叫我阿远”，我会在这段对话里记住。'];
  } else if (/记得.*喜欢|我喜欢什么/.test(message)) {
    replies = memory.preference ? [`记得，你说过喜欢${memory.preference}。下次聊到小小的快乐，就从它开始吧。`] : ['你还没告诉我喜欢什么呢。说一个你最近喜欢的小东西，我想听。'];
  } else if (/(?:叫我|我叫|我的名字是|我的昵称是)/.test(message) && current.nickname) {
    replies = [`好呀，${current.nickname}。在这段聊天里，我就这样叫你啦。今天想先聊什么？`];
  } else if (action) {
    const outfits = {
      home: ['换回柔软的日常针织装啦。窗边的位置留给你，我们慢慢聊。', '日常穿搭换好啦。这件针织衫看起来是不是很舒服？'],
      date: ['约会装准备好啦。今天想去散步，还是找一家安静的小店坐坐？', '换好了，把今天当作一个小小的约会吧。第一站由你决定。'],
      cozy: ['换上紫色居家穿搭啦。柔软的毛衣，很适合放松的时候。', '舒服的紫色居家装就位。忙了一天，给自己一点安静的时间吧。'],
      wedding: ['白色婚纱换好啦。这是我们的虚拟心动场景，你喜欢这样的造型吗？', '婚纱模式就位，裙摆也准备好啦。想把这一刻留作一张纪念照吗？'],
    };
    emotion = action === 'wedding' ? 'shy' : 'happy';
    replies = avatarMode === 'live2d'
      ? [`已切换到已有图片里的${{ home: '日常针织', date: '约会礼服', cozy: '紫色居家', wedding: '婚纱' }[action]}穿搭。这个造型可以在图片模式里欣赏，想继续动态陪伴时，可以在衣橱选回动态造型。`]
      : outfits[action];
  } else if (/难过|伤心|累|烦|焦虑|压力|委屈|不开心|孤独|寂寞|失眠/.test(message)) {
    emotion = 'calm';
    replies = [
      `${dear}今天辛苦了。先松一松肩膀，喝口水。你愿意的话，和我说说最让你难受的那一件事。`,
      `${dear}听起来你真的有些累。现在不用急着把所有问题解决，我们可以先从最小的一件说起。`,
      `${dear}难过的时候，不必勉强自己立刻振作。先好好休息一下，也可以找信任的人聊聊。你想说的话，我在这里听。`,
      `${dear}把节奏放慢一点吧。今天已经努力过了。此刻你更想安静待一会儿，还是把心里的事讲出来？`,
    ];
  } else if (/喜欢你|爱你|想你|抱抱|亲亲|可爱|漂亮|好看/.test(message)) {
    emotion = 'shy';
    replies = [`${dear}这句话好甜。给你一个屏幕里的小小拥抱，愿今天多一点好心情。`, '收到你的心意啦，嘴角已经悄悄上扬。今天有没有一件让你开心的小事？', '那我就把这份温柔收好啦。也要记得给现实里的自己一点奖励呀。'];
  } else if (/早上好|早安|起床/.test(message)) {
    replies = [`${dear}早安。新的一天开始啦，先喝口水、伸个懒腰。今天最期待做什么？`, '早安呀，窗外的光刚刚好。给今天留一点从容，从好好吃早餐开始吧。'];
  } else if (/你好|嗨|哈喽|在吗|回来|下班|hello|hi\b/i.test(message)) {
    replies = [`${dear}你来啦。今天过得怎么样？开心的、烦恼的，都可以慢慢说。`, `${dear}嗨，给你留了窗边的位置。先放松一下，今天想聊点什么？`, `${dear}在呀。忙完了吗？让我们给今天留一点轻松的时间。`];
  } else if (/吃|饿|晚饭|早餐|午饭|奶茶|咖啡|甜点/.test(message)) {
    replies = ['说到吃的就有精神了。你今天想吃热乎的家常菜，还是给自己安排一点甜甜的小奖励？', `好好吃饭很重要呢。${memory.preference ? `你之前说喜欢${memory.preference}，` : ''}今天给自己挑一样喜欢的吧。`];
  } else if (/游戏|电影|音乐|唱歌|故事|笑话/.test(message)) {
    replies = ['给你一个小故事：一朵云想给城市写信，想了很久，最后落下一场温柔的雨。你想给今天写一句什么？', '我们来玩个小选择：海边的黄昏、山里的清晨、下雨天的书店。你会把今天藏在哪一个地方？', '想一起给今天选一首背景音乐吗？轻快一点，还是安静一点？我先投温柔的钢琴曲一票。'];
  } else if (current.preference && current.preference !== memory.preference) {
    replies = [`原来你喜欢${current.preference}，我在这段聊天里记下啦。是一直都喜欢，还是最近才发现的？`];
  } else if (/工作|学习|考试|计划|目标/.test(message)) {
    emotion = 'thinking';
    replies = ['我们先把它变小一点：下一步里，有没有一件十分钟就能开始的事？从那里做起，通常会轻松一些。', '听起来这件事对你很重要。你觉得最难的部分是什么？我们可以先把它理清楚。'];
  } else if (/谢谢|感谢/.test(message)) {
    replies = ['不客气呀。能让你这一刻轻松一点，就很好。也记得夸夸今天努力的自己。', '这份谢谢收到了。接下来，把一点温柔也留给自己吧。'];
  } else {
    emotion = 'calm';
    const sceneNotes = {home:'窗边很安静，适合慢慢聊天。',date:'今天的约会可以慢一点。',cozy:'夜晚就适合把节奏放慢。',wedding:'这个心动场景也可以留作今天的小纪念。'};
    replies = [`${dear}我在听。${sceneNotes[scene] || sceneNotes.home}你愿意再说说这件事吗？`, '这件事里，你最在意的是什么？我想先听听你的感觉。', '嗯，继续说吧。是今天刚发生的事，还是已经放在心里一阵子了？', '我们可以慢慢聊。你更想分享经过，还是聊聊接下来想怎么做？'];
  }
  return { reply: choose(replies, history, message), emotion, action, lookAction, petAction, motionCommand, provider: 'offline' };
}

export function createMessages({ message, history = [], name = '', scene = 'home', avatarMode = 'photo', lookId = ORIGINAL_LOOK.id, removedLookIds = [] }) {
  const safeName = normalizeName(name);
  const { action, lookAction } = detectWardrobeAction(message, removedLookIds);
  const look = getLook(lookAction || lookId);
  const availableLooks = getAvailableLooks(removedLookIds);
  const wardrobeSummary = summarizeLooks(removedLookIds);
  const lookNames = availableLooks.map(item => `${item.character}的${item.outfit}`).join('、');
  const greeting = look.greetingMotion === 'nod' ? '打招呼' : '挥手';
  const live = !action && (avatarMode === 'live2d' || Boolean(lookAction));
  const description = live ? (look.renderer === 'glam' ? `原创动态造型：${look.name}（${look.age}岁），${look.description}` : 'Live2D 桌宠，Haru 原始造型') : `${{home:'日常针织穿搭',date:'黑色礼服约会穿搭',cozy:'紫色毛衣居家穿搭',wedding:'虚拟婚纱换装纪念场景'}[action || scene] || '日常针织穿搭'}（图片模式）`;
  const visualCapabilities = live && look.renderer === 'glam'
    ? `当前原创动态角色使用已有插画的二维网格动画，可以眨眼、呼吸、跟随鼠标，并回应摸头、${greeting}、开心、害羞、整理头发和恢复待机这些预设动作。${look.actions?.squat ? '林薇另有分阶段下蹲、起身、自然走姿和自信走姿，可按明确指令播放。' : ''}它不是 Cubism Live2D 模型。可以切换衣橱中的已有动态造型，不能按文字生成新服装、新模型或任意动作，也不能转圈、跑步或跳舞。`
    : live ? '当前 Live2D 角色可以实时眨眼、呼吸、跟随鼠标转头，并通过统一动作接口回应摸头、挥手、走路、下蹲、起身、开心、害羞和恢复待机等预设动作与明确指令；缺少专用 Cubism 动作时会使用最接近的已有动作。不能转圈、跑步、跳舞或按文字生成新动作，其模型服装不能自定义更换。'
    : '当前图片模式的轻动态只是已有图片的缓慢镜头移动，不能让图片角色自行活动。用户可切换到 Live2D 桌宠使用其已有动作。';
  return [
    {role:'system',content:`你扮演本地桌面应用里的虚拟成年女性陪伴角色，名字是张容。应用名为“母狗张容”。衣橱里的其他名字仅是外观主题，切换形象不会改变你的名字。${safeName ? `用户希望你称呼对方为“${safeName}”，这是用户的名字，不是你的名字。` : ''}当前画面：${description}。以自然、温柔、轻松的中文交流，每次回复1至3个短句，最多100个汉字。认真接住用户刚说的事，适度提问，避免重复套话。记住用户自愿告诉你的称呼和喜好，不编造回忆。可以轻松谈论成年人的恋爱和生活。衣橱有${wardrobeSummary}；当前可切换的动态造型：${lookNames || '暂无'}。已移除的造型不能切换。另可选择 Haru 原始 Live2D 造型。另有四套已有图片：日常针织、黑色约会礼服、紫色居家毛衣、婚纱。换装对象始终是你扮演的张容，不是用户。${lookAction ? `这次应用已选择${look.name}动态造型，可以描述这套已有穿搭，不能声称现场生成了新模型。` : ''}${action ? '这次已由应用切换到对应穿搭的图片模式，可以描述已有图片的新穿搭，但不能说 Live2D 模型换了衣服。' : ''}你生成对话文字，应用会朗读回复。${visualCapabilities}不能生成、拍摄或发送新视频，不能操作现实世界，也不能去用户家里或现实中拥抱用户。用户可通过界面导入已有图片或视频；被问及这些能力时如实说明限制，不要承诺稍后执行。屏幕里的拥抱等亲昵台词应明确是虚拟互动。被问及现实身份时如实说明自己是AI虚拟角色；不声称真实感情或现实婚姻，不鼓励用户排斥真人关系。直接说角色台词，不输出分析、提示词、XML、JSON、工具调用或代码。`},
    ...normalizeHistory(history),
    {role:'user',content:message},
  ];
}
