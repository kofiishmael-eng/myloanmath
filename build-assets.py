"""
Generates the site's missing brand assets, using the exact tokens already in
style.css and the inline brand mark in every page's nav:
    --accent  #1F5C43  (forest green)
    --paper   #F2EFE4  (cream)
    --brass   #7A5D2A
    --ink     #191F1B
Run: python3 build-assets.py
"""
import pathlib
from PIL import Image, ImageDraw, ImageFont

SITE = pathlib.Path('/home/claude/site')
ASSETS = SITE / 'assets'
ASSETS.mkdir(exist_ok=True)

ACCENT = (31, 92, 67)
PAPER = (242, 239, 228)
BRASS = (122, 93, 42)
INK = (25, 31, 27)
LINE = (220, 213, 192)

SERIF_BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf'
SERIF = '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf'
MONO = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'


def rounded_mark(size, radius_ratio=14 / 64):
    """The brand mark: cream 'M' on a rounded forest-green square."""
    scale = 4  # supersample, then downscale for clean edges
    s = size * scale
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * radius_ratio), fill=ACCENT)
    font = ImageFont.truetype(SERIF_BOLD, int(s * 0.52))
    box = d.textbbox((0, 0), 'M', font=font)
    d.text(((s - (box[2] - box[0])) / 2 - box[0],
            (s - (box[3] - box[1])) / 2 - box[1]), 'M', font=font, fill=PAPER)
    return img.resize((size, size), Image.LANCZOS)


# ---------------------------------------------------------------- favicon ---
# SVG so it stays crisp at any size and matches the inline nav mark exactly.
favicon = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="myloanmath">
  <rect width="64" height="64" rx="14" fill="#1F5C43"/>
  <text x="32" y="45" font-family="Georgia, 'Times New Roman', serif" font-size="36" font-weight="700" fill="#F2EFE4" text-anchor="middle">M</text>
</svg>
'''
(SITE / 'favicon.svg').write_text(favicon, encoding='utf-8')

# PNG fallbacks for browsers and platforms that ignore SVG favicons.
rounded_mark(32).save(SITE / 'favicon-32.png')
rounded_mark(180).save(ASSETS / 'apple-touch-icon.png')
rounded_mark(192).save(ASSETS / 'icon-192.png')
rounded_mark(512).save(ASSETS / 'icon-512.png')


# --------------------------------------------------------------- og image ---
def og_image():
    """1200x630 social card — the size Facebook, LinkedIn, X and iMessage expect."""
    W, H = 1200, 630
    img = Image.new('RGB', (W, H), PAPER)
    d = ImageDraw.Draw(img)

    # Ruled-paper texture, echoing the .card background in style.css
    for y in range(0, H, 35):
        d.line([(0, y), (W, y)], fill=(233, 229, 214), width=1)

    d.rectangle([0, 0, W, 10], fill=ACCENT)          # top rule
    d.rectangle([0, H - 6, W, H], fill=BRASS)        # bottom rule

    mark = rounded_mark(96)
    img.paste(mark, (80, 76), mark)

    wordmark = ImageFont.truetype(SERIF_BOLD, 46)
    d.text((196, 100), 'myloanmath', font=wordmark, fill=INK)

    eyebrow = ImageFont.truetype(MONO, 21)
    d.text((196, 154), 'FREE FINANCIAL CALCULATORS', font=eyebrow, fill=BRASS)

    headline = ImageFont.truetype(SERIF_BOLD, 62)
    for i, line in enumerate(['Loan, mortgage, tax and', 'retirement math you can', 'actually check.']):
        d.text((80, 250 + i * 76), line, font=headline, fill=INK)

    d.line([(80, H - 108), (W - 80, H - 108)], fill=LINE, width=2)
    foot = ImageFont.truetype(MONO, 23)
    d.text((80, H - 84), 'Runs entirely in your browser  ·  Nothing you type is sent anywhere',
           font=foot, fill=(90, 101, 89))
    return img


og_image().save(SITE / 'assets' / 'og-image.png', optimize=True)

for p in sorted(list(ASSETS.glob('*')) + [SITE / 'favicon.svg', SITE / 'favicon-32.png']):
    print(f'  {p.relative_to(SITE)}  {p.stat().st_size:,} bytes')
