/**
 * 適応度関数（fitness function）のしきい値をここに集約する。
 *
 * 単一情報源にできない例外がある: oxlint / Stryker / jscpd は自分の設定ファイルに
 * しか数値を書けないため、`src/oxlint/base.json` `stryker.config.json` `.jscpd.json`
 * とは二重管理になる。乖離を防ぐために `fitness/checks/lint-policy.ts` の
 * `checkThresholdDrift`（⑪′）が両者の一致を検証している。
 *
 * 各指標は「単独でハックすると別の指標が悪化する」ように選んでいる。
 * 詳細は基盤リポジトリの ADR 0002 を参照。
 * https://github.com/Shion-Serizawa/seri-base-ts-project/tree/main/docs/adr
 *
 * 数値そのものは `quality-gates.json` に置く。Node は node_modules 配下の .ts を
 * 型除去できない（ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING）ため、
 * Node が直接読む境界（使う側の `vitest.config.ts` など）は JSON を引く。
 * **意図（なぜその値なのか）はこのファイルが持つ。JSON には数値だけ。**
 */
import gates from './quality-gates.json' with { type: 'json' };

export const QUALITY_GATES = {
  /**
   * ① テストカバレッジ: 水増しは ④ ミューテーションスコアで牽制する。
   *
   * `perFile` を有効にしてファイル単位で要求する。パッケージ全体の集計だと、
   * 十分テストされた他のコードに紛れて「テストが 1 件も無いファイル」が隠れてしまう。
   */
  coverage: gates.coverage,

  /**
   * ② test ratio: テストコード行数 / 実装コード行数。
   *
   * **上限のみをゲートにする。** 下限を置くと `it.each` のようなテーブル駆動化
   * （テスト行数が減ってカバレッジとミューテーションスコアは上がる書き方）を罰してしまい、
   * 「量を足す」方向の圧力になる。テストが足りない側は ① の per-file カバレッジと
   * ④ ミューテーションスコアの方が正確に検出できる。
   *
   * 上限だけは他のどの指標も測っていない。20 行の実装に 500 行のテストを書く方向
   * （特に AI に「テストを増やせ」と指示したとき）への唯一の牽制として残す。
   */
  testRatio: gates.testRatio,

  /** ③ 重複率（jscpd）: 過度な共通化に走らせないため上限のみ */
  duplication: gates.duplication,

  /**
   * ④ ミューテーションスコア: 変更ファイルのみ CI で実行する。
   * `break` を下回ると失敗し、`high` を下回ると警告する。
   */
  mutation: gates.mutation,

  /** ⑤ 複雑度: .oxlintrc.json と一致していることをテストで検証する */
  complexity: gates.complexity,

  /**
   * サプライチェーン対策の必須条件。
   * `minimumReleaseAgeSeconds` は公開直後のパッケージを拒否する待機時間（秒）。7 日。
   * fitness/checks/supply-chain.ts が bunfig.toml / mise.lock /
   * GitHub Actions のピン留めを実測して検証する。
   */
  supplyChain: gates.supplyChain,

  /**
   * ⑧ バンドルサイズ予算（gzip 後のバイト数）。
   * `apiGzipBytes` は Worker 1 本あたり、`webGzipBytes` は SPA の JS 合計。
   *
   * Cloudflare Workers の圧縮後上限は 3 MiB なので、この値はプラットフォーム上限ではなく
   * 「依存を足して楽をする」方向への牽制（bloat tripwire）。
   * 複雑度やカバレッジを楽に満たすために巨大なライブラリを持ち込むとここで落ちる。
   */
  sizeBudget: gates.sizeBudget,
};

export type QualityGates = typeof QUALITY_GATES;

export {
  ALLOWED_OFF_RULES,
  ALLOWED_OVERRIDE_OFF_RULES,
  LINT_CATEGORIES,
  LINT_IGNORE_PATTERNS,
  LINT_PLUGINS,
  REPOSITORY_WIDE_FILE_PATTERNS,
  REQUIRED_ERROR_RULES,
} from './lint-policy.ts';
