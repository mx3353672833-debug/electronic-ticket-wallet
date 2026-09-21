import hashlib
import importlib.util
import tempfile
import unittest
from pathlib import Path
from PIL import Image, ImageDraw

spec=importlib.util.spec_from_file_location('display',Path(__file__).with_name('display-image.py'))
display=importlib.util.module_from_spec(spec);spec.loader.exec_module(display)

class DisplayImages(unittest.TestCase):
    def test_sizes_transparency_original_and_no_overwrite(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);source=root/'original.png'
            image=Image.new('RGBA',(2200,1400),(220,238,240,255));draw=ImageDraw.Draw(image)
            draw.rectangle((0,0,40,1400),fill=(0,0,0,0));draw.text((120,160),'Synthetic ticket G123',fill='black')
            image.save(source);before=hashlib.sha256(source.read_bytes()).hexdigest()
            for variant,bound in [('screen',1600),('thumb',384)]:
                output=root/(variant+'.webp');display.render(source,output,variant)
                with Image.open(output) as result:
                    self.assertLessEqual(max(result.size),bound)
                    self.assertEqual(result.mode,'RGBA');self.assertEqual(result.getpixel((0,0))[3],0)
                self.assertLess(output.stat().st_size,source.stat().st_size)
                with self.assertRaises(FileExistsError):display.render(source,output,variant)
            self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(),before)

    def test_invalid_size_cannot_create_file(self):
        with tempfile.TemporaryDirectory() as directory:
            output=Path(directory)/'no.webp'
            with self.assertRaises(ValueError):display.render('missing',output,'huge')
            self.assertFalse(output.exists())

if __name__=='__main__':unittest.main()
