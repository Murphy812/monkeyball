// Content pack schema. Everything the narrative designer writes is validated here.
// The engine only ever sees a pack that passed `validatePack`.
import { z } from 'zod';

export const Localized = z.object({ ru: z.string().min(1), en: z.string().min(1) });
export type Localized = z.infer<typeof Localized>;

const Season = z.enum(['winter', 'spring', 'summer', 'autumn']);

export const Effects = z
  .object({
    money: z.number().int().optional(),
    /** Miles of distance between caravan and threat: positive = we gain distance. */
    threat: z.number().int().optional(),
    /** Stamina change for every horse. */
    stamina: z.number().int().optional(),
    /** Stamina change for the card's subject horse ({horse} in the text). */
    subjectStamina: z.number().int().optional(),
    /** Extra miles travelled (or lost, if negative). */
    miles: z.number().int().optional(),
    setFlags: z.array(z.string()).optional(),
    clearFlags: z.array(z.string()).optional(),
  })
  .strict();
export type Effects = z.infer<typeof Effects>;

export const Requires = z
  .object({
    flags: z.array(z.string()).optional(),
    notFlags: z.array(z.string()).optional(),
    minMoney: z.number().int().optional(),
  })
  .strict();
export type Requires = z.infer<typeof Requires>;

export const Choice = z
  .object({
    label: Localized,
    effects: Effects.default({}),
    /** Deferred consequence: this card will be shown after N road steps. */
    later: z.object({ card: z.string(), after: z.number().int().min(1) }).strict().optional(),
  })
  .strict();
export type Choice = z.infer<typeof Choice>;

export const Card = z
  .object({
    id: z.string().regex(/^[a-z0-9_]+$/, 'id: только латиница в нижнем регистре, цифры и _'),
    biomes: z.array(z.string()).min(1),
    seasons: z.array(Season).default(['winter']),
    weight: z.number().positive().default(1),
    /** Card never repeats within a run. */
    once: z.boolean().default(true),
    /** Card only appears when scheduled by `later`, never randomly. */
    scheduledOnly: z.boolean().default(false),
    requires: Requires.optional(),
    text: Localized,
    /** Optional decision timer in seconds; on timeout `defaultChoice` is taken. */
    timer: z.number().positive().optional(),
    defaultChoice: z.number().int().min(0).max(1).default(1),
    choices: z.tuple([Choice, Choice]),
  })
  .strict();
export type Card = z.infer<typeof Card>;

export const Horse = z
  .object({
    id: z.string(),
    name: Localized,
    stamina: z.number().int().min(1).max(100).default(100),
  })
  .strict();
export type Horse = z.infer<typeof Horse>;

export const Biome = z
  .object({ id: z.string(), name: Localized, speed: z.number().positive() })
  .strict();
export type Biome = z.infer<typeof Biome>;

export const Town = z
  .object({
    id: z.string(),
    name: Localized,
    /** Ticket income multiplier, roughly 0.5 (poor) .. 2 (rich). */
    wealth: z.number().positive(),
    maxShows: z.number().int().min(0).default(2),
    /** Leg leading INTO this town (ignored for the first town). */
    distance: z.number().int().positive().optional(),
    biome: z.string().optional(),
  })
  .strict();
export type Town = z.infer<typeof Town>;

export const Settings = z
  .object({
    season: Season,
    startMoney: z.number().int(),
    /** Miles each horse pulls per step at full stamina. */
    pullPerHorse: z.number().positive(),
    feedPerHorse: z.number().int().min(0),
    travelFatigue: z.number().int().min(0),
    hungerFatigue: z.number().int().min(0),
    threatStartDistance: z.number().int().positive(),
    threatSpeed: z.number().positive(),
    threatAcceleration: z.number().min(0),
    /** Distance the threat is pushed back after it takes a horse. */
    huntPushback: z.number().int().positive(),
    townRest: z.number().int().min(0),
    showIncome: z.number().positive(),
    showFatigue: z.number().int().min(0),
  })
  .strict();
export type Settings = z.infer<typeof Settings>;

export const ContentPack = z
  .object({
    version: z.string(),
    settings: Settings,
    horses: z.array(Horse).min(1),
    biomes: z.array(Biome).min(1),
    towns: z.array(Town).min(2),
    cards: z.array(Card).min(1),
  })
  .strict();
export type ContentPack = z.infer<typeof ContentPack>;

export interface ContentIssue {
  level: 'error' | 'warning';
  where: string;
  message: string;
}

/** Raw files as found on disk: path -> parsed YAML. */
export type RawFiles = Record<string, unknown>;

function zodIssues(where: string, err: z.ZodError): ContentIssue[] {
  return err.issues.map((i) => ({
    level: 'error' as const,
    where: `${where}${i.path.length ? ' → ' + i.path.join('.') : ''}`,
    message: i.message,
  }));
}

