// npm run bot [-- runs] — plays many runs with simple strategies and prints balance stats.
import { applyAction, newGame, type GameState } from '../src/core/engine';
import { Rng } from '../src/core/rng';
import { loadPackFromDisk } from './load-node';

const { pack } = loadPackFromDisk();
if (!pack) throw new Error('content pack invalid, run npm run validate');
const runs = Number(process.argv[2] ?? 2000);

type Strategy = (s: GameState, rng: Rng) => number;
const strategies: Record<string, Strategy> = {
  random: (_s, rng) => (rng.next() < 0.5 ? 0 : 1),
  // Gives one show per town, picks choices at random on the road.
  oneShow: (s, rng) => (s.phase.kind === 'town' ? (s.phase.shows < 1 ? 0 : 1) : rng.next() < 0.5 ? 0 : 1),
  // Never performs: just runs.
  neverShow: (s, rng) => (s.phase.kind === 'town' ? 1 : rng.next() < 0.5 ? 0 : 1),
};

for (const [name, strat] of Object.entries(strategies)) {
  let survived = 0, horsesLeft = 0, turns = 0, money = 0;
  for (let i = 0; i < runs; i++) {
    let s = newGame(pack, i + 1);
    const rng = new Rng(i * 7919 + 13);
    let guard = 0;
    while (s.phase.kind !== 'ended' && guard++ < 500) s = applyAction(pack, s, { type: 'choose', choice: strat(s, rng) });
    if (s.phase.kind === 'ended' && s.phase.outcome === 'survived') survived++;
    horsesLeft += s.horses.length;
    turns += s.turn;
    money += s.money;
  }
  console.log(
    `${name.padEnd(10)} выжили ${((survived / runs) * 100).toFixed(1)}%  лошадей в конце ${(horsesLeft / runs).toFixed(2)}  ходов ${(turns / runs).toFixed(1)}  денег ${(money / runs).toFixed(0)}`,
  );
}
