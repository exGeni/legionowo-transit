// What to do with issues, decided apart from the calls that do it. The caller passes only
// issues the Actions bot opened: anyone else's issue with a similar title is not ours.
export const KEYS = ['D1', 'D2', 'D3', 'D4', 'D5E', 'renewal'];

const prefix = (key) => (key === 'renewal' ? 'Timetable renewal:' : `Timetable ${key}:`);

/**
 * @param open   the bot's open issues: [{ number, title }]
 * @param report what needs attention now: [{ line, title, body }]
 */
export function planAlerts(open, report) {
  const actions = [];
  for (const key of KEYS) {
    const existing = open.find((i) => i.title.startsWith(prefix(key)));
    const wanted = report.find((r) => r.line === key);
    if (wanted && !existing) actions.push({ do: 'create', title: wanted.title, body: wanted.body });
    // A comment notifies, a silent body edit would not: speak only when the state changes.
    else if (wanted && existing.title !== wanted.title) {
      actions.push({ do: 'update', number: existing.number, title: wanted.title, body: wanted.body });
    } else if (!wanted && existing) actions.push({ do: 'close', number: existing.number });
  }
  return actions;
}
