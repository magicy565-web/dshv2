"""Exercise the shipped connector against an ephemeral HTTP receiver."""
import importlib.util
import json
import os
from pathlib import Path
import queue
import subprocess
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import patch

source = Path(__file__).parents[1] / "connector/computer_connector.py"
spec = importlib.util.spec_from_file_location("connector", source)
connector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(connector)


class ConnectorTests(unittest.TestCase):
    def test_credentials_cannot_be_forwarded_to_redirects_or_insecure_hosts(self):
        for origin in ("http://example.com", "https://user:secret@example.com", "https://example.com/?token=x", "https://example.com/path"):
            with self.assertRaises(ValueError):
                connector.endpoint(origin)
        self.assertEqual(connector.endpoint("https://example.com/"), "https://example.com")
        self.assertIsNone(connector.NoRedirect().redirect_request(None, None, 302, None, None, "https://other.example"))

    def test_text_and_pointer_actions_do_not_invoke_a_shell(self):
        frames = {"frame": ({"width": 100, "height": 100}, (20, 30))}
        with patch.object(connector.subprocess, "run") as run:
            connector.apply_input({"frameId": "frame", "input": {"kind": "text", "text": "$(whoami); --window 1"}}, frames, "/usr/bin/xdotool")
            self.assertEqual(run.call_args.args[0], ["/usr/bin/xdotool", "type", "--clearmodifiers", "--delay", "0", "--file", "-"])
            self.assertEqual(run.call_args.kwargs["input"], b"$(whoami); --window 1")
            connector.apply_input({"frameId": "frame", "input": {"kind": "click", "x": 5, "y": 6, "button": "left"}}, frames, "/usr/bin/xdotool")
            self.assertEqual(run.call_args.args[0], ["/usr/bin/xdotool", "mousemove", "25", "36", "click", "1"])
            with self.assertRaises(ValueError):
                connector.apply_input({"frameId": "old", "input": {"kind": "key", "key": "Return"}}, frames, "/usr/bin/xdotool")

    def test_real_process_reports_presence_without_desktop_access(self):
        received = queue.Queue()

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                received.put((self.path, self.headers.get("Authorization"), json.loads(self.rfile.read(int(self.headers["Content-Length"])))))
                body = b'{"capture":false,"command":null}'
                self.send_response(200)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *args):
                pass

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with tempfile.TemporaryDirectory(prefix="dsh-connector-test-") as directory:
                config = Path(directory) / "connection.json"
                config.write_text(json.dumps({"url": f"http://127.0.0.1:{server.server_port}", "token": "test-credential"}))
                child = subprocess.Popen([sys.executable, str(source), "run", "--config", str(config), "--interval", "0.5"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
                try:
                    path, auth, payload = received.get(timeout=10)
                    self.assertEqual(path, "/computer/v1/heartbeat")
                    self.assertEqual(auth, "Bearer test-credential")
                    self.assertEqual(payload["desktop"], "disabled")
                    self.assertFalse(payload["input"])
                    self.assertIsNone(payload["frame"])
                    self.assertEqual(payload["version"], 1)
                finally:
                    child.terminate()
                    stdout, stderr = child.communicate(timeout=10)
                    self.assertNotIn(b"test-credential", stdout + stderr)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=10)


if __name__ == "__main__":
    unittest.main()
