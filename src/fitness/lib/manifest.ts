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

export function readJson(path: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`${path} is not a JSON object`);
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
