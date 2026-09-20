"""Bake the six fieldwork count stations into field/index.html. METHODOLOGY.md section 6a.

No outside source. The stations are derived from what is already baked: LINE42, the cross
streets in window.AVES and the city's counter in window.PED_COUNT. The tally page has to open
with no network, so it cannot load plan/data.js and the stations are written into it.

  python3 scripts/bake/field_stations.py            re-derive, write into field/index.html and
                                                    into the station table of METHODOLOGY.md 6a
  python3 scripts/bake/field_stations.py --check    compare both with a fresh derivation, and the
                                                    minutes and seconds in 6a with the page, write nothing
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import station

PAGE = os.path.join(station.ROOT, 'field', 'index.html')
DOC = os.path.join(station.ROOT, 'METHODOLOGY.md')
DOC_HEAD = '| Station | Between | station_ft | lon | lat |'

# A station stands mid-block, as the city's counter does: half way between the facing edges of
# two cross streets that are neighbours in window.AVES. Named here, placed by the data.
# The fifth is the counter itself, at the city's own point.
BLOCKS = [('West end', '12 Avenue', '11 Avenue'),
          ('9 Avenue', 'Dyer Avenue', '9 Avenue'),
          ('Times Square', '7 Avenue', 'Broadway'),
          ('Bryant Park', 'Avenue of the Americas', '5 Avenue'),
          ('City counter', None, None),
          ('East end', '2 Avenue', '1 Avenue')]

# The hour counted inside each of the city's windows, 24 hour clock. Checked below against
# window.PED_COUNT.windows, so an hour can never sit outside the window it scales against.
HOURS = {'am': (8, 9), 'md': (12, 13), 'pm': (17, 18)}


def point_at(verts, ft):
    """lon, lat of a station on the centreline, interpolated between its baked vertices."""
    for a, b in zip(verts, verts[1:]):
        if a[0] <= ft <= b[0]:
            t = (ft - a[0]) / (b[0] - a[0])
            return a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2])
    raise ValueError('station %s is off the line' % ft)


def stations(line, aves, ped):
    names = [a['name'] for a in aves]
    out = []
    for name, w, e in BLOCKS:
        if w is None:
            out.append({'name': name, 'ft': ped['ft'], 'lon': ped['lon'], 'lat': ped['lat'],
                        'from': ped['from'], 'to': ped['to'], 'counter': True})
            continue
        i = names.index(w)
        if names[i + 1] != e:
            raise SystemExit('%s and %s are no longer neighbours in window.AVES' % (w, e))
        ft = int((aves[i]['b'] + aves[i + 1]['a']) / 2 + 0.5)
        lon, lat = point_at(line.verts, ft)
        back, _, off = line.project(lon, lat)   # the point must station back to where it was put
        if abs(back - ft) > 0.5 or off > 0.5:
            raise SystemExit('%s: put at %d, stations back at %.1f, %.1f ft off' % (name, ft, back, off))
        out.append({'name': name, 'ft': ft, 'lon': round(lon, 6), 'lat': round(lat, 6), 'from': w, 'to': e})
    if [s['ft'] for s in out] != sorted(s['ft'] for s in out):
        raise SystemExit('stations are not in order west to east')
    return out


def windows(ped):
    out = []
    for k in ('am', 'md', 'pm'):
        a, b = HOURS[k]
        w = ped['windows'][k]
        if not (w['from'] <= a and b <= w['to']):
            raise SystemExit('%s hour %d to %d is outside the city window %d to %d' % (k, a, b, w['from'], w['to']))
        out.append({'id': k, 'from': a, 'to': b, 'day': w['day'], 'city': [w['from'], w['to']]})
    return out


def read_const(name):
    with open(PAGE, encoding='utf-8') as f:
        for l in f:
            if l.startswith('const %s=' % name):
                return json.loads(l[len(name) + 7:].rstrip().rstrip(';'))
    raise KeyError('const %s not found in %s' % (name, PAGE))


def write_const(name, value):
    """Replace the one line const <name>= in the page. The line has to be there already."""
    body = 'const %s=%s;' % (name, json.dumps(value, separators=(',', ':'), ensure_ascii=False))
    with open(PAGE, encoding='utf-8') as f:
        lines = f.read().split('\n')
    at = next(i for i, l in enumerate(lines) if l.startswith('const %s=' % name))
    if lines[at] == body:
        return 'unchanged'
    lines[at] = body
    tmp = PAGE + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))
    os.replace(tmp, PAGE)
    return 'replaced'


def doc_table(S):
    """The station table as METHODOLOGY.md 6a prints it, so the doc cannot drift from the page."""
    return [DOC_HEAD, '|---|---|---|---|---|'] + [
        '| %s | %s and %s | %s | %.6f | %.6f |' % (s['name'], s['from'], s['to'], format(s['ft'], ','), s['lon'], s['lat'])
        for s in S]


def doc_span(lines):
    at = lines.index(DOC_HEAD)
    end = at
    while end < len(lines) and lines[end].startswith('|'):
        end += 1
    return at, end


def read_doc():
    with open(DOC, encoding='utf-8') as f:
        lines = f.read().split('\n')
    at, end = doc_span(lines)
    return lines[at:end]


def write_doc(S):
    with open(DOC, encoding='utf-8') as f:
        lines = f.read().split('\n')
    at, end = doc_span(lines)
    if lines[at:end] == doc_table(S):
        return 'unchanged'
    lines[at:end] = doc_table(S)
    tmp = DOC + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))
    os.replace(tmp, DOC)
    return 'replaced'


WORDS = {5: 'five', 10: 'ten', 15: 'fifteen', 20: 'twenty'}


def doc_constants():
    """Section 6a states the session length, the beat and the gap in prose. The page owns the
    values (MINUTES, BEAT, GAP), so the prose is checked against the page. Returns the faults."""
    with open(PAGE, encoding='utf-8') as f:
        page = f.read()
    minutes, beat, gap = (int(re.search(r'\b%s=(\d+)' % k, page).group(1)) for k in ('MINUTES', 'BEAT', 'GAP'))
    beat, gap = beat // 1000, gap // 1000
    with open(DOC, encoding='utf-8') as f:
        doc = f.read()
    sec = doc[doc.index('## 6a.'):doc.index('## 7.')]
    faults = []
    for phrase in ('every %d seconds' % beat, 'longer than %d seconds' % gap, '%d seconds or less' % gap,
                   '%s minutes' % WORDS.get(minutes, str(minutes))):
        if phrase not in ' '.join(sec.split()):
            faults.append('6a does not say "%s"' % phrase)
    for n in re.findall(r'(?<![\d.])(\d+) seconds', sec):
        if int(n) not in (beat, gap):
            faults.append('6a says %s seconds, the page has BEAT %d and GAP %d' % (n, beat, gap))
    for n in re.findall(r'(?<![\d.])(\d+) minutes', sec):
        if int(n) != minutes:
            faults.append('6a says %s minutes, the page has MINUTES %d' % (n, minutes))
    return faults


def main():
    line = station.load_line()
    ped = station.read_global('PED_COUNT')
    S = stations(line, station.read_global('AVES'), ped)
    W = windows(ped)
    for s in S:
        print('%-13s station %5d  %.6f, %.6f  %s to %s' % (s['name'], s['ft'], s['lon'], s['lat'], s['from'], s['to']))
    for w in W:
        print('%s  %d to %d, %s, inside the city window %d to %d' % (w['id'], w['from'], w['to'], w['day'], w['city'][0], w['city'][1]))
    if '--check' in sys.argv:
        same = S == read_const('STATIONS') and W == read_const('WINDOWS')
        print('matches field/index.html' if same else 'DIFFERS from field/index.html')
        doc = read_doc() == doc_table(S)
        print('matches the METHODOLOGY.md 6a table' if doc else 'DIFFERS from the METHODOLOGY.md 6a table')
        faults = doc_constants()
        print('\n'.join(faults) if faults else 'METHODOLOGY.md 6a minutes and seconds match the page')
        sys.exit(0 if same and doc and not faults else 1)
    print('field/index.html STATIONS', write_const('STATIONS', S))
    print('field/index.html WINDOWS', write_const('WINDOWS', W))
    print('METHODOLOGY.md 6a station table', write_doc(S))
    faults = doc_constants()
    if faults:
        raise SystemExit('\n'.join(faults))


if __name__ == '__main__':
    main()
