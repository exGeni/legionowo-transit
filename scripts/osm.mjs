// Stop positions and D line paths from OpenStreetMap (ODbL).
// A position is published when the stop name and post number match a node that is part of
// that line's OpenStreetMap route, or lies next to the line's neighbouring stops. The side
// of the road is taken from the post number as mapped; it is not checked here.
// Paths the map has no route for come from scripts/routed.json (see scripts/route.mjs).
// Run after build-data: node scripts/osm.mjs   (delete .cache/osm.json to read the map again)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pool } from './lib/site.mjs';
import { norm, place } from './lib/place.mjs';

const API = 'https://api.openstreetmap.org/api/0.6';
// Legionowo, and the Warsaw end of D5E at Metro Młociny.
const BOXES = [[20.87, 52.375, 21.01, 52.445], [20.915, 52.283, 20.945, 52.298]];
const CACHE = '.cache/osm.json';

async function get(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'timetable-check' }, signal: AbortSignal.timeout(60_000) });
  if (res.status === 400) return null; // box holds too many nodes: split it
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

/** A named bus stop: a platform at the kerb, or the stopping point on the road. */
function stopNode(el) {
  const t = el?.tags;
  if (!t?.name) return null;
  const platform = t.highway === 'bus_stop' || t.public_transport === 'platform';
  if (!platform && t.public_transport !== 'stop_position') return null;
  return { name: t.name, lat: el.lat, lon: el.lon, platform };
}

async function download() {
  const nodes = new Map();
  const relationIds = new Map();
  const members = {};
  const boxes = [...BOXES];
  while (boxes.length) {
    const [w, s, e, n] = boxes.shift();
    const data = await get(`${API}/map.json?bbox=${[w, s, e, n].map((v) => v.toFixed(5)).join(',')}`);
    if (!data) {
      const x = (w + e) / 2;
      const y = (s + n) / 2;
      boxes.push([w, s, x, y], [x, s, e, y], [w, y, x, n], [x, y, e, n]);
      continue;
    }
    for (const el of data.elements) {
      const t = el.tags;
      if (!t) continue;
      if (el.type === 'node') {
        const node = stopNode(el);
        if (node) nodes.set(el.id, node);
      }
      if (el.type === 'relation' && t.route === 'bus' && /^D\d/.test(t.ref ?? '')) relationIds.set(el.id, t.ref);
    }
  }
  const ways = {};
  await pool([...relationIds], 2, async ([id, ref]) => {
    const full = await get(`${API}/relation/${id}/full.json`);
    const byId = new Map(full.elements.filter((e) => e.type === 'node').map((e) => [e.id, [e.lon, e.lat]]));
    const wayById = new Map(full.elements.filter((e) => e.type === 'way').map((e) => [e.id, e]));
    const relation = full.elements.find((e) => e.type === 'relation' && e.id === id);
    ways[ref] ??= {};
    members[ref] ??= {};
    const listed = new Map(full.elements.filter((e) => e.type === 'node').map((e) => [e.id, e]));
    for (const m of relation.members) {
      const node = m.type === 'node' && stopNode(listed.get(m.ref));
      if (node) members[ref][m.ref] = node;
      if (m.type !== 'way' || /platform/.test(m.role)) continue;
      const way = wayById.get(m.ref);
      if (way) ways[ref][m.ref] = way.nodes.map((nid) => byId.get(nid)).filter(Boolean);
    }
  });
  return { fetched: new Date().toISOString().slice(0, 10), nodes: [...nodes.values()], members, ways };
}

mkdirSync('.cache', { recursive: true });
const cached = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : null;
// A cache written before route members were kept would place stops differently.
const osm = cached?.members ? cached : await download();
writeFileSync(CACHE, JSON.stringify(osm));

const timetable = JSON.parse(readFileSync('public/data/timetable.json', 'utf8'));

const { geo, unverified } = place(timetable, osm);
const routed = JSON.parse(readFileSync('scripts/routed.json', 'utf8'));
// A built path is drawn only while the town still lists the stops it was built through.
const stillListed = (id, ids) => timetable.lines.find((l) => l.id === id).directions
  .some((d) => `,${d.stops.map((s) => s.stop)},`.includes(`,${ids},`));
const builtPaths = (id) => (routed.lines[id] ?? []).filter((_, i) => {
  const current = stillListed(id, routed.through?.[id]?.[i] ?? ['unknown']);
  if (!current) console.warn(`${id}: the stops changed since a path was built; run scripts/route.mjs. Path not drawn.`);
  return current;
});

mkdirSync('public/data/lines', { recursive: true });
const attribution = '© autorzy OpenStreetMap, licencja ODbL 1.0';
writeFileSync('public/data/geo.json',
  `${JSON.stringify({ attribution, fetched: osm.fetched, stops: geo, unverified }, null, 1)}\n`);
for (const line of timetable.lines) {
  const drawn = [
    ...Object.values(osm.ways[line.id] ?? {}),
    ...builtPaths(line.id),
  ].map((w) => w.map(([x, y]) => [Number(x.toFixed(6)), Number(y.toFixed(6))]));
  if (!drawn.length) continue;
  writeFileSync(`public/data/lines/${line.id}.geojson`, `${JSON.stringify({
    type: 'FeatureCollection', attribution,
    features: [{ type: 'Feature', properties: { line: line.id, color: line.color },
      geometry: { type: 'MultiLineString', coordinates: drawn } }],
  })}
`);
}

const reasons = Object.values(unverified).reduce((m, r) => ({ ...m, [r]: (m[r] ?? 0) + 1 }), {});
console.log(`stops=${Object.keys(timetable.stops).length} placed=${Object.keys(geo).length}`, reasons);
console.log('mapped line paths:', Object.keys(osm.ways).sort().join(' '), '| routed:', Object.keys(routed.lines).join(' '));
