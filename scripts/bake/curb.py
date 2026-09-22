"""Bake window.CURB: metered block faces on 42nd Street. METHODOLOGY.md section 3e.

Source: NYC DOT Parking Meters, ParkNYC Block Faces, NYC Open Data e7yp-wx55. One line per metered
side of a block, with who may pay to stand there, for how long, at what hours and at what rate.

  python3 scripts/bake/curb.py            re-bake into plan/data.js
  python3 scripts/bake/curb.py --check    compare with what is baked, write nothing
"""
import collections
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import opendata
import station

RID = 'e7yp-wx55'
# read by place, not by name, so the run can print every face lying along the street that the
# name rule leaves out. the set itself is chosen by station.on_42 and the borough
PAD_DEG = 0.0006
# only a cross-check: a face not named 42 Street with both ends this close runs along the street
NEAR_FT = 60

COMMENT = """/* Metered block faces on 42nd Street. NYC DOT Parking Meters, ParkNYC Block Faces, NYC Open
   Data e7yp-wx55, baked by scripts/bake/curb.py. One record per metered side of a block, in the
   set when the source names it East or West 42 Street in Manhattan. a/b are feet along LINE42
   of the face's two ends by perpendicular projection, side is n or s by cross product, off is
   feet from the centreline, c is the two ends' own lon/lat, west end first, so the set can be
   re-based. who is the source's vehicle type. com and all are the source's terms for commercial
   vehicles and for all vehicles: limit, hours and rate, null where the source says N/A. from and
   to are the source's cross streets in the source's order, which is not west to east, with only
   the spelling of Avenue made regular. len is the
   source's own length in feet. A curb with no record here has no meter. Other rules still apply
   there and are not in this source. */"""


def tidy(name):
    """'11Avenue' and 'Dyer Ave' to '11 Avenue' and 'Dyer Avenue'. Spelling only."""
    n = re.sub(r'(\d)([A-Za-z])', r'\1 \2', ' '.join((name or '').split()))
    return re.sub(r'\b(Ave|Av)\b\.?', 'Avenue', n)


def terms(r, stem):
    """The source's four columns for one kind of vehicle, or None when it says N/A."""
    limit, hours, rate = r.get(stem), r.get(stem[:8] + '_1'), r.get(stem[:8] + '_2')
    if (limit or 'N/A') == 'N/A':
        return None
    return {'limit': limit, 'hours': hours, 'rate': rate}


def fetch(line):
    lons, lats = [v[1] for v in line.verts], [v[2] for v in line.verts]
    box = 'within_box(the_geom,%f,%f,%f,%f)' % (max(lats) + PAD_DEG, min(lons) - PAD_DEG,
                                                 min(lats) - PAD_DEG, max(lons) + PAD_DEG)
    return opendata.rows(opendata.NYC, RID, box)


