export const createSecondaryMotion = (names = []) => Object.fromEntries(names.map((name) => [name, { value: 0, velocity: 0 }]));

export function stepSecondaryMotion(state, targets = {}, deltaMs = 0, options = {}) {
  let remaining = Math.min(250, Math.max(0, Number(deltaMs) || 0)) / 1000;
  const stiffness = Math.max(0, Number(options.stiffness) || 72);
  const damping = Math.max(0, Number(options.damping) || 13);
  const maxStep = 1 / 120;
  while (remaining > 0) {
    const dt = Math.min(maxStep, remaining);
    for (const [name, channel] of Object.entries(state)) {
      const target = Number.isFinite(targets[name]) ? targets[name] : 0;
      channel.velocity += (target - channel.value) * stiffness * dt;
      channel.velocity *= Math.exp(-damping * dt);
      channel.value += channel.velocity * dt;
      if (!Number.isFinite(channel.value) || !Number.isFinite(channel.velocity)) {
        channel.value = 0;
        channel.velocity = 0;
      }
    }
    remaining -= dt;
  }
  return state;
}
