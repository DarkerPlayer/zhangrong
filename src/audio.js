import { createStreamPlayer, consumeAudioStream } from "./speech-stream.mjs";
import { speechLevel } from "./speech-level.mjs";
let context, source, rainFilter, gain, audio, blobUrl;
let rainGeneration = 0;
export async function setRain(enabled, volume = 0.35) {
  const generation = ++rainGeneration;
  if (!enabled) {
    if (source) {
      source.stop();
      source.disconnect();
      source.buffer = null;
      source = null;
    }
    rainFilter?.disconnect();
    gain?.disconnect();
    rainFilter = gain = null;
    if (context && !speechRequest && !streamPlayer && !audio)
      await context.suspend();
    return;
  }
  context ||= new (window.AudioContext || window.webkitAudioContext)();
  await context.resume();
  if (generation !== rainGeneration) return;
  if (!source) {
    const length = context.sampleRate * 4,
      buffer = context.createBuffer(2, length, context.sampleRate);
    for (let c = 0; c < 2; c++) {
      const data = buffer.getChannelData(c);
      let last = 0;
      for (let i = 0; i < length; i++) {
        last = (last + 0.025 * (Math.random() * 2 - 1)) / 1.025;
        data[i] = last * 3.5;
      }
    }
    source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    rainFilter = context.createBiquadFilter();
    rainFilter.type = "lowpass";
    rainFilter.frequency.value = 2800;
    gain = context.createGain();
    gain.gain.value = 0;
    source.connect(rainFilter);
    rainFilter.connect(gain);
    gain.connect(context.destination);
    source.start();
  }
  gain.gain.setTargetAtTime(volume * 0.8, context.currentTime, 0.3);
}
let speechGeneration = 0;
let speechRequest, streamPlayer;
let analyser,
  speechSource,
  samples;
export function getSpeechLevel() {
  if (
    !analyser ||
    !(streamPlayer?.playing || (audio && !audio.paused && !audio.ended))
  )
    return 0;
  analyser.getFloatTimeDomainData(samples);
  // Each renderer applies time-based smoothing once, keeping pauses crisp.
  return speechLevel(samples);
}
function releaseSpeechAudio() {
  streamPlayer?.cancel();
  streamPlayer = null;
  if (audio) {
    audio.pause();
    audio = null;
  }
  speechSource?.disconnect();
  analyser?.disconnect();
  speechSource = analyser = samples = null;
  if (blobUrl) {
    URL.revokeObjectURL(blobUrl);
    blobUrl = null;
  }
}
export function stopSpeech() {
  speechGeneration++;
  speechRequest?.abort();
  speechRequest = null;
  releaseSpeechAudio();
  window.speechSynthesis?.cancel();
}
export async function speak(text, onEnd = () => {}, onStart = () => {}, { voiceProfileId, lookId } = {}) {
  stopSpeech();
  const generation = speechGeneration;
  const request = new AbortController();
  speechRequest = request;
  try {
    const response = await fetch("/api/tts", {
      method: "POST",
      signal: request.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: text.slice(0, 1500),
        stream: !!(window.AudioContext || window.webkitAudioContext),
        ...(voiceProfileId ? { voiceProfileId } : {}),
        ...(lookId ? { lookId } : {}),
      }),
    });
    if (!response.ok) {
      const details = await response.json().catch(() => ({}));
      throw new Error(details.error || "本地声音暂时不可用，请重试。");
    }
    if (
      response.headers?.get("Content-Type")?.includes("application/x-ndjson")
    ) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      context ||= new AudioContext();
      await context.resume();
      if (generation !== speechGeneration) return;
      analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      samples = new Float32Array(analyser.fftSize);
      analyser.connect(context.destination);
      const player = createStreamPlayer({
        context,
        destination: analyser,
        onStart: () => {
          if (generation === speechGeneration) onStart();
        },
        onEnd: () => {
          if (generation === speechGeneration) {
            releaseSpeechAudio();
            onEnd();
          }
        },
      });
      streamPlayer = player;
      await consumeAudioStream(response, (audio) => player.push(audio), {
        signal: request.signal,
      });
      if (generation !== speechGeneration) return;
      player.finish();
      await player.finished;
      return;
    }
    const blob = await response.blob();
    if (generation !== speechGeneration) return;
    blobUrl = URL.createObjectURL(blob);
    audio = new Audio(blobUrl);
    const finish = () => {
      if (generation !== speechGeneration) return;
      releaseSpeechAudio();
      onEnd();
    };
    audio.onended = finish;
    audio.onerror = () => {
      if (generation !== speechGeneration) return;
      releaseSpeechAudio();
      onEnd(new Error("声音播放失败，请重试。"));
    };
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      context ||= new AudioContext();
      await context.resume();
      if (generation !== speechGeneration || !audio) return;
      analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      samples = new Float32Array(analyser.fftSize);
      speechSource = context.createMediaElementSource(audio);
      speechSource.connect(analyser);
      analyser.connect(context.destination);
    }
    await audio.play();
    if (generation === speechGeneration) onStart();
  } catch (error) {
    if (generation !== speechGeneration) return;
    releaseSpeechAudio();
    onEnd(new Error(error?.message || "本地声音暂时不可用，请重试。"));
  } finally {
    if (speechRequest === request) speechRequest = null;
  }
}
