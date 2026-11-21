#!/usr/bin/env python3
"""Writes test/fixtures.json from the app's own Python intros, for test/parity.test.mjs.

  PORTMART_UI=~/portmart/ui python3 tools/fixtures.py

The app repo (mercurious/portmart) is private, so CI can't run the Python; it checks the JS against
these recorded hashes instead. Re-run this after the intros change in the app, and commit the result.
Each frame is hashed as sha1 of the compact JSON of its cells ([char, fg, bg, bold] per cell).
"""
import hashlib
import json
import os
import random
import sys

UI = os.path.expanduser(os.environ.get("PORTMART_UI", "~/portmart/ui"))
sys.path.insert(0, UI)

import draw                                  # noqa: E402
from intro import animations, common         # noqa: E402
from term import Buffer                      # noqa: E402

SEEDS = list(range(8)) + [1234567]
GRIDS = [(80, 22), (96, 26), (83, 47), (81, 23)]
TS = [i / 16 for i in range(17)]
PHASES = [0.0, 0.37, 1.9, 5.3]
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "test", "fixtures.json")


def digest(buf):
    return hashlib.sha1(json.dumps(buf.cells, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()


def main():
    frames = {}
    for name, mod in animations().items():
        for seed in SEEDS:
            for cols, rows in GRIDS:
                for i, t in enumerate(TS):
                    b = Buffer(cols, rows, draw.C["bg"])
                    mod.frame(b, t, seed, cols, rows)
                    frames["%s/%d/%dx%d/%d" % (name, seed, cols, rows, i)] = digest(b)
    titles = {}
    for cols, rows in GRIDS:
        for p in PHASES:
            b = Buffer(cols, rows, draw.C["bg"])
            lx, cy, wx, wy = common.layout(cols, rows)
            draw.cart(b, lx, cy // 2, phase=p, cols=16, pins=7)
            draw.wordmark(b, wx, wy // 2, common.WORD, lambda cx, cy_, ch: common.WORD_COLOR)
            titles["%dx%d/%s" % (cols, rows, p)] = digest(b)
    rng = {}
    for seed in (0, 1, 2**40 + 7, 1234567 * 1000003 ^ 80 * 7919 ^ 22 * 104729):
        r = random.Random(seed)
        order = list(range(8))
        rng[str(seed)] = dict(random=[r.random() for _ in range(5)], uniform=r.uniform(-3, 9),
                              shuffle=(r.shuffle(order), order)[1])
    data = dict(seeds=SEEDS, grids=GRIDS, ts=TS, phases=PHASES, frames=frames, titles=titles, rng=rng)
    with open(OUT, "w") as f:
        json.dump(data, f, indent=0, sort_keys=True)
        f.write("\n")
    print("%s: %d frames, %d titles" % (os.path.relpath(OUT), len(frames), len(titles)))


if __name__ == "__main__":
    main()
