# Data and methodology

High level record of where every number on River to River comes from and what was done to it.
Updated whenever a dataset is added or a spatial step changes. Last updated 19 Sep 2026.

The rule the project holds itself to: every published number traces to a public source, the
spatial steps that produced it are written down here, and anything that cannot be reproduced
from this repo does not ship.

## 1. The one idea everything rests on: station the street

Every dataset is reduced to one question: **how many feet along 42nd Street is this?**

1. **Centreline.** The 42nd Street centreline is pulled once from OpenStreetMap (Overpass) and
   baked into `plan/data.js` as `LINE42`, a list of `[station_ft, lon, lat]` vertices.
   Currently 12th Avenue to 1st Avenue, 59 vertices, 10,411 ft (1.97 mi). An early version
   interpolated between guessed avenue coordinates and drifted up to 150 m, a whole block, so the
   centreline is always snapped to OSM, never estimated.
2. **Projection.** A point is stationed by true perpendicular projection onto the nearest
   centreline segment, in a local flat approximation (feet per degree, longitude scaled by the
   cosine of the mean latitude). Nearest-vertex snapping is not used: with only 59 vertices it
   collapses short features to zero length.
3. **Side of street.** North or south comes from the sign of the cross product between the
   centreline direction and the vector to the feature.
4. **Lines and polygons.** A line is stationed by projecting both endpoints, giving a from/to band
   in feet. A lot is stationed by its centroid.
5. **Keep the coordinates.** Every baked record keeps its own lon/lat next to its station, so the
   whole dataset can be re-stationed against a new centreline in one script run. This matters
   because the extent is moving from 12th-to-1st to pier to pier.

Nothing is loaded live. All data is clipped, stationed and baked into `plan/data.js` so the page
depends on Mapbox for the basemap and on nothing else.

## 2. What is on the sheet today

| Global in `plan/data.js` | Source | What was done to it |
|---|---|---|
| `LINE42` | OpenStreetMap via Overpass | Snapped centreline, stationed in feet |
| `LOTS_POLY` | NYC MapPLUTO (Dept of City Planning) | Tax lots near the centreline with owner, zoning, floor area built and allowed. **Under revision, see section 4** |
| `TREES` | NYC Parks Forestry Tree Points | 281 street trees, stationed, with species, trunk diameter, condition |
| `ROAD` | NYC CSCL street centerline (DoITT/OTI) | 26 segments with roadway width, moving lanes, parking lanes |
| `SIDEWALK` | Sidewalk Widths NYC (Meli Harvey), derived from the NYC planimetric sidewalk polygons `vfx9-tbb6` | See section 3 |
| `BENCHES` | NYC DOT Seating Locations `esmy-s8q5` | 2 benches recorded on 42 Street, stationed. See section 3b |
| `PED_COUNT` | NYC DOT Bi-Annual Pedestrian Counts `cqsj-cfgu` | The one count location on the street with its whole series, stationed. See section 3b |
| `BUS`, `BUS_META` | MTA Bus Route Segment Speeds `kufs-yh3x` (data.ny.gov) | M42 weekday speed by leg, hour and direction for one month, each leg a from/to band. See section 3c |
| `SOURCE_DATE` | The open data portal's own metadata | The date each publisher last changed its rows, read at bake time |

Derived figures computed in the page, not typed:

- **Unbuilt floor area** per lot = lot area x allowed FAR, minus built floor area.
- **Tree gaps** = any run of more than 400 ft along the centreline with no tree on either side.
  Both sidewalks are merged, so a block with trees on one side only reads as having trees.
  Known limitation.
