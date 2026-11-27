// The map on the stop picker: D line paths in their colours and tappable stops.
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { loadLinePath } from './data';
import { h } from './dom';
import type { Platform } from './platforms';
import type { Geo, Timetable } from './types';

export function createMap(
  element: HTMLElement, table: Timetable, geo: Geo, all: Platform[], onPick: (id: string) => void,
) {
  const map = L.map(element, { zoomControl: false }).setView([52.4045, 20.935], 13);
  map.attributionControl.setPrefix(false); // one line on a phone, clear of the zoom buttons
  // Bottom corner: at the top the buttons covered the stop card.
  L.control.zoom({ position: 'bottomleft' }).addTo(map);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">autorzy OpenStreetMap</a> · trasy: OSRM',
  }).addTo(map);

  const paths = L.layerGroup().addTo(map);
  const dots = L.layerGroup().addTo(map);

  let drawing = 0;

  async function show(line: string | null) {
    const mine = ++drawing; // a later filter tap makes this call stop drawing
    paths.clearLayers();
    dots.clearLayers();
    const byPost = new Map<string, Platform[]>();
    for (const p of all) {
      if (p.services.some((s) => !line || s.line === line)) byPost.set(p.stop, [...(byPost.get(p.stop) ?? []), p]);
    }
    for (const [stop, choices] of byPost) {
      const at = geo.stops[stop];
      if (!at) continue;
      const first = choices[0]!.services.find((s) => !line || s.line === line)!;
      const color = table.lines.find((l) => l.id === first.line)!.color;
      // A tap first shows which post and which way, then asks to choose it.
      const card = h('div', { class: 'popup' },
        h('b', {}, choices[0]!.name),
        choices.map((p) => [
          h('p', {}, `→ ${[...new Set(p.services.map((s) => s.headsign))].join(', ')}`),
          h('button', { type: 'button', class: 'primary', onclick: () => onPick(p.id) }, 'Wybierz'),
        ]).flat());
      L.circleMarker(at, { radius: 9, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1 })
        .bindPopup(card)
        .addTo(dots);
    }
    for (const l of table.lines.filter((x) => !line || x.id === line)) {
      const data = await loadLinePath(l.id);
      if (mine !== drawing) return;
      if (data) L.geoJSON(data, { style: { color: l.color, weight: 4, opacity: 0.75 }, interactive: false }).addTo(paths);
    }
  }

  return {
    show,
    focus: (at: [number, number]) => map.setView(at, 16),
    remove: () => map.remove(),
  };
}
