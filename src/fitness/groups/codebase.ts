import { checkExternalTools } from '../checks/external-tools.ts';
import { checkLintPolicy } from '../checks/lint-policy.ts';
import { checkSecretScan } from '../checks/secret-scan.ts';
import { checkSizeBudget } from '../checks/size-budget.ts';
import { checkSupplyChain } from '../checks/supply-chain.ts';
import { checkTestRatio } from '../checks/test-ratio.ts';
import type { FitnessContext } from '../lib/context.ts';
import type { CheckResult } from '../lib/report.ts';

/**
 * コードそのものの形と、依存の供給網を見る検査。
 *
 * `collect.ts` から直接 11 本を import すると `import/max-dependencies`（上限 10）に
 * 当たる。数を通すためだけの分割ではなく、「コードを見るもの」と
 * 「生成物・文書が実物と乖離していないかを見るもの」という
 * 実際に性質の違う 2 群に分けている。
 */
export function collectCodebaseChecks(context: FitnessContext): CheckResult[] {
  return [
    checkTestRatio(context),
    ...checkExternalTools(context),
    ...checkSizeBudget(context),
    ...checkSupplyChain(context),
    checkSecretScan(context),
    ...checkLintPolicy(context),
  ];
}
