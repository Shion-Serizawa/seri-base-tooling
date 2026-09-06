/**
 * Lint 設定のポリシー。`.oxlintrc.json` がこの通りになっていることを
 * `lint-policy.test.ts` が検証する。
 *
 * なぜこれが必要か:
 * しきい値（複雑度の 7 つの数値）だけを検証していた時期は、
 * `"correctness": "off"` や `"vitest/expect-expect": "off"` のような
 * **カテゴリ・severity の改ざんを一切検出できなかった**。
 * ゲートに詰まったときの最短の修復手段がそのまま通ってしまうため、
 * 設定の「形」ごと固定する。
 *
 * 変更するときは、この配列とテストを一緒に直すことになる。
 * つまり「設定ファイルをこっそり緩める」ができず、
 * ポリシーの変更として明示的に現れる。
 */

/** カテゴリの severity。完全一致で検証する。 */
export const LINT_CATEGORIES = {
  correctness: 'error',
  suspicious: 'error',
  perf: 'error',
  pedantic: 'error',
  style: 'off',
  restriction: 'off',
  nursery: 'off',
} as const;

/** 有効化していなければならないプラグイン。 */
export const LINT_PLUGINS = [
  'typescript',
  'unicorn',
  'oxc',
  'import',
  'promise',
  'node',
  'react',
  'react-perf',
  'jsx-a11y',
  'vitest',
] as const;

/**
 * `rules` で必ず `error` になっていなければならないルール。
 * 消しても off にしてもテストが落ちる。
 */
export const REQUIRED_ERROR_RULES = [
  // 制御フロー・暗黙変換・危険な実行を明示的に制限する
  'curly',
  'default-case-last',
  'default-param-last',
  'guard-for-in',
  'no-alert',
  'no-empty',
  'no-implicit-coercion',
  'no-new-func',
  'no-param-reassign',
  'no-proto',
  'no-return-assign',
  'no-script-url',
  'no-sequences',
  'no-template-curly-in-string',
  'no-var',

  // ESM の静的解析と型の境界を保つ
  'import/no-amd',
  'import/no-commonjs',
  'import/no-dynamic-require',
  'import/no-mutable-exports',
  'typescript/consistent-type-exports',
  'typescript/no-empty-object-type',
  'typescript/no-import-type-side-effects',
  'typescript/no-invalid-void-type',
  'typescript/no-non-null-asserted-nullish-coalescing',
  'typescript/no-require-imports',
  'typescript/method-signature-style',
  'typescript/use-unknown-in-catch-callback-variable',

  // 例外・非同期処理・ブラウザの意図しない動作を防ぐ
  'unicorn/error-message',
  'unicorn/throw-new-error',
  'unicorn/no-abusive-eslint-disable',
  'unicorn/prefer-node-protocol',
  'promise/no-return-wrap',
  'promise/param-names',
  'react/button-has-type',
  'react/no-danger',
  'react/no-unknown-property',

  // テストの取り違えと弱い比較を防ぐ
  'vitest/no-duplicate-hooks',
  'vitest/no-identical-title',
  'vitest/no-import-node-test',
  'vitest/no-interpolation-in-snapshots',
  'vitest/no-mocks-import',
  'vitest/prefer-strict-equal',
  'vitest/prefer-called-with',

  // 複雑度（数値は QUALITY_GATES.complexity と一致していることを別テストで検証）
  'complexity',
  'max-depth',
  'max-lines',
  'max-lines-per-function',
  'max-nested-callbacks',
  'max-params',
  'max-statements',
  'max-classes-per-file',

  // style から個別採用しているもの
  'eqeqeq',
  'prefer-const',
  'no-else-return',
  'func-style',
  'no-console',
  'node/no-process-env',
  'no-warning-comments',
  'unicorn/filename-case',
  'import/no-default-export',
  'import/no-cycle',
  'import/no-duplicates',
  'import/no-self-import',

  // any の混入と暗黙の緩さの禁止
  'typescript/no-explicit-any',
  'typescript/ban-ts-comment',
  'typescript/consistent-type-imports',
  'typescript/explicit-module-boundary-types',
  'typescript/no-non-null-assertion',

  // 型情報が必要なルール
  'typescript/await-thenable',
  'typescript/no-base-to-string',
  'typescript/no-confusing-void-expression',
  'typescript/no-deprecated',
  'typescript/no-floating-promises',
  'typescript/no-misused-promises',
  'typescript/no-misused-spread',
  'typescript/no-unnecessary-condition',
  'typescript/no-unnecessary-template-expression',
  'typescript/no-unsafe-argument',
  'typescript/no-unsafe-assignment',
  'typescript/no-unsafe-call',
  'typescript/no-unsafe-enum-comparison',
  'typescript/no-unsafe-member-access',
  'typescript/no-unsafe-return',
  'typescript/no-unsafe-type-assertion',
  'typescript/only-throw-error',
  'typescript/prefer-nullish-coalescing',
  'typescript/require-await',
  'typescript/restrict-template-expressions',
  'typescript/return-await',
  'typescript/strict-boolean-expressions',
  'typescript/switch-exhaustiveness-check',

  // テストの質（カバレッジ水増しの門番）
  'vitest/expect-expect',
  'vitest/no-conditional-expect',
  'vitest/no-disabled-tests',
  'vitest/no-focused-tests',
  'vitest/no-standalone-expect',
  'vitest/valid-expect',
] as const;

