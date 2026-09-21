"""Synthetic-only checks; no private ticket fixtures are committed."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

import numpy as np
from PIL import Image

spec = importlib.util.spec_from_file_location('appearance', Path(__file__).with_name('ticket-appearance.py'))
appearance = importlib.util.module_from_spec(spec)
spec.loader.exec_module(appearance)


def ticket():
    rgb = np.full((1006, 1600, 3), [207, 228, 235], dtype=np.uint8)
    rgb[880:] = [140, 195, 218]
    rgb[140:180, 150:156] = 35
    rgb[140:146, 150:200] = 35
    rgb[174:180, 150:200] = 35
    # Gap in the source ink is deliberate and must not be completed.
    rgb[156:166, 150:156] = [207, 228, 235]
    return rgb


class AppearanceTest(unittest.TestCase):
    def test_production_is_private_deterministic_and_keeps_boarding_format(self):
        with tempfile.TemporaryDirectory(prefix='ticket-production-test-') as tmp:
            root=Path(tmp)
            source=root/'source.png'
            Image.fromarray(ticket()).save(source)
            original=source.read_bytes()
            recipe=appearance.render_production(source,root/'rail','train')
            self.assertEqual(recipe['version'],'paper-v1')
            self.assertIsNone(recipe['referenceSha256'])
            with Image.open(root/'rail/processed.webp') as result:
                self.assertEqual(result.mode,'RGBA')
                self.assertEqual(result.size,(1600,1006))
            self.assertEqual(source.read_bytes(),original)
            boarding=root/'boarding.png'
            Image.new('RGB',(1500,600),(235,227,210)).save(boarding)
            receipt=appearance.render_production(boarding,root/'boarding','boarding-pass',source)
            self.assertEqual(receipt['method'],'paper-white-balance')
            self.assertIsNone(receipt['referenceSha256'])
            with Image.open(root/'boarding/processed.webp') as result:
                self.assertEqual(result.size,(1500,600))
                pixel=result.getpixel((500,300))
                self.assertLess(abs(pixel[0]-pixel[2]),8)
            with self.assertRaises(FileExistsError):
                appearance.render_production(source,root/'rail','train')

    def test_color_and_light_match_without_mutating_input(self):
        reference = ticket()
        tinted = (reference.astype(float) * [.77, .68, .61]).astype(np.uint8)
        original = tinted.copy()
        template = appearance.make_template(reference)
        a, _, _ = appearance.normalize(reference, template)
        b, _, _ = appearance.normalize(tinted, template)
        np.testing.assert_array_equal(tinted, original)
        before = np.mean(np.abs(reference[400:600].astype(float)-tinted[400:600]))
        after = np.mean(np.abs(a[400:600, :, :3].astype(float)-b[400:600, :, :3]))
        self.assertLess(after, before*.1)

    def test_broken_ink_remains_broken_and_no_reference_letters_copied(self):
        source = ticket()
        reference = ticket()
        reference[400:430, 500:509] = 0
        out, _, _ = appearance.normalize(source, appearance.make_template(reference))
        self.assertLess(out[150, 152, :3].mean(), 70)
        self.assertGreater(out[161, 152, :3].mean(), 180)
        self.assertGreater(out[415, 505, :3].mean(), 180)

    def test_boundary_notch_transparent_interior_ink_opaque(self):
        rgb = ticket()
        rgb[:50, 700:740] = [105, 70, 35]
        rgb[400:440, 700:740] = [105, 70, 35]
        alpha = appearance.paper_mask(rgb)
        self.assertEqual(alpha[20, 720], 0)
        self.assertEqual(alpha[420, 720], 255)

    def test_fully_faded_footer_not_restored(self):
        ref = ticket()
        faded = ref.copy()
        faded[880:] = [207, 228, 235]
        out, _, _ = appearance.normalize(faded, appearance.make_template(ref))
        self.assertLess(abs(appearance.band_contrast(out[..., :3].astype(float)/255)), .015)

    def test_original_bytes_reproducible_and_no_overwrite(self):
        with tempfile.TemporaryDirectory(prefix='ticket-appearance-test-') as tmp:
            root = Path(tmp)
            source = root/'source.png'
            Image.fromarray(ticket()).save(source)
            before = source.read_bytes()
            appearance.render(source, source, root/'first')
            appearance.render(source, source, root/'second')
            self.assertEqual(source.read_bytes(), before)
            self.assertEqual((root/'first/standardized.png').read_bytes(), (root/'second/standardized.png').read_bytes())
            with self.assertRaises(FileExistsError):
                appearance.render(source, source, root/'first')

    def test_boarding_pass_and_portrait_require_separate_recipe(self):
        with tempfile.TemporaryDirectory(prefix='ticket-appearance-ratio-') as tmp:
            file = Path(tmp)/'boarding.png'
            Image.new('RGB', (1200, 300), 'white').save(file)
            with self.assertRaises(ValueError):
                appearance.read_scan(file)


if __name__ == '__main__':
    unittest.main()
