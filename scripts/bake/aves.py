"""Bake window.AVES: where each cross street meets 42nd Street. METHODOLOGY.md section 1a.

Source: NYC Street Centerline (CSCL), NYC Open Data inkn-q76z. The source splits every street at
every intersection, so a cross street's segments end on 42nd Street, and those ends are stationed.
The page names places by these stations, so they are derived and never typed.

  python3 scripts/bake/aves.py            re-bake into plan/data.js
  python3 scripts/bake/aves.py --check    compare with what is baked, write nothing
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import opendata
import station

RID = 'inkn-q76z'
PAD_DEG = 0.0006
NEAR_FT = 40     # a segment end this close to the centreline is an end on 42nd Street
CROSS_DEG = 45   # and the segment crosses the street when it leaves at more than this angle
ROADS = ('1', '2', '3')   # the source's rw_type for street, highway and bridge. paths, alleys and ramps are not cross streets
GRADE = '13'     # the source's level code for a node at street level
COLS = 'the_geom,physicalid,full_street_name,rw_type,from_level_code,to_level_code'

# the avenues the ruler ticks, and the short label each tick carries. a choice of what to draw:
# the stations are the source's. the bake stops if one of these is not found
LABEL = {'12 Avenue': '12th', '11 Avenue': '11th', '10 Avenue': '10th', '9 Avenue': '9th',
         '8 Avenue': '8th', '7 Avenue': '7th', 'Avenue of the Americas': '6th', '5 Avenue': '5th',
         'Madison Avenue': 'Mad', 'Park Avenue': 'Park', 'Lexington Avenue': 'Lex',
         '3 Avenue': '3rd', '2 Avenue': '2nd', '1 Avenue': '1st'}

COMMENT = """/* Where each cross street meets 42nd Street. NYC Street Centerline (CSCL), NYC Open Data
   inkn-q76z, baked by scripts/bake/aves.py. The source splits a street at every intersection,
   so a cross street's segments end on 42nd Street. In the set when a street or highway segment
   ends within 40 ft of LINE42, leaves it at more than 45 degrees, and at least one such end is
   at street level. c is every such end's own lon/lat, west to east, so the set can be re-based.
   a and b are the feet along LINE42 of the westmost and eastmost end by perpendicular
   projection (an avenue with two roadways has two), ft the middle of the two. name is the
   source's, spelling made regular. label is the short name the ruler ticks, on the avenues it
   ticks and on no other. */"""


def tidy(name):
    """'AVE OF THE AMERICAS' to 'Avenue of the Americas', 'DE PEW PL' to 'De Pew Place'. Spelling only."""
    n = ' '.join((name or '').split()).title()
    n = re.sub(r'\bAve\b', 'Avenue', n)
    n = re.sub(r'\bPl\b', 'Place', n)
    return n.replace(' Of The ', ' of the ').replace('Fdr ', 'FDR ')


def fetch(line):
    lons, lats = [v[1] for v in line.verts], [v[2] for v in line.verts]
    box = 'within_box(the_geom,%f,%f,%f,%f)' % (max(lats) + PAD_DEG, min(lons) - PAD_DEG,
                                                 min(lats) - PAD_DEG, max(lons) + PAD_DEG)
    return opendata.rows(opendata.NYC, RID, box + " AND boroughcode='1'", select=COLS)


def bake(rows, line):
    """Returns (records west to east, names left out because no end is at street level,
    names of other kinds of way that end on the street)."""
    ends, other = {}, set()
    for r in rows:
        name = tidy(r.get('full_street_name'))
        if not name or station.on_42(r.get('full_street_name')):
            continue
        for part in r['the_geom']['coordinates']:
            # the first end carries the from level, the last the to level
            for end, nxt, level in ((part[0], part[1], r.get('from_level_code')),
                                    (part[-1], part[-2], r.get('to_level_code'))):
                ft, _, off = line.project(*end[:2])
                if off > NEAR_FT or station.axis_diff(line.bearing(end, nxt), line.heading_at(ft)) <= CROSS_DEG:
                    continue
                if r.get('rw_type') not in ROADS:
                    other.add(name)
                    continue
                node = (round(end[0], 6), round(end[1], 6))
                was = ends.setdefault(name, {}).get(node)
                ends[name][node] = (ft, level == GRADE or bool(was and was[1]))
    out, above = [], []
    for name, nodes in ends.items():
        if not any(g for _, g in nodes.values()):
            above.append(name)
            continue
        pts = sorted(nodes.items(), key=lambda kv: kv[1][0])
        a, b = pts[0][1][0], pts[-1][1][0]
        rec = {'ft': round((a + b) / 2), 'a': round(a), 'b': round(b), 'name': name}
        if name in LABEL:
            rec['label'] = LABEL[name]
        rec['c'] = [list(k) for k, _ in pts]
        out.append(rec)
    out.sort(key=lambda x: x['ft'])
    missing = [n for n in LABEL if n not in {x['name'] for x in out}]
    if missing:
        raise SystemExit('ticked avenue not found in the source: %s' % ', '.join(missing))
    return out, sorted(above), sorted(other - set(ends))


def main():
    line = station.load_line()
    rows = fetch(line)
    day = opendata.updated(opendata.NYC, RID)
    recs, above, other = bake(rows, line)
    # every figure METHODOLOGY.md quotes about the avenues comes from these lines
    print('centreline %d ft. cross streets meeting it at street level: %d, ticked: %d'
          % (line.length, len(recs), sum(1 for x in recs if 'label' in x)))
    for x in recs:
        print('  %5d  %5d to %5d  %d ends  %-5s %s' % (x['ft'], x['a'], x['b'], len(x['c']), x.get('label', ''), x['name']))
    ticked = [x for x in recs if 'label' in x]
    print('west end to the middle of %s: %d ft   middle of %s to the east end: %d ft'
          % (ticked[0]['name'], ticked[0]['ft'], ticked[-1]['name'], line.length - ticked[-1]['ft']))
    print('ends on the street with none at street level, left out:', above)
    print('other kinds of way ending on the street, left out:', other)
    if '--check' in sys.argv:
        same = recs == station.read_global('AVES')
        dated = station.read_global('SOURCE_DATE').get('AVES')
        print('matches plan/data.js' if same else 'DIFFERS from plan/data.js')
        if dated != day:
            print('source date baked %s, source now %s' % (dated, day))
        sys.exit(0 if same else 1)
    print('plan/data.js AVES', station.write_global('AVES', recs, COMMENT))
    print('plan/data.js SOURCE_DATE', station.stamp('AVES', day))


if __name__ == '__main__':
    main()
