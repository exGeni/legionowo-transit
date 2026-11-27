// The main screen: when to leave, in one glance.
import { h } from './dom';
import type { Platform } from './platforms';
import { SAFETY_MINUTES, advice, expiresSoon, isExpired, plan, upcoming, warsawDate, warsawInstant, type Departure } from './schedule';
import type { Status, Timetable } from './types';
import { chip, day, shortDate, walkStepper, type Settings } from './ui';

const CITY_PAGE = 'https://legionowo.pl/dkmlegionowo';
const STALE_AFTER_MS = 48 * 3_600_000;

const link = (href: string, text: string) => h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, text);

function warnings(table: Timetable, status: Status | null, platform: Platform, now: number) {
  const out: (string | Node)[][] = [];
  const lines = [...new Set(platform.services.map((s) => s.line))];
  // A status written for another version of the timetable says nothing about this one.
  const matching = status && (!status.verifiedAt || !table.verifiedAt || status.verifiedAt === table.verifiedAt) ? status : null;
  const states = lines.map((id) => [id, matching?.lines[id]] as const);
  const changed = states.filter(([, s]) => s?.state === 'changed').map(([id]) => id);
  if (changed.length) {
    out.push([`Rozkład ${changed.join(', ')} na stronie miasta zmienił się. Godziny tutaj mogą być stare: `, link(CITY_PAGE, 'sprawdź na stronie miasta'), '.']);
  }
  const stale = states.filter(([, s]) => !s?.lastCompared || now - Date.parse(s.lastCompared) > STALE_AFTER_MS);
  if (stale.length) {
    out.push(['Od ponad 2 dni nie udało się porównać rozkładu ze stroną miasta. ', link(CITY_PAGE, 'Sprawdź tam'), '.']);
  }
  if (platform.services.some((s) => s.suspect)) {
    out.push(['Na stronie miasta godziny dla tego przystanku są niespójne z sąsiednim. Sprawdź tabliczkę na przystanku.']);
  }
  if (expiresSoon(table, now)) {
    out.push([`Te godziny są potwierdzone do ${shortDate(table.validUntil)}. Potem rozkład może się zmienić.`]);
  }
  // No role="alert": the screen redraws every minute and would be read out each time.
  return out.map((parts) => h('p', { class: 'warn' }, ...parts));
}

function footer(table: Timetable, status: Status | null, platform: Platform) {
  const compared = platform.services
    .map((s) => status?.lines[s.line]?.lastCompared)
    .filter((x): x is string => !!x)
    .sort()[0];
  const validFrom = [...new Set(platform.services.map((s) => s.validFrom).filter((x): x is string => !!x))];
  const source = platform.services.find((s) => s.source)?.source ?? CITY_PAGE;
  return h('footer', { class: 'fine' },
    h('p', {}, h('b', {}, 'Aplikacja nieoficjalna. Według rozkładu, nie na żywo.')),
    h('p', {}, `Sprawdzone ze stroną miasta: ${shortDate(table.verifiedAgainstSite)}. `,
      compared ? `Ostatnie porównanie: ${shortDate(compared)}.` : 'Porównanie automatyczne jeszcze się nie odbyło.'),
    h('p', {}, 'Zmiany czasowe i objazdy nie są śledzone: ', link('https://legionowo.pl', 'komunikaty miasta'), '.'),
    h('p', {}, 'Źródło: ', link(source, table.source.name),
      validFrom.length ? `, obowiązuje od ${validFrom.map(shortDate).join(', ')}` : '',
      `, pobrane ${shortDate(table.obtainedAt)}. Odczytane skryptem i zapisane jako `,
      link(`${import.meta.env.BASE_URL}data/timetable.json`, 'otwarty plik'), ' bez zmiany godzin.'));
}

