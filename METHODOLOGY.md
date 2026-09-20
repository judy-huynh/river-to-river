# Data and methodology

High level record of where every number on River to River comes from and what was done to it.
Updated whenever a dataset is added or a spatial step changes. Last updated 20 Sep 2026.

The rule the project holds itself to: every published number traces to a public source, the
spatial steps that produced it are written down here, and anything that cannot be reproduced
from this repo does not ship.

## 1. The one idea everything rests on: station the street

Every dataset is reduced to one question: **how many feet along 42nd Street is this?**

1. **Centreline.** The 42nd Street centreline is pulled once from OpenStreetMap (Overpass) and
   baked into `plan/data.js` as `LINE42`, a list of `[station_ft, lon, lat]` vertices.
   59 vertices, 10,411 ft (1.97 mi). It starts 51 ft west of the middle of 12th Avenue and runs
   on 457 ft past the middle of 1st Avenue, to the FDR Drive (section 1a). An early version
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

## 1a. Where the avenues are (added 20 Sep 2026)

`scripts/bake/aves.py`, `window.AVES`. NYC Street Centerline (CSCL), NYC Open Data `inkn-q76z`,
rows last updated 19 Sep 2026. Until this bake the avenue stations were a table typed into
`plan/station.js`. It was wrong by up to 530 ft east of Lexington Avenue and by 170 ft at
8th Avenue, and every place name on the sheet was read off it. The table is gone.

1. **Read by place.** Every Manhattan centerline segment inside the street's padded bounding
   box, 953 segments.
2. **Find the ends on the street.** The source splits every street at every intersection, so a
   cross street's segments end on 42nd Street. An end is kept when it lies within **40 ft** of
   `LINE42` (`NEAR_FT`), the segment leaves it at more than **45 degrees** from the local
   heading (`CROSS_DEG`), the segment is a street, highway or bridge (`rw_type` 1, 2 or 3), and
   it is not itself named 42 Street. Paths, alleys and ramps are printed and left out.
3. **Group by the source's street name**, spelling made regular so it matches the names the
   curb and crash sources use. A street with no end at street level (the source's level code
   13) is printed and left out: the Park Avenue Viaduct and Tudor City Place, which pass over.
4. **Station** each end by perpendicular projection as in section 1 and keep its own lon/lat
   (`c`). `a` and `b` are the westmost and eastmost end, `ft` the middle of the two. An avenue
   with one roadway has one end and `a`, `ft` and `b` are equal. 12th Avenue has two (13 and
   89), Park Avenue three (7,435 to 7,517) and 1st Avenue six, with its tunnel (9,905 to 10,003).
5. **What it holds.** 18 cross streets. 14 carry a `label`, the avenues the ruler ticks: 12th
   51, 11th 949, 10th 1,846, 9th 2,744, 8th 3,643, 7th 4,541, 6th 5,435, 5th 6,456, Madison
   6,965, Park 7,476, Lexington 7,986, 3rd 8,493, 2nd 9,200, 1st 9,954. The other four are
   Dyer Avenue 2,332, Broadway 4,712, Vanderbilt Avenue 7,259 and De Pew Place 7,653. Which
   avenues are ticked is a list in the bake; the bake stops if one is not found. No station is
   typed anywhere.
6. **Checked against two other sources**, in `node scripts/check/station.js`, which fails
   otherwise: every metered face (section 3e) lies between the two cross streets its own source
   names, with no ticked avenue inside it, and every crash (section 3g) that names one of these
   streets is stationed within 25 ft of that street's crossing. The pedestrian tier segments
   (section 3d) also break at 2,746 and 7,988, 2 ft from 9th and Lexington Avenue.

**On the sheet.** The ruler ticks, the map's avenue labels, the four named stretches on the
ruler (each runs from one baked cross street to another) and every "between" on the page read
this set. A station inside an avenue's own crossing (`a` to `b`) is "at" that avenue. West of
12th Avenue and east of 1st Avenue a station has an avenue on one side only and the card says
so. Reproduce with `python3 scripts/bake/aves.py --check`.

