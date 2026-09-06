import { collectCodebaseChecks } from './groups/codebase.ts';
import { collectDocumentChecks } from './groups/documents.ts';
import type { FitnessContext } from './lib/context.ts';
import { defaultContext } from './lib/context.ts';
import type { CheckResult } from './lib/report.ts';

/**
 * どの派生でも同じように使える検査（ADR 0010 の A 層）。
 *
 * カバレッジ（①）と複雑度（⑤）とアーキテクチャ境界（⑦）は
 * それぞれ vitest / oxlint 側で強制しているためここには含めない。
 * 含めているのは、それらの指標をハックした場合に悪化する側の指標と、
 * 型でもテストでも守れない性質のもの（依存の固定・シークレット・文書の乖離）。
 *
 * 検査は 2 群に分けてある。`groups/codebase.ts` がコードの形と供給網、
 * `groups/documents.ts` が AI に読ませる文書の乖離を見る。
 * リポジトリの形を知っている検査は A 層に置けないので、呼び出し側が
 * `runFitness` に差し込む（`project/checks.ts`）。
 */
export function collectBaseChecks(context: FitnessContext = defaultContext()): CheckResult[] {
  return [...collectCodebaseChecks(context), ...collectDocumentChecks(context)];
}
