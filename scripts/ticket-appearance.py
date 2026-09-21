"""Deterministic ticket appearance processing; source photographs stay intact.

Uses traditional morphology to separate broad paper colour/illumination from
fine photographed detail. A shared paper field is taken from a reference scan;
lettering, fine creases and abrasion remain in each scan's residual. This is not
a semantic wear detector: wide stains and faded background printing need review.
Never writes its input, calls OCR, invents lettering, or uses a generative model.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageOps

cv2.setNumThreads(1)
Image.MAX_IMAGE_PIXELS = 60_000_000
SIZE = (1600, 1006)
RECIPE_VERSION = 'paper-study-3'
PRODUCTION_VERSION = 'paper-v1'


def read_scan(path):
    with Image.open(path) as opened:
        rgb = np.asarray(ImageOps.exif_transpose(opened).convert('RGB'))
    ratio = rgb.shape[1] / rgb.shape[0]
    if not 1.45 < ratio < 1.75:
        raise ValueError('This study only accepts already rectified landscape train tickets')
    return cv2.resize(rgb, SIZE, interpolation=cv2.INTER_AREA)


def paper_mask(rgb):
    """Remove edge-connected dark warm table pixels, retaining tears/notches.

    Only intended for the brown-table source photographs in this study. Enclosed
    writing and marks cannot become holes. No artificial rounded-rectangle mask.
    """
    x = rgb.astype(np.float32) / 255
    # Conservative threshold: expanding brown before connectivity can mistake
    # a browned abrasion touching the border for a large missing paper piece.
    warm = ((x[..., 0] - x[..., 2] > .085) &
            (x[..., 1] - x[..., 2] > .045) & (x[..., 2] < .53))
    _, labels = cv2.connectedComponents(warm.astype(np.uint8), connectivity=8)
    edge_labels = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
    edge_labels = edge_labels[edge_labels != 0]
    removed = np.isin(labels, edge_labels)
    mask = (~removed).astype(np.uint8) * 255
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        raise ValueError('No paper boundary found')
    mask[:] = 0
    cv2.drawContours(mask, [max(contours, key=cv2.contourArea)], -1, 255, cv2.FILLED)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    mask = cv2.erode(mask, np.ones((5, 5), np.uint8), borderType=cv2.BORDER_CONSTANT, borderValue=0)
    return cv2.GaussianBlur(mask, (3, 3), .55)


def paper_field(rgb, mask):
    """Suppress fine dark lettering in a temporary estimation layer only."""
    # Extend paper over removed table pixels so the field has no brown halo.
    padded = rgb.copy()
    for y in range(len(padded)):
        valid = np.flatnonzero(mask[y] > 240)
        if len(valid):
            padded[y, :valid[0]] = padded[y, valid[0]]
            padded[y, valid[-1]+1:] = padded[y, valid[-1]]
    # A nearest-neighbour fill only in the field, never in the displayed detail.
    small = cv2.resize(padded, (800, 503), interpolation=cv2.INTER_AREA)
    small_mask = cv2.resize((mask < 200).astype(np.uint8) * 255, (800, 503), interpolation=cv2.INTER_NEAREST)
    small = cv2.inpaint(small, small_mask, 4, cv2.INPAINT_TELEA)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (23, 23))
    closed = cv2.morphologyEx(small, cv2.MORPH_CLOSE, kernel)
    field = cv2.GaussianBlur(closed, (0, 0), 4)
    return cv2.resize(field.astype(np.float32) / 255, SIZE, interpolation=cv2.INTER_CUBIC)


def make_template(reference):
    mask = paper_mask(reference)
    field = paper_field(reference, mask)
    # Same diffuse paper light and colour for every derivative. The reference
    # provides broad background printing, but not its letter shapes or grain.
    area = field[40:830, 60:1540]
    white = np.percentile(area.reshape(-1, 3), 85, axis=0)
    target = np.array([.875, .927, .933], np.float32)
    template = np.clip(field * (target / np.maximum(white, .1)), 0, 1)
    return template


def band_contrast(field):
    blue = (field[..., 1] + field[..., 2]) * .5 - field[..., 0]
    return float(np.median(blue[915:966, 130:1120]) - np.median(blue[790:840, 130:1120]))


def normalize(rgb, template):
    if rgb.shape != (SIZE[1], SIZE[0], 3):
        raise ValueError('Unexpected scan size')
    mask = paper_mask(rgb)
    field = paper_field(rgb, mask)
    source = rgb.astype(np.float32) / 255
    detail = np.clip(source / np.maximum(field, .05), .005, 1.16)
    # Coloured red serials and blue pen marks remain coloured; no OCR/retyping.
    # Multiplicative detail retains broken ink and fine light/dark crease relief.
    # Do not restore a fully abraded blue footer just because the reference has
    # one. This is a train-ticket-specific colour cue, not a general wear mask.
    expected = max(.02, band_contrast(template) * .65)
    retained_band = np.clip(band_contrast(field) / expected, 0, 1)
    bottom = np.clip((np.arange(SIZE[1]) / SIZE[1] - .85) / .035, 0, 1)[:, None, None]
    blank_paper = np.median(template[790:840], axis=0)[None, :, :]
    paper = template * (1-bottom*(1-retained_band)) + blank_paper * bottom*(1-retained_band)
    output = np.clip(paper * detail, 0, 1)
    rgba = np.dstack([(output * 255).round().astype(np.uint8), mask])
    return rgba, field, detail


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def safe_template():
    """A plain mathematical field for collections without a private reference."""
    y, x = np.mgrid[0:SIZE[1], 0:SIZE[0]].astype(np.float32)
    y, x = y/SIZE[1], x/SIZE[0]
    light = 1 + .012*np.exp(-((x-.4)**2+(y-.4)**2)/.2)
    base = np.array([.87, .92, .93], np.float32)
    band = np.clip((y-.876)/.014, 0, 1)[..., None]
    return (base*(1-band)+np.array([.62, .83, .89])*band)*light[..., None]


def render_production(source, destination, kind='other', reference=None):
    source, destination = Path(source), Path(destination)
    if destination.exists():
        raise FileExistsError('Existing results are not overwritten')
    before = sha256(source)
    with Image.open(source) as opened:
        if opened.width*opened.height > 60_000_000:
            raise ValueError('Image too large')
        picture = ImageOps.exif_transpose(opened).convert('RGB')
        picture.thumbnail((1800, 1800), Image.Resampling.LANCZOS)
        rgb = np.asarray(picture)
    ratio = picture.width / picture.height
    rail = kind not in ('flight', 'boarding-pass', 'boarding') and 1.45 < ratio < 1.75
    if rail:
        rgb = cv2.resize(rgb, SIZE, interpolation=cv2.INTER_AREA)
        template = make_template(read_scan(reference)) if reference else safe_template()
        rgba, _, _ = normalize(rgb, template)
        method = 'rail-paper-detail'
    else:
        # Other paper formats retain their aspect, printed colours and layout.
        # White balance is bounded; it cannot turn airline branding into blue rail paper.
        h, w = rgb.shape[:2]
        samples = rgb[max(1,h//30):h-h//30, max(1,w//30):w-w//30]
        white = np.percentile(samples.reshape(-1, 3), 97, axis=0)
        gain = np.clip(np.array([242, 243, 241])/np.maximum(white, 1), .92, 1.24)
        color = np.clip(rgb.astype(float)*gain, 0, 255).round().astype(np.uint8)
        mask = paper_mask(rgb)
        # Never let uncertain segmentation remove large parts of another format.
        if (mask > 200).mean() < .85:
            mask = np.full((h,w), 255, np.uint8)
        rgba = np.dstack([color, mask])
        method = 'paper-white-balance'
    destination.mkdir(parents=True, mode=0o700)
    image = Image.fromarray(rgba)
    image.save(destination/'processed.webp', lossless=True, method=4, exact=True)
    width, height = image.size
    image.thumbnail((480,480), Image.Resampling.LANCZOS)
    image.save(destination/'thumbnail.webp', lossless=True, method=4, exact=True)
    if sha256(source) != before:
        raise ValueError('Source changed while processing')
    recipe = {'version':PRODUCTION_VERSION, 'sourceSha256':before, 'method':method,
              'width':width, 'height':height, 'originalUntouched':True,
              'referenceSha256':sha256(reference) if reference and rail else None}
    (destination/'recipe.json').write_text(json.dumps(recipe)+'\n')
    for file in destination.iterdir():
        os.chmod(file, 0o600)
    return recipe


def render(source, reference, destination):
    source, reference, destination = map(Path, [source, reference, destination])
    source_hash, reference_hash = sha256(source), sha256(reference)
    if destination.exists():
        raise FileExistsError('Use a new output directory; existing results are not overwritten')
    destination.mkdir(parents=True, mode=0o700)
    rgb, ref = read_scan(source), read_scan(reference)
    template = make_template(ref)
    rgba, field, detail = normalize(rgb, template)
    Image.fromarray(rgba).save(destination / 'standardized.png')
    Image.fromarray(rgb).save(destination / 'before.png')
    Image.fromarray((template * 255).round().astype(np.uint8)).save(destination / 'paper-field.png')
    Image.fromarray(np.clip(detail * 220, 0, 255).astype(np.uint8)).save(destination / 'source-detail.png')
    assert sha256(source) == source_hash and sha256(reference) == reference_hash
    recipe = {
        'version': RECIPE_VERSION, 'sourceSha256': source_hash,
        'referenceSha256': reference_hash, 'size': list(SIZE),
        'scriptSha256': sha256(__file__),
        'libraries': {'opencv': cv2.__version__, 'numpy': np.__version__, 'pillow': Image.__version__},
        'method': 'shared-reference-paper-field + source-multiplicative-detail',
        'footerWear': 'retain original blue-band colour contrast',
        'originalUntouched': True, 'generatedText': False,
        'reviewRequired': ['edge masking', 'wide stains', 'background wear', 'faint glyphs'],
    }
    (destination / 'recipe.json').write_text(json.dumps(recipe, indent=2) + '\n')
    for file in destination.iterdir():
        os.chmod(file, 0o600)
    return recipe


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('--reference', type=Path)
    parser.add_argument('--production', action='store_true')
    parser.add_argument('--kind', default='other')
    parser.add_argument('--out', required=True, type=Path)
    args = parser.parse_args()
    if args.production:
        print(json.dumps(render_production(args.source, args.out, args.kind, args.reference)))
    elif args.reference:
        render(args.source, args.reference, args.out)
    else:
        parser.error('--reference is required for the study; use --production for the default recipe')
