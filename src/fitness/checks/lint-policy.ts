import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  ALLOWED_OFF_RULES,
  ALLOWED_OVERRIDE_OFF_RULES,
  LINT_CATEGORIES,
  LINT_IGNORE_PATTERNS,
  LINT_PLUGINS,
  QUALITY_GATES,
  REPOSITORY_WIDE_FILE_PATTERNS,
  REQUIRED_ERROR_RULES,
} from '../../index.ts';
import type { Comparison } from '../lib/compare.ts';
import { differences } from '../lib/compare.ts';
import type { FitnessContext } from '../lib/context.ts';
import { defaultContext } from '../lib/context.ts';
import type { JsonObject, OxlintOverride } from '../lib/oxlint-config.ts';
import {
  extendsTargets,
  isRecord,
  loadEffectiveOxlintConfig,
  objectAt,
  overridesOf,
  ownIgnorePatterns,
  stringsAt,
} from '../lib/oxlint-config.ts';
import type { CheckResult } from '../lib/report.ts';

const ROOT_CONFIG = '.oxlintrc.json';
/** `ignorePatterns` がソースを覆っていないか見るためのディレクトリ。 */
const SOURCE_DIRECTORIES = /(?:^|\/)(?:apps|packages|tooling|scripts)(?:\/|$)/u;

function severityOf(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  return Array.isArray(value) && typeof value[0] === 'string' ? value[0] : 'unknown';
}

function ruleNamesWithSeverity(rules: JsonObject, severity: string): string[] {
  return Object.entries(rules)
    .filter(([, value]) => severityOf(value) === severity)
    .map(([name]) => name)
    .toSorted();
}

/** `override` で `off` にしているルール名。 */
function offRulesIn(overrides: readonly OxlintOverride[]): string[] {
  return [...new Set(overrides.flatMap((entry) => ruleNamesWithSeverity(entry.rules, 'off')))];
}

/** ワークスペース直下でソースを置くディレクトリ名（`apps/api/src` の `src`）。 */
const WORKSPACE_SOURCE_DIRECTORY = 'src';

/**
 * 境界の直下に置いたとき、その境界の全域を覆う接尾辞。
 *
 * 宣言済みの `REPOSITORY_WIDE_FILE_PATTERNS`（ルート直下に書いた場合の形）を
 * そのまま接尾辞の語彙として使い、`**` だけを足す。ポリシー面を増やさない。
 */
const WIDE_SUFFIXES = ['**', ...REPOSITORY_WIDE_FILE_PATTERNS];

/**
 * ワークスペースの位置に来てよいセグメント。
 *
 * 実名（`api`）か、任意の 1 ワークスペースを表す `*` だけを許す。`**` を許すと
 * `**\/src/**` のような「境界とは無関係にたまたま src を含むパス」まで
 * 全域と誤判定する。
 */
function isWorkspaceSegment(segment: string): boolean {
  return segment === '*' || !segment.includes('*');
}

/**
 * セグメント列が「境界」の形をしているか。
 *
 * 境界はリポジトリルート / ソースルート / ソースルート直下のワークスペース /
 * そのワークスペースの `src`。ソースルートの位置にはワイルドカードを許さない
 * （`sourceRoots` の実名と一致することを要求する）。
 */
function isBoundary(segments: readonly string[], sourceRoots: readonly string[]): boolean {
  const [root, workspace, source] = segments;
  if (root === undefined) {
    return true;
  }
  if (!sourceRoots.includes(root)) {
    return false;
  }
  if (workspace === undefined) {
    return true;
  }
  if (!isWorkspaceSegment(workspace)) {
    return false;
  }
  return source === undefined || (source === WORKSPACE_SOURCE_DIRECTORY && segments.length === 3);
}

/**
 * その `files` パターンが、ある境界の全域を覆っているか。
 *
 * 文字列の完全一致で見ていたときは、**書き手が正直にワイルドカードを書いた場合しか
 * 捕まえられなかった**。`src/**\/*.ts` や `apps/web/src/**` は、文字列としては
 * 「具体的なパスが付いたパターン」に見えるのに実質は全域なので、
 * 「ゲートに詰まったら設定を緩める」を塞ぐという ⑪ の役割を果たせていなかった。
 *
 * 実ファイルへの展開はしない。展開すると判定が作業ツリーの中身に依存し、
 * **ファイルが 1 つ増えただけで警戒が黙って外れる**（緩む方向に動く）。
 * oxlint の glob 意味論を推測で再実装することにもなる。
 * 宣言だけで決まる形――接頭辞が境界で止まり、残りがワイルドカードのみ――で見る。
 */
