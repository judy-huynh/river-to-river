# River to River

A parcel-level reading of a Manhattan crosstown street, river to river. 42nd Street is the first one.

Split out of the judyhuynh.ca website redesign on 18 Sep 2026 and made its own project. The website
redesign now lives in `../judyhuynh-ca`.

See `PLAN.md` for the phased plan, the standing rules and the open decisions.

## Run it

Every Mapbox page must be served over localhost. Chrome will not let Mapbox start its web worker
from a `file://` page and you get a silent grey box.

```
cd ~/Documents/GitHub/river-to-river
python3 serve.py
```

`serve.py` sends `no-store`, so a plain Cmd+R always shows what is on disk. Plain
`python3 -m http.server` lets the browser cache `style.css` and `scripts.js`, which
means edits look like they did nothing and you end up debugging a stale page.

Then <http://127.0.0.1:8042/plan/>. The pure SVG pages work either way.

## What is here

| Folder | What it is | Status |
|---|---|---|
| `plan/` | **Sheet 01, existing conditions.** Five toggleable layers over the real street: trees, roadway, lots and buildable capacity, landmarks, avenue labels. Full-street ruler at the bottom doubles as the navigator. | live, newest |
| `analysis/` | The 82 lots that front the street. Four readings, the ten biggest openings, who holds the ground, how this could be wrong, method. | live |
| `studies/` | Four ways to draw the street before any data goes on top. `A-unrolled` straightens it onto one axis, `B-ribbon` locks the bearing so it runs flat, `C-void` inverts figure and ground, `D-standard` is B's geometry with C's colours. `00-test.html` prints WebGL and tile status when something looks broken. | reference |
| `archive/` | Earlier attempts kept for the record. `H` stacked eleven data ribbons on synthetic data. `I` drew every published proposal to its real extent. `J` was the first real parcel page. Screenshots of all of it. | dead |
| `RESEARCH.md` | Every published proposal for 42nd Street, sourced, plus the gap analysis. | |
| `notes/` | Working notes. Gitignored, local only. | |

Data files sit next to the page that reads them rather than in a shared `data/` folder, so every
page runs standalone with no path rewriting.

## Sources

| | |
|---|---|
| Centreline | OpenStreetMap via Overpass, baked once. 10,411 ft, 1.97 mi, 12th Ave to 1st Ave |
| Lots | NYC MapPLUTO, real boundaries, with ownership, zoning, capacity and a confidence grade |
| Trees | NYC Parks Forestry Tree Points |
| Roadway | NYC CSCL street centerline, width and lane counts |
| Basemap | Mapbox Standard, colour graded with two 32³ lookup tables generated in Python |

## Findings so far, all from real data

- 82 lots front the street *(under revision: the selection rule is being reapplied, see `PLAN.md` Phase 1)*
- 3.4m sq ft of floor area the zoning data appears to allow and nobody built
- **only 10% of that survives a check against special districts and landmarks**
- 88% of the capacity sits outside the four famous hubs
- the biggest single opening is a city owned lot at 234 West 42nd

## Gotchas that cost hours

- **Always snap to OSM.** Interpolating between guessed avenue coordinates drifted up to 150 m, a
  whole block.
- **Verifying Mapbox in headless Chrome is unreliable**, even with `--enable-unsafe-swiftshader`.
  Tiles and the load handler often do not finish before the screenshot. Verify the data logic in
  node by `eval`ing the script block instead, and let Judy check the visuals.
- **An SVG overlay sized with CSS `width:100%;height:100%` will squash a document-sized `viewBox`.**
  Set `style.width` and `style.height` in px instead.
- The Mapbox token is Judy's personal one on the **`j00by`** account, not rebuildbydesign. It is
  hardcoded in `plan/scripts.js`. It is a public `pk.` token, but it is **unrestricted**, so add a
  URL restriction before this repo goes public.