Nothing is loaded live. All data is clipped, stationed and baked into `plan/data.js` so the page
depends on Mapbox for the basemap and on nothing else.

## 2. What is on the sheet today

| Global in `plan/data.js` | Source | What was done to it |
|---|---|---|
| `LINE42` | OpenStreetMap via Overpass | Snapped centreline, stationed in feet |
| `AVES` | NYC Street Centerline (CSCL) `inkn-q76z` | Where 18 cross streets meet the centreline, stationed; 14 are the avenues the ruler ticks. See section 1a |
| `LOTS_POLY` | NYC MapPLUTO (Dept of City Planning) | Tax lots near the centreline with owner, zoning, floor area built and allowed. **Under revision, see section 4** |
| `TREES` | NYC Parks Forestry Tree Points | 281 street trees, stationed, with species, trunk diameter, condition |
| `ROAD` | NYC CSCL street centerline (DoITT/OTI) | 26 segments with roadway width, moving lanes, parking lanes |
| `SIDEWALK` | Sidewalk Widths NYC (Meli Harvey), derived from the NYC planimetric sidewalk polygons `vfx9-tbb6` | See section 3 |
| `BENCHES` | NYC DOT Seating Locations `esmy-s8q5` | 2 benches recorded on 42 Street, stationed. See section 3b |
| `PED_COUNT` | NYC DOT Bi-Annual Pedestrian Counts `cqsj-cfgu` | The one count location on the street with its whole series, stationed. See section 3b |
| `BUS`, `BUS_META` | MTA Bus Route Segment Speeds `kufs-yh3x` (data.ny.gov) | M42 weekday speed by leg, hour and direction for one month, each leg a from/to band. See section 3c |
| `PED_TIER`, `PED_TIER_META` | NYC DOT Pedestrian Mobility Plan `fwpa-qxaf` | The plan's priority tier for each of 34 segments of the street, each a from/to band, and the plan's five tiers citywide. A rank, not a count. See section 3d |
| `CURB` | NYC DOT Parking Meters, ParkNYC Block Faces `e7yp-wx55` | 18 metered block faces, each a from/to band on its own side. See section 3e |
| `SHEDS`, `SHEDS_META` | DOB NOW: Build, Approved Permits `rbx6-tga4`, with DOB Permit Issuance `ipu4-2q9a` for history | One record per building whose newest sidewalk shed permit is not signed off, stationed, with the run of permits dated. A permit, not a sighting, and no shed length. See section 3f |
| `CRASHES`, `CRASH_META` | NYPD Motor Vehicle Collisions, Crashes `h9gi-nx95` | 1,192 police-reported crashes within 75 ft of the centreline since 1 Jan 2021, stationed, with people injured. A count, not a rate. See section 3g |
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
  - *What is in the way?* The number of `SHEDS` records whose state is in force, which is the
    number of buildings with a shed permit covering `SHEDS_META.asof`, with that day beside it
    and the earliest `since` among them (section 3f).
  - *Who gets hurt?* The sum of `inj` over `CRASHES`, with the number of crashes and the first
    and last day from `CRASH_META`. The row says on its shut line that it is a count and not a
    rate (section 3g).
  - *How fast does the bus move?* The street average at the chosen hour: miles run over hours
    taken across every kept leg in both directions, weighted by buses measured (section 3c). The
    slowest leg is the lowest single leg speed at that hour.
  - *Who gets the ground?* The length-weighted average roadway width against the median sidewalk
    width of section 3.
  - *Who is the curb for?* The number of `CURB` faces carrying the most common vehicle type, out
    of all faces, with that type in the source's words, and the share of the two curbs under a
    metered face: the merged length of the faces on each side over twice the street length
    (section 3e). The row words it as a share of the length of the two sides, not of the curb,
    because that length includes every avenue crossing and the stretch past 1st Avenue.
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
   west of station 5,616, so none west of 6th Avenue (station 5,435).
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
counter (`COUNT_SPAN`), so with the counter at 7,796, Park at 7,476 and Lexington at 7,986 (section 1a) the count
shows from 7,496 to 7,986 and not on the next block. Elsewhere the card shows no count, because one counter does
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