function coversBoundary(pattern: string, sourceRoots: readonly string[]): boolean {
  const segments = pattern.split('/');
  return segments.some(
    (_segment, index) =>
      WIDE_SUFFIXES.some((suffix) => suffix === segments.slice(index).join('/')) &&
      isBoundary(segments.slice(0, index), sourceRoots),
  );
}

/** カテゴリ・プラグイン・ルールの強度が宣言したポリシーと一致しているか。 */
function shapeComparisons(config: JsonObject): Comparison[] {
  const rules = objectAt(config, 'rules');
  return [
    {
      label: 'options',
      actual: objectAt(config, 'options'),
      expected: { denyWarnings: true, reportUnusedDisableDirectives: 'error' },
    },
    { label: 'categories', actual: objectAt(config, 'categories'), expected: LINT_CATEGORIES },
    {
      label: 'plugins',
      actual: stringsAt(config, 'plugins').toSorted(),
      expected: [...LINT_PLUGINS].toSorted(),
    },
    {
      label: 'error のルール',
      actual: ruleNamesWithSeverity(rules, 'error'),
      expected: [...REQUIRED_ERROR_RULES].toSorted(),
    },
    {
      label: 'off のルール',
      actual: ruleNamesWithSeverity(rules, 'off'),
      expected: [...ALLOWED_OFF_RULES].toSorted(),
    },
    {
      // AI は warn を無視して進む。error か off の二値しか置かない
      label: 'error でも off でもないルール',
      actual: Object.keys(rules).filter(
        (name) => !['error', 'off'].includes(severityOf(rules[name])),
      ),
      expected: [],
    },
  ];
}

/** 適用範囲と override の抜け道を塞げているか。 */
function scopeComparisons(
  config: JsonObject,
  rootConfigPath: string,
  sourceRoots: readonly string[],
): Comparison[] {
  const overrides = overridesOf(config);
  const ignorePatterns = stringsAt(config, 'ignorePatterns');
  return [
    { label: 'ignorePatterns', actual: ignorePatterns, expected: [...LINT_IGNORE_PATTERNS] },
    {
      label: 'ソースを覆う ignorePatterns',
      actual: ignorePatterns.filter((pattern) => SOURCE_DIRECTORIES.test(pattern)),
      expected: [],
    },
    {
      label: '許可していない override の off',
      actual: offRulesIn(overrides).filter(
        (name) => !ALLOWED_OVERRIDE_OFF_RULES.some((allowed) => allowed === name),
      ),
      expected: [],
    },
    {
      // ディレクトリ単位の例外という建前が成立しなくなる。
      // 判定は off にしている override にだけ効かせる。層の依存方向のように
      // 「ワークスペースのソース全域に対して宣言するのが正しい」ルールもあり、
      // それらは足す側なので狭められない（狭めると境界に穴が空く）。
      label: '境界の全域を覆う override の off',
      actual: offRulesIn(
        overrides.filter((entry) =>
          entry.files.some((pattern) => coversBoundary(pattern, sourceRoots)),
        ),
      ),
      expected: [],
    },
    {
      // 実測: extends 先の ignorePatterns は継承されない。書いても効かない
      label: 'extends 先の ignorePatterns（効かない）',
      actual: extendsTargets(rootConfigPath).flatMap((target) => ownIgnorePatterns(target)),
      expected: [],
    },
  ];
}

function missingConfig(name: string, expected: string): CheckResult {
  // 「設定が無いので違反も無い」を PASS にすると、消した瞬間に常に緑になる
  return {
    name,
    ok: false,
    actual: '設定なし（計測不能）',
    expected,
    details: [`${ROOT_CONFIG} が存在しない`],
  };
}

/**
 * 適応度関数 ⑪ Lint 設定の改ざん。
 *
 * しきい値の数値だけを見ていた時期は、カテゴリを off にする・重要ルールを off にする・
 * override でディレクトリ単位に黙らせる、といった「ゲートに詰まったときの最短の修復手段」を
 * 一切検出できなかった。設定の形ごと固定する。
 *
 * `extends` を解決した**実効設定**に対して見る。ルートの `.oxlintrc.json` は
 * 薄いラッパなので、ファイルをそのまま読むとポリシーの大半が検査対象から外れる。
 */
