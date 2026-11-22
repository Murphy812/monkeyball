// Small seeded PRNG (mulberry32). The whole state is one 32-bit number,
// so it lives inside GameState and a run is fully reproducible from its seed.

export function nextRandom(state: number): [value: number, next: number] {
  let t = (state + 0x6d2b79f5) | 0;
  const next = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, next];
}

export function seedFromString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h | 0;
}

/** Mutable helper used inside a single engine step. */
export class Rng {
  constructor(public state: number) {}
  next(): number {
    const [v, n] = nextRandom(this.state);
    this.state = n;
    return v;
  }
  pick<T>(items: readonly T[]): T | undefined {
    if (items.length === 0) return undefined;
    return items[Math.floor(this.next() * items.length)];
  }
  weighted<T>(items: readonly T[], weight: (t: T) => number): T | undefined {
    const total = items.reduce((s, t) => s + weight(t), 0);
    if (total <= 0) return undefined;
    let r = this.next() * total;
    for (const t of items) {
      r -= weight(t);
      if (r < 0) return t;
    }
    return items[items.length - 1];
  }
}
