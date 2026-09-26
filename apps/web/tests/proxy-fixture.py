"""Disposable Docker proxy fixture, no production credentials."""
import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        data = json.dumps({'instance': os.environ['INSTANCE'], 'path': self.path,
                           'authorized': self.headers.get('Authorization') == 'Bearer synthetic'}).encode()
        self.send_response(200)
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)


HTTPServer(('0.0.0.0', 8000), Handler).serve_forever()
