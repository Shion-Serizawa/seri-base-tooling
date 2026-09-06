import { describe, expect, it } from 'vitest';

import { contextOf, makeTempRepo, stubRun } from '../../test/temp-repo.ts';
import type { CommandOutcome } from '../lib/exec.ts';
import { checkExternalTools } from './external-tools.ts';

const OK = { status: 0 };

const allPass = (): Partial<CommandOutcome> => OK;
const allUnlaunchable = (): Partial<CommandOutcome> => ({ status: null });

/** 指定した文字列を含むコマンドだけ失敗させる。 */
function onlyFailing(needle: string, outcome: Partial<CommandOutcome>) {
  return (command: string): Partial<CommandOutcome> => (command.includes(needle) ? outcome : OK);
}

describe('checkExternalTools', () => {
  it('knip を通常モードと production モードの両方で走らせる', () => {
    const run = stubRun(allPass);

    checkExternalTools(contextOf(makeTempRepo({}), run));

    expect(run.calls.filter((command) => command.includes('knip'))).toHaveLength(2);
    expect(run.calls.some((command) => command.includes('--production'))).toBe(true);
  });

  it('jscpd も含めて 3 件の検査を返す', () => {
    const results = checkExternalTools(contextOf(makeTempRepo({}), stubRun(allPass)));

    expect(results.map((result) => result.name)).toStrictEqual([
      'dead code (knip)',
      'dead code (production)',
      'duplication (jscpd)',
    ]);
  });

  it('終了コード 0 を PASS にする', () => {
    const results = checkExternalTools(contextOf(makeTempRepo({}), stubRun(allPass)));

    expect(results.every((result) => result.ok)).toBe(true);
  });

  it('終了コードが 0 以外なら FAIL にする', () => {
    const run = stubRun(onlyFailing('jscpd', { status: 1, stdout: '重複が 5%\n' }));
    const results = checkExternalTools(contextOf(makeTempRepo({}), run));

    expect(results.find((result) => result.name === 'duplication (jscpd)')?.ok).toBe(false);
  });

  it('失敗したツールの出力を details に載せる', () => {
    const run = stubRun(onlyFailing('jscpd', { status: 1, stdout: '重複が 5%\n' }));
    const results = checkExternalTools(contextOf(makeTempRepo({}), run));

    expect(results.find((result) => result.name === 'duplication (jscpd)')?.details).toStrictEqual([
      '重複が 5%',
    ]);
  });

  it('ツールが起動できず status が null のときも FAIL にする（false green を作らない）', () => {
    const results = checkExternalTools(contextOf(makeTempRepo({}), stubRun(allUnlaunchable)));

    expect(results.every((result) => !result.ok)).toBe(true);
  });

  it('production モードだけ落ちた場合を区別して報告する', () => {
    const run = stubRun(onlyFailing('--production', { status: 1 }));
    const results = checkExternalTools(contextOf(makeTempRepo({}), run));

    expect(results.map((result) => result.ok)).toStrictEqual([true, false, true]);
  });
});
