import { describe, expect, it } from 'vitest';

import { firstLineOf, isValidCommitMessage, violationMessage } from './commit-message.ts';

const COMMIT_TYPES = [
  'feat',
  'fix',
  'docs',
  'style',
  'refactor',
  'perf',
  'test',
  'build',
  'ci',
  'chore',
  'revert',
];

describe('isValidCommitMessage', () => {
  it.each(COMMIT_TYPES)('%s を type として受け付ける', (type) => {
    expect(isValidCommitMessage(`${type}: 変更した`)).toBe(true);
  });

  it.each([
    ['feat(api): スコープつき', true],
    ['feat(quality-gates): ハイフン入りスコープ', true],
    ['refactor(apps/web): スラッシュ入りスコープ', true],
    ['feat!: 破壊的変更', true],
    ['feat(api)!: スコープつき破壊的変更', true],
    ['Merge branch main into feature', true],
    ['Revert "feat: 追加した"', true],
    ['なにか適当な変更', false],
    ['feat:説明の前に空白が無い', false],
    ['feat: ', false],
    ['Feat: 大文字の type', false],
    ['fixed: 存在しない type', false],
    ['feat(API): スコープが大文字', false],
  ])('%s → %s', (message, expected) => {
    expect(isValidCommitMessage(message)).toBe(expected);
  });

  it('2 行目以降は判定に影響しない', () => {
    expect(isValidCommitMessage(firstLineOf('feat: 追加\n\n詳細な本文'))).toBe(true);
  });
});

describe('firstLineOf', () => {
  it('1 行目だけを取り出す', () => {
    expect(firstLineOf('feat: 追加\n本文')).toBe('feat: 追加');
  });

  it('空文字列でも例外にしない', () => {
    expect(firstLineOf('')).toBe('');
  });
});

describe('violationMessage', () => {
  it('使える type と実際の 1 行目を案内する', () => {
    const lines = violationMessage('だめなメッセージ');

    expect(lines.some((line) => line.includes('feat, fix, docs'))).toBe(true);
    expect(lines.some((line) => line.includes('だめなメッセージ'))).toBe(true);
  });
});
