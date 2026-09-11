# Placeholder asset manifest

Everything under `assets/placeholder/` is temporary by convention. Nothing here should be
treated as final — these files exist only so the layout, aspect ratios, and links work
end-to-end before real content is dropped in.

| file | stands in for | replace with | constraints |
|---|---|---|---|
| `photos/hero.svg` | homepage bento hero photo | your own photo | landscape, 3:2 or wider, ≥1600px wide when rasterized |
| `photos/project-cover-01.svg` … `04.svg` | portfolio card covers | real screenshots | 16:10, no title text baked into the image (titles overlay in CSS) |
| `photos/gallery-01.svg` … `08.svg` | gallery grid seed images | your photography, or a live Unsplash API pull | 4:5, any content |
| `logo/logo-mark.svg` | wordmark/glyph mark | your own mark, or delete and stay text-only (`@[HANDLE]`) | should read at 24px and favicon size |
| `logo/favicon.svg` | site favicon | your real favicon | works at 16–32px |
| `og-social.svg` | link-preview / Open Graph card | branded 1200×630 image | keep the exported raster under ~300KB |
| `resume.pdf` | About page resume download | your actual resume | any |

## Why this folder exists

A model (or a future you) handed an unlabeled `hero.jpg` will often bake in decisions —
exact crop, focal point, even the accent color — that were never meant to be permanent.
Keeping every stand-in under one `placeholder/` root, listed here, and flagged inline at
each usage site (`<!-- PLACEHOLDER: ... see assets/placeholder/MANIFEST.md -->`) means:

- the **path** survives refactors,
- this **manifest** survives someone forgetting which files are placeholders,
- the **inline comment** is what you actually see while editing the page.

## Swapping in real assets later

1. `grep -r "placeholder/" --include=*.html --include=*.css .` — every match is a
   reference that needs a real asset; nothing else does.
2. Where the real asset fills the same manifest row, overwrite the file at the same path
   — no HTML changes needed.
3. Where the shape differs (e.g. swapping from a text logo to an image mark), edit the
   reference at that usage site and delete its `PLACEHOLDER:` comment.
4. Once `grep -r "placeholder/" .` returns nothing, delete `assets/placeholder/` entirely.
