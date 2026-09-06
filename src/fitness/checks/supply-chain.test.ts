import { describe, expect, it } from 'vitest';

import { contextOf, makeTempRepo } from '../../test/temp-repo.ts';
import type { CheckResult } from '../lib/report.ts';
import { checkSupplyChain } from './supply-chain.ts';

function detailsOf(root: string, name: string): readonly string[] {
  return resultsOf(root).get(name)?.details ?? [];
}

function installPolicyDetails(root: string): readonly string[] {
  return detailsOf(root, 'install policy');
}

/** uses: 1 行だけのワークフローを持つリポジトリ。 */
function repoUsing(action: string): string {
  return healthyRepo({
    '.github/workflows/ci.yml': `      - uses: ${action}
`,
  });
}

const SHA = 'a'.repeat(40);
const GOOD_BUNFIG = '[install]\nexact = true\nminimumReleaseAge = 604800\n';

function healthyRepo(overrides: Readonly<Record<string, string>> = {}): string {
  return makeTempRepo({
    'package.json': JSON.stringify({ name: 'root', devDependencies: { knip: '6.32.2' } }),
    'bunfig.toml': GOOD_BUNFIG,
    'bun.lock': '',
    'mise.lock': '',
    '.github/workflows/ci.yml': `      - uses: actions/checkout@${SHA} # v6\n`,
    ...overrides,
  });
}

function resultsOf(root: string): Map<string, CheckResult> {
  return new Map(checkSupplyChain(contextOf(root)).map((result) => [result.name, result]));
}

describe('checkSupplyChain', () => {
  it('健全なリポジトリでは 3 件すべて PASS', () => {
    const results = [...resultsOf(healthyRepo()).values()];

    expect(results.map((result) => result.name)).toStrictEqual([
      'dependency pinning',
      'install policy',
      'actions pinning',
    ]);
    expect(results.every((result) => result.ok)).toBe(true);
  });
});

describe('dependency pinning', () => {
  it('レンジ指定を検出する', () => {
    const root = healthyRepo({
      'package.json': JSON.stringify({ devDependencies: { knip: '^6.32.2' } }),
    });

    expect(resultsOf(root).get('dependency pinning')?.ok).toBe(false);
  });

  it('workspace:* は違反としない', () => {
    const root = healthyRepo({
      'package.json': JSON.stringify({ dependencies: { '@seri/db': 'workspace:*' } }),
    });

    expect(resultsOf(root).get('dependency pinning')?.ok).toBe(true);
  });

  it('プレリリース版の完全固定は許可する', () => {
    const root = healthyRepo({
      'package.json': JSON.stringify({ devDependencies: { oxlint: '1.79.0-beta.1' } }),
    });

    expect(resultsOf(root).get('dependency pinning')?.ok).toBe(true);
  });

  it('ルートだけでなく各ワークスペースの package.json も見る', () => {
    const root = healthyRepo({
      'packages/db/package.json': JSON.stringify({ dependencies: { 'drizzle-orm': '~0.45.2' } }),
    });
    const result = resultsOf(root).get('dependency pinning');

    expect(result?.ok).toBe(false);
    expect(result?.details?.[0]).toContain('drizzle-orm@~0.45.2');
  });

  /** 依存 1 件だけを持つリポジトリで dependency pinning の合否を返す。 */
  function pinningOk(version: string): boolean {
    const root = healthyRepo({
      'package.json': JSON.stringify({ dependencies: { '@seri/base-tooling': version } }),
    });

    return resultsOf(root).get('dependency pinning')?.ok === true;
  }

  it.each([
    ['github の短縮形', `github:owner/repo#${SHA}`],
    ['git+https', `git+https://github.com/owner/repo.git#${SHA}`],
    ['git+ssh', `git+ssh://git@github.com/owner/repo.git#${SHA}`],
  ])('40 桁のコミット SHA で固定した git 依存は許可する（%s）', (_label, version) => {
    expect(pinningOk(version)).toBe(true);
  });

  // git 依存を無条件に通すと「git 依存はぜんぶ素通り」という false green になる。
  // 下はいずれも後から中身が変わる（あるいは曖昧な）ので落ちなければならない。
  it.each([
    ['ref 無し（既定ブランチ）', 'github:owner/repo'],
    ['ブランチ', 'github:owner/repo#main'],
    ['タグ', 'github:owner/repo#v1.2.3'],
    ['短縮 SHA', 'github:owner/repo#1559aaa'],
    ['semver レンジ', 'github:owner/repo#semver:^1.0.0'],
    ['大文字混じりの SHA', `github:owner/repo#${SHA.toUpperCase()}`],
    ['git+https でブランチ', 'git+https://github.com/owner/repo.git#main'],
  ])('固定になっていない git 依存は違反にする（%s）', (_label, version) => {
    expect(pinningOk(version)).toBe(false);
  });

  it('devDependencies 以外のフィールドも見る', () => {
    const root = healthyRepo({
      'package.json': JSON.stringify({ peerDependencies: { react: '>=19' } }),
    });

    expect(resultsOf(root).get('dependency pinning')?.ok).toBe(false);
  });
});

