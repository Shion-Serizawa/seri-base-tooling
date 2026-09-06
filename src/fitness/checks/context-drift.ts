import type { Dirent } from 'node:fs';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

import type { FitnessContext } from '../lib/context.ts';
import { defaultContext } from '../lib/context.ts';
import type { CheckResult } from '../lib/report.ts';

/** AI に読ませる文書。ここが古くなると、AI は存在しない手順を実行しようとする。 */
const ROOT_DOCUMENT = 'CLAUDE.md';
const SKILLS_DIRECTORY = join('.claude', 'skills');

/** markdown リンク `](path)`。タイトル付き `](path "title")` と山括弧囲みも拾う。 */
const MARKDOWN_LINK = /\]\(\s*<?([^\s)>]+)>?(?:\s+"[^"]*")?\s*\)/gu;

/**
 * バッククォートで囲まれた、リポジトリルート起点に見えるパス。
 * 先頭をワークスペースのディレクトリ名に限っているのは、`/api/rpc` のような
 * URL や `<resource>.ts` のようなプレースホルダを拾わないため。
 */
const BACKTICK_PATH = /`((?:\.claude|apps|packages|tooling|scripts|docs)\/[A-Za-z0-9._/-]+)`/gu;

/**
 * バッククォートで囲まれた、リポジトリルート直下の設定ファイル。
 * ディレクトリ前置きが無いので `BACKTICK_PATH` では拾えないが、
 * CLAUDE.md がしきい値の二重管理先として名指ししている以上、実在を検査する。
 */
const BACKTICK_ROOT_FILE =
  /`((?:\.oxlintrc|\.oxfmtrc|\.jscpd|knip|turbo|stryker\.config|lefthook|package|tsconfig)\.(?:json|yml|yaml))`/gu;

/**
 * `bun run <script>` と `bun run --filter @<scope>/<pkg> <script>`。
 *
 * スクリプト名の直後に `/` や `.` が続く形（`bun run scripts/fitness/run.ts`）は
 * npm script ではなくファイル直指定なので、ここでは拾わない（`BUN_RUN_FILE` が見る）。
 * 後読みを付けないと先頭セグメントだけを切り出して「存在しない script」と誤判定する。
 */
const BUN_RUN = /bun run (?:--filter ((?:@[\w.-]+\/)?[\w.-]+) )?([a-z][\w:-]*)(?![\w:/.-])/gu;

/** `bun run <path>.ts` のようなファイル直指定。実在するファイルかを見る。 */
const BUN_RUN_FILE = /bun run ((?:[\w.-]+\/)+[\w.-]+\.[cm]?tsx?)/gu;

/** 参照ではないリンク（外部 URL、ページ内アンカー）。 */
function isExternal(target: string): boolean {
  return /^(?:https?:|mailto:|#)/u.test(target);
}

/**
 * `.claude/skills` 配下の `SKILL.md` を再帰的に集める。
 *
 * 1 階層しか見ないと、スキルをグループ分けした瞬間に対象 0 件になり、
 * 参照切れが黙って検出されなくなる（⑬ 自身の false green）。
 */
function collectSkillFiles(directory: string, found: string[]): void {
  let entries: Dirent[];
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    // 権限エラーや壊れたエントリで fitness 全体を落とさない
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      collectSkillFiles(join(directory, entry.name), found);
    } else if (entry.name === 'SKILL.md') {
      found.push(join(directory, entry.name));
    }
  }
}

/** `CLAUDE.md` と `.claude/skills/**\/SKILL.md` を集める。 */
function listContextDocuments(root: string): string[] {
  const found: string[] = [];
  const rootDocument = join(root, ROOT_DOCUMENT);
  if (existsSync(rootDocument)) {
    found.push(rootDocument);
  }

  collectSkillFiles(join(root, SKILLS_DIRECTORY), found);
  return found;
}

/** 正規表現の 1 つ目のキャプチャをすべて取り出す。 */
function captures(text: string, pattern: RegExp): string[] {
  return [...text.matchAll(pattern)].map((match) => match[1] ?? '');
}

/** 文書が参照しているファイルパスのうち、実在しないものを返す。 */
function missingPaths(root: string, document: string): string[] {
  const text = readFileSync(document, 'utf8');
  const links = captures(text, MARKDOWN_LINK)
    .filter((target) => !isExternal(target))
    .map((target) => resolve(dirname(document), target.split('#')[0] ?? ''));
  const backticked = [...captures(text, BACKTICK_PATH), ...captures(text, BACKTICK_ROOT_FILE)].map(
    (target) => resolve(root, target),
  );

  return [...new Set([...links, ...backticked])]
    .filter((target) => !existsSync(target))
    .map((target) => relative(root, target).replaceAll('\\', '/'));
}

