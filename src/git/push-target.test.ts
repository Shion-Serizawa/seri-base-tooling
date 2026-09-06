import { describe, expect, it } from 'vitest';

import { parsePushInput, rejectedTargets, violationMessage } from './push-target.ts';

const SHA = '1234abcd'.repeat(5);
const ZERO = '0'.repeat(40);

/** pre-push フックが渡す 1 行。 */
function line(ref: string, localSha = SHA): string {
  return `refs/heads/${ref} ${localSha} refs/heads/${ref} ${SHA}\n`;
}

/** stdin から保護ブランチへの push を拒否するかどうか。 */
function rejects(stdin: string, protectedBranches: readonly string[] = ['main']): string[] {
  return rejectedTargets(parsePushInput(stdin), protectedBranches);
}

describe('parsePushInput', () => {
  it('1 行 1 ref を読み取る', () => {
    expect(parsePushInput(line('main'))).toStrictEqual([
      { remoteRef: 'refs/heads/main', deleting: false },
    ]);
  });

  it('local sha がすべて 0 なら削除として読む', () => {
    expect(parsePushInput(line('main', ZERO))[0]?.deleting).toBe(true);
  });

  it.each([
    ['空', ''],
    ['改行だけ', '\n\n'],
    ['欄が足りない', 'refs/heads/main\n'],
    ['空白だけ', '   \n'],
  ])('不正な入力でも例外にならず 0 件になる（%s）', (_label, stdin) => {
    expect(parsePushInput(stdin)).toStrictEqual([]);
  });

  it('タグの push は対象外（refs/heads/ 以外）', () => {
    expect(parsePushInput(`refs/tags/v1 ${SHA} refs/tags/v1 ${SHA}\n`)).toStrictEqual([]);
  });
});

describe('rejectedTargets', () => {
  it('保護ブランチへの push を拒否する', () => {
    expect(rejects(line('main'))).toStrictEqual(['main']);
  });

  it('保護していないブランチは通す', () => {
    expect(rejects(line('feat/x'))).toStrictEqual([]);
  });

  it('保護ブランチの削除も拒否する', () => {
    expect(rejects(line('main', ZERO))).toStrictEqual(['main']);
  });

  it('複数 ref のうち保護ブランチだけを拒否する', () => {
    expect(rejects(line('feat/x') + line('main') + line('docs/y'))).toStrictEqual(['main']);
  });

  it('保護ブランチを複数宣言できる', () => {
    expect(rejects(line('develop'), ['main', 'develop'])).toStrictEqual(['develop']);
  });

  it('protectedBranches が空なら何も拒否しない（既定値を持たない）', () => {
    expect(rejects(line('main'), [])).toStrictEqual([]);
  });

  it('前方一致では拒否しない（main-2 は main ではない）', () => {
    expect(rejects(line('main-2'))).toStrictEqual([]);
  });
});

describe('violationMessage', () => {
  it('拒否したブランチ名を出す', () => {
    expect(violationMessage(['main']).join('\n')).toContain('main');
  });
});
