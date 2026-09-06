import { describe, expect, it } from 'vitest';

import { defaultContext } from './context.ts';
import { runCommand } from './exec.ts';

// `it` の中に条件分岐を書くと `vitest/no-conditional-in-test` が落とすため、
// 期待値は module スコープで先に決めておく。
const expectedBaseRef = process.env['FITNESS_BASE_REF'] ?? 'main';

describe('defaultContext', () => {
  it('cwd を root にする', () => {
    expect(defaultContext().root).toBe(process.cwd());
  });

  it('実プロセスを起動する runCommand を使う', () => {
    expect(defaultContext().run).toBe(runCommand);
  });

  it('CI 環境変数の有無を ci に反映する', () => {
    expect(defaultContext().ci).toBe(process.env['CI'] !== undefined);
  });

  it('基準リビジョンは FITNESS_BASE_REF、無ければ main', () => {
    expect(defaultContext().baseRef).toBe(expectedBaseRef);
  });
});
