# TODOS

## Data and status

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

### Never leave an outdated built path published

**What:** When no path can be drawn for a line that had one, write an empty collection; require an exact match of the stops (a suffix for the D4 detour); name `scripts/osm.mjs` and `scripts/route.mjs` in the line alert.
**Why:** After a D5E change the old road would stay on the map while the script says it was not drawn; an extended line keeps its shorter path.
**Context:** `scripts/osm.mjs`, `src/data.ts` (a 404 falls back to the saved copy), `scripts/check.mjs`. Second review round of the map fixes, 27.11.2026.
**Effort:** S
**Priority:** P1

### Compare the other pages when one fails to download

**What:** Treat a failed download like a page without a timetable; cover `check.mjs` passing the published pages, and the old-cache refresh.
**Why:** One 404 or timeout hides new times on the line's other pages until the 48-hour warning.
**Context:** `scripts/lib/collect.mjs`, `test/pipeline.test.ts`. Second review round, 27.11.2026.
**Effort:** S
**Priority:** P2

### Say why an alert issue was closed

**What:** Close a line issue only when its state is "ok"; word the renewal issue's closing comment separately.
**Why:** Every closed issue says the town's site matches again, also when nothing was compared.
**Context:** `scripts/alert.mjs`. Final review, 27.11.2026.
**Effort:** S
**Priority:** P3

### Publishing re-runs

**What:** Decide whether re-running only the failed jobs of an old run may publish; load the test steps from the published commit.
**Why:** Such a re-run can put an older version back until the next scheduled run.
**Context:** `.github/workflows/pages.yml`. Review of the publishing fix, 27.11.2026.
**Effort:** S
**Priority:** P3

### Bound the map helper's retries

**What:** Split the map box only a limited number of times, and fail on a missing relation.
**Why:** Any HTTP 400 is treated as "too many nodes" and retried with ever more requests.
**Context:** `scripts/osm.mjs`, run by hand. Final review, 27.11.2026.
**Effort:** S
**Priority:** P3

## Tests

### Cover the screens and the refusals that have no tests

**What:** Tests for the stop picker, the show-saved-copy-then-refresh path and `build-data`'s refusals; shorten the slow "city unreachable" test.
**Why:** A regression there would not fail the build.
**Context:** `src/picker.ts`, `src/main.ts`, `scripts/build-data.mjs`, `test/pipeline.test.ts`.
**Effort:** M
**Priority:** P2

## App

### Footer must not show a comparison date from another version

**What:** Pass the version-matched status to the footer.
**Why:** The footer can contradict the warning above it.
**Context:** `src/board.ts`, `scripts/lib/status.mjs`.
**Effort:** S
**Priority:** P2

### County lines 7P-12P and a GTFS feed

**What:** Add the county's free lines; publish GTFS once positions and day rules are complete.
**Why:** The owner chose to ship the D lines first.
**Context:** `docs/designs/time-to-leave.md`.
**Effort:** L
**Priority:** P3

### Small things seen on the live site

**What:** Do not request the D5E path that does not exist; put "Trasa D5E nie jest jeszcze narysowana" next to the map; name the line beside each validity date in the footer.
**Why:** A failed request on every map draw; the note sits below the whole stop list; four dates without line names mean nothing to a rider.
**Context:** `src/map.ts`, `src/picker.ts`, `src/board.ts`. First-use check, 27.11.2026.
**Effort:** S
**Priority:** P3

### Redraw the board when a bus stops being reachable

**What:** Redraw at the moment the walking deadline passes, not only when the minute changes.
**Why:** A board drawn exactly at the deadline offers an unreachable bus for up to a minute.
**Context:** the timer in `src/board.ts`. Codex review on GitHub, 27.11.2026.
**Effort:** S
**Priority:** P3

## Positions

### The eleven stops without a map point

**What:** Add them to OpenStreetMap, or confirm their positions.
**Why:** They are only in the list: eleven of 108.
**Context:** reasons in `public/data/geo.json`; `scripts/lib/place.mjs`. 27.11.2026.
**Effort:** S
**Priority:** P3

## Completed

### Four fixes from the reviews, and the map as the owner saw it (27.11.2026)

A maintenance page no longer marks a line "changed"; a direction with an unreadable heading is never dropped; search matches while "Osiedle" is typed; the renewal asks for every public holiday and a validity date on every page; 97 of 108 stops are on the map; D5E and the D4 detour are drawn; the computer view has a large map; the renewal reminder names `src/calendar.json`.
