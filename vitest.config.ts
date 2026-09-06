import { defineConfig } from 'vitest/config';

import { QUALITY_GATES } from './src/index.ts';

/**
 * 品質ゲートの実装そのものを検証する。
 *
 * ここのバグは「ゲートが常に緑になる」形で現れ、型検査でも他のテストでも捕まらない。
 * しかもこのパッケージは派生リポジトリすべてに配られるので、影響が伝播する。
 *
 * `@seri/base-tooling` は他のツーリング設定の土台なので、自分の
 * `src/vitest-config` には依存しない（循環参照になる）。
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    passWithNoTests: false,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/index.ts',
        'src/tsconfig/**',
        // process.exit を呼ぶだけの実行入口
        'src/fitness/run.ts',
        'src/fitness/supply-chain.ts',
        'src/git/check-commit-message.ts',
        // テスト専用のフィクスチャヘルパ
        'src/test/**',
      ],
      thresholds: QUALITY_GATES.coverage,
    },
  },
});
