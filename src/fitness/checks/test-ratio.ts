import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { QUALITY_GATES } from '../../index.ts';
import type { FitnessContext } from '../lib/context.ts';
import { defaultContext } from '../lib/context.ts';
import type { CheckResult } from '../lib/report.ts';
import { countEffectiveLines, isTestFile, listSourceFiles } from '../lib/walk.ts';

type Counts = { test: number; production: number };

function emptyCounts(): Counts {
  return { test: 0, production: 0 };
}

function ratioOf({ test, production }: Counts): number {
  return production === 0 ? 0 : test / production;
}

function countInto(byWorkspace: Map<string, Counts>, workspace: string, directory: string): void {
  const counts = byWorkspace.get(workspace) ?? emptyCounts();
  for (const file of listSourceFiles(directory)) {
    const lines = countEffectiveLines(file);
    if (isTestFile(file)) {
      counts.test += lines;
    } else {
      counts.production += lines;
    }
  }
  if (counts.test + counts.production > 0) {
    byWorkspace.set(workspace, counts);
  }
}

/**
 * ルートの `package.json` が宣言しているワークスペースの親ディレクトリ。
 *
 * `["apps/*", "packages/*"]` なら `apps` と `packages` を返す。ここに載っていない
 * 領域（`scripts` など）はワークスペースに分かれていないので 1 つとして数える。
 * 領域名を決め打ちにすると、レイアウトの違う派生リポジトリで対象が 0 件になり、
 * 「ソースが見つからない」ではなく「違反なし」で通る形の false green になる。
 */
function workspaceParents(root: string): Set<string> {
  const manifest = join(root, 'package.json');
  if (!existsSync(manifest)) {
    return new Set();
  }
  const globs = /"workspaces"\s*:\s*(?:\{[^}]*"packages"\s*:\s*)?\[([^\]]*)\]/u.exec(
    readFileSync(manifest, 'utf8'),
  )?.[1];
  return new Set(
    [...(globs ?? '').matchAll(/"([^"]+)"/gu)]
      .map((match) => (match[1] ?? '').split('/')[0] ?? '')
      .filter((name) => name.length > 0),
  );
}

/**
 * ワークスペース単位（`apps/api` など）と全体の行数を数える。
 *
 * ワークスペースに分かれていない領域（`scripts` など）はまとめて 1 つとして扱う。
 */
function countByWorkspace(root: string, sourceRoots: readonly string[]): Map<string, Counts> {
  const parents = workspaceParents(root);
  const byWorkspace = new Map<string, Counts>();
  for (const area of sourceRoots) {
    const areaPath = join(root, area);
    if (!existsSync(areaPath)) {
      continue;
    }
    if (!parents.has(area)) {
      countInto(byWorkspace, area, areaPath);
      continue;
    }
    for (const entry of readdirSync(areaPath)) {
      countInto(byWorkspace, `${area}/${entry}`, join(areaPath, entry));
    }
  }
  return byWorkspace;
}

/**
 * 適応度関数 ② test ratio（上限のみ）。
 *
 * テストのコピペ膨張・過剰なテスト量への牽制。③ 重複率と対で効く。
 * 下限を置かない理由は QUALITY_GATES.testRatio のコメントを参照。
 * 「テストが足りない」側は per-file カバレッジとミューテーションスコアが検出する。
 *
 * 全体の 1 つの数値だけでは「どこが厚い／薄いのか」が分からないため、
 * ワークスペース単位でも出す（判定は各ワークスペースに対して行う）。
 */
export function checkTestRatio(context: FitnessContext = defaultContext()): CheckResult {
  const byWorkspace = [...countByWorkspace(context.root, context.sourceRoots).entries()].toSorted(
    ([a], [b]) => a.localeCompare(b),
  );
  const total = byWorkspace.reduce<Counts>(
    (acc, [, counts]) => ({
      test: acc.test + counts.test,
      production: acc.production + counts.production,
    }),
    emptyCounts(),
  );
  const { max } = QUALITY_GATES.testRatio;

  // ソースが 1 本も見つからない = root の指定が誤っているか走査が壊れている。
  // 比率 0.00 の PASS にすると、リポジトリ外から叩いたときに黙って緑になる。
  if (byWorkspace.length === 0) {
    return {
      name: 'test ratio',
      ok: false,
      actual: 'ソースなし（計測不能）',
      expected: `各ワークスペース <= ${max.toFixed(2)}`,
      details: [`${context.root} 配下にソースが見つからない`],
    };
  }

  const over = byWorkspace.filter(([, counts]) => ratioOf(counts) > max);

  return {
    name: 'test ratio',
    ok: over.length === 0,
    actual: ratioOf(total).toFixed(2),
    expected: `各ワークスペース <= ${max.toFixed(2)}`,
    details: byWorkspace.map(
      ([workspace, counts]) =>
        `${workspace.padEnd(22)} ${ratioOf(counts).toFixed(2)}  (テスト ${counts.test} 行 / 実装 ${counts.production} 行)`,
    ),
  };
}
