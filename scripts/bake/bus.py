"""Bake window.BUS, window.BUS_META and window.BUS_HIST: how fast the M42 moves, by leg, hour
and direction, and the slowest leg at each hour of every month on record.
METHODOLOGY.md section 3c.

Source: MTA Bus Route Segment Speeds, data.ny.gov kufs-yh3x (2025 onward) and 58t6-89vi (2023
and 2024). One row per route, month, day of the week, hour, direction and leg between two
timepoints, already averaged by the publisher.

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
# the same publisher's earlier file, same columns. read for the month by month record only
RID_OLD = '58t6-89vi'
# the reference line the speeds are read against: 4.4 ft/s, the Highway Capacity Manual's default
# free-flow walking speed, which is 3.0 mph. METHODOLOGY.md section 3c names the source
WALK_MPH = 3.0
# the hours the page averages as the daytime, 7am up to 7pm, and the hour the monthly strip draws
DAY_HOURS = [7, 19]
STRIP_HOUR = 17
COLS = ('year,month,day_of_week,hour_of_day,direction,timepoint_stop_name,timepoint_stop_latitude,'
        'timepoint_stop_longitude,next_timepoint_stop_name,next_timepoint_stop_latitude,'
        'next_timepoint_stop_longitude,road_distance,average_travel_time,bus_trip_count')
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
   their own coordinates and the stations they would have spanned. walk_mph is the reference
   line the page reads every speed against, day_hours the hours it averages as the daytime
   (from, up to), strip_hour the hour the month by month strip draws. */"""
HIST_COMMENT = """/* The slowest M42 leg at each hour, for every whole month on record up to BUS_META.month.
   Same bake, same weekdays, same kept and dropped rule as window.BUS, run once per month over
   kufs-yh3x (2025 onward) and 58t6-89vi (2023 and 2024). The publisher moved its timepoints
   over the record, so legs are not the same stretch of street in every month: legsets holds
   each distinct set of kept legs as [dir, from, to, a, b], and a month points at its set.
   months[].slow has 24 entries, one an hour, each [mph, index into the month's legset, buses
   measured on that leg in that hour], or null where no kept leg had a bus. Where the
   publisher gives one leg two road distances in a month, its speed is total miles over total
   time, which is the same figure when there is one. */"""


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


def bake(rows, line, strict=True):
    """Returns (records, legs kept, legs dropped). Records are in the BUS shape. strict stops
    the bake when one leg carries two road distances, which the displayed month must not.
    The month by month record passes strict=False and reads such a leg as miles over time."""
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
        h = leg['h'].setdefault(int(r['hour_of_day']), [0, 0.0, set(), 0.0])
        h[0] += n
        h[1] += n * float(r['average_travel_time'])
        h[2].add(r['day_of_week'])
        h[3] += n * round(float(r['road_distance']), 3)
    kept, dropped = [], []
    for leg in legs.values():
        if len(leg['names']) != 1 or (strict and len(leg['mi']) != 1):
            raise SystemExit('one pair of coordinates carries two legs: %s %s' % (leg['names'], leg['mi']))
        leg['mis'] = sorted(leg['mi'])
        leg['mi'] = leg['mis'][-1]
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
            n, t, days, mi = leg['h'].get(h, [0, 0.0, set(), 0.0])
            # one road distance: distance over mean time. two: total miles over total time
            mph = (leg['mi'] * 60 / (t / n) if len(leg['mis']) == 1 else mi * 60 / t) if n else None
            out.append({'a': leg['a'], 'b': leg['b'], 'dir': leg['dir'], 'h': h,
                        'mph': round(mph, 2) if n else None, 'trips': n,
                        'mi': leg['mi'], 'from': leg['from'], 'to': leg['to'],
                        'c': [[round(v, 6) for v in xy] for xy in leg['c']]})
    return out, kept, dropped


def corridor(recs, h):
    """Trip-weighted mph over every kept leg, both directions, at one hour: miles run over hours taken."""
    rows = [r for r in recs if r['h'] == h and r['mph']]
    hours = sum(r['trips'] * r['mi'] / r['mph'] for r in rows)
    return sum(r['trips'] * r['mi'] for r in rows) / hours if hours else None


