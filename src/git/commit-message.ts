/**
 * Conventional Commits 形式の検証。
 *
 * `head` / `grep` に依存しないよう Node で実装している（Windows の Git フックでも動く）。
 * 判定を入出力のない関数に切り出しているのは、フックを実際に走らせなくても
 * 「通してはいけないメッセージが通る」ことを検証できるようにするため。
 */
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
] as const;

const SCOPE = String.raw`(?:\([a-z0-9/-]+\))?`;
const PATTERN = new RegExp(`^(?:${COMMIT_TYPES.join('|')})${SCOPE}!?: .+`, 'u');

/** マージとリバートの自動生成メッセージは形式の対象外。 */
function isGenerated(firstLine: string): boolean {
  return firstLine.startsWith('Merge ') || firstLine.startsWith('Revert ');
}

export function isValidCommitMessage(firstLine: string): boolean {
  return isGenerated(firstLine) || PATTERN.test(firstLine);
}

/** メッセージ本文から検証対象の 1 行目を取り出す。 */
export function firstLineOf(message: string): string {
  return message.split('\n')[0] ?? '';
}

export function violationMessage(firstLine: string): string[] {
  return [
    'コミットメッセージを Conventional Commits 形式にしてください。',
    '  例: feat(api): ユーザー検索を追加',
    `  使える type: ${COMMIT_TYPES.join(', ')}`,
    `  実際の 1 行目: ${firstLine}`,
  ];
}
