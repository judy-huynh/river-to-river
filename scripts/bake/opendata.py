"""Fetch rows from a Socrata open data portal (NYC Open Data, data.ny.gov). Stdlib only.

Small sets are read straight from the API, not cached: a re-run is meant to see the source as
it stands today. Every fetch prints the row count, byte size and sha256, and the date the
publisher last changed the rows.
"""
import datetime
import hashlib
import json
import urllib.parse
import urllib.request

NYC = 'data.cityofnewyork.us'
NYS = 'data.ny.gov'


def _get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'river-to-river bake'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def rows(domain, rid, where=None, limit=50000):
    """All rows of one resource matching a SoQL where clause, in the publisher's :id order."""
    q = {'$limit': limit, '$order': ':id'}
    if where:
        q['$where'] = where
    url = 'https://%s/resource/%s.json?%s' % (domain, rid, urllib.parse.urlencode(q))
    raw = _get(url)
    out = json.loads(raw.decode('utf-8'))
    print('source %s  %d rows  %d bytes  sha256 %s' % (url, len(out), len(raw), hashlib.sha256(raw).hexdigest()))
    if len(out) >= limit:
        raise SystemExit('row limit %d reached, the set is truncated' % limit)
    return out


def updated(domain, rid):
    """ISO date (UTC) the publisher last changed the rows, from the portal's own metadata."""
    meta = json.loads(_get('https://%s/api/views/%s.json' % (domain, rid)).decode('utf-8'))
    day = datetime.datetime.fromtimestamp(meta['rowsUpdatedAt'], datetime.timezone.utc).date().isoformat()
    print('source %s rows last updated %s' % (rid, day))
    return day
