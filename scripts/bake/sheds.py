"""Bake window.SHEDS: sidewalk shed permits at 42nd Street addresses. METHODOLOGY.md section 3f.

Sources: DOB NOW: Build, Approved Permits, NYC Open Data rbx6-tga4, for the permits of today.
DOB Permit Issuance, ipu4-2q9a, the older system, only to date how far back a run of permits goes.
A permit is a record that a shed was allowed at an address between two dates. It is not a
sighting of a shed, and neither source records how long a shed is or which frontage it covers.

  python3 scripts/bake/sheds.py            re-bake into plan/data.js as of today
  python3 scripts/bake/sheds.py --check    re-derive as of the baked day, write nothing
"""
import collections
import datetime
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import opendata
import station

NOW, OLD = 'rbx6-tga4', 'ipu4-2q9a'
# fetched loosely on purpose, so the run prints what an inexact match would have dragged in
# (West 142 Street). the set itself is chosen by station.on_42
NOW_WHERE = "work_type='Sidewalk Shed' AND borough='MANHATTAN' AND street_name like '%42%'"
NOW_COLS = ('job_filing_number,work_permit,sequence_number,filing_reason,house_no,street_name,bin,bbl,'
            'issued_date,expired_date,permit_status,latitude,longitude')
OLD_WHERE = "permit_subtype='SH' AND borough='MANHATTAN' AND street_name like '%42%'"
OLD_COLS = 'job__,house__,street_name,bin__,issuance_date,expiration_date'
# a renewal is often issued some days after the permit before it ran out. two permits at one
# building closer than this are read as one run. the run prints the answer at 0 and 90 as well
GAP_DAYS = 30
LIVE = 'Permit Issued'  # the other status the source uses is Signed-off: the job is closed

COMMENT = """/* Sidewalk shed permits at 42nd Street addresses. DOB NOW: Build, Approved Permits, NYC Open
   Data rbx6-tga4, with DOB Permit Issuance ipu4-2q9a used only to date a run of permits, baked
   by scripts/bake/sheds.py. One record per building (DOB building number, bin), in the set
   when the permit's street is East or West 42 Street in Manhattan and the building's newest
   shed permit is not signed off. state is 'in force' when a permit covers SHEDS_META.asof, and
   'lapsed' when the newest permit has run out with no sign-off recorded. since is the first
   day of the run of permits that reaches expires with no break longer than
   SHEDS_META.gap_days, n the permits in that run. ft is feet along LINE42 of the source's
   point for the building by perpendicular projection, side n or s by cross product, off feet
   from the centreline, lon/lat the source's own. A permit is not a sighting: the record does
   not say a shed is standing, how long it is, or which side of a corner building it is on. */"""
META_COMMENT = """/* What window.SHEDS was read from: the day it describes, the longest break read as one run
   of permits, the rows read from each source and the buildings they name. */"""


def iso(s):
    """'05/19/2006' or '2006-05-19T00:00:00.000' to '2006-05-19'. '' when the source has none."""
    m = re.match(r'(\d\d)/(\d\d)/(\d{4})', s or '')
    return '%s-%s-%s' % (m.group(3), m.group(1), m.group(2)) if m else (s or '')[:10]


def fetch():
    return (opendata.rows(opendata.NYC, NOW, NOW_WHERE, select=NOW_COLS),
            opendata.rows(opendata.NYC, OLD, OLD_WHERE, select=OLD_COLS))


def run(spans, end, gap):
    """(first day, permits) of the run of spans that reaches the span ending on `end`."""
    day = datetime.date.fromisoformat
    start, used = min(s for s, e in spans if e == end), set()
    grew = True
    while grew:
        grew = False
        for s, e in spans:
            if (s, e) not in used and s <= end and day(e) >= day(start) - datetime.timedelta(days=gap):
                used.add((s, e))
                if s < start:
                    start, grew = s, True
    return start, len(used)


