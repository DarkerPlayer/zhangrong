const clamp = x => Math.min(1, Math.max(0, x));
const smooth = x => { const t=clamp(x); return t*t*(3-2*t); };
const pulse = (t,start,peak,end) => t < start || t > end ? 0 : t < peak ? smooth((t-start)/(peak-start)) : 1-smooth((t-peak)/(end-peak));
/** Finite gentle gestures; both eyelids have independent controls for a wink. */
export function sampleCutePose(id, elapsedMs, durationMs) {
  const t=clamp(elapsedMs/durationMs);
  const envelope=smooth(t/.18)*(1-smooth((t-.76)/.24));
  const pose={headAngle:0,headNod:0,headTurn:0,bodyX:0,bodyY:0,hairLag:0,smile:0,blush:0};
  if(t<=0 || t>=1) return pose;
  if(id==='cute_blink' || id==='cute_double_blink') {
    const first=pulse(t,.20,.31,.43);
    const second=id==='cute_double_blink'?pulse(t,.50,.60,.73):0;
    pose.blinkLeft=pose.blinkRight=Math.max(first,second);
  } else if(id==='cute_wink_left' || id==='cute_wink_right') {
    const close=smooth((t-.18)/.13)*(1-smooth((t-.52)/.2));
    // Left/right name the character's eye, mirrored on screen.
    pose.blinkLeft=id==='cute_wink_right'?close:0;
    pose.blinkRight=id==='cute_wink_left'?close:0;
    pose.headAngle=(id==='cute_wink_left'?-2:2)*envelope;
    pose.smile=.45*envelope;
  } else if(id==='cute_tilt_left' || id==='cute_tilt_right') {
    pose.headAngle=(id==='cute_tilt_left'?-5:5)*envelope;
    pose.headNod=.0015*envelope;
  } else if(id==='cute_nod') {
    pose.headNod=.007*Math.pow(Math.sin(t*Math.PI*2),2)*envelope;
    pose.smile=.25*envelope;
  } else if(id==='cute_shake') {
    pose.headTurn=.01*Math.sin(t*Math.PI*4)*envelope;
    pose.headAngle=1.2*Math.sin(t*Math.PI*4)*envelope;
  } else if(id==='cute_sleepy') {
    pose.blinkLeft=pose.blinkRight=smooth((t-.15)/.22)*(1-smooth((t-.68)/.22));
    pose.headNod=.004*envelope;pose.headAngle=-2*envelope;
  } else if(id==='cute_sway') {
    pose.bodyX=.008*Math.sin(t*Math.PI*4)*envelope;
    pose.headAngle=-2.3*Math.sin(t*Math.PI*4)*envelope;
    pose.hairLag=.002*Math.sin(t*Math.PI*4-.5)*envelope;
    pose.smile=.35*envelope;
  }
  return pose;
}
