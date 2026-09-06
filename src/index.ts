/**
 * 適応度関数（fitness function）のしきい値をここに集約する。
 *
 * 単一情報源にできない例外が 1 つある: oxlint のしきい値は `.oxlintrc.json` に
 * 書く必要があるため二重管理になる。乖離を防ぐために
 * `oxlint-thresholds.test.ts` が両者の一致を検証している。
 *
 * 各指標は「単独でハックすると別の指標が悪化する」ように選んでいる。
 * 詳細は docs/adr/0002-fitness-functions.md を参照。
 */
export const QUALITY_GATES = {
  /**
   * ① テストカバレッジ: 水増しは ④ ミューテーションスコアで牽制する。
   *
   * `perFile` を有効にしてファイル単位で要求する。パッケージ全体の集計だと、
   * 十分テストされた他のコードに紛れて「テストが 1 件も無いファイル」が隠れてしまう。
   */
  coverage: {
    lines: 80,
    functions: 80,
    branches: 80,
    statements: 80,
    perFile: true,
  },

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
  testRatio: {
    max: 2.5,
  },

  /** ③ 重複率（jscpd）: 過度な共通化に走らせないため上限のみ */
  duplication: {
    maxPercentTokens: 3,
    minTokens: 50,
  },

  /** ④ ミューテーションスコア: 変更ファイルのみ CI で実行する */
  mutation: {
    /** これを下回ると失敗 */
    break: 60,
    /** これを下回ると警告 */
    high: 80,
    low: 70,
  },

  /** ⑤ 複雑度: .oxlintrc.json と一致していることをテストで検証する */
  complexity: {
    max: 10,
    maxDepth: 3,
    maxLinesPerFunction: 50,
    maxLines: 300,
    maxParams: 4,
    maxStatements: 20,
    maxNestedCallbacks: 3,
  },

  /**
   * サプライチェーン対策の必須条件。
   * scripts/fitness/checks/supply-chain.ts が bunfig.toml / mise.lock /
   * GitHub Actions のピン留めを実測して検証する。
   */
  supplyChain: {
    /** 公開直後のパッケージを拒否する待機時間（秒）。7 日 */
    minimumReleaseAgeSeconds: 604_800,
  },

  /**
   * ⑧ バンドルサイズ予算（gzip 後のバイト数）。
   *
   * Cloudflare Workers の圧縮後上限は 3 MiB なので、この値はプラットフォーム上限ではなく
   * 「依存を足して楽をする」方向への牽制（bloat tripwire）。
   * 複雑度やカバレッジを楽に満たすために巨大なライブラリを持ち込むとここで落ちる。
   */
  sizeBudget: {
    /** Worker 1 本あたりの gzip サイズ */
    apiGzipBytes: 550_000,
    /** SPA の JS 合計の gzip サイズ */
    webGzipBytes: 160_000,
  },
} as const;

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
