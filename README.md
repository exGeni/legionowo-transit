# Legionowo transit: when to leave for the bus

Legionowo, a town next to Warsaw, runs free bus lines (D1, D2, D3, D4, D5E). Their
timetables are published as text on the town's website and on some stops, but nothing
tells you when to leave home.

**The app:** <https://exgeni.github.io/legionowo-transit/> (in Polish).

<img src="public/qr.svg" alt="QR code of the app address" width="180">

Pick your stop,
say how long you walk to it, and it shows "Wyjdź za 4 min" (leave in 4 minutes). It
installs on a phone's home screen and works offline.

**It is unofficial** and not made or endorsed by the town. It shows the timetable, not
where the bus really is.

## What it does and does not do

- All stops of the five lines in a searchable list, with the nearest ones first.
- A map with all five paths. A stop has a point where its name and post number match
  OpenStreetMap, on the line's route there or next to its neighbouring stops; the side of
  the road is taken from the post number as mapped, not checked. The others are only in
  the list. D5E and the D4 detour by Polna and Krakusa have no route in OpenStreetMap:
  a router (OSRM) built them from the order of the stops.
- On a phone one column; on a computer the choice on the left and a large map beside it.
- Leave time = departure − your walk − 2 minutes in case the bus is early.
- Timetable verified up to 31 December 2026. Public holidays and 31 December show
  "unconfirmed", because the town's pages give no rule for them.
- Where the town's own tables contradict each other, the stop shows a warning. Times are
  never corrected or computed.
- Temporary changes and detours announced as news are not tracked.
- Not yet: the free county lines 7P-12P, and a GTFS feed.

## How the data stays honest

Every 6 hours (and on every merge) a GitHub Action reads the town's stop pages again and
compares them with what is published. A difference marks the line "changed" in the app
and opens an issue. If the pages cannot be compared for more than 48 hours, the app
says so.

To refresh after a change:

```bash
npm run data        # reads every stop page with two independently written parsers
node scripts/osm.mjs  # stop positions and line paths (cached in .cache/osm.json)
```

When the D4 detour or D5E changes, also run `node scripts/route.mjs` and then
`scripts/osm.mjs` again, and compare the result with the town's route map.

Review the difference in `public/data/`, then merge. For a new validity period, first set
`validUntil` and the dates with no rule in `src/calendar.json`.

## Develop

```bash
npm install
npm run dev
npm test
npm run build
```

The open data is in [`public/data/`](public/data/): see its
[licences and format](public/data/LICENSE.md). The design is in
[`docs/designs/time-to-leave.md`](docs/designs/time-to-leave.md) (in Russian).

## Licence

Code: MIT. Data: **not** MIT, see [`public/data/LICENSE.md`](public/data/LICENSE.md).
Timetable © Urząd Miasta Legionowo, reused with source; map data © OpenStreetMap
contributors (ODbL).
