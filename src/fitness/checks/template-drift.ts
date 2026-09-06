import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { FitnessContext } from '../lib/context.ts';
import { defaultContext } from '../lib/context.ts';
import { asStringRecord, DEPENDENCY_FIELDS, listManifests, readJson } from '../lib/manifest.ts';
import type { CheckResult } from '../lib/report.ts';

/** 派生が「どの世代の基盤から来たか」を自己申告するファイル（ADR 0010 の決定 2）。 */
const ORIGIN_FILE = '.seri-base.json';
/** このリポジトリ自身がテンプレート本体であることを表す ref。 */
const TEMPLATE_ITSELF = 'template';
const TOOLING_PACKAGE = '@seri/base-tooling';
const COMMIT_SHA = /^[\da-f]{40}$/u;
const MAX_DETAILS = 10;

const NAME = 'template drift';
const EXPECTED = 'ref が SHA 固定 + 全 manifest で同じ世代';
const FIX_REF = `テンプレートから作ったら ${ORIGIN_FILE} の ref をコピー元のコミット SHA に書き換える`;

type Origin = { readonly template: unknown; readonly ref: unknown };

function failure(actual: string, details: readonly string[]): CheckResult {
  return { name: NAME, ok: false, actual, expected: EXPECTED, details };
}

function readOrigin(path: string): Origin | null {
  try {
    const json = readJson(path);
    return { template: json['template'], ref: json['ref'] };
  } catch {
    return null;
  }
}

/** 申告そのものの不備。`template` が無い / `ref` が固定になっていない。 */
function originProblems(origin: Origin): string[] {
  const problems: string[] = [];
  if (typeof origin.template !== 'string' || origin.template.length === 0) {
    problems.push('template が空（コピー元のリポジトリを owner/repo で書く）');
  }
  const { ref } = origin;
  if (typeof ref !== 'string' || (ref !== TEMPLATE_ITSELF && !COMMIT_SHA.test(ref))) {
    problems.push(`ref が 40 桁のコミット SHA でも '${TEMPLATE_ITSELF}' でもない`, FIX_REF);
  }
  return problems;
}

/** 各 manifest が宣言している `@seri/base-tooling` の指定子。 */
function toolingSpecs(context: FitnessContext): { manifest: string; spec: string }[] {
  return listManifests(context.root, context.sourceRoots).flatMap((manifest) => {
    const json = readJson(manifest);
    return DEPENDENCY_FIELDS.map((field) => asStringRecord(json[field])[TOOLING_PACKAGE])
      .filter((spec): spec is string => spec !== undefined)
      .map((spec) => ({ manifest, spec }));
  });
}

/**
 * 世代の混在。ワークスペースごとに別の SHA を引くと、同じリポジトリの中で
 * 違う世代のゲートが混ざり、どのルールが効いているのか分からなくなる。
 */
function mixedGenerationProblems(context: FitnessContext): string[] {
  const specs = toolingSpecs(context);
  const generations = new Set(specs.map(({ spec }) => spec.split('#')[1] ?? spec));
  if (generations.size <= 1) {
    return [];
  }
  return [
    `${TOOLING_PACKAGE} の世代が ${generations.size} 種類ある`,
    ...specs.map(({ manifest, spec }) => `${manifest}: ${spec}`),
  ];
}

function actualOf(origin: Origin, specCount: number): string {
  if (origin.ref === TEMPLATE_ITSELF) {
    return 'テンプレート本体';
  }
  const shortSha = typeof origin.ref === 'string' ? origin.ref.slice(0, 7) : '';
  return specCount === 0 ? shortSha : `${shortSha} / ${specCount} manifest が一致`;
}

/**
 * 出自の申告（`.seri-base.json`）が壊れていないことを検証する（ADR 0010 の決定 7）。
 *
 * ref が古いかどうかは見ない。ネットワークに出ないと判定できないうえ、
 * いつ追従するかは派生の事情であって基盤が決めることではない。
 */
export function checkTemplateDrift(context: FitnessContext = defaultContext()): CheckResult[] {
  const path = join(context.root, ORIGIN_FILE);
  if (!existsSync(path)) {
    // 「ファイルが無いので違反も無い」を PASS にすると、消した瞬間に常に緑になる。
    return [failure('出自なし（計測不能）', [`${ORIGIN_FILE} が無い`, FIX_REF])];
  }
  const origin = readOrigin(path);
  if (origin === null) {
    return [failure('出自を読めない', [`${ORIGIN_FILE} が JSON オブジェクトとして読めない`])];
  }
  const problems = [...originProblems(origin), ...mixedGenerationProblems(context)];
  if (problems.length > 0) {
    return [failure(`${problems.length} 件の不備`, problems.slice(0, MAX_DETAILS))];
  }
  return [
    {
      name: NAME,
      ok: true,
      actual: actualOf(origin, toolingSpecs(context).length),
      expected: EXPECTED,
    },
  ];
}