def history(line, upto):
    """BUS_HIST: the slowest kept leg at each hour of every whole month up to the displayed one."""
    by = {}
    for rid in (RID_OLD, RID):
        for r in opendata.rows(opendata.NYS, rid, "route_id='%s'" % ROUTE, limit=500000, select=COLS):
            by.setdefault((int(r['year']), int(r['month']), rid), []).append(r)
    legsets, months = [], []
    for y, m, rid in sorted(by):
        if (y, m) > upto:
            continue
        recs, kept, dropped = bake(by[(y, m, rid)], line, strict=False)
        legs = [[l['dir'], l['from'], l['to'], l['a'], l['b']] for l in kept]
        if legs not in legsets:
            legsets.append(legs)
        slow = []
        for h in range(24):
            live = [r for r in recs if r['h'] == h and r['mph']]
            lo = min(live, key=lambda r: r['mph']) if live else None
            slow.append([lo['mph'], legs.index([lo['dir'], lo['from'], lo['to'], lo['a'], lo['b']]), lo['trips']] if lo else None)
        months.append({'month': '%d-%02d' % (y, m), 'src': rid, 'set': legsets.index(legs), 'slow': slow})
        two = [l for l in kept if len(l['mis']) > 1]
        s = slow[STRIP_HOUR]
        print('  %d-%02d  %s  rows %d  kept %d  dropped %d  legset %d  slowest at %d:00 %s%s'
              % (y, m, rid, len(by[(y, m, rid)]), len(kept), len(dropped), legsets.index(legs), STRIP_HOUR,
                 '%.2f mph %s %s to %s' % (s[0], legs[s[1]][0], legs[s[1]][1], legs[s[1]][2]) if s else 'none',
                 ''.join('  TWO DISTANCES %s to %s %s' % (l['from'], l['to'], l['mis']) for l in two)))
    return {'legsets': legsets, 'months': months}


def baked_hist():
    try:
        return station.read_global('BUS_HIST')
    except KeyError:
        return None


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
    print('corridor hours under %.1f mph: %d of %d   leg-hours under it: %d of %d'
          % (WALK_MPH, sum(v < WALK_MPH for _, v in avg), len(avg), sum(r['mph'] < WALK_MPH for r in live), len(live)))
    lit = [r for r in live if DAY_HOURS[0] <= r['h'] < DAY_HOURS[1]]
    print('daytime corridor average, hours %d up to %d: %.2f mph'
          % (DAY_HOURS[0], DAY_HOURS[1], sum(r['trips'] * r['mi'] for r in lit) / sum(r['trips'] * r['mi'] / r['mph'] for r in lit)))
    print('month by month:')
    hist = history(line, (y, m))
    hm = hist['months']
    print('months on record %d, %s to %s   distinct sets of kept legs %d' % (len(hm), hm[0]['month'], hm[-1]['month'], len(hist['legsets'])))
    for i, legs in enumerate(hist['legsets']):
        print('  legset %d  months %d  %s' % (i, sum(x['set'] == i for x in hm), legs))
    under = [x for x in hm if x['slow'][STRIP_HOUR] and x['slow'][STRIP_HOUR][0] < WALK_MPH]
    print('slowest leg at %d:00 under %.1f mph in %d of %d months: %s'
          % (STRIP_HOUR, WALK_MPH, len(under), len(hm), ' '.join('%s %.2f' % (x['month'], x['slow'][STRIP_HOUR][0]) for x in under)))
    lo = min((x for x in hm if x['slow'][STRIP_HOUR]), key=lambda x: x['slow'][STRIP_HOUR][0])
    print('lowest of them %s at %.2f mph' % (lo['month'], lo['slow'][STRIP_HOUR][0]))
    # the record's last month is the displayed month, derived a second way: the two must agree
    if [s and s[0] for s in hm[-1]['slow']] != [min((r['mph'] for r in live if r['h'] == h), default=None) for h in range(24)]:
        raise SystemExit('the last month of the record does not agree with window.BUS')
    meta = {'route': ROUTE, 'month': '%d-%02d' % (y, m), 'days': WEEKDAYS,
            'walk_mph': WALK_MPH, 'day_hours': DAY_HOURS, 'strip_hour': STRIP_HOUR,
            'dropped': [{'dir': l['dir'], 'from': l['from'], 'to': l['to'], 'a': l['a'], 'b': l['b'],
                         'off': l['off'], 'mi': l['mi'],
                         'c': [[round(v, 6) for v in xy] for xy in l['c']]} for l in dropped]}
    if '--check' in sys.argv:
        same = (recs == station.read_global('BUS') and meta == station.read_global('BUS_META')
                and hist == baked_hist())
        dated = station.read_global('SOURCE_DATE').get('BUS')
        print('matches plan/data.js' if same else 'DIFFERS from plan/data.js')
        if dated != day:
            print('source date baked %s, source now %s' % (dated, day))
        sys.exit(0 if same else 1)
    print('plan/data.js BUS', station.write_global('BUS', recs, COMMENT))
    print('plan/data.js BUS_META', station.write_global('BUS_META', meta, META_COMMENT))
    print('plan/data.js BUS_HIST', station.write_global('BUS_HIST', hist, HIST_COMMENT))
    print('plan/data.js SOURCE_DATE', station.stamp('BUS', day))
    print('plan/data.js SOURCE_DATE', station.stamp('BUS_OLD', opendata.updated(opendata.NYS, RID_OLD)))


if __name__ == '__main__':
    main()
