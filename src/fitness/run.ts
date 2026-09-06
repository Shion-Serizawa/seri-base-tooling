import { runFitness } from './framework.ts';
import { defaultContext } from './lib/context.ts';

/**
 * このパッケージ自身に対して A 層の検査を走らせる。
 *
 * 配る側が自分で守れていない状態を作らないため、基盤リポジトリと同じ検査を
 * 自分にもかける（ドッグフーディング）。
 *
 * レイアウトは基盤リポジトリと違う。コードは `src` にまとまっていて、
 * ビルド成果物は持たない。既定のまま走らせると「apps が見つからない」で
 * FAIL するので、この形を明示して渡す。
 */
const passed = await runFitness({
  context: { ...defaultContext(), sourceRoots: ['src'], bundles: [] },
  // リポジトリの形に依存する検査は持たない
  expectedProjectResults: 0,
});
process.exit(passed ? 0 : 1);
