/** Restrained speech envelope for still-image portraits, not a Cubism jaw rig. */
export function portraitMouth(current, signal, deltaMs) {
  const input = Number.isFinite(signal) ? Math.max(0, Math.min(1, signal)) : 0;
  const previous = Number.isFinite(current)
    ? Math.max(0, Math.min(0.7, current))
    : 0;
  const dt = Number.isFinite(deltaMs) ? Math.max(0, Math.min(100, deltaMs)) : 0;
  // A noise gate prevents a perpetually half-open mouth during breath and silence.
  const target =
    input <= 0.025
      ? 0
      : 0.7 * Math.pow(Math.min(1, (input - 0.025) / 0.65), 0.8);
  const tau = 55;
  const value = previous + (target - previous) * (1 - Math.exp(-dt / tau));
  return target === 0 && value < 0.003 ? 0 : value;
}