def bake(rows, line):
    """Returns (records west to east, faces along the street the name rule left out)."""
    out, near = [], []
    for r in rows:
        parts = r['the_geom']['coordinates']
        ends = [parts[0][0][:2], parts[-1][-1][:2]]
        pr = [line.project(*p) for p in ends]
        named = station.on_42(r.get('on_street')) and (r.get('borough') or '').upper() == 'MANHATTAN'
        if not named:
            if max(p[2] for p in pr) <= NEAR_FT:
                near.append((round(pr[0][0]), round(pr[1][0]), r.get('on_street'), r.get('pay_by_cel')))
            continue
        if len(parts) != 1:
            raise SystemExit('face %s has %d parts, its ends are not defined' % (r.get('pay_by_cel'), len(parts)))
        if pr[0][1] != pr[1][1]:
            raise SystemExit('face %s has an end on each side of the centreline' % r.get('pay_by_cel'))
        # every vertex, not only the ends: a face that curls round a corner would station short
        fts = [line.project(*p[:2])[0] for p in parts[0]]
        if round(min(fts)) != round(min(p[0] for p in pr)) or round(max(fts)) != round(max(p[0] for p in pr)):
            raise SystemExit('face %s reaches past its own ends' % r.get('pay_by_cel'))
        cross = [tidy(r.get('from_stree')), tidy(r.get('to_street'))]
        if pr[0][0] > pr[1][0]:
            # west end first, whichever way the source drew it. from and to stay as the source
            # has them: it does not draw a face from its from street to its to street
            ends.reverse()
            pr.reverse()
        out.append({'a': round(pr[0][0]), 'b': round(pr[1][0]), 'side': 'n' if pr[0][1] > 0 else 's',
                    'off': round((pr[0][2] + pr[1][2]) / 2), 'who': r.get('vehicle_ty'),
                    'com': terms(r, 'commercial'), 'all': terms(r, 'all_vehicl'),
                    'from': cross[0], 'to': cross[1],
                    'zone': r.get('meter_rate'), 'len': round(float(r['shape_leng'])), 'id': r.get('pay_by_cel'),
                    'c': [[round(v, 6) for v in p] for p in ends],
                    '_src_side': r.get('side_of_st'), '_raw': (r.get('from_stree'), r.get('to_street'))})
    out.sort(key=lambda f: (f['a'], f['side']))
    return out, near


def covered(recs, side):
    """Feet of one side under a metered face, overlaps merged."""
    m = []
    for a, b in sorted((f['a'], f['b']) for f in recs if f['side'] == side):
        if m and a <= m[-1][1]:
            m[-1][1] = max(m[-1][1], b)
        else:
            m.append([a, b])
    return sum(b - a for a, b in m)


def main():
    line = station.load_line()
    rows = fetch(line)
    day = opendata.updated(opendata.NYC, RID)
    recs, near = bake(rows, line)
    # every figure METHODOLOGY.md quotes about the curb comes from these lines
    print('faces read near the street: %d   named East or West 42 Street in Manhattan: %d' % (len(rows), len(recs)))
    print('vehicle type:', dict(collections.Counter(f['who'] for f in recs)))
    print('commercial hours:', dict(collections.Counter((f['com'] or {}).get('hours') for f in recs)))
    print('commercial rate:', dict(collections.Counter((f['com'] or {}).get('rate') for f in recs)))
    for f in recs:
        agree = (f['_src_side'] or '').lower()[:1] == f['side']
        print('  %5d to %5d  %s side, %d ft off  %s to %s  %s  %s  source length %d, stationed %d%s'
              % (f['a'], f['b'], f['side'], f['off'], f['from'], f['to'], f['who'], (f['com'] or f['all'])['hours'],
                 f['len'], f['b'] - f['a'], '' if agree else '  DISAGREES with the source side ' + str(f['_src_side'])))
    respelt = sorted({'%s -> %s' % (x, tidy(x)) for f in recs for x in f['_raw'] if x != tidy(x)})
    print('cross streets respelt: %s' % (respelt or 'none'))
    for side in 'ns':
        ft = covered(recs, side)
        print('%s side metered: %d ft of %d, %.0f%%' % (side, ft, line.length, 100.0 * ft / line.length))
    print('other faces lying within %d ft of the centreline: %d %s' % (NEAR_FT, len(near), near or ''))
    for f in recs:
        del f['_src_side'], f['_raw']
    if '--check' in sys.argv:
        same = recs == station.read_global('CURB')
        dated = station.read_global('SOURCE_DATE').get('CURB')
        print('matches plan/data.js' if same else 'DIFFERS from plan/data.js')
        if dated != day:
            print('source date baked %s, source now %s' % (dated, day))
        sys.exit(0 if same else 1)
    print('plan/data.js CURB', station.write_global('CURB', recs, COMMENT))
    print('plan/data.js SOURCE_DATE', station.stamp('CURB', day))


if __name__ == '__main__':
    main()
