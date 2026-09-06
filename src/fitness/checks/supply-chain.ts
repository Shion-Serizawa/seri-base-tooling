import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { QUALITY_GATES } from '../../index.ts';
import type { FitnessContext } from '../lib/context.ts';
import { defaultContext } from '../lib/context.ts';
import { asStringRecord, DEPENDENCY_FIELDS, listManifests, readJson } from '../lib/manifest.ts';
import type { CheckResult } from '../lib/report.ts';

const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[\w.]+)?$/u;
const COMMIT_SHA = /^[\da-f]{40}$/u;
/** git 依存を表す指定子の頭。`github:owner/repo` のような短縮形も含む。 */
const GIT_DEPENDENCY = /^(?:git\+(?:https?|ssh):\/\/|git:\/\/|github:|gitlab:|bitbucket:)/u;
const MAX_DETAILS = 10;

/**
 * git 依存が 40 桁のコミット SHA で固定されているか。
 *
 * git 依存を無条件に通すと固定の意味が消える。ブランチ・タグ・短縮 SHA・semver レンジは
 * いずれも「後から中身が変わる（あるいは曖昧）」ので通さない。
 */
function isPinnedGitDependency(version: string): boolean {
  if (!GIT_DEPENDENCY.test(version)) {
    return false;
  }
  const reference = version.split('#')[1];
  return reference !== undefined && COMMIT_SHA.test(reference);
}

/** 依存の指定が「後から中身が変わらない」形になっているか。 */
function isPinnedVersion(version: string): boolean {
  return (
    version.startsWith('workspace:') ||
    EXACT_VERSION.test(version) ||
    isPinnedGitDependency(version)
  );
}

function collectUnpinnedDependencies(manifest: string): string[] {
  const json = readJson(manifest);
  // 読めない manifest を黙って飛ばすと、宣言された依存が 0 件になり
  //「すべて完全固定」で緑になる。読めないこと自体を違反として立てる。
  if (json === null) {
    return [`${manifest}: JSON オブジェクトとして読めない（固定を確認できない）`];
  }
  return DEPENDENCY_FIELDS.flatMap((field) =>
    Object.entries(asStringRecord(json[field]))
      .filter(([, version]) => !isPinnedVersion(version))
      .map(([name, version]) => `${manifest}: ${name}@${version}`),
  );
}

/** 依存が完全固定（レンジ・ブランチ・タグ禁止）であることを検証する。 */
function checkExactVersions(root: string, sourceRoots: readonly string[]): CheckResult {
  const violations = listManifests(root, sourceRoots).flatMap((manifest) =>
    collectUnpinnedDependencies(manifest),
  );
  return {
    name: 'dependency pinning',
    ok: violations.length === 0,
    actual: violations.length === 0 ? 'すべて完全固定' : `${violations.length} 件が未固定`,
    expected: 'x.y.z / workspace:* / git+40 桁 SHA',
    details: violations.slice(0, MAX_DETAILS),
  };
}

function checkBunfig(root: string): string[] {
  const path = join(root, 'bunfig.toml');
  if (!existsSync(path)) {
    return ['bunfig.toml が無い'];
  }
  const problems: string[] = [];
  const bunfig = readFileSync(path, 'utf8');
  if (!/^\s*exact\s*=\s*true/mu.test(bunfig)) {
    problems.push('bunfig.toml に exact = true が無い');
  }
  const required = QUALITY_GATES.supplyChain.minimumReleaseAgeSeconds;
  const found = /^\s*minimumReleaseAge\s*=\s*(\d+)/mu.exec(bunfig)?.[1];
  if (found === undefined) {
    problems.push('bunfig.toml に minimumReleaseAge が無い');
  } else if (Number(found) < required) {
    problems.push(`minimumReleaseAge が ${found} 秒（必要: ${required} 秒以上）`);
  }
  return problems;
}

/** インストール方針（完全固定・公開遅延・ロックファイル）を検証する。 */
function checkInstallPolicy(root: string): CheckResult {
  const lockfiles = [
    { path: 'bun.lock', message: 'bun.lock が無い（integrity ハッシュが固定されない）' },
    {
      path: 'mise.lock',
      message: 'mise.lock が無い（ツールチェーンのチェックサムが固定されない）',
    },
  ];
  const manifest = readJson(join(root, 'package.json'));
  const problems = [
    ...checkBunfig(root),
    ...lockfiles
      .filter((entry) => !existsSync(join(root, entry.path)))
      .map((entry) => entry.message),
    ...(manifest === null ? ['package.json が JSON オブジェクトとして読めない'] : []),
  ];
  const trusted =
    manifest === null ? [] : Object.keys(asStringRecord(manifest['trustedDependencies']));

  return {
    name: 'install policy',
    ok: problems.length === 0,
    actual: problems.length === 0 ? '固定 + 遅延あり' : `${problems.length} 件の不備`,
    expected: 'exact / minimumReleaseAge / bun.lock / mise.lock',
    details: [
      ...problems,
      ...(trusted.length > 0
        ? [`trustedDependencies に ${trusted.length} 件（postinstall 実行を許可中）`]
        : []),
    ],
  };
}

function usedActions(path: string): string[] {
  return readFileSync(path, 'utf8')
    .split('\n')
    .map((line) => /^\s*-?\s*uses:\s*(\S+)/u.exec(line)?.[1])
    .filter((value): value is string => value !== undefined && !value.startsWith('./'));
}

function isPinned(action: string): boolean {
  const reference = action.split('@')[1];
  return reference !== undefined && COMMIT_SHA.test(reference);
}

/** GitHub Actions が可変タグではなくコミット SHA で固定されていることを検証する。 */
function checkActionPinning(root: string): CheckResult {
  const directory = join(root, '.github', 'workflows');
  if (!existsSync(directory)) {
    // 「検査対象が無いので違反も無い」を PASS にすると、ワークフローを消すか
    // リネームした瞬間にこのゲートが常に緑になる（false green）。CI はこの
    // リポジトリの前提なので、無いこと自体を失敗として扱う。
    return {
      name: 'actions pinning',
      ok: false,
      actual: 'ワークフロー無し（計測不能）',
      expected: 'uses: は 40 桁の SHA',
      details: [`${directory} が存在しない`],
    };
  }

  const actions = readdirSync(directory)
    .filter((entry) => entry.endsWith('.yml') || entry.endsWith('.yaml'))
    .flatMap((entry) => usedActions(join(directory, entry)).map((action) => ({ entry, action })));
  const violations = actions.filter(({ action }) => !isPinned(action));

  return {
    name: 'actions pinning',
    ok: violations.length === 0,
    actual:
      violations.length === 0
        ? `${actions.length} 件すべて SHA 固定`
        : `${violations.length} 件が未固定`,
    expected: 'uses: は 40 桁の SHA',
    details: violations.slice(0, MAX_DETAILS).map(({ entry, action }) => `${entry}: ${action}`),
  };
}

export function checkSupplyChain(context: FitnessContext = defaultContext()): CheckResult[] {
  return [
    checkExactVersions(context.root, context.sourceRoots),
    checkInstallPolicy(context.root),
    checkActionPinning(context.root),
  ];
}
