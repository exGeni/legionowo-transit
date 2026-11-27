// Stop positions and D line paths from OpenStreetMap (ODbL).
// A position is published only when the name and platform number match AND the point
// lies on the right-hand side of the road in the direction the line travels.
// Run after build-data: node scripts/osm.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pool } from './lib/site.mjs';

const API = 'https://api.openstreetmap.org/api/0.6';
const BOX = [20.87, 52.375, 21.01, 52.445];
const CACHE = '.cache/osm.json';

async function get(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'timetable-check' }, signal: AbortSignal.timeout(60_000) });
  if (res.status === 400) return null; // box holds too many nodes: split it
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

async function download() {
  const nodes = new Map();
  const relationIds = new Map();
  const boxes = [BOX];
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
      if (el.type === 'node' && (t.highway === 'bus_stop' || t.public_transport === 'platform') && t.name) {
        nodes.set(el.id, { name: t.name, lat: el.lat, lon: el.lon });
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
    for (const m of relation.members) {
      if (m.type !== 'way' || /platform/.test(m.role)) continue;
      const way = wayById.get(m.ref);
      if (way) ways[ref][m.ref] = way.nodes.map((nid) => byId.get(nid)).filter(Boolean);
    }
  });
  return { fetched: new Date().toISOString().slice(0, 10), nodes: [...nodes.values()], ways };
}

mkdirSync('.cache', { recursive: true });
const osm = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : await download();
writeFileSync(CACHE, JSON.stringify(osm));

const timetable = JSON.parse(readFileSync('public/data/timetable.json', 'utf8'));

const norm = (s) => s.toLowerCase().replace(/\bosiedle\b/g, 'os.').replace(/ - końcowy$/, '')
  .replace(/[^0-9a-ząćęłńóśźż]/g, '');
const index = new Map();
for (const node of osm.nodes) {
  const key = norm(node.name);
  index.set(key, [...(index.get(key) ?? []), node]);
}

// Local flat coordinates in metres.
const M = 111_320;
const K = Math.cos((52.41 * Math.PI) / 180);
const xy = (p) => [p.lon * M * K, p.lat * M];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

const segments = Object.fromEntries(
  Object.entries(osm.ways).map(([line, ways]) => [
    line,
    Object.values(ways).flatMap((pts) =>
      pts.slice(1).map((p, i) => [xy({ lon: pts[i][0], lat: pts[i][1] }), xy({ lon: p[0], lat: p[1] })]),
    ),
  ]),
);

function nearestSegment(point, list) {
  let best = null;
  for (const [a, b] of list) {
    const ab = [b[0] - a[0], b[1] - a[1]];
    const len2 = ab[0] ** 2 + ab[1] ** 2 || 1;
    const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * ab[0] + (point[1] - a[1]) * ab[1]) / len2));
    const foot = [a[0] + t * ab[0], a[1] + t * ab[1]];
    const d = dist(point, foot);
    if (!best || d < best.d) best = { d, ab, foot };
  }
  return best;
}

const roads = Object.values(segments).flat();

const candidates = (id) => index.get(norm(timetable.stops[id].name)) ?? [];

// Where a stop name exists twice in the area, take the one next to its neighbours.
function pick(id, neighbours) {
  const list = candidates(id);
  const around = neighbours.flatMap((n) => candidates(n).map(xy));
  if (!list.length) return null;
  const scored = list.map((node) => ({
    node, d: around.length ? Math.min(...around.map((a) => dist(xy(node), a))) : Infinity,
  })).sort((a, b) => a.d - b.d);
  if (scored[0].d <= 1500) return scored[0].node;
  return list.length === 1 && !around.length ? list[0] : null;
}

const verdicts = new Map(); // id -> { node, good, bad, reason }
for (const line of timetable.lines) {
  for (const direction of line.directions) {
    const ids = direction.stops.map((s) => s.stop);
    const nodes = ids.map((id, i) => pick(id, [ids[i - 1], ids[i + 1]].filter(Boolean)));
    ids.forEach((id, i) => {
      const v = verdicts.get(id) ?? { node: null, good: 0, bad: 0 };
      verdicts.set(id, v);
      const node = nodes[i];
      if (!node) return;
      if (v.node && dist(xy(v.node), xy(node)) > 30) { v.bad += 1; return; }
      v.node = node;
      const before = nodes[i - 1] ?? node;
      const after = nodes[i + 1] ?? node;
      const travel = [xy(after)[0] - xy(before)[0], xy(after)[1] - xy(before)[1]];
      // The road under the stop: the nearest mapped piece that runs the way the line
      // travels (a crossing street at a junction does not count). Any D line's path
      // describes the same road, which also covers D5E, not yet mapped itself.
      const along = (s) => {
        const ab = [s[1][0] - s[0][0], s[1][1] - s[0][1]];
        return ab[0] * travel[0] + ab[1] * travel[1];
      };
      const parallel = roads.filter((s) =>
        Math.abs(along(s)) >= 0.5 * Math.hypot(s[1][0] - s[0][0], s[1][1] - s[0][1]) * Math.hypot(...travel));
      const near = nearestSegment(xy(node), parallel);
      if (!near || near.d > 40 || near.d < 2) return; // side cannot be told
      const d = near.ab[0] * travel[0] + near.ab[1] * travel[1] > 0 ? near.ab : [-near.ab[0], -near.ab[1]];
      const p = [xy(node)[0] - near.foot[0], xy(node)[1] - near.foot[1]];
      if (d[0] * p[1] - d[1] * p[0] < 0) v.good += 1; // right-hand side
      else v.bad += 1;
    });
  }
}

const geo = {};
const unverified = {};
for (const [id, v] of verdicts) {
  if (!v.node) unverified[id] = 'no OpenStreetMap stop with this name and number next to its neighbours';
  else if (v.good > 0 && v.bad === 0) geo[id] = [Number(v.node.lat.toFixed(6)), Number(v.node.lon.toFixed(6))];
  else unverified[id] = v.bad ? 'side of the road contradicts the direction of travel' : 'side of the road cannot be told';
}

mkdirSync('public/data/lines', { recursive: true });
const attribution = '© autorzy OpenStreetMap, licencja ODbL 1.0';
writeFileSync('public/data/geo.json',
  `${JSON.stringify({ attribution, fetched: osm.fetched, stops: geo, unverified }, null, 1)}\n`);
for (const line of timetable.lines) {
  const ways = osm.ways[line.id];
  if (!ways) continue;
  writeFileSync(`public/data/lines/${line.id}.geojson`, `${JSON.stringify({
    type: 'FeatureCollection', attribution,
    features: [{ type: 'Feature', properties: { line: line.id, color: line.color },
      geometry: { type: 'MultiLineString',
        coordinates: Object.values(ways).map((w) => w.map(([x, y]) => [Number(x.toFixed(6)), Number(y.toFixed(6))])) } }],
  })}\n`);
}

const reasons = Object.values(unverified).reduce((m, r) => ({ ...m, [r]: (m[r] ?? 0) + 1 }), {});
console.log(`stops=${verdicts.size} verified=${Object.keys(geo).length}`, reasons);
console.log('line paths:', Object.keys(osm.ways).sort().join(' '));
