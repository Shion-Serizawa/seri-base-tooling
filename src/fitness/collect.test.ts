import { describe, expect, it } from 'vitest';

import { contextOf, makeHealthyBaseRepo, stubRun } from '../test/temp-repo.ts';
import { collectBaseChecks } from './collect.ts';
import type { CommandOutcome } from './lib/exec.ts';

const jscpdFails = (command: string): Partial<CommandOutcome> =>
  command.includes('jscpd') ? { status: 1 } : {};

describe('collectBaseChecks', () => {
  it('健全なリポジトリではすべての検査が PASS になる', () => {
    const results = collectBaseChecks(contextOf(makeHealthyBaseRepo()));

    expect(results.filter((result) => !result.ok)).toStrictEqual([]);
  });

  it('リポジトリの形を知らない 14 本の検査を返す', () => {
    const results = collectBaseChecks(contextOf(makeHealthyBaseRepo()));

    expect(results.map((result) => result.name)).toStrictEqual([
      'test ratio',
      'dead code (knip)',
      'dead code (production)',
      'duplication (jscpd)',
      'bundle size (api)',
      'bundle size (web)',
      'dependency pinning',
      'install policy',
      'actions pinning',
      'template drift',
      'secret scan',
      'lint policy',
      'threshold drift',
      'context drift',
    ]);
  });

  it('検査名が重複しない（レポートで取り違えない）', () => {
    const names = collectBaseChecks(contextOf(makeHealthyBaseRepo())).map((result) => result.name);

    expect(new Set(names).size).toBe(names.length);
  });

  it('1 つでも壊れていれば、その検査だけが FAIL になる', () => {
    const failed = collectBaseChecks(contextOf(makeHealthyBaseRepo(), stubRun(jscpdFails))).filter(
      (result) => !result.ok,
    );

    expect(failed.map((result) => result.name)).toStrictEqual(['duplication (jscpd)']);
  });

  it('外部コマンドを実際に起動せずに全検査が走る（root の外に触れない）', () => {
    const run = stubRun();

    collectBaseChecks(contextOf(makeHealthyBaseRepo(), run));

    expect(run.calls.length).toBeGreaterThan(0);
  });
});
