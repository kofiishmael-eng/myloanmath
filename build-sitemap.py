#!/usr/bin/env python3
"""
Regenerates sitemap.xml from the site itself, and refuses to write one that
would be wrong.

Run this after adding or removing any page:

    python3 build-sitemap.py

Why generate rather than hand-edit: every sitemap error this site has had came
from a human editing the file. A noindex page was submitted twice, a retired
page that 301s was listed, and new pages were forgotten. All three are classes
of mistake a generator cannot make, because it reads the actual pages.

A URL is included only if ALL of these hold:
  - it is an .html file at the site root (embeds live in /embed/ and are excluded)
  - it does not carry <meta name="robots" content="noindex">
  - it is not the target of a 301 in netlify.toml
  - it is not an infrastructure file (404, Google verification)

The script also reports orphans. A page in the sitemap that nothing links to is
not an error Google will flag, but it is almost always an oversight, so it is
surfaced loudly rather than silently published.
"""
import pathlib, re, sys, datetime

SITE = pathlib.Path(__file__).resolve().parent
DOMAIN = 'https://myloanmath.com/'

# Files that exist to serve a purpose other than being found in search.
INFRASTRUCTURE = {
    '404.html',                          # noindex by design
    'google9a6ccbbe2c218671.html',       # Search Console verification token
}

# Pages given a higher priority because they are entry points rather than leaves.
HUBS = {
    'index.html', 'financial-calculators.html', 'unit-converters.html',
    'everyday-math-calculators.html', 'all-calculators.html', 'blog.html',
}


def redirected_paths():
    """Anything the host 301s away from must not be advertised as a live URL."""
    toml = SITE / 'netlify.toml'
    if not toml.exists():
        return set()
    text = toml.read_text(encoding='utf-8')
    out = set()
    for m in re.finditer(r'from\s*=\s*"([^"]+)"', text):
        path = m.group(1)
        if path.startswith('/') and path.endswith('.html'):
            out.add(path.lstrip('/'))
    return out


def is_noindex(html):
    m = re.search(r'<meta\s+name=["\']robots["\']\s+content=["\']([^"\']+)', html, re.I)
    return bool(m and 'noindex' in m.group(1).lower())


def internal_links(html):
    return set(re.findall(r'href="([a-zA-Z0-9._-]+\.html)"', html))


def main():
    redirected = redirected_paths()
    pages, skipped = [], []
    link_targets = set()

    for p in sorted(SITE.glob('*.html')):
        html = p.read_text(encoding='utf-8')
        link_targets |= internal_links(html)

        if p.name in INFRASTRUCTURE:
            skipped.append((p.name, 'infrastructure')); continue
        if p.name in redirected:
            skipped.append((p.name, 'redirected in netlify.toml')); continue
        if is_noindex(html):
            skipped.append((p.name, 'noindex')); continue
        if not re.search(r'<link rel="canonical"', html):
            skipped.append((p.name, 'NO CANONICAL - fix before publishing')); continue

        # lastmod from the file itself, so it reflects a real change
        mtime = datetime.date.fromtimestamp(p.stat().st_mtime)
        pages.append((p.name, mtime))

    # ---- orphan check -----------------------------------------------------
    orphans = [n for n, _ in pages if n != 'index.html' and n not in link_targets]

    # ---- write ------------------------------------------------------------
    lines = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for name, mtime in pages:
        loc = DOMAIN if name == 'index.html' else DOMAIN + name
        priority = '1.0' if name == 'index.html' else ('0.9' if name in HUBS else '0.7')
        lines.append(f'  <url><loc>{loc}</loc><lastmod>{mtime}</lastmod>'
                     f'<priority>{priority}</priority></url>')
    lines.append('</urlset>')
    (SITE / 'sitemap.xml').write_text('\n'.join(lines) + '\n', encoding='utf-8')

    # ---- report -----------------------------------------------------------
    print(f'sitemap.xml written: {len(pages)} URLs')
    print(f'  excluded: {len(skipped)}')
    for name, why in skipped:
        marker = '  !! ' if 'NO CANONICAL' in why else '     '
        print(f'{marker}{name}  ({why})')

    if orphans:
        print(f'\n  ORPHANS - in the sitemap but linked from nowhere ({len(orphans)}):')
        for o in orphans:
            print('     ', o)
        print('  Link each of these from a hub or category page.')
        return 1

    print('\n  no orphans: every page is linked from at least one other page')
    return 0


if __name__ == '__main__':
    sys.exit(main())
