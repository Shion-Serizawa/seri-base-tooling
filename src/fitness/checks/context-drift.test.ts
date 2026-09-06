import { describe, expect, it } from 'vitest';

import { contextOf, makeTempRepo } from '../../test/temp-repo.ts';
import { checkContextDrift } from './context-drift.ts';

const PACKAGE_JSON = JSON.stringify({
  name: 'root',
  scripts: { fitness: 'x', 'openapi:generate': 'x' },
});

const DB_PACKAGE_JSON = JSON.stringify({
  name: '@seri/db',
  scripts: { 'db:generate': 'x' },
});

/** 検査を走らせ、失敗の理由（details）だけを取り出す。 */
function detailsOf(files: Readonly<Record<string, string>>): readonly string[] {
  const result = checkContextDrift(contextOf(makeTempRepo(files)));
  return result.ok ? [] : (result.details ?? ['(details なし)']);
}

describe('checkContextDrift', () => {
  it('参照先がすべて実在すれば PASS', () => {
    const result = checkContextDrift(
      contextOf(
        makeTempRepo({
          'package.json': PACKAGE_JSON,
          'README.md': '# readme',
          'docs/adr/0001-x.md': '# adr',
          'scripts/fitness/run.ts': '',
          'CLAUDE.md': [
            '[README](README.md) と [ADR](docs/adr/0001-x.md) を読む。',
            '`scripts/fitness/run.ts` が入口。`bun run fitness` で計測する。',
          ].join('\n'),
        }),
      ),
    );

    expect(result.ok).toBe(true);
    expect(result.actual).toContain('1 文書');
  });

  it('markdown リンクの参照切れを検出する', () => {
    const details = detailsOf({
      'package.json': PACKAGE_JSON,
      'CLAUDE.md': '[ADR](docs/adr/9999-nope.md)',
    });

    expect(details).toStrictEqual(['CLAUDE.md: docs/adr/9999-nope.md が存在しない']);
  });

  it('バッククォートで書かれたパスの参照切れも検出する', () => {
    const details = detailsOf({
      'package.json': PACKAGE_JSON,
      'CLAUDE.md': '`packages/contract/src/gone.ts` を見る',
    });

    expect(details).toStrictEqual(['CLAUDE.md: packages/contract/src/gone.ts が存在しない']);
  });

  it('存在しない bun run スクリプトを検出する', () => {
    const details = detailsOf({
      'package.json': PACKAGE_JSON,
      'CLAUDE.md': '`bun run nosuchscript` を実行する',
    });

    expect(details).toStrictEqual(['CLAUDE.md: bun run nosuchscript が存在しない']);
  });

  it('--filter 付きのスクリプトをワークスペースの package.json で解決する', () => {
    const files = {
      'package.json': PACKAGE_JSON,
      'packages/db/package.json': DB_PACKAGE_JSON,
      'CLAUDE.md': '`bun run --filter @seri/db db:generate` を実行する',
    };

    expect(detailsOf(files)).toStrictEqual([]);
    expect(
      detailsOf({ ...files, 'CLAUDE.md': '`bun run --filter @seri/db db:nope`' }),
    ).toStrictEqual(['CLAUDE.md: bun run --filter @seri/db db:nope が存在しない']);
  });

  it('依存しているだけの package.json を、そのワークスペースだと誤認しない', () => {
    // apps/api は @seri/db に依存しているだけ。scripts を持つのは packages/db。
    // 文字列一致で探すと apps/api を先に拾い、db:generate を「無い」と誤答する。
    expect(
      detailsOf({
        'package.json': PACKAGE_JSON,
        'apps/api/package.json': JSON.stringify({
          name: '@seri/api',
          dependencies: { '@seri/db': 'workspace:*' },
        }),
        'packages/db/package.json': DB_PACKAGE_JSON,
        'CLAUDE.md': '`bun run --filter @seri/db db:generate` を実行する',
      }),
    ).toStrictEqual([]);
  });

  it('スキルの相対リンクはスキルの位置から解決する', () => {
    const files = {
      'package.json': PACKAGE_JSON,
      'README.md': '# readme',
      '.claude/skills/add-thing/SKILL.md': '[README](../../../README.md)',
    };

    expect(detailsOf(files)).toStrictEqual([]);
    // ルートからの相対だと思って書くと、実際には解決できない
    expect(
      detailsOf({ ...files, '.claude/skills/add-thing/SKILL.md': '[README](README.md)' }),
    ).toStrictEqual([
      '.claude/skills/add-thing/SKILL.md: .claude/skills/add-thing/README.md が存在しない',
    ]);
  });

  it('CLAUDE.md とスキルの両方を走査する', () => {
    const result = checkContextDrift(
      contextOf(
        makeTempRepo({
          'package.json': PACKAGE_JSON,
          'CLAUDE.md': '[x](gone-a.md)',
          '.claude/skills/one/SKILL.md': '[y](gone-b.md)',
          '.claude/skills/two/SKILL.md': '# 参照なし',
        }),
      ),
    );

    expect(result.ok).toBe(false);
    expect(result.details).toHaveLength(2);
    expect(result.actual).toBe('参照切れ 2 件');
  });

  it('外部 URL とページ内アンカーは参照先として扱わない', () => {
    expect(
      detailsOf({
        'package.json': PACKAGE_JSON,
        'CLAUDE.md': '[a](https://example.com/x.md) [b](#section) [c](mailto:x@example.com)',
      }),
    ).toStrictEqual([]);
  });

  it('アンカー付きのリンクはファイル部分だけを見る', () => {
    const files = { 'package.json': PACKAGE_JSON, 'README.md': '# readme' };

    expect(detailsOf({ ...files, 'CLAUDE.md': '[a](README.md#品質ゲート)' })).toStrictEqual([]);
    expect(detailsOf({ ...files, 'CLAUDE.md': '[a](GONE.md#品質ゲート)' })).toStrictEqual([
      'CLAUDE.md: GONE.md が存在しない',
    ]);
  });

  it('パスに見えないバッククォートを拾わない', () => {
    expect(
      detailsOf({
        'package.json': PACKAGE_JSON,
        'CLAUDE.md': ['`/api/rpc`', '`<resource>.ts`', '`os`', '`scripts/**/*.ts`'].join('\n'),
      }),
    ).toStrictEqual([]);
  });

  it('同じ参照が複数回出ても 1 件にまとめる', () => {
    expect(
      detailsOf({
        'package.json': PACKAGE_JSON,
        'CLAUDE.md': '[a](gone.md) をもう一度 [a](gone.md)',
      }),
    ).toStrictEqual(['CLAUDE.md: gone.md が存在しない']);
  });

  it('`bun run <ファイルパス>` を script 名と誤認しない（実在すれば PASS）', () => {
    expect(
      detailsOf({
        'package.json': PACKAGE_JSON,
        'scripts/fitness/run.ts': '',
        'CLAUDE.md': '入口は `bun run scripts/fitness/run.ts`。',
      }),
    ).toStrictEqual([]);
  });

  it('`bun run <ファイルパス>` のファイルが無ければ FAIL にする', () => {
    expect(
      detailsOf({
        'package.json': PACKAGE_JSON,
        'CLAUDE.md': '入口は `bun run scripts/fitness/gone.ts`。',
      }),
    ).toStrictEqual(['CLAUDE.md: bun run scripts/fitness/gone.ts が存在しない']);
  });

  it('ワークスペース名に数字が入っていても --filter を検査する', () => {
    expect(
      detailsOf({
        'package.json': PACKAGE_JSON,
        'packages/db2/package.json': JSON.stringify({ name: '@seri/db2', scripts: {} }),
        'CLAUDE.md': '`bun run --filter @seri/db2 nope` を実行する。',
      }),
    ).toStrictEqual(['CLAUDE.md: bun run --filter @seri/db2 nope が存在しない']);
  });

  it('タイトル付きの markdown リンクも参照として拾う', () => {
    expect(
      detailsOf({
        'package.json': PACKAGE_JSON,
        'CLAUDE.md': '[a](GONE.md "タイトル")',
      }),
    ).toStrictEqual(['CLAUDE.md: GONE.md が存在しない']);
  });

  it('ルート直下の設定ファイルの参照切れも検出する', () => {
    expect(
      detailsOf({
        'package.json': PACKAGE_JSON,
        'CLAUDE.md': 'しきい値は `.oxlintrc.json` と `stryker.config.json` にも書く。',
      }),
    ).toStrictEqual([
      'CLAUDE.md: .oxlintrc.json が存在しない',
      'CLAUDE.md: stryker.config.json が存在しない',
    ]);
  });

  it('`.claude/` 配下の参照切れも検出する', () => {
    expect(
      detailsOf({
        'package.json': PACKAGE_JSON,
        'CLAUDE.md': '設定は `.claude/settings.json` にある。',
      }),
    ).toStrictEqual(['CLAUDE.md: .claude/settings.json が存在しない']);
  });

  it('階層化したスキルの SKILL.md も検査対象にする', () => {
    expect(
      detailsOf({
        'package.json': PACKAGE_JSON,
        'CLAUDE.md': '# ok',
        '.claude/skills/group/nested/SKILL.md': '[gone](../../../../GONE.md)',
      }),
    ).toStrictEqual(['.claude/skills/group/nested/SKILL.md: GONE.md が存在しない']);
  });

  it('壊れた package.json があっても例外にしない', () => {
    expect(() =>
      detailsOf({
        'package.json': PACKAGE_JSON,
        'packages/broken/package.json': '{ 壊れている',
        'CLAUDE.md': '`bun run --filter @seri/db db:generate` を実行する。',
      }),
    ).not.toThrow();
  });

  it('文書が 1 つも無ければ FAIL（消せば緑になる、を防ぐ）', () => {
    const result = checkContextDrift(contextOf(makeTempRepo({ 'package.json': PACKAGE_JSON })));

    expect(result.ok).toBe(false);
    expect(result.actual).toBe('文書なし（計測不能）');
    expect(result.details?.[0]).toContain('CLAUDE.md');
  });
});
