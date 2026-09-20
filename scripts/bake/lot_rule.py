"""Apply the lot rule and write window.LOTS_POLY. METHODOLOGY.md section 4.

The rule is frontage: a lot is in the set if any vertex of its boundary lies within FRONT_FT of
the LINE42 centreline. The right of way is about 100 ft wide (a 55 ft roadway and two walks of
about 20 and 25 ft), so the street line sits about 50 ft out and 60 ft leaves 10 ft of tolerance.
The address is not read.

The pool is scripts/bake/source/lots_pool.geojson, the 130 MapPLUTO lots baked near the
centreline before any rule was applied. A lot outside the rule is kept whole in window.LOTS_OUT
with its measured distance, so the station card can name it. It is not drawn and not counted.

  python3 scripts/bake/lot_rule.py            apply the rule and write plan/data.js
  python3 scripts/bake/lot_rule.py --check    compare with what is baked, write nothing
"""
import hashlib
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import station

FRONT_FT = 60
NEAR_FT = 10  # a lot this close to the threshold, either way, is printed as a near call
POOL = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'source', 'lots_pool.geojson')
GRAND_CENTRAL = '1012800001'

COMMENT = """/* Lots in the candidate pool with no boundary point within the frontage distance of the
   centreline, baked by scripts/bake/lot_rule.py. Each is the whole MapPLUTO feature with its
   measured distance (off, ft) and the reason in words (why). Not drawn, not counted.
   METHODOLOGY.md section 4. */"""
META_COMMENT = """/* The lot rule as it was run: the frontage distance in feet and the size of the candidate
   pool it was run over. Baked by scripts/bake/lot_rule.py. */"""


def read_pool():
    with open(POOL, 'rb') as f:
        raw = f.read()
    print('pool: %s  %d bytes  sha256 %s' % (os.path.relpath(POOL, station.ROOT), len(raw), hashlib.sha256(raw).hexdigest()))
    return json.loads(raw.decode('utf-8'))


def rings(geom):
    return [geom['coordinates'][0]] if geom['type'] == 'Polygon' else [p[0] for p in geom['coordinates']]


def nearest(feature):
    """Distance in feet from the centreline to the nearest vertex of the lot's outer boundary."""
    return min(abs(station.project(c[0], c[1])[2]) for r in rings(feature['geometry']) for c in r)


def split(pool):
    """(keep, out, off by bbl). Pure: features are copied, the pool is left as it was read."""
    keep, out, off = [], [], {}
    for f in pool:
        d = nearest(f)
        p = dict(f['properties'])
        off[p['bbl']] = d
        if d <= FRONT_FT:
            keep.append(dict(f, properties=p))
        else:
            p['off'] = round(d, 1)
            p['why'] = 'its boundary comes no nearer than %s ft to the centreline' % ('%.1f' % d).rstrip('0').rstrip('.')
            out.append(dict(f, properties=p))
    return keep, out, off


def other_street(addr):
    """True when the address names a numbered street other than 42. The rule of 19 Sep, kept
    only so a run can print what the change to frontage moved."""
    a = re.sub(r'\b([0-9]+)(ST|ND|RD|TH)\b', r'\1', ' '.join((addr or '').upper().split()))
    m = re.match(r'^(?:[0-9][0-9A-Z-]* )?(?:EAST|WEST|E|W) ([0-9]+) (?:STREET|ST)$', a)
    return bool(m) and m.group(1) != '42'


def unbuilt(fs):
    return sum(f['properties'].get('unbuilt') or 0 for f in fs)


def tally(label, fs):
    print('%s %d lots, %d with room, %d landmarked, unbuilt %d sq ft (%d of it on landmarked lots)' % (
        label, len(fs), sum(1 for f in fs if f['properties']['unbuilt'] > 0),
        sum(1 for f in fs if f['properties']['lm'] == 1), unbuilt(fs),
        unbuilt([f for f in fs if f['properties']['lm'] == 1])))