- **The figure on each shut rail row** is computed when the page loads, from the same globals:
  - *How many people are here?* The weekday 4 to 7pm total of the newest period that has one
    (`PED_LAST` in `plan/station.js`, the same record the station card reads), with the period
    beside it. The small line under it is that PM series against time from a zero baseline. The
    counts are twice a year, so two consecutive periods more than `PED_GAP_MONTHS` (12) apart
    are a hole in the series. The small line stops at a hole and starts again after it, and
    also stops at any period with no PM figure, so nothing is drawn across time that was not
    counted. The open row draws the series as bars to one scale and leaves a hatched blank at
    the same hole.
  - *Where can you stop?* The number of records in `BENCHES`. "None west of" and "none east of"
    are the avenues flanking the westmost and eastmost bench. The stretches with no DOT bench are
    the differences between consecutive bench stations, with both ends of the street included.
  - *How fast does the bus move?* The street average at the chosen hour: miles run over hours
    taken across every kept leg in both directions, weighted by buses measured (section 3c). The
    slowest leg is the lowest single leg speed at that hour.
  - *Who gets the ground?* The length-weighted average roadway width against the median sidewalk
    width of section 3.
  - *What could be built?* The count of drawn lots whose unbuilt floor area is above zero, out of
    all drawn lots, and the count that are landmarked. It is a count and not a floor area total
    on purpose: the drawn lot set is under revision (section 4), and a total summed over it would
    not match the total section 4 states.
  - *Street trees.* The number of records in `TREES` and the number of tree gaps as defined above. Where
    the open row names a gap, each end is named by the avenue whose station is nearest to it.
  A row appears only when its global is baked and non-empty.
- **Roadway statistics** are length-weighted over the CSCL segments. The segments cover 9,451 ft
  of the 10,411 ft street; the missing stretch is one contiguous block and is not interpolated.

## 3. Spatial analysis: sidewalk width (added 19 Sep 2026)

New York publishes no sidewalk width dataset. The substitute is Meli Harvey's medial-axis
derivation (`github.com/meliharvey/sidewalkwidths-nyc`), which measures across the city's own
planimetric sidewalk polygons. The data file was last changed upstream on 20 April 2020 (commit
`47fbf73`, the only commit in its history), so the widths describe the planimetrics as they stood
then or earlier, not the street today. The bake reads the file at upstream commit `86fab1e`
(29 May 2024), not at the moving `master` branch. That commit is only the pin: it did not touch
the data. Every run prints the file's byte size and sha256.

1. **Clip** to a 55 ft buffer around `LINE42`, tested at each segment's midpoint. Returns 191
   segments.
2. **Bearing filter.** Keep only segments whose bearing is within 30 degrees of the local
   centreline heading (modulo 180), read at the segment's from-station. This step is
   load-bearing: the naive buffer is nearly half avenue sidewalk running north-south. 84 segments
   dropped, **107 survive**. One survivor is sensitive to where the heading is read: the
   segment stationed 901 to 907, at the station 903 bend, passes at its from-station and would
   fail at its midpoint (28.5 degrees against 31.6). The bake prints any such segment.
3. **Station and side** each survivor as in section 1. Stations are in the feet baked on the
   `LINE42` vertices; offsets are in local flat feet. Over the 10,411 ft baked length the library's
   flat feet come to 0.17 percent shorter and an independent WGS84 ellipsoid scale to 0.22 percent
   longer. The bake prints both.
4. **Coverage** is computed per side by merging overlapping bands: 83% of the north side, 85% of
   the south. The page states this.

Results: median 19.1 ft, maximum 34.3 ft, **minimum 5.6 ft (south side, station 1,455, between
11th and 10th Avenue)**.

Known weakness, kept so the set reproduces exactly: 6 of the 107 survivors are zero-length after
rounding (from-station equals to-station). Four are source fragments under a foot long lying just
past the west end of `LINE42`, which station at 0; the other two sit at stations 6,499 and 7,953.
A bearing taken on a fragment that short is noise, so the filter does not mean much for them, and
each counts as one segment in the unweighted median. The bake prints this count and the
stations. Dropping them, and reading the heading at the midpoint like the clip does, would change
the 107 and is left as a separate, documented data change.

Reproduce with `python3 scripts/bake/sidewalk.py --check`, which re-derives the set from the
source file and compares it with what is baked. The stationing library every bake script shares is
`scripts/bake/station.py`; see `scripts/bake/README.md`.

Two cautions that are printed on the sheet:

- The widely quoted 3.7 ft "narrowest point" is a cross-street segment that the bearing filter
  removes. It is not on 42nd Street.
- This is **gross concrete**. Sheds, stairs, newsstands and kiosks are not deducted, so every
  figure is an upper bound on walkable width, never a clear width.

## 3a. Spatial step: the station card (added 19 Sep 2026)

