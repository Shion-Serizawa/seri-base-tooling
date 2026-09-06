import { describe, expect, it } from 'vitest';

import { contextOf, contextWith, makeTempRepo } from '../../test/temp-repo.ts';
import type { FitnessContext } from '../lib/context.ts';
import type { CheckResult } from '../lib/report.ts';
import { checkSizeBudget } from './size-budget.ts';

type Bundles = FitnessContext['bundles'];

const bundlesOf = (maxGzipBytes: number): Bundles => [
  { name: 'bundle size (api)', dist: 'apps/api/dist', maxGzipBytes },
  { name: 'bundle size (web)', dist: 'apps/web/dist', maxGzipBytes },
];

const GENEROUS = bundlesOf(10_000);
const IMPOSSIBLE = bundlesOf(1);

const BUILT = {
  'apps/api/dist/worker.js': 'console.log(1);',
  'apps/web/dist/main.js': 'console.log(2);',
};

function resultsOf(
  files: Readonly<Record<string, string>>,
  bundles: Bundles = GENEROUS,
): CheckResult[] {
  return checkSizeBudget(contextWith(makeTempRepo(files), { bundles }));
}

describe('checkSizeBudget', () => {
  it('api と web の 2 本を見る', () => {
    expect(resultsOf(BUILT).map((result) => result.name)).toStrictEqual([
      'bundle size (api)',
      'bundle size (web)',
    ]);
  });

  it('予算内なら PASS', () => {
    expect(resultsOf(BUILT).every((result) => result.ok)).toBe(true);
  });

  it('予算を超えたら FAIL', () => {
    expect(resultsOf(BUILT, IMPOSSIBLE).every((result) => !result.ok)).toBe(true);
  });

  it('未ビルドは FAIL にする（計測不能を PASS にすると常に緑になる）', () => {
    const results = resultsOf({});

    expect(results.every((result) => !result.ok)).toBe(true);
    expect(results[0]?.actual).toBe('未ビルド（計測不能）');
  });

  it('未ビルドのときはビルド方法を details で案内する', () => {
    expect(resultsOf({})[0]?.details?.[0]).toContain('bun run build');
  });

  it('dist はあるが JS が 1 本も無い場合も FAIL にする（0 バイトを予算内と読まない）', () => {
    const results = resultsOf({
      'apps/api/dist/worker.js.map': 'x',
      'apps/web/dist/index.html': '<html></html>',
    });

    expect(results.map((result) => result.ok)).toStrictEqual([false, false]);
    expect(results[0]?.actual).toBe('未ビルド（計測不能）');
  });

  it('片方だけ未ビルドならその 1 件だけ FAIL になる', () => {
    const results = resultsOf({ 'apps/api/dist/worker.js': 'console.log(1);' });

    expect(results.map((result) => result.ok)).toStrictEqual([true, false]);
  });

  it('.js と .mjs だけを数え、サブディレクトリも辿る', () => {
    const withAssets = resultsOf({
      ...BUILT,
      'apps/api/dist/nested/chunk.mjs': 'console.log(2);',
      'apps/api/dist/worker.js.map': 'x'.repeat(5000),
      'apps/api/dist/style.css': 'x'.repeat(5000),
    });
    const jsOnly = resultsOf({
      ...BUILT,
      'apps/api/dist/nested/chunk.mjs': 'console.log(2);',
    });

    expect(withAssets[0]?.actual).toBe(jsOnly[0]?.actual);
  });

  it('実測値を kB 単位で表示する', () => {
    expect(resultsOf(BUILT)[0]?.actual).toMatch(/^\d+\.\d kB gzip$/u);
  });

  it('既定の予算は QUALITY_GATES の値を使う', () => {
    // 対象と予算は context が持つ（派生リポジトリはビルド成果物を持たないこともある）。
    // 既定がしきい値の単一情報源から来ていることをここで固定する。
    const [api] = checkSizeBudget(contextOf(makeTempRepo(BUILT)));

    expect(api?.expected).toBe('<= 550.0 kB gzip');
  });
});
