import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** package.json のうち依存を宣言するフィールド。 */
export const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
];

/**
 * ルートと各ワークスペースの package.json を集める。
 *
 * どこにワークスペースがあるかは派生ごとに違うので `sourceRoots` で受け取る。
 */
export function listManifests(root: string, sourceRoots: readonly string[]): string[] {
  const manifests = [join(root, 'package.json')];
  for (const directory of sourceRoots
    .map((path) => join(root, path))
    .filter((path) => existsSync(path))) {
    for (const entry of readdirSync(directory)) {
      const manifest = join(directory, entry, 'package.json');
      if (existsSync(manifest)) {
        manifests.push(manifest);
      }
    }
  }
  return manifests;
}

/**
 * JSON オブジェクトとして読む。読めない・オブジェクトでないなら null。
 *
 * 例外を投げると、編集途中の壊れた `package.json` が 1 つあるだけで
 * `bun run fitness` 全体が未捕捉の例外で死に、他のゲートの結果ごと失われる。
 * **レポートが出ないことは「すべて緑」と区別がつかない**ので、1 件の FAIL より悪い。
 *
 * かといって空オブジェクトに倒すのも危険で、依存 0 件 =「違反なし」になってしまう。
 * そのため null を返し、読めなかったこと自体を各検査が違反として報告する。
 */
export function readJson(path: string): Record<string, unknown> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  return Object.fromEntries(Object.entries(parsed));
}

/** JSON の値のうち、文字列のものだけを取り出す。 */
export function asStringRecord(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
}
