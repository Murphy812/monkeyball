// Simulation core. Pure: (pack, state, action) -> new state. No DOM, no clock.
// A run = seed + list of actions, so saves, history and replays all come from the same place.
import type { Card, ContentPack, Effects } from './content';
import { Rng } from './rng';

export interface HorseState {
  id: string;
  stamina: number;
}

export type Phase =
  | { kind: 'road'; leg: number; card: string; subject: string | null }
  | { kind: 'town'; town: number; shows: number }
  | { kind: 'ended'; outcome: 'survived' | 'caught' };

export type LogEntry =
  | { turn: number; kind: 'card'; card: string; choice: number; subject: string | null; timedOut?: boolean }
  | { turn: number; kind: 'arrive'; town: string }
  | { turn: number; kind: 'show'; town: string; income: number }
  | { turn: number; kind: 'leave'; town: string }
  | { turn: number; kind: 'hunt'; horse: string }
  | { turn: number; kind: 'exhausted'; horse: string }
  | { turn: number; kind: 'hunger' }
  | { turn: number; kind: 'end'; outcome: 'survived' | 'caught' };

export interface GameState {
  packVersion: string;
  seed: number;
  rng: number;
  turn: number;
  money: number;
  /** Miles travelled in total. */
  miles: number;
  /** Miles travelled within the current leg. */
  legMiles: number;
  /** Distance between the threat and the caravan, in miles. */
  threatDistance: number;
  threatSpeed: number;
  horses: HorseState[];
  flags: string[];
  seenCards: string[];
  scheduled: { card: string; atTurn: number }[];
  phase: Phase;
  log: LogEntry[];
}

export type Action =
  | { type: 'choose'; choice: number; timedOut?: boolean };

export function newGame(pack: ContentPack, seed: number): GameState {
  const s = pack.settings;
  const state: GameState = {
    packVersion: pack.version,
    seed,
    rng: seed,
    turn: 0,
    money: s.startMoney,
    miles: 0,
    legMiles: 0,
    threatDistance: s.threatStartDistance,
    threatSpeed: s.threatSpeed,
    horses: pack.horses.map((h) => ({ id: h.id, stamina: h.stamina })),
    flags: [],
    seenCards: [],
    scheduled: [],
    phase: { kind: 'town', town: 0, shows: 0 },
    log: [],
  };
  const town = pack.towns[0]!;
  state.log.push({ turn: 0, kind: 'arrive', town: town.id });
  return state;
}

// ---------- derived values (also used by the UI) ----------

export function caravanSpeed(pack: ContentPack, state: GameState, biomeId: string): number {
  const biome = pack.biomes.find((b) => b.id === biomeId) ?? pack.biomes[0]!;
  // A tired horse still pulls at half strength; an exhausted one (0 stamina) doesn't pull at all.
  const pull = state.horses.reduce(
    (sum, h) => sum + (h.stamina > 0 ? (0.5 + h.stamina / 200) * pack.settings.pullPerHorse : 0),
    0,
  );
  return Math.round(pull * biome.speed * 10) / 10;
}

export function legBiome(pack: ContentPack, leg: number): string {
  return pack.towns[leg + 1]?.biome ?? pack.biomes[0]!.id;
}

export function legLength(pack: ContentPack, leg: number): number {
  return pack.towns[leg + 1]?.distance ?? 0;
}

export function showIncome(pack: ContentPack, state: GameState, townIndex: number): number {
  const town = pack.towns[townIndex]!;
  const avg = state.horses.reduce((s, h) => s + h.stamina, 0) / Math.max(1, state.horses.length) / 100;
  return Math.round(pack.settings.showIncome * town.wealth * avg * Math.sqrt(state.horses.length));
}

export function cardById(pack: ContentPack, id: string): Card {
  const c = pack.cards.find((c) => c.id === id);
  if (!c) throw new Error(`unknown card ${id}`);
  return c;
}

// ---------- the step function ----------

export function applyAction(pack: ContentPack, prev: GameState, action: Action): GameState {
  const state = structuredClone(prev);
  const rng = new Rng(state.rng);
  const phase = state.phase;

  if (phase.kind === 'ended') return prev;
  const choice = action.choice === 0 ? 0 : 1;

  if (phase.kind === 'road') {
    const card = cardById(pack, phase.card);
    const ch = card.choices[choice];
    state.turn++;
    state.log.push({ turn: state.turn, kind: 'card', card: card.id, choice, subject: phase.subject, timedOut: action.timedOut });
    applyEffects(state, ch.effects, phase.subject);
    if (ch.later) state.scheduled.push({ card: ch.later.card, atTurn: state.turn + ch.later.after });
    travelStep(pack, state, rng, phase.leg);
    if (state.phase.kind !== 'ended') {
      if (state.legMiles >= legLength(pack, phase.leg)) arrive(pack, state, phase.leg + 1);
      else drawCard(pack, state, rng, phase.leg);
    }
  } else if (phase.kind === 'town') {
    const town = pack.towns[phase.town]!;
    if (choice === 0 && phase.shows < town.maxShows) {
      // Give a show: earn money, tire horses, the threat keeps coming.
      state.turn++;
      const income = showIncome(pack, state, phase.town);
      state.money += income;
      for (const h of state.horses) h.stamina = clamp(h.stamina - pack.settings.showFatigue);
      state.log.push({ turn: state.turn, kind: 'show', town: town.id, income });
      phase.shows++;
      threatStep(pack, state, rng, 0);
      checkExhausted(state);
    } else {
      state.log.push({ turn: state.turn, kind: 'leave', town: town.id });
      state.legMiles = 0;
      drawCard(pack, state, rng, phase.town);
    }
  }

  state.rng = rng.state;
  return state;
}

