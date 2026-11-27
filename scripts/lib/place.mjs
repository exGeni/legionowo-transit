// Which OpenStreetMap node is which stop post.

/** "Osiedle Młodych 01" and "Os. Młodych 01" are the same post. */
export const norm = (s) => s.toLowerCase().replace(/\bosiedle\b/g, 'os.').replace(/ - końcowy$/, '')
  .replace(/[^0-9a-ząćęłńóśźż]/g, '');

// Two nodes of one post (kerb and road) lie close together; farther apart they are two places.
const SAME_POST_METRES = 150;
const NEIGHBOUR_METRES = 2000;
// D5E runs 13 km without a stop to the Warsaw metro: no neighbour is near this one.
const FAR_FROM_NEIGHBOURS = new Set([norm('Metro Młociny 25')]);

const metres = (a, b) => Math.hypot((a.lat - b.lat) * 111_320, (a.lon - b.lon) * 111_320 * Math.cos((52.41 * Math.PI) / 180));

export function place(timetable, osm) {
  const byName = new Map();
  for (const node of osm.nodes) byName.set(norm(node.name), [...(byName.get(norm(node.name)) ?? []), node]);
  const candidates = (id) => byName.get(norm(timetable.stops[id].name)) ?? [];

  const uses = new Map(); // id -> [{ line, neighbours }]
  for (const line of timetable.lines) {
    for (const direction of line.directions) {
      const ids = direction.stops.map((s) => s.stop);
      ids.forEach((id, i) => {
        uses.set(id, [...(uses.get(id) ?? []), { line: line.id, neighbours: [ids[i - 1], ids[i + 1]].filter(Boolean) }]);
      });
    }
  }

  const geo = {};
  const unverified = {};
  for (const [id, used] of uses) {
    const name = norm(timetable.stops[id].name);
    let found = used.flatMap((u) => Object.values(osm.members?.[u.line] ?? {}).filter((n) => norm(n.name) === name));
    if (!found.length) {
      // Not part of a mapped route: take the node of that name next to the neighbouring stops.
      found = used.flatMap(({ neighbours }) => {
        const around = neighbours.flatMap(candidates);
        const near = candidates(id)
          .map((node) => ({ node, d: Math.min(Infinity, ...around.map((a) => metres(node, a))) }))
          .sort((a, b) => a.d - b.d)[0];
        if (FAR_FROM_NEIGHBOURS.has(name)) return candidates(id);
        return near && near.d <= NEIGHBOUR_METRES ? [near.node] : [];
      });
    }
    if (!found.length) {
      unverified[id] = 'no OpenStreetMap stop with this name and number next to its neighbours';
    } else if (found.some((a) => found.some((b) => metres(a, b) > SAME_POST_METRES))) {
      unverified[id] = 'OpenStreetMap has two places with this name and number';
    } else {
      const best = found.find((n) => n.platform) ?? found[0];
      geo[id] = [Number(best.lat.toFixed(6)), Number(best.lon.toFixed(6))];
    }
  }
  return { geo, unverified };
}
