// What a rider chooses: one stop post, with the lines and directions that leave it.
import type { Timetable } from './types';

export interface Platform {
  /** What is remembered as the choice: the post, plus the direction where it has two. */
  id: string;
  /** The stop post in the timetable. */
  stop: string;
  /** Set when one line leaves this post in two directions and the rider must pick one. */
  towards: string | null;
  name: string;
  /** Lines and directions you can board here; empty at a final stop. */
  services: { line: string; headsign: string; source?: string; validFrom?: string | null; suspect?: boolean }[];
  /** True when the stop is only ever the end of a route. */
  terminusOnly: boolean;
}

function posts(table: Timetable): Platform[] {
  const out = new Map<string, Platform>();
  for (const line of table.lines) {
    for (const direction of line.directions) {
      direction.stops.forEach((entry, index) => {
        let p = out.get(entry.stop);
        if (!p) {
          p = { id: entry.stop, stop: entry.stop, towards: null, name: table.stops[entry.stop]!.name, services: [], terminusOnly: true };
          out.set(entry.stop, p);
        }
        if (index < direction.stops.length - 1) p.terminusOnly = false;
        if (entry.days) {
          p.services.push({
            line: line.id, headsign: direction.headsign,
            source: entry.source, validFrom: entry.validFrom, suspect: entry.suspect,
          });
        }
      });
    }
  }
  return [...out.values()];
}

export function platforms(table: Timetable): Platform[] {
  const split = posts(table).flatMap((p) => {
    const twoWays = p.services.some((a) => p.services.some((b) => a.line === b.line && a.headsign !== b.headsign));
    if (!twoWays) return [p];
    return [...new Set(p.services.map((s) => s.headsign))].map((towards) => ({
      ...p, id: `${p.stop}~${towards}`, towards, services: p.services.filter((s) => s.headsign === towards),
    }));
  });
  return split.sort((a, b) => a.name.localeCompare(b.name, 'pl'));
}

const plain = (s: string) =>
  s.toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/[̀-ͯ]/g, '');

// The city writes "Os." and "Osiedle" for the same place; a rider may be half-way through
// typing either, so both spellings are searched.
export function matches(p: Platform, query: string): boolean {
  const text = plain(`${p.name} ${p.services.map((s) => s.headsign).join(' ')}`);
  const wanted = plain(query.trim());
  return [text, text.replace(/\bosiedle\b/g, 'os.'), text.replace(/\bos\.\s*/g, 'osiedle ')].some((t) => t.includes(wanted));
}

export function metres(a: [number, number], b: [number, number]): number {
  const k = Math.cos((a[0] * Math.PI) / 180);
  return Math.hypot((a[0] - b[0]) * 111_320, (a[1] - b[1]) * 111_320 * k);
}
