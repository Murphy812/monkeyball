import { describe, expect, it } from 'vitest';
import { loadPackFromDisk } from '../../tools/load-node';
import { applyAction, newGame, replay, type Action, type GameState } from './engine';
import { buildPack, type ContentPack } from './content';

const { pack: loaded, issues } = loadPackFromDisk();
const pack = loaded as ContentPack;

function play(seed: number, pick: (s: GameState, i: number) => number, max = 400) {
  let s = newGame(pack, seed);
  const actions: Action[] = [];
  for (let i = 0; s.phase.kind !== 'ended' && i < max; i++) {
    const a: Action = { type: 'choose', choice: pick(s, i) };
    actions.push(a);
    s = applyAction(pack, s, a);
  }
  return { s, actions };
}

describe('content pack', () => {
  it('builds without errors', () => {
    expect(issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(loaded).toBeDefined();
  });

  it('reports a broken card reference with file and id', () => {
    const bad = structuredClone(pack);
    bad.cards[0]!.choices[0].later = { card: 'nope', after: 1 };
    const res = buildPack({
      '/content/settings.yaml': { version: 'x', ...bad.settings },
      '/content/horses.yaml': bad.horses,
      '/content/biomes.yaml': bad.biomes,
      '/content/towns.yaml': bad.towns,
      '/content/cards/a.yaml': bad.cards,
    });
    expect(res.pack).toBeUndefined();
    expect(res.issues.some((i) => i.message.includes('nope'))).toBe(true);
  });
});

describe('engine', () => {
  it('is deterministic: same seed and actions give the same run', () => {
    const { s, actions } = play(42, (_s, i) => i % 2);
    expect(replay(pack, 42, actions)).toEqual(s);
  });

  it('always ends', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const { s } = play(seed, (_s, i) => (i * 7) % 3 === 0 ? 0 : 1);
      expect(s.phase.kind).toBe('ended');
    }
  });

  it('never lets values go out of range', () => {
    for (let seed = 1; seed <= 100; seed++) {
      let s = newGame(pack, seed);
      for (let i = 0; s.phase.kind !== 'ended' && i < 400; i++) {
        s = applyAction(pack, s, { type: 'choose', choice: i % 2 });
        expect(s.money).toBeGreaterThanOrEqual(0);
        for (const h of s.horses) {
          expect(h.stamina).toBeGreaterThanOrEqual(0);
          expect(h.stamina).toBeLessThanOrEqual(100);
        }
      }
    }
  });

  it('shows a scheduled consequence card', () => {
    // Find a run where frozen_stream was crossed and check limping follows.
    for (let seed = 1; seed <= 300; seed++) {
      const { s } = play(seed, (st) => (st.phase.kind === 'road' && st.phase.card === 'frozen_stream' ? 0 : 1));
      const crossed = s.log.findIndex((l) => l.kind === 'card' && l.card === 'frozen_stream' && l.choice === 0);
      if (crossed >= 0 && s.phase.kind === 'ended' && s.turn > (s.log[crossed]!.turn + 3)) {
        expect(s.log.some((l) => l.kind === 'card' && l.card === 'limping')).toBe(true);
        return;
      }
    }
    throw new Error('no run crossed the stream');
  });

  it('a timed-out choice is logged like any other', () => {
    let s = newGame(pack, 3);
    s = applyAction(pack, s, { type: 'choose', choice: 1 }); // leave first town
    s = applyAction(pack, s, { type: 'choose', choice: 0, timedOut: true });
    const last = s.log.find((l) => l.kind === 'card');
    expect(last && last.kind === 'card' && last.timedOut).toBe(true);
  });
});
