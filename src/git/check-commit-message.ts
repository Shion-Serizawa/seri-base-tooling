import { readFileSync } from 'node:fs';

import { firstLineOf, isValidCommitMessage, violationMessage } from './commit-message.ts';

const messagePath = process.argv[2];
if (messagePath === undefined) {
  console.error('コミットメッセージのファイルパスが渡されていません');
  process.exit(1);
}

const firstLine = firstLineOf(readFileSync(messagePath, 'utf8'));
if (!isValidCommitMessage(firstLine)) {
  for (const line of violationMessage(firstLine)) {
    console.error(line);
  }
  process.exit(1);
}
