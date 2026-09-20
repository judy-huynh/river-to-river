"""Bake window.BUS and window.BUS_META: how fast the M42 moves, by leg, hour and direction.
METHODOLOGY.md section 3c.

Source: MTA Bus Route Segment Speeds, data.ny.gov kufs-yh3x. One row per route, month, day of
the week, hour, direction and leg between two timepoints, already averaged by the publisher.

  python3 scripts/bake/bus.py                    re-bake the latest whole month into plan/data.js
  python3 scripts/bake/bus.py --month 2026-07    re-bake a named month
  python3 scripts/bake/bus.py --check            compare with what is baked, write nothing
"""
import datetime
import json
import os
import sys
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import opendata
import station

RID = 'kufs-yh3x'
ROUTE = 'M42'
WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
# a timepoint farther than this from the centreline is not on 42nd Street. the stops on the street
# stand 17 to 30 ft off, the two that are not stand 148 ft off or more. the bake prints every offset
OFF_FT = 60
# an off-street timepoint this close to an end of LINE42 is the terminal on the cross avenue: the
# bus turns onto the street at the end of the line, so the leg still runs its whole band
END_FT = 100
FT_PER_MI = 5280

COMMENT = """/* How fast the M42 moves. MTA Bus Route Segment Speeds, data.ny.gov kufs-yh3x, baked by
   scripts/bake/bus.py. One row per leg, direction and hour, for the weekdays of one month
   (BUS_META.month). A leg runs between two of the publisher's timepoints and is one bar: a/b
   are the feet along LINE42 of its two timepoints by perpendicular projection, c is the
   timepoints' own lon/lat in the direction of travel, so the set can be re-based. Legs are
   joined on those coordinates, never on the stop names, which differ by direction. h is the
   hour it starts (24 hour clock), mi the publisher's road distance, trips the buses measured
   over the month's weekdays, mph the road distance over the trip-weighted mean travel time.
   Nothing is known about speed inside a leg, so nothing is interpolated inside one. A leg
   with a timepoint off 42nd Street and not at an end of the line is left out and listed in
   BUS_META.dropped: it runs by E 41 St and 1 Av and its time on 42nd cannot be separated. */"""
META_COMMENT = """/* What window.BUS covers: route, month, the days averaged, and the legs left out with
   their own coordinates and the stations they would have spanned. */"""


def months():
    """Year-months the source holds for the route, newest first."""
    q = {'$select': 'year,month,count(*)', '$where': "route_id='%s'" % ROUTE, '$group': 'year,month', '$limit': 500}
    raw = opendata._get('https://%s/resource/%s.json?%s' % (opendata.NYS, RID, urllib.parse.urlencode(q)))
    return sorted(((int(r['year']), int(r['month'])) for r in json.loads(raw.decode('utf-8'))), reverse=True)


def latest_whole(today=None):
    """The newest month the source holds that ended before today."""
    t = today or datetime.datetime.now(datetime.timezone.utc).date()
    for y, m in months():
        if (y, m) < (t.year, t.month):
            return y, m
    raise SystemExit('no whole month of %s in the source' % ROUTE)


def fetch(y, m):
    return opendata.rows(opendata.NYS, RID, "route_id='%s' AND year=%d AND month=%d" % (ROUTE, y, m))


def bake(rows, line):
    """Returns (records, legs kept, legs dropped). Records are in the BUS shape."""
    legs = {}
    for r in rows:
        c = ((float(r['timepoint_stop_longitude']), float(r['timepoint_stop_latitude'])),
             (float(r['next_timepoint_stop_longitude']), float(r['next_timepoint_stop_latitude'])))
        # the join key is the direction and the two coordinates, not the names
        leg = legs.setdefault((r['direction'], c), {'dir': r['direction'], 'c': c, 'mi': set(), 'names': set(), 'h': {}})
        leg['mi'].add(round(float(r['road_distance']), 3))
        leg['names'].add((r['timepoint_stop_name'], r['next_timepoint_stop_name']))
        if r['day_of_week'] not in WEEKDAYS:
            continue
        n = int(r['bus_trip_count'])
        h = leg['h'].setdefault(int(r['hour_of_day']), [0, 0.0, set()])
        h[0] += n
        h[1] += n * float(r['average_travel_time'])
        h[2].add(r['day_of_week'])
    kept, dropped = [], []
    for leg in legs.values():
        if len(leg['mi']) != 1 or len(leg['names']) != 1:
            raise SystemExit('one pair of coordinates carries two legs: %s %s' % (leg['names'], leg['mi']))
        leg['mi'] = leg['mi'].pop()
        leg['from'], leg['to'] = leg['names'].pop()
        p = [line.project(*xy) for xy in leg['c']]
        leg['st'] = [round(q[0]) for q in p]
        leg['off'] = [round(q[2]) for q in p]
        leg['a'], leg['b'] = min(leg['st']), max(leg['st'])
        # off the street, and not the terminal at an end of the line
        stray = [i for i, q in enumerate(p)
                 if q[2] > OFF_FT and min(q[0], line.length - q[0]) > END_FT]
        (dropped if stray else kept).append(leg)
    order = lambda l: (l['dir'], l['a'] if l['dir'] == 'E' else -l['b'])
    kept.sort(key=order)
    dropped.sort(key=order)
    out = []
    for leg in kept:
        for h in range(24):
            n, t, days = leg['h'].get(h, [0, 0.0, set()])
            out.append({'a': leg['a'], 'b': leg['b'], 'dir': leg['dir'], 'h': h,
                        'mph': round(leg['mi'] * 60 / (t / n), 2) if n else None, 'trips': n,
                        'mi': leg['mi'], 'from': leg['from'], 'to': leg['to'],
                        'c': [[round(v, 6) for v in xy] for xy in leg['c']]})
    return out, kept, dropped


