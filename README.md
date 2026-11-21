# portmart-web

The website at [portmart.app](https://portmart.app) for [portmart](https://github.com/mercurious/portmart), an app store for ROCKNIX. The app feed is [mercurious/portmart-catalog](https://github.com/mercurious/portmart-catalog), still served from GitHub Pages.

For now the site is a teaser page. It plays one of the app's three launch intros (Cart Insert, Plasma Stamp, Port Scan), then settles on the logo with its gradient cycling. A click, tap or key during an intro skips to the logo. On the logo, it plays a different intro.

## Layout

| Path | |
|---|---|
| `src/intro/*.js` | JS ports of the app's `ui/intro/*.py` |
| `src/draw.js`, `src/pyrandom.js` | ports of the app's `ui/draw.py`, the `term.Buffer` from `ui/term.py`, and CPython's `random.Random` |
| `src/main.js` | canvas renderer, grid fitting, intro rotation |
| `_headers` | security headers and CSP for Cloudflare Pages |
| `tools/build.mjs` | stages `_site/` and draws `favicon.svg` from the cartridge |
| `tools/fixtures.py`, `test/` | checks that the JS frames are identical to the app's Python frames |

## Parity with the app

`npm test` redraws 1,836 intro frames (3 intros × 9 seeds × 4 grids × 17 moments) and 16 title frames, and compares their hashes with `test/fixtures.json`. That file is recorded from the app's Python. When the intros change in the app, re-record it and port the change:

```sh
PORTMART_UI=~/portmart/ui python3 tools/fixtures.py
npm test
```

## Deploy

`.github/workflows/deploy.yml` tests, builds and runs `wrangler pages deploy` to the Pages project `portmart`:

- `main` deploys to production at portmart.app.
- Every other branch deploys a preview at `https://<branch>.portmart.pages.dev`.

The workflow needs the repository secrets `CLOUDFLARE_API_TOKEN` (Pages: Edit) and `CLOUDFLARE_ACCOUNT_ID`. The setup runbook is `docs/cloudflare-domain-setup.md` in the app repository.

To run it locally: `npm run build && python3 -m http.server -d _site`
