# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Plain static HTML/CSS/JS, no build step, deployed to GitHub Pages (custom domain via
`CNAME`). `.github/workflows` minifies/obfuscates JS+CSS and HTML on push to `main` and
publishes to the `gh-pages` branch. The `v2` branch is an experimental rebuild intended
to eventually replace `main`; it does not deploy on its own (workflow only triggers on
`main`).

## Users

General portfolio / networking audience — collaborators, hackathon teammates, other
students/builders, and the owner's own network — rather than a resume-first,
recruiter-optimized site. Projects and personality lead; formal credentials (resume,
awards) support rather than dominate.

## Product Purpose

A personal site for Jerry (Jiarui) Hu, a Computer Engineering student at UIUC. It exists
to showcase what he's built (hackathon projects, side projects, open source), a bit of
who he is (photography/gallery, writing), and to make it easy for people in his network
to find him and his work.

## Positioning

Not a company or product site — a personal portfolio. Differentiator is breadth: it
combines a project showcase, a photo gallery, and a personal blog in one considered
system, rather than being a single-purpose resume page or a bare GitHub profile.

## Operating Context

Single-owner, low-frequency updates (add a project, add a blog post, swap photos) rather
than a frequently-shipped product. No backend, no CMS, no login — content changes are
direct HTML/asset edits.

## Capabilities and Constraints

- Static HTML only — no server-side rendering, no database. Any "dynamic" feature (blog
  filtering/search, gallery load-more) is client-side JS over data already in the page.
- Home page intentionally highlights featured projects rather than latest blog posts
  (confirmed decision — keep as-is); Blog stays in the nav as a real section for future
  writing, not placeholder decoration (confirmed decision — keep as-is).
- No dark-mode toggle currently implemented as a UI control, though `v2.css` ships
  `prefers-color-scheme` tokens.

## Brand Commitments

- Name: Jerry (Jiarui) Hu.
- Existing handles/socials (from the prior site, carried into `v2` as placeholders to
  confirm): GitHub `AccessRetrieved`, LinkedIn `iamjerryhu`, X `i_am_jerry_huu`,
  Instagram `i.am.jerry.hu`.
- Prior framing (from the site being replaced): "Computer Engineering student @ UIUC,
  passionate about technology and innovation."

## Evidence on Hand

- Prior site's project list (Recent commits / old `index.html`), useful as real
  candidates for the new Portfolio page: Millennium STEM BC, Constellation Networking,
  GPTNotes, App Postman, UBC Geering Up Engineering, Yale Young Global Scholars, CodeGPT,
  Medlinks.
- Prior site's awards/honors copy (music competitions, Canadian Computing Competition,
  math contests, hackathon placements) — real content, not yet migrated into the `v2`
  About page timeline.
- No real photography, resume PDF, or blog posts have been supplied yet — `v2` currently
  uses generated SVG stand-ins under `assets/placeholder/`. Do not fabricate testimonials,
  stats, or credentials beyond what's listed here.

## Product Principles

1. Personality and craft over corporate polish — this is a portfolio a person built, not
   a company.
2. Projects and work speak first; formal credentials (resume, awards) are supporting
   evidence, not the lead.
3. Content changes should stay cheap: static data-driven cards/rows over hand-built
   one-off layouts, so adding a project or post is a content edit, not a redesign.
4. Placeholder content must stay clearly marked (see `assets/placeholder/MANIFEST.md`)
   until replaced with the real thing.
