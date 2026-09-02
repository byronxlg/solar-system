# Git workflow: worktree branch, PR, merge, Pages deploys main

All work happens on a branch in a git worktree and reaches `main` only through
a pull request. Claude merges PRs itself; Byron does not need to approve.
Every push to `main` deploys to GitHub Pages through
`.github/workflows/deploy.yml`, so `main` is what is live.

- **Start**: `EnterWorktree` (creates `.claude/worktrees/<name>` on a fresh
  branch from `origin/main`). Never commit directly on `main`.
- **Verify from the worktree, headless**: run a dev server from the worktree
  on another port (`npx vite --port 5174 --strictPort`) and drive it with
  Playwright. Always add `?nomodels`: the gesture model is heavy and a second
  full-model tab competes with Byron's own browser for memory and GPU. Only
  one dev server with models at a time, and that one is Byron's. Stop the
  server when done.
- **Finish**: commit, push, `gh pr create`, then `gh pr merge --squash --delete-branch`,
  `ExitWorktree` (remove), then `git pull` in the main checkout. The merge
  triggers the Pages deploy; check the run with `gh run watch`.
- **Small changes too**: a one-line fix still goes through a branch and PR.
- **Why**: every change is reviewable after the fact with a PR trail, main is
  always the last known-good state and the deployed one, and the worktree
  keeps the main checkout stable while work is in progress.