/**
 * `rules` で `off` にしてよいルール。理由は `.oxlintrc.json` のコメントに書いてある。
 * ここに無いルールを off にするとテストが落ちる。
 */
export const ALLOWED_OFF_RULES = [
  'react/react-in-jsx-scope',
  'typescript/prefer-readonly-parameter-types',
  'typescript/strict-void-return',
  'react-perf/jsx-no-new-function-as-prop',
  'vitest/no-importing-vitest-globals',
  'vitest/prefer-expect-assertions',
  'import/no-nodejs-modules',
] as const;

/**
 * `overrides` で off にしてよいルール。
 *
 * ここに correctness 系や `typescript/no-unsafe-*` を入れないことが重要。
 * ディレクトリ単位で危険なルールを黙らせる、という抜け道を塞ぐ。
 */
export const ALLOWED_OVERRIDE_OFF_RULES = [
  'import/no-default-export',
  'import/no-unassigned-import',
  'max-lines',
  'max-lines-per-function',
  'max-nested-callbacks',
  'max-statements',
  'no-console',
  'node/no-process-env',
  'node/no-sync',
  'react-perf/jsx-no-new-array-as-prop',
  'react-perf/jsx-no-new-object-as-prop',
  'typescript/explicit-module-boundary-types',
  'typescript/no-non-null-assertion',
  'unicorn/filename-case',
] as const;

/**
 * `ignorePatterns` に書いてよいパターン。完全一致で検証する。
 *
 * 適用範囲を固定しないと、新しいルールで大量にエラーが出たときに
 * `"apps/web/src/**"` を 1 行足すだけでエラーが消え、severity を見ている
 * 他のアサーションは全部緑のまま通る。severity の改ざんと同じ抜け道なので、
 * 除外先そのものをポリシーとして固定する。
 */
export const LINT_IGNORE_PATTERNS = [
  '**/dist/**',
  '**/coverage/**',
  '**/reports/**',
  '**/.wrangler/**',
  '**/.turbo/**',
  '**/.stryker-tmp/**',
  '**/node_modules/**',
  '**/*.gen.ts',
  '**/routeTree.gen.ts',
  '**/worker-configuration.d.ts',
] as const;

/**
 * `overrides[].files` としてリポジトリ全体を覆うパターン。
 *
 * 全体スコープの override で `off` を許すと、`ALLOWED_OVERRIDE_OFF_RULES` に
 * 載っているルールをリポジトリ全域で黙らせられる（ディレクトリ単位の例外という
 * 建前が成立しなくなる）。
 */
export const REPOSITORY_WIDE_FILE_PATTERNS = [
  '**/*',
  '**/*.ts',
  '**/*.tsx',
  '**/*.{ts,tsx}',
  '*',
] as const;
