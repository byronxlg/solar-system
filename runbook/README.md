---
project: solar-system
tier: 3
owner: byron
lifecycle: production
reviewed: 2026-09-22
---

# solar-system runbook

Two browser apps on one static site: the sky (fly through the solar system with your hands)
and the gong (strike it with a full swing of the arm), both driven by MediaPipe hand and body
tracking in the browser. Tier 3: nothing to keep alive. "Live" means
https://byronxlg.com/solar-system/ and https://byronxlg.com/solar-system/gong/ return 200 and
the last `deploy.yml` run is green. If both hold, the project is healthy.

## Where it runs

GitHub Pages, project site for `byronxlg/solar-system`, published from the `dist/` artifact
by `deploy.yml` on every push to `main`. The user site has a custom domain, so the pages are
served at `byronxlg.com/solar-system/` and the old `byronxlg.github.io/solar-system/` URLs
301 there. No host on this Mac, no server, no secrets: the models are committed in
`public/models` and the wasm runtime is copied from `node_modules` at build time.

## Objectives

| Indicator | Target | Window | Measured by |
| --- | --- | --- | --- |
| Both pages return 200 | 99% of checks | 30 days | `curl -s -o /dev/null -w '%{http_code}' https://byronxlg.com/solar-system/` and `.../gong/` |
| A push to `main` is live within 10 min | every push | per push | `gh run list --workflow deploy.yml --limit 1` is `success` |

Recovery targets: RTO 14 days (the `restore` SLA in `projects.yaml`). RPO not applicable:
the repo is the source of truth.

## Who is watching

| Watcher | Where it runs | Cadence | Checks | Alerts to | Run history |
| --- | --- | --- | --- | --- | --- |
| `deploy.yml` | GitHub Actions | on push to `main` | the build and the Pages deploy | GitHub's workflow failure email | [actions](https://github.com/byronxlg/solar-system/actions) |

No off-host monitor and none is required at tier 3. The weekly fleet review runs the
objective checks above.

## Files

| Question | File |
| --- | --- |
| How do changes reach the site, how do I roll back? | [updates.md](updates.md) |

Tier 3 does not carry `health.md`, `recovery.md`, `dependencies.md` or `incidents/`; the
objectives table above is the whole health check, and rollback lives in `updates.md`.

## Schedules

| What | Where it runs | When | Notes |
| --- | --- | --- | --- |
| Deploy (`deploy.yml`) | github-actions | push to `main`, manual dispatch | `npm ci`, `npm run build`, upload `dist/`, deploy to Pages |

## Dashboards and logs

- Actions runs: https://github.com/byronxlg/solar-system/actions ; `gh run list --workflow deploy.yml --limit 5`.
- Pages: `gh api repos/byronxlg/solar-system/pages -q .status`.
- Headless checks of the apps: `scripts/check-gestures.mjs` (sky) and `scripts/check-gong.mjs` (gong); both use `?nomodels`.
