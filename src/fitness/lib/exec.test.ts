import { describe, expect, it } from 'vitest';

import { outputLines, runCommand } from './exec.ts';

describe('runCommand', () => {
  it('成功したコマンドの終了コードと標準出力を返す', () => {
    const outcome = runCommand('node -e "process.stdout.write(String(42))"');

    expect(outcome.status).toBe(0);
    expect(outcome.stdout).toBe('42');
  });

  it('失敗した終了コードをそのまま返す（0 に丸めない）', () => {
    const outcome = runCommand('node -e "process.exit(3)"');

    expect(outcome.status).toBe(3);
  });

  it('標準エラー出力を取り込む', () => {
    const outcome = runCommand('node -e "process.stderr.write(String(9))"');

    expect(outcome.stderr).toBe('9');
  });

  it('cwd を指定するとそのディレクトリで実行する', () => {
    const outcome = runCommand('node -e "process.stdout.write(process.cwd())"', {
      cwd: import.meta.dirname,
    });

    expect(outcome.stdout).toBe(import.meta.dirname);
  });

  it('timeoutMs を指定しても時間内に終われば通常どおり成功する', () => {
    const outcome = runCommand('node -e "process.exit(0)"', { timeoutMs: 30_000 });

    expect(outcome.status).toBe(0);
  });

  it('起動できないコマンドは status が 0 以外になる', () => {
    const outcome = runCommand('seri-command-that-does-not-exist');

    expect(outcome.status).not.toBe(0);
  });
});

describe('outputLines', () => {
  it('stdout と stderr を結合し、空行を落として先頭から切り出す', () => {
    const lines = outputLines({ status: 1, stdout: 'a\n\nb\n', stderr: 'c\n' }, 2);

    expect(lines).toStrictEqual(['a', 'b']);
  });

  it('行末の空白を落とす', () => {
    expect(outputLines({ status: 1, stdout: 'x   \n', stderr: '' }, 5)).toStrictEqual(['x']);
  });

  it('出力が無ければ空配列になる', () => {
    expect(outputLines({ status: 0, stdout: '', stderr: '' }, 5)).toStrictEqual([]);
  });
});