No new dataset. The card reads the five baked globals (since joined by the two in section 3b) at
one station, through one pure function, `stationProfile(ft)` in `plan/station.js`. That file has
no DOM in it, so it loads in node, and
`node scripts/check/station.js` re-runs the known-good check at 4,000 ft. A station comes from a
press on the ruler, the arrow keys, the `?st=` link, or a click on the map. A map click is
stationed by the same perpendicular projection as section 1, ported to the page from
`scripts/bake/station.py` with the same constants, and rounded to the whole foot. A click that
lands on no lot and lies farther from the centreline than the deepest lot drawn reaches is
ignored: it is off the sheet, not a place on the street.

1. **Sidewalk and roadway at a station** are the baked band that contains it, per side. Bands that
   share an endpoint resolve to the one continuing east. Zero-length fragments (section 3) are
   never used. Where no band contains the station the value is left empty and the card says it is
   not measured; nothing is interpolated or carried over from a neighbour.
2. **The cross-section bar** is drawn to scale from those widths. A part with no measurement is
   drawn as a hatched blank of fixed size, and the caption then says only the measured parts are
   to scale. Where no part is measured the whole bar is hatched and the caption says so.
3. **Lots either side** are the lots that face the reader at that station. Every vertex of each
   lot's outer boundary is projected onto `LINE42`, giving the boundary as station and offset
   pairs. A perpendicular is raised at the station; for each lot on a side, the offset at which
   its boundary first crosses that perpendicular is interpolated along the crossing edge. The lot
   with the nearest crossing fronts the street there. Any other lot crossing within 15 ft of it
   (`FRONT_TOL`, to absorb a jog in the building line) is listed with it. A lot standing behind
   another, or the rear arm of an L-shaped lot, is not listed. Side is the baked side. This is
   computed in the page from the lot's own coordinates, so it re-bases with the centreline.
   Consequence, stated: four lots in the current 130 are never listed at any station because
   another lot always stands between them and the street (500 West 43 Street, 574 and 576
   9 Avenue, and the lot recorded only as "1 Avenue"). They still open from the map. Two flags
   are read off each record so the list cannot be misread: a lot whose address does not name
   42nd Street is marked as such (a corner lot addressed on its avenue still fronts the street),
   and a landmarked lot (`lm`) is marked beside its unbuilt floor area, which section 4 says it
   may never be able to use.
4. **Trees nearby** are the trees whose station is within 200 ft of the card's, both sides,
   measured along the street, not as a radius.
5. **Caveats travel with the figures.** The card prints the gross-concrete caution and the
   sidewalk source date from section 3, the unbuilt floor area formula from section 2 and the
   special-district and landmark caution from section 4, with a link to this file, whichever
   layers are switched on. The MapPLUTO, CSCL and Tree Points release dates are not recorded in
   `data.js`, so the card names those sources without a date. Recording them belongs to the
   bake of each set.

## 3b. Benches and the pedestrian counter (added 19 Sep 2026)

Two small sets, each through its own bake script, both read from NYC Open Data through
`scripts/bake/opendata.py`. They are fetched fresh on every run, not cached, and each run prints
the row count, byte size and sha256 of what it read and the date the publisher last changed the
rows. That date is baked into `SOURCE_DATE` so the page can print it.

**Benches** (`scripts/bake/benches.py`, `window.BENCHES`). NYC DOT Seating Locations, one point
per bench, rows last updated 8 Sep 2026.

1. **Select** by the street the source records the bench on: `on_street` is East or West 42
   Street, in Manhattan (`on_42` in `scripts/bake/station.py`, shared with the counter). The same
   kind of rule as the lots. Of 747 Manhattan benches, **2** pass. A row with no point cannot be
   stationed: the run prints how many there are (0) and stops if one of them is on 42 Street.
2. **Station and side** each by perpendicular projection as in section 1, keeping the bench's own
   lon/lat. They stand at stations 5,616 (6th to 5th Avenue) and 6,625 (5th to Madison), both
   on the south side, 37 and 40 ft off the centreline. The computed side agrees with the
   source's own `side_of_st` for both. Installed 4 May 2025 and 20 May 2025. No bench stands
   west of station 5,616, so none west of 6th Avenue (station 5,480).
3. **Cross-check**, printed on every run: any DOT bench within 100 ft of the centreline that the
   street rule left out. There are 0. The nearest other bench is on 3rd Avenue, 143 ft off.

The set holds only benches in this DOT programme. Seating in Bryant Park, in plazas, or put out
by a building or a business improvement district is not in it. So the card labels the row
"Nearest DOT bench", and the note under the figures says what the source leaves out. The distance
is to the nearest DOT bench, not to the nearest place to sit.