export function board(
  table: Timetable, status: Status | null, platform: Platform, settings: Settings,
  change: () => void, save: () => void,
) {
  let showMissed = false;
  const root = h('section', { class: 'board' });

  const head = (line: string | null) =>
    h('header', {},
      h('div', {},
        h('h1', {}, platform.name),
        h('p', {}, platform.services.length
          ? `→ ${[...new Set(platform.services.filter((s) => !line || s.line === line).map((s) => s.headsign))].join(', ')}`
          : platform.terminusOnly ? 'koniec trasy' : 'brak godzin w rozkładzie miasta')),
      h('button', { type: 'button', class: 'link', onclick: change }, 'zmień'));

  const card = (dep: Departure | null, ...content: (Node | string)[]) => {
    const line = dep && table.lines.find((l) => l.id === dep.line);
    return h('div', { class: 'card', style: line ? `background:${line.color};color:${line.textColor}` : undefined }, ...content);
  };

  const meta = (dep: Departure) =>
    h('p', { class: 'meta' }, chip(table, dep.line), ` o ${dep.time} → ${dep.headsign}`);

  function render() {
    const now = Date.now();
    const line = platform.services.some((s) => s.line === settings.line) ? settings.line : null;
    const parts: (Node | null)[] = [head(line), ...warnings(table, status, platform, now)];
    if (line && new Set(platform.services.map((s) => s.line)).size > 1) {
      // The filter chosen while searching also limits the countdown: say so, offer a way out.
      parts.push(h('p', { class: 'note' }, `Pokazuję tylko ${line}. `, h('button', {
        type: 'button', class: 'link',
        onclick: () => { settings.line = null; save(); render(); },
      }, 'Pokaż wszystkie linie')));
    }

    if (!platform.services.length) {
      parts.push(card(null, h('p', { class: 'big-label' },
        platform.terminusOnly ? 'Koniec trasy: tu się nie wsiada.' : 'Brak godzin w rozkładzie miasta.')));
    } else if (isExpired(table, now)) {
      const old = upcoming(table, platform.stop, now, { line, towards: platform.towards, count: 5 }).departures;
      parts.push(
        h('p', { class: 'warn' }, 'Rozkład w aplikacji jest nieaktualny. ', link(CITY_PAGE, 'Sprawdź na stronie miasta'), '.'),
        h('ul', { class: 'times old' }, old.map((d) => h('li', {}, chip(table, d.line), h('span', {}, `${day(d.date)} ${d.time}`)))));
    } else {
      const p = plan(table, platform.stop, now, settings.walk, line, platform.towards);
      const today = warsawDate(now);
      const runsToday = upcoming(table, platform.stop, warsawInstant(today, '00:00'), { line, towards: platform.towards, count: 1 }).departures[0]?.date === today;
      const dep = showMissed && p.missed ? p.missed : p.next;

      if (showMissed && p.missed) {
        parts.push(
          card(p.missed, h('p', { class: 'big-label' }, 'Odjazd za'),
            h('p', { class: 'big' }, String(Math.max(0, Math.floor((p.missed.at - now) / 60_000)))),
            h('p', { class: 'big-label' }, 'min · trzeba biec')),
          meta(p.missed));
      } else if (!dep) {
        parts.push(card(null, h('p', { class: 'big-label' },
          p.unconfirmed ? `Rozkład na ${day(p.unconfirmed)} niepotwierdzony.` : 'Brak kursów w rozkładzie miasta.'),
          h('p', {}, link(CITY_PAGE, 'Sprawdź na stronie miasta'))));
      } else {
        const a = advice(dep, now, settings.walk);
        const prefix = p.missed ? h('p', { class: 'big-label small' }, `Nie zdążysz na ${p.missed.time}. Następny:`) : null;
        const content: (Node | null)[] =
          a.kind === 'in'
            ? [prefix, h('p', { class: 'big-label' }, 'Wyjdź za'), h('p', { class: 'big' }, String(a.minutes)), h('p', { class: 'big-label' }, 'min')]
            : a.kind === 'now'
              ? [prefix, h('p', { class: 'big-word' }, 'Wyjdź teraz')]
              : a.kind === 'tight'
                ? [prefix, h('p', { class: 'big-word' }, 'Wyjdź teraz'), h('p', { class: 'big-label' }, 'na styk')]
                : [prefix, p.missed ? null : h('p', { class: 'big-label' }, runsToday ? 'Dziś już nic. Następny kurs' : 'Dziś brak kursów w rozkładzie miasta. Następny:'),
                  h('p', { class: 'big-word' }, dep.time), h('p', { class: 'big-label' }, day(dep.date))];
        parts.push(card(dep, ...content.filter((x): x is Node => !!x)), meta(dep));
        if (a.kind === 'later-day' && !runsToday) {
          parts.push(h('p', { class: 'note' }, link(CITY_PAGE, 'Sprawdź na stronie miasta')));
        }
        if (a.kind !== 'later-day') {
          parts.push(h('p', { class: 'meta small' }, `dojście ${settings.walk} min + ${SAFETY_MINUTES} min zapasu`));
        }
        if (p.unconfirmed) {
          parts.push(h('p', { class: 'note' }, `Dalej: rozkład na ${day(p.unconfirmed)} niepotwierdzony.`));
        }
      }

      if (p.missed) {
        parts.push(h('button', {
          type: 'button', class: 'secondary',
          onclick: () => { showMissed = !showMissed; render(); },
        }, showMissed ? 'Pokaż następny' : `Pokaż mimo to ${p.missed.time}`));
      } else {
        showMissed = false;
      }

      parts.push(h('ul', { class: 'times' }, p.list.map((d) =>
        h('li', {}, chip(table, d.line), h('span', {}, d.date === today ? d.time : `${day(d.date)} ${d.time}`), h('small', {}, `→ ${d.headsign}`)))));
    }

    parts.push(walkStepper(settings, () => { save(); render(); }), footer(table, status, platform));
    // Redrawing replaces the buttons: keep the keyboard where it was.
    const focused = globalThis.document?.activeElement?.getAttribute('aria-label');
    root.replaceChildren(...parts.filter((x): x is Node => !!x));
    if (focused) root.querySelector?.<HTMLElement>(`[aria-label="${focused}"]`)?.focus();
  }

  render();
  // Redraw only when what is on screen could have changed, so taps are not lost.
  let last = Math.floor(Date.now() / 60_000);
  const timer = setInterval(() => {
    const minute = Math.floor(Date.now() / 60_000);
    if (minute !== last) { last = minute; render(); }
  }, 1000);

  return { root, mounted() {}, destroy: () => clearInterval(timer) };
}
