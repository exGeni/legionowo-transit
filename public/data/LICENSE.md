# Licences of the files in this folder

The code of this repository is under the MIT licence. **The data here is not.**

## Timetable (`timetable.json`, `sources.json`)

Public sector information of Urząd Miasta Legionowo, read from
<https://legionowo.pl/dkmlegionowo>. Reuse follows the conditions in the city's
[Biuletyn Informacji Publicznej](https://www.bip.legionowo.pl/m,28982,informacja-publiczna-i-ponowne-wykorzystywanie.html):

- source: Urząd Miasta Legionowo, legionowo.pl;
- time of creation: the "Obowiązuje od" date of each stop page (`validFrom`);
- time of obtaining: `obtainedAt` in `timetable.json`;
- processing: read from the stop pages by a script, cross-checked by a second parser,
  stored as JSON. Times were not computed or corrected.

The city is not responsible for products made from this information. This project is
unofficial. Whether these general conditions cover the pages the timetable was read
from is not certain. A reuse request to the city (art. 39 of the act of 11 August
2021 on open data) has been prepared for the project owner to send. The data will be
removed if the city asks.

## Stop positions and line paths (`geo.json`, `lines/*.geojson`)

© OpenStreetMap contributors, [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
See <https://www.openstreetmap.org/copyright>.

## Format of `timetable.json`

- `stops`: stop post id to `{ name }`; the name carries the post number where the
  city's pages give one.
- `lines[].directions[].stops[]`: in route order. `days` maps weekday numbers
  (`"12345"`, `"6"`, `"123456"`; 1 = Monday) to departure times, or is `null` where
  nobody boards or the city gives no time. `suspect` marks stops whose times contradict
  a neighbouring stop on the city's own pages.
- `validUntil`: after this date the times must be verified again.
