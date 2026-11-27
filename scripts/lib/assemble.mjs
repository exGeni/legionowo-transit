// Turns the collected line pages into the published structure.
import { daySet, isArrivalPage, stopId } from './collect.mjs';
import { findSuspects } from './suspect.mjs';

export function assemble(collected, colors) {
  const notes = [];
  const stops = {};
  const addStop = (name) => {
    const id = stopId(name);
    stops[id] ??= { name: name.replace(/ - końcowy$/, '') };
    return id;
  };

  let departures = 0;
  const lines = collected.map(({ line, directions, pages }) => ({
    id: line,
    // Who runs the line; the county's free lines will carry their own.
    operator: 'Gmina Miejska Legionowo',
    color: colors[line][0],
    textColor: colors[line][1],
    directions: directions.map((direction, di) => ({
      id: `${line}-${di + 1}`,
      headsign: direction.headsign,
      stops: direction.stops.map((s, si) => {
        const stop = addStop(s.name);
        const page = s.url ? pages.get(s.url) : null;
        const last = si === direction.stops.length - 1;
        // No page, an arrivals page, or the last stop: nobody boards here this way.
        if (!page || isArrivalPage(page) || last) {
          if (!last) notes.push(`${line} ${direction.headsign}: no departure times for ${s.name}`);
          return { stop, days: null };
        }
        if (page.stopName && stopId(page.stopName) !== stop) {
          notes.push(`${line} ${direction.headsign}: list says "${s.name}", page says "${page.stopName}" (${s.url})`);
        }
        const days = Object.fromEntries(page.days.map((d) => [daySet(d.label), d.times]));
        if (Object.keys(days).length !== page.days.length) {
          throw new Error(`${s.url}: two tables for the same days`);
        }
        departures += Object.values(days).reduce((n, t) => n + t.length, 0);
        return { stop, days, validFrom: page.validFrom, source: s.url };
      }),
    })),
  }));

  const suspects = [];
  for (const line of lines) {
    for (const direction of line.directions) {
      for (const s of findSuspects(direction.stops)) {
        direction.stops[s.from].suspect = true;
        direction.stops[s.to].suspect = true;
        suspects.push(`${line.id} ${direction.headsign}: ${stops[direction.stops[s.from].stop].name} -> ${stops[direction.stops[s.to].stop].name}, ${s.lost.join(', ')}`);
      }
    }
  }

  return { stops, lines, suspects, notes, departures };
}
