"""Apply the lot rule to window.LOTS_POLY. METHODOLOGY.md section 4.

The rule: a lot is in the set if it is addressed on 42nd Street. The address is normalised
first (capitals, single spaces, ordinal suffix stripped) so "42Nd", "42ND" and "42" all read
as 42, East and West alike. Every lot falls in one of three classes:

  on42     addressed on East or West 42 Street              stays
  other    addressed on another numbered street (41, 43)   leaves
  corner   addressed on an avenue, Broadway, a place, or    stays, and is listed, until the
           with no house number                             author rules on it (--strict)

Lots that leave are kept whole, geometry included, in window.LOTS_OUT with the reason, so the
step can be re-run, checked and reversed. The pool is always LOTS_POLY plus LOTS_OUT.

  python3 scripts/bake/lot_rule.py            apply the rule and write plan/data.js
  python3 scripts/bake/lot_rule.py --check    compare with what is baked, write nothing
  python3 scripts/bake/lot_rule.py --strict   report the literal reading (corner lots leave as
                                              well); writes nothing, the author has not ruled
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import station

STREET = re.compile(r'^(?:[0-9][0-9A-Z-]* )?(?:EAST|WEST|E|W) ([0-9]+) (?:STREET|ST)$')

COMMENT = """/* Lots taken out of window.LOTS_POLY by the lot rule, baked by scripts/bake/lot_rule.py.
   Each is the whole MapPLUTO feature as it was drawn, with why it left. Not drawn, not
   counted. METHODOLOGY.md section 4. */"""


def normalise(addr):
    a = ' '.join((addr or '').upper().split())
    return re.sub(r'\b([0-9]+)(ST|ND|RD|TH)\b', r'\1', a)


def classify(addr):
    """('on42' | 'other' | 'corner', the numbered street it names or None)."""
    m = STREET.match(normalise(addr))
    if not m:
        return 'corner', None
    return ('on42' if m.group(1) == '42' else 'other'), int(m.group(1))


def why(kind, n):
    return 'addressed on %d Street' % n if kind == 'other' else 'not addressed on 42 Street'


def split(pool, strict):
    """(keep, out, kinds). Pure: features are copied, the pool is left as it was read."""
    keep, out, kinds = [], [], {}
    for f in pool:
        p = {k: v for k, v in f['properties'].items() if k != 'why'}
        kind, n = classify(p.get('addr'))
        if kind == 'other' or (strict and kind == 'corner'):
            p['why'] = why(kind, n)
        g = dict(f, properties=p)
        kinds.setdefault(kind, []).append(g)
        (out if 'why' in p else keep).append(g)
    return keep, out, kinds


def unbuilt(fs):
    return sum(f['properties'].get('unbuilt') or 0 for f in fs)


def main():
    strict = '--strict' in sys.argv
    lots = station.read_global('LOTS_POLY')
    try:
        gone = station.read_global('LOTS_OUT')
    except KeyError:
        gone = []
    baked_in = [f['properties']['bbl'] for f in lots['features']]
    baked_out = [f['properties']['bbl'] for f in gone]

    # drawn order first, so a re-run leaves LOTS_POLY byte for byte as it was
    keep, out, kinds = split(lots['features'] + gone, strict)
    out.sort(key=lambda f: f['properties']['ft'])
    print('pool: %d lots   rule: %s' % (len(keep) + len(out), 'strict' if strict else 'numbered streets leave'))
    for k in ('on42', 'other', 'corner'):
        print('  %-6s %3d lots   unbuilt %d sq ft' % (k, len(kinds.get(k, [])), unbuilt(kinds.get(k, []))))
    print('leave: %d' % len(out))
    for f in out:
        p = f['properties']
        print('  %s  %-24s ft %5d %s  unbuilt %7d  %s' % (p['bbl'], p['addr'], p['ft'], p['side'], p['unbuilt'], p['why']))
    if not strict:
        print('stay without a 42 Street address: %d' % len(kinds.get('corner', [])))
        for f in kinds.get('corner', []):
            p = f['properties']
            print('  %s  %-24s ft %5d %s  unbuilt %7d' % (p['bbl'], p['addr'], p['ft'], p['side'], p['unbuilt']))
    print('before: %d lots, %d with room, %d landmarked, unbuilt %d sq ft' % (
        len(keep) + len(out), sum(1 for f in keep + out if f['properties']['unbuilt'] > 0),
        sum(1 for f in keep + out if f['properties']['lm'] == 1), unbuilt(keep + out)))
    print('after:  %d lots, %d with room, %d landmarked, unbuilt %d sq ft' % (
        len(keep), sum(1 for f in keep if f['properties']['unbuilt'] > 0),
        sum(1 for f in keep if f['properties']['lm'] == 1), unbuilt(keep)))

    same = (baked_in == [f['properties']['bbl'] for f in keep]
            and baked_out == [f['properties']['bbl'] for f in out])
    if strict:
        print('strict is a report only: plan/data.js is not written')
        return
    if '--check' in sys.argv:
        print('matches plan/data.js' if same else 'DIFFERS from plan/data.js')
        sys.exit(0 if same else 1)
    lots['features'] = keep
    print('plan/data.js LOTS_POLY', station.write_global('LOTS_POLY', lots))
    print('plan/data.js LOTS_OUT', station.write_global('LOTS_OUT', out, COMMENT))


if __name__ == '__main__':
    main()