**Pedestrian counter** (`scripts/bake/ped_count.py`, `window.PED_COUNT`). NYC DOT Bi-Annual
Pedestrian Counts, rows last updated 21 Jul 2026. One row per location, one column per period and
time window.

1. **Select** locations whose `street_nam` is East or West 42 Street in Manhattan. Of 36
   Manhattan locations, **1** passes: location 42, East 42 Street from Park Avenue to Lexington
   Avenue. The bake stops with an error if that is ever not exactly one.
2. **Station** its point: station 7,796, on the centreline (0 ft off), so it has no side. The
   publisher describes the method as a screenline at mid-block covering both sidewalks.
3. **Read the series.** The publisher's column names are not regular (`may_07_pm`, `may_22_p_m`,
   `oct24_am`, `june_24_md`), so they are parsed by pattern into year-month periods with AM, MD
   and PM values, and the bake stops if a dated column is not understood. 37 periods, May 2007 to
   May 2026, all with three values. There is no period between May 2019 and October 2020. The
   latest, May 2026, is AM 7,285, MD 6,138, PM 16,297. The source writes a count it did not
   collect as 0, so a 0 is baked as null. This location has none.
4. **The windows.** Each figure is a total over a window of hours, not a peak hour and not a day.
   The hours are not in the rows. They are in the publisher's readme
   (`nyc.gov/html/dot/downloads/pdf/bi-annual-ped-count-readme.pdf`, read 19 Sep 2026): counts
   are taken on one weekday and an adjacent Saturday, 7 to 9am and 4 to 7pm on the weekday, 12 to
   2pm on the Saturday. So AM and PM are the same weekday, MD is a different day, and a period is
   two single count days, not an average. One day's weather or an event moves it. The hours are
   stated once, as `WINDOWS` in `ped_count.py`, baked into `PED_COUNT.windows`, and the page
   prints the window from there.

**On the station card.** `stationProfile` adds two things. The nearest bench: the bench with the
smallest difference in station, either side, with the distance measured along the street and
not as a radius, its side, the avenues either side of it, and its install date. The counter: when
the station is within 300 ft of it along the street (`COUNT_REACH`) and on the counter's own
block, the weekday 4 to 7pm figure of the latest period that has one, with the window, the
period and the distance to the counter. The reach is clipped at the avenues either side of the
counter (`COUNT_SPAN`), so with Park at 7,520 and Lexington at 8,021 the count shows from 7,520
to 8,021 and not on the next block. Elsewhere the card shows no count, because one counter does
not describe the rest of the street (section 6). Both are checked in
`node scripts/check/station.js`.

Reproduce with `python3 scripts/bake/benches.py --check` and
`python3 scripts/bake/ped_count.py --check`. A check compares the records; a newer source date
alone is reported but does not fail it.

## 3c. How fast the bus moves (added 19 Sep 2026)

`scripts/bake/bus.py`, `window.BUS` and `window.BUS_META`. MTA Bus Route Segment Speeds,
data.ny.gov `kufs-yh3x`, route M42, rows last updated 31 Aug 2026. The publisher has already
averaged the rows: one row per month, day of the week, hour, direction and leg between two
timepoints, with a road distance, a mean travel time and a count of buses.

1. **Month.** The newest month the source holds that ended before the day of the bake: July
   2026, 1,344 rows, of which 960 are Monday to Friday. `--month` bakes a named month, and
   `--check` re-derives the month that is baked and says when the source holds a newer one.
2. **Join on coordinates.** A leg is keyed by its direction and the coordinates of its two
   timepoints, never by stop names. The two directions do not share stops: the 8 Avenue timepoint is
   at station 3,625 eastbound and 3,421 westbound, and the next one is Broadway (4,939) eastbound
   and 7 Avenue (4,383) westbound. The bake stops if one pair of coordinates carries two names or two
   distances. There are 8 legs.
3. **Station** both timepoints by perpendicular projection as in section 1, giving each leg a
   from/to band, and keep the timepoints' own lon/lat in the direction of travel. The run prints
   every offset: the timepoints on the street stand 17 to 30 ft off the centreline.
