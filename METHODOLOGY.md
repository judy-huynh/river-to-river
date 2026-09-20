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

Derived figures computed in the page, not typed:

- **Unbuilt floor area** per lot = lot area x allowed FAR, minus built floor area.
- **Tree gaps** = any run of more than 400 ft along the centreline with no tree on either side.
  Both sidewalks are merged, so a block with trees on one side only reads as having trees.
  Known limitation.
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

No new dataset. The card reads the five baked globals at one station, through one pure function,
`stationProfile(ft)` in `plan/station.js`. That file has no DOM in it, so it loads in node, and
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
| How fast does the bus move | MTA Bus Route Segment Speeds, 2025+ (2023-24 baseline `58t6-89vi`) | `kufs-yh3x` | M42 by segment, hour and direction. May 2026 Wednesdays: about 4.1 mph from 11am to 6pm, 2.98 mph westbound Park to 7th at 5pm |
| How many people are here | NYC DOT Bi-Annual Pedestrian Counts | `cqsj-cfgu` | **One** location on the whole street (Park to Lexington, station 7,796), May 2007 to May 2026. May 2026 PM peak 16,297 |
| | MTA Subway Hourly Ridership | `5wq4-mkjj` | Entries at the three 42nd Street complexes, by hour. Entries only |
| | NYC DOT Pedestrian Mobility Plan | `fwpa-qxaf` | A priority **tier**, not a count. All 34 de-duplicated segments rank in the top two tiers |
| Where can you stop | NYC DOT Seating Locations | `esmy-s8q5` | 2 benches, both installed May 2025, none west of 6th Avenue |
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
