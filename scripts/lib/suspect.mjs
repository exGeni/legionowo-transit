// The city's own tables sometimes contradict each other (a time typed with the wrong
// hour, a trip missing at one stop). We never correct them; we flag the two stops.
const minutes = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));

/**
 * Compares neighbouring stops of one direction. A pair is flagged when both list about
 * the same number of trips and one or two of them have no continuation within 25
 * minutes. Larger differences are trips that really take another route.
 */
export function findSuspects(entries) {
  const found = [];
  const served = entries.map((e, index) => ({ e, index })).filter((x) => x.e.days);
  for (let i = 0; i + 1 < served.length; i++) {
    const a = served[i];
    const b = served[i + 1];
    for (const [days, from] of Object.entries(a.e.days)) {
      const to = b.e.days[days];
      if (!to || Math.abs(from.length - to.length) > 1) continue;
      const lost = from.filter((x) => !to.some((y) => minutes(y) - minutes(x) >= 0 && minutes(y) - minutes(x) <= 25));
      if (lost.length >= 1 && lost.length <= 2) found.push({ from: a.index, to: b.index, days, lost });
    }
  }
  return found;
}