## 3d. The DOT pedestrian priority tier (added 19 Sep 2026)

`scripts/bake/ped_tier.py`, `window.PED_TIER` and `window.PED_TIER_META`. NYC DOT Pedestrian
Mobility Plan, NYC Open Data `fwpa-qxaf`, rows last updated 6 Mar 2026. One line per street
segment, with the tier the plan puts the segment in: 1 Global, 2 Regional, 3 Neighborhood,
4 Community, 5 Baseline. **A tier is a planning rank. It is not a count of people and the sheet
never calls it demand or volume.**

1. **Select** by the exact street name: `street` is East or West 42 Street, in Manhattan
   (`on_42`, the same rule as the benches and the counter). The run fetches loosely on purpose,
   every Manhattan row whose street contains "42 ST", and prints what the exact rule leaves
   out, so the trap stays visible: of 81 rows, 32 are West 142 Street. **49** rows are on 42nd
   Street.
2. **De-duplicate** on `segmentid`. The source repeats some segments: 49 rows hold **34**
   unique ids. The tell is the length. The 49 rows sum to 15,125 ft of `shape_leng` on a street
   10,411 ft long; the 34 unique segments sum to 10,342 ft. A repeated id is dropped only when
   every repeat has the same geometry, rank and tier, and the bake stops if one ever differs.
3. **Station** each segment as a from/to band: both ends by perpendicular projection as in
   section 1, low station first, keeping the two ends' own lon/lat (`c`, west end first) so the
   set can be re-based. Every segment is a single line; the bake stops on one with more than
   one part, because its ends would not be defined. The farthest end is 39 ft off the
   centreline, at the east end.
4. **Coverage**, printed on every run: the 34 bands run from station 54 to station 10,363 with
   no gap and no overlap between neighbours, 10,309 ft stationed. The first 54 ft and the last
   48 ft have no segment in the source and are drawn blank.
5. **What it holds.** Two tiers. Regional from 54 to 2,746, **Global from 2,746 to 7,988
   (5,242 ft unbroken, from 2 ft east of the middle of 9th Avenue to 2 ft east of the middle of Lexington Avenue)**, Regional from 7,988 to 10,363.
6. **The five tiers citywide** are read in the same run by a grouped query (`opendata.grouped`)
   and baked as `PED_TIER_META.tiers` with their source row counts: 851 Global, 4,487 Regional,
   22,769 Neighborhood, 34,195 Community, 64,975 Baseline. These are raw rows, repeats included.
   The page reads "tier 1 of 5" from this list, not from prose.

**On the ruler.** The ruler carries four bands, each with a caption and a bar on the street's own
scale, drawn whether or not any rail row is on: the priority tier (consecutive segments of one
tier merged into runs, ink at two strengths, captioned "DOT pedestrian priority tier"), the M42
speed at the hour the slider is on (section 3c, one bar per leg, westbound above eastbound, dashed
where no leg is kept), street trees with the stretches of over 400 ft with none, and the DOT
benches (solid) with the pedestrian counter (ring). The ruler's height is computed from the bands
drawn and from the label height measured in the reader's browser. Under 620 px the tree band is
left off: a narrow ruler shows fewer bands, never thinner ones. Window height does not change the bands. A caption's key is drawn long,
then short, whichever fits on one line. If neither fits, the short one wraps onto more lines and
the ruler grows, so a key is never dropped. The bus band is keyed by the two ends of the speed
ramp (the mph values are read from the ramp, multiples of the 3.1 mph walking pace), and its
caption says the speed is each leg's average, since the band is drawn with the bus row shut.

**The opening view.** The map opens turned to the street's bearing with the whole centreline
across its width, so the street sits over the ruler on the same scale direction. The zoom is
computed from the end to end distance of LINE42 and the map's width inside its side padding,
capped at the same maximum zoom as before. It is not a fit to the lon/lat bounding box: that box
is upright while the street is diagonal, so the box fit was limited by the map's height and the
street shrank on short windows. The view is computed again on load, on resize and when the first
screen opens or shuts, until the reader moves the map.

