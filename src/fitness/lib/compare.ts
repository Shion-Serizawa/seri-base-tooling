const MAX_DETAILS = 10;

export type Comparison = {
  readonly label: string;
  readonly actual: unknown;
  readonly expected: unknown;
};

/**
 * 宣言したポリシーと実際の設定を突き合わせ、食い違ったものだけを説明文にする。
 *
 * 設定ファイルの検査は「10 個の等値比較」の形になりがちで、素直に書くと
 * 1 つ目の不一致で止まって残りが見えない。全部を比較してから並べる。
 */
export function differences(comparisons: readonly Comparison[]): string[] {
  return comparisons
    .filter(({ actual, expected }) => JSON.stringify(actual) !== JSON.stringify(expected))
    .map(({ label, actual }) => `${label}: ${JSON.stringify(actual)}`)
    .slice(0, MAX_DETAILS);
}
