import { describe, expect, it } from 'vitest';

import { contextOf, makeTempRepo } from '../../test/temp-repo.ts';
import type { CheckResult } from '../lib/report.ts';
import { checkTestRatio } from './test-ratio.ts';

/**
 * ワークスペースの束かどうかは、ルートの `package.json` の `workspaces` から決まる。
 * 領域名を決め打ちにすると、レイアウトの違う派生リポジトリで対象が 0 件になる。
 */
const ROOT_MANIFEST = JSON.stringify({
  name: 'root',
  workspaces: ['apps/*', 'packages/*', 'tooling/*'],
});

/** 実装 n 行・テスト m 行のワークスペースを作る。 */
function workspaceOf(implementation: number, test: number): Readonly<Record<string, string>> {
  return {
    'package.json': ROOT_MANIFEST,
    'packages/domain/src/todo.ts': 'const a = 1;\n'.repeat(implementation),
    'packages/domain/src/todo.test.ts': 'expect(1).toBe(1);\n'.repeat(test),
  };
}

function checkOf(files: Readonly<Record<string, string>>): CheckResult {
  return checkTestRatio(contextOf(makeTempRepo(files)));
}

function detailsOf(result: CheckResult): readonly string[] {
  return result.details ?? [];
}

describe('checkTestRatio', () => {
  it('上限以内なら PASS', () => {
    expect(checkOf(workspaceOf(10, 20)).ok).toBe(true);
  });

  it('上限ちょうどは PASS（境界を含む）', () => {
    expect(checkOf(workspaceOf(10, 25)).ok).toBe(true);
  });

  it('上限を超えたら FAIL', () => {
    expect(checkOf(workspaceOf(10, 26)).ok).toBe(false);
  });

  it('テストが 1 行も無くても FAIL にしない（下限は置かない）', () => {
    expect(checkOf({ 'packages/db/src/schema.ts': 'const a = 1;\n'.repeat(100) }).ok).toBe(true);
  });

  it('実装が 0 行のワークスペースでも 0 除算にならず PASS', () => {
    expect(checkOf({ 'packages/db/src/schema.test.ts': 'expect(1).toBe(1);\n' }).ok).toBe(true);
  });

  it('全体では上限内でも、1 つのワークスペースが超えていれば FAIL', () => {
    const result = checkOf({
      ...workspaceOf(10, 30),
      'apps/api/src/a.ts': 'const a = 1;\n'.repeat(500),
    });

    expect(Number(result.actual)).toBeLessThan(2.5);
    expect(result.ok).toBe(false);
  });

  it('全体の比率を実測値として出す', () => {
    expect(checkOf(workspaceOf(10, 5)).actual).toBe('0.50');
  });

  it('apps / packages はワークスペース単位に分けて内訳を出す', () => {
    const details = detailsOf(
      checkOf({
        'package.json': ROOT_MANIFEST,
        'apps/api/src/a.ts': 'const a = 1;\n',
        'packages/domain/src/b.ts': 'const b = 1;\n',
      }),
    );

    expect(details.some((line) => line.startsWith('apps/api'))).toBe(true);
    expect(details.some((line) => line.startsWith('packages/domain'))).toBe(true);
  });

  it('scripts はワークスペースを分けずにまとめる', () => {
    const details = detailsOf(
      checkOf({
        'scripts/fitness/a.ts': 'const a = 1;\n',
        'scripts/git/b.ts': 'const b = 1;\n',
      }),
    );

    expect(details).toHaveLength(1);
    expect(details[0]).toContain('scripts');
  });

  it('テストと実装を別々に数える', () => {
    const details = detailsOf(checkOf(workspaceOf(4, 2)));

    expect(details[0]).toContain('テスト 2 行 / 実装 4 行');
  });

  it('計測対象外のディレクトリは数えない', () => {
    const details = detailsOf(
      checkOf({ ...workspaceOf(10, 10), 'docs/example.ts': 'const a = 1;\n' }),
    );

    expect(details.some((line) => line.startsWith('docs'))).toBe(false);
  });

  it('ソースが 1 本も無ければ FAIL にする（比率 0.00 の PASS にしない）', () => {
    const result = checkOf({});

    expect(result.ok).toBe(false);
    expect(result.actual).toBe('ソースなし（計測不能）');
  });

  it('空のリポジトリでも例外にはならない', () => {
    expect(() => checkOf({})).not.toThrow();
  });
});
