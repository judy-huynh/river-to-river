"""Station the stretches a published vision names and write window.VISION. METHODOLOGY.md section 3h.

The source is an article, read by a person. There is no file to fetch, so what was read is
written down here once: each stretch the piece names, the two ends the piece gives it, and a
short paraphrase of what it proposes there. Nothing is quoted. An end is a cross street named as
window.AVES names it, or None for the end of LINE42 on that river. No station is typed: a and b
are read from window.AVES, so a stretch moves with the avenues when they are re-baked.

stated is True when the piece gives both ends itself. Where the piece names a place and gives no
ends, the ends are the nearest avenue crossings either side of the place, or the end of LINE42
where no crossing lies beyond it, stated is False, and
the page and METHODOLOGY.md call the stretch approximate.

  python3 scripts/bake/vision.py            station the stretches and write plan/data.js
  python3 scripts/bake/vision.py --check    compare with what is baked, write nothing
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import station

SOURCE = {
    'by': 'KPF',
    'title': 'A Fix for 42nd Street',
    'url': 'https://www.kpf.com/story/a-fix-for-42nd-street',
    'published': '2026-02-13',  # the page's own datePublished
    'accessed': '2026-09-20',
}

# the one proposal the piece makes for the whole street. kept with the record and in METHODOLOGY.md,
# the card prints only the stretch's own line
WHOLE = 'A streetcar from river to river, ending at a new ferry terminal on each river.'

# (west end, east end, stated by the piece, the place as the piece names it, what it proposes,
#  and for a given extent the piece states away from the proposal, where it states it)
STRETCHES = [
    (None, '9 Avenue', True, 'Hudson River to Ninth Avenue',
     'Traffic limited to a streetcar and bike lanes on one side of the street, with new parkland '
     'on the space that frees. New housing around a plaza on the middle block.', None),
    ('8 Avenue', 'Avenue of the Americas', False, 'Times Square',
     'Traffic limited to a streetcar and bike lanes, and the space for people on foot doubled, '
     'as a plaza with seating, planting and room for performance.', None),
    ('5 Avenue', 'Park Avenue', True, 'Fifth Avenue to Park Avenue',
     'Parts of the street closed to vehicles at rush hours and at lunchtime, with shaded '
     'seating and planting.', None),
    ('Lexington Avenue', '2 Avenue', True, 'Lexington Avenue to Second Avenue',
     'Protected bike lanes, street trees along the whole stretch, and some parking spaces made '
     'into shaded seating and benches.',
     'The piece gives this extent where it describes the office cluster east of Grand Central.'),
    # the piece says the far east end of the street, so the east end is the end of LINE42
    ('2 Avenue', None, False, 'the far east end',
     'Pocket parks in place of some parking spaces, for a time.', None),
]

COMMENT = """/* The stretches a published vision names, on the street's own stations. Read from the article
   by a person and written down in scripts/bake/vision.py, which bakes this. a/b are feet along
   LINE42, read from window.AVES at the cross streets named in from and to; a null from or to is
   the end of LINE42 on that river. stated is true when the piece gives both ends itself, false
   when it names a place and the ends are the nearest avenue crossings either side: those are
   approximate. place is the stretch as the piece names it. basis, where there is one, says the
   piece gives the extent away from the proposal. says and whole are paraphrase and nothing is quoted. accessed is the day the piece was read. METHODOLOGY.md section 3h. */"""


def bake(aves, length):
    at = {v['name']: v for v in aves}
    out = []
    for west, east, stated, place, says, basis in STRETCHES:
        for n in (west, east):
            if n is not None and n not in at:
                raise SystemExit('no cross street named %r in window.AVES' % n)
        # an end is the middle of its crossing, so two stretches that meet at an avenue meet there
        a = 0 if west is None else at[west]['ft']
        b = length if east is None else at[east]['ft']
        if not b > a:
            raise SystemExit('%s: east end is not east of west end' % place)
        out.append({'a': a, 'b': b, 'from': west, 'to': east, 'stated': stated, 'place': place, 'says': says, 'basis': basis})
    out.sort(key=lambda s: s['a'])
    for p, q in zip(out, out[1:]):
        if q['a'] < p['b']:
            raise SystemExit('stretches overlap: %s and %s' % (p['place'], q['place']))
    return dict(SOURCE, whole=WHOLE, stretches=out)


def main():
    line = station.load_line()
    length = line.length
    aves = station.read_global('AVES')
    rec = bake(aves, length)
    # every figure METHODOLOGY.md quotes about the stretches comes from these lines
    covered = 0
    for s in rec['stretches']:
        covered += s['b'] - s['a']
        print('  %5d to %5d  %5d ft  %-11s %s  (%s to %s)' % (s['a'], s['b'], s['b'] - s['a'],
              'stated' if s['stated'] else 'approximate', s['place'], s['from'] or 'west end', s['to'] or 'east end'))
    print('stretches: %d   stated: %d   approximate: %d' % (len(rec['stretches']),
          sum(s['stated'] for s in rec['stretches']), sum(not s['stated'] for s in rec['stretches'])))
    print('feet inside a stretch: %d of %d' % (covered, length))
    last = max(aves, key=lambda v: v['ft'])
    print('east end of LINE42 is %d ft past %s, the last avenue crossing' % (length - last['ft'], last['name']))
    if '--check' in sys.argv:
        try:
            same = rec == station.read_global('VISION')
        except KeyError:
            same = False
        print('matches plan/data.js' if same else 'DIFFERS from plan/data.js')
        sys.exit(0 if same else 1)
    print('plan/data.js VISION', station.write_global('VISION', rec, COMMENT))


if __name__ == '__main__':
    main()