**On the station card.** `stationProfile` adds the tier of the segment that covers the station,
with its rank out of the number of tiers in `PED_TIER_META`, or says the source has none there.
This is how the band is read by tap and keyboard. Checked in `node scripts/check/station.js`.

Reproduce with `python3 scripts/bake/ped_tier.py --check`.

## 3e. Who the metered curb is for (added 20 Sep 2026)

`scripts/bake/curb.py`, `window.CURB`. NYC DOT Parking Meters, ParkNYC Block Faces, NYC Open Data
`e7yp-wx55`, rows last updated 1 Sep 2026 (the run prints the date and it is
baked into `SOURCE_DATE`). One line per metered side of a block, with the vehicle type
that may pay to stand there, the time limit, the hours the meter runs and the rate.

1. **Read by place.** The fetch is every face inside the street's own bounding box, padded, so
   the run can see faces the name rule leaves out. 506 faces.
2. **Select** by name: `on_street` is East or West 42 Street (`on_42`) and the borough is
   Manhattan. The source writes the borough in three cases (Manhattan, MANHATTAN, manhattan), so
   it is compared in capitals. **18** faces pass.
3. **Station** both ends by perpendicular projection as in section 1, low station first, keeping
   the two ends' own lon/lat (`c`, west end first). Side is the cross product, and the bake
   stops if a face has an end on each side, more than one part, or a vertex stationing past its
   own ends (a face that curled round a corner would). None does. The computed side agrees with
   the source's `side_of_st` for all 18, the faces lie 29 to 41 ft off the centreline, and each
   stationed length is within 7 ft of the source's own `shape_leng`.
4. **Cross-check**, printed on every run: any face not named 42 Street with both ends within
   60 ft of the centreline. There are 0.
5. **What it holds.** All 18 are `Commercial Only`. No face on the street is metered for all
   vehicles. 10 run Monday to Saturday 7pm to midnight, 5 run 7am to midnight, 2 run 10am to 2pm
   and 1 runs 7am to 7pm. 17 are 1 hour at $7.00 and one (south side, 10th to 11th Avenue) is
   3 hours on a rising rate. The faces cover 5,155 ft of the north curb (50%) and 6,219 ft of
   the south (60%), 55% of the two together.
6. **Cross streets** are the source's `from_stree` and `to_street` in the source's own order,
   which is not west to east and does not follow the way the line is drawn, so the page says
   "between" and never "from". Only the spelling is made regular (`11Avenue`, `Dyer Ave`,
   `3 Ave`); the run prints each change.

**What it cannot say.** A curb with no metered face is not free curb. Bus stops, no standing
zones, hydrants and every other posted rule are in the parking signs set (`nfid-uabd`), which is
not baked. The page says this beside the figure and on the station card. The hours are when the
meter runs, not the rule outside those hours.

**On the sheet.** Faces are drawn in ink at their own curb line. The open row lists every face
as a button that stands at its middle, which is how the map's hover is reached by tap and
keyboard. `stationProfile` returns the face under the station on each side, or none. Checked in
`node scripts/check/station.js`. Reproduce with `python3 scripts/bake/curb.py --check`.

## 3f. Sidewalk shed permits (added 20 Sep 2026)

`scripts/bake/sheds.py`, `window.SHEDS` and `window.SHEDS_META`. DOB NOW: Build, Approved
Permits, NYC Open Data `rbx6-tga4`, rows last updated 19 Sep 2026, work type Sidewalk Shed. DOB
Permit Issuance `ipu4-2q9a`, the older system (permit subtype SH), is read only to date how far
back a run of permits goes: its newest shed permit on the street was issued 18 Sep 2020 and none
is in force.

**A permit is a record that a shed was allowed at an address between two dates. It is not a
sighting of a shed. Neither source records the length of a shed or which frontage of a corner
building it covers, so the sheet gives no length of covered sidewalk and draws none.**

