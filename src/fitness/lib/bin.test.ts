import { isAbsolute, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { localBin } from './bin.ts';

describe('localBin', () => {
  it('root からの絶対パスを返す（cwd に依存しない）', () => {
    const command = localBin(join('/tmp', 'repo'), 'knip');

    expect(isAbsolute(command.replaceAll('"', ''))).toBe(true);
  });

  it('node_modules/.bin 配下を指す', () => {
    const command = localBin(join('/tmp', 'repo'), 'knip');

    expect(command).toContain(join('node_modules', '.bin', 'knip'));
  });

  it('パスに空白があってもシェルに渡せるようクォートする', () => {
    const command = localBin(join('/tmp', 'my repo'), 'jscpd');

    expect(command.startsWith('"')).toBe(true);
    expect(command.endsWith('"')).toBe(true);
  });
});
