import { h } from './dom';
import type { Timetable } from './types';

export interface Settings {
  stop: string | null;
  line: string | null;
  walk: number;
}

export function chip(table: Timetable, id: string) {
  const line = table.lines.find((l) => l.id === id)!;
  return h('span', { class: 'chip', style: `background:${line.color};color:${line.textColor}` }, id);
}

export function walkStepper(settings: Settings, save: () => void) {
  const value = h('b', { 'aria-live': 'polite' }, `${settings.walk} min`);
  const step = (delta: number) => () => {
    settings.walk = Math.min(60, Math.max(0, settings.walk + delta));
    value.textContent = `${settings.walk} min`;
    save();
  };
  return h('div', { class: 'walk' },
    h('span', {}, 'Dojście na przystanek'),
    h('span', { class: 'stepper' },
      h('button', { type: 'button', 'aria-label': 'minuta mniej', onclick: step(-1) }, '−'),
      value,
      h('button', { type: 'button', 'aria-label': 'minuta więcej', onclick: step(1) }, '+')));
}

const dayName = new Intl.DateTimeFormat('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
export const day = (date: string) => dayName.format(new Date(`${date}T12:00:00Z`));
export const shortDate = (iso: string) => iso.slice(0, 10).split('-').reverse().join('.');