1. **Select** by the permit's street: East or West 42 Street in Manhattan (`on_42`). The fetch
   is loose on purpose and the run prints what the exact rule leaves out: 180 permits on West
   142 Street. **198** DOB NOW permits (144 signed off, 54 issued) and **660** older permits are
   on 42nd Street, naming 102 buildings, the first permit issued 17 May 1990. 8 older rows have
   no dates and are not used.
2. **One record per building**, keyed on DOB's building number (`bin`), as of one day,
   `SHEDS_META.asof` (20 Sep 2026). A permit issued after that day is ignored, so a later
   `--check` reads the same permits.
   - **In force**: a permit with status `Permit Issued` whose dates cover the day. **4 buildings**:
     215 West, 50 East, 122 East and 320 East 42 Street.
   - **Lapsed**: no permit in force, and the building's newest permit is still `Permit Issued`
     but has run out. **13 buildings**, running out between 10 Oct 2018 and 16 Sep 2026. The
     record does not say whether a shed still stands, and the page says so. It lists them apart
     from the four and does not count them in the figure.
   - A building whose newest permit is `Signed-off` is closed and is not in the set.
3. **The run of permits.** Working back from the newest permit, any permit at the same building,
   from either source and whatever its job number, joins the run when it ends no more than 30
   days (`GAP_DAYS`) before the run starts. `since` is the first day of the run and `n` the
   permits in it. The 30 days is a judgement: renewals are often issued some days after the last
   permit ran out. The run prints `since` at 0, 30 and 90 days for every building. It matters for
   three: 122 East 42 Street reads 15 Jan 2025, **22 Mar 2018** and 15 Nov 2017, 215 West 42
   Street reads 10 Oct 2024, **1 May 2018** and 1 May 2018, and 345 West 42 Street (lapsed) reads
   9 Sep 2022, 11 Sep 2018 and 28 Mar 2018. A run can join different jobs, which may be
   different sheds on different frontages. It is a run of permits, not the age of one shed.
4. **Station** the source's point for the building by perpendicular projection as in section 1,
   keeping its own lon/lat. The point sits on the street, 1 to 7 ft off the centreline for most
   buildings, on the building's side. That is too close for the cross product to be trusted
   alone, so the run checks the computed side against the house number (odd numbers stand on the
   north side): all 17 agree.
5. **Join to the lot.** Each record carries the source's `bbl`. All 17 match a drawn lot, and
   `node scripts/check/station.js` fails if one ever does not.

**On the sheet.** The building's lot is filled where a permit is in force and outlined where one
lapsed. No line is drawn along the sidewalk. The ruler marks each building with a permit in
force as a narrow bar at its station, narrow so that it clears the counter's ring beside it. The open row lists every building as a button, and the station
card tags a listed lot that has a permit. An earlier mock-up of this row showed 11 buildings;
that figure does not reproduce under any rule tried here and is not used.

`--check` re-derives the set as of the baked day. The source changes daily, and a permit signed
off or renewed since then shows as a difference, which is the cue to re-bake. Reproduce with
`python3 scripts/bake/sheds.py --check`.

## 3g. Who gets hurt (added 20 Sep 2026)

`scripts/bake/crashes.py`, `window.CRASHES` and `window.CRASH_META`. NYPD Motor Vehicle
Collisions, Crashes, NYC Open Data `h9gi-nx95`, rows last updated 15 Jun 2026. The newest crash
in the whole source is dated 11 Jun 2026, so the set stops there whatever day it is baked.

1. **Select** by date and distance: dated 1 Jan 2021 or later, and the police point within
   **75 ft** of `LINE42` (`NEAR_FT`) by perpendicular projection as in section 1. The fetch is
   the street's padded bounding box (10,750 crashes); the distance rule keeps **1,192**, 2 Jan
   2021 to 9 Jun 2026. A point past either end of the centreline stations at the end, so the rule
   is a 75 ft band with a rounded cap at each end.
