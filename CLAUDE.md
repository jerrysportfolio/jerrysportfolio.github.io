# Working notes for Claude Code

See `PRODUCT.md` for product/positioning context and `DESIGN.md` for visual/design
system decisions. This file covers git workflow and deploy/infra gotchas.

## Branching

- `main` is the only long-lived branch. It is always prod-deployable — every push to
  it triggers a deploy (see below).
- Unfinished work that shouldn't ship yet lives on its own short-lived feature branch
  (e.g. `feature/portfolio-blog`, holding the still-WIP Blog/blog-post pages as of
  2026-09-12). Merge a feature branch into `main` only when it's ready to go live.
- The old `v2` branch (an experimental full-site rebuild) was merged into `main` and
  deleted once its work shipped — don't recreate a permanent second long-lived branch;
  it caused repeated cherry-pick divergence pain before this cleanup. Full writeup in
  `README.md`.
- Gotcha when merging `main` into a feature branch that holds files `main` doesn't have
  (e.g. Blog pages removed from `main` before shipping): the merge can silently delete
  those files from the feature branch, since `main`'s history contains their removal.
  Fix: `git merge main --no-commit`, check `git status` for unexpected deletions,
  `git checkout HEAD -- <the deleted files>` to restore them, then commit. This is a
  one-time issue per file — once resolved, later merges of `main` into that branch are
  clean.

## Deploy pipeline — READ THIS IF THE LIVE SITE LOOKS STALE OR UNOBFUSCATED

- `.github/workflows/deploy.yml` runs on every push to `main`: obfuscates JS
  (`javascript-obfuscator`), minifies CSS (`clean-css-cli`) and HTML
  (`html-minifier-terser`), then pushes the built output to the `gh-pages` branch via
  `JamesIves/github-pages-deploy-action` (with `clean: true`).
- **GitHub Pages must be configured to serve from the `gh-pages` branch**, not `main`.
  Check via `gh api repos/jerrysportfolio/jerrysportfolio.github.io/pages` — look at
  `source.branch`. On 2026-09-12 this was found set to `main` (root), meaning the site
  was serving raw, non-obfuscated, non-minified source directly, even though the Action
  had been building a correct `gh-pages` branch the whole time. Fixed via:
  `gh api -X PUT repos/jerrysportfolio/jerrysportfolio.github.io/pages -f "source[branch]=gh-pages" -f "source[path]=/"`
  If the live site ever looks unminified/unobfuscated or out of sync with a recent
  deploy, check this setting before assuming it's a caching issue.
- The custom domain (`portfolio.iamjerryhu.org`, set via `CNAME`) is fronted by
  Cloudflare in front of GitHub Pages. CSS/JS are served with `Cache-Control:
  max-age=14400` (4h) and HTML with `max-age=600` (10m) — both browser- and
  edge-cacheable. If a change looks missing right after a deploy, try a hard refresh /
  incognito window before concluding something's actually broken; verify against the
  origin directly with `curl` and a cache-busting query string if in doubt.

## Unsplash integration

- `assets/js/v2.js` has `UNSPLASH_CONFIG` (access key + username `iamjerryhu`), used
  for: the home hero photo (`initUnsplashHero`), the live gallery grid
  (`initGalleryPhotos`), and filling project cards that have no dedicated cover image
  (`initRandomProjectCovers`, picks a random photo from the same gallery — used by the
  Garage Door Controller and Motion Sensor project cards, which have no real photo).
- Demo Unsplash apps are capped at 50 requests/hour; results are cached in
  `sessionStorage` per browser tab.