4. **Drop the legs that leave the street.** A timepoint more than 60 ft off the centreline
   (`OFF_FT`) is not on 42nd Street. Two are: the 12 Avenue terminal (148 and 239 ft off) and
   E 41 St/1 Av (248 and 249 ft off). The terminal stations within 100 ft of the west end of
   `LINE42` (`END_FT`), so the bus joins the street at the end of the line and its leg still runs
   its whole band: kept. E 41 St/1 Av stations 202 to 274 ft short of the east end, on a parallel
   street, so the time that leg spends on 42nd cannot be separated from the loop by the UN: both
   legs that touch it are **dropped**, and listed with their coordinates in `BUS_META.dropped`.
   6 legs are kept. Eastbound they cover stations 0 to 7,602 and westbound 24 to 7,526. East of
   that the sheet is drawn blank and says so. Nothing is carried over from a neighbouring leg.
5. **One bar per leg.** The source knows nothing about speed inside a leg. Eastbound 12 Avenue to
   8 Avenue is one leg of 3,625 ft on the street (0.720 road miles, which includes the run on
   12 Avenue); westbound 8 Avenue to 12 Avenue is 3,397 ft. Each is drawn as one bar at that
   length, on the map and on the ruler, and is never interpolated or split.
6. **Weekday speed** for a leg and hour is the road distance over the mean travel time, the mean
   weighted by the buses measured on each of the five weekdays: 144 leg-hours, every one with all
   five weekdays and at least one bus. Slowest leg-hour 3.23 mph (westbound 7 Avenue to 8 Avenue,
   9 to 10pm), fastest 10.62 mph (westbound Park Avenue to 7 Avenue, 4 to 5am). `trips` is the
   publisher's bus count summed over the month's weekdays.
7. **The street average** at an hour is computed in the page: miles run over hours taken, across
   the six kept legs and both directions, so it is weighted by buses. It runs from 4.32 mph
   (5 to 6pm) to 8.71 mph (3 to 4am). Against a walking pace of 3.1 mph (5 km/h) it is below
   walking pace in **0 of 24 hours**; no single leg-hour is below it either. The page computes
   that count and prints it. The figure in section 5, 2.98 mph westbound Park to 7th at 5pm, was
   May 2026 Wednesdays alone; the July weekday figure for that leg and hour is 3.32 mph.

**On the sheet.** One hour-of-day slider (`SEL.hour`, link parameter `hr`) drives the map line, the
ruler bands, the row's collapsed line (the slowest leg at that hour) and the station card. It
opens on the street's slowest hour, which is computed. Colour uses the four existing capacity
ramp colours with one stop at each multiple of walking pace (3.1, 6.2, 9.3, 12.4 mph), blended
linearly between stops, the same way on the map and in the page. Eastbound is drawn on the south
side of the centreline and westbound on the north, offset for legibility, not to scale. On the
station card, `stationProfile(ft, hour)` returns per direction the leg whose band contains the
station, and where two legs meet the one the bus is entering; the card labels the figure as the
whole leg's. `node scripts/check/station.js` checks this.

Reproduce with `python3 scripts/bake/bus.py --check`.

## 4. The lot rule, and what is being corrected

The rule, settled 19 Sep 2026: **a lot is in the set if it is addressed on 42nd Street.** No
exceptions in either direction, including when it weakens a finding.

Known defects in the current data, being fixed in Phase 1:

- The 130-lot plan set includes ten lots addressed on 41st and 43rd Street. They come out.
- The 82-lot analysis set drops Grand Central Terminal (BBL 1012800001, 89 East 42nd Street) and
  three more lots because PLUTO spells the street "42Nd" and the address match was not
  normalised. They go in.
- With Grand Central included, "88% of unbuilt capacity sits outside the four hubs" becomes 55%,
  total unbuilt capacity moves from 3.4m to 5.4m sq ft, and the share surviving special-district
  and landmark checks moves from 10% to 6%.

Unbuilt capacity is a **screen, not a promise**: most lots sit in special districts where the base
FAR is not the governing rule, and landmarked lots carry floor area on paper that can never be used.

### 4a. Owner names (added 19 Sep 2026)

