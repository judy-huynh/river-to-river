"""Bake window.SIDEWALK: sidewalk widths along 42nd Street. METHODOLOGY.md section 3.

Source: Meli Harvey, Sidewalk Widths NYC, medial axis of the city's planimetric sidewalk
polygons. Every feature is a two-point line with a width in feet.

  python3 scripts/bake/sidewalk.py            re-bake into plan/data.js
  python3 scripts/bake/sidewalk.py --check    compare with what is baked, write nothing
"""
import hashlib
import json
import os
import sys
import tempfile
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import station

# Pinned to a commit so a re-run reads the same bytes. To take a newer source, change the SHA.
SOURCE_SHA = '86fab1eca99cdcbf66730bd1f5fdbc7e0d9a1e94'
URL = ('https://raw.githubusercontent.com/meliharvey/sidewalkwidths-nyc/'
       + SOURCE_SHA + '/sidewalkwidths_nyc.geojson')
# 101 MB, never inside the repo. R2R_CACHE overrides the system temp directory.
CACHE_DIR = os.environ.get('R2R_CACHE') or os.path.join(tempfile.gettempdir(), 'river-to-river')
CACHE = os.path.join(CACHE_DIR, 'sidewalkwidths_nyc.geojson')
CLIP_FT = 55
BEARING_DEG = 30


def fetch():
    if not os.path.exists(CACHE):
        os.makedirs(CACHE_DIR, exist_ok=True)
        print('fetching', URL)
        urllib.request.urlretrieve(URL, CACHE + '.part')
        os.replace(CACHE + '.part', CACHE)
    with open(CACHE, 'rb') as f:
        raw = f.read()
    # size and hash say whether a later difference came from the source or from the method
    print('source %s  %d bytes  sha256 %s' % (CACHE, len(raw), hashlib.sha256(raw).hexdigest()))
    return json.loads(raw.decode('utf-8'))['features']


def bake(features, line):
    """Returns (rows, clipped count, bend-sensitive rows). Rows are in the SIDEWALK record shape."""
    lons = [v[1] for v in line.verts]
    lats = [v[2] for v in line.verts]
    pad = 0.002  # degrees, far wider than the clip; only there to skip the other 460,000
    box = (min(lons) - pad, min(lats) - pad, max(lons) + pad, max(lats) + pad)
    clipped, rows, sensitive = 0, [], []
    for f in features:
        g = f.get('geometry')
        if not g or g['type'] != 'LineString':
            continue
        p, q = g['coordinates'][0], g['coordinates'][-1]
        mid = ((p[0] + q[0]) / 2, (p[1] + q[1]) / 2)
        if not (box[0] <= mid[0] <= box[2] and box[1] <= mid[1] <= box[3]):
            continue
        # clip and side are both taken at the midpoint
        _, side, offset = line.project(*mid)
        if offset > CLIP_FT:
            continue
        clipped += 1
        a, b = line.band([p, q])
        # heading is read at the from-station. One segment at the station 903 bend
        # passes here and would fail against the heading at its midpoint.
        brg = line.bearing(p, q)
        at_from = station.axis_diff(brg, line.heading_at(a))
        at_mid = station.axis_diff(brg, line.heading_at((a + b) / 2))
        if (at_from > BEARING_DEG) != (at_mid > BEARING_DEG):
            sensitive.append((round(a), round(b), at_from, at_mid))
        if at_from > BEARING_DEG:
            continue
        rows.append({'a': round(a), 'b': round(b), 'w': f['properties']['width'], 's': side,
                     'c': [[round(p[0], 5), round(p[1], 5)], [round(q[0], 5), round(q[1], 5)]]})
    rows.sort(key=lambda r: (r['a'], r['b']))  # stable, ties keep source order
    return rows, clipped, sensitive


def main():
    line = station.load_line()
    rows, clipped, sensitive = bake(fetch(), line)
    print('clipped to %d ft: %d   bearing within %d deg: %d   dropped: %d'
          % (CLIP_FT, clipped, BEARING_DEG, len(rows), clipped - len(rows)))
    zero = [r['a'] for r in rows if r['a'] == r['b']]
    print('zero-length after rounding (a == b): %d, at stations %s' % (len(zero), zero))
    for a, b, at_from, at_mid in sensitive:
        print('heading-sensitive: %d to %d is %.1f deg off at its from-station, %.1f at its midpoint'
              % (a, b, at_from, at_mid))
    # every figure METHODOLOGY.md quotes about scale comes from these two lines
    for label, ft in (('library flat feet', line.flat_length()), ('WGS84 ellipsoid', line.ellipsoid_length())):
        print('centreline %d ft baked, %.1f ft in %s, %.2f percent apart'
              % (line.length, ft, label, abs(line.length - ft) / line.length * 100))
    if '--check' in sys.argv:
        same = rows == station.read_global('SIDEWALK')
        print('matches plan/data.js' if same else 'DIFFERS from plan/data.js')
        sys.exit(0 if same else 1)
    print('plan/data.js SIDEWALK', station.write_global('SIDEWALK', rows))


if __name__ == '__main__':
    main()
