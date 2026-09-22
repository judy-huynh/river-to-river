"""Stationing library for River to River. Every bake script imports this.

Loads LINE42 out of plan/data.js and answers one question: how many feet along
42nd Street is this? Stdlib only. See METHODOLOGY.md section 1.
"""
import json
import math
import os
import re

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
DATA_JS = os.path.join(ROOT, 'plan', 'data.js')

FT_PER_DEG_LAT = 364000.0  # local flat approximation, good to well under a foot at this extent


def read_global(name, path=DATA_JS):
    """Return the parsed JSON value of one window.<name>= line in data.js."""
    with open(path, encoding='utf-8') as f:
        for line in f:
            if line.startswith('window.%s=' % name):
                return json.loads(line[len(name) + 8:].rstrip().rstrip(';'))
    raise KeyError('window.%s not found in %s' % (name, path))


def write_global(name, value, comment=None, path=DATA_JS):
    """Replace window.<name>= in place, or append it. Each global is one line.

    A replaced global keeps the comment block above it unless a new comment is passed.
    Returns 'replaced', 'appended' or 'unchanged'.
    """
    body = 'window.%s=%s;' % (name, json.dumps(value, separators=(',', ':'), ensure_ascii=False))
    with open(path, encoding='utf-8') as f:
        lines = f.read().split('\n')
    block = ([comment.rstrip('\n')] if comment else []) + [body]
    at = next((i for i, l in enumerate(lines) if l.startswith('window.%s=' % name)), None)
    if at is None:
        while lines and lines[-1] == '':
            lines.pop()
        out, how = lines + [''] + block + [''], 'appended'
    else:
        start = at
        if comment:
            start = _comment_start(lines, at)
        out, how = lines[:start] + block + lines[at + 1:], 'replaced'
    if out == lines:
        return 'unchanged'
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        f.write('\n'.join(out))
    os.replace(tmp, path)  # atomic, a failed bake never leaves half a data.js
    return how


# a record is on the street when its source names East or West 42 Street, however it abbreviates
ON_42 = re.compile(r'^(E|W|EAST|WEST)\s+42(ND)?\s+(ST|STREET)$')


def on_42(name):
    """True when a source's street name field reads East or West 42 Street."""
    return bool(ON_42.match(' '.join((name or '').upper().split())))


SOURCE_DATE_COMMENT = """/* The date each publisher last changed its rows, read from the portal when the set was baked.
   Kept apart from the sets so a bake still compares record for record. */"""


def stamp(name, day, path=DATA_JS):
    """Record the source date of one baked global in window.SOURCE_DATE."""
    try:
        dates = read_global('SOURCE_DATE', path)
    except KeyError:
        dates = {}
    dates[name] = day
    return write_global('SOURCE_DATE', dict(sorted(dates.items())), SOURCE_DATE_COMMENT, path)


def _comment_start(lines, at):
    """Index of the first line of the /* */ block sitting directly above lines[at]."""
    if at == 0 or not lines[at - 1].rstrip().endswith('*/'):
        return at
    i = at - 1
    while i > 0 and '/*' not in lines[i]:
        i -= 1
    return i if '/*' in lines[i] else at


class Line:
    """A stationed centreline: a list of [station_ft, lon, lat] vertices."""

    def __init__(self, verts):
        self.verts = verts
        self.lat0 = sum(v[2] for v in verts) / len(verts)
        self.kx = FT_PER_DEG_LAT * math.cos(math.radians(self.lat0))
        self.ky = FT_PER_DEG_LAT
        self.xy = [self.to_xy(v[1], v[2]) for v in verts]
        self.length = verts[-1][0]

    def to_xy(self, lon, lat):
        """Degrees to local feet. Longitude is scaled by the cosine of the mean latitude."""
        return (lon * self.kx, lat * self.ky)

    def _nearest(self, lon, lat):
        """(distance_ft, segment index, t along it, signed cross) for the closest segment."""
        px, py = self.to_xy(lon, lat)
        best = None
        for i in range(len(self.xy) - 1):
            (ax, ay), (bx, by) = self.xy[i], self.xy[i + 1]
            dx, dy = bx - ax, by - ay
            L2 = dx * dx + dy * dy
            if L2 == 0:
                continue
            # clamp so a point past either end stations at the end, never beyond it
            t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L2))
            d = math.hypot(px - (ax + t * dx), py - (ay + t * dy))
            if best is None or d < best[0]:
                best = (d, i, t, dx * (py - ay) - dy * (px - ax))
        return best

    def project(self, lon, lat):
        """(station_ft, side, offset_ft). side is +1 north, -1 south, by cross product."""
        d, i, t, cross = self._nearest(lon, lat)
        a, b = self.verts[i][0], self.verts[i + 1][0]
        return (a + t * (b - a), 1 if cross > 0 else -1, d)

    def band(self, coords):
        """(a_ft, b_ft) for a line: both endpoints projected, low station first."""
        s0 = self.project(*coords[0][:2])[0]
        s1 = self.project(*coords[-1][:2])[0]
        return (min(s0, s1), max(s0, s1))

    def heading_at(self, ft):
        """Compass bearing in degrees of the centreline at a station, west to east."""
        i = 0
        while i < len(self.verts) - 2 and self.verts[i + 1][0] <= ft:
            i += 1
        (ax, ay), (bx, by) = self.xy[i], self.xy[i + 1]
        return math.degrees(math.atan2(bx - ax, by - ay)) % 360

    def flat_length(self):
        """Centreline length in the library's local flat feet, to compare with the baked stations."""
        return sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(self.xy, self.xy[1:]))

    def ellipsoid_length(self):
        """The same length with WGS84 feet per degree at the mean latitude. An independent check."""
        a, e2, phi = 6378137.0, 0.00669437999014, math.radians(self.lat0)
        w = 1 - e2 * math.sin(phi) ** 2
        ky = math.radians(a * (1 - e2) / w ** 1.5) / 0.3048
        kx = math.radians(a / math.sqrt(w) * math.cos(phi)) / 0.3048
        return sum(math.hypot((b[1] - a_[1]) * kx, (b[2] - a_[2]) * ky)
                   for a_, b in zip(self.verts, self.verts[1:]))

    def bearing(self, p, q):
        """Compass bearing in degrees from p to q, both [lon, lat], in the same local feet."""
        (ax, ay), (bx, by) = self.to_xy(*p[:2]), self.to_xy(*q[:2])
        return math.degrees(math.atan2(bx - ax, by - ay)) % 360


def axis_diff(a, b):
    """Angle between two bearings treated as undirected axes, 0 to 90 degrees."""
    d = abs(a - b) % 180
    return min(d, 180 - d)


def load_line(name='LINE42', path=DATA_JS):
    return Line(read_global(name, path))


_line = None


def _default():
    global _line
    if _line is None:
        _line = load_line()
    return _line


def project(lon, lat):
    return _default().project(lon, lat)


def band(coords):
    return _default().band(coords)


def heading_at(ft):
    return _default().heading_at(ft)
