# Design notes — v2 site

This documents the design decisions behind the `v2` branch rebuild, so future edits
(yours or a future Claude session's) stay consistent instead of drifting page by page.
Everything here lives as CSS custom properties in `assets/css/v2.css` — change a value
there and it propagates to all six pages automatically.

## Direction

The rebuild started from a bento-grid personal-site spec (warm paper, serif headings,
earthy accent) but two rounds of iteration moved it somewhere different on purpose:

1. **Round 1** (warm cream + terracotta/olive/clay accents) read as generic
   "AI-generated portfolio" — warm cream paper with a serif display face and a muted
   earthy accent is a recognizable template look, not a considered choice.
2. **Round 2** moved to cool neutrals (near-white or near-black paper) with saturated,
   tech-forward accents (cobalt, violet, mint, magenta) — closer to a modern SaaS/dev-tool
   aesthetic.
3. **Final**: cool white paper with a **grayscale accent** (near-black, no hue at all)
   instead of a colored one. Hierarchy comes from *value* — near-black for
   interactive/emphasis elements, mid-gray for muted labels, light grays for borders and
   hover washes — the same restraint principle as round 1's palette, but executed in a
   cooler, more minimal register (think Linear/Vercel rather than an indie blog).

## Color tokens

Defined in `assets/css/v2.css` `:root` (light) and mirrored in
`@media (prefers-color-scheme: dark)` / `:root[data-theme="dark"]` (dark):

| Token | Light | Dark | Role |
|---|---|---|---|
| `--paper` | `#f8f7fb` | `#101114` | page background |
| `--paper-card` | `#ffffff` | `#1a1b1f` | card/surface background |
| `--ink` | `#131418` | `#eceded` | primary text |
| `--ink-soft` | `#54575f` | `#a3a6ad` | secondary text |
| `--ink-faint` | `#9a9da5` | `#6f727a` | tertiary/faint text |
| `--line` | `#e1e2e6` | `#2a2c31` | borders, hairlines |
| `--accent` | `#131418` | `#eceded` | interactive/emphasis color — intentionally == the inverse of paper, not a hue |
| `--accent-soft` | `#e4e5e8` | `#2a2c31` | avatar backgrounds, subtle fills |
| `--accent-wash` | `#f1f1f3` | `#1d1f24` | hover backgrounds, chip fills |
| `--on-accent` | `#ffffff` | `#131418` | text/icon color drawn on top of a solid `--accent` fill (e.g. the project-card hover arrow) — flips per theme so it never goes invisible |

**Why `--on-accent` exists:** the hover-arrow icon sits on a solid `--accent` background.
In light mode `--accent` is near-black, so the icon is white. In dark mode `--accent`
flips to near-white, so a hardcoded white icon would disappear — `--on-accent` is the
correct icon color for whichever theme is active. Any new component that fills with
`--accent` and puts text/an icon on top should use `--on-accent`, not a literal `#fff`.

## Typography

| Role | Font | Token | Notes |
|---|---|---|---|
| Headings (h1–h3, section titles) | Newsreader | `--font-display` | replaced Fraunces — an editorial serif with a full 400–700 weight range and italics, less common than Fraunces on AI-generated portfolios while keeping the same "one serif accent" role |
| UI / body / labels | Hanken Grotesk | `--font-main` | replaced Plus Jakarta Sans — a distinctive grotesque with a full 400–700 weight range, chosen after a design-quality pass flagged Plus Jakarta Sans (and Fraunces) as overused faces |
| Long-form article prose | Source Serif 4 | `--font-post` | used only inside `.markdown-body` on blog posts |
| Code, dates, eyebrows, chips | JetBrains Mono | `--font-code` | anything meant to read as "metadata" rather than prose |

Caveat (handwriting accent) was removed — it was used for the home page hero quote, but
a cursive accent reads as cozy/editorial, which fights the cool, minimal direction. The
hero quote is now italic `--font-main` instead.

## Layout patterns

- **Bento grid** (`index.html`): a 3-column CSS grid (`.bento`) with named areas —
  collapses to a single column under 980px. Two of the three original "latest blog post"
  slots were repurposed as **featured-project mini-cards** (`.mini-card`) since this site
  doesn't run a blog off the home page — see `.post-card, .mini-card` in `v2.css`, which
  intentionally share one selector so blog rows and home-page project highlights stay
  visually identical.
- **Mini-card / post-card**: a borderless list row (hairline top border, no card
  background) with a category+date/context line, a title, and a circular hover arrow that
  fills solid on `:hover`. Used on the home page and the blog index.
- **Proj-card / gallery-item**: bordered, shadowed cards with `box-shadow` elevation on
  hover (`--shadow-sm` → `--shadow-hover`) — used where the content is closer to "a thing
  you click into" (portfolio, gallery) rather than "a row you scan."
- **Chips/pills** (`.pill`, `.skill-chip`, `.b-tag`, `.proj-chip`): consistent shape
  (100px radius, 1px border) reused for filters, skills, categories, and taxonomy tags so
  the same visual vocabulary means "a small classifier" everywhere it appears.

## Navigation: persistent shell + liquid-glass tab indicator

The navbar no longer reloads between pages. Each page is still a complete, real HTML
document (direct links, view-source, and no-JS all work), but `assets/js/v2.js` installs
a small same-origin router:

- Every page wraps its unique content in `<main class="page-content" id="page-content">`;
  the navbar and footer sit outside it and are never touched by navigation.
- Clicking an internal link (any `.html` file in the site) is intercepted: the router
  `fetch()`es the target page, reads its `#page-content` and `<title>`, cross-fades the
  current `#page-content` out/in (`.is-transitioning`, `v2.css`), and swaps the HTML —
  the nav/footer DOM nodes are never destroyed or recreated. `history.pushState` keeps
  back/forward working; a failed fetch (e.g. `file://`, CORS, non-JS) falls back to a
  normal full navigation, so this is progressive enhancement, not a hard requirement.
- `<body data-page="...">` on every page (`home`/`portfolio`/`gallery`/`blog`/`about`;
  `blog-post.html` reports `blog` since it isn't itself a nav item) and matching
  `data-page` attributes on the five `.nav-links a` are how the router knows which tab to
  highlight after a swap, including for pages that aren't direct nav targets.
- **`.nav-indicator`**: a single absolutely-positioned glass capsule inside `.nav-links`
  does double duty — it previews under whichever tab the pointer hovers (the "hover
  effect" on other tabs), and it is the same element that slides to the new tab when the
  active page changes, which is what makes navigation read as one continuous liquid-glass
  motion rather than a highlight disappearing and reappearing. Position/width are set via
  inline `transform`/`width` in JS (`offsetLeft`/`offsetWidth` of the target link); only
  the transition timing lives in CSS. Hidden under 760px (mobile nav is a full-screen
  vertical list, not a tab bar). `prefers-reduced-motion` keeps the snap but drops the
  slide animation.
- Per-page behaviors that used to bind once on `DOMContentLoaded` (blog filter/search,
  gallery load-more) are wrapped in `initPageBehaviors(root)` and re-run against the new
  `#page-content` after every swap, since a `fetch`-and-replace navigation doesn't refire
  `DOMContentLoaded`. The reading-progress bar avoids needing this: it looks up
  `.reading-progress` fresh on every scroll event instead of binding to a specific node,
  so one persistent listener survives any number of page swaps.

## Firebase: Analytics + gallery view/download counters

`assets/js/firebase-config.js` holds `window.FIREBASE_CONFIG` (blank until you paste in
your project's config — see that file's header comment for the exact setup steps).
Everything below it no-ops safely when the config is blank or the SDK is blocked, so the
site works identically with or without Firebase configured.

- **SDK**: compat build (`firebase-app-compat.js`, `-analytics-compat.js`,
  `-firestore-compat.js`) via CDN `<script>` tags on every page, loaded before
  `v2.js` — chosen over the modular v9+ SDK so it drops into the site's existing plain
  `<script>` architecture without converting anything to ES modules.
- **Analytics**: `initFirebase()` calls `firebase.analytics()` once (auto-logs the first
  page_view). Every subsequent AJAX route change calls `logPageView()` manually from
  `setActiveNav()`, since the SPA-style router means the browser never does a real
  navigation for Analytics to observe on its own.
- **Gallery counters**: `initGalleryStats()` reads/writes `stats/gallery` in Firestore
  (`views`, `downloads`, both `FieldValue.increment(1)`). A view only counts once per
  browser session (`sessionStorage` guard) so reloading or navigating back doesn't
  inflate it. `window.recordGalleryDownload()` is exposed and ready to wire to a real
  download control once the gallery has actual downloadable photos — nothing calls it
  yet.
- **Resume clicks**: `initResumeTracking()` binds a click listener on `about.html`'s
  `#resume-link` and logs GA4's own recommended `file_download` event (with
  `file_name`/`file_extension`/`link_text`/`link_url`) rather than a made-up event name,
  so it shows up in Analytics' standard File downloads report/funnels.
- Country, session length, per-page engagement time, most/least-viewed pages, and
  visitor retention are **not custom-built** — they're standard GA4 reports that Firebase
  Analytics populates automatically from the `page_view` events already being logged
  correctly per route. Find them in the linked Google Analytics 4 property
  (analytics.google.com, not the Firebase console) under Reports → Demographics
  (country), Engagement → Pages and screens (per-page time, most/least viewed), and
  Retention. Data typically takes 24–48 hours to start appearing after Analytics goes
  live on real traffic.
- **Security**: `firestore.rules` (repo root) locks `stats/gallery` to public read +
  increment-only writes (each write may raise `views`/`downloads` by at most 1 over the
  current value, nothing else). This matters because the Firebase config object is
  necessarily public in client-side JS — the rules, not secrecy, are what stop someone
  from scripting arbitrary writes from devtools. Deploy the rules file via the Firebase
  CLI or by pasting it into the Console; it does nothing just sitting in the repo.

## Placeholder-asset protocol

Every image/file asset that stands in for real content lives under
`assets/placeholder/` with a manifest at `assets/placeholder/MANIFEST.md`, and every
usage site has an inline `<!-- PLACEHOLDER: ... -->` comment. See that manifest for the
full swap-in workflow. Text placeholders use the `[Bracketed]` convention with a
`.fill-me` dashed-outline CSS class for visibility while editing.

## Open decisions / things to revisit

- Deferred by request, not yet designed: a Cloud Function to auto-scrape LinkedIn for
  profile/experience data, and Firebase Remote Config (or similar) to dynamically adjust
  what the site shows based on Analytics. Scraping LinkedIn specifically is worth
  re-checking against LinkedIn's ToS before building it — flagging now so it isn't
  forgotten, not proposing an approach yet.
- Nav still links to `blog.html`/`blog-post.html` and the footer links to `rss.xml`,
  even though the home page no longer promotes blog posts (swapped for project
  highlights, since this site doesn't run a blog). Decide whether to keep the blog
  section for future use or remove it.
- All real content (name, bio, project links, resume, photos) is still placeholder
  except the three featured-project cards on the home page, which use real data.
