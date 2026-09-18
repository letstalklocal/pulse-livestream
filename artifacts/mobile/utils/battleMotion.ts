// One continuous path: the moving highlight blends into the score edge before
// the edge follows it. The rounded join has matching velocity at both ends.
export function battleMotionFrame(fromPercent: number, toPercent: number, width: number, side: "mine" | "peer", progress: number) {
  const p = Math.max(0, Math.min(1, progress));
  const from = width * fromPercent / 100;
  const to = width * toPercent / 100;
  const direction = side === "mine" ? 1 : -1;
  const origin = side === "mine" ? 0 : width;
  const front = origin + (to - origin) * p;
  const distance = direction * (front - from);
  const travel = Math.abs(to - from);
  const approach = Math.abs(from - origin);
  const radius = Math.min(18, travel / 2, approach / 2);
  let followed = 0;
  let merge = 0;
  if (radius > 0) {
    followed = distance <= -radius ? 0 : distance >= radius ? distance : (distance + radius) ** 2 / (4 * radius);
    const blend = Math.max(0, Math.min(1, (distance + radius) / (2 * radius)));
    merge = blend * blend * (3 - 2 * blend);
  } else {
    // A score increase can leave the ratio unchanged (one-sided scoring).
    const blend = Math.max(0, Math.min(1, (p - 0.75) / 0.25));
    merge = blend * blend * (3 - 2 * blend);
  }
  return {
    percent: p === 1 ? toPercent : width > 0 ? (from + direction * Math.min(travel, followed)) / width * 100 : toPercent,
    flowX: front - (side === "mine" ? 28 : 0),
    merge,
    flowOpacity: 1 - merge,
  };
}
