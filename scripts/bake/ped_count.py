"""Bake window.PED_COUNT: the city's one pedestrian counter on 42nd Street. METHODOLOGY.md 3b.

Source: NYC DOT Bi-Annual Pedestrian Counts, NYC Open Data cqsj-cfgu. One row per location,
one column per period and time window.

  python3 scripts/bake/ped_count.py            re-bake into plan/data.js
  python3 scripts/bake/ped_count.py --check    compare with what is baked, write nothing
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import opendata
import station

RID = 'cqsj-cfgu'
# When each count is taken. Not in the data: from the publisher's readme, "Counts conducted on
# one weekday day and an adjacent Saturday", "from 7-9am, 4-7pm on weekdays, 12-2pm on Saturday".
# https://www.nyc.gov/html/dot/downloads/pdf/bi-annual-ped-count-readme.pdf  read 19 Sep 2026.
# Hours are on the 24 hour clock. The page prints the window from here, so it is stated once.
WINDOWS = {'am': {'day': 'weekday', 'from': 7, 'to': 9},
           'md': {'day': 'Saturday', 'from': 12, 'to': 14},
           'pm': {'day': 'weekday', 'from': 16, 'to': 19}}
# the publisher's column names drift: may_07_pm, may_22_p_m, oct24_am, june_24_md
COL = re.compile(r'^([a-z]+?)_?(\d\d)_(am|md|p_?m)$')
MONTH = {'jan': 1, 'feb': 2, 'mar': 3, 'march': 3, 'apr': 4, 'april': 4, 'may': 5, 'jun': 6, 'june': 6,
         'jul': 7, 'july': 7, 'aug': 8, 'sep': 9, 'sept': 9, 'oct': 10, 'nov': 11, 'dec': 12}

COMMENT = """/* The one pedestrian counter on 42nd Street. NYC DOT Bi-Annual Pedestrian Counts, NYC Open
   Data cqsj-cfgu, baked by scripts/bake/ped_count.py. The whole published series for every
   location the source records on 42 Street in Manhattan; there is one. ft is feet along
   LINE42 by perpendicular projection, off is feet from the centreline, lon/lat are the
   source's own point. periods run oldest first, p is year-month. am and pm are totals for
   two windows of one weekday, md is a total for one window of the adjacent Saturday, so a
   period is two single count days, not an average. windows holds the day and hours of each
   (24 hour clock), from the publisher's readme, not from the rows. A count is null where
   the source has none; the source writes that as 0. */"""


def fetch():
    return opendata.rows(opendata.NYC, RID, "borough='Manhattan'")


def series(row):
    """The period columns of one row as [{'p','am','md','pm'}], oldest first. Unread columns too."""
    by, unread = {}, []
    for k, v in row.items():
        m = COL.match(k)
        if not m or m.group(1) not in MONTH:
            if re.search(r'\d\d', k) and not k.startswith(':'):
                unread.append(k)
            continue
        p = '20%s-%02d' % (m.group(2), MONTH[m.group(1)])
        by.setdefault(p, {'p': p, 'am': None, 'md': None, 'pm': None})[m.group(3).replace('_', '')] = int(v) or None  # the readme: 0 means not collected
    return [by[p] for p in sorted(by)], unread


def bake(rows, line):
    out = []
    for r in rows:
        if not station.on_42(r.get('street_nam')):
            continue
        lon, lat = r['the_geom']['coordinates'][:2]
        ft, side, off = line.project(lon, lat)
        periods, unread = series(r)
        if unread:
            raise SystemExit('period columns not understood: %s' % unread)
        out.append({'loc': r.get('loc'), 'street': r.get('street_nam'), 'from': r.get('from_stree'),
                    'to': r.get('to_street'), 'lon': round(lon, 6), 'lat': round(lat, 6),
                    'ft': round(ft), 'off': round(off), 'windows': WINDOWS, 'periods': periods})
    return out


def main():
    line = station.load_line()
    rows = fetch()
    day = opendata.updated(opendata.NYC, RID)
    recs = bake(rows, line)
    print('Manhattan count locations: %d   recorded on 42 Street: %d' % (len(rows), len(recs)))
    if len(recs) != 1:
        # the page reads one counter. more or fewer is a change in the source to look at by hand
        raise SystemExit('expected one location on 42 Street, found %d' % len(recs))
    c = recs[0]
    whole = [p for p in c['periods'] if None not in (p['am'], p['md'], p['pm'])]
    print('loc %s  %s, %s to %s  station %d, %d ft off' % (c['loc'], c['street'], c['from'], c['to'], c['ft'], c['off']))
    print('periods: %d, %s to %s, %d with all three windows'
          % (len(c['periods']), c['periods'][0]['p'], c['periods'][-1]['p'], len(whole)))
    last = c['periods'][-1]
    print('latest %s  am %s  md %s  pm %s' % (last['p'], last['am'], last['md'], last['pm']))
    if '--check' in sys.argv:
        same = c == station.read_global('PED_COUNT')
        dated = station.read_global('SOURCE_DATE').get('PED_COUNT')
        print('matches plan/data.js' if same else 'DIFFERS from plan/data.js')
        if dated != day:
            print('source date baked %s, source now %s' % (dated, day))
        sys.exit(0 if same else 1)
    print('plan/data.js PED_COUNT', station.write_global('PED_COUNT', c, COMMENT))
    print('plan/data.js SOURCE_DATE', station.stamp('PED_COUNT', day))


if __name__ == '__main__':
    main()
