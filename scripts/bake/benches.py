"""Bake window.BENCHES: NYC DOT benches on 42nd Street. METHODOLOGY.md section 3b.

Source: NYC DOT Seating Locations, NYC Open Data esmy-s8q5. One point per bench.

  python3 scripts/bake/benches.py            re-bake into plan/data.js
  python3 scripts/bake/benches.py --check    compare with what is baked, write nothing
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import opendata
import station

RID = 'esmy-s8q5'
# the rule is the street the bench is recorded on (station.on_42), the same rule the lots follow
# only a cross-check: any DOT bench this close to the centreline that the rule left out is printed
NEAR_FT = 100

COMMENT = """/* Benches on 42nd Street. NYC DOT Seating Locations, NYC Open Data esmy-s8q5, baked by
   scripts/bake/benches.py. In the set when the source records the bench on 42 Street in
   Manhattan. ft is feet along LINE42 by perpendicular projection, side is n or s by cross
   product, off is feet from the centreline. lon/lat are the bench's own, so the set can be
   re-based. installed, type and id are the source's. */"""


def fetch():
    return opendata.rows(opendata.NYC, RID, "boroname='Manhattan'")


def bake(rows, line):
    """Returns (records, near misses, rows with no point). Records are in the BENCHES shape, west to east."""
    out, near, blind = [], [], []
    for r in rows:
        g = r.get('the_geom')
        if not g:
            # cannot be stationed. kept so main() can count them and stop if one is on the street
            blind.append(r)
            continue
        lon, lat = g['coordinates'][:2]
        ft, side, off = line.project(lon, lat)
        if not station.on_42(r.get('on_street')):
            if off <= NEAR_FT:
                near.append((round(ft), round(off), r.get('on_street'), r.get('siteid')))
            continue
        out.append({'lon': round(lon, 6), 'lat': round(lat, 6), 'ft': round(ft),
                    'side': 'n' if side > 0 else 's', 'off': round(off),
                    'on': r.get('on_street'), 'from': r.get('from_street'), 'to': r.get('to_street'),
                    'installed': (r.get('installation_date') or '')[:10] or None,
                    'type': r.get('asset_subtype'), 'id': r.get('siteid'),
                    'src_side': r.get('side_of_st')})
    out.sort(key=lambda b: (b['ft'], b['id'] or ''))
    return out, near, blind


def main():
    line = station.load_line()
    rows = fetch()
    day = opendata.updated(opendata.NYC, RID)
    recs, near, blind = bake(rows, line)
    lost = [r.get('siteid') for r in blind if station.on_42(r.get('on_street'))]
    print('rows with no point, not stationed: %d   of them recorded on 42 Street: %d' % (len(blind), len(lost)))
    if lost:
        # a bench on the street that cannot be placed must not drop out of the set unseen
        raise SystemExit('on 42 Street with no point: %s' % lost)
    # every figure METHODOLOGY.md quotes about benches comes from these lines
    print('Manhattan benches: %d   recorded on 42 Street: %d' % (len(rows), len(recs)))
    for b in recs:
        agree = (b['src_side'] or '').lower()[:1] == b['side']
        print('  station %d  %s side, %d ft off  %s, %s to %s  installed %s  %s  source side %s%s'
              % (b['ft'], b['side'], b['off'], b['on'], b['from'], b['to'], b['installed'], b['id'],
                 b['src_side'], '' if agree else '  DISAGREES with the computed side'))
    print('other benches within %d ft of the centreline: %d %s' % (NEAR_FT, len(near), near or ''))
    print('westmost bench at station %s' % (recs[0]['ft'] if recs else 'none'))
    for b in recs:
        del b['src_side']  # printed for the check above, the baked side is the computed one
    if '--check' in sys.argv:
        same = recs == station.read_global('BENCHES')
        dated = station.read_global('SOURCE_DATE').get('BENCHES')
        print('matches plan/data.js' if same else 'DIFFERS from plan/data.js')
        if dated != day:
            print('source date baked %s, source now %s' % (dated, day))
        sys.exit(0 if same else 1)
    print('plan/data.js BENCHES', station.write_global('BENCHES', recs, COMMENT))
    print('plan/data.js SOURCE_DATE', station.stamp('BENCHES', day))


if __name__ == '__main__':
    main()
