import hashlib
import importlib.util
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import tempfile
import threading
import unittest
import sys

spec = importlib.util.spec_from_file_location('local_image_setup', Path(__file__).parents[1] / 'scripts/setup-local-image.py')
sys.path.insert(0, str(Path(__file__).parents[1] / 'scripts'))
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)


class ResumableDownloadTests(unittest.TestCase):
    def setUp(self):
        self.data = b'local image model weights' * 1000
        self.seen_ranges = []
        data, ranges = self.data, self.seen_ranges
        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                requested = self.headers.get('Range', 'bytes=0-')
                ranges.append(requested)
                offset = int(requested.removeprefix('bytes=').split('-')[0])
                if self.path == '/error':
                    self.send_response(500); self.end_headers(); return
                self.send_response(206)
                self.send_header('Content-Range', f'bytes {offset}-{len(data)-1}/{len(data)}')
                self.send_header('Content-Length', str(len(data) - offset))
                self.end_headers(); self.wfile.write(data[offset:])
            def log_message(self, *args): pass
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.target = Path(self.folder.name) / 'weights.bin'
        self.url = f'http://127.0.0.1:{self.server.server_port}/weights'
        self.sha = hashlib.sha256(data).hexdigest()

    def test_download_resumes_exact_partial_bytes_and_checks_hash(self):
        self.target.with_suffix('.bin.part').write_bytes(self.data[:200])
        setup.download_resumable(self.url, self.target, len(self.data), self.sha, retry_delay=0)
        self.assertEqual(self.seen_ranges, ['bytes=200-'])
        self.assertEqual(self.target.read_bytes(), self.data)
        self.assertFalse(self.target.with_suffix('.bin.part').exists())

    def test_corrupted_final_file_is_downloaded_again(self):
        self.target.write_bytes(b'x' * len(self.data))
        setup.download_resumable(self.url, self.target, len(self.data), self.sha, retry_delay=0)
        self.assertEqual(self.target.read_bytes(), self.data)

    def test_failed_server_stops_after_bounded_retries(self):
        with self.assertRaisesRegex(RuntimeError, '下载失败'):
            setup.download_resumable(self.url.replace('/weights', '/error'), self.target, len(self.data), self.sha, max_attempts=2, retry_delay=0)
        self.assertEqual(len(self.seen_ranges), 2)


if __name__ == '__main__': unittest.main()
