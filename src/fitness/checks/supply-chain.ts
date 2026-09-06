import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { QUALITY_GATES } from '../../index.ts';
import type { FitnessContext } from '../lib/context.ts';
import { defaultContext } from '../lib/context.ts';
import type { CheckResult } from '../lib/report.ts';

const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
];
const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[\w.]+)?$/u;
const COMMIT_SHA = /^[\da-f]{40}$/u;
const MAX_DETAILS = 10;

function listManifests(root: string, sourceRoots: readonly string[]): string[] {
  const manifests = [join(root, 'package.json')];
  for (const directory of sourceRoots
    .map((path) => join(root, path))
    .filter((path) => existsSync(path))) {
    for (const entry of readdirSync(directory)) {
      const manifest = join(directory, entry, 'package.json');
      if (existsSync(manifest)) {
        manifests.push(manifest);
      }
    }
  }
  return manifests;
}

function readJson(path: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`${path} is not a JSON object`);
  }
  return Object.fromEntries(Object.entries(parsed));
}

function asStringRecord(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
}

function collectRangeViolations(manifest: string): string[] {
  const json = readJson(manifest);
  return DEPENDENCY_FIELDS.flatMap((field) =>
    Object.entries(asStringRecord(json[field]))
      .filter(([, version]) => !version.startsWith('workspace:') && !EXACT_VERSION.test(version))
      .map(([name, version]) => `${manifest}: ${name}@${version}`),
  );
}

/** 依存が完全固定（レンジ禁止）であることを検証する。 */
function checkExactVersions(root: string, sourceRoots: readonly string[]): CheckResult {
  const violations = listManifests(root, sourceRoots).flatMap((manifest) =>
    collectRangeViolations(manifest),
  );
  return {
    name: 'dependency pinning',
    ok: violations.length === 0,
    actual: violations.length === 0 ? 'すべて完全固定' : `${violations.length} 件のレンジ指定`,
    expected: 'x.y.z か workspace:* のみ',
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
  const problems = [
    ...checkBunfig(root),
    ...lockfiles
      .filter((entry) => !existsSync(join(root, entry.path)))
      .map((entry) => entry.message),
  ];
  const trusted = Object.keys(
    asStringRecord(readJson(join(root, 'package.json'))['trustedDependencies']),
  );

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
