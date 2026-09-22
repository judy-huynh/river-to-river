"""Bake window.PED_TIER: the DOT pedestrian priority tier of each segment of 42nd Street.
METHODOLOGY.md section 3d.

Source: NYC DOT Pedestrian Mobility Plan, NYC Open Data fwpa-qxaf. One line per street segment,
with the tier the plan puts it in. A tier is a planning rank, not a count of people.

  python3 scripts/bake/ped_tier.py            re-bake into plan/data.js
  python3 scripts/bake/ped_tier.py --check    compare with what is baked, write nothing
"""
import collections
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import opendata
import station

RID = 'fwpa-qxaf'
# fetched loosely on purpose, so the run can print what an inexact match would have dragged in.
# the set itself is chosen by station.on_42, the exact East or West 42 Street rule
LOOSE = "boroname='Manhattan' AND street like '%42 ST%'"

COMMENT = """/* The DOT pedestrian priority tier along 42nd Street. NYC DOT Pedestrian Mobility Plan, NYC
   Open Data fwpa-qxaf, baked by scripts/bake/ped_tier.py. A tier is the plan's rank for a
   segment, 1 the highest. It is not a count of people. In the set when the source names the
   segment East or West 42 Street in Manhattan, one record per segment id: the source repeats
   some ids and the repeats are dropped. a/b are feet along LINE42 of the segment's two ends by
   perpendicular projection, c is those two ends' own lon/lat so the set can be re-based.
   rank, tier and id are the source's. */"""
META_COMMENT = """/* Every tier the plan uses, citywide, with its rank and how many source rows carry it, so
   the page can say where the street's tiers sit without typing it. */"""


def fetch():
    return opendata.rows(opendata.NYC, RID, LOOSE)


def bake(rows, line):
    """Returns (records west to east, raw rows on the street, names the loose match dragged in)."""
    on = [r for r in rows if station.on_42(r.get('street'))]
    other = collections.Counter(r.get('street') for r in rows if not station.on_42(r.get('street')))
    by_id = collections.OrderedDict()
    for r in on:
        by_id.setdefault(r['segmentid'], []).append(r)
    out = []
    for sid, same in by_id.items():
        # a repeated id must be the same segment again, or dropping it would lose something
        if len({(x['rank'], x['category'], repr(x['the_geom'])) for x in same}) != 1:
            raise SystemExit('segment %s repeats with different values' % sid)
        r = same[0]
        parts = r['the_geom']['coordinates']
        if len(parts) != 1:
            raise SystemExit('segment %s has %d parts, its ends are not defined' % (sid, len(parts)))
        ends = [parts[0][0][:2], parts[0][-1][:2]]
        a, b = line.band(ends)
        if line.project(*ends[0])[0] > line.project(*ends[1])[0]:
            ends.reverse()  # west end first, whichever way the source drew it
        out.append({'a': round(a), 'b': round(b), 'rank': int(float(r['rank'])), 'tier': r['category'],
                    'id': sid, 'c': [[round(v, 6) for v in p] for p in ends],
                    '_len': float(r['shape_leng']), '_off': max(line.project(*p)[2] for p in ends)})
    out.sort(key=lambda s: (s['a'], s['b']))
    return out, on, other


def runs(recs):
    """Consecutive segments of one tier merged: [a, b, tier]."""
    m = []
    for s in recs:
        if m and m[-1][2] == s['tier'] and s['a'] <= m[-1][1]:
            m[-1][1] = max(m[-1][1], s['b'])
        else:
            m.append([s['a'], s['b'], s['tier']])
    return m


def main():
    line = station.load_line()
    rows = fetch()
    day = opendata.updated(opendata.NYC, RID)
    recs, on, other = bake(rows, line)
    # every figure METHODOLOGY.md quotes about the tiers comes from these lines
    print('Manhattan rows matching "42 ST" loosely: %d   named East or West 42 Street: %d' % (len(rows), len(on)))
    print('left out by the exact rule: %s' % dict(other))
    print('unique segment ids: %d of %d raw rows' % (len(recs), len(on)))
    print('source length, raw rows: %.0f ft   unique segments: %.0f ft   street: %d ft'
          % (sum(float(r['shape_leng']) for r in on), sum(s['_len'] for s in recs), line.length))
    print('stationed length: %d ft, from %d to %d' % (sum(s['b'] - s['a'] for s in recs), recs[0]['a'], recs[-1]['b']))
    print('farthest segment end from the centreline: %.0f ft' % max(s['_off'] for s in recs))
    for x, y in zip(recs, recs[1:]):
        if y['a'] != x['b']:
            print('  %s between %d and %d' % ('GAP' if y['a'] > x['b'] else 'OVERLAP', x['b'], y['a']))
    for s in recs:
        print('  %5d to %5d  rank %d %-9s %s  source %.0f ft' % (s['a'], s['b'], s['rank'], s['tier'], s['id'], s['_len']))
    for a, b, t in runs(recs):
        print('run: %-9s %5d to %5d  %d ft' % (t, a, b, b - a))
    for s in recs:
        del s['_len'], s['_off']
    tiers = [{'rank': int(float(g['rank'])), 'tier': g['category'], 'n': int(g['n'])}
             for g in opendata.grouped(opendata.NYC, RID, 'rank,category')]
    print('tiers citywide: %s' % ', '.join('%d %s (%d rows)' % (t['rank'], t['tier'], t['n']) for t in tiers))
    meta = {'tiers': tiers}
    if '--check' in sys.argv:
        same = recs == station.read_global('PED_TIER') and meta == station.read_global('PED_TIER_META')
        dated = station.read_global('SOURCE_DATE').get('PED_TIER')
        print('matches plan/data.js' if same else 'DIFFERS from plan/data.js')
        if dated != day:
            print('source date baked %s, source now %s' % (dated, day))
        sys.exit(0 if same else 1)
    print('plan/data.js PED_TIER', station.write_global('PED_TIER', recs, COMMENT))
    print('plan/data.js PED_TIER_META', station.write_global('PED_TIER_META', meta, META_COMMENT))
    print('plan/data.js SOURCE_DATE', station.stamp('PED_TIER', day))


if __name__ == '__main__':
    main()
