// Loads the content pack from disk (for the validator, bot and tests).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse } from 'yaml';
import { buildPack, type ContentIssue, type ContentPack } from '../src/core/content';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : /\.ya?ml$/.test(name) ? [p] : [];
  });
}

export function loadPackFromDisk(root = join(import.meta.dirname, '..', 'content')): {
  pack?: ContentPack;
  issues: ContentIssue[];
} {
  const files: Record<string, unknown> = {};
  const issues: ContentIssue[] = [];
  for (const p of walk(root)) {
    const key = '/content/' + relative(root, p).replace(/\\/g, '/');
    try {
      files[key] = parse(readFileSync(p, 'utf8'));
    } catch (e) {
      issues.push({ level: 'error', where: key, message: `YAML: ${(e as Error).message}` });
    }
  }
  if (issues.length) return { issues };
  return buildPack(files);
}
