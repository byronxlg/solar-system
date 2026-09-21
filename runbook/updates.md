---
project: solar-system
reviewed: 2026-09-22
deploy_path: push-to-main
rollback_minutes: 10
---

# Updates

Everything reaches the site through `deploy.yml` on push to `main`; `main` is what is live.
Work happens on a branch in a worktree and lands through a PR (`.claude/rules/git-workflow.md`),
so every change has a PR trail and the previous state is one revert away. No local deploys.

## How a change reaches production

| Change to | Pipeline | Trigger | Lands in prod when | Evidence |
| --- | --- | --- | --- | --- |
| `src/**`, `gong/**`, `index.html`, `public/**`, `vite.config.js` | `deploy.yml`: `npm ci`, `npm run build`, upload, `deploy-pages` | push to `main` | the deploy step finishes, 1 to 2 min | run green; both pages in a browser |
| `package*.json` | same | push to `main` | same | run green |
| `README.md`, `runbook/**`, `docs/**` | none (built into nothing) | push to `main` | on GitHub immediately | n/a |

## Post-deploy smoke test

Not a merge gate. Proves the pages are served and the build is the new one.

```sh
gh run list --workflow deploy.yml --limit 1
for u in https://byronxlg.com/solar-system/ https://byronxlg.com/solar-system/gong/; do curl -s -o /dev/null -w "$u %{http_code}\n" "$u"; done
```

Pass: the run is `success` and both URLs are 200. For behaviour, run `scripts/check-gestures.mjs`
and `scripts/check-gong.mjs` against a local `npm run dev` with `?nomodels`.

## Rollback

`git revert <sha>` on `main` and push; `deploy.yml` republishes the previous build in about
two minutes. Do not re-deploy an old artifact by hand.

## Scheduled maintenance

| What | Cadence | How | Validated by |
| --- | --- | --- | --- |
| npm deps (`vite`, `react`, `@mediapipe/tasks-vision`) | quarterly | PR, `npm run build`, headless checks | deploy run green, both pages load |
| Node in `deploy.yml` (`node-version: 22`) | when 22 is within 6 months of EOL | PR | deploy run green |
| GitHub Actions versions | when a major is released | PR | deploy run green |
| Launch video (`brag/`, `public/assets/brag.*`) | when the kiosk, sky or gong changes visibly | `/brag` in this repo, then copy `brag/brag.mp4` and `brag/brag.jpg` to `public/assets/`, commit both, merge | `curl -sI https://byronxlg.com/solar-system/assets/brag.mp4` is 200; the README poster shows the new frame |

## Things that are risky to change

- `vite.config.js` `base`: it must stay `/solar-system/` or every asset 404s on Pages.
- `scripts/copy-wasm.mjs` and the `public/models` files: a MediaPipe version bump can change
  the wasm file names or the model format; check the loading pill in the kiosk after a bump.
- Gesture thresholds (`src/useViewGestures.js`, `src/gong/useStrikeGestures.js`): only Byron
  can test them with a real camera; keep changes behind the headless checks and small.
