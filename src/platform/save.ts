// Run persistence. A save is just seed + actions; the state is rebuilt by replaying them.
// Browser storage can be unavailable (private mode), so every access is guarded.
import type { Action } from '../core/engine';

export interface SavedRun {
  packVersion: string;
  seed: number;
  actions: Action[];
}

const KEY = 'monkeyball.run.v1';
const LANG_KEY = 'monkeyball.lang';

export function loadRun(): SavedRun | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as SavedRun;
    return typeof r.seed === 'number' && Array.isArray(r.actions) ? r : null;
  } catch {
    return null;
  }
}

export function saveRun(run: SavedRun | null) {
  try {
    if (run) localStorage.setItem(KEY, JSON.stringify(run));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: the run just won't survive a reload */
  }
}

export function loadLang(): 'ru' | 'en' {
  try {
    return localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'ru';
  } catch {
    return 'ru';
  }
}

export function saveLang(lang: 'ru' | 'en') {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    /* ignore */
  }
}

export function downloadJson(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
