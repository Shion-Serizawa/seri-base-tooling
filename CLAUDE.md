# CLAUDE.md

`seri-base-ts-project` とその派生が共有する品質ゲート（ADR 0010 の **A 層**）。
このリポジトリは**配られる側**なので、ここのバグは派生すべてに伝播する。

**詳細を再掲しないこと。** 設計の理由は基盤リポジトリの
[docs/adr/](https://github.com/Shion-Serizawa/seri-base-ts-project/tree/main/docs/adr) が持つ。
ここには「このリポジトリでしか成り立たない前提」だけを書く。

## 前提

- ドキュメント・コメント・コミットメッセージはすべて**日本語**で書く
- Bun。ワークスペースではなく**単一パッケージ**（git 依存はサブディレクトリを
  指定できず、依存側の `workspaces` も展開されないため。ADR 0010 の決定 3）
- 派生は `github:Shion-Serizawa/seri-base-tooling#<40 桁 SHA>` で引く

## ここに置いてよいもの

**リポジトリの形を知らないコードだけ。** 「apps/api」「packages/contract」のような
テンプレート固有のパスやワークスペース名が出てきたら、それは A 層ではない。

- 形を知る必要がある値（`sourceRoots` / `bundles`）は `FitnessContext` で受け取る。
  既定はテンプレートの形だが、**決め打ちにしない**
- 形に依存する検査は基盤リポジトリ側（scripts/fitness/project/）に置き、
  `runFitness({ projectChecks })` で差し込ませる

## 守る境界

- **`any` 系は error。** `no-explicit-any` / `no-unsafe-*` / `no-unsafe-type-assertion` /
  `ban-ts-comment`
- **しきい値は `src/index.ts` が単一情報源。** 外部設定（`src/oxlint/base.json` /
  `stryker.config.json` / `.jscpd.json`）にも書く数値は両方直す（片方だけだと ⑪′ が落ちる）
- **lint のルール本体は `src/oxlint/base.json`。** ルートの `.oxlintrc.json` はそれを
  `extends` する薄いラッパ。`ignorePatterns` は extends で継承されない（実測）ので
  ルートに書く
- **ゲートに詰まったら設定を緩めるのではなく実装を直す。** ⑪ が lint 設定の改ざんを検出する

## 変更したら走らせるもの

| 変えたもの  | 走らせるもの                                             |
| ----------- | -------------------------------------------------------- |
| 何か        | `bun run test`                                           |
| push する前 | `bun run fitness` / `bun run lint` / `bun run typecheck` |

## 検証（Maker–Checker）

実装した本人が合否を決めない。**決定論的ゲートの結果だけを「通った」の根拠にする。**
実際の終了コードと出力を見ずに「テストは通りました」と書かない。

適応度関数の実装のバグは「常に PASS」という形で現れ、型検査でも他のテストでも
捕まらない。検査を足すときは **PASS するケースだけでなく必ず FAIL するケースも書く**。
ここを書き忘れても誰も検出できない。

**同じ失敗を 3 回繰り返したら止めて相談する。** ゲートを緩める・テストを消す・
`// @ts-expect-error` を足すで通そうとしない。