function checkConfigShape(root: string, sourceRoots: readonly string[]): CheckResult {
  const rootConfigPath = join(root, ROOT_CONFIG);
  const name = 'lint policy';
  const expected = '宣言したポリシーと完全に一致';

  if (!existsSync(rootConfigPath)) {
    return missingConfig(name, expected);
  }

  const config = loadEffectiveOxlintConfig(rootConfigPath);
  const details = differences([
    ...shapeComparisons(config),
    ...scopeComparisons(config, rootConfigPath, sourceRoots),
  ]);

  return {
    name,
    ok: details.length === 0,
    actual: details.length === 0 ? '一致' : `${details.length} 件の不一致`,
    expected,
    ...(details.length > 0 ? { details } : {}),
  };
}

function readJsonFile(path: string): JsonObject {
  if (!existsSync(path)) {
    return {};
  }
  const raw = readFileSync(path, 'utf8').replaceAll(/^\s*\/\/.*$/gmu, '');
  const parsed: unknown = JSON.parse(raw);
  return isRecord(parsed) ? parsed : {};
}

/** 外部ツールの設定にも書く数値が QUALITY_GATES と一致しているか。 */
function thresholdComparisons(root: string, config: JsonObject): Comparison[] {
  const { complexity, mutation, duplication } = QUALITY_GATES;
  const rules = objectAt(config, 'rules');
  const stryker = readJsonFile(join(root, 'stryker.config.json'));
  const jscpd = readJsonFile(join(root, '.jscpd.json'));
  return [
    {
      label: 'complexity',
      actual: rules['complexity'],
      expected: ['error', { max: complexity.max }],
    },
    { label: 'max-depth', actual: rules['max-depth'], expected: ['error', complexity.maxDepth] },
    { label: 'max-params', actual: rules['max-params'], expected: ['error', complexity.maxParams] },
    {
      label: 'max-statements',
      actual: rules['max-statements'],
      expected: ['error', complexity.maxStatements],
    },
    {
      label: 'max-nested-callbacks',
      actual: rules['max-nested-callbacks'],
      expected: ['error', complexity.maxNestedCallbacks],
    },
    {
      label: 'max-lines-per-function',
      actual: rules['max-lines-per-function'],
      expected: [
        'error',
        { max: complexity.maxLinesPerFunction, skipBlankLines: true, skipComments: true },
      ],
    },
    {
      label: 'max-lines',
      actual: rules['max-lines'],
      expected: ['error', { max: complexity.maxLines, skipBlankLines: true, skipComments: true }],
    },
    {
      label: 'stryker.thresholds',
      actual: objectAt(stryker, 'thresholds'),
      expected: { high: mutation.high, low: mutation.low, break: mutation.break },
    },
    {
      label: 'jscpd.threshold',
      actual: jscpd['threshold'],
      expected: duplication.maxPercentTokens,
    },
    { label: 'jscpd.minTokens', actual: jscpd['minTokens'], expected: duplication.minTokens },
  ];
}

/**
 * しきい値の二重管理を検出する。
 *
 * `QUALITY_GATES` を単一情報源にしているが、oxlint / stryker / jscpd は
 * 自分の設定ファイルにしか数値を書けない。設定ファイル側だけを緩めて
 * 適応度関数を骨抜きにする、という抜け道を塞ぐ。
 */
function checkThresholdDrift(root: string): CheckResult {
  const rootConfigPath = join(root, ROOT_CONFIG);
  const name = 'threshold drift';
  const expected = 'QUALITY_GATES と外部設定が一致';

  if (!existsSync(rootConfigPath)) {
    return missingConfig(name, expected);
  }

  const details = differences(
    thresholdComparisons(root, loadEffectiveOxlintConfig(rootConfigPath)),
  );
  return {
    name,
    ok: details.length === 0,
    actual: details.length === 0 ? '一致' : `${details.length} 件の乖離`,
    expected,
    ...(details.length > 0 ? { details } : {}),
  };
}

export function checkLintPolicy(context: FitnessContext = defaultContext()): CheckResult[] {
  return [checkConfigShape(context.root, context.sourceRoots), checkThresholdDrift(context.root)];
}
