# TODOS

## Data and status

### A maintenance page must not mark a line "changed" for good

**What:** Treat a page without a timetable block or stop list as "could not check".
**Why:** One CMS error served with HTTP 200 would warn riders of a change until someone re-publishes.
**Context:** `scripts/lib/collect.mjs` throws `Changed` for any unreadable page; the design says such a page means "could not check". Second review round, 27.11.2026.
**Effort:** S
**Priority:** P1

### Clear "changed" against the version it was detected on

**What:** Store which published version a difference was seen against; clear when a newer one is published.
**Why:** Re-reading the data before the scheduled check notices a change can leave a false warning.
**Context:** `scripts/lib/status.mjs` compares `verifiedAt` with the time of first detection.
**Effort:** S
**Priority:** P2

### Compare both parsers in the scheduled check, and refuse empty lines

**What:** Run the two-parser comparison in `check.mjs`; make `build-data` write nothing when a line has no departures.
**Why:** The check only requires the second parser not to throw; an emptied line would be published.
**Context:** `scripts/check.mjs`, `scripts/build-data.mjs`.
**Effort:** S
**Priority:** P2

## App

### Search must match while "Osiedle" is being typed

**What:** Match both spellings of "Os."/"Osiedle" for partial words.
**Why:** Typing "osied" finds nothing although "Osiedle Młodych" is on the list.
**Context:** `plain()` in `src/platforms.ts`.
**Effort:** S
**Priority:** P1

### Footer must not show a comparison date from another version

**What:** Pass the version-matched status to the footer; point the renewal reminder at `src/calendar.json`.
**Why:** The footer can contradict the warning above it; the reminder names the wrong file.
**Context:** `src/board.ts`, `scripts/lib/status.mjs`.
**Effort:** S
**Priority:** P2

### D5E path and the remaining stop positions

**What:** Draw D5E; verify the stops that have no map point.
**Why:** 48 of 108 stops are only in the list.
**Context:** `scripts/osm.mjs`; unverified reasons are in `public/data/geo.json`.
**Effort:** M
**Priority:** P2

### County lines 7P-12P and a GTFS feed

**What:** Add the county's free lines; publish GTFS once positions and day rules are complete.
**Why:** The owner chose to ship the D lines first.
**Context:** `docs/designs/time-to-leave.md`.
**Effort:** L
**Priority:** P3

## Completed