/**
 * `package.json` を読む。存在しない・読めない・壊れている・オブジェクトでないなら空。
 *
 * 編集途中の壊れた `package.json` が 1 つあるだけで `bun run fitness` 全体が
 * 未捕捉の例外で死に、他のゲートの結果ごと失われるのを避ける。
 */
function readPackageJson(packageJsonPath: string): Record<string, unknown> {
  if (!existsSync(packageJsonPath)) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    if (typeof parsed !== 'object' || parsed === null) {
      return {};
    }
    return Object.fromEntries(Object.entries(parsed));
  } catch {
    return {};
  }
}

/** `package.json` の `scripts` のキー。 */
function scriptNames(packageJson: Record<string, unknown>): Set<string> {
  const scripts = packageJson['scripts'];
  if (typeof scripts !== 'object' || scripts === null) {
    return new Set();
  }
  return new Set(Object.keys(scripts));
}

/**
 * ワークスペース名からその `package.json` の scripts を引く。
 *
 * `name` と厳密に突き合わせる。ファイル内の文字列一致で探すと、その
 * ワークスペースに依存しているだけの package.json（`"@seri/db": "workspace:*"`）を
 * 先に拾ってしまい、無関係な scripts を「存在する」と誤答する。
 */
function workspaceScripts(
  root: string,
  workspace: string,
  sourceRoots: readonly string[],
): Set<string> {
  for (const group of sourceRoots) {
    if (!existsSync(join(root, group))) {
      continue;
    }
    for (const entry of readdirSync(join(root, group))) {
      const packageJson = readPackageJson(join(root, group, entry, 'package.json'));
      if (packageJson['name'] === workspace) {
        return scriptNames(packageJson);
      }
    }
  }
  return new Set();
}

/** 文書が案内している `bun run` のうち、存在しないスクリプトを返す。 */
function missingScripts(root: string, document: string, sourceRoots: readonly string[]): string[] {
  const text = readFileSync(document, 'utf8');
  const missing: string[] = [];

  for (const match of text.matchAll(BUN_RUN)) {
    const workspace = match[1];
    const script = match[2] ?? '';
    const available =
      workspace === undefined
        ? scriptNames(readPackageJson(join(root, 'package.json')))
        : workspaceScripts(root, workspace, sourceRoots);
    if (!available.has(script)) {
      missing.push(
        workspace === undefined ? `bun run ${script}` : `bun run --filter ${workspace} ${script}`,
      );
    }
  }

  for (const match of text.matchAll(BUN_RUN_FILE)) {
    const file = match[1] ?? '';
    if (!existsSync(join(root, file))) {
      missing.push(`bun run ${file}`);
    }
  }
  return [...new Set(missing)];
}

/**
 * 適応度関数 ⑬ Context の陳腐化。
 *
 * `CLAUDE.md` とスキルが参照しているファイルとコマンドが実在することを検査する。
 * ここが古くなる壊れ方は誰にも見えない。AI は存在しないパスを読もうとして黙って諦め、
 * 存在しないコマンドを打って別の理由で失敗するので、原因が Context の陳腐化だと
 * 気づけない。lint も型検査もテストも markdown を見ないため、明示的に検査する。
 */
export function checkContextDrift(context: FitnessContext = defaultContext()): CheckResult {
  const documents = listContextDocuments(context.root);
  const name = 'context drift';
  const expected = '参照先がすべて実在する';

  if (documents.length === 0) {
    // 「文書が無いので違反も無い」を PASS にすると、CLAUDE.md を消した瞬間に
    // このゲートが常に緑になる（false green）。
    return {
      name,
      ok: false,
      actual: '文書なし（計測不能）',
      expected,
      details: [`${ROOT_DOCUMENT} も ${SKILLS_DIRECTORY} も見つからない`],
    };
  }

  const details = documents.flatMap((document) => {
    const label = relative(context.root, document).replaceAll('\\', '/');
    const broken = [
      ...missingPaths(context.root, document),
      ...missingScripts(context.root, document, context.sourceRoots),
    ];
    return broken.map((item) => `${label}: ${item} が存在しない`);
  });

  return {
    name,
    ok: details.length === 0,
    actual:
      details.length === 0
        ? `${documents.length} 文書 / 参照切れなし`
        : `参照切れ ${details.length} 件`,
    expected,
    ...(details.length > 0 ? { details } : {}),
  };
}
