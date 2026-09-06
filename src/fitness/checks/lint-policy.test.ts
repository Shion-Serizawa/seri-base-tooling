import { describe, expect, it } from 'vitest';

import {
  baseConfigPaths,
  contextOf,
  makeTempRepo,
  repositoryConfigFiles,
} from '../../test/temp-repo.ts';
import { checkLintPolicy } from './lint-policy.ts';

const ROOT = '.oxlintrc.json';
const STRYKER = 'stryker.config.json';
const JSCPD = '.jscpd.json';
/** ルール本体が書かれている extends 先。基盤と派生で置き場所が違うので設定から辿る。 */
const BASE = baseConfigPaths()[0] ?? '';

type Patch = { readonly file: string; readonly from: string; readonly to: string };

/**
 * 実物の設定をそのまま持ち込んだ擬似リポジトリを作り、1 か所だけ壊す。
 *
 * ポリシーは 100 本以上のルール名の完全一致なので、フィクスチャを手書きすると
 * 「テスト用に別のポリシーを作る」ことになり、実物を検査しなくなる。
 * `from` が見つからなければテスト側の前提が古いということなので、そこで落とす。
 */
function repoWithConfig(patches: readonly Patch[] = []): string {
  const files = repositoryConfigFiles();
  for (const patch of patches) {
    const source = files[patch.file] ?? '';
    expect(source).toContain(patch.from);
    files[patch.file] = source.replace(patch.from, patch.to);
  }
  return makeTempRepo(files);
}

function resultsOf(root: string): Record<string, { ok: boolean; details: string }> {
  return Object.fromEntries(
    checkLintPolicy(contextOf(root)).map((result) => [
      result.name,
      { ok: result.ok, details: (result.details ?? []).join('') },
    ]),
  );
}

describe('checkLintPolicy', () => {
  it('実物の設定では 2 件とも PASS する', () => {
    const results = resultsOf(repoWithConfig());

    expect(Object.values(results).map((result) => result.ok)).toStrictEqual([true, true]);
  });

  it('設定が無ければ「計測不能」で FAIL する', () => {
    const results = resultsOf(makeTempRepo({ 'package.json': '{}' }));

    expect(results['lint policy']?.ok).toBe(false);
    expect(results['threshold drift']?.ok).toBe(false);
    expect(results['lint policy']?.details).toContain(ROOT);
  });

  it('extends の解決に失敗するとルール本体が消えて FAIL する', () => {
    const root = repoWithConfig([{ file: ROOT, from: `"./${BASE}"`, to: '"./missing.json"' }]);

    expect(resultsOf(root)['lint policy']?.ok).toBe(false);
  });

  it('カテゴリを off にすると FAIL する', () => {
    const root = repoWithConfig([
      { file: BASE, from: '"correctness": "error"', to: '"correctness": "off"' },
    ]);

    expect(resultsOf(root)['lint policy']?.details).toContain('categories');
  });

  it('ルールを warn に落とすと FAIL する', () => {
    // AI は warn を無視して進むので、二値から外れること自体を違反にする
    const root = repoWithConfig([
      { file: BASE, from: '"no-alert": "error"', to: '"no-alert": "warn"' },
    ]);

    expect(resultsOf(root)['lint policy']?.details).toContain('no-alert');
  });

  it('ignorePatterns にソースを足すと FAIL する', () => {
    const root = repoWithConfig([
      { file: ROOT, from: '"**/dist/**",', to: '"**/dist/**",\n    "apps/web/src/**",' },
    ]);

    expect(resultsOf(root)['lint policy']?.details).toContain('apps/web/src/**');
  });

  it('override で危険なルールを黙らせると FAIL する', () => {
    const root = repoWithConfig([
      {
        file: BASE,
        from: '"node/no-sync": "off",',
        to: '"node/no-sync": "off",\n        "typescript/no-unsafe-call": "off",',
      },
    ]);

    expect(resultsOf(root)['lint policy']?.details).toContain('typescript/no-unsafe-call');
  });

  it('extends 先に ignorePatterns を置くと FAIL する（継承されないので効かない）', () => {
    const root = repoWithConfig([
      {
        file: BASE,
        from: '  "overrides": [',
        to: '  "ignorePatterns": ["apps/web/src/**"],\n\n  "overrides": [',
      },
    ]);

    expect(resultsOf(root)['lint policy']?.details).toContain('extends 先');
  });

  it('複雑度のしきい値を緩めると threshold drift だけが FAIL する', () => {
    const root = repoWithConfig([
      {
        file: BASE,
        from: '"complexity": ["error", { "max": 10 }]',
        to: '"complexity": ["error", { "max": 30 }]',
      },
    ]);

    const results = resultsOf(root);

    expect(results['threshold drift']?.details).toContain('complexity');
    // 設定の形は変えていないのでポリシー側は緑。2 つの検査が別々に効いている
    expect(results['lint policy']?.ok).toBe(true);
  });

  it('stryker のしきい値だけを下げると FAIL する', () => {
    const root = repoWithConfig([{ file: STRYKER, from: '"break": 60', to: '"break": 10' }]);

    expect(resultsOf(root)['threshold drift']?.details).toContain('stryker');
  });

  it('jscpd のしきい値だけを上げると FAIL する', () => {
    const root = repoWithConfig([{ file: JSCPD, from: '"threshold": 3', to: '"threshold": 30' }]);

    expect(resultsOf(root)['threshold drift']?.details).toContain('jscpd.threshold');
  });
});
