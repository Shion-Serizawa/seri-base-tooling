import { spawnSync } from 'node:child_process';

export type CommandOutcome = {
  /** プロセスが起動しなかった／タイムアウトで殺された場合は null */
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
};

type CommandOptions = {
  readonly cwd?: string;
  readonly timeoutMs?: number;
};

/**
 * 外部コマンドの実行。
 *
 * 型として公開しているのは、適応度関数の検査を**テストから差し替えられるようにする**ため。
 * 検査の本体（終了コードの解釈・出力の整形・PASS/FAIL の判定）は、
 * 実際に knip や gitleaks を起動しなくても検証できる必要がある。
 * ここのバグは「ゲートが常に緑になる」形で現れるので、検査自体がテスト対象でなければならない。
 */
export type RunCommand = (command: string, options?: CommandOptions) => CommandOutcome;

export const runCommand: RunCommand = (command, options = {}) => {
  const result = spawnSync(command, {
    shell: true,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    ...(options.timeoutMs === undefined ? {} : { timeout: options.timeoutMs }),
  });
  // 起動できなかった場合は status が null になる。各検査は null を失敗として扱うので、
  // 出力を取り繕う必要はない（取り繕うと「起動できていない」が見えなくなる）。
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
};

/** 出力を行に分割し、空行を落として先頭 `count` 行だけ返す（詳細表示用）。 */
export function outputLines(outcome: CommandOutcome, count: number): string[] {
  return `${outcome.stdout}${outcome.stderr}`
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
    .slice(0, count);
}
