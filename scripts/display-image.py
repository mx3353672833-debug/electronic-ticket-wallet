"""Small display derivatives only. Never changes the archival image or its metadata."""
import sys
from pathlib import Path
from PIL import Image, ImageOps

Image.MAX_IMAGE_PIXELS = 60_000_000

def render(source, destination, variant):
    if variant not in ('screen', 'thumb'):
        raise ValueError('Unknown display size')
    with Image.open(source) as opened:
        image = ImageOps.exif_transpose(opened).convert('RGBA')
    image.thumbnail((1600, 1600) if variant == 'screen' else (384, 384), Image.Resampling.LANCZOS)
    # Near-lossless-looking delivery copy; the saved lossless derivative remains separate.
    with Path(destination).open('xb') as output:
        image.save(output, format='WEBP', quality=90 if variant == 'screen' else 84, method=4, exact=True)

if __name__ == '__main__':
    render(*sys.argv[1:])
