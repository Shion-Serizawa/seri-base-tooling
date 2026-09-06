import { QUALITY_GATES } from '../../index.ts';
import type { RunCommand } from './exec.ts';
import { runCommand } from './exec.ts';

/** バンドルサイズ予算の対象。ビルド成果物を持たないリポジトリでは空になる。 */
type BundleTarget = {
  readonly name: string;
  /** リポジトリルートからの相対パス */
  readonly dist: string;
  readonly maxGzipBytes: number;
};

/**
 * ワークスペースを置くディレクトリ。
 *
 * A 層の検査（テスト比率・依存の固定・文書の乖離）は「どこにコードがあるか」を
 * 知る必要があるが、それは派生ごとに違う。既定はこのテンプレートの形。
 */
const DEFAULT_SOURCE_ROOTS = ['apps', 'packages', 'tooling', 'scripts'] as const;

function defaultBundles(): BundleTarget[] {
  const { sizeBudget } = QUALITY_GATES;
  return [
    { name: 'bundle size (api)', dist: 'apps/api/dist', maxGzipBytes: sizeBudget.apiGzipBytes },
    { name: 'bundle size (web)', dist: 'apps/web/dist', maxGzipBytes: sizeBudget.webGzipBytes },
  ];
}

/**
 * 適応度関数の実行環境。
 *
 * `root`（リポジトリのルート）・`run`（外部コマンドの実行）・`ci`（CI 上かどうか）を
 * 引数として渡すことで、各検査が `process.cwd()` / プロセス起動 / 環境変数に
 * 直接依存しないようにしている。テストは一時ディレクトリと差し替えた `run` に対して
 * 検査を走らせられる。
 */
export type FitnessContext = {
  readonly root: string;
  readonly run: RunCommand;
  /** CI 上では「ツールが入っていない」を PASS に倒さない */
  readonly ci: boolean;
  /**
   * 差分を取る基準リビジョン（⑯ が使う）。
   *
   * 既定を `main` にしているのは、フィーチャブランチからの push で
   * 「そのブランチが加えた変更すべて」が対象になるため。リモートを設定していない
   * ローカルでも解決できるよう、`origin/main` ではなくローカルの `main` を見る。
   * CI では `FITNESS_BASE_REF` で PR のベースブランチ（push なら `HEAD~1`）に切り替える。
   * 基準が HEAD と同じコミットになる場合（main の上での作業）は ⑯ 側が
   * `HEAD~1` に落として、落としたことを結果に出す。
   */
  readonly baseRef: string;
  /** コードを探すディレクトリ。派生がレイアウトを変えたらここを変える */
  readonly sourceRoots: readonly string[];
  /** バンドルサイズ予算の対象。持たないリポジトリは空を宣言する */
  readonly bundles: readonly BundleTarget[];
};

export function defaultContext(): FitnessContext {
  return {
    root: process.cwd(),
    run: runCommand,
    ci: process.env['CI'] !== undefined,
    baseRef: process.env['FITNESS_BASE_REF'] ?? 'main',
    sourceRoots: [...DEFAULT_SOURCE_ROOTS],
    bundles: defaultBundles(),
  };
}
