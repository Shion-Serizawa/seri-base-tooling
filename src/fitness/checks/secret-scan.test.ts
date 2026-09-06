import { describe, expect, it } from 'vitest';

import { contextOf as sharedContextOf, makeTempRepo, stubRun } from '../../test/temp-repo.ts';
import type { FitnessContext } from '../lib/context.ts';
import type { CommandOutcome } from '../lib/exec.ts';
import { checkSecretScan } from './secret-scan.ts';

const MISSING = { status: 127 };
const FOUND = { status: 0 };

const alwaysMissing = stubRun(() => MISSING);
const alwaysFound = stubRun(() => FOUND);

/** gitleaks の存在確認だけ通し、走査は `scan` の結果を返す。 */
function installedWith(
  scan: (command: string) => Partial<CommandOutcome>,
): ReturnType<typeof stubRun> {
  return stubRun((command) => (command.includes('version') ? FOUND : scan(command)));
}

const onlyMiseHasIt = stubRun((command) => (command.startsWith('mise') ? FOUND : MISSING));
const bothTargetsLeak = installedWith(() => ({ status: 1, stdout: 'Secret: REDACTED\n' }));
const onlyHistoryLeaks = installedWith((command) =>
  command.includes('gitleaks git') ? { status: 1, stdout: 'leak' } : FOUND,
);

/**
 * この検査だけ「root は空の一時ディレクトリでよい」ため、ローカルに context を組む。
 *
 * 型は `FitnessContext` を使う。構造を書き下すと、フィールドが増えたときに
 * ここだけ古いまま通ってしまう（実際に `baseRef` を足したときに型検査が止めた）。
 */
function contextOf(run: ReturnType<typeof stubRun>, ci = false): FitnessContext {
  return sharedContextOf(makeTempRepo({}), run, ci);
}

describe('gitleaks の解決', () => {
  it('PATH 上の gitleaks を優先する', () => {
    const run = stubRun(() => FOUND);

    checkSecretScan(contextOf(run));

    expect(run.calls[0]).toBe('gitleaks version');
    expect(run.calls.some((command) => command.startsWith('mise'))).toBe(false);
  });

  it('PATH に無ければ mise exec 経由を試す', () => {
    checkSecretScan(contextOf(onlyMiseHasIt));

    expect(
      onlyMiseHasIt.calls.some((command) => command.startsWith('mise exec -- gitleaks ')),
    ).toBe(true);
  });
});

describe('checkSecretScan', () => {
  it('作業ツリーと git 履歴の両方を走査する', () => {
    const run = stubRun(() => FOUND);

    checkSecretScan(contextOf(run));

    expect(run.calls.some((command) => command.includes('dir .'))).toBe(true);
    expect(run.calls.some((command) => command.includes('gitleaks git'))).toBe(true);
  });

  it('検出が無ければ PASS', () => {
    const result = checkSecretScan(contextOf(alwaysFound));

    expect(result.ok).toBe(true);
    expect(result.actual).toBe('混入なし');
  });

  it('検出されたら FAIL にして箇所数を出す', () => {
    const result = checkSecretScan(contextOf(bothTargetsLeak));

    expect(result.ok).toBe(false);
    expect(result.actual).toBe('2 箇所で検出');
  });

  it('検出された内容を details に載せる', () => {
    const result = checkSecretScan(contextOf(bothTargetsLeak));

    expect(result.details?.some((line) => line.includes('REDACTED'))).toBe(true);
  });

  it('片方だけ検出されたら 1 箇所として報告する', () => {
    expect(checkSecretScan(contextOf(onlyHistoryLeaks)).actual).toBe('1 箇所で検出');
  });

  it('gitleaks 未導入のとき、ローカルでは案内だけ出して PASS にする', () => {
    const result = checkSecretScan(contextOf(alwaysMissing, false));

    expect(result.ok).toBe(true);
    expect(result.details?.[0]).toContain('mise install');
  });

  it('gitleaks 未導入のとき、CI では FAIL にする（黙って緑にしない）', () => {
    expect(checkSecretScan(contextOf(alwaysMissing, true)).ok).toBe(false);
  });
});
