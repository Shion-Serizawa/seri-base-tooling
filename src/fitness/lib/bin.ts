import { resolve } from 'node:path';

/**
 * node_modules/.bin のコマンドを絶対パスの形で、シェルに渡せるようクォートして返す。
 *
 * - PATH に node_modules/.bin が入っていない環境（Git フックのシェル等）でも動くようにする
 * - 相対パスにしないのは、`cwd` を変えて実行する検査（drizzle-kit 等）で解決に失敗するため
 * - `resolve` を使うのは、Windows の cmd.exe がスラッシュ区切りの相対パスを
 *   コマンド名として解釈できないため
 * - クォートするのは、リポジトリのパスに空白が含まれていても動くようにするため
 */
export function localBin(root: string, name: string): string {
  return `"${resolve(root, 'node_modules', '.bin', name)}"`;
}
