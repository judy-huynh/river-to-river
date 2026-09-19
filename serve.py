#!/usr/bin/env python3
"""Local dev server for River to River.

Plain `python3 -m http.server` lets the browser cache style.css and scripts.js, so
edits appear not to take effect and you end up debugging a stale page. This serves
everything with no-store, so a normal refresh always shows what is on disk.

    python3 serve.py          # http://127.0.0.1:8042
    python3 serve.py 9000     # another port
"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):   # one quiet line per request
        sys.stderr.write("  %s\n" % (fmt % args))


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8042
handler = partial(NoCache, directory=".")
print(f"\n  River to River\n  http://127.0.0.1:{port}/plan/\n  http://127.0.0.1:{port}/analysis/\n"
      f"\n  Nothing is cached, so Cmd+R is enough. Ctrl+C to stop.\n")
ThreadingHTTPServer(("127.0.0.1", port), handler).serve_forever()
