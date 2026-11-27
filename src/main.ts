import { registerSW } from 'virtual:pwa-register';
import { board } from './board';
import { loadGeo, loadStatus, loadTimetable, recall, remember } from './data';
import { h } from './dom';
import { picker } from './picker';
import type { Geo, Status, Timetable } from './types';
import { platforms } from './platforms';
import './style.css';
import type { Settings } from './ui';

registerSW({ immediate: true });

const app = document.getElementById('app')!;
const settings: Settings = { stop: null, line: null, walk: 5, ...recall<Partial<Settings>>('settings') };
const save = () => remember('settings', settings);

let view: { root: HTMLElement; mounted(): void; destroy(): void } | null = null;
let screen: 'picker' | 'board' = 'board';

async function start() {
  const fresh = Promise.all([loadTimetable(), loadGeo(), loadStatus()]);
  // On a weak signal at a stop, show the copy on the phone now and update afterwards.
  let table = recall<Timetable>('data:timetable.json');
  let geo = recall<Geo>('data:geo.json');
  let status = recall<Status>('data:status.json');
  const fromPhone = !!table;
  if (!table) [table, geo, status] = await fresh;
  if (!table) {
    app.replaceChildren(
      h('p', { class: 'warn' }, 'Nie udało się wczytać rozkładu. Sprawdź internet.'),
      h('button', { type: 'button', class: 'primary', onclick: () => location.reload() }, 'Spróbuj ponownie'));
    return;
  }
  let all = platforms(table);

  function show() {
    view?.destroy();
    const chosen = all.find((p) => p.id === settings.stop);
    view = screen === 'picker' || !chosen
      ? picker(table!, geo, all, settings, (stop) => {
          if (stop) settings.stop = stop;
          save();
          screen = 'board';
          show();
        }, save)
      : board(table!, status, chosen, settings, () => { screen = 'picker'; show(); }, save);
    app.replaceChildren(view.root);
    view.mounted();
    window.scrollTo(0, 0);
  }

  show();
  if (fromPhone) {
    void fresh.then(([t, g, s]) => {
      const before = JSON.stringify([table, geo, status]);
      table = t ?? table;
      geo = g ?? geo;
      status = s ?? status;
      all = platforms(table!);
      if (JSON.stringify([table, geo, status]) !== before && screen === 'board' && settings.stop) show();
    });
  }

  // Coming back to the app after a while: reread the timetable and the change status.
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hiddenAt = Date.now();
    else if (hiddenAt && Date.now() - hiddenAt > 15 * 60_000) location.reload();
    else if (screen === 'board' && settings.stop) show();
  });
}

void start();
