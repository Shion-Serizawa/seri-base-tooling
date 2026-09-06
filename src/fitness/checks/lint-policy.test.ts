import { describe, expect, it } from 'vitest';

import {
  baseConfigPaths,
  contextOf,
  makeTempRepo,
  contextWith,
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
        from: '"typescript/no-non-null-assertion": "off",',
        to: '"typescript/no-non-null-assertion": "off",\n        "typescript/no-unsafe-call": "off",',
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

/**
 * 「境界の全域を覆う override の off」の判定。
 *
 * 文字列の完全一致で見ていたときは、書き手が正直に `**\/*` と書いた場合しか
 * 捕まえられず、`src/**\/*.ts` や `apps/web/src/**` のように「具体的なパスが付いた
 * パターン」に見える全域指定は素通りしていた。実物の設定に 1 件だけ override を
 * 足して、パターンごとの判定を固定する。
 */
describe('境界の全域を覆う override の off', () => {
  /** 実物の設定に、指定したパターンで `no-console` を off にする override を足す。 */
  function repoWithOverride(pattern: string, sourceRoots: readonly string[]) {
    const root = repoWithConfig([
      {
        file: ROOT,
        from: '"overrides": [',
        to: `"overrides": [{ "files": ["${pattern}"], "rules": { "no-console": "off" } },`,
      },
    ]);
    return checkLintPolicy(contextWith(root, { sourceRoots, bundles: [] }));
  }

  function flagsWide(pattern: string, sourceRoots: readonly string[] = ['apps', 'packages']) {
    const details = repoWithOverride(pattern, sourceRoots)[0]?.details ?? [];
    return details.some((line) => line.startsWith('境界の全域を覆う override の off'));
  }

  it.each([
    // 正直に書いた全域（従来の完全一致でも捕まえられた形）
    ['**/*', ['apps'], true],
    ['*', ['apps'], true],
    // ソースルートの全域。単一パッケージの派生が踏む形
    ['src/**/*.ts', ['src'], true],
    ['src/**', ['src'], true],
    // ワークスペースの全域。monorepo が踏む形
    ['apps/web/src/**', ['apps'], true],
    ['packages/domain/src/**/*.ts', ['packages'], true],
    // 全ワークスペースをまとめて覆う形
    ['apps/*/src/**', ['apps'], true],
    // 境界より下。ディレクトリ単位の例外という建前が成立する
    ['apps/web/src/routes/**', ['apps'], false],
    ['src/fitness/lib/**', ['src'], false],
    // 残りがワイルドカードだけではない
    ['**/routes/**/*.tsx', ['apps'], false],
    ['apps/*/src/worker.ts', ['apps'], false],
    ['**/*.test.ts', ['apps'], false],
    // ソースルートでないディレクトリの全域は、境界ではないので対象外
    ['docs/**', ['apps'], false],
    // ソースルートの位置にワイルドカードは許さない（たまたま src を含むパスを巻き込まない）
    ['**/src/**', ['apps'], false],
  ])('%s（sourceRoots=%j）→ 全域と判定するか: %s', (pattern, sourceRoots, expected) => {
    expect(flagsWide(pattern, sourceRoots)).toBe(expected);
  });

  it('同じパターンでも sourceRoots が違えば判定が変わる', () => {
    expect(flagsWide('src/**/*.ts', ['src'])).toBe(true);
    expect(flagsWide('src/**/*.ts', ['apps', 'packages'])).toBe(false);
  });

  it('ルールを足すだけの override は、全域を覆っていても違反にしない', () => {
    const root = repoWithConfig([
      {
        file: ROOT,
        from: '"overrides": [',
        to: '"overrides": [{ "files": ["src/**"], "rules": { "no-alert": "error" } },',
      },
    ]);
    const [result] = checkLintPolicy(contextWith(root, { sourceRoots: ['src'], bundles: [] }));

    expect(result?.ok).toBe(true);
  });
});