def bake(now, old, line, asof):
    """Returns (records west to east, meta, notes for main to print)."""
    other = collections.Counter(' '.join(r['street_name'].split()) for r in now + old if not station.on_42(r['street_name']))
    now = [r for r in now if station.on_42(r['street_name'])]
    old = [r for r in old if station.on_42(r['street_name'])]
    undated = [r for r in old if not (r.get('issuance_date') and r.get('expiration_date'))]
    # nothing issued after the day described, so a check on a later day reads the same permits
    now = [r for r in now if iso(r.get('issued_date')) and iso(r['issued_date']) <= asof]
    spans = collections.defaultdict(set)
    for r in now:
        spans[r['bin']].add((iso(r['issued_date']), iso(r['expired_date'])))
    for r in old:
        if r not in undated:
            spans[r['bin__']].add((iso(r['issuance_date']), iso(r['expiration_date'])))
    by_bin = collections.defaultdict(list)
    for r in now:
        by_bin[r['bin']].append(r)
    out, tries = [], []
    for b, rows in by_bin.items():
        live = [r for r in rows if r['permit_status'] == LIVE and iso(r['expired_date']) >= asof]
        last = max(live or rows, key=lambda r: (iso(r['expired_date']), iso(r['issued_date'])))
        if not live and last['permit_status'] != LIVE:
            continue  # the building's newest permit is signed off: the job is closed
        if not last.get('latitude') or not last.get('longitude'):
            raise SystemExit('building %s has no point and cannot be stationed' % b)
        lon, lat = float(last['longitude']), float(last['latitude'])
        ft, side, off = line.project(lon, lat)
        end = iso(last['expired_date'])
        since, n = run(spans[b], end, GAP_DAYS)
        tries.append((b, [run(spans[b], end, g)[0] for g in (0, GAP_DAYS, 90)]))
        street = ' '.join(last['street_name'].split()).title()
        out.append({'lon': round(lon, 6), 'lat': round(lat, 6), 'ft': round(ft), 'side': 'n' if side > 0 else 's',
                    'off': round(off), 'addr': '%s %s' % (last['house_no'].strip(), street), 'bin': b,
                    'bbl': last.get('bbl'), 'state': 'in force' if live else 'lapsed', 'since': since,
                    'expires': end, 'n': n, 'job': last['job_filing_number']})
    out.sort(key=lambda s: (s['ft'], s['bin']))
    meta = {'asof': asof, 'gap_days': GAP_DAYS, 'rows': {'now': len(now), 'old': len(old)},
            'buildings': len(set(spans)), 'first': min(s for v in spans.values() for s, e in v)}
    return out, meta, {'other': other, 'undated': len(undated), 'tries': tries,
                       'status': collections.Counter(r['permit_status'] for r in now),
                       'old_last': max(iso(r['issuance_date']) for r in old if r not in undated)}


def main():
    line = station.load_line()
    check = '--check' in sys.argv
    asof = station.read_global('SHEDS_META')['asof'] if check else datetime.date.today().isoformat()
    now, old = fetch()
    day = opendata.updated(opendata.NYC, NOW)
    recs, meta, note = bake(now, old, line, asof)
    # every figure METHODOLOGY.md quotes about sheds comes from these lines
    print('as of %s, runs joined across breaks of up to %d days' % (asof, GAP_DAYS))
    print('left out by the street rule:', dict(note['other']))
    print('on 42 Street: %d DOB NOW permits %s, %d older permits (%d with no dates, not used), newest older permit issued %s'
          % (meta['rows']['now'], dict(note['status']), meta['rows']['old'], note['undated'], note['old_last']))
    print('buildings with any shed permit on record: %d, the first issued %s' % (meta['buildings'], meta['first']))
    for state in ('in force', 'lapsed'):
        print('%s: %d buildings' % (state, sum(1 for s in recs if s['state'] == state)))
    tries = dict(note['tries'])
    # the source's point sits on the street, a few feet to the building's side, so the computed
    # side is checked against the house number: odd numbers stand on the north side of a Manhattan street
    odd = [s['addr'] for s in recs if ('n' if int(re.match(r'\d+', s['addr']).group()) % 2 else 's') != s['side']]
    print('computed side against house number parity: %s' % ('all agree' if not odd else 'DISAGREES at %s' % odd))
    for s in recs:
        print('  station %5d  %s side, %3d ft off  %-22s %-8s since %s to %s, %2d permits   since at 0/%d/90 days: %s'
              % (s['ft'], s['side'], s['off'], s['addr'], s['state'], s['since'], s['expires'], s['n'],
                 GAP_DAYS, ' / '.join(tries[s['bin']])))
    if check:
        same = recs == station.read_global('SHEDS') and meta == station.read_global('SHEDS_META')
        dated = station.read_global('SOURCE_DATE').get('SHEDS')
        print('matches plan/data.js' if same else 'DIFFERS from plan/data.js. A permit signed off or renewed since %s shows here: re-bake' % asof)
        if dated != day:
            print('source date baked %s, source now %s' % (dated, day))
        sys.exit(0 if same else 1)
    print('plan/data.js SHEDS', station.write_global('SHEDS', recs, COMMENT))
    print('plan/data.js SHEDS_META', station.write_global('SHEDS_META', meta, META_COMMENT))
    print('plan/data.js SOURCE_DATE', station.stamp('SHEDS', day))


if __name__ == '__main__':
    main()
