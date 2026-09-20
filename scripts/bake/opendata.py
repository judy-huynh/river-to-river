"""Fetch rows from a Socrata open data portal (NYC Open Data, data.ny.gov). Stdlib only.

Small sets are read straight from the API, not cached: a re-run is meant to see the source as
it stands today. Every fetch prints the row count, byte size and sha256, and the date the
publisher last changed the rows.
"""
import datetime
import hashlib
import json
import time
import urllib.error
import urllib.parse
import urllib.request

NYC = 'data.cityofnewyork.us'
NYS = 'data.ny.gov'


TRIES = 3   # the portal is slow on a wide read: a timed out fetch is tried again before the bake gives up


def _get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'river-to-river bake'})
    for left in range(TRIES - 1, -1, -1):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return r.read()
        except (TimeoutError, urllib.error.URLError) as e:
            if not left or isinstance(e, urllib.error.HTTPError):
                raise
            print('fetch failed (%s), trying again' % e)
            time.sleep(3)


def rows(domain, rid, where=None, limit=50000, select=None):
    """All rows of one resource matching a SoQL where clause, in the publisher's :id order.
    select names the columns to read, for a source too wide to read whole."""
    q = {'$limit': limit, '$order': ':id'}
    if where:
        q['$where'] = where
    if select:
        q['$select'] = select
    url = 'https://%s/resource/%s.json?%s' % (domain, rid, urllib.parse.urlencode(q))
    raw = _get(url)
    out = json.loads(raw.decode('utf-8'))
    print('source %s  %d rows  %d bytes  sha256 %s' % (url, len(out), len(raw), hashlib.sha256(raw).hexdigest()))
    if len(out) >= limit:
        raise SystemExit('row limit %d reached, the set is truncated' % limit)
    return out


def grouped(domain, rid, by):
    """Row counts of one resource grouped by the named columns, over the whole set."""
    q = {'$select': '%s,count(*) as n' % by, '$group': by, '$order': by}
    url = 'https://%s/resource/%s.json?%s' % (domain, rid, urllib.parse.urlencode(q))
    raw = _get(url)
    print('source %s  %d bytes  sha256 %s' % (url, len(raw), hashlib.sha256(raw).hexdigest()))
    return json.loads(raw.decode('utf-8'))


def updated(domain, rid):
    """ISO date (UTC) the publisher last changed the rows, from the portal's own metadata."""
    meta = json.loads(_get('https://%s/api/views/%s.json' % (domain, rid)).decode('utf-8'))
    day = datetime.datetime.fromtimestamp(meta['rowsUpdatedAt'], datetime.timezone.utc).date().isoformat()
    print('source %s rows last updated %s' % (rid, day))
    return day
