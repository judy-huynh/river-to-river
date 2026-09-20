# Bake scripts

Every dataset on River to River enters `plan/data.js` through a script in this folder. A bake
script fetches, clips, projects, stations, keeps each record's own coordinates, and can be re-run.
Python 3, standard library only. The method is written down in `METHODOLOGY.md`.

## Run

From the repo root:

    python3 scripts/bake/sidewalk.py --check    # re-derive and compare, writes nothing
    python3 scripts/bake/sidewalk.py            # re-derive and write window.SIDEWALK

    python3 scripts/bake/owner_case.py --check  # owner names already re-cased, writes nothing
    python3 scripts/bake/owner_case.py          # re-case the owner names in window.LOTS_POLY

    python3 scripts/bake/lot_rule.py --check    # the lot rule already applied, writes nothing
    python3 scripts/bake/lot_rule.py            # frontage test over source/lots_pool.geojson into window.LOTS_POLY, window.LOTS_OUT, window.LOTS_META

    python3 scripts/bake/aves.py --check        # where the cross streets meet the centreline, writes nothing
    python3 scripts/bake/aves.py                # re-derive and write window.AVES

    python3 scripts/bake/benches.py --check     # DOT benches on 42 Street, writes nothing
    python3 scripts/bake/benches.py             # re-derive and write window.BENCHES

    python3 scripts/bake/ped_count.py --check   # the one DOT pedestrian counter, writes nothing
    python3 scripts/bake/ped_count.py           # re-derive and write window.PED_COUNT

    python3 scripts/bake/ped_tier.py --check    # DOT pedestrian priority tier by segment, writes nothing
    python3 scripts/bake/ped_tier.py            # re-derive and write window.PED_TIER, window.PED_TIER_META

    python3 scripts/bake/curb.py --check        # ParkNYC metered block faces on 42 Street, writes nothing
    python3 scripts/bake/curb.py                # re-derive and write window.CURB

    python3 scripts/bake/sheds.py --check       # shed permits as of the baked day, writes nothing
    python3 scripts/bake/sheds.py               # as of today, into window.SHEDS, window.SHEDS_META

    python3 scripts/bake/crashes.py --check     # crashes up to the baked last day, writes nothing
    python3 scripts/bake/crashes.py             # re-derive and write window.CRASHES, window.CRASH_META

    python3 scripts/bake/bus.py --check         # M42 weekday speeds for the baked month and every month before it, writes nothing
    python3 scripts/bake/bus.py                 # the newest whole month into window.BUS, window.BUS_META, and the month by month record into window.BUS_HIST
    python3 scripts/bake/bus.py --month 2026-07 # a named month

    python3 scripts/bake/field_stations.py --check  # the six count stations in field/index.html, writes nothing
    python3 scripts/bake/field_stations.py          # re-derive from plan/data.js and write them into the page

`--check` exits 0 when the re-derived set equals what is baked, 1 when it differs. The shed permits
and the crashes come from sources that change daily, so their check re-derives the set as of the
baked day: a difference there means the source has moved and the set wants re-baking. `lot_rule.py` reads no network source: its pool is the snapshot `source/lots_pool.geojson`,
the 130 MapPLUTO lots baked before any rule was applied. Large sources
download once to a `river-to-river` folder in the system temp directory (on macOS that is under
`/var/folders`, not `/tmp`), never into the repo. Set `R2R_CACHE` to use another folder, for
example one that already holds the file: `R2R_CACHE=/tmp/claude-501 python3 scripts/bake/sidewalk.py --check`.
A download is written to a `.part` name and renamed when complete, so a killed run is fetched
again cleanly. Delete the cached file to force a fresh fetch. Each source URL
is pinned to a commit, and a run prints the file's byte size and sha256.

## station.py

| Call | Returns |
|---|---|
| `load_line(name='LINE42')` | A `Line` built from `window.<name>` in `plan/data.js` |
| `project(lon, lat)` | `(station_ft, side, offset_ft)`. True perpendicular projection onto the nearest centreline segment. `side` is +1 north, -1 south. A point past either end stations at the end |
| `band(coords)` | `(a_ft, b_ft)` for a line, both endpoints projected, low station first |
| `heading_at(ft)` | Compass bearing of the centreline at a station, west to east |
| `Line.bearing(p, q)` | Compass bearing between two `[lon, lat]` points in the same local feet |
| `axis_diff(a, b)` | Angle between two bearings as undirected axes, 0 to 90 |
| `read_global(name)` | The parsed value of one `window.<name>=` line |
| `write_global(name, value, comment=None)` | Replaces that line in place or appends it. Returns `replaced`, `appended` or `unchanged` |
| `on_42(name)` | True when a source's street name field reads East or West 42 Street. The one street rule for point sets |
| `stamp(name, day)` | Records a source's last-updated date under `window.SOURCE_DATE` |

The module-level `project`, `band` and `heading_at` use `LINE42`. To station against another
centreline, build a `Line` and call the same methods on it.

Stations are interpolated between the stations already baked on the centreline vertices, so a
record always agrees with `LINE42` as the page reads it. Stations are returned unrounded. The bake
script rounds.

`opendata.py` reads a Socrata portal: `rows(domain, id, where, select=None)` returns the matching rows
(`select` names the columns, for a source too wide to read whole) and
prints their count, size and sha256, `updated(domain, id)` returns the date the publisher last
changed them (a fetch that times out is tried again, three times in all), `grouped(domain, id, by)` returns row counts grouped by the named columns. Small sets are fetched fresh on every run, not cached.

## Rules for `write_global`

- Each global is one line, `window.NAME=<json>;`. The writer depends on that.
- Without `comment`, the block above the global is left exactly as it is.
- With `comment`, the `/* */` block sitting directly above the global is replaced. The first
  comment in `data.js` describes four globals at once, so do not pass `comment` when writing `LINE42`.
- Values are written with `json.dumps`, which drops trailing zeros. The hand-baked `LINE42` has
  some (`40.76170`), so the first time it is re-based the diff also shows those vertices losing a
  zero. The values are the same. The other globals round-trip byte for byte.
- The file is written to a temporary name and swapped in, so a failed bake leaves `data.js` whole.

## Adding a dataset

1. Copy the shape of `sidewalk.py`: `fetch()`, `bake(features, line)`, `main()` with `--check`.
2. Keep each record's own lon/lat so the set can be re-stationed when the centreline changes.
3. Print every count the method quotes, so the figure in `METHODOLOGY.md` comes from a run.
4. Update `METHODOLOGY.md` in the same commit.

## Proof

`sidewalk.py` was written after `window.SIDEWALK` was already baked, and first reproduced that set
record for record. The method then changed on purpose (`METHODOLOGY.md` section 3 states the old
and new counts), and the baked set is the script's own output. `--check` re-derives it and
compares on every run.
