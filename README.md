# portfolio

## Branching workflow

- `main` — prod. Always deployable. Every push to `main` auto-deploys (see `.github/workflows/deploy.yml`).
- `feature/portfolio-blog` — long-running branch for the still-unfinished Portfolio and Blog pages. Not merged into `main` until those pages are ready to go live.
- Anything else — a short-lived feature branch off `main`, deleted after merging back.

### Day to day

Small fix or self-contained feature:
```
git checkout -b fix-thing main
# work, commit
# PR / merge into main
git branch -d fix-thing
```

Portfolio/blog work:
```
git checkout feature/portfolio-blog
# work, commit as usual
```

### Keeping `feature/portfolio-blog` in sync with `main`

Merge `main` in occasionally (before a work session, or after landing something unrelated on `main`) so the branch doesn't drift:
```
git checkout feature/portfolio-blog
git merge main
```

### Shipping the portfolio/blog pages once they're ready

```
git checkout main
git merge feature/portfolio-blog
git push
```
This triggers the deploy workflow.