function clamp(v: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, v));
}

function applyEffects(state: GameState, e: Effects, subject: string | null) {
  if (e.money) state.money = Math.max(0, state.money + e.money);
  if (e.threat) state.threatDistance += e.threat;
  if (e.miles) {
    state.miles += e.miles;
    state.legMiles = Math.max(0, state.legMiles + e.miles);
  }
  if (e.stamina) for (const h of state.horses) h.stamina = clamp(h.stamina + e.stamina);
  if (e.subjectStamina && subject) {
    const h = state.horses.find((h) => h.id === subject);
    if (h) h.stamina = clamp(h.stamina + e.subjectStamina);
  }
  for (const f of e.setFlags ?? []) if (!state.flags.includes(f)) state.flags.push(f);
  if (e.clearFlags) state.flags = state.flags.filter((f) => !e.clearFlags!.includes(f));
  checkExhausted(state);
}

function checkExhausted(state: GameState) {
  for (const h of state.horses) {
    if (h.stamina <= 0 && !state.log.some((l) => l.kind === 'exhausted' && l.horse === h.id && l.turn === state.turn)) {
      state.log.push({ turn: state.turn, kind: 'exhausted', horse: h.id });
    }
  }
}

function travelStep(pack: ContentPack, state: GameState, rng: Rng, leg: number) {
  const s = pack.settings;
  const speed = caravanSpeed(pack, state, legBiome(pack, leg));
  state.miles += speed;
  state.legMiles += speed;

  const feed = s.feedPerHorse * state.horses.length;
  if (state.money >= feed) {
    state.money -= feed;
    for (const h of state.horses) h.stamina = clamp(h.stamina - s.travelFatigue);
  } else {
    state.money = 0;
    state.log.push({ turn: state.turn, kind: 'hunger' });
    for (const h of state.horses) h.stamina = clamp(h.stamina - s.travelFatigue - s.hungerFatigue);
  }
  checkExhausted(state);
  threatStep(pack, state, rng, speed);
}

/** The threat advances; if it reaches the caravan it takes the weakest horse. */
function threatStep(pack: ContentPack, state: GameState, _rng: Rng, caravanMoved: number) {
  const s = pack.settings;
  state.threatDistance += caravanMoved - state.threatSpeed;
  state.threatSpeed += s.threatAcceleration;
  state.threatDistance = Math.round(state.threatDistance * 10) / 10;
  state.threatSpeed = Math.round(state.threatSpeed * 100) / 100;

  if (state.threatDistance <= 0) {
    const victim = [...state.horses].sort((a, b) => a.stamina - b.stamina)[0];
    if (victim) {
      state.horses = state.horses.filter((h) => h !== victim);
      state.log.push({ turn: state.turn, kind: 'hunt', horse: victim.id });
    }
    state.threatDistance = s.huntPushback;
    if (state.horses.length === 0) end(state, 'caught');
  }
}

function arrive(pack: ContentPack, state: GameState, townIndex: number) {
  const town = pack.towns[townIndex]!;
  state.log.push({ turn: state.turn, kind: 'arrive', town: town.id });
  if (townIndex === pack.towns.length - 1) {
    end(state, 'survived');
    return;
  }
  for (const h of state.horses) h.stamina = clamp(h.stamina + pack.settings.townRest);
  state.phase = { kind: 'town', town: townIndex, shows: 0 };
}

function end(state: GameState, outcome: 'survived' | 'caught') {
  state.phase = { kind: 'ended', outcome };
  state.log.push({ turn: state.turn, kind: 'end', outcome });
}

function requirementsMet(state: GameState, card: Card): boolean {
  const r = card.requires;
  if (!r) return true;
  if (r.flags && !r.flags.every((f) => state.flags.includes(f))) return false;
  if (r.notFlags && r.notFlags.some((f) => state.flags.includes(f))) return false;
  if (r.minMoney !== undefined && state.money < r.minMoney) return false;
  return true;
}

function drawCard(pack: ContentPack, state: GameState, rng: Rng, leg: number) {
  const subject = rng.pick(state.horses)?.id ?? null;

  // Scheduled consequences take priority when due.
  const due = state.scheduled.find((s) => s.atTurn <= state.turn + 1);
  if (due) {
    state.scheduled = state.scheduled.filter((s) => s !== due);
    state.seenCards.push(due.card);
    state.phase = { kind: 'road', leg, card: due.card, subject };
    return;
  }

  const biome = legBiome(pack, leg);
  const season = pack.settings.season;
  const eligible = (allowSeen: boolean) =>
    pack.cards.filter(
      (c) =>
        !c.scheduledOnly &&
        c.biomes.includes(biome) &&
        c.seasons.includes(season) &&
        (allowSeen || !(c.once && state.seenCards.includes(c.id))) &&
        requirementsMet(state, c),
    );
  // Avoid repeating the previous card when possible.
  const last = state.seenCards[state.seenCards.length - 1];
  let pool = eligible(false).filter((c) => c.id !== last);
  if (pool.length === 0) pool = eligible(true).filter((c) => !c.once && c.id !== last);
  if (pool.length === 0) pool = eligible(true);
  const card = rng.weighted(pool, (c) => c.weight) ?? pack.cards.find((c) => !c.scheduledOnly)!;
  state.seenCards.push(card.id);
  state.phase = { kind: 'road', leg, card: card.id, subject };
}

/** Rebuild a run from its seed and actions. */
export function replay(pack: ContentPack, seed: number, actions: Action[]): GameState {
  let s = newGame(pack, seed);
  for (const a of actions) s = applyAction(pack, s, a);
  return s;
}
