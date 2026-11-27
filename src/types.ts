export interface StopEntry {
  stop: string;
  /** Day numbers ("12345", "6") to departure times; null where nobody boards. */
  days: Record<string, string[]> | null;
  validFrom?: string | null;
  source?: string;
  /** The city's tables for this stop and its neighbour contradict each other. */
  suspect?: boolean;
}

export interface Direction {
  id: string;
  headsign: string;
  stops: StopEntry[];
}

export interface Line {
  id: string;
  operator?: string;
  color: string;
  textColor: string;
  directions: Direction[];
}

export interface Timetable {
  schema: 1;
  source: { name: string; url: string };
  obtainedAt: string;
  verifiedAgainstSite: string;
  /** Stamp of the verification, repeated in status.json. */
  verifiedAt?: string;
  validUntil: string;
  processing: string;
  stops: Record<string, { name: string }>;
  lines: Line[];
}

export interface Geo {
  attribution: string;
  stops: Record<string, [number, number]>;
}

export type LineState = 'ok' | 'changed' | 'unknown';

export interface Status {
  verifiedAt?: string;
  /** Last time every page of the line was read and compared. */
  lines: Record<string, { state: LineState; lastCompared: string | null; since?: string }>;
}
