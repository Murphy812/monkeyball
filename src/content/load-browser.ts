// Loads the content pack in the browser. Vite bundles every YAML file under /content
// and hot-reloads them in dev, so writers see changes without restarting the game.
import { parse } from 'yaml';
import { buildPack, type ContentIssue, type ContentPack } from '../core/content';

const files = import.meta.glob('/content/**/*.{yaml,yml}', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>;

export function loadPack(): { pack?: ContentPack; issues: ContentIssue[] } {
  const parsed: Record<string, unknown> = {};
  const issues: ContentIssue[] = [];
  for (const [path, text] of Object.entries(files)) {
    try {
      parsed[path] = parse(text);
    } catch (e) {
      issues.push({ level: 'error', where: path, message: `YAML: ${(e as Error).message}` });
    }
  }
  if (issues.length) return { issues };
  return buildPack(parsed);
}
