import { localBin } from '../lib/bin.ts';
import type { FitnessContext } from '../lib/context.ts';
import { defaultContext } from '../lib/context.ts';
import { outputLines } from '../lib/exec.ts';
import type { CheckResult } from '../lib/report.ts';

const MAX_DETAILS = 12;

type ToolSpec = {
  readonly name: string;
  readonly command: string;
  readonly expected: string;
};

function runTool(context: FitnessContext, { name, command, expected }: ToolSpec): CheckResult {
  const outcome = context.run(command, { cwd: context.root });
  // 終了コード 0 だけを PASS にする。null（起動失敗・タイムアウト）を
  // 「違反なし」に倒すと、ツールが壊れた瞬間にゲートが常に緑になる。
  const ok = outcome.status === 0;

  return {
    name,
    ok,
    actual: ok ? '違反なし' : '違反あり',
    expected,
    details: ok ? [] : outputLines(outcome, MAX_DETAILS),
  };
}

/**
 * 適応度関数 ③ 重複率 / ⑥ デッドコード。
 * ⑦ アーキテクチャ依存制約は oxlint の no-restricted-imports / import/no-cycle 側で
 * 強制している（dependency-cruiser は TypeScript 7 の API 非対応で走査できない）。
 */
export function checkExternalTools(context: FitnessContext = defaultContext()): CheckResult[] {
  const knip = localBin(context.root, 'knip');

  return [
    runTool(context, {
      name: 'dead code (knip)',
      command: `${knip} --no-config-hints`,
      expected: '未使用の export / 依存が無い',
    }),
    // テストからしか使われていない実装コードを検出する。
    // 通常モードはテストファイルもエントリなので、「テストを1本足せば
    // デッドコード判定を回避できる」という抜け道がある。
    // production モードは `!` を付けたエントリ（本番の入口）だけから到達性を見る。
    runTool(context, {
      name: 'dead code (production)',
      command: `${knip} --production --no-config-hints`,
      expected: '本番から到達しない export が無い',
    }),
    runTool(context, {
      name: 'duplication (jscpd)',
      command: localBin(context.root, 'jscpd'),
      expected: '重複率が閾値以下',
    }),
  ];
}
