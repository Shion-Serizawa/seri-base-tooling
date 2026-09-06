import { checkContextDrift } from '../checks/context-drift.ts';
import type { FitnessContext } from '../lib/context.ts';
import type { CheckResult } from '../lib/report.ts';

/**
 * AI に読ませる文書が実物と乖離していないかを見る検査。
 *
 * リポジトリの形（契約・スキーマ・生成物）を知らないので、どの派生でも同じように
 * 使える。形を知っている検査は `project/checks.ts` にある。
 */
export function collectDocumentChecks(context: FitnessContext): CheckResult[] {
  return [checkContextDrift(context)];
}
