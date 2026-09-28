// Turn PCM amplitude into a normalized mouth opening; silence remains closed.
export function speechLevel(samples) {
  if (!samples?.length) return 0;
  let energy = 0;
  for (const value of samples) energy += value * value;
  const rms = Math.sqrt(energy / samples.length);
  return Math.min(1, Math.max(0, (rms - 0.008) * 7));
}