2. **Keep** each crash's own lon/lat, its station, its distance off the centreline, the day, the
   source's counts and its collision id. Zero counts are left out of the record to keep the file
   small. `x` is the first street the source names that is not 42 Street, with the spelling made
   regular, so a place can be named from the source and not from a table in the page.
3. **What it holds.** **631 people injured** in 520 of the crashes, and 3 killed (1 cyclist, 2
   motorists). The source splits the injured into 180 pedestrians, 125 cyclists and 303
   motorists. That is 608. The other 23 are in the source's total and in none of its three
   columns, and the page lists them as that. By year: 195, 210, 250, 228, 207 crashes from 2021
   to 2025, and 102 in 2026 to 9 Jun.
4. **The police point is usually the nearest intersection, not the spot.** The 1,192 crashes sit
   on 209 distinct points. So the set includes crashes on an avenue inside one of the street's
   intersections, and 18 that the source names on the FDR Drive at the east end. 360 name no
   street but 42 Street.
5. **Not in the set**, printed on every run and baked into `CRASH_META.unlocated`: 12 crashes
   the source records on East or West 42 Street in Manhattan with no coordinates, 3 people
   injured. They cannot be stationed. The page states them beside the figure.

**What it cannot say.** It is a count of people hurt with **no denominator**: no source counts
the people walking, cycling or driving along the street, so there is no rate, and one corner
cannot be compared with another on risk. The shut row, the open row, the map tip and the station
card all say "a count, not a rate". The page makes no statement about where a person on foot was
when hit; see section 6.

**On the sheet.** Crashes whose stations are within 10 ft of each other (`CRASH_JOIN`, which
merges the two points the police use for some intersections) are one **place**, named by the
street its crashes name most often. Places are built once, in `plan/station.js` (`PLACES`), and
the map, the row and the card all read that list. Each place with anyone injured is one ink
circle, area in proportion to the people injured: 92 places. The open row lists the five with
most injured and then all 92, west to east, each a button that stands at the place's station.
`stationProfile` returns the one place nearest the station, if it is within 150 ft along the
street (`CRASH_REACH`), with that place's own crashes and injured. So the card at a place's
station gives the same figure as its circle, which is how a circle is read by tap and keyboard.
An earlier version summed every crash within 150 ft, which pulled in neighbouring places and
disagreed with the circle at 87 of the 92. The open row also says, from the data, how many of
the crashes the source names on the FDR Drive and how many people were injured in them, and
that crashes on an avenue inside an intersection are counted. Checked in
`node scripts/check/station.js`.

`--check` re-derives the set up to the baked last day. The police amend old reports, and an
amended report shows as a difference. Reproduce with `python3 scripts/bake/crashes.py --check`.

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
| | NYC DOT Pedestrian Mobility Plan | `fwpa-qxaf`, **baked, section 3d** | A priority **tier**, not a count. All 34 de-duplicated segments rank in the top two tiers |
| Where can you stop | NYC DOT Seating Locations | `esmy-s8q5`, **baked, section 3b** | 2 benches, both installed May 2025, none west of 6th Avenue |
| | Street Seats `5ar6-qxhs`, Open Streets `uiay-nctu`, Dining Out NYC `fpeh-f7ci` | | 0, 0, and 0 roadway dining licences on the street |
| What is in the way | DOB NOW Approved Permits (legacy `ipu4-2q9a`) | `rbx6-tga4`, **baked, section 3f** | Sidewalk sheds with renewal chains datable to the day |
| | DOT Street Construction Permits | `tqtj-sjs8` | Active permits by block face. No geometry, joins by from/to street |
| Who gets hurt | NYPD Motor Vehicle Collisions, crashes and persons | `h9gi-nx95` **baked, section 3g**, `f55k-p6yu` | 1,192 crashes and 631 injured within 75 ft of the centreline since Jan 2021 |
| | Vision Zero priority corridors and projects | `36nr-7fbp`, `if4c-w48d` | Whole street is a priority corridor. Last corridor project ended Dec 2019 |
| Who is the curb for | ParkNYC metered block faces, parking signs, bus lanes | `e7yp-wx55` **baked, section 3e**, `nfid-uabd`, `ycrg-ses3` | 18 metered faces, all commercial only. 17,520 ft of bus lane |
| | MTA bus lane camera violations | `kh8p-hcbm` | 28,522 point-located M42 detections: where the bus gets blocked |

