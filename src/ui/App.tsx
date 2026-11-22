import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Card, ContentIssue, ContentPack } from '../core/content';
import {
  applyAction,
  caravanSpeed,
  cardById,
  legBiome,
  legLength,
  newGame,
  replay,
  showIncome,
  type Action,
  type GameState,
  type LogEntry,
} from '../core/engine';
import { downloadJson, loadLang, loadRun, saveLang, saveRun, type SavedRun } from '../platform/save';
import { loc, t, type Lang } from './i18n';

const TRAVEL_MS = 1100;

export interface PackResult {
  pack?: ContentPack;
  issues: ContentIssue[];
}

interface Run {
  seed: number;
  actions: Action[];
  state: GameState;
}

function randomSeed() {
  return Math.floor(Math.random() * 1_000_000);
}

function rebuild(pack: ContentPack, saved: SavedRun): Run | null {
  try {
    const state = replay(pack, saved.seed, saved.actions);
    return { seed: saved.seed, actions: saved.actions, state };
  } catch {
    return null;
  }
}

export function App({ packResult }: { packResult: PackResult }) {
  const { pack, issues } = packResult;
  const [lang, setLang] = useState<Lang>(loadLang);
  const [run, setRun] = useState<Run | null>(null);
  const [inMenu, setInMenu] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const [traveling, setTraveling] = useState<{ before: GameState } | null>(null);

  // Restore the saved run, and rebuild it whenever the content pack hot-reloads.
  const packRef = useRef<ContentPack | undefined>(undefined);
  useEffect(() => {
    if (!pack || packRef.current === pack) return;
    packRef.current = pack;
    const saved = run ? { packVersion: pack.version, seed: run.seed, actions: run.actions } : loadRun();
    if (!saved) return;
    const rebuilt = rebuild(pack, saved);
    if (rebuilt) setRun(rebuilt);
    else {
      setRun(null);
      saveRun(null);
      setInMenu(true);
      setNotice(t(lang, 'saveLost'));
    }
  }, [pack]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '`' || e.key === 'ё') setDebugOpen((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const switchLang = () => {
    const next = lang === 'ru' ? 'en' : 'ru';
    setLang(next);
    saveLang(next);
  };

  if (!pack) return <ContentErrors lang={lang} issues={issues} />;

  const start = (seed: number) => {
    const state = newGame(pack, seed);
    const r = { seed, actions: [], state };
    setRun(r);
    saveRun({ packVersion: pack.version, seed, actions: [] });
    setInMenu(false);
    setNotice(null);
  };

  const act = (action: Action) => {
    if (!run || traveling) return;
    const before = run.state;
    const state = applyAction(pack, before, action);
    const actions = [...run.actions, action];
    setRun({ ...run, actions, state });
    saveRun({ packVersion: pack.version, seed: run.seed, actions });
    // Animate the wagon on the road between decisions.
    if (before.phase.kind === 'road' || state.phase.kind === 'road') {
      setTraveling({ before });
      setTimeout(() => setTraveling(null), TRAVEL_MS);
    }
  };

  return (
    <div class="app">
      <header class="topbar">
        <button class="link" onClick={() => setInMenu(true)}>
          {t(lang, 'menu')}
        </button>
        <span class="topbar-title">{t(lang, 'title')}</span>
        <span class="topbar-right">
          <button class="link" onClick={() => setDebugOpen((v) => !v)}>
            {t(lang, 'debug')}
          </button>
          <button class="link" onClick={switchLang}>
            {lang === 'ru' ? 'EN' : 'RU'}
          </button>
        </span>
      </header>

      {inMenu || !run ? (
        <Menu lang={lang} canContinue={!!run && run.state.phase.kind !== 'ended'} onContinue={() => setInMenu(false)} onStart={start} notice={notice} />
      ) : (
        <Game lang={lang} pack={pack} run={run} traveling={traveling} onAct={act} onRestart={() => start(randomSeed())} />
      )}

      {debugOpen && <DebugPanel lang={lang} pack={pack} issues={issues} run={run} onClose={() => setDebugOpen(false)} onStart={start} />}
    </div>
  );
}

// ---------------- screens ----------------

function Menu(props: { lang: Lang; canContinue: boolean; onContinue: () => void; onStart: (seed: number) => void; notice: string | null }) {
  const { lang } = props;
  const [seed, setSeed] = useState(String(randomSeed()));
  return (
    <main class="screen menu">
      <h1>{t(lang, 'title')}</h1>
      <p class="muted">{t(lang, 'subtitle')}</p>
      {props.notice && <p class="notice">{props.notice}</p>}
      <div class="menu-buttons">
        {props.canContinue && (
          <button class="choice primary" onClick={props.onContinue}>
            {t(lang, 'continueRun')}
          </button>
        )}
        <button class="choice" onClick={() => props.onStart(Number(seed) || 0)}>
          {t(lang, 'newRun')}
        </button>
        <label class="seed">
          {t(lang, 'seed')}
          <input value={seed} onInput={(e) => setSeed((e.target as HTMLInputElement).value.replace(/\D/g, ''))} inputMode="numeric" />
        </label>
      </div>
    </main>
  );
}

function Game(props: {
  lang: Lang;
  pack: ContentPack;
  run: Run;
  traveling: { before: GameState } | null;
  onAct: (a: Action) => void;
  onRestart: () => void;
}) {
  const { lang, pack, run, traveling, onAct } = props;
  const s = run.state;
  return (
    <main class="screen game">
      <Hud lang={lang} pack={pack} state={s} />
      {traveling ? (
        <Travel lang={lang} pack={pack} before={traveling.before} after={s} />
      ) : s.phase.kind === 'road' ? (
        <CardView key={s.turn} lang={lang} pack={pack} state={s} onAct={onAct} />
      ) : s.phase.kind === 'town' ? (
        <TownView lang={lang} pack={pack} state={s} onAct={onAct} />
      ) : (
        <EndView lang={lang} pack={pack} run={run} onRestart={props.onRestart} />
      )}
    </main>
  );
}

function Hud({ lang, pack, state }: { lang: Lang; pack: ContentPack; state: GameState }) {
  const biome = state.phase.kind === 'road' ? legBiome(pack, state.phase.leg) : legBiome(pack, state.phase.kind === 'town' ? state.phase.town : 0);
  const speed = caravanSpeed(pack, state, biome);
  return (
    <section class="hud">
      <div class="stats">
        <Stat label={t(lang, 'money')} value={state.money} />
        <Stat label={t(lang, 'miles')} value={Math.round(state.miles)} />
        <Stat label={t(lang, 'speed')} value={speed} />
      </div>
      <ThreatBar lang={lang} distance={state.threatDistance} speed={state.threatSpeed} />
      <div class="horses">
        {pack.horses.map((h) => {
          const hs = state.horses.find((x) => x.id === h.id);
          return (
            <div class={`horse ${hs ? '' : 'gone'} ${hs && hs.stamina <= 0 ? 'spent' : ''}`} key={h.id}>
              <span class="horse-name">{loc(lang, h.name)}</span>
              <span class="bar">
                <span class="bar-fill" style={{ width: `${hs ? hs.stamina : 0}%` }} />
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div class="stat">
      <span class="stat-label">{label}</span>
      <span class="stat-value">{value}</span>
    </div>
  );
}

function ThreatBar({ lang, distance, speed }: { lang: Lang; distance: number; speed: number }) {
  const max = 40;
  const pct = Math.max(0, Math.min(1, distance / max)) * 100;
  const danger = distance < speed * 1.5;
  return (
    <div class={`threat ${danger ? 'danger' : ''}`}>
      <div class="threat-track">
        <span class="threat-hunt">{t(lang, 'hunt')}</span>
        <span class="threat-gap" style={{ width: `${pct}%` }} />
        <span class="threat-wagon">▣</span>
      </div>
      <span class="threat-label">
        {t(lang, 'gap')}: {Math.max(0, Math.round(distance))} · {t(lang, 'huntSpeed')} {speed.toFixed(1)} {t(lang, 'perStep')}
      </span>
    </div>
  );
}

function horseName(pack: ContentPack, lang: Lang, id: string | null) {
  const h = pack.horses.find((h) => h.id === id);
  return h ? loc(lang, h.name) : '?';
}

function CardView({ lang, pack, state, onAct }: { lang: Lang; pack: ContentPack; state: GameState; onAct: (a: Action) => void }) {
  if (state.phase.kind !== 'road') return null;
  const card = cardById(pack, state.phase.card);
  const params = { horse: horseName(pack, lang, state.phase.subject) };
  const leg = state.phase.leg;
  const next = pack.towns[leg + 1]!;
  return (
    <section class="card-area">
      <p class="muted small">
        {t(lang, 'leg')} {t(lang, 'to')} {loc(lang, next.name)}: {Math.min(Math.round(state.legMiles), legLength(pack, leg))} / {legLength(pack, leg)}
      </p>
      <CardFace lang={lang} card={card} params={params} onPick={(choice, timedOut) => onAct({ type: 'choose', choice, timedOut })} />
    </section>
  );
}

function CardFace({ lang, card, params, onPick }: { lang: Lang; card: Card; params: Record<string, string>; onPick: (c: number, timedOut?: boolean) => void }) {
  const [left, setLeft] = useState(card.timer ?? 0);
  useEffect(() => {
    if (!card.timer) return;
    const started = Date.now();
    const id = setInterval(() => {
      const remaining = card.timer! - (Date.now() - started) / 1000;
      if (remaining <= 0) {
        clearInterval(id);
        onPick(card.defaultChoice, true);
      } else setLeft(remaining);
    }, 100);
    return () => clearInterval(id);
  }, [card.id]);
  return (
    <div class="card">
      <p class="card-text">{loc(lang, card.text, params)}</p>
      {card.timer && (
        <div class="timer">
          <span class="timer-fill" style={{ width: `${(left / card.timer) * 100}%` }} />
          <span class="timer-label">
            {left.toFixed(1)} {t(lang, 'timeLeft')}
          </span>
        </div>
      )}
      <div class="choices">
        {card.choices.map((ch, i) => (
          <button class="choice" key={i} onClick={() => onPick(i)}>
            {loc(lang, ch.label, params)}
          </button>
        ))}
      </div>
    </div>
  );
}

function Travel({ lang, pack, before, after }: { lang: Lang; pack: ContentPack; before: GameState; after: GameState }) {
  const diffs: string[] = [];
  const dm = after.money - before.money;
  if (dm) diffs.push(`${t(lang, 'money')} ${dm > 0 ? '+' : ''}${dm}`);
  const dt = Math.round(after.threatDistance - before.threatDistance);
  if (dt) diffs.push(`${t(lang, 'hunt')} ${dt > 0 ? '+' : ''}${dt}`);
  const newLog = after.log.slice(before.log.length).filter((l) => l.kind !== 'card' && l.kind !== 'leave');
  return (
    <section class="card-area">
      <div class="card travel">
        <div class="road">
          <span class="wagon">▣▸</span>
        </div>
        <p class="muted">{t(lang, 'onTheRoad')}</p>
        {diffs.length > 0 && <p class="diffs">{diffs.join(' · ')}</p>}
        {newLog.map((l, i) => (
          <p class="event" key={i}>
            {logLine(lang, pack, l)}
          </p>
        ))}
      </div>
    </section>
  );
}

function TownView({ lang, pack, state, onAct }: { lang: Lang; pack: ContentPack; state: GameState; onAct: (a: Action) => void }) {
  if (state.phase.kind !== 'town') return null;
  const town = pack.towns[state.phase.town]!;
  const showsLeft = town.maxShows - state.phase.shows;
  const income = showIncome(pack, state, state.phase.town);
  const next = pack.towns[state.phase.town + 1]!;
  const recent = state.log.slice(-3).filter((l) => l.kind === 'show' || l.kind === 'hunt' || l.kind === 'exhausted');
  return (
    <section class="card-area">
      <div class="card town">
        <p class="muted small">{t(lang, 'town')}</p>
        <h2>{loc(lang, town.name)}</h2>
        <p class="muted">
          {t(lang, 'wealth')}: {'●'.repeat(Math.max(1, Math.round(town.wealth * 2)))} · {t(lang, 'showsLeft')}: {showsLeft}
        </p>
        {recent.map((l, i) => (
          <p class="event" key={i}>
            {logLine(lang, pack, l)}
          </p>
        ))}
        <div class="choices">
          <button class="choice" disabled={showsLeft <= 0} onClick={() => onAct({ type: 'choose', choice: 0 })}>
            {showsLeft > 0 ? `${t(lang, 'giveShow')} (+${income})` : t(lang, 'noMoreShows')}
          </button>
          <button class="choice" onClick={() => onAct({ type: 'choose', choice: 1 })}>
            {t(lang, 'leave')} → {loc(lang, next.name)} ({t(lang, 'legLength')} {next.distance})
          </button>
        </div>
      </div>
    </section>
  );
}

function EndView({ lang, pack, run, onRestart }: { lang: Lang; pack: ContentPack; run: Run; onRestart: () => void }) {
  const s = run.state;
  const outcome = s.phase.kind === 'ended' ? s.phase.outcome : 'caught';
  const lines = useMemo(() => s.log.map((l) => logLine(lang, pack, l)).filter(Boolean), [s, lang, pack]);
  return (
    <section class="card-area">
      <div class="card end">
        <h2>{t(lang, outcome)}</h2>
        <p class="muted">
          {t(lang, 'horsesLeft')}: {s.horses.length} / {pack.horses.length} · {t(lang, 'money')}: {s.money} · {t(lang, 'turns')}: {s.turn}
        </p>
        <h3>{t(lang, 'history')}</h3>
        <ol class="history">
          {lines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ol>
        <div class="choices">
          <button class="choice primary" onClick={onRestart}>
            {t(lang, 'newRun')}
          </button>
          <button
            class="choice"
            onClick={() => downloadJson(`monkeyball-run-${run.seed}.json`, { packVersion: pack.version, seed: run.seed, actions: run.actions, log: s.log })}
          >
            {t(lang, 'download')}
          </button>
        </div>
      </div>
    </section>
  );
}

export function logLine(lang: Lang, pack: ContentPack, l: LogEntry): string {
  const town = (id: string) => {
    const tw = pack.towns.find((t) => t.id === id);
    return tw ? loc(lang, tw.name) : id;
  };
  switch (l.kind) {
    case 'card': {
      const card = pack.cards.find((c) => c.id === l.card);
      if (!card) return '';
      const params = { horse: horseName(pack, lang, l.subject) };
      return `${loc(lang, card.text, params)} → ${loc(lang, card.choices[l.choice === 0 ? 0 : 1].label, params)}${l.timedOut ? ' ' + t(lang, 'logTimedOut') : ''}`;
    }
    case 'arrive':
      return t(lang, 'logArrive', { town: town(l.town) });
    case 'show':
      return t(lang, 'logShow', { town: town(l.town), n: l.income });
    case 'leave':
      return t(lang, 'logLeave', { town: town(l.town) });
    case 'hunt':
      return t(lang, 'logHunt', { horse: horseName(pack, lang, l.horse) });
    case 'exhausted':
      return t(lang, 'logExhausted', { horse: horseName(pack, lang, l.horse) });
    case 'hunger':
      return t(lang, 'logHunger');
    case 'end':
      return t(lang, l.outcome === 'survived' ? 'logEndSurvived' : 'logEndCaught');
  }
}

// ---------------- dev tools ----------------

function ContentErrors({ lang, issues }: { lang: Lang; issues: ContentIssue[] }) {
  return (
    <main class="screen errors">
      <h2>{t(lang, 'contentErrors')}</h2>
      <p class="muted">{t(lang, 'contentErrorsHint')}</p>
      <ul>
        {issues.map((i, n) => (
          <li key={n} class={i.level}>
            <b>{i.where}</b>: {i.message}
          </li>
        ))}
      </ul>
    </main>
  );
}

function DebugPanel(props: { lang: Lang; pack: ContentPack; issues: ContentIssue[]; run: Run | null; onClose: () => void; onStart: (seed: number) => void }) {
  const { lang, pack, run } = props;
  const [cardId, setCardId] = useState(pack.cards[0]!.id);
  const [preview, setPreview] = useState<string | null>(null);
  const s = run?.state;
  return (
    <aside class="debug">
      <div class="debug-head">
        <b>{t(lang, 'debug')}</b>
        <button class="link" onClick={props.onClose}>
          {t(lang, 'close')}
        </button>
      </div>
      <p class="small">
        pack {pack.version} · {pack.cards.length} cards
      </p>
      {s && (
        <pre class="small">
          {JSON.stringify(
            {
              seed: run!.seed,
              turn: s.turn,
              phase: s.phase,
              threat: { distance: s.threatDistance, speed: s.threatSpeed },
              flags: s.flags,
              scheduled: s.scheduled,
              horses: s.horses,
            },
            null,
            1,
          )}
        </pre>
      )}
      <div class="debug-row">
        <select value={cardId} onChange={(e) => setCardId((e.target as HTMLSelectElement).value)}>
          {pack.cards.map((c) => (
            <option key={c.id} value={c.id}>
              {c.id}
            </option>
          ))}
        </select>
        <button onClick={() => setPreview(cardId)}>{t(lang, 'previewCard')}</button>
      </div>
      {preview && (
        <div class="debug-preview">
          <CardFace key={preview} lang={lang} card={cardById(pack, preview)} params={{ horse: loc(lang, pack.horses[0]!.name) }} onPick={() => setPreview(null)} />
        </div>
      )}
      {props.issues.length > 0 && (
        <ul class="small">
          {props.issues.map((i, n) => (
            <li key={n} class={i.level}>
              {i.where}: {i.message}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
