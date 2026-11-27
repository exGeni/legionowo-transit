// Compares the city site with the published data and updates status.json.
// Usage: node scripts/check.mjs <status.json> [<report.json>]
// A site failure is a result ("unknown"), not a script failure.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { Changed, collectLine } from './lib/collect.mjs';
import { parseStopPage as parseSecond } from './lib/parse-b.mjs';
import { difference, needsAttention, nextStatus, renewal } from './lib/status.mjs';
import { LINES, linePageUrl } from './lib/site.mjs';

const [statusPath, reportPath] = process.argv.slice(2);
if (!statusPath) {
  console.error('usage: node scripts/check.mjs <status.json> [<report.json>]');
  process.exit(2);
}

const sources = JSON.parse(readFileSync('public/data/sources.json', 'utf8'));
const previous = existsSync(statusPath) ? JSON.parse(readFileSync(statusPath, 'utf8')) : { lines: {} };
const now = new Date().toISOString();
const lines = {};
const report = [];

// A slow city site must still end in a written status, well inside the job's time limit.
const DEADLINE = Date.now() + Number(process.env.CHECK_BUDGET_MS ?? 12 * 60_000);
const within = (promise) => {
  let timer;
  const late = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('time budget used up')), Math.max(0, DEADLINE - Date.now()));
  });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
};

// The second parser must still be able to read every page.
const onPage = (url, html) => {
  try {
    parseSecond(html);
  } catch (err) {
    throw new Changed(`${url}: second parser: ${err.message}`);
  }
};

for (const line of LINES) {
  let result;
  let detail;
  try {
    const fresh = await within(collectLine(line, {
      onPage, publishedStopList: sources.lines[line].stopList, publishedPages: sources.lines[line].pages,
    }));
    detail = difference(sources.lines[line], fresh.prints);
    result = detail ? 'different' : 'same';
  } catch (err) {
    result = err instanceof Changed ? 'different' : 'failed';
    detail = err.message;
  }
  lines[line] = nextStatus(previous.lines[line], result, sources.verifiedAt, now);
  console.log(`${line}: ${lines[line].state}${detail ? ` (${detail})` : ''}`);
  if (needsAttention(lines[line], now)) {
    report.push({
      line,
      title: `Timetable ${line}: ${lines[line].state === 'changed' ? 'changed on the city site' : 'cannot be compared'}`,
      body: `Detected ${now}.\n\n${detail ?? 'Marked earlier and not verified since.'}\n\nCity page: ${linePageUrl(line)}\n\nTo clear: run \`npm run data\`, review the difference and merge it.`,
    });
  }
}

const { validUntil } = JSON.parse(readFileSync('public/data/timetable.json', 'utf8'));
const due = renewal(validUntil, now);
if (due) report.push(due);

writeFileSync(statusPath, `${JSON.stringify({ checkedAt: now, verifiedAt: sources.verifiedAt, lines }, null, 1)}\n`);
if (reportPath) writeFileSync(reportPath, JSON.stringify(report));
// A request still hanging past the budget must not keep the job alive.
process.exit(0);
