// One open issue per line that needs a person: opened, commented on when the state
// changes, closed when it recovers. Usage (in GitHub Actions): node scripts/alert.mjs <report.json>
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { planAlerts } from './lib/alerts.mjs';

const report = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8' });
const open = JSON.parse(gh('issue', 'list', '--state', 'open', '--author', 'app/github-actions',
  '--limit', '100', '--json', 'number,title'));

for (const a of planAlerts(open, report)) {
  if (a.do === 'create') gh('issue', 'create', '--title', a.title, '--body', a.body);
  else if (a.do === 'update') {
    gh('issue', 'edit', String(a.number), '--title', a.title);
    gh('issue', 'comment', String(a.number), '--body', a.body);
  } else gh('issue', 'close', String(a.number), '--comment', 'The city site matches the published timetable again.');
}