def row(f, off):
    p = f['properties']
    return '  %s  %-24s ft %5d %s  nearest %6.1f ft  unbuilt %8d%s' % (
        p['bbl'], p['addr'], p['ft'], p['side'], off[p['bbl']], p['unbuilt'], '  landmark' if p['lm'] == 1 else '')


def main():
    pool = read_pool()['features']
    lots = station.read_global('LOTS_POLY')
    try:
        gone = station.read_global('LOTS_OUT')
    except KeyError:
        gone = []
    baked_in = [f['properties']['bbl'] for f in lots['features']]

    # pool order is the drawn order, so a re-run leaves LOTS_POLY byte for byte as it was
    keep, out, off = split(pool)
    out.sort(key=lambda f: f['properties']['ft'])
    assert any(f['properties']['bbl'] == GRAND_CENTRAL for f in keep), 'Grand Central Terminal is not in the set'

    print('rule: a boundary vertex within %d ft of the centreline' % FRONT_FT)
    print('in: %d' % len(keep))
    for f in sorted(keep, key=lambda f: f['properties']['ft']):
        print(row(f, off))
    print('out: %d' % len(out))
    for f in out:
        print(row(f, off))
    near = [f for f in keep + out if abs(off[f['properties']['bbl']] - FRONT_FT) <= NEAR_FT]
    print('within %d ft of the threshold, either way: %d' % (NEAR_FT, len(near)))
    for f in sorted(near, key=lambda f: off[f['properties']['bbl']]):
        print(row(f, off), ' in' if f in keep else ' out')
    ins = sorted(off[f['properties']['bbl']] for f in keep)
    print('nearest vertex of the lots in: %.1f to %.1f ft, median %.1f' % (ins[0], ins[-1], ins[len(ins) // 2]))

    was = set(baked_in)
    now = set(f['properties']['bbl'] for f in keep)
    print('moved in since the last bake: %d' % len(now - was))
    for f in keep:
        if f['properties']['bbl'] not in was:
            print(row(f, off))
    print('moved out since the last bake: %d' % len(was - now))
    for f in out:
        if f['properties']['bbl'] in was:
            print(row(f, off))

    by_addr = [f for f in pool if not other_street(f['properties']['addr'])]
    held = set(f['properties']['bbl'] for f in by_addr)
    print('against the address rule of 19 Sep (lots addressed on another numbered street left):')
    tally('  address rule:', by_addr)
    came = [f for f in keep if f['properties']['bbl'] not in held]
    went = [f for f in out if f['properties']['bbl'] in held]
    print('  in under frontage, out under the address rule: %d, unbuilt %d sq ft' % (len(came), unbuilt(came)))
    for f in sorted(came, key=lambda f: f['properties']['ft']):
        print(' ', row(f, off))
    print('  out under frontage, in under the address rule: %d, unbuilt %d sq ft' % (len(went), unbuilt(went)))
    for f in went:
        print(' ', row(f, off))
    print('  out under both: %d' % len([f for f in out if f['properties']['bbl'] not in held]))

    tally('pool:  ', keep + out)
    tally('baked: ', [f for f in pool if f['properties']['bbl'] in was])
    tally('after: ', keep)

    meta = {'front_ft': FRONT_FT, 'pool': len(pool)}
    if '--check' in sys.argv:
        try:
            baked_meta = station.read_global('LOTS_META')
        except KeyError:
            baked_meta = None
        same = lots['features'] == keep and gone == out and baked_meta == meta
        print('matches plan/data.js' if same else 'DIFFERS from plan/data.js')
        sys.exit(0 if same else 1)
    lots['features'] = keep
    print('plan/data.js LOTS_POLY', station.write_global('LOTS_POLY', lots))
    print('plan/data.js LOTS_OUT', station.write_global('LOTS_OUT', out, COMMENT))
    print('plan/data.js LOTS_META', station.write_global('LOTS_META', meta, META_COMMENT))


if __name__ == '__main__':
    main()
