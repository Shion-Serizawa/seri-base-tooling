import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const IGNORED_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  'coverage',
  'reports',
  '.turbo',
  '.wrangler',
  '.git',
  '.stryker-tmp',
]);

const SOURCE_EXTENSIONS = ['.ts', '.tsx'];

export function listSourceFiles(root: string): string[] {
  const found: string[] = [];
  walk(root, found);
  return found;
}

function walk(directory: string, found: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(directory);
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = join(directory, entry);
    if (statSync(fullPath).isDirectory()) {
      if (!IGNORED_DIRECTORIES.has(entry)) {
        walk(fullPath, found);
      }
      continue;
    }
    const isSource = SOURCE_EXTENSIONS.some((extension) => entry.endsWith(extension));
    if (isSource && !entry.endsWith('.gen.ts') && !entry.endsWith('.d.ts')) {
      found.push(fullPath);
    }
  }
}

export function isTestFile(path: string): boolean {
  // OS 非依存に正規化する。`sep` で分割すると POSIX では `\` が残り、
  // Windows で作られたパスを渡したときだけ判定が変わる（環境依存のゲートになる）。
  const normalized = path.replaceAll('\\', '/');
  // *.test-d.ts（型テスト）もテストコードとして数える
  return /\.(?:test|spec)(?:-d)?\.tsx?$/u.test(normalized) || normalized.includes('/test/');
}

/** 空行と行コメントのみの行を除いた行数を数える。 */
export function countEffectiveLines(path: string): number {
  const lines = readFileSync(path, 'utf8').split('\n');
  return lines.filter((line) => {
    const trimmed = line.trim();
    return (
      trimmed.length > 0 &&
      !trimmed.startsWith('//') &&
      !trimmed.startsWith('*') &&
      !trimmed.startsWith('/*')
    );
  }).length;
}
