# portmart-web

The website at [portmart.app](https://portmart.app) for [portmart](https://github.com/mercurious/portmart-catalog), an app store for ROCKNIX handhelds. One build, two contexts:

| Where it runs | What it is | A / Enter / tap |
|---|---|---|
| Desktop or phone | The catalog as an XMB showcase, with a PORTMART row for the installer | Copy the installer line (`curl -fsSL https://portmart.app/get \| bash`, or `irm https://portmart.app/get.ps1 \| iex` on Windows) |
| The handheld, in a page portmart's launcher opened | The same XMB with an INSTALLED row and live device state | Get, Update, Add to Ports; X removes after a confirmation |

The context is a capability check: the handheld's launcher binds `window.portmartEngine` (portmart's `docs/WEB-XMB-DOSSIER.md` §4, §17); nowhere else has it. The design system is portmart's `DESIGN.md`; product facts are its `PRODUCT.md`.

A launch intro (one of the app's three: Cart Insert, Plasma Stamp, Port Scan) plays over the XMB while the catalog loads. Any click, tap, key or pad button skips it.

## Layout

| Path | |
|---|---|
| `src/main.js` | Boot: the XMB underneath, the intro on top, input to the XMB when the intro ends |
| `src/splash.js` | The intro on a canvas (from the teaser) |
| `src/intro/*.js`, `src/draw.js`, `src/pyrandom.js` | JS ports of the app's `ui/intro/*.py`, `ui/draw.py`, `term.Buffer` and CPython's `random.Random` |
| `src/xmb/xmb.js` | The XMB: state, render, input (keys, pad, touch, pointer), device jobs |
| `src/xmb/layout.js` | The frozen grid and layout (`DESIGN.md`, Layout), pure |
| `src/xmb/catalog.js` | Fetch and normalize the published catalog; rows per context |
| `src/xmb/engine.js` | The engine client: the binding, the CONTRACT line protocol, friendly errors |
| `src/xmb/glyphs.js` | Block glyphs, wordmark and cartridge on canvas |
| `src/xmb/atmosphere.js` | The WebGPU background (depth, mosaic), Canvas 2D fallback |
| `sw.js` | Service worker: shell cache-first, catalog network-first, images cached on use |
| `placeholder/` | Labelled stand-ins for apps the catalog has no media for yet |
| `fonts/` | DejaVu Sans Mono (license in `fonts/LICENSE.DejaVu.txt`) |
| `_headers`, `_redirects` | CSP and headers; `/get` and `/get.ps1` redirect to the installers on the latest public release |
| `tools/build.mjs` | Stages `_site/`, draws `favicon.svg`, stamps `sw.js` with the build's version and files |
| `tools/fixtures.py`, `tools/engine_fixtures.py` | Record `test/fixtures.json` and `test/engine-fixtures.json` from the app |

## Data

- **Catalog:** `https://mercurious.github.io/portmart-catalog/catalog.json` (CORS `*`).
- **Media:**
  - `media.web` when the catalog has it: WebP stills, plus an H.264/AV1 loop with a poster.
  - Otherwise the screens' PNGs.
  - Apps without either use `placeholder/`, which is marked on screen.
- **Private apps** are hidden on the web, and shown on the handheld.
- **On the handheld:**
  - Startup follows the TUI: `list --cached`, then `sync`, then `list`.
  - Jobs are `install`, `update` and `remove`, with `@step`/`@progress` progress. B cancels a job.

## Tests

`npm test` runs four suites:
- **Intro parity:** 1,836 intro frames and 16 title frames, hashed against `test/fixtures.json`.
- **Engine client:** `parse_event` and `friendly_error` parity with the app, and fake-engine install, fail, remove and list streams replayed through a stand-in bridge.
- **Catalog normalization.**
- **Frozen layout:** rows at 1920×1080, 4K and a phone, plus the title-fitting order.

When the app's intros or engine protocol change, re-record and port the change:

```sh
PORTMART_UI=~/portmart/ui python3 tools/fixtures.py
PORTMART_REPO=~/portmart python3 tools/engine_fixtures.py
npm test
```

## Deploy

`.github/workflows/deploy.yml` tests, builds and runs `wrangler pages deploy` to the Pages project `portmart`:

- `main` deploys to production at portmart.app.
- Every other branch deploys a preview at `https://<branch>.portmart.pages.dev`.

The workflow needs the repository secrets `CLOUDFLARE_API_TOKEN` (Pages: Edit) and `CLOUDFLARE_ACCOUNT_ID`. The setup runbook is `docs/cloudflare-domain-setup.md` in the app repository.

To run it locally with the real headers and redirects: `npm run build && npx wrangler pages dev _site`.
