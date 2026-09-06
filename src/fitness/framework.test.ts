import { beforeEach, describe, expect, it, vi } from 'vitest';

import { contextOf, makeHealthyBaseRepo } from '../test/temp-repo.ts';
import { runFitness } from './framework.ts';
import type { CheckResult } from './lib/report.ts';

const passing = (name: string): CheckResult => ({
  name,
  ok: true,
  actual: 'ok',
  expected: 'ok',
});

/** 常に PASS する擬似的なプロジェクト固有の検査。 */
function stubCheck(...names: readonly string[]): () => Promise<CheckResult[]> {
  return async () => {
    await Promise.resolve();
    return names.map((name) => passing(name));
  };
}

/** レポートの出力を捨てつつ、表示された行を検証できるようにする。 */
function captureReport(): { lines: () => string } {
  const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
  return { lines: () => spy.mock.calls.map((call) => String(call[0])).join('\n') };
}

describe('runFitness', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('A 層の検査とプロジェクト固有の検査を 1 つのレポートにまとめる', async () => {
    const report = captureReport();

    const passed = await runFitness({
      context: contextOf(makeHealthyBaseRepo()),
      projectChecks: [stubCheck('schema drift', 'openapi drift')],
      expectedProjectResults: 2,
    });

    expect(passed).toBe(true);
    expect(report.lines()).toContain('schema drift');
    expect(report.lines()).toContain('context drift');
  });

  it('非同期のプロジェクト固有の検査を待つ', async () => {
    captureReport();

    const passed = await runFitness({
      context: contextOf(makeHealthyBaseRepo()),
      projectChecks: [stubCheck('openapi drift')],
      expectedProjectResults: 1,
    });

    expect(passed).toBe(true);
  });

  it('プロジェクト固有の検査が差し込まれていなければ FAIL する', async () => {
    const report = captureReport();

    const passed = await runFitness({
      context: contextOf(makeHealthyBaseRepo()),
      expectedProjectResults: 5,
    });

    expect(passed).toBe(false);
    expect(report.lines()).toContain('プロジェクト固有の検査が欠けている');
  });

  it('宣言より多く返ってきても FAIL する（件数の宣言を腐らせない）', async () => {
    const report = captureReport();

    const passed = await runFitness({
      context: contextOf(makeHealthyBaseRepo()),
      projectChecks: [stubCheck('a', 'b')],
      expectedProjectResults: 1,
    });

    expect(passed).toBe(false);
    expect(report.lines()).toContain('expectedProjectResults');
  });

  it('プロジェクト固有の検査が 0 件でも、そう宣言していれば PASS する', async () => {
    captureReport();

    const passed = await runFitness({
      context: contextOf(makeHealthyBaseRepo()),
      expectedProjectResults: 0,
    });

    expect(passed).toBe(true);
  });
});
