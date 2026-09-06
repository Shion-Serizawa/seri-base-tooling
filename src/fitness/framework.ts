import { collectBaseChecks } from './collect.ts';
import type { FitnessContext } from './lib/context.ts';
import { defaultContext } from './lib/context.ts';
import type { CheckResult } from './lib/report.ts';
import { printReport } from './lib/report.ts';

/**
 * リポジトリの形を知っている検査。A 層には置けないので呼び出し側が渡す。
 * 1 本で複数の結果を返してよい（`openapi drift` と `openapi breaking` のように）。
 *
 * 同期・非同期の union にはしていない。union にすると集約側が
 * 「Promise でない値を Promise.all に渡している」ことになり、
 * `await-thenable` と `no-return-wrap` のどちらかを必ず踏む。
 */
type ProjectCheck = (context: FitnessContext) => Promise<readonly CheckResult[]>;

type FitnessOptions = {
  readonly projectChecks?: readonly ProjectCheck[];
  /**
   * プロジェクト固有の検査が返すはずの結果の件数。
   *
   * 差し込みを忘れる・import が消える・非同期の解決に失敗する、のいずれでも
   * C 層の検査が丸ごと落ちるが、残った検査は全部 PASS するので
   * 「すべての適応度関数を満たしています」と表示されてしまう。
   * ⑬ が `CLAUDE.md` の不在を、⑨ がワークフローの不在を FAIL にしているのと
   * 同じ理由で、**件数が足りないこと自体を FAIL にする**。
   */
  readonly expectedProjectResults: number;
  readonly context?: FitnessContext;
};

async function collectProjectResults(
  checks: readonly ProjectCheck[],
  context: FitnessContext,
): Promise<CheckResult[]> {
  const collected = await Promise.all(checks.map((check) => check(context)));
  return collected.flat();
}

/** 差し込まれたプロジェクト固有の検査が、宣言どおりの件数あることを検証する。 */
function checkProjectWiring(actual: number, expected: number): CheckResult {
  return {
    name: 'project checks',
    ok: actual === expected,
    actual: `${actual} 件`,
    expected: `${expected} 件が差し込まれている`,
    ...(actual === expected
      ? {}
      : {
          details: [
            actual < expected
              ? 'プロジェクト固有の検査が欠けている（差し込み漏れ、または import の消失）'
              : '検査を増やしたなら run.ts の expectedProjectResults も直す',
          ],
        }),
  };
}

/**
 * 適応度関数を一括実行してレポートを出す。
 *
 * A 層の検査（`collectBaseChecks`）に、呼び出し側のプロジェクト固有の検査を
 * 足したものを 1 つのレポートにまとめる。
 */
export async function runFitness(options: FitnessOptions): Promise<boolean> {
  const context = options.context ?? defaultContext();
  const projectResults = await collectProjectResults(options.projectChecks ?? [], context);

  return printReport([
    ...collectBaseChecks(context),
    ...projectResults,
    checkProjectWiring(projectResults.length, options.expectedProjectResults),
  ]);
}
