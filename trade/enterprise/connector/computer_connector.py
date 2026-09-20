"""Outbound DSH connector for an existing Linux X11 desktop; no inbound listener."""
import argparse
import base64
import getpass
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid


class NoRedirect(urllib.request.HTTPRedirectHandler):
    """Never forward the connector credential to a redirect destination."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def endpoint(value):
    """Accept a credential-free HTTPS origin or a loopback development origin."""
    url = urllib.parse.urlsplit(value)
    local = url.scheme == "http" and url.hostname in ("localhost", "127.0.0.1", "::1")
    if not url.netloc or url.username or url.password or url.query or url.fragment or url.path not in ("", "/") or (url.scheme != "https" and not local):
        raise ValueError("Use an HTTPS origin without credentials, a path or query.")
    return value.rstrip("/")


def request(config, operation, payload=None):
    """Send one authenticated request without automatic side-effect retries."""
    body = None if payload is None else json.dumps(payload).encode()
    req = urllib.request.Request(config["url"] + "/computer/v1/" + operation, data=body,
                                 headers={"Authorization": "Bearer " + config["token"], "Content-Type": "application/json"})
    with urllib.request.build_opener(NoRedirect()).open(req, timeout=10) as response:
        data = response.read(1024 * 1024 + 1)
        if len(data) > 1024 * 1024:
            raise ValueError("Server response exceeds the connector limit.")
        return json.loads(data)


def capture():
    """Capture the primary X11 monitor through MSS when explicitly enabled."""
    import mss
    import mss.tools
    try:
        with mss.mss() as screen:
            monitor = screen.monitors[1]
            shot = screen.grab(monitor)
            png = mss.tools.to_png(shot.rgb, shot.size)
            frame = {"id": str(uuid.uuid4()), "width": shot.width, "height": shot.height, "png": base64.b64encode(png).decode("ascii")}
            return frame, (monitor["left"], monitor["top"])
    except mss.exception.ScreenShotError:
        raise RuntimeError("X11 desktop capture unavailable.") from None


def apply_input(command, frames, executable):
    """Apply a validated, recent desktop input once, without invoking a shell."""
    frame_id = command["frameId"]
    if frame_id not in frames or not executable:
        raise ValueError("The desktop observation is no longer available.")
    frame, offset = frames[frame_id]
    action = command["input"]
    data = None
    if action["kind"] == "click":
        x, y = action["x"], action["y"]
        if type(x) is not int or type(y) is not int or not (0 <= x < frame["width"] and 0 <= y < frame["height"]):
            raise ValueError("Coordinates are outside the observed monitor.")
        button = {"left": "1", "right": "3"}[action["button"]]
        args = ["mousemove", str(x + offset[0]), str(y + offset[1]), "click", button]
    elif action["kind"] == "key":
        if action["key"] not in ("Return", "Tab", "Escape", "BackSpace", "Up", "Down", "Left", "Right", "ctrl+l", "ctrl+a", "ctrl+c", "ctrl+v"):
            raise ValueError("Unsupported key.")
        args = ["key", "--clearmodifiers", action["key"]]
    elif action["kind"] == "text":
        if not isinstance(action["text"], str) or not 0 < len(action["text"]) <= 2000:
            raise ValueError("Text exceeds the input limit.")
        args = ["type", "--clearmodifiers", "--delay", "0", "--file", "-"]
        data = action["text"].encode()
    else:
        raise ValueError("Unsupported desktop input.")
    subprocess.run([executable, *args], input=data, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=5, check=True)


def run(config, desktop, interval):
    """Send heartbeats and stream screenshots only while a workspace viewer is open."""
    instance = str(uuid.uuid4())
    executable = shutil.which("xdotool") if desktop and platform.system() == "Linux" else None
    want_capture, receipt, frames = False, None, {}
    handled = set()
    print("DSH connector started. Press Ctrl+C to disconnect.", flush=True)
    while True:
        frame, status = None, "disabled"
        if desktop:
            try:
                observed, offset = capture()
                status = "ready"
                if want_capture:
                    frame = observed
                    frames[frame["id"]] = (frame, offset)
                    frames = dict(list(frames.items())[-2:])
            except (ImportError, OSError, RuntimeError, ValueError):
                status, frames = "unavailable", {}
        payload = {"instanceId": instance, "version": 1, "platform": platform.system(), "architecture": platform.machine(),
                   "desktop": status, "input": bool(executable and status == "ready"), "frame": frame, "receipt": receipt}
        try:
            response = request(config, "heartbeat", payload)
            want_capture = response["capture"] is True
            receipt = None
            command = response.get("command")
            if command:
                command_id = command["id"]
                if command_id not in handled:
                    handled.add(command_id)
                    try:
                        if command["instanceId"] != instance:
                            raise ValueError("Connector instance changed.")
                        apply_input(command, frames, executable)
                        receipt = {"id": command_id, "status": "applied"}
                    except (KeyError, TypeError, ValueError, OSError, subprocess.SubprocessError):
                        receipt = {"id": command_id, "status": "failed"}
                # The Host dispatches once. Unconfirmed inputs require reconnecting, not replay.
                if len(handled) > 10000:
                    raise RuntimeError("Input receipt limit reached; restart the connector.")
        except urllib.error.HTTPError as error:
            if error.code in (401, 403, 409):
                raise RuntimeError(f"Connector rejected (HTTP {error.code}); inspect the workstation and credential.") from None
            print(f"Connection pending (HTTP {error.code}).", flush=True)
        except (urllib.error.URLError, TimeoutError, OSError):
            print("Host unreachable; reconnecting. Desktop input is not replayed.", flush=True)
        time.sleep(interval)


def main():
    """Configure a private credential file or start the foreground connector."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("configure", "run", "check"))
    parser.add_argument("--config", type=Path, default=Path.home() / ".config/dsh-computer/connection.json")
    parser.add_argument("--url")
    parser.add_argument("--desktop", action="store_true", help="Allow screen sharing and X11 input while a DSH viewer is open")
    parser.add_argument("--interval", type=float, default=2, help="Heartbeat interval in seconds (0.5–5)")
    args = parser.parse_args()
    if args.action == "configure":
        origin = endpoint(args.url or input("DSH HTTPS origin: ").strip())
        token = getpass.getpass("Connector credential (hidden): ").strip()
        if not 32 <= len(token) <= 128:
            raise ValueError("Connector credential length is invalid.")
        config = {"url": origin, "token": token}
        request(config, "manifest")
        args.config.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        fd = os.open(args.config, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        os.chmod(args.config, 0o600)
        with os.fdopen(fd, "w") as stream:
            json.dump(config, stream)
        print("Connection verified; credential saved privately.")
        return
    config = json.loads(args.config.read_text())
    config["url"] = endpoint(config["url"])
    if args.action == "check":
        request(config, "manifest")
        print("Authenticated connection verified.")
        return
    if not 0.5 <= args.interval <= 5:
        raise ValueError("Heartbeat interval must be between 0.5 and 5 seconds.")
    if args.desktop and platform.system() != "Linux":
        raise ValueError("Desktop sharing requires Linux X11.")
    run(config, args.desktop, args.interval)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("Connector stopped.")
    except (ValueError, RuntimeError, OSError, urllib.error.URLError) as error:
        # Configuration and network exception bodies may contain private paths or credentials.
        print("Connector stopped: " + type(error).__name__ + ". Check the address, credentials and desktop dependencies.")
        raise SystemExit(1) from None
