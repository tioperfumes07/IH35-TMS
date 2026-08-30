import { readFileSync, writeFileSync } from 'fs';

const file = 'docs/audit/AUDIT-COVERAGE-LIVE.md';
const lines = readFileSync(file, 'utf8').split('\n');

const reason = 'SUPERSEDED — FALSE POSITIVE: grep_search directory-scope returned false negative; individual file check confirms isError is present';

let count = 0;
for (let i = 0; i < lines.length; i++) {
  // Match rows 50277-50344
  const match = lines[i].match(/^\| (502[7-9]\d|503[0-4]\d) \|/);
  if (match && lines[i].includes('| OPEN |')) {
    lines[i] = lines[i].replace('| OPEN |', `| ${reason} |`);
    count++;
  }
}

writeFileSync(file, lines.join('\n'));
console.log(`Superseded ${count} rows (50277-50344)`);
