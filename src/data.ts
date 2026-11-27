// Network first, the phone's own copy when offline.
import type { Geo, Status, Timetable } from './types';

const url = (path: string) => `${import.meta.env.BASE_URL}data/${path}`;

export function remember(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or full storage: the app still works while online.
  }
}

export function recall<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

async function load<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(url(path), { cache: 'no-cache', signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(String(res.status));
    const value = (await res.json()) as T;
    remember(`data:${path}`, value);
    return value;
  } catch {
    return recall<T>(`data:${path}`);
  }
}

export const loadTimetable = () => load<Timetable>('timetable.json');
export const loadStatus = () => load<Status>('status.json');
export const loadGeo = () => load<Geo>('geo.json');
export const loadLinePath = (line: string) => load<GeoJSON.FeatureCollection>(`lines/${line}.geojson`);
