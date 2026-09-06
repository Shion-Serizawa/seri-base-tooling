import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';

import { onTestFinished } from 'vitest';

import type { FitnessContext } from '../fitness/lib/context.ts';
import { defaultContext } from '../fitness/lib/context.ts';
import type { CommandOutcome, RunCommand } from '../fitness/lib/exec.ts';
import { extendsTargets } from '../fitness/lib/oxlint-config.ts';

/**
 * 一時ディレクトリに擬似リポジトリを作る。テスト終了時に自動で削除される。
 *
 * 適応度関数はファイルの有無と内容で判定するため、
 * 「bunfig.toml が無い」「dist が無い」といった壊れ方を実際に再現して検証する。
 */
export function makeTempRepo(files: Readonly<Record<string, string>>): string {
  const root = mkdtempSync(join(tmpdir(), 'seri-fitness-'));
  onTestFinished(() => {
    rmSync(root, { recursive: true, force: true });
  });
  for (const [relativePath, content] of Object.entries(files)) {
    const target = join(root, relativePath);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, 'utf8');
  }
  return root;
}

export type StubbedRun = RunCommand & { readonly calls: string[] };

/**
 * 外部コマンドを実際には起動しない `RunCommand`。
 * `reply` が返した値で既定（成功・出力なし）を上書きする。
 */
export function stubRun(
  reply: (command: string) => Partial<CommandOutcome> = () => ({}),
): StubbedRun {
  const calls: string[] = [];
  const run: RunCommand = (command) => {
    calls.push(command);
    return { status: 0, stdout: '', stderr: '', ...reply(command) };
  };
  return Object.assign(run, { calls });
}

/**
 * 検査に渡す `FitnessContext`。既定では外部コマンドを起動せず CI 扱いにしない。
 *
 * レイアウト（`sourceRoots` / `bundles`）は本番の既定をそのまま使う。テスト用に
 * 別の既定を置くと、検査が実際に見る対象とフィクスチャが少しずつずれていく。
 */
export function contextOf(
  root: string,
  run: RunCommand = stubRun(),
  ci = false,
  baseRef = 'main',
): FitnessContext {
  return { ...defaultContext(), root, run, ci, baseRef };
}

/** レイアウトを差し替えた `FitnessContext`（対象ディレクトリや予算を変えて試すとき）。 */
export function contextWith(
  root: string,
  overrides: Partial<Omit<FitnessContext, 'root'>>,
): FitnessContext {
  return { ...contextOf(root), ...overrides };
}

/**
 * 検査する側のリポジトリのルート。
 *
 * `import.meta.dirname` からの相対にすると、このパッケージが `node_modules` に
 * 入ったときに**パッケージ自身**の設定を読んでしまう。使う側の実物を検査したいので
 * 実行時のカレントディレクトリを見る（Vitest はリポジトリのルートで走る）。
 */
const REPO_ROOT = process.cwd();

const ROOT_CONFIG = '.oxlintrc.json';

/** ルートの設定からの相対パスに直す（一時リポジトリでも同じ形で置くため）。 */
function relativeToRepo(absolute: string): string {
  return relative(REPO_ROOT, absolute).replaceAll('\\', '/');
}

/**
 * `.oxlintrc.json` が `extends` している設定ファイルの、リポジトリ相対パス。
 *
 * 置き場所は基盤（`tooling/quality-gates/`）と派生（`node_modules/` の中）で違うので、
 * パスを書かずに設定から辿る。
 */
export function baseConfigPaths(): string[] {
  return extendsTargets(join(REPO_ROOT, ROOT_CONFIG)).map((path) => relativeToRepo(path));
}

/**
 * 実物の設定ファイル。⑪ は「宣言したポリシーとの完全一致」を見るので、
 * 手書きのフィクスチャを置くと実物とは別のポリシーを検査することになる。
 */
export function repositoryConfigFiles(): Record<string, string> {
  const paths = [ROOT_CONFIG, ...baseConfigPaths(), 'stryker.config.json', '.jscpd.json'];
  return Object.fromEntries(
    paths.map((path) => [path, readFileSync(join(REPO_ROOT, path), 'utf8')]),
  );
}

/**
 * A 層の検査（`collectBaseChecks`）がすべて PASS になる擬似リポジトリ。
 *
 * 契約・マイグレーション・`docs/openapi.json` を置いていないのは、それらを読むのが
 * `project/checks.ts` の側だから（ADR 0010 の C 層）。ここに置く必要が出たら、
 * A 層に「リポジトリの形」の知識が漏れているということになる。
 */
export function makeHealthyBaseRepo(): string {
  return makeTempRepo({
    ...repositoryConfigFiles(),
    'package.json': JSON.stringify({ name: 'root', devDependencies: { knip: '6.32.2' } }),
    'bunfig.toml': '[install]\nexact = true\nminimumReleaseAge = 604800\n',
    'bun.lock': '',
    'mise.lock': '',
    '.github/workflows/ci.yml': `      - uses: actions/checkout@${'a'.repeat(40)}\n`,
    'apps/api/dist/worker.js': 'console.log(1);',
    'apps/web/dist/main.js': 'console.log(2);',
    'packages/domain/src/todo.ts': 'const a = 1;\n',
    'CLAUDE.md': '`packages/domain/src/todo.ts` を見る。\n',
  });
}
