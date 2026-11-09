// Exact critically damped spring for display motion.
export function springStep(position: number, velocity: number, target: number, seconds: number) {
  const omega = 19, dt = Math.min(.064, Math.max(0, seconds)), offset = position - target;
  const impulse = velocity + omega * offset, decay = Math.exp(-omega * dt);
  return { position: target + (offset + impulse * dt) * decay, velocity: (velocity - omega * impulse * dt) * decay };
}
