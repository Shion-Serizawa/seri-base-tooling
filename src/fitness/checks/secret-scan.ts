import type { FitnessContext } from '../lib/context.ts';
import { defaultContext } from '../lib/context.ts';
import type { RunCommand } from '../lib/exec.ts';
import type { CheckResult } from '../lib/report.ts';

const NAME = 'secret scan';
const EXPECTED = 'シークレットの混入が無い';
const MAX_DETAIL_LINES = 8;

const TARGETS = [
  { label: '作業ツリー', args: 'dir .' },
  { label: 'git 履歴', args: 'git' },
];

/**
 * gitleaks の呼び出し方を解決する。
 * mise 管理なので PATH に無い環境（フックのシェル等）では `mise exec` 経由を試す。
 */
function resolveGitleaks(run: RunCommand, cwd: string): string | undefined {
  for (const command of ['gitleaks', 'mise exec -- gitleaks']) {
    if (run(`${command} version`, { cwd }).status === 0) {
      return command;
    }
  }
  return undefined;
}

/**
 * 適応度関数 ⑨ シークレットの混入検査。
 *
 * 作業ツリーと git 履歴の両方を見る。履歴に一度入った鍵は
 * ファイルを消しても残るため、コミット前に止めることが重要。
 */
export function checkSecretScan(context: FitnessContext = defaultContext()): CheckResult {
  const gitleaks = resolveGitleaks(context.run, context.root);

  if (gitleaks === undefined) {
    return {
      name: NAME,
      // CI では必須。ローカルで未導入なら案内だけ出す
      ok: !context.ci,
      actual: 'gitleaks 未検出',
      expected: EXPECTED,
      details: ['`mise install` で導入できる（mise.toml と mise.lock に固定済み）'],
    };
  }

  const failures = TARGETS.map((target) => ({
    target,
    outcome: context.run(`${gitleaks} ${target.args} --no-banner --redact --exit-code 1`, {
      cwd: context.root,
    }),
  })).filter(({ outcome }) => outcome.status !== 0);

  return {
    name: NAME,
    ok: failures.length === 0,
    actual: failures.length === 0 ? '混入なし' : `${failures.length} 箇所で検出`,
    expected: EXPECTED,
    details: failures.flatMap(({ target, outcome }) =>
      `${target.label}:\n${outcome.stdout}${outcome.stderr}`
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .slice(0, MAX_DETAIL_LINES),
    ),
  };
}