describe('bunfig の検査', () => {
  it('健全な bunfig.toml なら install policy は PASS', () => {
    expect(resultsOf(healthyRepo()).get('install policy')?.ok).toBe(true);
  });

  it('bunfig.toml が無いことを検出する', () => {
    const root = makeTempRepo({ 'package.json': '{}', 'bun.lock': '', 'mise.lock': '' });

    expect(installPolicyDetails(root)).toContain('bunfig.toml が無い');
  });

  it('exact = true が無いことを検出する', () => {
    const root = healthyRepo({ 'bunfig.toml': '[install]\nminimumReleaseAge = 604800\n' });

    expect(installPolicyDetails(root)).toContain('bunfig.toml に exact = true が無い');
  });

  it('minimumReleaseAge が無いことを検出する', () => {
    const root = healthyRepo({ 'bunfig.toml': '[install]\nexact = true\n' });

    expect(installPolicyDetails(root)).toContain('bunfig.toml に minimumReleaseAge が無い');
  });

  it('公開遅延を短くする改ざんを検出する', () => {
    const root = healthyRepo({
      'bunfig.toml': '[install]\nexact = true\nminimumReleaseAge = 60\n',
    });

    expect(installPolicyDetails(root)[0]).toContain('minimumReleaseAge が 60 秒');
  });
});

describe('install policy', () => {
  it('lockfile の欠落を検出する', () => {
    const root = makeTempRepo({
      'package.json': '{}',
      'bunfig.toml': GOOD_BUNFIG,
      '.github/workflows/ci.yml': '',
    });
    const result = resultsOf(root).get('install policy');

    expect(result?.ok).toBe(false);
    expect(result?.details).toContain('bun.lock が無い（integrity ハッシュが固定されない）');
    expect(result?.details).toContain(
      'mise.lock が無い（ツールチェーンのチェックサムが固定されない）',
    );
  });

  it('trustedDependencies があれば警告として details に載せる', () => {
    const root = healthyRepo({
      'package.json': JSON.stringify({ trustedDependencies: { esbuild: '*' } }),
    });
    const result = resultsOf(root).get('install policy');

    expect(result?.details?.some((line) => line.includes('postinstall 実行を許可中'))).toBe(true);
  });
});

describe('actions pinning', () => {
  it.each([
    [`actions/checkout@${SHA}`, true],
    ['actions/checkout@v6', false],
    ['actions/checkout@main', false],
    ['actions/checkout@1234567890abcdef', false],
    ['actions/checkout', false],
  ])('%s → %s', (action, expected) => {
    expect(resultsOf(repoUsing(action)).get('actions pinning')?.ok).toBe(expected);
  });

  it('可変タグの action を検出する', () => {
    const root = healthyRepo({
      '.github/workflows/ci.yml': '      - uses: actions/checkout@v6\n',
    });
    const result = resultsOf(root).get('actions pinning');

    expect(result?.ok).toBe(false);
    expect(result?.details?.[0]).toContain('actions/checkout@v6');
  });

  it('ローカル action（./ で始まる）は対象外', () => {
    const root = healthyRepo({ '.github/workflows/ci.yml': '      - uses: ./.github/actions/x\n' });

    expect(resultsOf(root).get('actions pinning')?.ok).toBe(true);
  });

  it('ワークフローが無ければ FAIL にする（消せば緑になるのを防ぐ）', () => {
    const root = makeTempRepo({
      'package.json': '{}',
      'bunfig.toml': GOOD_BUNFIG,
      'bun.lock': '',
      'mise.lock': '',
    });
    const result = resultsOf(root).get('actions pinning');

    expect(result?.ok).toBe(false);
    expect(result?.actual).toBe('ワークフロー無し（計測不能）');
  });
});