MapPLUTO publishes owner names in capitals. The first lot bake title-cased them word by word,
which produced "Nyc", "Llc", "42Nd" and "People'S". `scripts/bake/owner_case.py` repairs the
letters of the baked names and nothing else: a short list of whole words goes to capitals (NYC,
NY, NJ, LLC, LP, MTA, REIT, II, III, USA), ordinals and the possessive go to lower case, and
"of", "and", "the", "for", "at" go to lower case unless first. 78 of the 130 names changed; no
lot changed owner. The step is idempotent and `--check` confirms the baked set is already
re-cased. Truncated names are left as PLUTO has them. Against the current PLUTO release (26v2,
read 19 Sep 2026) three baked lots name a different owner and one BBL is absent; that is a
vintage difference for the Phase 1 lot bake to settle, not something this step touches.

## 5. Verified and ready to add

Each of these was fetched and checked against the corridor on 19 Sep 2026. IDs are NYC Open Data
or data.ny.gov resource IDs.

| Question it answers | Dataset | ID | What it holds on 42nd Street |
|---|---|---|---|
| How fast does the bus move | MTA Bus Route Segment Speeds, 2025+ (2023-24 baseline `58t6-89vi`) | `kufs-yh3x`, **baked, section 3c** | M42 by segment, hour and direction. May 2026 Wednesdays: about 4.1 mph from 11am to 6pm, 2.98 mph westbound Park to 7th at 5pm |
| How many people are here | NYC DOT Bi-Annual Pedestrian Counts | `cqsj-cfgu`, **baked, section 3b** | **One** location on the whole street (Park to Lexington, station 7,796), May 2007 to May 2026. May 2026 weekday 4 to 7pm total 16,297, one count day |
| | MTA Subway Hourly Ridership | `5wq4-mkjj` | Entries at the three 42nd Street complexes, by hour. Entries only |
| | NYC DOT Pedestrian Mobility Plan | `fwpa-qxaf` | A priority **tier**, not a count. All 34 de-duplicated segments rank in the top two tiers |
| Where can you stop | NYC DOT Seating Locations | `esmy-s8q5`, **baked, section 3b** | 2 benches, both installed May 2025, none west of 6th Avenue |
| | Street Seats `5ar6-qxhs`, Open Streets `uiay-nctu`, Dining Out NYC `fpeh-f7ci` | | 0, 0, and 0 roadway dining licences on the street |
| What is in the way | DOB NOW Approved Permits (legacy `ipu4-2q9a`) | `rbx6-tga4` | Sidewalk sheds with renewal chains datable to the day |
| | DOT Street Construction Permits | `tqtj-sjs8` | Active permits by block face. No geometry, joins by from/to street |
| Who gets hurt | NYPD Motor Vehicle Collisions, crashes and persons | `h9gi-nx95`, `f55k-p6yu` | 1,192 crashes and 631 injured within 75 ft of the centreline since Jan 2021 |
| | Vision Zero priority corridors and projects | `36nr-7fbp`, `if4c-w48d` | Whole street is a priority corridor. Last corridor project ended Dec 2019 |
| Who is the curb for | ParkNYC metered block faces, parking signs, bus lanes | `e7yp-wx55`, `nfid-uabd`, `ycrg-ses3` | 18 metered faces, all commercial only. 17,520 ft of bus lane |
| | MTA bus lane camera violations | `kh8p-hcbm` | 28,522 point-located M42 detections: where the bus gets blocked |

## 6. What the data cannot say, stated plainly

- **Pedestrian volume along the street does not exist.** The city counts at one point in 1.97
  miles. Everything else is a proxy. The gap is filled by original six-station counts, run in DOT's
  own AM / midday / PM windows and anchored to the city's counter so they scale against a
  published number.
- **"Pedestrians walk in the roadbed" cannot be shown from crash data.** Compared like for like,
  42nd Street is 27.0% against 24.0% citywide, not a significant difference. It needs direct
  observation: fixed-point photographs, one frame a minute.
- **No truck percentage exists** for 42nd Street in any machine-readable source. The claim is not made.
- **"Zero plazas" is false.** Times Square Plaza abuts the roadbed. The accurate statement is zero
  plazas addressed on 42nd Street.
- Injury counts have no denominator. The data says how many people were hurt, not how dangerous
  the street is per person walking it.

## 7. How the work is checked

Findings are produced by independent review passes and then handed to a second pass whose only job
is to refute them by re-running the numbers. Only what survives is kept. The 19 Sep 2026 code audit
and the dataset survey were both run this way; in several cases the refutation pass corrected the
original evidence, and the corrected figure is the one recorded here.
