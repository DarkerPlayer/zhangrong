// Explicit per-look opt-in; mesh gestures preserve the existing portrait.
export const CUTE_MESH_ACTIONS = Object.freeze([
  {kind:'cute_blink',label:'轻轻眨眼',durationMs:1400},
  {kind:'cute_double_blink',label:'俏皮双眨眼',durationMs:1900},
  {kind:'cute_wink_left',label:'左眼 Wink',durationMs:2200},
  {kind:'cute_wink_right',label:'右眼 Wink',durationMs:2200},
  {kind:'cute_tilt_left',label:'向左歪头',durationMs:2900},
  {kind:'cute_tilt_right',label:'向右歪头',durationMs:2900},
  {kind:'cute_nod',label:'乖巧点头',durationMs:2600},
  {kind:'cute_shake',label:'轻轻摇头',durationMs:2900},
  {kind:'cute_sleepy',label:'困困闭眼',durationMs:3800},
  {kind:'cute_sway',label:'开心摇摆',durationMs:3500},
].map(Object.freeze));
export const CUTE_FRAME_ACTIONS = Object.freeze([
  {kind:'cute_heart',label:'双手比心',asset:'heart'},
  {kind:'cute_finger_heart',label:'指尖比心',asset:'finger-heart'},
  {kind:'cute_paws',label:'狐爪卖萌',asset:'paws'},
  {kind:'cute_cheeks',label:'双手捧脸',asset:'cheeks'},
  {kind:'cute_giggle',label:'掩嘴偷笑',asset:'giggle'},
  {kind:'cute_tail_hug',label:'抱抱尾巴',asset:'tail-hug',fullBody:true},
].map(Object.freeze));
export const CUTE_ACTIONS = Object.freeze([...CUTE_MESH_ACTIONS,...CUTE_FRAME_ACTIONS]);
export const supportedCuteMotions = look => CUTE_MESH_ACTIONS.filter(({kind})=>look?.cuteMotions?.includes(kind));
