import type { Localized } from '../core/content';

export type Lang = 'ru' | 'en';

const strings = {
  title: { ru: 'Монкибол', en: 'Monkeyball' },
  subtitle: { ru: 'Зимний прогон · прототип', en: 'Winter run · prototype' },
  newRun: { ru: 'Новый прогон', en: 'New run' },
  continueRun: { ru: 'Продолжить', en: 'Continue' },
  seed: { ru: 'Зерно', en: 'Seed' },
  money: { ru: 'Деньги', en: 'Money' },
  miles: { ru: 'Мили', en: 'Miles' },
  hunt: { ru: 'Дикая охота', en: 'Wild Hunt' },
  gap: { ru: 'Отрыв от охоты, миль', en: 'Lead over the Hunt, mi' },
  huntSpeed: { ru: 'охота', en: 'Hunt' },
  speed: { ru: 'Миль/шаг', en: 'Mi/step' },
  perStep: { ru: 'миль/шаг', en: 'mi/step' },
  leg: { ru: 'Перегон', en: 'Leg' },
  to: { ru: 'до', en: 'to' },
  onTheRoad: { ru: 'В пути…', en: 'On the road…' },
  town: { ru: 'Город', en: 'Town' },
  wealth: { ru: 'Богатство', en: 'Wealth' },
  showsLeft: { ru: 'Представлений осталось', en: 'Shows left' },
  giveShow: { ru: 'Дать представление', en: 'Give a show' },
  noMoreShows: { ru: 'Публика уже всё видела', en: 'The crowd has seen it all' },
  leave: { ru: 'Ехать дальше', en: 'Move on' },
  legLength: { ru: 'перегон', en: 'leg' },
  survived: { ru: 'Зима пережита', en: 'Winter survived' },
  caught: { ru: 'Охота настигла цирк', en: 'The Hunt caught the circus' },
  history: { ru: 'История прогона', en: 'Run history' },
  download: { ru: 'Скачать прогон', en: 'Download run' },
  horsesLeft: { ru: 'Лошадей осталось', en: 'Horses left' },
  turns: { ru: 'Ходов', en: 'Turns' },
  timeLeft: { ru: 'с', en: 's' },
  contentErrors: { ru: 'Контент-пак с ошибками', en: 'Content pack has errors' },
  contentErrorsHint: {
    ru: 'Исправьте файлы в папке content/ — игра перезагрузится сама.',
    en: 'Fix the files in content/ and the game reloads by itself.',
  },
  debug: { ru: 'Дебаг', en: 'Debug' },
  previewCard: { ru: 'Показать карточку', en: 'Preview card' },
  close: { ru: 'Закрыть', en: 'Close' },
  menu: { ru: 'Меню', en: 'Menu' },
  saveLost: {
    ru: 'Сохранение не подошло к новой версии контента и было сброшено.',
    en: 'The save did not match the new content and was reset.',
  },
  // history log lines
  logArrive: { ru: 'Прибытие: {town}.', en: 'Arrived in {town}.' },
  logShow: { ru: 'Представление ({town}): +{n} монет.', en: 'Show in {town}: +{n} coins.' },
  logLeave: { ru: 'Отъезд: {town}.', en: 'Left {town}.' },
  logHunt: { ru: 'Дикая охота настигла караван. Забрана лошадь: {horse}.', en: 'The Wild Hunt caught up and took {horse}.' },
  logExhausted: { ru: '{horse}: силы на нуле, тянуть больше не может.', en: '{horse} is spent and can no longer pull.' },
  logHunger: { ru: 'Денег на корм не хватило. Лошади голодают.', en: 'No money for feed. The horses go hungry.' },
  logTimedOut: { ru: '(не успели решить)', en: '(no time to decide)' },
  logEndSurvived: { ru: 'Цирк добрался до зимовья.', en: 'The circus reached winter quarters.' },
  logEndCaught: { ru: 'Последняя лошадь ушла с Охотой. Обезьяна осталась одна.', en: 'The last horse rode off with the Hunt. The monkey is alone.' },
} satisfies Record<string, Localized>;

export type StringKey = keyof typeof strings;

export function t(lang: Lang, key: StringKey, params: Record<string, string | number> = {}): string {
  return fill(strings[key][lang], params);
}

export function loc(lang: Lang, l: Localized, params: Record<string, string | number> = {}): string {
  return fill(l[lang], params);
}

function fill(s: string, params: Record<string, string | number>): string {
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}
