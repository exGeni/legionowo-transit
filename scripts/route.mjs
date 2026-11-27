// Road paths for the parts of lines that OpenStreetMap has no route for: the D4 detour by
// Polna, Krakusa and Zegrzyńska, and the whole of D5E. A public OSRM router (FOSSGIS,
// routing.openstreetmap.de) is asked once for the road path through the stops in the
// town's order. It routes as a car does, so compare the result with the town's route map.
// Run by hand after scripts/osm.mjs when a route changes, then run osm.mjs again:
//   node scripts/route.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const ROUTER = 'https://routing.openstreetmap.de/routed-car/route/v1/driving';
const timetable = JSON.parse(readFileSync('public/data/timetable.json', 'utf8'));
const { stops } = JSON.parse(readFileSync('public/data/geo.json', 'utf8'));
const line = (id) => timetable.lines.find((l) => l.id === id);

/** The part of one D4 direction that makes the detour. */
function detour() {
  const ids = line('D4').directions[0].stops.map((s) => s.stop);
  const from = ids.indexOf('sloneczna-01');
  if (from < 0) throw new Error('D4: the detour no longer starts at Słoneczna 01; check the route');
  return ids.slice(from);
}

const wanted = [
  ['D4', detour()],
  ...line('D5E').directions.map((d) => ['D5E', d.stops.map((s) => s.stop)]),
];

const lines = {};
const through = {}; // the stops each path was built from, checked again when it is drawn
for (const [id, ids] of wanted) {
  // Leaving one out would draw a road that passes it by.
  const missing = ids.filter((stop) => !stops[stop]);
  if (missing.length) throw new Error(`${id}: no map point for ${missing.join(', ')}; no path written`);
  const points = ids.map((stop) => stops[stop]);
  const path = points.map(([lat, lon]) => `${lon},${lat}`).join(';');
  const res = await fetch(`${ROUTER}/${path}?overview=full&geometries=geojson&continue_straight=true`, {
    headers: { 'user-agent': 'timetable-check' },
    signal: AbortSignal.timeout(60_000),
  });
  const body = await res.json();
  if (body.code !== 'Ok') throw new Error(`${id}: router answered ${body.code ?? res.status}`);
  const [route] = body.routes;
  (lines[id] ??= []).push(route.geometry.coordinates);
  (through[id] ??= []).push(ids);
  console.log(`${id}: ${ids.length} stops, ${(route.distance / 1000).toFixed(1)} km`);
  await new Promise((done) => setTimeout(done, 1500)); // the service allows one request a second
}

writeFileSync('scripts/routed.json', `${JSON.stringify({
  fetched: new Date().toISOString().slice(0, 10),
  attribution: '© autorzy OpenStreetMap, licencja ODbL 1.0; trasa wyznaczona przez OSRM (FOSSGIS)',
  through,
  lines,
})}\n`);