## 6. What the data cannot say, stated plainly

- **Pedestrian volume along the street does not exist.** The city counts at one point in 1.97
  miles. Everything else is a proxy. The gap is filled by original six-station counts, run in DOT's
  own AM / midday / PM windows and anchored to the city's counter so they scale against a
  published number. The protocol is section 6a.
- **"Pedestrians walk in the roadbed" cannot be shown from crash data.** Compared like for like,
  42nd Street is 27.0% against 24.0% citywide, not a significant difference. It needs direct
  observation: fixed-point photographs, one frame a minute.
- **No truck percentage exists** for 42nd Street in any machine-readable source. The claim is not made.
- **"Zero plazas" is false.** Times Square Plaza abuts the roadbed. The accurate statement is zero
  plazas addressed on 42nd Street.
- Injury counts have no denominator. The data says how many people were hurt, not how dangerous
  the street is per person walking it.

## 6a. Method: the six-station pedestrian count (added 20 Sep 2026)

No counts have been taken yet. This section is the protocol, and `field/index.html` is the
instrument. Nothing on the sheet reads from it until counts exist and enter `plan/data.js` through
a bake script of their own.

**Stations.** Six, west to east. Five stand mid-block, as the city's counter does: half way between
the facing edges of two cross streets that are neighbours in `window.AVES` (section 1a). The fifth
in order is the city's counter itself, at the publisher's own point (section 3b). Each mid-block
station is a point on `LINE42` interpolated between its baked vertices; the bake projects it back
onto the line and stops if it does not return to the same station.

| Station | Between | station_ft | lon | lat |
|---|---|---|---|---|
| West end | 12 Avenue and 11 Avenue | 519 | -73.999673 | 40.761410 |
| 9 Avenue | Dyer Avenue and 9 Avenue | 2,538 | -73.993290 | 40.758705 |
| Times Square | 7 Avenue and Broadway | 4,627 | -73.986681 | 40.755924 |
| Bryant Park | Avenue of the Americas and 5 Avenue | 5,946 | -73.982508 | 40.754162 |
| City counter | Park Avenue and Lexington Avenue | 7,796 | -73.976655 | 40.751695 |
| East end | 2 Avenue and 1 Avenue | 9,553 | -73.971090 | 40.749358 |

`scripts/bake/field_stations.py` derives the stations from `plan/data.js` and writes them into the
page, because the page has to open with no network and so cannot load `plan/data.js`. The same run
writes the table above, which is never typed by hand. `--check` compares both the page and the
table with a fresh derivation. When the centreline is re-based the script is run again. A session
copies its station's name, `station_ft`, lon and lat at the moment it starts, so a re-bake moves
only the sessions taken after it, never one already saved on the phone.

**Windows.** One hour inside each of the city's three windows: 08:00 to 09:00 inside 07:00 to
09:00, 12:00 to 13:00 inside 12:00 to 14:00, 17:00 to 18:00 inside 16:00 to 19:00. The bake stops
if an hour falls outside its window. The city takes its AM and PM counts on a weekday and its
midday count on the adjacent Saturday (section 3b). The page states the city's day next to each
hour, and every export row carries its start time, so the day a count was taken is on the record.
When the phone clock is outside the chosen hour or on the other kind of day, the page says so
before the session starts. It does not stop the count.

**A session** is one station, one window, ten minutes, one observer. Three tallies are kept, one
tap per person:

- `sidewalk`: walking on the sidewalk, either direction, both sides
- `roadbed`: walking in the roadbed along the street, not crossing it at a crosswalk
- `still`: standing or sitting

