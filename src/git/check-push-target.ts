import { readFileSync } from 'node:fs';

import { parsePushInput, rejectedTargets, violationMessage } from './push-target.ts';

// 守るブランチは引数で受け取る。リポジトリごとに違うので既定値を置かない。
const protectedBranches = process.argv.slice(2);
// フックの stdin。パイプが閉じている場合は空として扱う（push を落とさない）。
const stdin = (() => {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
})();

const rejected = rejectedTargets(parsePushInput(stdin), protectedBranches);
if (rejected.length > 0) {
  for (const line of violationMessage(rejected)) {
    console.error(line);
  }
  process.exit(1);
}
