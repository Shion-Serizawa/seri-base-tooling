import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { makeTempRepo } from '../../test/temp-repo.ts';
import { countEffectiveLines, isTestFile, listSourceFiles } from './walk.ts';

describe('listSourceFiles', () => {
  it('.ts と .tsx を再帰的に集める', () => {
    const root = makeTempRepo({
      'a.ts': '',
      'nested/deep/b.tsx': '',
      'nested/c.ts': '',
    });

    expect(listSourceFiles(root)).toHaveLength(3);
  });

  it('生成物と型定義ファイルは数えない', () => {
    const root = makeTempRepo({
      'keep.ts': '',
      'routeTree.gen.ts': '',
      'env.d.ts': '',
      'readme.md': '',
    });

    expect(listSourceFiles(root)).toStrictEqual([join(root, 'keep.ts')]);
  });

  it('node_modules や dist などの生成ディレクトリに降りない', () => {
    const root = makeTempRepo({
      'src/keep.ts': '',
      'node_modules/pkg/index.ts': '',
      'dist/bundle.ts': '',
      'coverage/report.ts': '',
      '.stryker-tmp/sandbox/x.ts': '',
    });

    expect(listSourceFiles(root)).toStrictEqual([join(root, 'src', 'keep.ts')]);
  });

  it('存在しないディレクトリは空配列を返す（例外にしない）', () => {
    expect(listSourceFiles(join(makeTempRepo({}), 'missing'))).toStrictEqual([]);
  });
});

describe('isTestFile', () => {
  it.each([
    ['src/todo.test.ts', true],
    ['src/todo.test.tsx', true],
    ['src/todo.spec.ts', true],
    ['src/todo.test-d.ts', true],
    ['apps/web/test/setup.ts', true],
    ['src/todo.ts', false],
    ['src/latest.ts', false],
  ])('%s → %s', (path, expected) => {
    expect(isTestFile(path)).toBe(expected);
    // Windows の区切り文字でも同じ判定になる
    expect(isTestFile(path.replaceAll('/', '\\'))).toBe(expected);
  });
});

describe('countEffectiveLines', () => {
  it('空行と行コメント・ブロックコメントを除いて数える', () => {
    const root = makeTempRepo({
      'a.ts': ['/**', ' * doc', ' */', '// 行コメント', '', 'const a = 1;', 'export { a };'].join(
        '\n',
      ),
    });

    expect(countEffectiveLines(join(root, 'a.ts'))).toBe(2);
  });

  it('中身が空のファイルは 0 行', () => {
    const root = makeTempRepo({ 'empty.ts': '\n\n  \n' });

    expect(countEffectiveLines(join(root, 'empty.ts'))).toBe(0);
  });
});
