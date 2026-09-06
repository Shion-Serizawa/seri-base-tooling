import { describe, expect, it } from 'vitest';

import { contextOf, makeTempRepo } from '../../test/temp-repo.ts';
import type { CheckResult } from '../lib/report.ts';
import { checkTemplateDrift } from './template-drift.ts';

const SHA = 'b'.repeat(40);
const OTHER_SHA = 'c'.repeat(40);

/** `.seri-base.json` と任意のファイルを持つ一時リポジトリ。 */
function repoWith(origin: unknown, files: Readonly<Record<string, string>> = {}): string {
  return makeTempRepo({
    'package.json': JSON.stringify({ name: 'root' }),
    '.seri-base.json': JSON.stringify(origin),
    ...files,
  });
}

function resultOf(root: string): CheckResult {
  const results = checkTemplateDrift(contextOf(root));
  expect(results).toHaveLength(1);
  const [result] = results;
  if (result === undefined) {
    throw new Error('検査結果が 1 件も返らなかった');
  }
  return result;
}

describe('checkTemplateDrift', () => {
  it('SHA で固定された出自は PASS（短縮 SHA を出す）', () => {
    const result = resultOf(repoWith({ template: 'owner/repo', ref: SHA }));

    expect(result.ok).toBe(true);
    expect(result.actual).toContain(SHA.slice(0, 7));
  });

  it("ref が 'template' ならテンプレート本体として PASS", () => {
    const result = resultOf(repoWith({ template: 'owner/repo', ref: 'template' }));

    expect(result.ok).toBe(true);
    expect(result.actual).toBe('テンプレート本体');
  });

  it('.seri-base.json が無ければ FAIL（計測不能を緑にしない）', () => {
    const root = makeTempRepo({ 'package.json': JSON.stringify({ name: 'root' }) });
    const result = resultOf(root);

    expect(result.ok).toBe(false);
    expect(result.actual).toBe('出自なし（計測不能）');
  });

  it('JSON として壊れていれば FAIL', () => {
    const root = makeTempRepo({
      'package.json': JSON.stringify({ name: 'root' }),
      '.seri-base.json': '{ not json',
    });

    expect(resultOf(root).ok).toBe(false);
  });

  it.each([
    ['HEAD', 'HEAD'],
    ['ブランチ名', 'main'],
    ['短縮 SHA', SHA.slice(0, 7)],
    ['タグ', 'v1.2.3'],
    ['空文字', ''],
  ])('ref が固定になっていなければ FAIL（%s）', (_label, ref) => {
    const result = resultOf(repoWith({ template: 'owner/repo', ref }));

    expect(result.ok).toBe(false);
    expect(result.details?.join('\n')).toContain('コミット SHA に書き換える');
  });

  it('ref が無い（文字列でない）場合も FAIL', () => {
    expect(resultOf(repoWith({ template: 'owner/repo' })).ok).toBe(false);
  });

  it.each([
    ['空文字', ''],
    ['文字列でない', 42],
  ])('template が申告されていなければ FAIL（%s）', (_label, template) => {
    const result = resultOf(repoWith({ template, ref: SHA }));

    expect(result.ok).toBe(false);
    expect(result.details?.[0]).toContain('template が空');
  });

  it('全 manifest が同じ SHA を引いていれば PASS', () => {
    const spec = `github:owner/repo#${SHA}`;
    const root = repoWith(
      { template: 'owner/repo', ref: SHA },
      {
        'package.json': JSON.stringify({ devDependencies: { '@seri/base-tooling': spec } }),
        'packages/db/package.json': JSON.stringify({
          devDependencies: { '@seri/base-tooling': spec },
        }),
      },
    );
    const result = resultOf(root);

    expect(result.ok).toBe(true);
    expect(result.actual).toContain('2 manifest');
  });

  it('manifest 間で SHA がずれていれば FAIL', () => {
    const root = repoWith(
      { template: 'owner/repo', ref: SHA },
      {
        'package.json': JSON.stringify({
          devDependencies: { '@seri/base-tooling': `github:owner/repo#${SHA}` },
        }),
        'packages/db/package.json': JSON.stringify({
          devDependencies: { '@seri/base-tooling': `github:owner/repo#${OTHER_SHA}` },
        }),
      },
    );
    const result = resultOf(root);

    expect(result.ok).toBe(false);
    expect(result.details?.join('\n')).toContain(OTHER_SHA);
  });

  it('ref が古いこと自体は違反にしない（ネットワークを見ない）', () => {
    const root = repoWith(
      { template: 'owner/repo', ref: SHA },
      {
        'package.json': JSON.stringify({
          devDependencies: { '@seri/base-tooling': `github:owner/repo#${OTHER_SHA}` },
        }),
      },
    );

    expect(resultOf(root).ok).toBe(true);
  });
});
