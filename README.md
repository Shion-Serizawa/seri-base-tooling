# seri-base-tooling

`seri-base-ts-project` とその派生が共有する品質ゲート。ADR 0010 の **A 層**。

## これは何か

基盤リポジトリから**配れる部分だけ**を切り出した単一パッケージ。
「リポジトリの形（`apps/api` や `packages/contract` といった構造）を知らない」検査と設定が入っている。

- 適応度関数の枠組み（`runFitness`）と、形を知らない検査 8 本（結果は 14 件）
- しきい値の単一情報源（`QUALITY_GATES`）と Lint ポリシーの宣言
- oxlint の base 設定 / tsconfig プリセット / Vitest 設定ファクトリ
- git フックの判定（Conventional Commits / 保護ブランチへの直 push 拒否）

形に依存する検査（OpenAPI の乖離、マイグレーション、層の依存方向）は入っていない。
それらは利用側が `runFitness({ projectChecks })` で差し込む。

## 使う側

レジストリには publish していない。git 依存 + コミット SHA で固定する。

```json
{
  "devDependencies": {
    "@seri/base-tooling": "github:Shion-Serizawa/seri-base-tooling#<40 桁 SHA>"
  }
}
```

適応度関数:

```ts
// scripts/fitness/run.ts
import { runFitness } from '@seri/base-tooling/fitness';

import { collectProjectChecks } from './project/checks.ts';

const passed = await runFitness({
  projectChecks: [collectProjectChecks],
  // 差し込み漏れを黙って通さないため、返るはずの件数を宣言する
  expectedProjectResults: 6,
});
process.exit(passed ? 0 : 1);
```

Lint:

```jsonc
// .oxlintrc.json
{
  "extends": ["./node_modules/@seri/base-tooling/src/oxlint/base.json"],
  "overrides": [/* 層の依存方向など、そのリポジトリ固有のもの */],
  // extends では継承されないのでルートに書く（実測）
  "ignorePatterns": ["**/dist/**", "**/coverage/**", "..."],
}
```

`tsconfig` は `@seri/base-tooling/tsconfig/library.json`、Vitest は
`@seri/base-tooling/vitest` の `createVitestConfig` を使う。

## レジストリを使わない理由

- publish 用の資格情報という攻撃面を作らずに済む
- コミット SHA で固定できる（npm パッケージはバージョン単位でしか固定できない）
- `minimumReleaseAge`（公開遅延 7 日）を回避できる。自分で直したものが 7 日待たずに届く

詳細は基盤リポジトリの ADR 0010 を参照。

## 開発

```bash
bun install
bun run test        # 検査自体のテスト
bun run fitness     # このリポジトリ自身に対して A 層の検査を走らせる
bun run lint        # 型情報つき
bun run typecheck
```

**このパッケージのバグは派生すべてに伝播する。** 検査を足すときは PASS するケースだけでなく
必ず FAIL するケースも書くこと。ゲートの実装のバグは「常に PASS」という形で現れ、
型検査でも他のテストでも捕まらない。
