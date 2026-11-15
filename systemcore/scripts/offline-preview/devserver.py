import http.server, os, sys
ROOT = sys.argv[1] if len(sys.argv) > 1 else '.'
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 8731
PUBLIC_PREFIXES = ('/textures/', '/models/', '/draco/', '/data/')

class Handler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        for pfx in PUBLIC_PREFIXES:
            if path.startswith(pfx):
                path = '/public' + path
                break
        self.directory = ROOT
        return super().translate_path(path)

os.chdir(ROOT)
with http.server.ThreadingHTTPServer(('0.0.0.0', PORT), Handler) as httpd:
    httpd.serve_forever()
