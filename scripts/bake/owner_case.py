"""Re-case the owner names in window.LOTS_POLY. METHODOLOGY.md section 4a.

MapPLUTO publishes owner names in capitals. The first lot bake title-cased them word by
word, which turned NYC into "Nyc", LLC into "Llc", 42ND into "42Nd" and 'S into "'S".
This step repairs that and nothing else. It reads the baked names, so it changes no
record's owner, only its letters. It is idempotent, and the lot bake that replaces the
current set should pass the raw PLUTO name through case_owner() as well.

  python3 scripts/bake/owner_case.py            re-case into plan/data.js
  python3 scripts/bake/owner_case.py --check    compare with what is baked, write nothing
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import station

# Written in capitals wherever they stand as a whole word. Only terms that are unambiguous.
UPPER = {'nyc', 'ny', 'nj', 'llc', 'lp', 'mta', 'reit', 'ii', 'iii', 'usa'}
# Lower case unless first.
SMALL = {'of', 'and', 'the', 'for', 'at'}


def case_owner(name):
    if not name:
        return name

    def word(m):
        w, low = m.group(0), m.group(0).lower()
        if low in UPPER:
            return low.upper()
        if low in SMALL and m.start() > 0:
            return low
        if re.fullmatch(r"\d+(st|nd|rd|th)", low):
            return low
        return w[0].upper() + w[1:].lower() if w.isupper() else w

    out = re.sub(r"[A-Za-z0-9]+", word, name)
    return re.sub(r"'S\b", "'s", out)


def main():
    lots = station.read_global('LOTS_POLY')
    changed = 0
    for f in lots['features']:
        p = f['properties']
        new = case_owner(p.get('owner'))
        if new != p.get('owner'):
            changed += 1
            print('%s  ->  %s' % (p['owner'], new))
            p['owner'] = new
    print('lots: %d   owner names re-cased: %d' % (len(lots['features']), changed))
    if '--check' in sys.argv:
        print('matches plan/data.js' if not changed else 'DIFFERS from plan/data.js')
        sys.exit(0 if not changed else 1)
    print('plan/data.js LOTS_POLY', station.write_global('LOTS_POLY', lots))


if __name__ == '__main__':
    main()