/**
 * Assemble a pack from raw YAML files and validate it.
 * File layout: settings.yaml, horses.yaml, biomes.yaml, towns.yaml, cards/*.yaml (each a list of cards).
 */
export function buildPack(files: RawFiles): { pack?: ContentPack; issues: ContentIssue[] } {
  const issues: ContentIssue[] = [];
  const get = (name: string) => {
    const key = Object.keys(files).find((k) => k.endsWith('/' + name) || k === name);
    if (!key) issues.push({ level: 'error', where: name, message: 'файл не найден' });
    return key ? files[key] : undefined;
  };

  const settingsFile = get('settings.yaml') as { version?: string } & Record<string, unknown> | undefined;
  const cards: unknown[] = [];
  const cardSource: string[] = [];
  for (const [path, data] of Object.entries(files)) {
    if (!/\/cards\/[^/]+\.ya?ml$/.test(path)) continue;
    if (!Array.isArray(data)) {
      issues.push({ level: 'error', where: path, message: 'файл карточек должен быть списком' });
      continue;
    }
    for (const c of data) {
      cards.push(c);
      cardSource.push(path);
    }
  }

  const { version, ...settings } = settingsFile ?? {};
  const raw = {
    version: version ?? 'dev',
    settings,
    horses: get('horses.yaml'),
    biomes: get('biomes.yaml'),
    towns: get('towns.yaml'),
    cards,
  };
  if (issues.length) return { issues };

  const parsed = ContentPack.safeParse(raw);
  if (!parsed.success) {
    // Point card errors at their file and id for the writer.
    return {
      issues: parsed.error.issues.map((i) => {
        if (i.path[0] === 'cards' && typeof i.path[1] === 'number') {
          const idx = i.path[1];
          const id = (cards[idx] as { id?: string } | undefined)?.id ?? `#${idx}`;
          return {
            level: 'error' as const,
            where: `${cardSource[idx]} → ${id} → ${i.path.slice(2).join('.')}`,
            message: i.message,
          };
        }
        return zodIssues('pack', new z.ZodError([i]))[0]!;
      }),
    };
  }
  const pack = parsed.data;
  issues.push(...crossCheck(pack));
  return issues.some((i) => i.level === 'error') ? { issues } : { pack, issues };
}

/** Reference checks the schema can't express. */
export function crossCheck(pack: ContentPack): ContentIssue[] {
  const out: ContentIssue[] = [];
  const err = (where: string, message: string) => out.push({ level: 'error', where, message });
  const warn = (where: string, message: string) => out.push({ level: 'warning', where, message });

  const biomeIds = new Set(pack.biomes.map((b) => b.id));
  const cardIds = new Set<string>();
  for (const c of pack.cards) {
    if (cardIds.has(c.id)) err(c.id, 'повторяющийся id карточки');
    cardIds.add(c.id);
  }
  const setFlags = new Set<string>();
  const readFlags = new Set<string>();
  const scheduled = new Set<string>();

  for (const c of pack.cards) {
    for (const b of c.biomes) if (!biomeIds.has(b)) err(c.id, `неизвестный биом «${b}»`);
    c.requires?.flags?.forEach((f) => readFlags.add(f));
    c.requires?.notFlags?.forEach((f) => readFlags.add(f));
    c.choices.forEach((ch, i) => {
      ch.effects.setFlags?.forEach((f) => setFlags.add(f));
      if (ch.later) {
        if (!cardIds.has(ch.later.card)) err(`${c.id} → choices.${i}.later`, `нет карточки «${ch.later.card}»`);
        scheduled.add(ch.later.card);
      }
    });
    if (c.timer === undefined && c.defaultChoice !== 1) {
      warn(c.id, 'defaultChoice задан, но таймера нет');
    }
  }
  for (const c of pack.cards) {
    if (c.scheduledOnly && !scheduled.has(c.id)) warn(c.id, 'scheduledOnly, но ни одна карточка её не вызывает');
  }
  for (const f of readFlags) if (!setFlags.has(f)) warn(`флаг ${f}`, 'проверяется, но нигде не ставится');
  for (const f of setFlags) if (!readFlags.has(f)) warn(`флаг ${f}`, 'ставится, но нигде не проверяется');

  pack.towns.forEach((t, i) => {
    if (i > 0 && !t.distance) err(`town ${t.id}`, 'нужно поле distance (длина перегона до города)');
    if (i > 0 && t.biome && !biomeIds.has(t.biome)) err(`town ${t.id}`, `неизвестный биом «${t.biome}»`);
  });
  for (const b of pack.biomes) {
    const n = pack.cards.filter((c) => c.biomes.includes(b.id) && !c.scheduledOnly).length;
    if (n < 4) warn(`биом ${b.id}`, `всего ${n} случайных карточек, перегоны будут повторяться`);
  }
  return out;
}
