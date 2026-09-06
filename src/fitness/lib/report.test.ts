import { describe, expect, it, vi } from 'vitest';

import type { CheckResult } from './report.ts';
import { printReport } from './report.ts';

/** console.log をせき止めて、ANSI エスケープを外した本文だけを取り出す。 */
function captureOutput(): () => string {
  const lines: string[] = [];
  vi.spyOn(console, 'log').mockImplementation((line?: unknown) => {
    lines.push(typeof line === 'string' ? line : '');
  });
  return () => lines.join('\n').replaceAll(/\[\d+m/gu, '');
}

const pass: CheckResult = { name: 'a', ok: true, actual: '0', expected: 'zero' };
const fail: CheckResult = { name: 'bbbb', ok: false, actual: '1', expected: 'zero' };

describe('printReport', () => {
  it('すべて成功したら true を返す', () => {
    captureOutput();

    expect(printReport([pass])).toBe(true);
  });

  it('1 件でも失敗したら false を返す', () => {
    captureOutput();

    expect(printReport([pass, fail])).toBe(false);
  });

  it('成功と失敗を PASS / FAIL で区別して出力する', () => {
    const output = captureOutput();

    printReport([pass, fail]);

    expect(output()).toContain('PASS  a');
    expect(output()).toContain('FAIL  bbbb');
  });

  it('失敗件数と全体件数を出す', () => {
    const output = captureOutput();

    printReport([pass, fail]);

    expect(output()).toContain('1 / 2 件の適応度関数が閾値を外れています');
  });

  it('成功時は満たした件数を出す', () => {
    const output = captureOutput();

    printReport([pass]);

    expect(output()).toContain('すべての適応度関数を満たしています (1 件)');
  });

  it('名前を最長のものに揃えて字下げする', () => {
    const output = captureOutput();

    printReport([pass, fail]);

    expect(output()).toContain('PASS  a     ');
  });

  it('details を字下げして出力する', () => {
    const output = captureOutput();

    printReport([{ ...fail, details: ['原因の 1 行目'] }]);

    expect(output()).toContain('        原因の 1 行目');
  });

  it('検査が 0 件なら false を返す（収集が壊れたのを緑にしない）', () => {
    captureOutput();

    expect(printReport([])).toBe(false);
  });

  it('検査が 0 件のときは収集できなかったことを表示する', () => {
    const output = captureOutput();
    printReport([]);

    expect(output()).toContain('適応度関数が 1 件も収集できませんでした');
  });
});
