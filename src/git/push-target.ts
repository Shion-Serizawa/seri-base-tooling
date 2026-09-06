/**
 * pre-push フックでの push 先の判定。
 *
 * git は pre-push フックの stdin に `<local ref> <local sha> <remote ref> <remote sha>` を
 * 1 行 1 ref で渡す。判定を入出力のない関数に切り出しているのは、フックを実際に
 * 走らせなくても「止めるべき push が通る」ことを検証できるようにするため。
 *
 * サーバ側でルールセットを強制できるならそちらが本筋。これはそれができない
 * （private かつ Free プランなど）リポジトリのための、クライアント側の歯止め。
 */
export type PushTarget = {
  /** push 先の ref。例: `refs/heads/main` */
  readonly remoteRef: string;
  /** ブランチの削除（local sha がすべて 0）かどうか */
  readonly deleting: boolean;
};

const HEADS_PREFIX = 'refs/heads/';
const ZERO_SHA = /^0+$/u;
/** `<local ref> <local sha> <remote ref> <remote sha>` の 4 つ。 */
const FIELD_COUNT = 4;

/**
 * pre-push フックの stdin を読み取る。
 *
 * 空行や欄の足りない行は無視する。フックは stdin が空のまま呼ばれることもあり、
 * そこで例外を投げると push そのものが失敗する。
 */
export function parsePushInput(stdin: string): PushTarget[] {
  return stdin
    .split('\n')
    .map((line) => line.trim().split(/\s+/u))
    .filter((fields) => fields.length >= FIELD_COUNT)
    .map((fields) => ({
      remoteRef: fields[2] ?? '',
      deleting: ZERO_SHA.test(fields[1] ?? ''),
    }))
    .filter((target) => target.remoteRef.startsWith(HEADS_PREFIX));
}

/**
 * 拒否する保護ブランチの名前。空なら push を通してよい。
 *
 * どのブランチを守るかは使う側の判断なので、既定値は持たない。
 */
export function rejectedTargets(
  targets: readonly PushTarget[],
  protectedBranches: readonly string[],
): string[] {
  return targets
    .map((target) => target.remoteRef.slice(HEADS_PREFIX.length))
    .filter((branch) => protectedBranches.includes(branch));
}

export function violationMessage(branches: readonly string[]): string[] {
  return [
    `保護ブランチへの直接 push は禁止です: ${branches.join(', ')}`,
    '  ブランチを切って PR を作ってください。',
  ];
}
