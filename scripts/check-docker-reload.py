"""Verify HTTP reload in the running Docker stack and restore the source probes."""

import json
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def wait_for(check):
    deadline = time.monotonic() + 45
    while time.monotonic() < deadline:
        try:
            if check():
                return
        except (OSError, ValueError):
            pass
        time.sleep(0.5)
    raise AssertionError("Source reload was not observed within 45 seconds")


def health_name():
    with urllib.request.urlopen("http://localhost:3333/health", timeout=3) as response:
        return json.load(response)["app"]


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


OPENER = urllib.request.build_opener(NoRedirect())


def home_redirect():
    try:
        with OPENER.open("http://localhost:3000/", timeout=5) as response:
            return response.headers.get("Location")
    except urllib.error.HTTPError as response:
        return response.headers.get("Location")


def main():
    assert health_name() == "paylab-api", "Start the Docker stack before this check"
    assert home_redirect() == "/dashboard", "Expected the normal console home redirect"

    path = ROOT / "paylab-api/src/infra/http/controllers/health.controller.ts"
    original = path.read_text()
    changed = original.replace(
        "app: this.envService.get('APP_NAME'),", "app: 'paylab-api-reload-smoke',"
    )
    assert changed != original, "API health source probe could not be inserted"
    try:
        path.write_text(changed)
        wait_for(lambda: health_name() == "paylab-api-reload-smoke")
    finally:
        assert path.read_text() == changed, "Unexpected concurrent source modification"
        path.write_text(original)
    wait_for(lambda: health_name() == "paylab-api")
    print("PASS: API source change and restoration served without rebuilding.", flush=True)

    path = ROOT / "paylab-ui/src/app/page.tsx"
    original = path.read_text()
    changed = original.replace('redirect("/dashboard")', 'redirect("/accounts")')
    assert changed != original, "Console source probe could not be inserted"
    try:
        path.write_text(changed)
        wait_for(lambda: home_redirect() == "/accounts")
    finally:
        assert path.read_text() == changed, "Unexpected concurrent source modification"
        path.write_text(original)
    wait_for(lambda: home_redirect() == "/dashboard")
    print("PASS: UI source change and restoration served without rebuilding.", flush=True)


if __name__ == "__main__":
    main()
