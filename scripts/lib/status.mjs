// The life of a line's status.
//   ok       the site shows what was published
//   changed  the site differs; stays until the data is verified again
//   unknown  the site could not be compared (down or rebuilt)
export const STALE_HOURS = 48;

/**
 * @param prev       the previous { state, lastCompared, since } or undefined
 * @param result     'same' | 'different' | 'failed'
 * @param verifiedAt when the published data was last verified against the site
 */
export function nextStatus(prev, result, verifiedAt, now) {
  const flagged = prev?.state === 'changed' && !(verifiedAt > prev.since);
  const lastCompared = result === 'failed' ? (prev?.lastCompared ?? null) : now;
  if (flagged) return { state: 'changed', lastCompared, since: prev.since };
  if (result === 'different') return { state: 'changed', lastCompared, since: now };
  return { state: result === 'same' ? 'ok' : 'unknown', lastCompared };
}

/** Whether a person needs to look at this line. */
export function needsAttention(status, now) {
  if (status.state === 'changed') return true;
  if (status.state !== 'unknown') return false;
  return !status.lastCompared || Date.parse(now) - Date.parse(status.lastCompared) > STALE_HOURS * 3_600_000;
}

/** One reminder to verify again, from 14 days before the published validity ends. */
export function renewal(validUntil, now) {
  if (Date.parse(`${validUntil}T00:00:00Z`) - Date.parse(now) > 14 * 86_400_000) return null;
  return {
    line: 'renewal',
    title: 'Timetable renewal: verify before it expires',
    body: `The published timetable is valid to ${validUntil}. First set the new validity and the dates with no rule (every public holiday and 31 December) in src/calendar.json, then run \`npm run data\`, review and merge.`,
  };
}

/** Compares freshly read fingerprints with the published ones. */
export function difference(published, fresh) {
  if (published.stopList !== fresh.stopList) return 'list of stops differs';
  const urls = new Set([...Object.keys(published.pages), ...Object.keys(fresh.pages)]);
  const changed = [...urls].filter((u) => published.pages[u] !== fresh.pages[u]);
  return changed.length ? `${changed.length} stop page(s) differ, e.g. ${changed[0]}` : null;
}
