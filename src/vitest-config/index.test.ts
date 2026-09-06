import { describe, expect, it } from 'vitest';

import { QUALITY_GATES } from '../index.ts';
import { createCoverageOptions, createVitestConfig, TEST_INCLUDE } from './index.ts';

/**
 * 適応度関数 ① の結線を検証する。
 *
 * カバレッジのしきい値は「Vitest の設定にどう渡っているか」でしか効かない。
 * ここが `perFile` を落としたり `thresholds` を渡し忘れたりしても、
 * テストは全部通り lint も型検査も何も言わない。**ゲートが黙って緩む**形なので、
 * 単一情報源から実際に渡っていることを固定する。
 */
describe('createCoverageOptions', () => {
  it('しきい値を QUALITY_GATES からそのまま渡す', () => {
    expect(createCoverageOptions().thresholds).toStrictEqual({
      lines: QUALITY_GATES.coverage.lines,
      functions: QUALITY_GATES.coverage.functions,
      branches: QUALITY_GATES.coverage.branches,
      statements: QUALITY_GATES.coverage.statements,
      perFile: QUALITY_GATES.coverage.perFile,
    });
  });

  it('ファイル単位で要求する（集計だと未テストのファイルが隠れる）', () => {
    expect(createCoverageOptions().thresholds?.perFile).toBe(true);
  });

  it('既定の計測方式は v8', () => {
    expect(createCoverageOptions().provider).toBe('v8');
  });

  it('workerd 向けに istanbul を選べる', () => {
    // Workers プールは v8 の Profiler セッションを実装していない
    expect(createCoverageOptions({ provider: 'istanbul' }).provider).toBe('istanbul');
  });

  it('計測対象の既定は src 配下', () => {
    expect(createCoverageOptions().include).toStrictEqual(['src/**/*.ts', 'src/**/*.tsx']);
  });

  it('src レイアウトでないワークスペースは計測対象を差し替えられる', () => {
    expect(createCoverageOptions({ coverageInclude: ['scripts/**/*.ts'] }).include).toStrictEqual([
      'scripts/**/*.ts',
    ]);
  });

  it('呼び出し側の除外は既定の除外に追加される（置き換えない）', () => {
    // 置き換えてしまうと、テストファイル自身が計測対象に入って比率が水増しされる
    const exclude = createCoverageOptions({ exclude: ['src/run.ts'] }).exclude;

    expect(exclude).toContain('src/**/*.test.ts');
    expect(exclude).toContain('src/run.ts');
  });
});

describe('createVitestConfig', () => {
  it('既定は node 環境で、テストは src 配下から探す', () => {
    const config = createVitestConfig();

    expect(config.test?.environment).toBe('node');
    expect(config.test?.include).toStrictEqual([...TEST_INCLUDE]);
  });

  it('テストが 1 件も無いことを既定では許さない（黙って緑にしない）', () => {
    expect(createVitestConfig().test?.passWithNoTests).toBe(false);
  });

  it('宣言だけのパッケージは明示すれば許す', () => {
    expect(createVitestConfig({ passWithNoTests: true }).test?.passWithNoTests).toBe(true);
  });

  it('DOM が要るパッケージは環境を差し替えられる', () => {
    expect(createVitestConfig({ environment: 'happy-dom' }).test?.environment).toBe('happy-dom');
  });

  it('探索パターンを差し替えられる', () => {
    expect(createVitestConfig({ include: ['scripts/**/*.test.ts'] }).test?.include).toStrictEqual([
      'scripts/**/*.test.ts',
    ]);
  });

  it('カバレッジ設定を必ず載せる', () => {
    // ここが undefined になると ① が丸ごと効かなくなる
    expect(createVitestConfig().test?.coverage?.thresholds).toBeDefined();
  });
});
