// Choosing a stop: nearest, search, list or map, plus how long you walk to it.
import { h } from './dom';
import { createMap } from './map';
import { matches, metres, type Platform } from './platforms';
import type { Geo, Timetable } from './types';
import { chip, walkStepper, type Settings } from './ui';

export function picker(
  table: Timetable, geo: Geo | null, all: Platform[], settings: Settings,
  done: (stop: string | null) => void, save: () => void,
) {
  let here: [number, number] | null = null;
  let query = '';

  const list = h('ul', { class: 'stops' });
  const note = h('p', { class: 'note', 'aria-live': 'polite' });
  const mapBox = h('div', { class: 'map', 'aria-label': 'Mapa przystanków' });
  const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Filtr linii' });
  let map: ReturnType<typeof createMap> | null = null;

  const distance = (p: Platform) => (here && geo?.stops[p.stop] ? metres(here, geo.stops[p.stop]!) : Infinity);

  function renderList() {
    const shown = all
      .filter((p) => !settings.line || p.services.some((s) => s.line === settings.line))
      .filter((p) => !query || matches(p, query));
    if (here) shown.sort((a, b) => distance(a) - distance(b));
    list.replaceChildren(
      ...shown.map((p) => {
        const lines = [...new Set(p.services.map((s) => s.line))];
        const towards = [...new Set(p.services.map((s) => s.headsign))].join(', ');
        const far = distance(p);
        return h('li', {},
          h('button', { type: 'button', onclick: () => done(p.id) },
            h('span', { class: 'stop-name' },
              h('b', {}, p.name),
              h('small', {},
                towards ? `→ ${towards}` : p.terminusOnly ? 'koniec trasy' : 'brak godzin w rozkładzie miasta',
                Number.isFinite(far) ? ` · ${Math.round(far / 10) * 10} m` : '')),
            h('span', { class: 'badges' }, lines.map((id) => chip(table, id)))));
      }),
    );
    if (!shown.length) list.append(h('li', { class: 'note' }, 'Nic nie pasuje do wyszukiwania.'));
  }

  function renderChips() {
    chips.replaceChildren(
      ...table.lines.map((l) =>
        h('button', {
          type: 'button',
          class: 'line-filter',
          'aria-pressed': String(settings.line === l.id),
          style: `background:${l.color};color:${l.textColor}`,
          onclick: () => {
            settings.line = settings.line === l.id ? null : l.id;
            save();
            renderChips();
            renderList();
            void map?.show(settings.line);
          },
        }, l.id)),
    );
  }

  const nearest = h('button', {
    type: 'button',
    class: 'primary',
    onclick: () => {
      if (!navigator.geolocation) {
        note.textContent = 'Ta przeglądarka nie podaje lokalizacji. Użyj wyszukiwarki.';
        return;
      }
      note.textContent = 'Szukam Twojej lokalizacji…';
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          here = [pos.coords.latitude, pos.coords.longitude];
          note.textContent = 'Najbliższe na górze. Przystanki bez punktu na mapie są na końcu listy.';
          map?.focus(here);
          renderList();
        },
        () => { note.textContent = 'Brak dostępu do lokalizacji. Użyj wyszukiwarki lub mapy.'; },
        { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
      );
    },
  }, '◎ Najbliższe przystanki');

  const search = h('input', {
    type: 'search',
    placeholder: 'Szukaj przystanku lub kierunku…',
    'aria-label': 'Szukaj przystanku',
    oninput: (e: Event) => {
      query = (e.target as HTMLInputElement).value;
      renderList();
    },
  });

  const root = h('section', { class: 'picker' },
    h('header', {},
      h('h1', {}, 'Wybierz przystanek'),
      settings.stop ? h('button', { type: 'button', class: 'link', onclick: () => done(null) }, 'wróć') : null),
    chips,
    walkStepper(settings, save),
    geo ? nearest : null,
    note,
    geo ? mapBox : null,
    search,
    list,
    h('p', { class: 'fine' },
      'Bez konta. Wybór i lokalizacja zostają w telefonie. Mapa pochodzi z serwerów OpenStreetMap, a strona z GitHub: te serwery widzą Twój adres IP i oglądany fragment mapy.'),
    h('p', { class: 'fine' }, 'Nie każdy przystanek ma jeszcze punkt na mapie: wszystkie są na liście. Trasy D5E i objazdu D4 wyznaczył program według kolejności przystanków.'),
    h('p', { class: 'fine' }, 'Dodaj do ekranu telefonu. iPhone: „Udostępnij”, potem „Do ekranu początkowego”. Android: menu przeglądarki, potem „Zainstaluj aplikację”.'),
  );

  renderChips();
  renderList();

  return {
    root,
    mounted() {
      if (geo && navigator.onLine) {
        map = createMap(mapBox, table, geo, all, done);
        void map.show(settings.line);
      } else if (geo) {
        mapBox.replaceChildren(h('p', { class: 'note' }, 'Mapa wymaga internetu. Lista i wyszukiwarka działają.'));
      }
    },
    destroy() {
      map?.remove();
    },
  };
}