**What earns a tap.** The station is a screenline: a line across the street at `station_ft`,
square to the centreline, from building line to building line. `sidewalk` and `roadbed` are
screenline counts, the method the publisher describes for the city's counter (section 3b). A person
is tapped once, at the moment they cross the line, in either direction: `sidewalk` when they cross
it on either sidewalk, `roadbed` when they cross it on foot in the roadbed. A person who crosses
twice is tapped twice. The stations are mid-block, so nobody in a crosswalk crosses the line.
`still` is not a screenline count. It is people seen standing or sitting near the line, and the
length of street it covers is not fixed by this protocol yet. Until it is, a `still` tally is not a
flow, has no rate and is not comparable between stations.

Every tap is timestamped. Undo removes the last tap. The page writes to the phone's local storage
on every tap. The end of the ten minutes is signalled by vibration where the phone has it and by a
tone armed by the Start tap, because an iPhone does not vibrate for a web page. An iPhone set to
silent mutes that tone as well, so the page also shows the end: the clock row turns solid and reads
that the session ended and was saved. The count does not depend on the cue. The session closes
itself at ten minutes and the counters stop taking taps.

Storage on the phone is limited, and Safari can clear a site's storage after about a week without a
visit. Sessions are exported the day they are taken, and deleted from the phone once the export has
been checked.

**Minutes are the minutes watched.** While a session runs the page notes every 5 seconds that it is
open and showing. A silence longer than 15 seconds (the phone locked, the page hidden or dropped)
is time in which nobody could tap. It is kept as a gap with its start and end, the session is
marked `interrupted`, and the gap is taken out of `minutes`. A session the phone dropped at a
minute and a half and reopened half an hour later is saved with its taps, about 1.5 minutes and
`interrupted: true`, not as a ten-minute count. A session ended early records the time up to the
end, less any gaps. A rate is always `count / minutes`, for `sidewalk` and `roadbed` only: people
crossing the screenline per minute watched. Silences of 15 seconds or less are not taken out.
`--check` reads `MINUTES`, `BEAT` and `GAP` from the page and fails if the minutes and seconds
written in this section no longer match them.

**Export.** One JSON row per session and tally: `station_ft`, `lon`, `lat`, `window`, `kind`,
`count`, `started_iso`, `minutes`, then `station` (the name), `interrupted`, `gaps` (ISO start and
end of each) and `taps`, the ISO time of each tap. Each row keeps the lon/lat the session was taken
at so the counts can be re-stationed against a new centreline. Export does not clear the phone, so
two exports overlap. A row is unique on (`station_ft`, `started_iso`, `kind`) and a bake
de-duplicates on that key. A bake can drop or down-weight rows where `interrupted` is true.

**Why one station is the city's counter.** A ten-minute tally is a sample, and on its own it cannot
be read as a volume. Counting at the city's own location, in the same sessions and by the same
method as the other five, gives a ratio between each station and the counter that was measured by
one observer in one way. That ratio is what lets the other five stations scale against the figure
the city publishes for the window. Only the `sidewalk` tally enters that ratio, because the city's screenline covers the
sidewalks. Without the counter station the six tallies could be compared
with each other but with nothing published.

**What this cannot say.** One observer, ten minutes, single days. The tallies are samples, not
totals. The scaling assumes the ratio between a station and the counter holds across the whole
window and that the observer's count at the counter relates to the city's as it does elsewhere.
A weekday midday count is not like for like with the city's Saturday midday figure. The `still`
tally is people seen standing or sitting during the ten minutes, not a count at one instant.
An interrupted session has fewer minutes behind its rate, and taps made in the 15 seconds either
side of a gap may belong to time that was not fully watched. The page knows only that it was open
and showing, not that the observer was looking at the street.

## 7. How the work is checked

Findings are produced by independent review passes and then handed to a second pass whose only job
is to refute them by re-running the numbers. Only what survives is kept. The 19 Sep 2026 code audit
and the dataset survey were both run this way; in several cases the refutation pass corrected the
original evidence, and the corrected figure is the one recorded here.
