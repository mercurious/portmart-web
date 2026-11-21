#!/usr/bin/env python3
"""Records test/engine-fixtures.json from the app: what ui/data.py's parse_event and friendly_error make of the
engine's lines, and the line streams of tests/ui/fake-engine for the store's jobs. test/engine.test.mjs replays
them through src/xmb/engine.js, so the page reads the engine as the TUI does.

  PORTMART_REPO=~/portmart python3 tools/engine_fixtures.py
"""
import json
import os
import subprocess
import sys
import tempfile

REPO = os.path.expanduser(os.environ.get("PORTMART_REPO", "~/portmart"))
sys.path.insert(0, os.path.join(REPO, "ui"))
from data import friendly_error, parse_event  # noqa: E402

ENGINE = os.path.join(REPO, "tests", "ui", "fake-engine")
CATALOG = os.path.join(REPO, "tests", "ui", "fixtures", "catalog")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "test", "engine-fixtures.json")

LINES = [
    "@step resolve active release", "@step download done 4.9 MB", "@step donkey:ports active Ports entry",
    "@step es skip", "@progress download 1200 4900000", "@progress download x y", "@progress download 5",
    "@error verify sha256 mismatch", "@error lock", "@done talkbox installed", "@done synced", "@log curl: (6) no host",
    "@auth ABCD-1234 https://github.com/login/device 900", "@what is this", "plain text", "   ", "", "line\r",
]
ERRORS = [("lock", "", None), (None, None, 4), ("cancel", "", None), (None, None, 130), (None, "", 3),
          ("verify", "sha256 mismatch", 1), (None, "", 1), ("verify", "", 2)]


def run(argv, env):
    r = subprocess.run([sys.executable, ENGINE] + argv, capture_output=True, text=True, env=env)
    return {"argv": argv, "lines": r.stdout.splitlines(), "exit": r.returncode}


def main():
    with tempfile.TemporaryDirectory() as tmp:
        env = dict(os.environ, PORTMART_CATALOG_DIR=CATALOG, FAKE_STATE=os.path.join(tmp, "state.json"), FAKE_DELAY="0")
        scenarios = {
            "list": run(["list"], env),
            "install": run(["install", "talkbox"], env),
            "list_after": run(["list"], env),
            "remove": run(["remove", "talkbox"], env),
            "fail": run(["install", "talkbox"], dict(env, FAKE_FAIL="talkbox")),
        }
    doc = {
        "parse": [[l, parse_event(l)] for l in LINES],
        "friendly": [[k, m, rc, friendly_error(k, m, rc)] for k, m, rc in ERRORS],
        "scenarios": scenarios,
    }
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, indent=1, ensure_ascii=False)
        fh.write("\n")
    print(f"wrote {os.path.relpath(OUT)}: {len(LINES)} lines, {len(ERRORS)} errors, {len(scenarios)} scenarios")


if __name__ == "__main__":
    main()
