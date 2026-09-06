import { describe, expect, it } from 'vitest';

import {
  ALLOWED_OFF_RULES,
  ALLOWED_OVERRIDE_OFF_RULES,
  LINT_CATEGORIES,
  LINT_IGNORE_PATTERNS,
  LINT_PLUGINS,
  REQUIRED_ERROR_RULES,
} from './lint-policy.ts';

/**
 * 宣言は `as const` なので、素直に書くと TypeScript が「重なりが無い」と判定して
 * 比較そのものをコンパイルエラーにする。実行時の重複・取り違えを見たいので、
 * 突き合わせの前に文字列の配列へ広げる。
 */
const errorRules: readonly string[] = REQUIRED_ERROR_RULES;
const offRules: readonly string[] = ALLOWED_OFF_RULES;
const overrideOffRules: readonly string[] = ALLOWED_OVERRIDE_OFF_RULES;

/** override で黙らせてはいけないルールの接頭辞。 */
const DANGEROUS_RULES = ['typescript/no-unsafe', 'typescript/no-explicit-any'];

/**
 * ポリシーの宣言そのものが壊れていないことを見る。
 *
 * 「宣言と `.oxlintrc.json` が一致しているか」は適応度関数 ⑪
 * （`scripts/fitness/checks/lint-policy.ts`）が実効設定に対して検証する。
 * ここで見るのは、突き合わせる相手である宣言の側が矛盾していないこと。
 * 重複や取り違えがあると、⑪ は緑のまま守れていない範囲ができる。
 */
describe('Lint ポリシーの宣言', () => {
  it.each([
    ['REQUIRED_ERROR_RULES', REQUIRED_ERROR_RULES],
    ['ALLOWED_OFF_RULES', ALLOWED_OFF_RULES],
    ['ALLOWED_OVERRIDE_OFF_RULES', ALLOWED_OVERRIDE_OFF_RULES],
    ['LINT_PLUGINS', LINT_PLUGINS],
    ['LINT_IGNORE_PATTERNS', LINT_IGNORE_PATTERNS],
  ])('%s に重複が無い', (_name, values) => {
    expect(new Set(values).size).toBe(values.length);
  });

  it('error にするルールと off にするルールが排他になっている', () => {
    const both = errorRules.filter((rule) => offRules.some((allowed) => allowed === rule));

    expect(both).toStrictEqual([]);
  });

  it('override で off にできるルールに危険なものが含まれていない', () => {
    // ディレクトリ単位で any の混入や型の緩さを黙らせる、という抜け道を塞ぐ
    const dangerous = overrideOffRules.filter((rule) =>
      DANGEROUS_RULES.some((prefix) => rule.startsWith(prefix)),
    );

    expect(dangerous).toStrictEqual([]);
  });

  it('カテゴリの severity が error か off の二値になっている', () => {
    // AI は warn を無視して進むため、中間の強度を置かない
    const values = [...new Set(Object.values(LINT_CATEGORIES))].toSorted();

    expect(values).toStrictEqual(['error', 'off']);
  });

  it('ignorePatterns がソースディレクトリを覆っていない', () => {
    const coversSource = LINT_IGNORE_PATTERNS.filter((pattern) =>
      /(?:^|\/)(?:apps|packages|tooling|scripts)(?:\/|$)/u.test(pattern),
    );

    expect(coversSource).toStrictEqual([]);
  });
});
