"""Bake window.CRASHES: police-reported crashes beside 42nd Street. METHODOLOGY.md section 3g.

Source: NYPD Motor Vehicle Collisions, Crashes, NYC Open Data h9gi-nx95. One row per crash the
police reported, with the number of people injured and killed. It counts people hurt. It does not
count people on the street, so it gives no rate, and it says nothing about where anyone was walking.

  python3 scripts/bake/crashes.py            re-bake into plan/data.js
  python3 scripts/bake/crashes.py --check    re-derive up to the baked last day, write nothing
"""
import collections
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import opendata
import station

RID = 'h9gi-nx95'
SINCE = '2021-01-01'
NEAR_FT = 75        # a crash is in the set when the police point lies this close to the centreline
PAD_DEG = 0.0006    # the fetch box is the street's own, padded by more than NEAR_FT
COLS = ('collision_id,crash_date,latitude,longitude,on_street_name,off_street_name,cross_street_name,'
        'number_of_persons_injured,number_of_persons_killed,number_of_pedestrians_injured,'
        'number_of_pedestrians_killed,number_of_cyclist_injured,number_of_cyclist_killed,'
        'number_of_motorist_injured,number_of_motorist_killed')

COMMENT = """/* Police-reported crashes beside 42nd Street. NYPD Motor Vehicle Collisions, Crashes, NYC
   Open Data h9gi-nx95, baked by scripts/bake/crashes.py. In the set when the crash is dated
   CRASH_META.since or later and the police point lies within CRASH_META.near_ft of LINE42, so
   a crash on an avenue inside one of the street's intersections is in it. ft is feet along
   LINE42 by perpendicular projection, off feet from the centreline, lon/lat the source's own
   point, which is usually the nearest intersection and not the spot. d is the day, inj and k
   the people injured and killed, ped, cyc and mot the source's split of inj, each left out
   when zero. x is the street the source names other than 42 Street, id its collision id.
   A count of people hurt, with no count of people exposed: it is not a rate. */"""
META_COMMENT = """/* What window.CRASHES covers: first and last day, the distance rule, and the crashes the
   source records on 42 Street in Manhattan with no point, which cannot be stationed and are
   not in the set. */"""

num = lambda r, k: int(r.get(k) or 0)


def street(r):
    """The street the source names that is not 42 Street, in regular spelling. None when it names none."""
    for k in ('on_street_name', 'off_street_name', 'cross_street_name'):
        n = ' '.join((r.get(k) or '').split())
        if n and not station.on_42(n) and not re.match(r'^\d+ (EAST|WEST|E|W) 42', n):
            return re.sub(r'\bAve\b', 'Avenue', n.title()).replace(' Of The ', ' of the ').replace('Fdr ', 'FDR ')
    return None


def fetch(line):
    lons, lats = [v[1] for v in line.verts], [v[2] for v in line.verts]
    box = 'within_box(location,%f,%f,%f,%f)' % (max(lats) + PAD_DEG, min(lons) - PAD_DEG,
                                                 min(lats) - PAD_DEG, max(lons) + PAD_DEG)
    near = opendata.rows(opendata.NYC, RID, "crash_date>='%sT00:00:00' AND %s" % (SINCE, box), select=COLS)
    # no point, or the source's zero point: read only to count what cannot be stationed
    blind = opendata.rows(opendata.NYC, RID, "crash_date>='%sT00:00:00' AND borough='MANHATTAN' AND "
                          "(latitude IS NULL OR latitude=0) AND on_street_name like '%%42%%'" % SINCE, select=COLS)
    return near, blind


def bake(near, blind, line, upto=None):
    """Returns (records west to east, meta). upto keeps a later check to the days already baked."""
    day = lambda r: r['crash_date'][:10]
    keep = lambda r: upto is None or day(r) <= upto
    out = []
    for r in near:
        if not keep(r):
            continue
        lon, lat = float(r['longitude']), float(r['latitude'])
        ft, _, off = line.project(lon, lat)
        if off > NEAR_FT:
            continue
        rec = {'ft': round(ft), 'off': round(off), 'lon': round(lon, 6), 'lat': round(lat, 6), 'd': day(r)}
        for k, col in (('inj', 'number_of_persons_injured'), ('k', 'number_of_persons_killed'),
                       ('ped', 'number_of_pedestrians_injured'), ('cyc', 'number_of_cyclist_injured'),
                       ('mot', 'number_of_motorist_injured')):
            if num(r, col):
                rec[k] = num(r, col)
        if street(r):
            rec['x'] = street(r)
        rec['id'] = r['collision_id']
        out.append((rec, r))
    out.sort(key=lambda x: (x[0]['ft'], x[0]['d'], x[0]['id']))
    lost = [r for r in blind if keep(r) and station.on_42(r.get('on_street_name'))]
    meta = {'since': SINCE, 'to': max(x[0]['d'] for x in out), 'near_ft': NEAR_FT,
            'unlocated': {'n': len(lost), 'inj': sum(num(r, 'number_of_persons_injured') for r in lost)}}
    return out, meta


def main():
    line = station.load_line()
    check = '--check' in sys.argv
    upto = station.read_global('CRASH_META')['to'] if check else None
    near, blind = fetch(line)
    day = opendata.updated(opendata.NYC, RID)
    pairs, meta = bake(near, blind, line, upto)
    recs, rows = [p[0] for p in pairs], [p[1] for p in pairs]
    tot = lambda col: sum(num(r, col) for r in rows)
    # every figure METHODOLOGY.md quotes about crashes comes from these lines
    print('crashes read in the box since %s: %d   within %d ft of the centreline: %d, %s to %s'
          % (SINCE, len(near), NEAR_FT, len(recs), min(r['d'] for r in recs), meta['to']))
    print('people injured: %d in %d crashes   killed: %d' % (tot('number_of_persons_injured'),
          sum(1 for r in recs if r.get('inj')), tot('number_of_persons_killed')))
    for who in ('pedestrians', 'cyclist', 'motorist'):
        print('  %-12s injured %d  killed %d' % (who, tot('number_of_%s_injured' % who), tot('number_of_%s_killed' % who)))
    print('  injured and in none of the three: %d' % (tot('number_of_persons_injured') - sum(
        tot('number_of_%s_injured' % w) for w in ('pedestrians', 'cyclist', 'motorist'))))
    print('by year:', dict(sorted(collections.Counter(r['d'][:4] for r in recs).items())))
    print('distinct police points: %d   crashes naming no street but 42 Street: %d'
          % (len({(r['lon'], r['lat']) for r in recs}), sum(1 for r in recs if 'x' not in r)))
    print('streets named most:', collections.Counter(r.get('x') for r in recs if r.get('x')).most_common(16))
    print('on 42 Street in Manhattan with no point, not in the set: %d crashes, %d injured'
          % (meta['unlocated']['n'], meta['unlocated']['inj']))
    if check:
        same = recs == station.read_global('CRASHES') and meta == station.read_global('CRASH_META')
        dated = station.read_global('SOURCE_DATE').get('CRASHES')
        print('matches plan/data.js' if same else 'DIFFERS from plan/data.js. The police amend old reports: re-bake')
        if dated != day:
            print('source date baked %s, source now %s' % (dated, day))
        sys.exit(0 if same else 1)
    print('plan/data.js CRASHES', station.write_global('CRASHES', recs, COMMENT))
    print('plan/data.js CRASH_META', station.write_global('CRASH_META', meta, META_COMMENT))
    print('plan/data.js SOURCE_DATE', station.stamp('CRASHES', day))


if __name__ == '__main__':
    main()