def corridor(recs, h):
    """Trip-weighted mph over every kept leg, both directions, at one hour: miles run over hours taken."""
    rows = [r for r in recs if r['h'] == h and r['mph']]
    hours = sum(r['trips'] * r['mi'] / r['mph'] for r in rows)
    return sum(r['trips'] * r['mi'] for r in rows) / hours if hours else None


def main():
    line = station.load_line()
    arg = sys.argv[sys.argv.index('--month') + 1] if '--month' in sys.argv else None
    if arg:
        y, m = (int(v) for v in arg.split('-'))
    elif '--check' in sys.argv:
        # a check re-derives the month that is baked, and says so when the source has a newer one
        y, m = (int(v) for v in station.read_global('BUS_META')['month'].split('-'))
        ny, nm = latest_whole()
        if (ny, nm) != (y, m):
            print('baked month %d-%02d, the source now holds %d-%02d' % (y, m, ny, nm))
    else:
        y, m = latest_whole()
    print('month %d-%02d' % (y, m))
    rows = fetch(y, m)
    day = opendata.updated(opendata.NYS, RID)
    recs, kept, dropped = bake(rows, line)
    # every figure METHODOLOGY.md quotes about the bus comes from these lines
    print('rows %d   weekday rows %d   legs %d   kept %d   dropped %d'
          % (len(rows), sum(r['day_of_week'] in WEEKDAYS for r in rows), len(kept) + len(dropped), len(kept), len(dropped)))
    for tag, legs in (('kept', kept), ('DROPPED', dropped)):
        for l in legs:
            hrs = [l['h'][h] for h in sorted(l['h'])]
            print('  %-7s %s  %s to %s  stations %d to %d (%d ft)  road %.3f mi (%d ft)  timepoints %d and %d ft off  hours %d  weekdays in every hour %s  trips %d'
                  % (tag, l['dir'], l['from'], l['to'], l['st'][0], l['st'][1], l['b'] - l['a'], l['mi'],
                     round(l['mi'] * FT_PER_MI), l['off'][0], l['off'][1], len(hrs),
                     all(len(x[2]) == len(WEEKDAYS) for x in hrs), sum(x[0] for x in hrs)))
    gaps = [r for r in recs if r['mph'] is None]
    print('leg-hours with no trips: %d' % len(gaps))
    for d in 'EW':
        cover = sorted((l['a'], l['b']) for l in kept if l['dir'] == d)
        print('  %s covered %s  of 0 to %d' % (d, cover, line.length))
    live = [r for r in recs if r['mph']]
    lo, hi = min(live, key=lambda r: r['mph']), max(live, key=lambda r: r['mph'])
    for tag, r in (('slowest', lo), ('fastest', hi)):
        print('%s leg-hour %.2f mph  %s %s to %s  hour %d' % (tag, r['mph'], r['dir'], r['from'], r['to'], r['h']))
    avg = [(h, corridor(recs, h)) for h in range(24)]
    print('corridor average by hour: ' + '  '.join('%d %.2f' % x for x in avg))
    print('slowest corridor hour %d at %.2f mph' % min(avg, key=lambda x: x[1]))
    meta = {'route': ROUTE, 'month': '%d-%02d' % (y, m), 'days': WEEKDAYS,
            'dropped': [{'dir': l['dir'], 'from': l['from'], 'to': l['to'], 'a': l['a'], 'b': l['b'],
                         'off': l['off'], 'mi': l['mi'],
                         'c': [[round(v, 6) for v in xy] for xy in l['c']]} for l in dropped]}
    if '--check' in sys.argv:
        same = recs == station.read_global('BUS') and meta == station.read_global('BUS_META')
        dated = station.read_global('SOURCE_DATE').get('BUS')
        print('matches plan/data.js' if same else 'DIFFERS from plan/data.js')
        if dated != day:
            print('source date baked %s, source now %s' % (dated, day))
        sys.exit(0 if same else 1)
    print('plan/data.js BUS', station.write_global('BUS', recs, COMMENT))
    print('plan/data.js BUS_META', station.write_global('BUS_META', meta, META_COMMENT))
    print('plan/data.js SOURCE_DATE', station.stamp('BUS', day))


if __name__ == '__main__':
    main()
